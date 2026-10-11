/**
 * Regression guard for the service-role downgrade bug.
 *
 * supabase-js keeps a signed-in session on the client and sends that session's
 * access token on every later PostgREST request. Auth used to sign users in on
 * the shared data client, so after the first login the whole API wrote as
 * `authenticated` instead of service_role — every table whose RLS policies
 * grant writes only to service_role then answered
 * `42501 new row violates row-level security policy`, which surfaced as 500s on
 * unrelated pages. These tests pin the client split that prevents a recurrence.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env['NODE_ENV'] = 'test';
delete process.env['PORT'];
process.env['SUPABASE_URL'] = 'https://test.supabase.co';
process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'test-service-key';
process.env['SUPABASE_JWT_SECRET'] = 'test-jwt-secret';

let mod: typeof import('./lib/supabase.js');

beforeEach(async () => {
  vi.resetModules();
  mod = await import('./lib/supabase.js');
});

describe('Supabase client separation', () => {
  it('keeps the GoTrue client separate from the service-role data client', () => {
    expect(mod.supabaseAuth).not.toBe(mod.supabaseAdmin);
  });

  it('never leaves a user session on the data client', async () => {
    await expect(mod.adminHasNoUserSession()).resolves.toBe(true);
  });

  it('does not sign in on the data client from the auth routes', async () => {
    const authRoutes = await import('./routes/auth.routes.js');
    // The login handler must reach GoTrue through the dedicated client; the
    // data client is only exported for reads/writes.
    expect(Object.keys(authRoutes)).toContain('authRouter');
    const session = await mod.supabaseAdmin.auth.getSession();
    expect(session.data.session).toBeNull();
  });
});
