import { Router } from 'express';
import {
  CASH_MODES,
  DISBURSEMENT_CHECKS,
  DISBURSEMENT_CHECK_LABELS_BN,
  computeDisbursementSchedule,
  disbursementCreateSchema,
  disbursementUpdateSchema,
  holidayUpsertSchema,
  loanApplicationCreateSchema,
  loanDecisionSchema,
  loanPolicyUpdateSchema,
  loanProductCreateSchema,
  loanStepDoneSchema,
  validateRateAgainstCap,
  type DisbursementCheckItem,
  type DisbursementMode,
  type Holiday,
} from '@samity/shared';
import { AppError, BadRequest, Conflict, Forbidden, NotFound } from '../lib/errors.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

export const loansRouter = Router();
loansRouter.use(requireAuth);

// ── Policy ──────────────────────────────────────────────────────────────────
loansRouter.get(
  '/policy',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    let query = supabaseAdmin.from('loan_policies').select('*').limit(1);
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    const row = data?.[0];
    if (!row) throw NotFound('Loan policy not configured for this organization');
    res.json({
      orgId: row.org_id,
      rateCapPercent: Number(row.rate_cap_percent),
      bmApprovalLimitBdt: String(row.bm_approval_limit_bdt),
      guarantorsRequired: row.guarantors_required,
      maxActiveLoansPerMember: row.max_active_loans_per_member,
      minDaysBetweenLoans: row.min_days_between_loans,
      updatedAt: row.updated_at,
    });
  }),
);

loansRouter.patch(
  '/policy',
  requirePermission('loan:write'),
  validate(loanPolicyUpdateSchema.partial()),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    if (!auth.orgId) throw BadRequest('Organization is required');
    const body = req.body as Partial<{ rateCapPercent: number; bmApprovalLimitBdt: string; guarantorsRequired: number; maxActiveLoansPerMember: number; minDaysBetweenLoans: number }>;
    const { data, error } = await supabaseAdmin
      .from('loan_policies')
      .upsert(
        {
          org_id: auth.orgId,
          ...(body.rateCapPercent !== undefined ? { rate_cap_percent: body.rateCapPercent } : {}),
          ...(body.bmApprovalLimitBdt !== undefined ? { bm_approval_limit_bdt: body.bmApprovalLimitBdt } : {}),
          ...(body.guarantorsRequired !== undefined ? { guarantors_required: body.guarantorsRequired } : {}),
          ...(body.maxActiveLoansPerMember !== undefined ? { max_active_loans_per_member: body.maxActiveLoansPerMember } : {}),
          ...(body.minDaysBetweenLoans !== undefined ? { min_days_between_loans: body.minDaysBetweenLoans } : {}),
          updated_by: auth.userId,
        },
        { onConflict: 'org_id' },
      )
      .select('*')
      .single();
    if (error) throw error;
    res.json({
      orgId: data.org_id,
      rateCapPercent: Number(data.rate_cap_percent),
      bmApprovalLimitBdt: String(data.bm_approval_limit_bdt),
      guarantorsRequired: data.guarantors_required,
      maxActiveLoansPerMember: data.max_active_loans_per_member,
      minDaysBetweenLoans: data.min_days_between_loans,
      updatedAt: data.updated_at,
    });
  }),
);

// ── Rate cap live check ─────────────────────────────────────────────────────
loansRouter.post(
  '/rate-check',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as { interestRate?: number; interestMethod?: 'declining_balance' | 'flat' };
    const { data, error } = await supabaseAdmin
      .from('loan_policies')
      .select('rate_cap_percent')
      .eq('org_id', auth.orgId ?? '')
      .maybeSingle();
    if (error) throw error;
    const cap = Number(data?.rate_cap_percent ?? 27);
    try {
      validateRateAgainstCap(
        { interestRate: Number(body.interestRate ?? 0), interestMethod: body.interestMethod ?? 'declining_balance' },
        cap,
      );
      res.json({ ok: true, cap });
    } catch (err) {
      res.status(422).json({ ok: false, cap, message: err instanceof Error ? err.message : 'Rate cap exceeded' });
    }
  }),
);

