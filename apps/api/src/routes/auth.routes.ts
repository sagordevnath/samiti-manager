import { Router } from 'express';
import { loginSchema } from '@samity/shared';
import { supabaseAdmin } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/error.js';
import { BadRequest, Unauthorized } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';
import type { RequestWithAuth } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { checkLockout, recordLoginAttempt } from '../lib/security-store.js';

export const authRouter = Router();

function clientIp(req: { headers: Record<string, unknown>; ip?: string }): string | null {
  const fwd = req.headers['x-forwarded-for'];
  return typeof fwd === 'string' ? fwd.split(',')[0]?.trim() ?? null : req.ip ?? null;
}

/**
 * POST /api/v1/auth/login
 * Proxies Supabase Auth password login. In production you may prefer calling
 * Supabase directly from the browser; keeping it here lets us attach
 * app-level claims (role, org, permissions) in one place.
 */
authRouter.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const ip = clientIp(req);

    // Brute-force lockout (req 3): 5 failures / 15 min → 15 min lock.
    const lock = checkLockout(email);
    if (lock.locked) {
      recordLoginAttempt(email, false, ip);
      throw Unauthorized(`অ্যাকাউন্ট লক হয়েছে — ${Math.ceil(lock.remainingMs / 60_000)} মিনিট পরে চেষ্টা করুন / Account locked, try again in ${Math.ceil(lock.remainingMs / 60_000)} min`);
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
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
