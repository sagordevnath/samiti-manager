/**
 * ── Delinquency recovery router (requirements 5–9) ──────────────────────────
 * Mirrors the future recovery.routes.ts against the in-memory stores
 * (preview + tests). Root causes, recovery actions, provision proposals,
 * early-warning signals, heatmap and trend endpoints.
 */
import { Router } from 'express';
import {
  legalNoticeRequestSchema,
  rootCauseTagSchema,
  savingsAdjustmentSchema,
  waiverCreateSchema,
  waiverDecisionSchema,
  writeOffProposalSchema,
  writeOffRecoverySchema,
  provisionProposalSchema,
} from '@samity/shared';
import {
  acknowledgeDemoEarlyWarning,
  adjustDemoFromSavings,
  createDemoProvisionProposal,
  createDemoWaiver,
  createDemoWriteOffProposal,
  decideDemoWaiver,
  decideDemoWriteOffProposal,
  issueDemoLegalNotice,
  listDemoEarlyWarnings,
  listDemoRootCauses,
  postDemoProvisionProposal,
  recordDemoWriteOffRecovery,
  recoveryDemoStore,
  RecoveryDemoError,
  resetRecoveryDemoStore,
  runDemoEarlyWarningScan,
  tagDemoRootCause,
  demoHeatmap,
  demoTrend,
} from '../lib/delinquency-recovery-store.js';
import { loanDemoStore } from '../lib/loan-store.js';
import { delinquencyDemoStore } from '../lib/delinquency-store.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';

function demoError(err: unknown): never {
  if (err instanceof RecoveryDemoError) {
    throw new AppError(err.status, err.code as never, err.message);
  }
  throw err as Error;
}

export const delinquencyRecoveryRouter = Router();
delinquencyRecoveryRouter.use(requireAuth);

// ── 5) Root-cause tags ──────────────────────────────────────────────────────
delinquencyRecoveryRouter.get(
  '/root-causes',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listDemoRootCauses(req.query['loanId'] as string | undefined) });
  }),
);

delinquencyRecoveryRouter.post(
  '/root-causes',
  requirePermission('loan:write'),
  validate(rootCauseTagSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const tag = tagDemoRootCause(loanDemoStore(), req.body as never, req.auth?.userId ?? null);
      res.status(201).json(tag);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 6) Waivers (BM requests → AM/admin approves) ────────────────────────────
delinquencyRecoveryRouter.get(
  '/waivers',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: recoveryDemoStore().waivers });
  }),
);

delinquencyRecoveryRouter.post(
  '/waivers',
  requirePermission('loan:write'),
  validate(waiverCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const w = createDemoWaiver(loanDemoStore(), req.body as never, req.auth?.userId ?? null);
      res.status(201).json(w);
    } catch (err) {
      demoError(err);
    }
  }),
);

delinquencyRecoveryRouter.post(
  '/waivers/:id/decision',
  requirePermission('loan:write'),
  validate(waiverDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { decision: 'approved' | 'rejected'; decisionNote?: string };
      const w = decideDemoWaiver(
        loanDemoStore(),
        req.params['id'] as string,
        body.decision,
        req.auth?.userId ?? null,
        body.decisionNote ?? null,
      );
      res.json(w);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 6) Adjustment against savings ───────────────────────────────────────────
delinquencyRecoveryRouter.post(
  '/savings-adjustments',
  requirePermission('loan:write'),
  validate(savingsAdjustmentSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const r = adjustDemoFromSavings(loanDemoStore(), req.body as never, req.auth?.userId ?? null);
      res.status(201).json(r);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 6) Legal notice (Bangla template) ───────────────────────────────────────
delinquencyRecoveryRouter.post(
  '/legal-notices',
  requirePermission('loan:write'),
  validate(legalNoticeRequestSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const doc = issueDemoLegalNotice(
        loanDemoStore(),
        req.body as { loanId: string; replyWithinDays: number },
        req.auth?.userId ?? null,
      );
      res.status(201).json(doc);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 6) Write-off proposals (AM recommends → Director approves) + recoveries ─
delinquencyRecoveryRouter.get(
  '/write-off-proposals',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: recoveryDemoStore().writeOffProposals });
  }),
);