// ── Product catalog ─────────────────────────────────────────────────────────
loansRouter.get(
  '/products',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    let query = supabaseAdmin.from('loan_products').select('*').is('deleted_at', null).order('code');
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

loansRouter.post(
  '/products',
  requirePermission('loan:write'),
  validate(loanProductCreateSchema.omit({ orgId: true })),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    if (!auth.orgId) throw BadRequest('Organization is required');
    const body = req.body as Record<string, unknown>;
    const capRow = await supabaseAdmin
      .from('loan_policies')
      .select('rate_cap_percent')
      .eq('org_id', auth.orgId)
      .maybeSingle();
    if (capRow.error) throw capRow.error;
    const cap = Number(capRow.data?.rate_cap_percent ?? 27);
    try {
      validateRateAgainstCap(
        { interestRate: Number(body.interestRate), interestMethod: body.interestMethod as 'declining_balance' | 'flat' },
        cap,
      );
    } catch (err) {
      throw new AppError(422, 'VALIDATION_ERROR', err instanceof Error ? err.message : 'Rate cap exceeded');
    }
    const { data, error } = await supabaseAdmin
      .from('loan_products')
      .insert({
        org_id: auth.orgId,
        code: body.code,
        name: body.name,
        name_bn: body.nameBn ?? null,
        product_type: body.productType,
        min_amount: body.minAmount,
        max_amount: body.maxAmount,
        term_months: body.termMonths,
        installment_frequency: body.installmentFrequency,
        interest_method: body.interestMethod,
        interest_rate: body.interestRate,
        service_charge: body.serviceCharge,
        processing_fee_rate: body.processingFeeRate,
        insurance_premium_rate: body.insurancePremiumRate,
        grace_period_installments: body.gracePeriodInstallments,
        eligibility_note: body.eligibilityNote ?? null,
        required_documents: body.requiredDocuments,
        guarantors_required: body.guarantorsRequired,
        guarantor_min_relationship: body.guarantorMinRelationship ?? null,
        is_active: body.isActive,
        created_by: auth.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ product: data });
  }),
);

// ── Applications ────────────────────────────────────────────────────────────
loansRouter.get(
  '/applications',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    let query = supabaseAdmin.from('loan_applications').select('*').is('deleted_at', null).order('created_at', { ascending: false });
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
    if (auth.branchId && ['branch_manager', 'account_officer'].includes(auth.role)) {
      query = query.eq('branch_id', auth.branchId);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

loansRouter.post(
  '/applications',
  requirePermission('loan:write'),
  validate(loanApplicationCreateSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as {
      memberId: string;
      productId: string;
      requestedAmount: string;
      purpose: string;
      termMonths?: number;
      requestedAt?: string;
    };
    if (!auth.branchId) throw BadRequest('Branch assignment is required to file an application');

    const { data: product, error: productError } = await supabaseAdmin
      .from('loan_products')
      .select('id, org_id, min_amount, max_amount, term_months, is_active')
      .eq('id', body.productId)
      .is('deleted_at', null)
      .single();
    if (productError || !product) throw NotFound('Loan product not found');
    if (!product.is_active) throw Conflict('Loan product is inactive');
    const amount = Number(body.requestedAmount);
    if (amount < Number(product.min_amount) || amount > Number(product.max_amount)) {
      throw Conflict(`Amount must be between ৳${product.min_amount} and ৳${product.max_amount}`);
    }

    // Policy guard: active applications per member.
    const { count, error: countError } = await supabaseAdmin
      .from('loan_applications')
      .select('id', { count: 'exact', head: true })
      .eq('member_id', body.memberId)
      .not('status', 'in', '(rejected,closed)')
      .is('deleted_at', null);
    if (countError) throw countError;
    const { data: policy } = await supabaseAdmin
      .from('loan_policies')
      .select('max_active_loans_per_member')
      .eq('org_id', product.org_id)
      .maybeSingle();
    const maxActive = policy?.max_active_loans_per_member ?? 2;
    if ((count ?? 0) >= maxActive) {
      throw Conflict(`Member already has ${count} active loan applications (policy max ${maxActive})`);
    }

    const { data: branchRow, error: branchError } = await supabaseAdmin
      .from('branches')
      .select('code')
      .eq('id', auth.branchId)
      .single();
    if (branchError) throw branchError;
    const seq = await supabaseAdmin.rpc('next_loan_seq', { p_branch: auth.branchId });
    if (seq.error) throw seq.error;
    const applicationNumber = `LO-${branchRow?.code ?? 'BRANCH'}-${String(Number(seq.data ?? 0)).padStart(4, '0')}`;

    const { data, error } = await supabaseAdmin
      .from('loan_applications')
      .insert({
        org_id: product.org_id,
        branch_id: auth.branchId,
        member_id: body.memberId,
        product_id: body.productId,
        application_number: applicationNumber,
        requested_amount: amount.toFixed(2),
        purpose: body.purpose,
        term_months: body.termMonths ?? product.term_months,
        status: 'submitted',
        created_by: auth.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ application: data });
  }),
);

loansRouter.get(
  '/applications/:id',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('loan_applications')
      .select('*, loan_application_steps(*)')
      .eq('id', req.params['id'])
      .is('deleted_at', null)
      .single();
    if (error || !data) throw NotFound('Loan application not found');
    res.json(data);
  }),
);

