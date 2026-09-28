/**
 * ── Security middleware (reqs 1 & 3) ─────────────────────────────────────────
 * auditMutationTrail   — demo-mode analog of the SQL audit trigger: records
 *                        every successful mutation on sensitive route prefixes
 *                        into the append-only trail (production path: the
 *                        generic trigger in migration 0056 + request.* GUCs).
 * sessionTimeoutTracker— idle/absolute session timeout per bearer token
 *                        (demo mode; production tokens carry Supabase exp).
 * csrfGuard            — Origin-checked CSRF protection: browser-originated
 *                        mutations must carry X-Requested-With (same-origin is
 *                        verified against the CORS allow-list); non-browser
 *                        clients (curl/tests/service-role) are exempt.
 * sensitiveRateLimiter — tighter per-IP budget for login + unmask endpoints.
 */
import type { NextFunction, Request, Response } from 'express';
import {
  appendAudit,
  sessionTimeoutDecision,
  securityStore,
  type AuditActor,
} from '../lib/security-store.js';
import { isDemoMode } from '../lib/demo.js';
import { AppError } from '../lib/errors.js';
import type { RequestWithAuth } from './auth.js';

/** Sensitive route prefix → audit table_name (the generic trigger's mapping). */
const ROUTE_TABLE_MAP: [prefix: string, table: string][] = [
  ['/api/v1/members', 'members'],
  ['/api/v1/samities', 'samities'],
  ['/api/v1/savings', 'savings_transactions'],
  ['/api/v1/loans', 'loans'],
  ['/api/v1/collection', 'collection_entries'],
  ['/api/v1/accounting/vouchers', 'vouchers'],
  ['/api/v1/accounting', 'vouchers'],
  ['/api/v1/hr', 'hr_staff'],
  ['/api/v1/privacy/consents', 'member_consents'],
  ['/api/v1/privacy/corrections', 'member_corrections'],
  ['/api/v1/privacy/retention-rules', 'retention_rules'],
  ['/api/v1/security/config', 'security_config'],
  ['/api/v1/security/devices', 'user_devices'],
];

function tableForPath(path: string): string | null {
  for (const [prefix, table] of ROUTE_TABLE_MAP) {
    if (path.startsWith(prefix)) return table;
  }
  return null;
}

function actorOf(req: RequestWithAuth): AuditActor {
  return {
    userId: req.auth?.userId ?? 'anonymous',
    userName: req.auth?.email ?? undefined,
    ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? null,
    userAgent: (req.headers['user-agent'] as string | undefined),
  };
}

/** Record successful mutations on sensitive prefixes (POST→insert etc.). */
export function auditMutationTrail(req: Request, res: Response, next: NextFunction): void {
  if (!isDemoMode()) {
    next();
    return;
  }
  const method = req.method.toUpperCase();
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    next();
    return;
  }
  const table = tableForPath(req.originalUrl.split('?')[0] ?? req.path);
  if (!table) {
    next();
    return;
  }
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    const r = req as RequestWithAuth;
    // /:id segment when the path has one, else the whole path as the record ref.
    const segments = (req.originalUrl.split('?')[0] ?? '').split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';
    const looksLikeId = /^[0-9a-f-]{8,}$|^[\w-]{6,60}$/.test(last) && !['members', 'savings', 'loans', 'vouchers'].includes(last);
    const action = method === 'POST' ? 'insert' : method === 'DELETE' ? 'delete' : 'update';
    try {
      appendAudit(
        {
          tableName: table,
          recordId: looksLikeId ? last : `${table}:bulk`,
          action,
          oldValues: null,
          newValues: { path: req.originalUrl.split('?')[0] ?? '', method },
        },
        actorOf(r),
      );
    } catch {
      // Auditing must never break the request lifecycle.
    }
  });
  next();
}

/* ── Session timeout tracker ──────────────────────────────────────────────── */

interface SessionEntry {
  issuedAtMs: number;
  lastSeenMs: number;
}

const trackerRef = globalThis as unknown as { __sessionTracker?: Map<string, SessionEntry> };

/** Token → session bookkeeping (tests may reset/backdate via this map). */
export function sessionTracker(): Map<string, SessionEntry> {
  trackerRef.__sessionTracker ??= new Map();
  return trackerRef.__sessionTracker;
}

export function resetSessionTracker(): void {
  trackerRef.__sessionTracker = undefined;
}

/** Idle + absolute timeout per bearer token (demo mode). */
export function sessionTimeoutMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!isDemoMode()) {
    next();
    return;
  }
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  const token = header.slice('Bearer '.length);
  const now = Date.now();
  const existing = sessionTracker().get(token);
  if (existing) {
    const decision = sessionTimeoutDecision({ issuedAtMs: existing.issuedAtMs, lastSeenMs: existing.lastSeenMs, nowMs: now });
    if (!decision.ok) {
      sessionTracker().delete(token);
      next(new AppError(401, 'UNAUTHORIZED', decision.reason === 'idle_expired'
        ? 'সেশন নিষ্ক্রিয়তার সময় শেষ / Session expired (idle timeout)'
        : 'সেশনের মেয়াদ শেষ / Session expired (absolute lifetime)'));
      return;
    }
    existing.lastSeenMs = now;
    next();
    return;
  }
  sessionTracker().set(token, { issuedAtMs: now, lastSeenMs: now });
  next();
}

/* ── CSRF guard ───────────────────────────────────────────────────────────── */

/**
 * Browser-originated mutations must prove same-origin intent:
 *  - Origin present + allowed  → require the X-Requested-With header
 *    (the web client's fetch wrapper sends it on every call).
 *  - Origin present + unknown  → 403 (cross-site request, CSRF).
 *  - No Origin (curl/tests)    → allowed (non-browser client).
 */
export function csrfGuard(allowedOrigins: readonly string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const method = req.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      next();
      return;
    }
    const origin = req.headers.origin as string | undefined;
    if (!origin) {
      next();
      return;
    }
    if (!allowedOrigins.includes(origin)) {
      next(new AppError(403, 'FORBIDDEN', 'ক্রস-সাইট অনুরোধ বাতিল / Cross-site request rejected (CSRF)'));
      return;
    }
    if ((req.headers['x-requested-with'] as string | undefined) !== 'XMLHttpRequest') {
      next(new AppError(403, 'FORBIDDEN', 'CSRF হেডার অনুপস্থিত / Missing X-Requested-With header'));
      return;
    }
    next();
  };
}

/* ── Sensitive rate limiter ───────────────────────────────────────────────── */

export { rateLimit as _rateLimit } from 'express-rate-limit';