delinquencyRecoveryRouter.post(
  '/write-off-proposals',
  requirePermission('loan:write'),
  validate(writeOffProposalSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const p = createDemoWriteOffProposal(loanDemoStore(), req.body as never, req.auth?.userId ?? null);
      res.status(201).json(p);
    } catch (err) {
      demoError(err);
    }
  }),
);

delinquencyRecoveryRouter.post(
  '/write-off-proposals/:id/decision',
  requirePermission('loan:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { decision: 'recommended' | 'approved' | 'rejected'; decisionNote?: string };
      const p = decideDemoWriteOffProposal(
        loanDemoStore(),
        req.params['id'] as string,
        body.decision,
        req.auth?.userId ?? null,
        body.decisionNote ?? null,
      );
      res.json(p);
    } catch (err) {
      demoError(err);
    }
  }),
);

delinquencyRecoveryRouter.post(
  '/write-off-proposals/:id/recoveries',
  requirePermission('loan:write'),
  validate(writeOffRecoverySchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const p = recordDemoWriteOffRecovery(
        loanDemoStore(),
        req.params['id'] as string,
        req.body as never,
        req.auth?.userId ?? null,
      );
      res.status(201).json(p);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 7) Provision proposals ──────────────────────────────────────────────────
delinquencyRecoveryRouter.get(
  '/provision-proposals',
  requirePermission('report:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: recoveryDemoStore().provisionProposals });
  }),
);

delinquencyRecoveryRouter.post(
  '/provision-proposals',
  requirePermission('loan:write'),
  validate(provisionProposalSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const p = createDemoProvisionProposal(
        delinquencyDemoStore(),
        (req.body ?? {}) as { runDate?: string; note?: string },
        req.auth?.userId ?? null,
      );
      res.status(201).json(p);
    } catch (err) {
      demoError(err);
    }
  }),
);

delinquencyRecoveryRouter.post(
  '/provision-proposals/:id/post',
  requirePermission('loan:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const p = postDemoProvisionProposal(loanDemoStore(), req.params['id'] as string, req.auth?.userId ?? null);
      res.json(p);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 8) Early-warning scan + signals ─────────────────────────────────────────
delinquencyRecoveryRouter.post(
  '/early-warning/scan',
  requirePermission('loan:write'),
  asyncHandler(async (_req, res) => {
    const fresh = runDemoEarlyWarningScan(loanDemoStore(), delinquencyDemoStore());
    res.status(201).json({ detected: fresh.length, items: fresh });
  }),
);

delinquencyRecoveryRouter.get(
  '/early-warning',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const kind = req.query['kind'] as string | undefined;
    const ack = req.query['acknowledged'];
    res.json({ items: listDemoEarlyWarnings(kind, ack === undefined ? undefined : ack === 'true') });
  }),
);

delinquencyRecoveryRouter.post(
  '/early-warning/:id/acknowledge',
  requirePermission('loan:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.json(acknowledgeDemoEarlyWarning(req.params['id'] as string, req.auth?.userId ?? null));
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 9) Heatmap + trends (Recharts payloads) ─────────────────────────────────
delinquencyRecoveryRouter.get(
  '/heatmap',
  requirePermission('report:read'),
  asyncHandler(async (_req, res) => {
    res.json(demoHeatmap(delinquencyDemoStore()));
  }),
);

delinquencyRecoveryRouter.get(
  '/trends',
  requirePermission('report:read'),
  asyncHandler(async (_req, res) => {
    res.json(demoTrend(delinquencyDemoStore()));
  }),
);

// Test hook: reset the recovery state.
delinquencyRecoveryRouter.post('/__reset', (_req, res) => {
  resetRecoveryDemoStore();
  res.json({ ok: true });
});
