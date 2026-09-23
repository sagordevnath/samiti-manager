/**
 * ── Accounting demo router ──────────────────────────────────────────────────
 * Endpoints for the accounting module against the in-memory store (preview +
 * tests). Mirrors the Supabase path (migration 0028 + triggers): CoA CRUD,
 * voucher workflow, event-map auto-postings, cash book with day-end closing,
 * bank reconciliation, petty cash, and a trial-balance read model.
 */
import { Router } from 'express';
import {
  bankRecCreateSchema,
  cashBookCloseSchema,
  cashCountSchema,
  eventMappingSchema as eventMappingUpdateSchema,
  glAccountSchema as glAccountUpdateSchema,
  pettyCashSpendSchema,
  pettyCashTopUpSchema,
  voucherApproveSchema,
  voucherCheckSchema,
  voucherCreateSchema,
} from '@samity/shared';
import {
  budgetSetSchema,
  periodCloseSchema,
  periodReopenSchema,
  requisitionCreateSchema,
  requisitionDecisionSchema,
} from '@samity/shared';
import {
  AccountingDemoError,
  accountingDemoStore,
  approveDemoVoucher,
  checkDemoVoucher,
  closeDemoCashBook,
  countDemoCash,
  createDemoAccount,
  createDemoBankRec,
  createDemoVoucher,
  clearDemoBankLine,
  demoPettyBalance,
  demoPettySpend,
  demoPettyTopUp,
  demoTrialBalance,
  getDemoCashBook,
  listDemoAccounts,
  listDemoBankRecs,
  listDemoMappings,
  listDemoPostings,
  listDemoRequisitions,
  createDemoRequisition,
  decideDemoRequisition,
  disburseDemoRequisition,
  receiveDemoRequisition,
  demoLedger,
  demoReceiptsPayments,
  demoIncomeExpenditure,
  demoBalanceSheet,
  demoFundStatement,
  demoBudgetVsActual,
  listDemoPeriodCloses,
  closeDemoPeriod,
  reopenDemoPeriod,
  setDemoBudgets,
  listDemoVouchers,
  postDemoEvent,
  updateDemoAccount,
  updateDemoMapping,
} from '../lib/accounting-store.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

function demoError(err: unknown): never {
  if (err instanceof AccountingDemoError) throw new AppError(err.status, err.code as never, err.message);
  throw err as Error;
}

const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';

export const accountingDemoRouter = Router();
accountingDemoRouter.use(requireAuth);

// ── 1) Chart of accounts ────────────────────────────────────────────────────
accountingDemoRouter.get(
  '/accounts',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const store = accountingDemoStore();
    const includeInactive = req.query['includeInactive'] === 'true';
    res.json({ items: listDemoAccounts(store, includeInactive) });
  }),
);

accountingDemoRouter.post(
  '/accounts',
  requirePermission('org:manage'),
  validate(glAccountUpdateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const account = createDemoAccount(accountingDemoStore(), req.body, req.auth!.userId);
      res.status(201).json(account);
    } catch (err) {
      demoError(err);
    }
  }),
);

/**
 * Account codes are immutable in this router (they anchor journal lines and
 * seeded mappings); the PATCH endpoint is therefore name/label-only and
 * validates against a partial schema.
 */
const glAccountRenameSchema = glAccountUpdateSchema.omit({ code: true, type: true, category: true, parentCode: true }).partial();

accountingDemoRouter.patch(
  '/accounts/:id',
  requirePermission('org:manage'),
  validate(glAccountRenameSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.json(updateDemoAccount(accountingDemoStore(), req.params['id'] as string, req.body));
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── Trial balance (read model) ──────────────────────────────────────────────
accountingDemoRouter.get(
  '/trial-balance',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    res.json(demoTrialBalance(accountingDemoStore(), (req.query['branchId'] as string | undefined) ?? undefined));
  }),
);

// ── 2) Vouchers ─────────────────────────────────────────────────────────────
accountingDemoRouter.get(
  '/vouchers',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const q = req.query as { branchId?: string; status?: never; voucherType?: never };
    res.json({ items: listDemoVouchers(accountingDemoStore(), q) });
  }),
);

accountingDemoRouter.post(
  '/vouchers',
  requirePermission('savings:write'),
  validate(voucherCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const voucher = createDemoVoucher(accountingDemoStore(), req.body, req.auth!.userId);
      res.status(201).json(voucher);
    } catch (err) {
      demoError(err);
    }
  }),
);

accountingDemoRouter.post(
  '/vouchers/:id/check',
  requirePermission('savings:write'),
  validate(voucherCheckSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.json(checkDemoVoucher(accountingDemoStore(), req.params['id'] as string, req.auth!.userId, req.body?.note));
    } catch (err) {
      demoError(err);
    }
  }),
);

