import { Router } from 'express';
import { loginSchema } from '@samity/shared';
import { supabaseAuth } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/error.js';
import { BadRequest, Unauthorized } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';
import type { RequestWithAuth } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { checkLockout, recordLoginAttempt } from '../lib/security-store.js';
import { DEMO_TOKEN, demoAuthUser, isDemoMode } from '../lib/demo.js';

export const authRouter = Router();

function clientIp(req: { headers: Record<string, unknown>; ip?: string }): string | null {
  const fwd = req.headers['x-forwarded-for'];
  return typeof fwd === 'string' ? fwd.split(',')[0]?.trim() ?? null : req.ip ?? null;
}

/**
 * POST /api/v1/auth/login
 * Signs in through Supabase Auth (GoTrue). The service client holds the
 * service_role key; a legacy anon key also works for this specific endpoint
 * because it is the public publishable key clients use to sign in with.
 *
 * The demo login user must exist in auth.users. If the seed's direct
 * `insert into auth.users` did not take effect (depends on the project's
 * auth schema), create it with scripts/ensure-demo-user.mjs, which uses the
 * Admin API and therefore always produces a GoTrue-compatible password hash
 * and a matching auth.identities row.
 */
authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const ip = clientIp(req);

    // Demo mode: the placeholder Supabase project cannot authenticate anyone,
    // so serve the seeded super_admin session for the documented demo
    // credentials (the same ones the SQL seed creates in live mode).
    if (isDemoMode() && email === 'admin@samity.test' && password === 'Samity@2026') {
      recordLoginAttempt(email, true, ip);
      const demo = demoAuthUser();
      res.json({
        accessToken: DEMO_TOKEN,
        refreshToken: 'demo-refresh',
        expiresIn: 3600,
        user: {
          id: demo.userId,
          email: demo.email,
          role: demo.role,
          orgId: demo.orgId,
          branchId: demo.branchId,
        },
      });
      return;
    }

    // Brute-force lockout (req 3): 5 failures / 15 min → 15 min lock.
    const lock = checkLockout(email);
    if (lock.locked) {
      recordLoginAttempt(email, false, ip);
      throw Unauthorized(`অ্যাকাউন্ট লক হয়েছে — ${Math.ceil(lock.remainingMs / 60_000)} মিনিট পরে চেষ্টা করুন / Account locked, try again in ${Math.ceil(lock.remainingMs / 60_000)} min`);
    }

    // GoTrue runs on its own client: signing in on the shared data client would
    // pin this process's Authorization header to the user's JWT and silently
    // downgrade every later query from service_role to `authenticated`.
    const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      recordLoginAttempt(email, false, ip);
      // Same message for wrong email / wrong password — avoids user enumeration.
      throw Unauthorized('ভুল ইমেইল বা পাসওয়ার্ড / Incorrect email or password');
    }
    recordLoginAttempt(email, true, ip);
    if (!data.user) throw BadRequest('Login failed');

    const meta = (data.user.app_metadata ?? {}) as Record<string, unknown>;

    res.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresIn: data.session.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: meta.role ?? 'member',
        orgId: meta.org_id ?? null,
        branchId: meta.branch_id ?? null,
        locale: meta.locale ?? 'bn',
      },
    });
  }),
);

/** GET /api/v1/auth/me — echo back the enriched auth identity. */
authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { auth } = req as RequestWithAuth;
    if (!auth) throw Unauthorized();
    res.json({ user: auth });
  }),
);
