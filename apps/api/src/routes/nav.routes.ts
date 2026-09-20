import { Router } from 'express';
import { NAV } from '@samity/shared';
import type { RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';

export const navRouter = Router();

/**
 * GET /api/v1/nav — the permission-filtered sidebar for the current user.
 * The web app also filters locally from shared NAV data; this endpoint is the
 * server-side source of truth (useful when permissions become dynamic).
 */
navRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const groups = NAV.map((g) => ({
      ...g,
      items: g.items.filter((i) => auth.permissions.includes(i.permission)),
    })).filter((g) => g.items.length > 0);

    res.json({ groups });
  }),
);
