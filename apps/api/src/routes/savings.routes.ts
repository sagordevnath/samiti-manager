import { Router } from 'express';
import {
  computeStatement,
  dividendDeclarationSchema,
  shareAllotmentSchema,
  interestRunSchema,
  passbookQuerySchema,
  reconciliationRunSchema,
  savingsAccountCreateSchema,
  savingsProductCreateSchema,
  savingsTxCreateSchema,
  type PassbookLine,
} from '@samity/shared';
import { dividendPreviewFromMembers } from '../lib/dividend-wire.js';
import { BadRequest, Conflict, Forbidden, NotFound } from '../lib/errors.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { scopesOrg } from '../lib/tenant.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

const productBodySchema = savingsProductCreateSchema.omit({ orgId: true });
const accountBodySchema = savingsAccountCreateSchema.omit({ orgId: true });
const transactionBodySchema = savingsTxCreateSchema;
const dividendBodySchema = dividendDeclarationSchema.omit({ orgId: true });
const reconciliationBodySchema = reconciliationRunSchema;

/** Savings products have no face_value column — share allots carry it. */
async function shareFaceValue(productId: string, orgId: string | null): Promise<string> {
  let q = supabaseAdmin.from('share_allotments').select('face_value').eq('product_id', productId).limit(1);
  if (orgId) q = q.eq('org_id', orgId);
  const { data } = await q;
  return data?.[0]?.face_value ?? '10.00';
}

/** Paid-up shares per member for one share product (reversed allotments excluded). */
async function paidSharesByMember(productId: string, orgId: string | null) {
  let q = supabaseAdmin
    .from('share_allotments')
    .select('member_id, paid_shares, face_value')
    .eq('product_id', productId)
    .is('reversal_of', null);
  if (orgId) q = q.eq('org_id', orgId);
  const { data, error } = await q;
  if (error) throw error;
  const byMember = new Map<string, number>();
  let faceValue = '10.00';
  for (const row of data ?? []) {
    byMember.set(row.member_id, (byMember.get(row.member_id) ?? 0) + Number(row.paid_shares ?? 0));
    if (row.face_value) faceValue = row.face_value;
  }
  const ids = [...byMember.keys()];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: members } = await supabaseAdmin.from('members').select('id, full_name').in('id', ids);
    for (const m of members ?? []) names.set(m.id, m.full_name);
  }
  return {
    faceValue,
    // Wire shape the Shares page renders: names + total, not just ids.
    perMember: [...byMember.entries()].map(([memberId, paidShares]) => ({
      memberId,
      memberName: names.get(memberId) ?? memberId.slice(0, 8),
      paidShares,
    })),
  };
}

/** Shape both the preview and the created declaration return to the UI. */
const dividendPreviewWire = dividendPreviewFromMembers;

export const savingsRouter = Router();
savingsRouter.use(requireAuth);

