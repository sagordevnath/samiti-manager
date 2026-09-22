/**
 * ── Loan demo router ─────────────────────────────────────────────────────────
 * Mirrors loans.routes.ts against the in-memory store when Supabase is not
 * configured (preview + tests). Endpoint-for-endpoint parity: policy, rate
 * cap, products, applications, wizard steps, decision, schedule, pipeline.
 */
import { Router } from 'express';
import {
  approvalMatrixUpsertSchema,
  disbursementUpdateSchema,
  disbursementAuthorizeSchema,
  disbursementCancelSchema,
  DISBURSEMENT_CHECK_LABELS_BN,
  holidayUpsertSchema,
  loanApplicationCreateSchema,
  loanDecisionSchema,
  loanPolicyUpdateSchema,
  loanProductCreateSchema,
  loanStepDoneSchema,
  utilizationPlanSchema,
  utilizationVerifySchema,
  validateRateAgainstCap,
  type ApprovalMatrixRow,
  type Holiday,
  type UtilizationPlanInput,
  type UtilizationVerifyInput,
} from '@samity/shared';
import { demoAuthUser } from '../lib/demo.js';
import { LoanDemoError } from '../lib/loan-store.js';
import {
  buildOverlapReport,
  buildUtilizationReport,
  checkEligibility,
  cycleSummaryFor,
  resolveApproval,
} from '../services/loan-rules.js';
import {
  demoLiveFacts,
  saveDemoUtilizationPlan,
  upsertDemoApprovalMatrix,
  verifyDemoUtilization,
} from '../lib/loan-store.js';
import {
  authorizeDemoDisbursement,
  cancelDemoDisbursement,
  createDemoApplication,
  decideDemoApplication,
  demoAgreementFor,
  demoDisbursementFor,
  demoDisbursementQueue,
  demoHolidayDelete,
  demoHolidayList,
  demoHolidayUpsert,
  demoScheduleFor,
  prepareDemoDisbursement,
  type DemoAuthorizeInput,
  type DemoDisbursementCheckInput,
  type DemoPrepareInput,
  demoLoanSchedule,
  demoMemberCode,
  demoMemberName,
  demoPipeline,
  demoVoucherFor,
  loanDemoStore,
  recordDemoStep,
} from '../lib/loan-store.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { AppError, Conflict, Forbidden, NotFound } from '../lib/errors.js';

const STAGE_BN: Record<string, string> = {
  member_request: 'সদস্যের আবেদন',
  officer_visit: 'অফিসার পরিদর্শন',
  household_check: 'গার্হস্থ্য যাচাই',
  guarantor: 'গ্যারান্টর',
  bm_review: 'শাখা ব্যবস্থাপক পর্যালোচনা',
  am_review: 'এরিয়া ব্যবস্থাপক অনুমোদন',
  decision: 'চূড়ান্ত সিদ্ধান্ত',
};

function demoError(err: unknown): never {
  if (err instanceof LoanDemoError) {
    if (err.status === 404) throw NotFound(err.message);
    if (err.status === 409) throw Conflict(err.message);
    if (err.status === 403) throw Forbidden(err.message);
    throw new AppError(400, 'VALIDATION_ERROR', err.message);
  }
  throw err as Error;
}

export const loansDemoRouter = Router();
loansDemoRouter.use(requireAuth);

// ── Policy (regulatory cap + approval limits) ───────────────────────────────
loansDemoRouter.get(
  '/policy',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    const store = loanDemoStore();
    res.json({ ...store.policy, ...store.cyclePolicy });
  }),
);

