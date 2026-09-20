import { Router } from 'express';
import { asyncHandler } from '../middleware/error.js';

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
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }),
);