savingsRouter.get(
  '/products',
  requirePermission('savings:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    let query = supabaseAdmin.from('savings_products').select('*').is('deleted_at', null).order('name');
    if (scopesOrg(auth)) query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

savingsRouter.post(
  '/products',
  requirePermission('savings:write'),
  validate(productBodySchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    if (!auth.orgId) return res.status(400).json({ error: { code: 'ORG_REQUIRED', message: 'Organization is required' } });
    const body = req.body as Record<string, unknown>;
    const { data, error } = await supabaseAdmin
      .from('savings_products')
      .insert({
        org_id: auth.orgId,
        code: body.code,
        name: body.name,
        name_bn: body.nameBn ?? null,
        product_type: body.productType,
        interest_rate: body.interestRate,
        compounding: body.compounding,
        min_balance: body.minBalance,
        max_deposit: body.maxDeposit ?? null,
        withdrawal_limit: body.withdrawalLimit,
        withdrawal_limit_period: body.withdrawalLimitPeriod,
        withdrawal_rules: body.withdrawalRules ?? null,
        lock_while_loan_active: body.lockWhileLoanActive,
        maturity_months: body.maturityMonths,
        early_withdrawal_penalty_rate: body.earlyWithdrawalPenaltyRate,
        auto_link_loan: body.autoLinkLoan,
        auto_link_weekly_amount: body.autoLinkWeeklyAmount,
        requires_manager_approval_above: body.requiresManagerApprovalAbove,
        dormant_after_months: body.dormantAfterMonths,
        is_active: body.isActive,
        created_by: auth.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ product: data });
  }),
);

/**
 * GET /api/v1/savings/shares — cooperative share capital ledger.
 *
 * The demo router has always served this; the live router did not, so the
 * Shares page 404'd against a real database. Rows are read from
 * `share_allotments` with the member and share-product names resolved via
 * disambiguated FK embeds (bare `members(...)` would be ambiguous).
 */
savingsRouter.get(
  '/shares',
  requirePermission('savings:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    let query = supabaseAdmin
      .from('share_allotments')
      .select('*, members!share_allotments_member_id_fkey(full_name), savings_products(code)')
      .order('created_at', { ascending: false });
    if (scopesOrg(auth)) query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((row) => {
        const r = row as Record<string, unknown> & {
          members?: { full_name?: string } | null;
          savings_products?: { code?: string } | null;
        };
        return {
          ...r,
          memberName: r.members?.full_name ?? null,
          productCode: r.savings_products?.code ?? null,
        };
      }),
    });
  }),
);

/**
 * POST /api/v1/savings/shares — record a share purchase (cooperative capital).
 * `savings_products` has no face_value column, so the value is taken from the
 * product's existing allotments and falls back to the standard ৳10 share.
 */
savingsRouter.post(
  '/shares',
  requirePermission('savings:write'),
  validate(shareAllotmentSchema.omit({ orgId: true })),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    if (!auth.orgId) throw BadRequest('Organization is required');
    const body = req.body as { memberId: string; productId: string; shares: number; paidAmount: string; reference?: string };

    const { data: product, error: productError } = await supabaseAdmin
      .from('savings_products')
      .select('id, product_type')
      .eq('id', body.productId)
      .eq('org_id', auth.orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (productError) throw productError;
    if (!product || product.product_type !== 'share') throw NotFound('শেয়ার পণ্য পাওয়া যায়নি / Share product not found');

    const faceValue = await shareFaceValue(body.productId, auth.orgId);
    // Paid-up shares are the affordable part of the purchase.
    const paidShares = Math.min(Math.floor(Number(body.paidAmount) / Number(faceValue)), body.shares);

    const { data, error } = await supabaseAdmin
      .from('share_allotments')
      .insert({
        org_id: auth.orgId,
        member_id: body.memberId,
        product_id: body.productId,
        shares: body.shares,
        face_value: faceValue,
        paid_amount: Number(body.paidAmount).toFixed(2),
        paid_shares: paidShares,
        reference: body.reference ?? null,
        created_by: auth.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ allotment: data });
  }),
);