// ── Wizard steps ────────────────────────────────────────────────────────────
loansRouter.post(
  '/applications/:id/steps',
  requirePermission('loan:write'),
  validate(loanStepDoneSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as { stage: string; note?: string; payload?: Record<string, unknown> };
    const { data: app, error: appError } = await supabaseAdmin
      .from('loan_applications')
      .select('id, org_id, status, requested_amount, branch_id')
      .eq('id', req.params['id'])
      .is('deleted_at', null)
      .single();
    if (appError || !app) throw NotFound('Loan application not found');
    if (['approved', 'rejected', 'disbursed', 'closed'].includes(app.status)) {
      throw Conflict(`Application already decided (${app.status})`);
    }
    if (body.stage === 'member_request') throw Conflict('member_request is recorded automatically on submission');
    if (body.stage === 'decision') throw Conflict('Use the decision endpoint to approve or reject');

    const roleByStage: Record<string, string> = {
      officer_visit: 'account_officer',
      household_check: 'account_officer',
      guarantor: 'account_officer',
      bm_review: 'branch_manager',
      am_review: 'area_manager',
    };
    const expectedRole = roleByStage[body.stage];
    if (!expectedRole) throw BadRequest('Unknown stage');
    if (auth.role !== 'super_admin' && auth.role !== expectedRole) {
      throw Forbidden(`Stage ${body.stage} requires role ${expectedRole}`);
    }
    if ((body.stage === 'bm_review' && app.status !== 'bm_review') || (body.stage === 'am_review' && app.status !== 'am_review')) {
      throw Conflict(`Stage ${body.stage} is not pending (status: ${app.status})`);
    }
    if (body.stage === 'guarantor' && !body.payload?.['guarantor']) {
      throw BadRequest('Guarantor details are required for the guarantor step');
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('loan_application_steps')
      .select('id')
      .eq('application_id', app.id)
      .eq('stage', body.stage)
      .eq('action', 'done')
      .limit(1);
    if (existingError) throw existingError;
    if (existing && existing.length > 0) throw Conflict(`Stage ${body.stage} already completed`);

    const { data, error } = await supabaseAdmin
      .from('loan_application_steps')
      .insert({
        application_id: app.id,
        org_id: app.org_id,
        branch_id: app.branch_id,
        stage: body.stage,
        action: 'done',
        actor_role: expectedRole,
        actor_id: auth.userId,
        note: body.note ?? null,
        payload: body.payload ?? null,
      })
      .select('*')
      .single();
    if (error) throw error;

    // Advance the status machine (mirrors the demo store).
    const officerStages = ['officer_visit', 'household_check', 'guarantor'];
    if (officerStages.includes(body.stage)) {
      const { data: doneSteps } = await supabaseAdmin
        .from('loan_application_steps')
        .select('stage')
        .eq('application_id', app.id)
        .eq('action', 'done');
      const doneStages = new Set((doneSteps ?? []).map((s) => s.stage));
      const doneOfficer = officerStages.filter((s) => doneStages.has(s));
      const { data: policy } = await supabaseAdmin
        .from('loan_policies')
        .select('bm_approval_limit_bdt')
        .eq('org_id', app.org_id)
        .maybeSingle();
      const bmLimit = String(policy?.bm_approval_limit_bdt ?? '100000.00');
      const needsArea = Number(app.requested_amount) > Number(bmLimit);
      let next: string | null = null;
      if (doneOfficer.length === 1) next = 'officer_review';
      if (doneOfficer.length === officerStages.length) next = 'bm_review';
      if (next) {
        await supabaseAdmin.from('loan_applications').update({ status: next }).eq('id', app.id);
      }
    }

    res.status(201).json({ step: data });
  }),
);

