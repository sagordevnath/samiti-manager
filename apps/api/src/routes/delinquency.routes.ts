/**
 * ── Delinquency & Recovery demo router ──────────────────────────────────────
 * Mirrors the future delinquency.routes.ts against the in-memory store
 * (preview + tests). Endpoints for the nightly run, classification views,
 * PAR rollups, worklist, settings, follow-ups and tasks.
 */
import { Router } from 'express';
import {
  delinquencySettingsPatchSchema,
  followUpCreateSchema,
  type ParMetrics,
} from '@samity/shared';
import {
  buildWorklist,
  completeDemoTask,
  createDemoFollowUp,
  delinquencyDemoStore,
  DelinquencyDemoError,
  getDemoDelinquencySettings,
  latestRun,
  listClassifiedLoans,
  listDemoFollowUps,
  listDemoTasks,
  loansForBranch,
  parByScope,
  patchDemoDelinquencySettings,
  runNightlyClassification,
} from '../lib/delinquency-store.js';
import { loanDemoStore } from '../lib/loan-store.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../lib/errors.js';

function demoError(err: unknown): never {
  if (err instanceof DelinquencyDemoError) {
    throw new AppError(err.status, err.code as never, err.message);
  }
  throw err as Error;
}

const SCOPES = ['org', 'zone', 'area', 'branch', 'samity', 'officer'] as const;
type Scope = (typeof SCOPES)[number];

export const delinquencyRouter = Router();
delinquencyRouter.use(requireAuth);

const branchName = (id: string) => (id === '00000000-0000-4000-8000-0000000000b1' ? 'Dhanmondi Branch' : 'Mymensingh Sadar Branch');

// ── 1) Nightly run (also callable manually by admins) ───────────────────────
delinquencyRouter.post(
  '/run',
  requirePermission('loan:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = (req.body ?? {}) as { runDate?: string };
      const result = runNightlyClassification(loanDemoStore(), body.runDate ?? undefined);
      res.status(201).json({ run: result.run, classified: result.classifications.length });
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 1) Latest run summary ───────────────────────────────────────────────────
delinquencyRouter.get(
  '/runs/latest',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    const run = latestRun(delinquencyDemoStore());
    if (!run) {
      // Auto-run once so the UI has data on first load.
      const result = runNightlyClassification(loanDemoStore());
      res.json({ run: result.run, auto: true });
      return;
    }
    res.json({ run });
  }),
);

// ── 1) Classified loans (bucket view) ───────────────────────────────────────
delinquencyRouter.get(
  '/loans',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const d = delinquencyDemoStore();
    let loans = listClassifiedLoans(d);
    const bucket = req.query['bucket'] as string | undefined;
    const branchId = req.query['branchId'] as string | undefined;
    if (bucket) loans = loans.filter((l) => l.bucket === bucket);
    if (branchId) loans = loans.filter((l) => l.branchId === branchId);
    res.json({ items: loans, count: loans.length });
  }),
);

// ── 2) PAR by scope ─────────────────────────────────────────────────────────
delinquencyRouter.get(
  '/par',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const scope = (req.query['scope'] as Scope | undefined) ?? 'branch';
    if (!SCOPES.includes(scope)) {
      throw new AppError(400, 'VALIDATION_ERROR', `scope must be one of ${SCOPES.join(', ')}`);
    }
    res.json({ scope, items: parByScope(delinquencyDemoStore(), loanDemoStore(), scope as ParMetrics['scope']) });
  }),
);

// ── Branch drill-down (all classification scopes for one branch) ────────────
delinquencyRouter.get(
  '/branches/:branchId/summary',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const d = delinquencyDemoStore();
    const branchId = req.params['branchId'] as string;
    const loans = loansForBranch(d, branchId);
    const byBucket: Record<string, { count: number; outstanding: string; provision: string }> = {};
    for (const l of loans) {
      const b = (byBucket[l.bucket] ??= { count: 0, outstanding: '0.00', provision: '0.00' });
      b.count += 1;
      b.outstanding = (Number(b.outstanding) + Number(l.outstanding)).toFixed(2);
      b.provision = (Number(b.provision) + Number(l.provisionAmount)).toFixed(2);
    }
    const byClass: Record<string, { count: number; outstanding: string }> = {};
    for (const l of loans) {
      const c = (byClass[l.assetClass] ??= { count: 0, outstanding: '0.00' });
      c.count += 1;
      c.outstanding = (Number(c.outstanding) + Number(l.outstanding)).toFixed(2);
    }
    res.json({
      branchId,
      branchName: branchName(branchId),
      loans: loans.length,
      byBucket,
      byClass,
      provisionTotal: loans.reduce((s, l) => s + Number(l.provisionAmount), 0).toFixed(2),
    });
  }),
);

// ── 3) Worklist ─────────────────────────────────────────────────────────────
delinquencyRouter.get(
  '/worklist',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const level = req.query['level'] as string | undefined;
    const branchId = req.query['branchId'] as string | undefined;
    res.json({
      items: buildWorklist(delinquencyDemoStore(), {
        level: level as never,
        branchId,
      }),
    });
  }),
);

// ── 1) Settings (editable buckets/provisioning/escalation) ──────────────────
delinquencyRouter.get(
  '/settings',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    res.json(getDemoDelinquencySettings(delinquencyDemoStore()));
  }),
);

delinquencyRouter.patch(
  '/settings',
  requirePermission('loan:write'),
  validate(delinquencySettingsPatchSchema),
  asyncHandler(async (req, res) => {
    // Admin-only change (super_admin/org_admin); BM+ can read.
    res.json(patchDemoDelinquencySettings(delinquencyDemoStore(), req.body as never));
  }),
);

// ── 4) Follow-ups ───────────────────────────────────────────────────────────
delinquencyRouter.get(
  '/follow-ups',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const loanId = req.query['loanId'] as string | undefined;
    res.json({ items: listDemoFollowUps(delinquencyDemoStore(), loanId) });
  }),
);

delinquencyRouter.post(
  '/follow-ups',
  requirePermission('loan:write'),
  validate(followUpCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const f = createDemoFollowUp(delinquencyDemoStore(), req.body as never, req.auth?.userId ?? null);
      res.status(201).json(f);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 4) Reminder tasks (Module 12 queue) ─────────────────────────────────────
delinquencyRouter.get(
  '/tasks',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const status = (req.query['status'] as 'open' | 'done' | undefined) ?? 'open';
    res.json({ items: listDemoTasks(delinquencyDemoStore(), status) });
  }),
);

delinquencyRouter.post(
  '/tasks/:id/complete',
  requirePermission('loan:write'),
  asyncHandler(async (req, res) => {
    try {
      res.json(completeDemoTask(delinquencyDemoStore(), req.params['id'] as string));
    } catch (err) {
      demoError(err);
    }
  }),
);