savingsRouter.get(
  '/accounts/:id/transactions',
  requirePermission('savings:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    let query = supabaseAdmin
      .from('savings_transactions')
      .select('*')
      .eq('account_id', req.params['id'])
      .order('created_at', { ascending: false });
    // id-addressed read: the service client bypasses RLS, so a guessed account
    // id from another organization must be filtered out in code.
    if (scopesOrg(auth)) query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

savingsRouter.post(
  '/transactions',
  requirePermission('savings:write'),
  validate(transactionBodySchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as {
      accountId: string;
      type: string;
      amount: string;
      toAccountId?: string;
      reference?: string;
      note?: string;
      reversalOf?: string;
      reversalReason?: string;
      approvalReference?: string;
    };
    const { data: account, error: accountError } = await supabaseAdmin
      .from('savings_accounts')
      .select('id, org_id, member_id, product_id, balance, savings_products(withdrawal_limit, requires_manager_approval_above)')
      .eq('id', body.accountId)
      .is('deleted_at', null)
      .single();
    if (accountError || !account) throw NotFound('Savings account not found');
    if (scopesOrg(auth) && account.org_id !== auth.orgId) throw Forbidden();
    const product = Array.isArray(account.savings_products) ? account.savings_products[0] : account.savings_products;
    const amount = Number(body.amount);
    const withdrawal = ['withdrawal', 'adjustment', 'closure'].includes(body.type);
    const withdrawalLimit = Number(product?.withdrawal_limit ?? 0);
    const approvalThreshold = Number(product?.requires_manager_approval_above ?? 0);
    const approvalRequired = withdrawal && ((withdrawalLimit > 0 && amount > withdrawalLimit) || (approvalThreshold > 0 && amount > approvalThreshold));
    if (approvalRequired && auth.role !== 'branch_manager' && auth.role !== 'org_admin' && auth.role !== 'super_admin') {
      throw Forbidden('Branch Manager approval is required for this withdrawal');
    }
    if (body.reversalOf && (!body.reversalReason || !body.approvalReference)) {
      throw BadRequest('Reversal reason and approval reference are required');
    }
    const { data, error } = await supabaseAdmin.rpc('post_savings_transaction', {
      p_account_id: body.accountId,
      p_transaction_type: body.type,
      p_amount: body.amount,
      p_created_by: auth.userId,
      p_reference: body.reference ?? body.approvalReference ?? null,
      p_note: body.note ?? null,
      p_to_account_id: body.toAccountId ?? null,
      p_reversal_of: body.reversalOf ?? null,
      p_reversal_reason: body.reversalReason ?? null,
      p_approved_by: approvalRequired || body.reversalOf ? auth.userId : null,
    });
    if (error) throw error;
    res.status(201).json({ transaction: data });
  }),
);

function interestPeriod(asOf: Date, frequency: 'monthly' | 'yearly'): string {
  const year = asOf.getUTCFullYear();
  if (frequency === 'yearly') return `${year}`;
  return `${year}-${String(asOf.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function buildInterestPreview(orgId: string | null, input: { productIds?: string[]; asOf?: string; frequency: 'monthly' | 'yearly' }) {
  const asOf = input.asOf ? new Date(input.asOf) : new Date();
  let query = supabaseAdmin
    .from('savings_accounts')
    .select('id, account_number, balance, product_id, org_id, savings_products(name, interest_rate, product_type, is_active)')
    .is('deleted_at', null)
    .in('status', ['active', 'dormant']);
  if (orgId) query = query.eq('org_id', orgId);
  if (input.productIds?.length) query = query.in('product_id', input.productIds);
  const { data: accounts, error } = await query;
  if (error) throw error;
  const period = interestPeriod(asOf, input.frequency);
  const { data: posted, error: postedError } = await supabaseAdmin
    .from('savings_transactions')
    .select('account_id')
    .eq('transaction_type', 'interest')
    .eq('interest_period', period);
  if (postedError) throw postedError;
  const postedIds = new Set((posted ?? []).map((row) => row.account_id));
  return (accounts ?? []).flatMap((account) => {
    const product = Array.isArray(account.savings_products) ? account.savings_products[0] : account.savings_products;
    if (!product?.is_active || postedIds.has(account.id)) return [];
    const divisor = input.frequency === 'yearly' ? 100 : 1200;
    const amount = (Number(account.balance) * Number(product.interest_rate) / divisor).toFixed(2);
    return [{ accountId: account.id, accountNumber: account.account_number, productId: account.product_id, productName: product.name, balance: account.balance, rate: product.interest_rate, amount, period }];
  });
}

savingsRouter.post(
  '/interest/preview',
  requirePermission('savings:read'),
  validate(interestRunSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as { productIds?: string[]; asOf?: string; frequency: 'monthly' | 'yearly' };
    res.json({ items: await buildInterestPreview(auth.orgId, body) });
  }),
);

savingsRouter.post(
  '/interest/post',
  requirePermission('savings:write'),
  validate(interestRunSchema.extend({ dryRun: interestRunSchema.shape.dryRun.default(false) })),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as { productIds?: string[]; asOf?: string; frequency: 'monthly' | 'yearly'; dryRun?: boolean };
    const items = await buildInterestPreview(auth.orgId, body);
    if (body.dryRun !== false) return res.json({ dryRun: true, items });
    const posted = [];
    for (const item of items) {
      const result = await supabaseAdmin.rpc('post_savings_transaction', {
        p_account_id: item.accountId,
        p_transaction_type: 'interest',
        p_amount: item.amount,
        p_created_by: auth.userId,
        p_reference: `Interest ${item.period}`,
        p_note: `Scheduled ${body.frequency} interest posting`,
        p_interest_period: item.period,
      });
      if (result.error) throw result.error;
      posted.push(result.data);
    }
    res.json({ dryRun: false, items: posted });
  }),
);

savingsRouter.get(
  '/accounts',
  requirePermission('savings:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    let query = supabaseAdmin
      .from('savings_accounts')
      // `members` must be disambiguated: savings_accounts has TWO FKs to it
      // (member_id = the account holder, nominee_id = the nominee), so a bare
      // `members(...)` embed fails with PGRST201 instead of returning rows.
      .select(
        'id, account_number, member_id, product_id, opening_date, status, balance, nominee_id, savings_products(name, name_bn, product_type), members!savings_accounts_member_id_fkey(full_name, member_code)',
      )
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (scopesOrg(auth)) query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

savingsRouter.post(
  '/accounts',
  requirePermission('savings:write'),
  validate(accountBodySchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    if (!auth.orgId) return res.status(400).json({ error: { code: 'ORG_REQUIRED', message: 'Organization is required' } });
    const body = req.body as { branchId: string; memberId: string; productId: string; nomineeId?: string; openingBalance: string };
    const { data: product, error: productError } = await supabaseAdmin
      .from('savings_products')
      .select('maturity_months')
      .eq('id', body.productId)
      .eq('org_id', auth.orgId)
      .is('deleted_at', null)
      .single();
    if (productError) throw productError;
    const openingDate = new Date();
    const maturityDate = product.maturity_months > 0
      ? new Date(new Date(openingDate).setMonth(openingDate.getMonth() + product.maturity_months)).toISOString().slice(0, 10)
      : null;
    const { data, error } = await supabaseAdmin
      .from('savings_accounts')
      .insert({
        org_id: auth.orgId,
        branch_id: body.branchId,
        member_id: body.memberId,
        product_id: body.productId,
        nominee_id: body.nomineeId ?? null,
        balance: body.openingBalance,
        opening_date: openingDate.toISOString().slice(0, 10),
        maturity_date: maturityDate,
        account_number: `SA-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        created_by: auth.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ account: data });
  }),
);

