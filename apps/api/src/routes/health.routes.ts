import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';
import { isDemoMode } from '../lib/demo.js';

/**
 * GET /api/v1/health — liveness probe for CI, container orchestrators and the
 * web app's "API reachable" indicator. No auth required.
 */
export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json({
      status: 'ok',
      service: 'samity-api',
      version: 'v1',
      // 'demo' = in-memory store (placeholder env), 'live' = real Supabase.
      // The web app uses this to decide demo-session seeding vs the login page.
      mode: isDemoMode() ? 'demo' : 'live',
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }),
);
