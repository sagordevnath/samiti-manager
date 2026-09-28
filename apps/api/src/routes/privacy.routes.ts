/**
 * ── Privacy router (req 5) ───────────────────────────────────────────────────
 * Consent records, retention rules + purge preview, the right-to-correction
 * workflow (submit → review → approve/reject → apply) and the member data
 * export. All org-scoped staff; decisions are manager-only; export includes
 * the member's audit trail extract and masked protected fields.
 */
import { Router } from 'express';
import {
  consentCreateSchema,
  correctionCreateSchema,
  correctionDecisionSchema,
  retentionRuleSchema,
  type CorrectionStatus,
} from '@samity/shared';
import {
  applyCorrection,
  buildMemberExport,
  createCorrection,
  decideCorrection,
  listConsents,
  listCorrections,
  listRetentionRules,
  recordConsent,
  retentionPurgePreview,
  upsertRetentionRule,
} from '../lib/security-store.js';
import { CommError } from '../lib/comm-store.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

function pgError(e: unknown): never {
  if (e instanceof CommError) {
    throw new AppError(e.status, e.code as never, e.message);
  }
  if (e instanceof Error && 'status' in e && 'code' in e) {
    const errRow = e as unknown as { status: number; code: string; message: string };
    throw new AppError(errRow.status, errRow.code as never, errRow.message);
  }
  throw e as Error;
}

function viewerOf(req: RequestWithAuth): { userId: string; userName: string; role: string } {
  return { userId: req.auth?.userId ?? 'unknown', userName: req.auth?.email ?? 'unknown', role: req.auth?.role ?? 'member' };
}

export const privacyRouter = Router();
privacyRouter.use(requireAuth);

/* ── Consents ─────────────────────────────────────────────────────────────── */

privacyRouter.get(
  '/consents',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listConsents((req.query['memberId'] as string) ?? '') });
  }),
);

privacyRouter.post(
  '/consents',
  requirePermission('member:write'),
  validate(consentCreateSchema),
  asyncHandler(async (req, res) => {
    try {
      const v = viewerOf(req as RequestWithAuth);
      res.status(201).json(recordConsent(req.body, v));
    } catch (e) {
      pgError(e);
    }
  }),
);

/* ── Retention rules + purge preview ──────────────────────────────────────── */

privacyRouter.get(
  '/retention-rules',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listRetentionRules(), preview: retentionPurgePreview() });
  }),
);

privacyRouter.put(
  '/retention-rules',
  requirePermission('org:manage'),
  validate(retentionRuleSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(upsertRetentionRule(req.body, viewerOf(req as RequestWithAuth)));
    } catch (e) {
      pgError(e);
    }
  }),
);

/* ── Right-to-correction workflow ─────────────────────────────────────────── */

privacyRouter.get(
  '/corrections',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({
      items: listCorrections({
        status: req.query['status'] as CorrectionStatus | undefined,
        memberId: req.query['memberId'] as string | undefined,
      }),
    });
  }),
);

privacyRouter.post(
  '/corrections',
  requirePermission('member:write'),
  validate(correctionCreateSchema),
  asyncHandler(async (req, res) => {
    try {
      const v = viewerOf(req as RequestWithAuth);
      res.status(201).json(createCorrection(req.body, v));
    } catch (e) {
      pgError(e);
    }
  }),
);

privacyRouter.post(
  '/corrections/:id/decide',
  requirePermission('member:approve'),
  validate(correctionDecisionSchema),
  asyncHandler(async (req, res) => {
    try {
      const v = viewerOf(req as RequestWithAuth);
      const body = req.body as { decision: 'approve' | 'reject' | 'review'; note: string };
      res.json(decideCorrection(req.params['id'] as string, body.decision, body.note, v));
    } catch (e) {
      pgError(e);
    }
  }),
);

privacyRouter.post(
  '/corrections/:id/apply',
  requirePermission('member:approve'),
  asyncHandler(async (req, res) => {
    try {
      const v = viewerOf(req as RequestWithAuth);
      res.json(applyCorrection(req.params['id'] as string, v));
    } catch (e) {
      pgError(e);
    }
  }),
);

/* ── Member data export (right-to-export) ─────────────────────────────────── */

privacyRouter.get(
  '/export/:memberId',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(buildMemberExport(req.params['memberId'] as string));
    } catch (e) {
      pgError(e);
    }
  }),
);