/* ── Dividends (share capital) ─────────────────────────────────────────────
 * The demo router already served these; the live router did not, so the
 * Shares page 404'd against a real database. */

savingsRouter.get(
  '/dividends',
  requirePermission('savings:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    let query = supabaseAdmin.from('dividend_declarations').select('*').order('created_at', { ascending: false });
    if (scopesOrg(auth)) query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

savingsRouter.get(
  '/dividends/preview',
  requirePermission('savings:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const productId = String(req.query['productId'] ?? '');
    if (!productId) throw BadRequest('productId is required');
    const surplus = String(req.query['surplus'] ?? '0');
    const payoutRate = Number(req.query['payoutRate'] ?? 0);
    const { faceValue, perMember } = await paidSharesByMember(productId, auth.orgId);
    res.json(dividendPreviewWire(perMember, surplus, payoutRate, faceValue));
  }),
);

savingsRouter.post(
  '/dividends',
  requirePermission('savings:write'),
  validate(dividendBodySchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    if (!auth.orgId) throw BadRequest('Organization is required');
    const body = req.body as {
      productId: string;
      financialYear: string;
      surplus: string;
      payoutRate: number;
      approvedByMeetingRef: string;
      approvedAt: string;
    };

    // One declaration per product per financial year (parity with demo mode).
    const { data: existing } = await supabaseAdmin
      .from('dividend_declarations')
      .select('id')
      .eq('org_id', auth.orgId)
      .eq('product_id', body.productId)
      .eq('financial_year', body.financialYear)
      .maybeSingle();
    if (existing) throw Conflict('এই পণ্য ও অর্থবছরের জন্য লভ্যাংশ ইতিমধ্যে ঘোষিত / A declaration already exists for this product and financial year');

    const { faceValue, perMember } = await paidSharesByMember(body.productId, auth.orgId);
    const preview = dividendPreviewWire(perMember, body.surplus, body.payoutRate, faceValue);
    const pool = preview.dividendPool;
    const retained = (Number(body.surplus) - Number(pool)).toFixed(2);

    const { data: declaration, error } = await supabaseAdmin
      .from('dividend_declarations')
      .insert({
        org_id: auth.orgId,
        product_id: body.productId,
        financial_year: body.financialYear,
        surplus: Number(body.surplus).toFixed(2),
        payout_rate: body.payoutRate.toFixed(2),
        dividend_pool: pool,
        retained,
        approved_by_meeting_ref: body.approvedByMeetingRef,
        approved_at: body.approvedAt,
        status: 'approved',
        approved_by: auth.userId,
        created_by: auth.userId,
      })
      .select('*')
      .single();
    if (error) throw error;

    // Materialize per-member payments prorated by paid-up share capital.
    const payments = preview.perMember
      .filter((m) => Number(m.amount) > 0)
      .map((m) => ({
        org_id: auth.orgId,
        declaration_id: declaration.id,
        member_id: m.memberId,
        paid_shares: m.paidShares,
        face_value: faceValue,
        amount: m.amount,
        created_by: auth.userId,
      }));
    if (payments.length > 0) {
      const { error: payErr } = await supabaseAdmin.from('dividend_payments').insert(payments);
      if (payErr) throw payErr;
    }

    res.status(201).json({ declaration, preview });
  }),
);

