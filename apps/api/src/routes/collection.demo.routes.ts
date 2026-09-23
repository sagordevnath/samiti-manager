/**
 * ── Collection & Repayment demo router ──────────────────────────────────────
 * Mirrors the future collection.routes.ts against the in-memory stores
 * (preview + tests). Mobile clients cache sheets and post entries with
 * idempotency keys; the server is the allocation authority.
 */
import { Router } from 'express';
import {
  cashHandoverConfirmSchema,
  cashHandoverCreateSchema,
  cashHandoverSubmitSchema,
  collectionEntrySchema,
  collectionReversalSchema,
  collectionRulesPatchSchema,
  collectionSheetQuerySchema,
  collectionSyncSchema,
  handoverQuerySchema,
  loanClosureQuoteSchema,
  loanClosureCreateSchema,
  loanRescheduleCreateSchema,
  loanWriteOffCreateSchema,
  rescheduleDecisionSchema,
  writeOffDecisionSchema,
  type CollectionReceipt,
} from '@samity/shared';
import { isDemoMode } from '../lib/demo.js';
import {
  buildDemoSheet,
  closeDemoLoan,
  collectionDemoStore,
  CollectionDemoError,
  confirmDemoHandover,
  createDemoHandover,
  decideDemoReschedule,
  decideDemoWriteOff,
  demoCashSummary,
  demoClosureQuote,
  demoCollectionDashboard,
  DEMO_OFFICER_ID,
  getDemoRules,
  listDemoFraudFlags,
  listDemoHandovers,
  postDemoCollectionEntry,
  requestDemoReschedule,
  requestDemoWriteOff,
  resetCollectionDemoStore,
  reviewDemoFraudFlag,
  reverseDemoEntry,
  submitDemoHandover,
  syncDemoCollection,
  updateDemoRules,
  type PostContext,
} from '../lib/collection-store.js';
import { loanDemoStore, LoanDemoError } from '../lib/loan-store.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { AppError, Conflict, Forbidden, NotFound } from '../lib/errors.js';

function demoError(err: unknown): never {
  if (err instanceof CollectionDemoError) {
    // Store codes are all in the shared ErrorCode union — pass them through so
    // clients can distinguish ALREADY_CLOSED, FUTURE_DATED, BACKDATED, …
    throw new AppError(err.status, err.code, err.message);
  }
  if (err instanceof LoanDemoError) {
    if (err.status === 404) throw NotFound(err.message);
    if (err.status === 409) throw Conflict(err.message);
    throw new AppError(400, 'VALIDATION_ERROR', err.message);
  }
  throw err as Error;
}

export const collectionDemoRouter = Router();
collectionDemoRouter.use(requireAuth);

const postContext = (req: RequestWithAuth): PostContext => ({
  store: loanDemoStore(),
  officerId: req.auth?.userId ?? null,
  officerRole: req.auth?.role ?? 'account_officer',
  // Default order; an org-level policy row can override (0020 keeps a stable default).
  allocationOrder: 'overdue_first',
});