// ── Decision ────────────────────────────────────────────────────────────────
loansRouter.post(
  '/applications/:id/decision',
  requirePermission('loan:write'),
  validate(loanDecisionSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const body = req.body as { decision: 'approve' | 'reject'; reason?: string };
    if (auth.role !== 'super_admin' && !['branch_manager', 'area_manager'].includes(auth.role)) {
      throw Forbidden('Only branch or area managers decide applications');
    }
    const { data: app, error: appError } = await supabaseAdmin
      .from('loan_applications')
      .select('id, org_id, status, requested_amount, branch_id, member_id, product_id')
      .eq('id', req.params['id'])
      .is('deleted_at', null)
      .single();
    if (appError || !app) throw NotFound('Loan application not found');
    if (!['bm_review', 'am_review'].includes(app.status)) {
      throw Conflict(`Application is not awaiting a decision (status: ${app.status})`);
    }
    if (body.decision === 'reject' && !body.reason) throw BadRequest('A reason is required to reject an application');
    if (body.decision === 'approve' && app.status === 'bm_review') {
      const { data: policy } = await supabaseAdmin
        .from('loan_policies')
        .select('bm_approval_limit_bdt')
        .eq('org_id', app.org_id)
        .maybeSingle();
      if (Number(app.requested_amount) > Number(policy?.bm_approval_limit_bdt ?? '100000.00')) {
        throw Conflict('Amount exceeds the branch manager approval limit — area manager approval required');
      }
    }
    if (body.decision === 'approve' && app.status === 'am_review' && auth.role !== 'super_admin' && auth.role !== 'area_manager') {
      throw Forbidden('Area manager approval required at this stage');
    }

    const now = new Date().toISOString();
    const { error: stepError } = await supabaseAdmin.from('loan_application_steps').insert({
      application_id: app.id,
      org_id: app.org_id,
      branch_id: app.branch_id,
      stage: 'decision',
      action: body.decision === 'approve' ? 'approved' : 'rejected',
      actor_role: auth.role,
      actor_id: auth.userId,
      note: body.reason ?? null,
      payload: null,
    });
    if (stepError) throw stepError;

    const { data, error } = await supabaseAdmin
      .from('loan_applications')
      .update({
        status: body.decision === 'approve' ? 'approved' : 'rejected',
        decision_reason: body.decision === 'reject' ? (body.reason ?? null) : null,
        decided_by: auth.userId,
        decided_at: now,
      })
      .eq('id', app.id)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  }),
);

// ── Repayment schedule ──────────────────────────────────────────────────────
loansRouter.get(
  '/applications/:id/schedule',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const { data: app, error: appError } = await supabaseAdmin
      .from('loan_applications')
      .select('requested_amount, term_months, loan_products(interest_rate, interest_method, installment_frequency, grace_period_installments)')
      .eq('id', req.params['id'])
      .is('deleted_at', null)
      .single();
    if (appError || !app) throw NotFound('Loan application not found');
    const product = app.loan_products as unknown as {
      interest_rate: string | number;
      interest_method: 'declining_balance' | 'flat';
      installment_frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
      grace_period_installments: number;
    } | null;
    if (!product) throw NotFound('Loan product not found');
    const { computeLoanSchedule } = await import('@samity/shared');
    res.json(
      computeLoanSchedule({
        principal: String(app.requested_amount),
        annualRatePercent: Number(product.interest_rate),
        method: product.interest_method,
        termMonths: app.term_months,
        frequency: product.installment_frequency,
        gracePeriodInstallments: product.grace_period_installments,
      }),
    );
  }),
);

// ── Pipeline buckets ────────────────────────────────────────────────────────
loansRouter.get(
  '/pipeline',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    let query = supabaseAdmin.from('loan_applications').select('status, requested_amount').is('deleted_at', null);
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    const buckets = new Map<string, { count: number; total: number }>();
    for (const row of data ?? []) {
      const b = buckets.get(row.status) ?? { count: 0, total: 0 };
      b.count += 1;
      b.total += Number(row.requested_amount);
      buckets.set(row.status, b);
    }
    res.json({
      items: [...buckets.entries()].map(([status, b]) => ({
        status,
        count: b.count,
        totalAmount: b.total.toFixed(2),
      })),
    });
  }),
);
// ── Disbursement: queue, record, checks, execute, stored schedule ───────────
// Real-Supabase parity for loans.demo.routes.ts. Uses loan_disbursements,
// loan_repayment_schedule, loan_holidays and branch_cash_limits (0016/0017).