loansDemoRouter.patch(
  '/policy',
  requirePermission('loan:write'),
  validate(loanPolicyUpdateSchema.partial()),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const store = loanDemoStore();
    const body = req.body as Record<string, unknown>;
    const baseKeys = ['rateCapPercent', 'bmApprovalLimitBdt', 'guarantorsRequired', 'maxActiveLoansPerMember', 'minDaysBetweenLoans'];
    const cycleKeys = ['firstLoanCapBdt', 'stepUpPercent', 'maxCycleCapBdt', 'overdueGraceDays', 'maxDebtToIncomeRatio', 'maxLoanToSavingsRatio', 'maxOverlappingLoans'];
    for (const key of baseKeys) {
      if (body[key] !== undefined) (store.policy as unknown as Record<string, unknown>)[key] = body[key];
    }
    for (const key of cycleKeys) {
      if (body[key] !== undefined) (store.cyclePolicy as unknown as Record<string, unknown>)[key] = body[key];
    }
    store.policy.updatedAt = new Date().toISOString();
    res.json({ ...store.policy, ...store.cyclePolicy });
  }),
);

// Approval matrix (configurable per designation).
loansDemoRouter.get(
  '/approval-matrix',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: loanDemoStore().approvalMatrix });
  }),
);

loansDemoRouter.put(
  '/approval-matrix',
  requirePermission('loan:write'),
  validate(approvalMatrixUpsertSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const store = loanDemoStore();
    const body = req.body as { rows: ApprovalMatrixRow[] };
    res.json({ items: upsertDemoApprovalMatrix(store, body.rows) });
  }),
);

// Cycle + overlap checks for a member (live eligibility feedback).
loansDemoRouter.get(
  '/cycle-check/:memberId',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const store = loanDemoStore();
    const memberId = req.params['memberId'] as string;
    const amount = String(req.query['amount'] ?? '0');
    const facts = demoLiveFacts(store, memberId);
    const activeLoanCount = store.applications.filter(
      (a) => a.memberId === memberId && ['approved', 'disbursed'].includes(a.status),
    ).length;
    const loanFacts = {
      overdueInstallments: facts.overdueInstallments,
      activeMonthlyInstallments: facts.activeMonthlyInstallment,
      monthlyIncome: facts.monthlyIncome,
      totalActiveLoanBalance: facts.activeLoanBalance,
      savingsBalance: facts.savingsBalance,
      activeLoanCount,
      completedCycles: facts.completedCycles,
    };
    const cycle = cycleSummaryFor(store.cyclePolicy, loanFacts);
    const check = checkEligibility({ amount, policy: store.cyclePolicy, facts: loanFacts }, cycle);
    const overlap = buildOverlapReport(
      memberId,
      store.applications
        .filter((a) => a.memberId === memberId)
        .map((a) => ({
          applicationId: a.id,
          applicationNumber: a.applicationNumber,
          productId: a.productId,
          productName: store.products.find((p) => p.id === a.productId)?.name ?? null,
          status: a.status,
          outstanding: ['approved', 'disbursed'].includes(a.status) ? a.requestedAmount : '0.00',
          monthlyInstallment: null,
          branchId: a.branchId,
        })),
      store.cyclePolicy.maxOverlappingLoans,
    );
    res.json({ cycle, check, overlap });
  }),
);

// ── Rate cap validation (live check for the product form) ───────────────────
loansDemoRouter.post(
  '/rate-check',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { interestRate?: number; interestMethod?: 'declining_balance' | 'flat' };
    const cap = loanDemoStore().policy.rateCapPercent;
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
loansDemoRouter.get(
  '/products',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: loanDemoStore().products.filter((p) => p.isActive) });
  }),
);

loansDemoRouter.post(
  '/products',
  requirePermission('loan:write'),
  validate(loanProductCreateSchema.omit({ orgId: true })),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const store = loanDemoStore();
    try {
      validateRateAgainstCap(
        { interestRate: req.body.interestRate, interestMethod: req.body.interestMethod },
        store.policy.rateCapPercent,
      );
    } catch (err) {
      throw new AppError(422, 'VALIDATION_ERROR', err instanceof Error ? err.message : 'Rate cap exceeded');
    }
    if (Number(req.body.minAmount) > Number(req.body.maxAmount)) {
      throw new AppError(422, 'VALIDATION_ERROR', 'minAmount must not exceed maxAmount');
    }
    const product = { ...req.body, id: crypto.randomUUID(), orgId: store.orgId };
    store.products.push(product);
    res.status(201).json(product);
  }),
);