/* ── Passbook statement ──────────────────────────────────────────────────── */

savingsRouter.get(
  '/passbook',
  requirePermission('savings:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const parsed = passbookQuerySchema.safeParse({
      accountId: String(req.query['accountId'] ?? ''),
      from: String(req.query['from'] ?? ''),
      to: String(req.query['to'] ?? ''),
    });
    if (!parsed.success) throw BadRequest('accountId, from (YYYY-MM-DD) and to are required');
    const { accountId, from, to } = parsed.data;

    // Disambiguated embeds: the holder and the nominee are both members.
    const { data: account, error } = await supabaseAdmin
      .from('savings_accounts')
      .select(
        'id, account_number, member_id, status, balance, product_id, members!savings_accounts_member_id_fkey(full_name, member_code), savings_products(name, name_bn), branches(name)',
      )
      .eq('id', accountId)
      .maybeSingle();
    if (error) throw error;
    if (!account) throw NotFound('সঞ্চয় হিসাব পাওয়া যায়নি / Savings account not found');
    if (scopesOrg(auth)) {
      // Scope the statement to the caller's org by re-reading with the filter.
      const { data: scoped } = await supabaseAdmin
        .from('savings_accounts')
        .select('id')
        .eq('id', accountId)
        .eq('org_id', auth.orgId)
        .maybeSingle();
      if (!scoped) throw NotFound('সঞ্চয় হিসাব পাওয়া যায়নি / Savings account not found');
    }

    const { data: txns, error: txErr } = await supabaseAdmin
      .from('savings_transactions')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true });
    if (txErr) throw txErr;

    const lines: PassbookLine[] = (txns ?? []).map((t) => ({
      id: t.id,
      date: t.created_at,
      type: t.transaction_type,
      deposit: ['deposit', 'interest'].includes(t.transaction_type) ? t.amount : '0.00',
      withdrawal: ['withdrawal', 'adjustment', 'closure', 'transfer'].includes(t.transaction_type) ? t.amount : '0.00',
      balanceAfter: t.balance_after,
      reference: t.reference,
      note: t.note,
    }));

    const a = account as unknown as {
      id: string;
      account_number: string;
      status: string;
      balance: string;
      members: { full_name: string; member_code: string | null } | null;
      savings_products: { name: string; name_bn: string | null } | null;
      branches: { name: string } | null;
    };
    const { data: org } = await supabaseAdmin.from('organizations').select('name').eq('id', auth.orgId ?? '').maybeSingle();

    res.json({
      statement: computeStatement(
        {
          id: a.id,
          accountNumber: a.account_number,
          memberName: a.members?.full_name ?? '—',
          memberNameBn: null,
          memberCode: a.members?.member_code ?? '',
          productName: a.savings_products?.name ?? '—',
          productNameBn: a.savings_products?.name_bn ?? null,
          branchName: a.branches?.name ?? '—',
          orgName: org?.name ?? '—',
          status: a.status as 'active' | 'dormant' | 'frozen' | 'closed',
        },
        from,
        to,
        lines,
        a.balance,
      ),
    });
  }),
);

