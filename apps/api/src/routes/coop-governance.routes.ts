/**
 * ── Cooperative governance demo router ──────────────────────────────────────
 * Dividend & surplus distribution (compute → AGM approve → post → pay),
 * AGM records (create → notice → attendance/resolutions/elections → minutes),
 * member exit settlement (request → compute → approve → settle) and the
 * report endpoint. Mirrors migration 0042 for the demo path.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  agmAttendanceSchema,
  agmElectionSchema,
  agmResolutionSchema,
  agmUpsertSchema,
  memberExitSchema,
} from '@samity/shared';
import {
  CoopGovernanceError,
  addElection,
  addResolution,
  computeDistribution,
  coopGovStore,
  createAgm,
  decideAgm,
  decideDistribution,
  decideExit,
  getAgm,
  getDistribution,
  governanceReports,
  listAgms,
  listDistributions,
  listExits,
  requestExit,
  resetCoopGovStore,
  setAgmAttendance,
} from '../lib/coop-governance-store.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

function cgError(err: unknown): never {
  if (err instanceof CoopGovernanceError) throw new AppError(err.status, err.code as never, err.message);
  throw err as Error;
}

const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';

const dividendComputeSchema = z.object({
  fiscalYear: z.string().regex(/^\d{4}-\d{2}$/),
  surplus: z.string().regex(/^\d+(\.\d{1,2})?$/),
  reservePct: z.coerce.number().min(0).max(100).optional(),
  ratePct: z.coerce.number().min(0).max(100).optional(),
  holders: z
    .array(
      z.object({
        memberId: z.string().trim().min(1),
        memberName: z.string().trim().min(2).max(120),
        shares: z.coerce.number().int().min(0),
        monthsHeld: z.coerce.number().int().min(0).max(12).default(12),
      }),
    )
    .min(1)
    .max(5000),
});

const dividendDecisionSchema = z.object({
  action: z.enum(['agm_approve', 'post', 'pay']),
  memberId: z.string().trim().min(1).optional(),
  destination: z.enum(['savings', 'cash']).optional(),
});

const agmDecisionSchema = z.object({
  action: z.enum(['issue_notice', 'hold', 'approve_minutes']),
});

const exitDecisionSchema = z.object({
  action: z.enum(['compute', 'approve', 'reject', 'settle']),
  note: z.string().trim().max(500).default(''),
});

export const coopGovRouter = Router();
coopGovRouter.use(requireAuth);

/* ── 5) Dividend & surplus distribution ───────────────────────────────────── */

coopGovRouter.get(
  '/dividend',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listDistributions(coopGovStore()) });
  }),
);

coopGovRouter.post(
  '/dividend/compute',
  requirePermission('branch:manage'),
  validate(dividendComputeSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(computeDistribution(coopGovStore(), req.body));
    } catch (err) {
      cgError(err);
    }
  }),
);

coopGovRouter.get(
  '/dividend/:fiscalYear',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json(getDistribution(coopGovStore(), req.params['fiscalYear'] as string));
  }),
);

coopGovRouter.post(
  '/dividend/:fiscalYear/decision',
  requirePermission('branch:manage'),
  validate(dividendDecisionSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(decideDistribution(coopGovStore(), req.params['fiscalYear'] as string, req.body));
    } catch (err) {
      cgError(err);
    }
  }),
);

/* ── 6) AGM ────────────────────────────────────────────────────────────────── */

coopGovRouter.get(
  '/agm',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listAgms(coopGovStore()) });
  }),
);

coopGovRouter.post(
  '/agm',
  requirePermission('branch:manage'),
  validate(agmUpsertSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(createAgm(coopGovStore(), req.body, 'স্যামিটি ম্যানেজার সমবায় সমিতি'));
    } catch (err) {
      cgError(err);
    }
  }),
);

coopGovRouter.get(
  '/agm/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json(getAgm(coopGovStore(), req.params['id'] as string));
  }),
);

coopGovRouter.put(
  '/agm/:id/attendance',
  requirePermission('branch:manage'),
  validate(agmAttendanceSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(setAgmAttendance(coopGovStore(), req.params['id'] as string, req.body));
    } catch (err) {
      cgError(err);
    }
  }),
);

coopGovRouter.post(
  '/agm/:id/resolutions',
  requirePermission('branch:manage'),
  validate(agmResolutionSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(addResolution(coopGovStore(), req.params['id'] as string, req.body));
    } catch (err) {
      cgError(err);
    }
  }),
);

coopGovRouter.post(
  '/agm/:id/elections',
  requirePermission('branch:manage'),
  validate(agmElectionSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(addElection(coopGovStore(), req.params['id'] as string, req.body));
    } catch (err) {
      cgError(err);
    }
  }),
);

coopGovRouter.post(
  '/agm/:id/decision',
  requirePermission('branch:manage'),
  validate(agmDecisionSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(decideAgm(coopGovStore(), req.params['id'] as string, req.body));
    } catch (err) {
      cgError(err);
    }
  }),
);

/* ── 7) Member exit settlement ─────────────────────────────────────────────── */

coopGovRouter.get(
  '/exits',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = coopGovStore();
    res.json({
      items: listExits(store, {
        branchId: (req.query['branchId'] as string | undefined) ?? undefined,
        status: (req.query['status'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

coopGovRouter.post(
  '/exits',
  requirePermission('member:write'),
  validate(memberExitSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const branchId = req.auth!.branchId ?? BRANCH_DHAKA;
      res.status(201).json(requestExit(coopGovStore(), req.body, branchId));
    } catch (err) {
      cgError(err);
    }
  }),
);

coopGovRouter.post(
  '/exits/:id/decision',
  requirePermission('member:write'),
  validate(exitDecisionSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(decideExit(coopGovStore(), req.params['id'] as string, req.body));
    } catch (err) {
      cgError(err);
    }
  }),
);

/* ── 8) Reports ────────────────────────────────────────────────────────────── */

/** Governance journal trail: dividend posting/payments + exit vouchers. */
coopGovRouter.get(
  '/journals',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: coopGovStore().journals });
  }),
);

coopGovRouter.get(
  '/reports',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    const store = coopGovStore();
    const iw = (await import('../lib/insurance-welfare-store.js')).insWelfareStore();
    res.json(governanceReports(store, iw.ledger));
  }),
);

/** Test helper exported for isolation. */
export { resetCoopGovStore };
