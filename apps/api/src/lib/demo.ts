/**
 * ── Demo mode ────────────────────────────────────────────────────────────────
 * The app is preview-first: when Supabase env values are still the validated
 * placeholders (no real project configured), the API serves the in-memory
 * demo store and accepts the web app's seeded 'demo-token' session.
 */
import { env } from '../env.js';
import type { AuthUser } from '@samity/shared';
import { permissionsForRole } from '@samity/shared';

export function isDemoMode(): boolean {
  return (
    env.NODE_ENV === 'test' ||
    env.SUPABASE_URL.includes('placeholder') ||
    env.SUPABASE_SERVICE_ROLE_KEY === 'service-role-placeholder'
  );
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
