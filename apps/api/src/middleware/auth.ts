import { createPublicKey } from 'node:crypto';
import type { JsonWebKey } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { hasPermission, permissionsForRole, ROLES, type AuthUser, type Permission, type Role } from '@samity/shared';
import { env } from '../env.js';
import { Forbidden, Unauthorized } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { DEMO_OFFICER_TOKEN, DEMO_TOKEN, demoAuthUser, demoOfficerAuthUser, isDemoMode } from '../lib/demo.js';

export interface RequestWithAuth extends Request {
  auth?: AuthUser;
}

interface TokenPayload {
  sub: string;
  email?: string;
  role?: string;
  org_id?: string | null;
  branch_id?: string | null;
  app_permissions?: Permission[];
  locale?: string;
  /** Real Supabase access tokens nest custom claims here. */
  app_metadata?: Record<string, unknown>;
}

interface JwksKey extends JsonWebKey {
  kid?: string;
  alg?: string;
}

/** Algorithms accepted on the asymmetric path — never read from the token. */
const ASYMMETRIC_ALGS: jwt.Algorithm[] = ['ES256', 'RS256'];

/** Short-lived cache of the project's asymmetric signing keys (10 minutes). */
const JWKS_TTL_MS = 600_000;
/** Minimum gap between forced refreshes so stale-token bursts cannot stampede JWKS. */
const JWKS_REFRESH_MIN_GAP_MS = 5_000;

let jwksCache: { keys: JwksKey[]; at: number } | null = null;
let jwksInFlight: Promise<JwksKey[]> | null = null;
let lastForcedRefreshAt = 0;

async function loadJwks(): Promise<JwksKey[]> {
  const base = (env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  if (!base || base.includes('placeholder')) throw new Error('no supabase url');
  const res = await fetch(`${base}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`jwks fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys?: JwksKey[] };
  if (!body.keys?.length) throw new Error('jwks empty');
  jwksCache = { keys: body.keys, at: Date.now() };
  return body.keys;
}

async function fetchJwks(force = false): Promise<JwksKey[]> {
  if (jwksCache && !force && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  if (!force && jwksInFlight) return jwksInFlight;
  if (force && jwksCache && Date.now() - lastForcedRefreshAt < JWKS_REFRESH_MIN_GAP_MS) return jwksCache.keys;
  if (force) lastForcedRefreshAt = Date.now();
  const pending = loadJwks();
  jwksInFlight = pending;
  try {
    return await pending;
  } finally {
    if (jwksInFlight === pending) jwksInFlight = null;
  }
}

/** Resolve the token's signing key; a kid miss usually means Supabase
 *  rotated its key after our cache filled, so refresh once and retry. */
async function findSigningKey(kid?: string): Promise<JwksKey | undefined> {
  let keys = await fetchJwks();
  if (kid) {
    const hit = keys.find((k) => k.kid === kid);
    if (hit) return hit;
    keys = await fetchJwks(true);
    return keys.find((k) => k.kid === kid);
  }
  // Supabase access tokens always carry a kid; only tolerate a kidless token
  // when the JWKS holds exactly one key (unambiguous).
  return keys.length === 1 ? keys[0] : undefined;
}

function attachAuth(req: RequestWithAuth, payload: TokenPayload): void {
  // Custom claims may sit top-level (API-minted tokens) or inside app_metadata
  // (tokens issued by Supabase Auth for real logins).
  const meta = payload.app_metadata ?? {};
  const roleClaim = payload.role && ROLES.includes(payload.role as Role) ? payload.role : (meta['role'] as string | undefined);
  const role: Role = ROLES.includes(roleClaim as Role) ? (roleClaim as Role) : 'member';
  const metaPermissions = Array.isArray(meta['app_permissions']) ? (meta['app_permissions'] as Permission[]) : undefined;

  // Supabase-issued tokens carry `app_permissions: []` when no custom claims
  // were minted. An empty array means "no explicit grants", NOT "grant
  // nothing" — otherwise the role's default set (and every role-gated route
  // that reads auth.permissions, e.g. GET /nav) would silently resolve to zero
  // permissions. Only a non-empty claim overrides the role defaults.
  const claimedPermissions =
    (payload.app_permissions?.length ? payload.app_permissions : undefined) ??
    (metaPermissions?.length ? metaPermissions : undefined);

  req.auth = {
    userId: payload.sub,
    email: payload.email ?? '',
    role,
    orgId: payload.org_id ?? (meta['org_id'] as string | undefined) ?? null,
    branchId: payload.branch_id ?? (meta['branch_id'] as string | undefined) ?? null,
    permissions: claimedPermissions ?? permissionsForRole(role),
    locale: payload.locale === 'en' ? 'en' : 'bn',
  };
}

/**
 * Verify the Supabase JWT and attach an AuthUser to the request.
 * Role/permissions come from custom claims (`app_metadata` in Supabase);
 * fall back to the role's default permission set if claims are absent.
 *
 * Two verification paths:
 *  1. HS256 with the legacy project JWT secret (projects on legacy keys).
 *  2. JWKS lookup against the project's asymmetric signing keys — required
 *     once Supabase rotates a project onto the new JWT signing keys.
 */
export function requireAuth(req: RequestWithAuth, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(Unauthorized('Missing bearer token'));
    return;
  }
  const token = header.slice('Bearer '.length);

  // Demo mode: accept the web app's seeded session as a super_admin identity.
  if (isDemoMode() && token === DEMO_TOKEN) {
    req.auth = demoAuthUser();
    next();
    return;
  }
  // Secondary demo session with the field-officer role.
  if (isDemoMode() && token === DEMO_OFFICER_TOKEN) {
    req.auth = demoOfficerAuthUser();
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, env.SUPABASE_JWT_SECRET, { algorithms: ['HS256'] }) as unknown as TokenPayload;
    attachAuth(req, payload);
    next();
    return;
  } catch {
    // Fall through to the JWKS path (asymmetric signing keys).
  }

  // Asymmetric-key path: look the token's `kid` up in the project JWKS. The
  // accepted algorithms are pinned here — never read from the token header —
  // so an alg-confusion token (e.g. HS256-"signed" with the public key, or
  // alg: none) is rejected before it can reach a verification call.
  void (async () => {
    try {
      const [rawHeader, rawPayload] = token.split('.');
      if (!rawHeader || !rawPayload) throw new Error('malformed token');
      const header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString('utf8')) as { kid?: string; alg?: string };
      if (header.alg && !ASYMMETRIC_ALGS.includes(header.alg as jwt.Algorithm)) {
        throw new Error(`unsupported alg ${header.alg}`);
      }
      const jwk = await findSigningKey(header.kid);
      if (!jwk) throw new Error('no matching signing key');
      const key = createPublicKey({ key: jwk as JsonWebKey, format: 'jwk' });
      const payload = jwt.verify(token, key, { algorithms: ASYMMETRIC_ALGS }) as unknown as TokenPayload;
      attachAuth(req, payload);
      next();
    } catch (err) {
      logger.debug({ err: String(err) }, 'token verification failed on both paths');
      next(Unauthorized('Invalid or expired token'));
    }
  })();
}

/** Gate a route behind one or more permissions (any-of). */
export function requirePermission(...required: Permission[]) {
  return (req: RequestWithAuth, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(Unauthorized());
      return;
    }
    const ok = required.some((p) => hasPermission(req.auth!.role, p) || req.auth!.permissions.includes(p));
    if (!ok) {
      logger.warn({ userId: req.auth.userId, required, role: req.auth.role }, 'permission denied');
      next(Forbidden());
      return;
    }
    next();
  };
}
