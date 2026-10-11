/**
 * ── Demo mode ────────────────────────────────────────────────────────────────
 * The app is preview-first: when Supabase env values are still the validated
 * placeholders (no real project configured), the API serves the in-memory
 * demo store and accepts the web app's seeded 'demo-token' session.
 */
import { env } from '../env.js';
import type { AuthUser } from '@samity/shared';
import { permissionsForRole } from '@samity/shared';

/**
 * Known non-secret placeholders that must never reach Supabase. Covers the
 * zod default, the .env.example template value and empty strings — any of
 * them means "not really configured" and we fall back to demo mode instead
 * of failing every request with Supabase 401 "Invalid API key".
 */
const SERVICE_KEY_PLACEHOLDERS = new Set([
  'service-role-placeholder',
  'your-service-role-key-here',
  'your-service_role_key_here',
]);

/**
 * Real Supabase service keys are long (legacy HS256 JWTs ≈ 200–300 chars,
 * asymmetric sb_secret_… keys ≈ 250+). Anything shorter is template text or
 * a pasted-in wrong key (e.g. the 46-char publishable/anon key) — serve demo
 * mode rather than failing every DB call with 401.
 */
const MIN_SERVICE_KEY_LENGTH = 100;

export function isDemoMode(): boolean {
  return (
    env.NODE_ENV === 'test' ||
    env.SUPABASE_URL.includes('placeholder') ||
    SERVICE_KEY_PLACEHOLDERS.has(env.SUPABASE_SERVICE_ROLE_KEY) ||
    env.SUPABASE_SERVICE_ROLE_KEY.trim().length < MIN_SERVICE_KEY_LENGTH
  );
}

/**
 * True when the configured service key is a JWT whose role claim is NOT
 * 'service_role' — typically the anon key pasted into the service-role slot
 * (both are long legacy JWTs, so the length check above cannot catch it).
 * The API still boots, but every service-client query is RLS-locked to zero
 * rows, which looks exactly like "no data in the live pages". Opaque new-format
 * keys (sb_secret_…) have no role claim and are fine.
 */
export function serviceKeyLooksMisconfigured(): boolean {
  const parts = env.SUPABASE_SERVICE_ROLE_KEY.trim().split('.');
  if (parts.length !== 3) return false; // not a legacy JWT — sb_secret_ etc.
  const payloadB64 = parts[1];
  if (!payloadB64) return false;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      role?: unknown;
    };
    return typeof payload.role === 'string' && payload.role !== 'service_role';
  } catch {
    return false;
  }
}

/** The bearer token the web app seeds in demo mode. */
export const DEMO_TOKEN = 'demo-token';

/** A second demo session with the field-officer role (negative-role tests). */
export const DEMO_OFFICER_TOKEN = 'demo-token-officer';

/** The demo super_admin's user id (entries posted via demo-token). */
export const DEMO_AUTH_USER_ID = '00000000-0000-4000-8000-000000000001';

/** Fake super_admin identity attached to demo-token requests. */
export function demoAuthUser(): AuthUser {
  return {
    userId: DEMO_AUTH_USER_ID,
    email: 'admin@samity.test',
    role: 'super_admin',
    orgId: '00000000-0000-4000-8000-0000000000aa',
    branchId: null,
    permissions: [...permissionsForRole('super_admin')],
    locale: 'bn',
  };
}

/** Fake field-officer identity attached to DEMO_OFFICER_TOKEN requests. */
export function demoOfficerAuthUser(): AuthUser {
  return {
    userId: '00000000-0000-4000-8000-0000000002a1',
    email: 'officer@samity.test',
    role: 'account_officer',
    orgId: '00000000-0000-4000-8000-0000000000aa',
    branchId: '00000000-0000-4000-8000-0000000000b1',
    permissions: [...permissionsForRole('account_officer')],
    locale: 'bn',
  };
}