/* ── Reconciliation (stored balance vs ledger movement) ──────────────────── */

savingsRouter.get(
  '/reconciliation/runs',
  requirePermission('savings:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    let query = supabaseAdmin
      .from('reconciliation_runs')
      .select('id, run_at, checked, mismatches, created_by')
      .order('run_at', { ascending: false })
      .limit(10);
    if (scopesOrg(auth)) query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

savingsRouter.post(
  '/reconciliation/run',
  requirePermission('savings:read'),
  validate(reconciliationBodySchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as { accountId?: string };

    let accQuery = supabaseAdmin.from('savings_accounts').select('id, account_number, balance').is('deleted_at', null);
    if (scopesOrg(auth)) accQuery = accQuery.eq('org_id', auth.orgId);
    if (body.accountId) accQuery = accQuery.eq('id', body.accountId);
    const { data: accounts, error } = await accQuery;
    if (error) throw error;

    const ids = (accounts ?? []).map((a) => a.id);
    const signed = new Map<string, number>();
    let movement: Array<{ account_id: string; to_account_id: string | null; transaction_type: string; amount: string; created_at: string }> = [];
    if (ids.length > 0) {
      const { data: txns, error: txErr } = await supabaseAdmin
        .from('savings_transactions')
        .select('account_id, to_account_id, transaction_type, amount, created_at')
        .in('account_id', ids)
        .order('created_at', { ascending: true });
      if (txErr) throw txErr;
      movement = (txns ?? []) as typeof movement;
      for (const t of movement) {
        const prev = signed.get(t.account_id) ?? 0;
        signed.set(t.account_id, prev + (['withdrawal', 'closure', 'transfer'].includes(t.transaction_type) ? -Number(t.amount) : Number(t.amount)));
      }
    }

    const results = (accounts ?? []).map((a) => {
      const stored = Number(a.balance);
      const ledger = (signed.get(a.id) ?? 0).toFixed(2);
      const rows = movement.filter((m) => m.account_id === a.id);
      return {
        accountId: a.id,
        accountNumber: a.account_number,
        storedBalance: stored.toFixed(2),
        ledgerBalance: ledger,
        difference: (stored - Number(ledger)).toFixed(2),
        entryCount: rows.length,
        lastEntryAt: rows.at(-1)?.created_at ?? null,
        status: stored === Number(ledger) ? ('ok' as const) : ('mismatch' as const),
      };
    });

    const mismatches = results.filter((r) => r.status === 'mismatch').length;
    const { error: runErr } = await supabaseAdmin.from('reconciliation_runs').insert({
      org_id: auth.orgId,
      run_at: new Date().toISOString(),
      checked: results.length,
      mismatches,
      results,
      created_by: auth.userId,
    });
    if (runErr) throw runErr;

    res.json({ runAt: new Date().toISOString(), checked: results.length, mismatches, results });
  }),
);
