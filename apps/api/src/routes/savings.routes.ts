import { Router } from 'express';
import {
  interestRunSchema,
  savingsAccountCreateSchema,
  savingsProductCreateSchema,
  savingsTxCreateSchema,
} from '@samity/shared';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

const productBodySchema = savingsProductCreateSchema.omit({ orgId: true });
const accountBodySchema = savingsAccountCreateSchema.omit({ orgId: true });
const transactionBodySchema = savingsTxCreateSchema;

export const savingsRouter = Router();
savingsRouter.use(requireAuth);

savingsRouter.get(
  '/products',
  requirePermission('savings:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    let query = supabaseAdmin.from('savings_products').select('*').is('deleted_at', null).order('name');
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
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

savingsRouter.get(
  '/accounts/:id/transactions',
  requirePermission('savings:read'),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('savings_transactions')
      .select('*')
      .eq('account_id', req.params['id'])
      .order('created_at', { ascending: false });
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
    if (auth.orgId && auth.role !== 'super_admin' && account.org_id !== auth.orgId) throw Forbidden();
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
      .select('id, account_number, member_id, product_id, opening_date, status, balance, nominee_id, savings_products(name, name_bn, product_type), members(full_name, member_code)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
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
