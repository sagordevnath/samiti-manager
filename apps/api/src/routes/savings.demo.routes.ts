/**
 * ── Savings demo router ──────────────────────────────────────────────────────
 * Mirrors savings.routes.ts against the in-memory store when Supabase is not
 * configured (preview + tests). Endpoint-for-endpoint parity plus the share,
 * dividend, passbook, and reconciliation features from 0011.
 */
import { Router } from 'express';
import {
  dividendDeclarationSchema,
  passbookQuerySchema,
  reconciliationRunSchema,
  savingsAccountCreateSchema,
  savingsProductCreateSchema,
  savingsTxCreateSchema,
  shareAllotmentSchema,
} from '@samity/shared';
import { demoAuthUser } from '../lib/demo.js';
import { SavingsDemoError } from '../lib/savings-store.js';
import {
  buildDemoPassbook,
  demoDividendPreview,
  demoMemberName,
  ledgerBalance,
  paidSharesFor,
  postDemoTx,
  runDemoReconciliation,
  savingsDemoStore,
} from '../lib/savings-store.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { AppError, Conflict, Forbidden, NotFound } from '../lib/errors.js';

function demoError(err: unknown): never {
  if (err instanceof SavingsDemoError) {
    if (err.status === 404) throw NotFound(err.message);
    if (err.status === 409) throw Conflict(err.message);
    throw new AppError(400, 'VALIDATION_ERROR', err.message);
  }
  throw err as Error;
}

export const savingsDemoRouter = Router();
savingsDemoRouter.use(requireAuth);

// ── Products ────────────────────────────────────────────────────────────────
savingsDemoRouter.get(
  '/products',
  requirePermission('savings:read'),
  asyncHandler(async (_req, res) => {
    const store = savingsDemoStore();
    res.json({ items: store.products.filter((p) => p.is_active) });
  }),
);

savingsDemoRouter.post(
  '/products',
  requirePermission('savings:write'),
  validate(savingsProductCreateSchema.omit({ orgId: true })),
  asyncHandler(async (req, res) => {
    const store = savingsDemoStore();
    const body = req.body as Record<string, unknown>;
    if (store.products.some((p) => p.code.toLowerCase() === String(body.code).toLowerCase() && p.is_active)) {
      throw Conflict('A product with this code already exists');
    }
    const isShare = body.productType === 'share';
    const product = {
      id: crypto.randomUUID(),
      org_id: demoAuthUser().orgId!,
      code: String(body.code),
      name: String(body.name),
      name_bn: (body.nameBn as string) ?? null,
      product_type: body.productType as 'compulsory' | 'voluntary' | 'dps' | 'fixed' | 'share',
      interest_rate: Number(body.interestRate ?? 0).toFixed(2),
      compounding: String(body.compounding ?? 'none'),
      min_balance: Number(body.minBalance ?? 0).toFixed(2),
      max_deposit: body.maxDeposit != null ? Number(body.maxDeposit).toFixed(2) : null,
      withdrawal_limit: Number(body.withdrawalLimit ?? 0).toFixed(2),
      withdrawal_limit_period: String(body.withdrawalLimitPeriod ?? 'per_tx'),
      withdrawal_rules: (body.withdrawalRules as string) ?? null,
      lock_while_loan_active: Boolean(body.lockWhileLoanActive),
      maturity_months: Number(body.maturityMonths ?? 0),
      early_withdrawal_penalty_rate: Number(body.earlyWithdrawalPenaltyRate ?? 0).toFixed(2),
      auto_link_loan: Boolean(body.autoLinkLoan),
      auto_link_weekly_amount: Number(body.autoLinkWeeklyAmount ?? 0).toFixed(2),
      requires_manager_approval_above: Number(body.requiresManagerApprovalAbove ?? 0).toFixed(2),
      dormant_after_months: Number(body.dormantAfterMonths ?? 6),
      is_active: body.isActive !== false,
      face_value: isShare ? Number(body.faceValue ?? 1000).toFixed(2) : null,
      max_shares: isShare ? Number(body.maxShares ?? 0) : null,
      created_by: demoAuthUser().userId,
      created_at: new Date().toISOString(),
    };
    store.products.push(product);
    res.status(201).json({ product });
  }),
);

// ── Accounts ────────────────────────────────────────────────────────────────
savingsDemoRouter.get(
  '/accounts',
  requirePermission('savings:read'),
  asyncHandler(async (_req, res) => {
    const store = savingsDemoStore();
    const items = store.accounts.map((a) => {
      const product = store.products.find((p) => p.id === a.product_id);
      return {
        ...a,
        savings_products: product ? { name: product.name, name_bn: product.name_bn, product_type: product.product_type } : null,
        members: { full_name: demoMemberName(a.member_id), member_code: a.member_id.slice(0, 8) },
      };
    });
    res.json({ items });
  }),
);