// ── Sheet (requirement 1) ───────────────────────────────────────────────────
collectionDemoRouter.get(
  '/sheet',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const q = collectionSheetQuerySchema.parse(req.query);
      const store = loanDemoStore();
      const meetingDate = q.meetingDate ?? new Date().toISOString().slice(0, 10);
      const branchId = q.branchId ?? store.applications[0]?.branchId ?? '00000000-0000-4000-8000-0000000000b1';
      res.json(
        buildDemoSheet({
          store,
          meetingDate,
          branchId,
          allocationOrder: 'overdue_first',
        }),
      );
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── Single entry (offline-safe, idempotent) ─────────────────────────────────
collectionDemoRouter.post(
  '/entries',
  requirePermission('loan:write'),
  validate(collectionEntrySchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const coll = collectionDemoStore();
      const response = postDemoCollectionEntry(loanDemoStore(), coll, req.body, postContext(req));
      res.status(response.duplicate ? 200 : 201).json(response);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── Batch sync (offline queue flush, requirement 2) ─────────────────────────
collectionDemoRouter.post(
  '/sync',
  requirePermission('loan:write'),
  validate(collectionSyncSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const result = syncDemoCollection(loanDemoStore(), collectionDemoStore(), req.body, postContext(req));
      res.json(result);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── Receipt lookup (re-print / WhatsApp share, requirement 3) ───────────────
collectionDemoRouter.get(
  '/entries/:idempotencyKey/receipt',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const coll = collectionDemoStore();
    const entry = coll.entries.find((e) => e.idempotencyKey === (req.params['idempotencyKey'] as string));
    if (!entry) throw NotFound('Receipt not found');
    // Reuse the private builder through the store's read model.
    res.json({ entry: entry });
  }),
);

// ── Cash summary + handovers (requirement 4) ────────────────────────────────
collectionDemoRouter.get(
  '/cash-summary',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const coll = collectionDemoStore();
    const handoverDate = (req.query['date'] as string) ?? new Date().toISOString().slice(0, 10);
    const officerId = (req.query['officerId'] as string) ?? req.auth?.userId ?? DEMO_OFFICER_ID;
    res.json(demoCashSummary(coll, officerId, handoverDate));
  }),
);

collectionDemoRouter.get(
  '/handovers',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const q = handoverQuerySchema.parse(req.query);
    res.json({ items: listDemoHandovers(collectionDemoStore(), q) });
  }),
);

collectionDemoRouter.post(
  '/handovers',
  requirePermission('loan:write'),
  validate(cashHandoverCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const coll = collectionDemoStore();
      const officerId = (req.body as { officerId?: string }).officerId ?? req.auth?.userId ?? DEMO_OFFICER_ID;
      const h = createDemoHandover(coll, officerId, (req.body as { handoverDate: string }).handoverDate, (req.body as { officerNote?: string }).officerNote ?? null);
      res.status(201).json(h);
    } catch (err) {
      demoError(err);
    }
  }),
);

collectionDemoRouter.post(
  '/handovers/:id/submit',
  requirePermission('loan:write'),
  validate(cashHandoverSubmitSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const h = submitDemoHandover(
        collectionDemoStore(),
        req.params['id'] as string,
        (req.body as { countedAmount: string }).countedAmount,
        (req.body as { officerNote?: string }).officerNote ?? null,
        req.auth?.userId ?? DEMO_OFFICER_ID,
      );
      res.json(h);
    } catch (err) {
      demoError(err);
    }
  }),
);

collectionDemoRouter.post(
  '/handovers/:id/confirm',
  requirePermission('loan:write'),
  validate(cashHandoverConfirmSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { decision: 'confirm' | 'reject'; receivedAmount?: string; accountantNote?: string };
      const h = confirmDemoHandover(
        collectionDemoStore(),
        req.params['id'] as string,
        body.decision,
        body.receivedAmount ?? null,
        body.accountantNote ?? null,
        req.auth?.role ?? 'branch_manager',
        req.auth?.userId ?? null,
      );
      res.json(h);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 5) Early closure: quote then close ──────────────────────────────────────
collectionDemoRouter.get(
  '/settlement/closure-quote',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const q = loanClosureQuoteSchema.parse({ applicationId: req.query['applicationId'] });
    res.json(demoClosureQuote(loanDemoStore(), q.applicationId));
  }),
);

collectionDemoRouter.post(
  '/settlement/closure',
  requirePermission('loan:write'),
  validate(loanClosureCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { applicationId: string; serviceDeductionPercent?: number };
      const closure = closeDemoLoan(
        { store: loanDemoStore(), closedBy: req.auth?.userId ?? null },
        collectionDemoStore(),
        body.applicationId,
        body.serviceDeductionPercent,
      );
      res.status(201).json(closure);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 5) Reschedule: request → decision ───────────────────────────────────────
collectionDemoRouter.post(
  '/settlement/reschedule',
  requirePermission('loan:write'),
  validate(loanRescheduleCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const r = requestDemoReschedule(
        loanDemoStore(),
        collectionDemoStore(),
        req.body as { applicationId: string; shiftInstallments: number; reason: 'death_in_family'; note: string },
        req.auth?.userId ?? null,
      );
      res.status(201).json(r);
    } catch (err) {
      demoError(err);
    }
  }),
);