loansRouter.get(
  '/disbursements/queue',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    let query = supabaseAdmin
      .from('loan_applications')
      .select('id, application_number, org_id, branch_id, member_id, requested_amount, product_id, decided_at')
      .eq('status', 'approved')
      .is('deleted_at', null);
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
    if (auth.branchId && ['branch_manager', 'account_officer'].includes(auth.role)) {
      query = query.eq('branch_id', auth.branchId);
    }
    const branchId = (req.query['branchId'] as string | undefined) || null;
    if (branchId) query = query.eq('branch_id', branchId);
    const { data: apps, error } = await query;
    if (error) throw error;

    const appIds = (apps ?? []).map((a) => a.id);
    const { data: recs } = appIds.length
      ? await supabaseAdmin.from('loan_disbursements').select('*').in('application_id', appIds)
      : { data: [] };
    const recByApp = new Map((recs ?? []).map((r) => [r.application_id, r]));
    const productIds = [...new Set((apps ?? []).map((a) => a.product_id))];
    const { data: products } = productIds.length
      ? await supabaseAdmin.from('loan_products').select('id, name, name_bn').in('id', productIds)
      : { data: [] };
    const productById = new Map((products ?? []).map((p) => [p.id, p]));

    const items = (apps ?? []).map((a) => {
      const rec = recByApp.get(a.id);
      const checks = (rec?.checks ?? []) as Array<{ check: string; done: boolean }>;
      const done = checks.filter((c) => c.done).length;
      const total = 6; // DISBURSEMENT_CHECKS.length
      const product = productById.get(a.product_id);
      return {
        applicationId: a.id,
        applicationNumber: a.application_number,
        branchId: a.branch_id,
        samityId: rec?.samity_id ?? null,
        samityName: null as string | null,
        memberId: a.member_id,
        memberName: null as string | null, // resolved client-side or via members API
        memberCode: null as string | null,
        productName: product?.name ?? null,
        productNameBn: product?.name_bn ?? null,
        amount: a.requested_amount,
        plannedDate: rec?.planned_date ?? null,
        checksDone: done,
        checksTotal: total,
        ready: done === total,
        approvedAt: a.decided_at ?? null,
      };
    });
    res.json({ items });
  }),
);

loansRouter.get(
  '/disbursements/:applicationId',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const applicationId = req.params['applicationId'] as string;
    const { data: app } = await supabaseAdmin
      .from('loan_applications')
      .select('id, status, requested_amount')
      .eq('id', applicationId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!app) throw NotFound('Loan application not found');
    const { data: rec } = await supabaseAdmin
      .from('loan_disbursements')
      .select('*')
      .eq('application_id', applicationId)
      .maybeSingle();
    res.json({ disbursement: rec ?? null, application: app, checkLabels: DISBURSEMENT_CHECK_LABELS_BN });
  }),
);

loansRouter.patch(
  '/disbursements/:applicationId',
  requirePermission('loan:write'),
  validate(disbursementUpdateSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const applicationId = req.params['applicationId'] as string;
    const { data: app } = await supabaseAdmin
      .from('loan_applications')
      .select('id, org_id, branch_id, status')
      .eq('id', applicationId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!app) throw NotFound('Loan application not found');
    if (app.status !== 'approved') {
      throw Conflict(`Only approved applications can be prepared for disbursement (status: ${app.status})`);
    }
    const body = req.body as { plannedDate?: string; checkItems?: DisbursementCheckItem[]; note?: string };
    const { data: existing } = await supabaseAdmin
      .from('loan_disbursements')
      .select('id, checks')
      .eq('application_id', applicationId)
      .maybeSingle();
    const checks = ((existing?.checks ?? []) as DisbursementCheckItem[]).slice();
    for (const item of body.checkItems ?? []) {
      const idx = checks.findIndex((c) => c.check === item.check);
      if (idx >= 0) checks[idx] = item;
      else checks.push(item);
    }
    const values = {
      org_id: app.org_id,
      branch_id: app.branch_id,
      application_id: applicationId,
      checks,
      planned_date: body.plannedDate ?? null,
      note: body.note ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = existing
      ? await supabaseAdmin.from('loan_disbursements').update(values).eq('id', existing.id).select().single()
      : await supabaseAdmin.from('loan_disbursements').insert({ ...values, created_by: auth.userId }).select().single();
    if (error) throw error;
    res.json(data);
  }),
);