savingsDemoRouter.post(
  '/accounts',
  requirePermission('savings:write'),
  validate(savingsAccountCreateSchema.omit({ orgId: true })),
  asyncHandler(async (req, res) => {
    const store = savingsDemoStore();
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as { branchId: string; memberId: string; productId: string; nomineeId?: string; openingBalance: string };
    const product = store.products.find((p) => p.id === body.productId && p.is_active);
    if (!product) throw NotFound('Savings product not found');
    const existing = store.accounts.filter((a) => a.member_id === body.memberId && a.product_id === body.productId && a.status !== 'closed');
    if (existing.length > 0) throw Conflict('Member already has an open account for this product');
    const opening = new Date();
    const account = {
      id: crypto.randomUUID(),
      org_id: auth.orgId ?? store.orgId,
      branch_id: body.branchId,
      member_id: body.memberId,
      product_id: body.productId,
      account_number: `SA-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
      opening_date: opening.toISOString().slice(0, 10),
      status: 'active' as const,
      nominee_id: body.nomineeId ?? null,
      maturity_date:
        product.maturity_months > 0
          ? new Date(opening.setMonth(opening.getMonth() + product.maturity_months)).toISOString().slice(0, 10)
          : null,
      balance: Number(body.openingBalance ?? 0).toFixed(2),
      closed_at: null,
      created_by: auth.userId,
      created_at: new Date().toISOString(),
    };
    store.accounts.push(account);
    res.status(201).json({ account });
  }),
);

// ── Transactions ────────────────────────────────────────────────────────────
savingsDemoRouter.get(
  '/accounts/:id/transactions',
  requirePermission('savings:read'),
  asyncHandler(async (req, res) => {
    const store = savingsDemoStore();
    res.json({
      items: store.transactions
        .filter((t) => t.account_id === req.params['id'])
        .sort((a, b) => b.created_at.localeCompare(a.created_at)), // newest first, like the Supabase route
    });
  }),
);

savingsDemoRouter.post(
  '/transactions',
  requirePermission('savings:write'),
  validate(savingsTxCreateSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as {
      accountId: string;
      type: 'deposit' | 'withdrawal' | 'interest' | 'transfer' | 'adjustment' | 'closure';
      amount: string;
      toAccountId?: string;
      reference?: string;
      note?: string;
      reversalOf?: string;
      reversalReason?: string;
      approvalReference?: string;
    };
    const store = savingsDemoStore();
    const account = store.accounts.find((a) => a.id === body.accountId);
    if (!account) throw NotFound('Savings account not found');
    if (auth.orgId && auth.role !== 'super_admin' && account.org_id !== auth.orgId) throw Forbidden();
    const product = store.products.find((p) => p.id === account.product_id);
    const amount = Number(body.amount);
    const isWithdrawal = ['withdrawal', 'adjustment', 'closure'].includes(body.type);
    const needsApproval =
      isWithdrawal &&
      ((Number(product?.withdrawal_limit ?? 0) > 0 && amount > Number(product?.withdrawal_limit)) ||
        amount > Number(product?.requires_manager_approval_above ?? 0));
    if (needsApproval && !['branch_manager', 'org_admin', 'super_admin'].includes(auth.role)) {
      throw Forbidden('Branch Manager approval is required for this withdrawal');
    }
    if (body.reversalOf && (!body.reversalReason || !body.approvalReference)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Reversal reason and approval reference are required');
    }
    try {
      const tx = postDemoTx(store, {
        accountId: body.accountId,
        type: body.type,
        amount: body.amount,
        toAccountId: body.toAccountId ?? null,
        reference: body.reference ?? body.approvalReference ?? null,
        note: body.note ?? null,
        reversalOf: body.reversalOf ?? null,
        reversalReason: body.reversalReason ?? null,
        approvedBy: needsApproval || body.reversalOf ? auth.userId : null,
        interestPeriod: body.type === 'interest' ? deriveInterestPeriod(body.reference) : null,
        userId: auth.userId,
      });
      res.status(201).json({ transaction: tx });
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── Interest ────────────────────────────────────────────────────────────────
function interestPeriod(asOf: Date, frequency: 'monthly' | 'yearly'): string {
  const year = asOf.getUTCFullYear();
  return frequency === 'yearly' ? String(year) : `${year}-${String(asOf.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Manual interest postings carry the period in their reference ("Interest
 * 2026-07" / "Interest 2026"); scheduled postings pass it explicitly. This
 * mirrors the DB's unique (account_id, interest_period) key.
 */
function deriveInterestPeriod(reference: string | null | undefined): string {
  const parsed = reference?.match(/Interest (\d{4}(?:-\d{2})?)$/);
  if (parsed?.[1]) return parsed[1];
  return interestPeriod(new Date(), 'monthly');
}

function buildInterestPreview(frequency: 'monthly' | 'yearly', productIds?: string[]) {
  const store = savingsDemoStore();
  const period = interestPeriod(new Date(), frequency);
  const divisor = frequency === 'yearly' ? 100 : 1200;
  return store.accounts
    .filter((a) => ['active', 'dormant'].includes(a.status))
    .map((account) => {
      const product = store.products.find((p) => p.id === account.product_id);
      const alreadyPosted = store.transactions.some(
        (t) => t.account_id === account.id && t.transaction_type === 'interest' && t.interest_period === period,
      );
      if (!product?.is_active || alreadyPosted || (productIds?.length && !productIds.includes(product.id))) return null;
      const amount = ((Number(account.balance) * Number(product.interest_rate)) / divisor).toFixed(2);
      return {
        accountId: account.id,
        accountNumber: account.account_number,
        productId: product.id,
        productName: product.name,
        balance: account.balance,
        rate: product.interest_rate,
        amount,
        period,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

savingsDemoRouter.post(
  '/interest/preview',
  requirePermission('savings:read'),
  asyncHandler(async (req, res) => {
    const body = req.body as { productIds?: string[]; frequency?: 'monthly' | 'yearly' };
    res.json({ items: buildInterestPreview(body.frequency ?? 'monthly', body.productIds) });
  }),
);

savingsDemoRouter.post(
  '/interest/post',
  requirePermission('savings:write'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as { productIds?: string[]; frequency?: 'monthly' | 'yearly'; dryRun?: boolean };
    const items = buildInterestPreview(body.frequency ?? 'monthly', body.productIds);
    if (body.dryRun !== false) return res.json({ dryRun: true, items });
    const posted = [];
    for (const item of items) {
      posted.push(
        postDemoTx(savingsDemoStore(), {
          accountId: item.accountId,
          type: 'interest',
          amount: item.amount,
          reference: `Interest ${item.period}`,
          note: `Scheduled ${body.frequency ?? 'monthly'} interest posting`,
          interestPeriod: item.period,
          userId: auth.userId,
        }),
      );
    }
    res.json({ dryRun: false, items: posted });
  }),
);

// ── Share capital ───────────────────────────────────────────────────────────
savingsDemoRouter.get(
  '/shares',
  requirePermission('savings:read'),
  asyncHandler(async (_req, res) => {
    const store = savingsDemoStore();
    const items = store.shareAllotments.map((a) => ({
      ...a,
      memberName: demoMemberName(a.member_id),
      productCode: store.products.find((p) => p.id === a.product_id)?.code ?? null,
    }));
    res.json({ items });
  }),
);

savingsDemoRouter.post(
  '/shares',
  requirePermission('savings:write'),
  validate(shareAllotmentSchema.omit({ orgId: true })),
  asyncHandler(async (req, res) => {
    const store = savingsDemoStore();
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as { memberId: string; productId: string; shares: number; paidAmount: string; reference?: string };
    const product = store.products.find((p) => p.id === body.productId && p.product_type === 'share');
    if (!product?.face_value) throw NotFound('Share product not found');
    const faceValue = Number(product.face_value);
    const existingAllotted = store.shareAllotments
      .filter((a) => a.member_id === body.memberId && a.product_id === body.productId && !a.reversal_of)
      .reduce((s, a) => s + a.shares, 0);
    if (product.max_shares && existingAllotted + body.shares > product.max_shares) {
      throw Conflict(`Share cap exceeded (max ${product.max_shares} per member)`);
    }
    const paidShares = Math.min(Math.floor(Number(body.paidAmount) / faceValue), body.shares);
    if (paidShares < 0) throw Conflict('Paid amount invalid');
    const allotment = {
      id: crypto.randomUUID(),
      org_id: auth.orgId ?? store.orgId,
      member_id: body.memberId,
      product_id: body.productId,
      shares: body.shares,
      face_value: product.face_value,
      paid_amount: Number(body.paidAmount).toFixed(2),
      paid_shares: paidShares,
      reference: body.reference ?? null,
      reversal_of: null,
      created_by: auth.userId,
      created_at: new Date().toISOString(),
    };
    store.shareAllotments.push(allotment);
    res.status(201).json({ allotment });
  }),
);

// ── Dividends ───────────────────────────────────────────────────────────────
savingsDemoRouter.get(
  '/dividends',
  requirePermission('savings:read'),
  asyncHandler(async (_req, res) => {
    const store = savingsDemoStore();
    res.json({ items: store.dividendDeclarations });
  }),
);

savingsDemoRouter.get(
  '/dividends/preview',
  requirePermission('savings:read'),
  asyncHandler(async (req, res) => {
    const store = savingsDemoStore();
    const productId = String(req.query['productId'] ?? '');
    const surplus = String(req.query['surplus'] ?? '0');
    const payoutRate = Number(req.query['payoutRate'] ?? 0);
    const product = store.products.find((p) => p.id === productId && p.product_type === 'share');
    if (!product?.face_value) throw NotFound('Share product not found');
    const faceValue: string = product.face_value;
    res.json(demoDividendPreview(store, productId, surplus, payoutRate, faceValue));
  }),
);

savingsDemoRouter.post(
  '/dividends',
  requirePermission('savings:write'),
  validate(dividendDeclarationSchema.omit({ orgId: true })),
  asyncHandler(async (req, res) => {
    const store = savingsDemoStore();
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as {
      productId: string;
      financialYear: string;
      surplus: string;
      payoutRate: number;
      approvedByMeetingRef: string;
      approvedAt: string;
    };
    const product = store.products.find((p) => p.id === body.productId && p.product_type === 'share');
    if (!product?.face_value) throw NotFound('Share product not found');
    const faceValue: string = product.face_value;
    if (store.dividendDeclarations.some((d) => d.product_id === body.productId && d.financial_year === body.financialYear)) {
      throw Conflict('A declaration already exists for this product and financial year');
    }
    const pool = ((Number(body.surplus) * body.payoutRate) / 100).toFixed(2);
    const declaration = {
      id: crypto.randomUUID(),
      org_id: auth.orgId ?? store.orgId,
      product_id: body.productId,
      financial_year: body.financialYear,
      surplus: Number(body.surplus).toFixed(2),
      payout_rate: body.payoutRate.toFixed(2),
      dividend_pool: pool,
      retained: (Number(body.surplus) - Number(pool)).toFixed(2),
      approved_by_meeting_ref: body.approvedByMeetingRef,
      approved_at: body.approvedAt,
      status: 'approved' as const,
      approved_by: auth.userId,
      created_by: auth.userId,
      created_at: new Date().toISOString(),
    };
    store.dividendDeclarations.push(declaration);

    // Materialize per-member payments prorated by paid-up share capital.
    const preview = demoDividendPreview(store, body.productId, body.surplus, body.payoutRate, faceValue);
    for (const member of preview.perMember) {
      if (Number(member.amount) <= 0) continue;
      store.dividendPayments.push({
        id: crypto.randomUUID(),
        org_id: declaration.org_id,
        declaration_id: declaration.id,
        member_id: member.memberId,
        paid_shares: member.paidShares,
        face_value: faceValue,
        amount: member.amount,
        paid_at: null,
        created_at: new Date().toISOString(),
      });
    }
    res.status(201).json({ declaration });
  }),
);

// ── Passbook ────────────────────────────────────────────────────────────────
savingsDemoRouter.get(
  '/passbook',
  requirePermission('savings:read'),
  asyncHandler(async (req, res) => {
    const q = passbookQuerySchema.safeParse({
      accountId: String(req.query['accountId'] ?? ''),
      from: String(req.query['from'] ?? ''),
      to: String(req.query['to'] ?? ''),
    });
    if (!q.success) throw new AppError(400, 'VALIDATION_ERROR', 'accountId, from (YYYY-MM-DD) and to are required');
    const statement = buildDemoPassbook(savingsDemoStore(), q.data.accountId, q.data.from, q.data.to);
    res.json({ statement });
  }),
);

// ── Reconciliation ──────────────────────────────────────────────────────────
savingsDemoRouter.get(
  '/reconciliation/runs',
  requirePermission('savings:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: savingsDemoStore().reconciliationRuns.slice(0, 10) });
  }),
);

savingsDemoRouter.post(
  '/reconciliation/run',
  requirePermission('savings:read'),
  validate(reconciliationRunSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as { accountId?: string };
    const run = runDemoReconciliation(savingsDemoStore(), auth.userId);
    const results = body.accountId ? run.results.filter((r) => r.accountId === body.accountId) : run.results;
    res.json({
      runAt: run.run_at,
      checked: results.length,
      mismatches: results.filter((r) => r.status === 'mismatch').length,
      results,
    });
  }),
);
