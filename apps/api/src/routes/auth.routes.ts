import { Router } from 'express';
import { loginSchema } from '@samity/shared';
import { supabaseAdmin } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/error.js';
import { BadRequest, Unauthorized } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';
import type { RequestWithAuth } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

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

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      // Same message for wrong email / wrong password — avoids user enumeration.
      throw Unauthorized('ভুল ইমেইল বা পাসওয়ার্ড / Incorrect email or password');
    }
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