// ── Applications ────────────────────────────────────────────────────────────
loansDemoRouter.get(
  '/applications',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    const store = loanDemoStore();
    res.json({
      items: store.applications.map((a) => ({
        ...a,
        memberName: demoMemberName(a.memberId),
        memberCode: demoMemberCode(a.memberId),
      })),
      pipeline: demoPipeline(store),
    });
  }),
);

loansDemoRouter.post(
  '/applications',
  requirePermission('loan:write'),
  validate(loanApplicationCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const store = loanDemoStore();
    const body = req.body as { memberId: string; requestedAmount: string; monthlyIncome?: never };
    try {
      // Governance gate: cycle cap, overdue, DTI, LSR, overlap.
      const facts = demoLiveFacts(store, body.memberId);
      const loanFacts = {
        overdueInstallments: facts.overdueInstallments,
        activeMonthlyInstallments: facts.activeMonthlyInstallment,
        monthlyIncome: facts.monthlyIncome,
        totalActiveLoanBalance: facts.activeLoanBalance,
        savingsBalance: facts.savingsBalance,
        activeLoanCount: store.applications.filter((a) => a.memberId === body.memberId && ['approved', 'disbursed'].includes(a.status)).length,
        completedCycles: facts.completedCycles,
      };
      const check = checkEligibility({ amount: body.requestedAmount, policy: store.cyclePolicy, facts: loanFacts });
      if (!check.eligible) {
        throw new AppError(409, 'CONFLICT', `আবেদন ব্লক হয়েছে: ${check.blocks.join(', ')}`, check);
      }
      const application = createDemoApplication(store, req.body, req.auth?.userId ?? null);
      res.status(201).json(application);
    } catch (err) {
      demoError(err);
    }
  }),
);

loansDemoRouter.get(
  '/applications/:id',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const store = loanDemoStore();
    const app = store.applications.find((a) => a.id === (req.params['id'] as string));
    if (!app) throw NotFound('Loan application not found');
    const steps = store.steps.filter((s) => s.applicationId === app.id);
    const product = store.products.find((p) => p.id === app.productId) ?? null;
    const facts = demoLiveFacts(store, app.memberId);
    const cycle = cycleSummaryFor(store.cyclePolicy, {
      overdueInstallments: facts.overdueInstallments,
      activeMonthlyInstallments: facts.activeMonthlyInstallment,
      monthlyIncome: facts.monthlyIncome,
      totalActiveLoanBalance: facts.activeLoanBalance,
      savingsBalance: facts.savingsBalance,
      activeLoanCount: store.applications.filter((a) => a.memberId === app.memberId && ['approved', 'disbursed'].includes(a.status)).length,
      completedCycles: facts.completedCycles,
    });
    const approval = resolveApproval(store.approvalMatrix, { productId: app.productId, amount: app.requestedAmount });
    const plan = store.utilizationPlans.find((p) => p.applicationId === app.id) ?? null;
    const utilization = buildUtilizationReport(
      plan ?? { items: [] },
      plan?.status === 'verified' && plan.verification
        ? { items: plan.verification.items, verifiedAt: plan.verifiedAt, verifiedBy: plan.verifiedBy, verifierNote: plan.verification.verifierNote }
        : null,
    );
    res.json({
      ...app,
      memberName: demoMemberName(app.memberId),
      memberCode: demoMemberCode(app.memberId),
      productName: product?.name ?? null,
      steps,
      cycle,
      approval,
      utilization: plan ? utilization : null,
    });
  }),
);

