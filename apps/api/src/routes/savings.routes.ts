import { Router } from 'express';
import { savingsAccountCreateSchema, savingsProductCreateSchema } from '@samity/shared';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

const productBodySchema = savingsProductCreateSchema.omit({ orgId: true });
const accountBodySchema = savingsAccountCreateSchema.omit({ orgId: true });

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