accountingDemoRouter.post(
  '/vouchers/:id/approve',
  requirePermission('member:approve'),
  validate(voucherApproveSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.json(approveDemoVoucher(accountingDemoStore(), req.params['id'] as string, req.auth!.userId, req.body?.note));
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 3) Event-to-journal mappings + postings ─────────────────────────────────
accountingDemoRouter.get(
  '/event-mappings',
  requirePermission('report:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listDemoMappings(accountingDemoStore()) });
  }),
);

accountingDemoRouter.patch(
  '/event-mappings/:id',
  requirePermission('org:manage'),
  validate(eventMappingUpdateSchema.partial()),
  asyncHandler(async (req, res) => {
    try {
      res.json(updateDemoMapping(accountingDemoStore(), req.params['id'] as string, req.body));
    } catch (err) {
      demoError(err);
    }
  }),
);

accountingDemoRouter.get(
  '/postings',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listDemoPostings(accountingDemoStore(), (req.query['branchId'] as string | undefined) ?? undefined) });
  }),
);

accountingDemoRouter.post(
  '/postings',
  requirePermission('savings:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { event?: string; amount?: string; branchId?: string; refId?: string };
      if (!body.event || !body.amount) {
        throw new AppError(400, 'VALIDATION_ERROR', 'event and amount are required');
      }
      const voucher = postDemoEvent(
        accountingDemoStore(),
        {
          event: body.event as never,
          amount: body.amount,
          branchId: body.branchId ?? BRANCH_DHAKA,
          refId: body.refId ?? null,
        },
        req.auth!.userId,
      );
      res.status(201).json(voucher);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 4) Daily cash book ──────────────────────────────────────────────────────
accountingDemoRouter.get(
  '/cash-book',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const branchId = (req.query['branchId'] as string | undefined) ?? BRANCH_DHAKA;
    const date = (req.query['date'] as string | undefined) ?? new Date().toISOString().slice(0, 10);
    res.json(getDemoCashBook(accountingDemoStore(), branchId, date));
  }),
);

accountingDemoRouter.post(
  '/cash-book/count',
  requirePermission('savings:write'),
  validate(cashCountSchema),
  asyncHandler(async (req, res) => {
    try {
      const body = req.body as { countedCash: string; note?: string };
      const branchId = (req.query['branchId'] as string | undefined) ?? BRANCH_DHAKA;
      const date = (req.query['date'] as string | undefined) ?? new Date().toISOString().slice(0, 10);
      res.json(countDemoCash(accountingDemoStore(), branchId, date, body.countedCash, body.note));
    } catch (err) {
      demoError(err);
    }
  }),
);

accountingDemoRouter.post(
  '/cash-book/close',
  requirePermission('member:approve'),
  validate(cashBookCloseSchema),
  asyncHandler(async (req, res) => {
    try {
      const body = req.body as { countedCash: string; managerSignName: string; accountantSignName: string; note?: string };
      const branchId = (req.query['branchId'] as string | undefined) ?? BRANCH_DHAKA;
      const date = (req.query['date'] as string | undefined) ?? new Date().toISOString().slice(0, 10);
      res.json(closeDemoCashBook(accountingDemoStore(), branchId, date, body));
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 5) Bank reconciliation ──────────────────────────────────────────────────
accountingDemoRouter.get(
  '/bank-reconciliations',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listDemoBankRecs(accountingDemoStore(), (req.query['branchId'] as string | undefined) ?? undefined) });
  }),
);

accountingDemoRouter.post(
  '/bank-reconciliations',
  requirePermission('savings:write'),
  validate(bankRecCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const rec = createDemoBankRec(accountingDemoStore(), req.body, req.auth!.userId);
      res.status(201).json(rec);
    } catch (err) {
      demoError(err);
    }
  }),
);