loansRouter.post(
  '/disbursements/:applicationId/execute',
  requirePermission('loan:write'),
  validate(disbursementCreateSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const applicationId = req.params['applicationId'] as string;
    const body = req.body as {
      mode: DisbursementMode;
      disbursementDate?: string;
      checkItems: DisbursementCheckItem[];
      mfsReference?: string;
      bankReference?: string;
      cashReceivedByName?: string;
      actualUserOfFunds?: string;
      actualUserRelation?: string;
      note?: string;
      branchCashLimitBdt?: string;
      cashAvailableBdt?: string;
    };

    const { data: app } = await supabaseAdmin
      .from('loan_applications')
      .select('id, org_id, branch_id, status, requested_amount, product_id, term_months')
      .eq('id', applicationId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!app) throw NotFound('Loan application not found');
    if (app.status !== 'approved') {
      throw Conflict(`Only approved applications can be disbursed (status: ${app.status})`);
    }

    // All six checks must be recorded as done (defense in depth; the DB
    // trigger enforces the same on write).
    for (const c of DISBURSEMENT_CHECKS) {
      const item = body.checkItems.find((i) => i.check === c);
      if (!item?.done) throw Conflict(`Pre-disbursement check not completed: ${c}`);
    }

    const disbursementDate = body.disbursementDate ?? new Date().toISOString().slice(0, 10);

    // Branch cash limit for cash modes.
    if (CASH_MODES.includes(body.mode)) {
      const { data: limitRow } = await supabaseAdmin
        .from('branch_cash_limits')
        .select('cash_limit')
        .eq('branch_id', app.branch_id)
        .maybeSingle();
      const limit = Number(body.branchCashLimitBdt ?? limitRow?.cash_limit ?? 0);
      const { data: todaysCash } = await supabaseAdmin
        .from('loan_disbursements')
        .select('application_id')
        .eq('branch_id', app.branch_id)
        .eq('status', 'completed')
        .eq('disbursement_date', disbursementDate)
        .in('mode', ['cash_branch', 'cash_center']);
      let outToday = 0;
      for (const row of todaysCash ?? []) {
        if (row.application_id === applicationId) continue;
        const { data: other } = await supabaseAdmin
          .from('loan_applications')
          .select('requested_amount')
          .eq('id', row.application_id)
          .maybeSingle();
        outToday += Number(other?.requested_amount ?? 0);
      }
      if (body.cashAvailableBdt !== undefined && Number(body.cashAvailableBdt) < Number(app.requested_amount)) {
        throw Conflict(`Recorded available cash ৳${body.cashAvailableBdt} is less than the payout ৳${app.requested_amount}`);
      }
      if (outToday + Number(app.requested_amount) > limit) {
        throw Conflict(
          `Branch cash limit exceeded: ৳${outToday.toFixed(2)} already out today + ৳${Number(app.requested_amount).toFixed(2)} requested > ৳${limit.toFixed(2)} limit`,
        );
      }
    }

    // Holiday-aware schedule: computed once, stored forever.
    const { data: product } = await supabaseAdmin
      .from('loan_products')
      .select('interest_rate, interest_method, installment_frequency, grace_period_installments')
      .eq('id', app.product_id)
      .maybeSingle();
    const { data: holidayRows } = await supabaseAdmin
      .from('loan_holidays')
      .select('date, name, name_bn, is_recurring')
      .eq('org_id', app.org_id);
    const holidays: Holiday[] = (holidayRows ?? []).map((h) => ({
      date: h.date,
      name: h.name,
      nameBn: h.name_bn ?? undefined,
      isRecurring: h.is_recurring,
    }));
    const schedule = computeDisbursementSchedule({
      principal: app.requested_amount,
      annualRatePercent: product?.interest_rate ?? 0,
      method: product?.interest_method ?? 'declining_balance',
      termMonths: app.term_months ?? 0,
      frequency: product?.installment_frequency ?? 'monthly',
      gracePeriodInstallments: product?.grace_period_installments ?? 0,
      disbursementDate: new Date(`${disbursementDate}T00:00:00Z`),
      holidays,
      holidayAction: 'shift_forward',
    });

    const disbursementValues = {
      org_id: app.org_id,
      branch_id: app.branch_id,
      application_id: applicationId,
      status: 'completed' as const,
      mode: body.mode,
      disbursement_date: disbursementDate,
      checks: body.checkItems,
      mfs_reference: body.mfsReference ?? null,
      bank_reference: body.bankReference ?? null,
      cash_received_by_name: body.cashReceivedByName ?? null,
      actual_user_of_funds: body.actualUserOfFunds ?? null,
      actual_user_relation: body.actualUserRelation ?? null,
      note: body.note ?? null,
      disbursed_by: auth.userId,
      disbursed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data: existingRec } = await supabaseAdmin
      .from('loan_disbursements')
      .select('id, status')
      .eq('application_id', applicationId)
      .maybeSingle();
    if (existingRec?.status === 'completed') throw Conflict('This loan has already been disbursed');
    const { data: rec, error: recError } = existingRec
      ? await supabaseAdmin.from('loan_disbursements').update(disbursementValues).eq('id', existingRec.id).select().single()
      : await supabaseAdmin.from('loan_disbursements').insert({ ...disbursementValues, created_by: auth.userId }).select().single();
    if (recError) throw recError;

    // Store the schedule rows (unique per application+seq; wipe a partial
    // attempt first so the execute is idempotent on retry after failure).
    await supabaseAdmin.from('loan_repayment_schedule').delete().eq('application_id', applicationId);
    const { error: schedError } = await supabaseAdmin.from('loan_repayment_schedule').insert(
      schedule.rows.map((r) => ({
        org_id: app.org_id,
        application_id: applicationId,
        seq: r.seq,
        original_due_date: r.originalDueDate,
        due_date: r.dueDate,
        shifted: r.shifted,
        shift_reason: r.shiftReason,
        principal: r.principal,
        interest: r.interest,
        total: r.total,
        balance_after: r.balanceAfter,
        created_by: auth.userId,
      })),
    );
    if (schedError) throw schedError;

    // Flip the application to disbursed (the DB trigger also guards this).
    const { error: appError } = await supabaseAdmin
      .from('loan_applications')
      .update({ status: 'disbursed', updated_at: new Date().toISOString() })
      .eq('id', applicationId)
      .eq('status', 'approved');
    if (appError) throw appError;

    res.status(201).json({ disbursement: rec, schedule: schedule.rows, shiftedCount: schedule.shiftedCount });
  }),
);