// ── Wizard steps (audit-trailed) ────────────────────────────────────────────
loansDemoRouter.post(
  '/applications/:id/steps',
  requirePermission('loan:write'),
  validate(loanStepDoneSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const step = recordDemoStep(loanDemoStore(), req.params['id'] as string, req.body, {
        userId: req.auth?.userId ?? null,
        role: req.auth?.role ?? 'member',
      });
      res.status(201).json(step);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── Decision (approve / reject with reason) ─────────────────────────────────
loansDemoRouter.post(
  '/applications/:id/decision',
  requirePermission('loan:write'),
  validate(loanDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const store = loanDemoStore();
    const applicationId = req.params['id'] as string;
    const appRow = store.applications.find((a) => a.id === applicationId);
    if (appRow && req.body.decision === 'approve') {
      // Approval matrix: the deciding role must be allowed for this band.
      const approval = resolveApproval(store.approvalMatrix, {
        productId: appRow.productId,
        amount: appRow.requestedAmount,
      });
      const role = req.auth?.role ?? 'member';
      if (approval.approverRoles.length > 0 && !approval.approverRoles.includes(role) && role !== 'super_admin') {
        throw Forbidden(
          `অনুমোদনের ক্ষমতা নেই — এই পরিমাণের জন্য দরকার: ${approval.approverRoles.join(', ')}`,
        );
      }
      // Re-run the governance gate before final approval (defense in depth).
      const facts = demoLiveFacts(store, appRow.memberId);
      const check = checkEligibility({
        amount: appRow.requestedAmount,
        policy: store.cyclePolicy,
        facts: {
          overdueInstallments: facts.overdueInstallments,
          activeMonthlyInstallments: facts.activeMonthlyInstallment,
          monthlyIncome: facts.monthlyIncome,
          totalActiveLoanBalance: facts.activeLoanBalance,
          savingsBalance: facts.savingsBalance,
          activeLoanCount: store.applications.filter((a) => a.memberId === appRow.memberId && ['approved', 'disbursed'].includes(a.status)).length,
          completedCycles: facts.completedCycles,
        },
      });
      if (!check.eligible) {
        throw new AppError(409, 'CONFLICT', `অনুমোদন ব্লক হয়েছে: ${check.blocks.join(', ')}`, check);
      }
    }
    try {
      const app = decideDemoApplication(store, applicationId, req.body.decision, req.body.reason, {
        userId: req.auth?.userId ?? null,
        role: req.auth?.role ?? 'member',
      });
      res.json(app);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── Utilization plan (capture now, verify later) ────────────────────────────
loansDemoRouter.get(
  '/applications/:id/utilization',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const store = loanDemoStore();
    const applicationId = req.params['id'] as string;
    const plan = store.utilizationPlans.find((p) => p.applicationId === applicationId);
    if (!plan) throw NotFound('Utilization plan not found for this application');
    res.json({
      plan,
      report: buildUtilizationReport(
        plan,
        plan.status === 'verified' && plan.verification
          ? { items: plan.verification.items, verifiedAt: plan.verifiedAt, verifiedBy: plan.verifiedBy, verifierNote: plan.verification.verifierNote }
          : null,
      ),
    });
  }),
);

loansDemoRouter.put(
  '/applications/:id/utilization',
  requirePermission('loan:write'),
  validate(utilizationPlanSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const plan = saveDemoUtilizationPlan(loanDemoStore(), req.params['id'] as string, req.body as UtilizationPlanInput, req.auth?.userId ?? null);
      res.json({ plan });
    } catch (err) {
      demoError(err);
    }
  }),
);

loansDemoRouter.post(
  '/applications/:id/utilization/verify',
  requirePermission('loan:write'),
  validate(utilizationVerifySchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const plan = verifyDemoUtilization(loanDemoStore(), req.params['id'] as string, req.body as UtilizationVerifyInput, req.auth?.userId ?? null);
      res.json({ plan });
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── Timeline (visible to every involved role) ───────────────────────────────
loansDemoRouter.get(
  '/applications/:id/timeline',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const store = loanDemoStore();
    const app = store.applications.find((a) => a.id === (req.params['id'] as string));
    if (!app) throw NotFound('Loan application not found');
    const entries = store.steps
      .filter((s) => s.applicationId === app.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((s) => ({
        id: s.id,
        stage: s.stage,
        stageBn: STAGE_BN[s.stage] ?? s.stage,
        action: s.action,
        actorRole: s.actorRole,
        actorName: demoMemberName(s.actorId ?? '') === 'Unknown member' ? s.actorId : demoMemberName(s.actorId ?? ''),
        note: s.note,
        createdAt: s.createdAt,
      }));
    res.json({ items: entries, applicationNumber: app.applicationNumber, status: app.status });
  }),
);

// ── Proposal data (rendered to Bangla PDF by the web layer) ─────────────────
loansDemoRouter.get(
  '/applications/:id/proposal',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const store = loanDemoStore();
    const app = store.applications.find((a) => a.id === (req.params['id'] as string));
    if (!app) throw NotFound('Loan application not found');
    const product = store.products.find((p) => p.id === app.productId) ?? null;
    const facts = demoLiveFacts(store, app.memberId);
    const schedule = demoLoanSchedule(store, app.id);
    const plan = store.utilizationPlans.find((p) => p.applicationId === app.id) ?? null;
    res.json({
      applicationNumber: app.applicationNumber,
      status: app.status,
      member: {
        name: demoMemberName(app.memberId),
        nameBn: null,
        code: demoMemberCode(app.memberId),
        photoUrl: facts.photoUrl,
        branchName: app.branchId === store.applications[0]?.branchId ? 'Dhanmondi' : 'Mymensingh Sadar',
        mobile: null,
      },
      product: product
        ? { name: product.name, nameBn: product.nameBn, code: product.code, interestRate: product.interestRate, interestMethod: product.interestMethod, installmentFrequency: product.installmentFrequency }
        : { name: '—', nameBn: null, code: '—', interestRate: 0, interestMethod: 'declining_balance', installmentFrequency: 'monthly' },
      requestedAmount: app.requestedAmount,
      termMonths: app.termMonths,
      purpose: app.purpose,
      utilization: buildUtilizationReport(plan ?? { items: [] }, null),
      eligibility: null,
      schedule: schedule.installments.map((i) => ({ seq: i.seq, dueDate: i.dueDate, principal: i.principal, interest: i.interest, total: i.total })),
      steps: store.steps.filter((s) => s.applicationId === app.id).map((s) => ({ stage: s.stage, action: s.action, actorRole: s.actorRole, note: s.note, createdAt: s.createdAt })),
      guarantors: app.guarantors.map((g) => ({ name: g.name, relation: g.relation, mobile: g.mobile })),
      orgName: 'সমিটি ডেমো সমবায় সমিতি',
      generatedAt: new Date().toISOString(),
    });
  }),
);