accountingDemoRouter.post(
  '/bank-reconciliations/:id/lines/:lineId/clear',
  requirePermission('savings:write'),
  asyncHandler(async (req, res) => {
    try {
      const body = req.body as { matchedVoucherNumber?: string } | undefined;
      res.json(clearDemoBankLine(accountingDemoStore(), req.params['id'] as string, req.params['lineId'] as string, body?.matchedVoucherNumber));
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── Petty cash register ─────────────────────────────────────────────────────
accountingDemoRouter.get(
  '/petty-cash',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    res.json(demoPettyBalance(accountingDemoStore(), (req.query['branchId'] as string | undefined) ?? BRANCH_DHAKA));
  }),
);

accountingDemoRouter.post(
  '/petty-cash/top-up',
  requirePermission('savings:write'),
  validate(pettyCashTopUpSchema),
  asyncHandler(async (req, res) => {
    try {
      const body = req.body as { branchId: string; amount: string; note?: string };
      res.json(demoPettyTopUp(accountingDemoStore(), body.branchId, body.amount, body.note));
    } catch (err) {
      demoError(err);
    }
  }),
);

accountingDemoRouter.post(
  '/petty-cash/spend',
  requirePermission('savings:write'),
  validate(pettyCashSpendSchema),
  asyncHandler(async (req, res) => {
    try {
      const body = req.body as { branchId: string; amount: string; expenseCode: string; spentOn: string; note?: string };
      res.json(demoPettySpend(accountingDemoStore(), body.branchId, body));
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 6) Fund requisitions & inter-branch transfers ────────────────────────────
accountingDemoRouter.get(
  '/requisitions',
  requirePermission('report:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listDemoRequisitions(accountingDemoStore()) });
  }),
);

accountingDemoRouter.post(
  '/requisitions',
  requirePermission('savings:write'),
  validate(requisitionCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const req2 = createDemoRequisition(accountingDemoStore(), req.body, req.auth!.userId);
      res.status(201).json(req2);
    } catch (err) {
      demoError(err);
    }
  }),
);

accountingDemoRouter.post(
  '/requisitions/:id/decision',
  requirePermission('org:manage'),
  validate(requisitionDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { decision: 'approve' | 'reject' };
      res.json(decideDemoRequisition(accountingDemoStore(), req.params['id'] as string, body.decision, req.auth!.userId));
    } catch (err) {
      demoError(err);
    }
  }),
);

accountingDemoRouter.post(
  '/requisitions/:id/disburse',
  requirePermission('savings:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.json(disburseDemoRequisition(accountingDemoStore(), req.params['id'] as string, req.auth!.userId));
    } catch (err) {
      demoError(err);
    }
  }),
);

accountingDemoRouter.post(
  '/requisitions/:id/receive',
  requirePermission('savings:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.json(receiveDemoRequisition(accountingDemoStore(), req.params['id'] as string, req.auth!.userId));
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 8) Financial reports ─────────────────────────────────────────────────────
accountingDemoRouter.get(
  '/ledger/:code',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const store = accountingDemoStore();
    res.json(demoLedger(store, req.params['code'] as string, (req.query['branchId'] as string | undefined) ?? undefined));
  }),
);

accountingDemoRouter.get(
  '/reports/receipts-payments',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const store = accountingDemoStore();
    res.json(demoReceiptsPayments(store, (req.query['start'] as string) ?? todayStr(), (req.query['end'] as string) ?? todayStr()));
  }),
);

accountingDemoRouter.get(
  '/reports/income-expenditure',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const store = accountingDemoStore();
    res.json(demoIncomeExpenditure(store, (req.query['start'] as string) ?? todayStr(), (req.query['end'] as string) ?? todayStr()));
  }),
);

accountingDemoRouter.get(
  '/reports/balance-sheet',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    res.json(demoBalanceSheet(accountingDemoStore(), (req.query['asOf'] as string) ?? todayStr()));
  }),
);

accountingDemoRouter.get(
  '/reports/fund-statement',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const store = accountingDemoStore();
    res.json(
      demoFundStatement(
        store,
        (req.query['fund'] as string) ?? 'General Fund',
        (req.query['start'] as string) ?? todayStr(),
        (req.query['end'] as string) ?? todayStr(),
      ),
    );
  }),
);

accountingDemoRouter.get(
  '/reports/budget-vs-actual',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const store = accountingDemoStore();
    res.json(demoBudgetVsActual(store, (req.query['start'] as string) ?? todayStr(), (req.query['end'] as string) ?? todayStr()));
  }),
);

accountingDemoRouter.put(
  '/budgets',
  requirePermission('org:manage'),
  validate(budgetSetSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { periodStart: string; periodEnd: string; lines: Array<{ accountCode: string; amount: string }> };
      res.json({ items: setDemoBudgets(accountingDemoStore(), body.periodStart, body.periodEnd, body.lines) });
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 9) Period close ──────────────────────────────────────────────────────────
accountingDemoRouter.get(
  '/period-closes',
  requirePermission('report:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listDemoPeriodCloses(accountingDemoStore()) });
  }),
);

accountingDemoRouter.post(
  '/period-closes',
  requirePermission('org:manage'),
  validate(periodCloseSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { kind: 'monthly' | 'annual'; periodStart: string; periodEnd: string; note?: string };
      res.status(201).json(closeDemoPeriod(accountingDemoStore(), body.kind, body.periodStart, body.periodEnd, req.auth!.userId, req.auth!.role, body.note));
    } catch (err) {
      demoError(err);
    }
  }),
);

accountingDemoRouter.post(
  '/period-closes/:id/reopen',
  requirePermission('org:manage'),
  validate(periodReopenSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { note: string };
      reopenDemoPeriod(accountingDemoStore(), req.params['id'] as string, req.auth!.role, body.note);
      res.json({ ok: true });
    } catch (err) {
      demoError(err);
    }
  }),
);

const todayStr = () => new Date().toISOString().slice(0, 10);