loansRouter.get(
  '/disbursements/:applicationId/schedule',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const applicationId = req.params['applicationId'] as string;
    const { data, error } = await supabaseAdmin
      .from('loan_repayment_schedule')
      .select('*')
      .eq('application_id', applicationId)
      .order('seq');
    if (error) throw error;
    res.json({ items: data ?? [], stored: (data ?? []).length > 0 });
  }),
);

// ── Holiday calendar ────────────────────────────────────────────────────────
loansRouter.get(
  '/holidays',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    let query = supabaseAdmin.from('loan_holidays').select('*').order('date');
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

loansRouter.put(
  '/holidays',
  requirePermission('loan:write'),
  validate(holidayUpsertSchema),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    if (!auth.orgId) throw Forbidden('Organization context required');
    const body = req.body as { holidays: Array<{ date: string; name: string; nameBn?: string; isRecurring?: boolean }> };
    const rows = body.holidays.map((h) => ({
      org_id: auth.orgId,
      date: h.date,
      name: h.name,
      name_bn: h.nameBn ?? null,
      is_recurring: h.isRecurring ?? false,
      created_by: auth.userId,
    }));
    const { data, error } = await supabaseAdmin
      .from('loan_holidays')
      .upsert(rows, { onConflict: 'org_id,date' })
      .select();
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

loansRouter.delete(
  '/holidays/:date',
  requirePermission('loan:write'),
  asyncHandler(async (req, res) => {
    const auth = (req as RequestWithAuth).auth!;
    const date = req.params['date'] as string;
    let query = supabaseAdmin.from('loan_holidays').delete().eq('date', date);
    if (auth.orgId && auth.role !== 'super_admin') query = query.eq('org_id', auth.orgId);
    const { data, error } = await query.select();
    if (error) throw error;
    if (!data?.length) throw NotFound(`No holiday on ${date}`);
    res.json({ items: data });
  }),
);
