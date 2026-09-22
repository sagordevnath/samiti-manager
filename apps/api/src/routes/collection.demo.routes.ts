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
  collectionSheetQuerySchema,
  collectionSyncSchema,
  handoverQuerySchema,
  type CollectionReceipt,
} from '@samity/shared';
import { isDemoMode } from '../lib/demo.js';
import {
  buildDemoSheet,
  collectionDemoStore,
  CollectionDemoError,
  confirmDemoHandover,
  createDemoHandover,
  demoCashSummary,
  DEMO_OFFICER_ID,
  listDemoHandovers,
  postDemoCollectionEntry,
  resetCollectionDemoStore,
  submitDemoHandover,
  syncDemoCollection,
  type PostContext,
} from '../lib/collection-store.js';
import { loanDemoStore, LoanDemoError } from '../lib/loan-store.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { AppError, Conflict, Forbidden, NotFound } from '../lib/errors.js';

function demoError(err: unknown): never {
  if (err instanceof CollectionDemoError) {
    if (err.status === 404) throw NotFound(err.message);
    if (err.status === 409) throw Conflict(err.message);
    if (err.status === 403) throw Forbidden(err.message);
    throw new AppError(400, 'VALIDATION_ERROR', err.message);
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
