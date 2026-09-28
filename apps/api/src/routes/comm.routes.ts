/**
 * ── Communication router (reqs 1–3) ──────────────────────────────────────────
 * Notification center (in-app), templates with live preview, the guarded send
 * pipeline, delivery log with stats and retry pass, opt-outs, rules and spend
 * counters. Permission model mirrors the RLS in 0053: reads for member-facing
 * staff, sends for field+ roles, templates/rules managed by managers/admins.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  commRulesSchema,
  messageTemplateSchema,
  SEND_CHANNELS,
  TEMPLATE_KINDS,
  type DeliveryStatus,
  type SendChannel,
  type TemplateKind,
} from '@samity/shared';
import {
  broadcast,
  deliveryStats,
  getRules,
  listDeliveries,
  listNotifications,
  listOptOuts,
  listTemplates,
  markNotificationRead,
  previewTemplate,
  retryDue,
  sendMessage,
  setOptOut,
  spendToday,
  updateRules,
  upsertTemplate,
  CommError,
} from '../lib/comm-store.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

function pgError(err: unknown): never {
  if (err instanceof CommError) {
    throw new AppError(err.status, err.code as never, err.message);
  }
  if (err instanceof Error && 'status' in err && 'code' in err) {
    const e = err as unknown as { status: number; code: string; message: string };
    throw new AppError(e.status, e.code as never, e.message);
  }
  throw err as Error;
}

function viewerOf(req: RequestWithAuth): { userId: string; name: string; role: string } {
  return { userId: req.auth?.userId ?? 'unknown', name: req.auth?.email ?? 'unknown', role: req.auth?.role ?? 'member' };
}

export const commRouter = Router();
commRouter.use(requireAuth);

/* ── 1) Notification center ────────────────────────────────────────────────── */

commRouter.get(
  '/notifications',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      const onlyUnread = req.query['unread'] === '1';
      res.json({ items: listNotifications(viewerOf(req as RequestWithAuth), onlyUnread) });
    } catch (err) {
      pgError(err);
    }
  }),
);

commRouter.post(
  '/notifications/:id/read',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(markNotificationRead(req.params['id'] as string, viewerOf(req as RequestWithAuth)));
    } catch (err) {
      pgError(err);
    }
  }),
);

const broadcastSchema = z.object({
  title: z.string().trim().min(2).max(120),
  message: z.string().trim().min(2).max(2000),
  userId: z.string().trim().uuid().optional(),
});

commRouter.post(
  '/broadcast',
  requirePermission('branch:manage'),
  validate(broadcastSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json({ items: broadcast(req.body, viewerOf(req as RequestWithAuth)) });
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── 2) Templates ──────────────────────────────────────────────────────────── */

commRouter.get(
  '/templates',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listTemplates() });
  }),
);

commRouter.put(
  '/templates',
  requirePermission('branch:manage'),
  validate(messageTemplateSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(upsertTemplate(req.body, viewerOf(req as RequestWithAuth)));
    } catch (err) {
      pgError(err);
    }
  }),
);

commRouter.post(
  '/templates/:id/preview',
  requirePermission('member:read'),
  validate(z.object({ overrides: z.record(z.string()).optional() })),
  asyncHandler(async (req, res) => {
    try {
      res.json(previewTemplate(req.params['id'] as string, (req.body?.overrides ?? {}) as never));
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── Send pipeline ─────────────────────────────────────────────────────────── */

const sendSchema = z.object({
  kind: z.enum([...TEMPLATE_KINDS, 'custom']),
  channel: z.enum(SEND_CHANNELS),
  templateId: z.string().uuid().optional(),
  locale: z.enum(['bn', 'en']).optional(),
  body: z.string().trim().max(2000).optional(),
  subject: z.string().trim().max(200).optional(),
  vars: z.record(z.string()).optional(),
  recipientName: z.string().trim().min(1).max(120),
  recipient: z.string().trim().min(3).max(200),
  force: z.boolean().optional(),
});

commRouter.post(
  '/send',
  requirePermission('member:write'),
  validate(sendSchema),
  asyncHandler(async (req, res) => {
    try {
      const viewer = viewerOf(req as RequestWithAuth);
      const body = { ...(req.body as Record<string, unknown>) } as unknown as Parameters<typeof sendMessage>[0];
      // Only admins may force past the send window.
      if (body.force && !['super_admin', 'org_admin'].includes(viewer.role)) delete body.force;
      res.status(201).json(await sendMessage(body, viewer));
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── 3) Delivery log, retry, opt-outs, rules, spend ────────────────────────── */

commRouter.get(
  '/deliveries',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    try {
      const channel = req.query['channel'] as SendChannel | undefined;
      const status = req.query['status'] as DeliveryStatus | undefined;
      const q = req.query['q'] as string | undefined;
      res.json({ items: listDeliveries({ channel, status, q }), stats: deliveryStats() });
    } catch (err) {
      pgError(err);
    }
  }),
);

commRouter.post(
  '/deliveries/retry-due',
  requirePermission('branch:manage'),
  asyncHandler(async (_req, res) => {
    try {
      res.json(await retryDue());
    } catch (err) {
      pgError(err);
    }
  }),
);

commRouter.get(
  '/opt-outs',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listOptOuts() });
  }),
);

const optOutSchema = z.object({
  recipient: z.string().trim().min(3).max(200),
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  note: z.string().trim().max(200).optional(),
});

commRouter.put(
  '/opt-outs',
  requirePermission('member:write'),
  validate(optOutSchema),
  asyncHandler(async (req, res) => {
    try {
      const { recipient, ...pref } = req.body as { recipient: string } & Parameters<typeof setOptOut>[1];
      res.json(setOptOut(recipient, pref));
    } catch (err) {
      pgError(err);
    }
  }),
);

commRouter.get(
  '/rules',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ rules: getRules(), spend: spendToday() });
  }),
);

commRouter.put(
  '/rules',
  requirePermission('org:manage'),
  validate(commRulesSchema.partial()),
  asyncHandler(async (req, res) => {
    try {
      res.json({ rules: updateRules(req.body as Partial<typeof commRulesSchema._output>) });
    } catch (err) {
      pgError(err);
    }
  }),
);