// ── Repayment schedule ──────────────────────────────────────────────────────
loansDemoRouter.get(
  '/applications/:id/schedule',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(demoLoanSchedule(loanDemoStore(), req.params['id'] as string));
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── Pipeline buckets ────────────────────────────────────────────────────────
loansDemoRouter.get(
  '/pipeline',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: demoPipeline(loanDemoStore()) });
  }),
);
// ── Disbursement queue (approved loans grouped by samity / planned date) ────
loansDemoRouter.get(
  '/disbursements/queue',
  requirePermission('loan:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const branchId = (req.query['branchId'] as string | undefined) || undefined;
    const items = demoDisbursementQueue(loanDemoStore(), branchId);
    res.json({ items });
  }),
);

// ── One disbursement record (checks progress, mode, evidence) ───────────────
loansDemoRouter.get(
  '/disbursements/:applicationId',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const store = loanDemoStore();
    const app = store.applications.find((a) => a.id === (req.params['applicationId'] as string));
    if (!app) throw NotFound('Loan application not found');
    const rec = demoDisbursementFor(store, app.id);
    res.json({ disbursement: rec, checkLabels: DISBURSEMENT_CHECK_LABELS_BN });
  }),
);

// ── Record check progress / planned date without paying (draft) ─────────────
// ── Step 1 — prepare (Accountant): checks, planned date, mode; no money moves
loansDemoRouter.patch(
  '/disbursements/:applicationId',
  requirePermission('loan:write'),
  validate(disbursementUpdateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const store = loanDemoStore();
      const app = store.applications.find((a) => a.id === (req.params['applicationId'] as string));
      if (!app) throw NotFound('Loan application not found');
      const body = req.body as { plannedDate?: string; checkItems?: DemoDisbursementCheckInput[]; mode?: DemoPrepareInput['mode']; note?: string };
      const rec = prepareDemoDisbursement(
        store,
        app.id,
        { plannedDate: body.plannedDate, checkItems: body.checkItems, mode: body.mode, note: body.note ?? null },
        { userId: req.auth?.userId ?? null, role: req.auth?.role ?? 'account_officer' },
      );
      res.json(rec);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── Step 2 — authorize (Branch Manager): pays out in one logical transaction.
// Mirrors the `authorize_loan_disbursement` RPC in 0018: cash limit, balanced
// journal, loan number, stored schedule, passbook, SMS, utilization visit.
loansDemoRouter.post(
  '/disbursements/:applicationId/authorize',
  requirePermission('loan:write'),
  validate(disbursementAuthorizeSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const store = loanDemoStore();
      const app = store.applications.find((a) => a.id === (req.params['applicationId'] as string));
      if (!app) throw NotFound('Loan application not found');
      const result = authorizeDemoDisbursement(
        store,
        app.id,
        req.body as DemoAuthorizeInput,
        { userId: req.auth?.userId ?? null, role: req.auth?.role ?? 'branch_manager' },
      );
      res.status(201).json(result);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 10) Rollback — same-day cancel with reason and an approver role.
loansDemoRouter.post(
  '/disbursements/:applicationId/cancel',
  requirePermission('loan:write'),
  validate(disbursementCancelSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const store = loanDemoStore();
      const body = req.body as { reason: string };
      const result = cancelDemoDisbursement(
        store,
        req.params['applicationId'] as string,
        body.reason,
        { userId: req.auth?.userId ?? null, role: req.auth?.role ?? 'branch_manager' },
      );
      res.json(result);
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 7) Printable disbursement voucher (Bangla).
loansDemoRouter.get(
  '/disbursements/:applicationId/voucher',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(demoVoucherFor(loanDemoStore(), req.params['applicationId'] as string));
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 7) Printable loan agreement (Bangla).
loansDemoRouter.get(
  '/disbursements/:applicationId/agreement',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(demoAgreementFor(loanDemoStore(), req.params['applicationId'] as string));
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── 5/8/9) Journal, passbook, SMS and utilization-visit ledgers (audit).

// ── Stored repayment schedule (real rows after disbursement, preview before) ─
loansDemoRouter.get(
  '/disbursements/:applicationId/schedule',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(demoScheduleFor(loanDemoStore(), req.params['applicationId'] as string));
    } catch (err) {
      demoError(err);
    }
  }),
);

// ── Holiday calendar (feeds the schedule shifting) ──────────────────────────
loansDemoRouter.get(
  '/journals',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: loanDemoStore().journals });
  }),
);

loansDemoRouter.get(
  '/passbook/:memberId',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const items = loanDemoStore().passbookEntries.filter((p) => p.memberId === (req.params['memberId'] as string));
    res.json({ items });
  }),
);

loansDemoRouter.get(
  '/sms-outbox',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: loanDemoStore().smsOutbox });
  }),
);

loansDemoRouter.get(
  '/utilization-visits',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: loanDemoStore().utilizationVisits });
  }),
);

loansDemoRouter.get(
  '/holidays',
  requirePermission('loan:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: demoHolidayList(loanDemoStore()) });
  }),
);

loansDemoRouter.put(
  '/holidays',
  requirePermission('loan:write'),
  validate(holidayUpsertSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { holidays: Holiday[] };
    res.json({ items: demoHolidayUpsert(loanDemoStore(), body.holidays) });
  }),
);

loansDemoRouter.delete(
  '/holidays/:date',
  requirePermission('loan:write'),
  asyncHandler(async (req, res) => {
    try {
      res.json({ items: demoHolidayDelete(loanDemoStore(), req.params['date'] as string) });
    } catch (err) {
      demoError(err);
    }
  }),
);