collectionDemoRouter.get(
  '/settlement/reschedules',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: collectionDemoStore().reschedules });
  }),
);

collectionDemoRouter.post(
  '/settlement/reschedules/:id/decision',
  requirePermission('loan:write'),
  validate(rescheduleDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { decision: 'approved' | 'rejected' };
      const r = decideDemoReschedule(
        loanDemoStore(),
        collectionDemoStore(),
        req.params['id'] as string,
        body.decision,
        req.auth?.userId ?? null,
      );
      res.json(r);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 5) Write-off: request → decision (approval needed) ──────────────────────
collectionDemoRouter.post(
  '/settlement/write-offs',
  requirePermission('loan:write'),
  validate(loanWriteOffCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const w = requestDemoWriteOff(
        loanDemoStore(),
        collectionDemoStore(),
        req.body as { applicationId: string; reason: 'other'; note: string },
        req.auth?.userId ?? null,
      );
      res.status(201).json(w);
    } catch (err) {
      demoError(err);
    }
  }),
);

collectionDemoRouter.get(
  '/settlement/write-offs',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: collectionDemoStore().writeOffs });
  }),
);

collectionDemoRouter.post(
  '/settlement/write-offs/:id/decision',
  requirePermission('loan:write'),
  validate(writeOffDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { decision: 'recommended' | 'approved' | 'rejected'; decisionNote?: string };
      const w = decideDemoWriteOff(
        loanDemoStore(),
        collectionDemoStore(),
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

// ── 6) BM-only reversal of a wrong entry ────────────────────────────────────
collectionDemoRouter.post(
  '/entries/:id/reverse',
  requirePermission('loan:write'),
  validate(collectionReversalSchema.omit({ entryId: true })),
  asyncHandler(async (req: RequestWithAuth, res) => {
    if (req.auth?.role !== 'branch_manager' && req.auth?.role !== 'super_admin' && req.auth?.role !== 'org_admin') {
      throw Forbidden('Only a Branch Manager can reverse a wrong entry');
    }
    try {
      const body = req.body as { reason: string };
      const rev = reverseDemoEntry(
        loanDemoStore(),
        collectionDemoStore(),
        req.params['id'] as string,
        body.reason,
        req.auth?.userId ?? null,
      );
      res.status(201).json(rev);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 8) Rule engine config (org-level) ───────────────────────────────────────
collectionDemoRouter.get(
  '/rules',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    res.json(getDemoRules(collectionDemoStore()));
  }),
);

collectionDemoRouter.patch(
  '/rules',
  requirePermission('loan:write'),
  validate(collectionRulesPatchSchema),
  asyncHandler(async (req, res) => {
    res.json(updateDemoRules(collectionDemoStore(), req.body as { backdateLimitDays?: number; futureLimitDays?: number }));
  }),
);

// ── 9) Fraud flags ──────────────────────────────────────────────────────────
collectionDemoRouter.get(
  '/fraud-flags',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const reviewed = req.query['reviewed'];
    res.json({
      items: listDemoFraudFlags(
        collectionDemoStore(),
        reviewed === undefined ? undefined : reviewed === 'true',
      ),
    });
  }),
);

collectionDemoRouter.post(
  '/fraud-flags/:id/review',
  requirePermission('loan:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const flag = reviewDemoFraudFlag(collectionDemoStore(), req.params['id'] as string, req.auth?.userId ?? null);
      res.json(flag);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 7) BM realtime dashboard (expected vs collected) ────────────────────────
collectionDemoRouter.get(
  '/dashboard',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const store = loanDemoStore();
    const coll = collectionDemoStore();
    const meetingDate = (req.query['date'] as string) ?? new Date().toISOString().slice(0, 10);
    const branchId =
      (req.query['branchId'] as string) ?? store.applications[0]?.branchId ?? '00000000-0000-4000-8000-0000000000b1';
    res.json(demoCollectionDashboard(store, coll, meetingDate, branchId));
  }),
);
