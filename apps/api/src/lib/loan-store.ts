/**
 * ── Loan demo store ──────────────────────────────────────────────────────────
 * Preview-first in-memory dataset mirroring 0012 shapes: org policy, the full
 * product catalog, applications, and the immutable step audit trail. Used when
 * Supabase env values are placeholders (and in tests) so the whole module —
 * rate cap, wizard, approvals, schedules — works with zero cloud setup.
 * NOT for production.
 */
import { randomUUID } from 'node:crypto';
import {
  CASH_MODES,
  DISBURSEMENT_ACCOUNTS,
  DISBURSEMENT_CHECKS,
  DISBURSEMENT_MODE_LABELS_BN,
  buildDisbursementJournal,
  computeDisbursementSchedule,
  computeLoanSchedule,
  loanDisbursementSms,
  nextLoanStage,
  STAGE_ROLE,
  type ApprovalMatrixRow,
  type DisbursementCheck,
  type DisbursementMode,
  type JournalEntryDraft,
  type LoanApplication,
  type LoanApplicationStatus,
  type LoanApplicationStep,
  type LoanCyclePolicy,
  type LoanPassbookEntry,
  type LoanPipelineBucket,
  type LoanPolicy,
  type LoanProduct,
  type LoanSchedule,
  type LoanStage,
  type LoanStepPayload,
  type OverdueInstallment,
  type DisbursementRecord,
  type DisbursementCheckItem,
  type Holiday,
  type SmsMessage,
  type UtilizationPlanInput,
  type UtilizationVerifyInput,
  type UtilizationVisit,
  type LoanVoucherData,
  type LoanAgreementData,
} from '@samity/shared';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const BRANCH_MYMENSINGH = '00000000-0000-4000-8000-0000000000b2';
const MEMBER_A = '00000000-0000-4000-8000-0000000001a1';
const MEMBER_B = '00000000-0000-4000-8000-0000000001a2';
const MEMBER_C = '00000000-0000-4000-8000-0000000001a3';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

export interface DemoMemberFacts {
  monthlyIncome: string;
  savingsBalance: string;
  /** Outstanding on this member's active/disbursed loans (demo = seeded). */
  activeLoanBalance: string;
  activeMonthlyInstallment: string;
  completedCycles: Array<{ closedOnTime: boolean; principal: string }>;
  overdueInstallments: OverdueInstallment[];
  photoUrl: string | null;
  signatureUrl: string | null;
  phone: string;
}

export interface DemoUtilizationPlan {
  id: string;
  applicationId: string;
  items: UtilizationPlanInput['items'];
  status: 'planned' | 'verified';
  verification: {
    items: Array<{ category: string; verifiedAmount: string; note?: string }>;
    verifierNote: string | null;
  } | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface LoanDemoData {
  orgId: string;
  policy: LoanPolicy;
  cyclePolicy: LoanCyclePolicy;
  approvalMatrix: ApprovalMatrixRow[];
  products: LoanProduct[];
  applications: LoanApplication[];
  steps: LoanApplicationStep[];
  memberFacts: Record<string, DemoMemberFacts>;
  utilizationPlans: DemoUtilizationPlan[];
  branchSeq: Record<string, number>;
  holidays: Holiday[];
  disbursements: DisbursementRecord[];
  branchCashLimits: Record<string, string>;
  /** Application → samity assignment (drives queue grouping + center cash mode). */
  samityAssignments: Record<string, string | null>;
  /** Double-entry journals written at authorization; reversals on cancel (req 5). */
  journals: JournalEntryDraft[];
  /** Member loan passbook entries written at authorization/cancel (req 8). */
  passbookEntries: LoanPassbookEntry[];
  /** Outbound SMS queued at authorization/cancel (req 8). */
  smsOutbox: SmsMessage[];
  /** Utilization visits auto-scheduled 15 days after disbursement (req 9). */
  utilizationVisits: UtilizationVisit[];
  /** Per-branch loan-number sequence (LN-<branchCode>-<YY>-<seq>, req 8). */
  loanSeq: Record<string, number>;
}

function buildDemoData(): LoanDemoData {
  const now = new Date().toISOString();

  const policy: LoanPolicy = {
    orgId: ORG,
    rateCapPercent: 27, // MRA limit (editable per org)
    bmApprovalLimitBdt: '100000.00',
    guarantorsRequired: 1,
    maxActiveLoansPerMember: 2,
    minDaysBetweenLoans: 0,
    updatedAt: now,
  };

  const cyclePolicy: LoanCyclePolicy = {
    firstLoanCapBdt: '20000.00',
    stepUpPercent: 25,
    maxCycleCapBdt: '100000.00',
    overdueGraceDays: 3,
    maxDebtToIncomeRatio: 0.4,
    maxLoanToSavingsRatio: 3,
    maxOverlappingLoans: 2,
  };

  const approvalMatrix: ApprovalMatrixRow[] = [
    {
      id: randomUUID(), productId: null, minAmount: null, maxAmount: '30000.00',
      approverRoles: ['branch_manager'], soloApprovalLimit: '30000.00', priority: 10, isActive: true,
    },
    {
      id: randomUUID(), productId: null, minAmount: '30000.01', maxAmount: '200000.00',
      approverRoles: ['branch_manager', 'area_manager'], soloApprovalLimit: null, priority: 5, isActive: true,
    },
    {
      id: randomUUID(), productId: null, minAmount: '200000.01', maxAmount: null,
      approverRoles: ['org_admin'], soloApprovalLimit: null, priority: 1, isActive: true,
    },
  ];

  // Compact seed: every field of the product catalog from requirement 1.
  const rows: Array<
    [string, string, string | null, LoanProduct['productType'], string, string, number, LoanProduct['installmentFrequency'], LoanProduct['interestMethod'], number, number, number, number, number, string[], string]
  > = [
    // code, name, nameBn, type, min, max, term, freq, method, rate, svc, procFee, ins, grace, docs, eligibility
    ['GEN', 'General loan', 'সাধারণ ঋণ', 'general', '10000', '50000', 12, 'weekly', 'declining_balance', 24, 1, 1, 0.5, 0, ['KYC documents', 'Group resolution'], '6+ months membership, cleared savings record'],
    ['SAGRI', 'Seasonal agriculture', 'মৌসুমি কৃষি ঋণ', 'seasonal_agri', '10000', '40000', 10, 'weekly', 'declining_balance', 26, 1, 1, 0.5, 2, ['Land document', 'Crop plan'], 'Verified cultivable land or lease'],
    ['MICRO', 'Microenterprise', 'ক্ষুদ্র উদ্যোগ ঋণ', 'microenterprise', '50000', '500000', 24, 'monthly', 'declining_balance', 24, 1.5, 1, 0.5, 1, ['Trade license', 'Enterprise photos', 'Cash-flow sheet'], '12+ months operating enterprise'],
    ['HOUSE', 'Housing & sanitation', 'আবাসন ঋণ', 'housing', '50000', '300000', 60, 'monthly', 'declining_balance', 22, 1, 1.5, 0.5, 3, ['Land document', 'Cost estimate'], 'Owned homestead land'],
    ['EDU', 'Education', 'শিক্ষা ঋণ', 'education', '10000', '100000', 24, 'monthly', 'declining_balance', 20, 0, 0.5, 0, 1, ['Admission receipt', 'Institution letter'], 'Child enrolled in recognized institution'],
    ['EMERG', 'Emergency', 'জরুরি ঋণ', 'emergency', '5000', '20000', 6, 'weekly', 'flat', 10, 0, 0, 0, 0, ['Application form'], 'Any active member; disbursed within 72 hours'],
    ['MIG', 'Overseas migration', 'প্রবাস ঋণ', 'migration', '100000', '400000', 36, 'monthly', 'declining_balance', 24, 1, 1.5, 1, 2, ['Passport', 'Visa', 'BMET clearance', 'Training certificate'], 'Valid overseas employment permit'],
    ['DEVICE', 'Device & clean energy', 'ডিভাইস ঋণ', 'device', '5000', '30000', 12, 'weekly', 'declining_balance', 25, 1, 0.5, 0.5, 0, ['Quotation'], 'Solar home system, phone, cookstove purchase'],
    ['CLIMATE', 'Climate adaptation', 'জলবায়ু ঋণ', 'climate', '20000', '100000', 24, 'monthly', 'declining_balance', 22, 1, 1, 1, 2, ['Vulnerability assessment'], 'Household in declared climate-vulnerable area'],
  ];

  const products: LoanProduct[] = rows.map(
    ([code, name, nameBn, productType, minAmount, maxAmount, termMonths, frequency, method, rate, svc, proc, ins, grace, docs, eligibility]) => ({
      id: randomUUID(),
      orgId: ORG,
      code,
      name,
      nameBn,
      productType,
      minAmount,
      maxAmount,
      termMonths,
      installmentFrequency: frequency,
      interestMethod: method,
      interestRate: rate,
      serviceCharge: svc,
      processingFeeRate: proc,
      insurancePremiumRate: ins,
      gracePeriodInstallments: grace,
      eligibilityNote: eligibility,
      requiredDocuments: docs,
      guarantorsRequired: code === 'MICRO' || code === 'MIG' ? 2 : 1,
      guarantorMinRelationship: code === 'MICRO' ? 'family_or_business' : null,
      isActive: true,
    }),
  );
  const productByCode = (code: string) => products.find((p) => p.code === code)!;

  const applications: LoanApplication[] = [];
  const steps: LoanApplicationStep[] = [];
  const branchSeq: Record<string, number> = { [BRANCH_DHAKA]: 0, [BRANCH_MYMENSINGH]: 0 };
  const nextNumber = (branchId: string) => {
    branchSeq[branchId] = (branchSeq[branchId] ?? 0) + 1;
    return `LO-${branchId === BRANCH_DHAKA ? 'DHK' : 'MYM'}-${String(branchSeq[branchId]).padStart(4, '0')}`;
  };
  const addStep = (applicationId: string, stage: LoanStage, actorId: string | null, note: string | null, payload: LoanStepPayload | null, when: string, action: LoanApplicationStep['action'] = 'done') => {
    steps.push({
      id: randomUUID(), applicationId, stage, action, actorRole: STAGE_ROLE[stage], actorId, note, payload, createdAt: when,
    });
  };

  // APP 1 — above the BM limit, now waiting for area approval.
  const karim = { name: 'Abdul Karim', relation: 'spouse', mobile: '01712345678', nidLast4: '4412', isMember: false, consentGiven: true } as const;
  const roksana = { name: 'Roksana Akter', relation: 'same_group_member', mobile: '01912345671', nidLast4: '8830', isMember: true, consentGiven: true } as const;
  const app1 = randomUUID();
  applications.push({
    id: app1, orgId: ORG, branchId: BRANCH_DHAKA, memberId: MEMBER_A, productId: productByCode('MICRO').id,
    applicationNumber: nextNumber(BRANCH_DHAKA), requestedAmount: '180000.00', purpose: 'Tailoring workshop expansion — 4 machines',
    status: 'am_review', termMonths: 24, guarantors: [karim, roksana], decisionReason: null, decidedBy: null, decidedAt: null,
    createdAt: daysAgo(9), updatedAt: daysAgo(1),
  });
  addStep(app1, 'member_request', null, 'Member requested expansion capital', { amount: '180000.00' }, daysAgo(9));
  addStep(app1, 'officer_visit', null, 'Workshop visited; 6 years operating, 5 employees', {
    visitNote: 'Premises and machines verified',
    enterpriseAssessment: { activity: 'Tailoring workshop', monthlyRevenueBdt: '85000.00', monthlyCostBdt: '52000.00', yearsOperating: 6 },
  }, daysAgo(8));
  addStep(app1, 'household_check', null, 'Debt service 38% of household income', {
    householdCheck: { monthlyIncomeBdt: '92000.00', monthlyDebtServiceBdt: '35000.00', otherMfiLoans: 1 },
  }, daysAgo(7));
  addStep(app1, 'guarantor', null, 'Husband standing guarantee', { guarantor: { ...karim } }, daysAgo(6));
  addStep(app1, 'guarantor', null, 'Second guarantor from her group (MICRO requires two)', { guarantor: { ...roksana } }, daysAgo(6));
  addStep(app1, 'bm_review', null, 'Enterprise verified; recommended for area approval', { amount: '180000.00' }, daysAgo(1));

  // APP 2 — fresh submission, officer phase in progress.
  const app2 = randomUUID();
  applications.push({
    id: app2, orgId: ORG, branchId: BRANCH_MYMENSINGH, memberId: MEMBER_B, productId: productByCode('SAGRI').id,
    applicationNumber: nextNumber(BRANCH_MYMENSINGH), requestedAmount: '30000.00', purpose: 'Boro rice cultivation inputs',
    status: 'submitted', termMonths: 10, guarantors: [], decisionReason: null, decidedBy: null, decidedAt: null,
    createdAt: daysAgo(2), updatedAt: daysAgo(2),
  });
  addStep(app2, 'member_request', null, 'Requested at weekly group meeting', { amount: '30000.00' }, daysAgo(2));

  // APP 3 — completed within-limit emergency loan.
  const app3 = randomUUID();
  applications.push({
    id: app3, orgId: ORG, branchId: BRANCH_DHAKA, memberId: MEMBER_C, productId: productByCode('EMERG').id,
    applicationNumber: nextNumber(BRANCH_DHAKA), requestedAmount: '12000.00', purpose: 'Emergency medical treatment',
    status: 'approved', termMonths: 6, guarantors: [], decisionReason: null, decidedBy: 'bm-demo-user', decidedAt: daysAgo(4),
    createdAt: daysAgo(6), updatedAt: daysAgo(4),
  });
  addStep(app3, 'member_request', null, 'Urgent request collected at center', { amount: '12000.00' }, daysAgo(6));
  addStep(app3, 'officer_visit', null, 'Hospital discharge summary seen', { visitNote: 'Treatment verified' }, daysAgo(5));
  addStep(app3, 'household_check', null, 'Repayment capacity confirmed', {
    householdCheck: { monthlyIncomeBdt: '26000.00', monthlyDebtServiceBdt: '6000.00', otherMfiLoans: 0 },
  }, daysAgo(5));
  addStep(app3, 'guarantor', null, 'Group member guarantee', {
    guarantor: { name: 'Rokeya Begum', relation: 'same_group_member', mobile: '01812345678', nidLast4: '9034', isMember: true, consentGiven: true },
  }, daysAgo(5));
  addStep(app3, 'bm_review', null, 'Emergency verified; approved within limit', null, daysAgo(4));
  steps.push({
    id: randomUUID(), applicationId: app3, stage: 'decision', action: 'approved', actorRole: 'branch_manager',
    actorId: 'bm-demo-user', note: null, payload: null, createdAt: daysAgo(4),
  });

  // ── Member facts (savings, income, history) driving the governance gates ──
  const memberFacts: Record<string, DemoMemberFacts> = {
    // Rahima: 2 completed cycles (one late), no overdue; cap = 20000 × 1.25² = 31,250
    [MEMBER_A]: {
      monthlyIncome: '30000.00', savingsBalance: '12400.00', activeLoanBalance: '0.00',
      activeMonthlyInstallment: '0.00',
      completedCycles: [{ closedOnTime: true, principal: '15000.00' }, { closedOnTime: false, principal: '18000.00' }],
      overdueInstallments: [], photoUrl: null, signatureUrl: null, phone: '01711110001',
    },
    // Salma: first-time borrower, tiny savings → cap 20,000
    [MEMBER_B]: {
      monthlyIncome: '18000.00', savingsBalance: '18200.00', activeLoanBalance: '0.00',
      activeMonthlyInstallment: '0.00', completedCycles: [], overdueInstallments: [],
      photoUrl: null, signatureUrl: null, phone: '01711110002',
    },
    // Jahanara: has the seeded overdue installment on her approved emergency loan
    [MEMBER_C]: {
      monthlyIncome: '22000.00', savingsBalance: '800.00', activeLoanBalance: '12000.00',
      activeMonthlyInstallment: '2200.00',
      completedCycles: [{ closedOnTime: true, principal: '10000.00' }],
      overdueInstallments: [
        {
          installmentId: 'demo-inst-1', loanId: app3, dueDate: new Date(Date.now() - 12 * 86_400_000).toISOString().slice(0, 10),
          daysOverdue: 12, amountDue: '2200.00',
        },
      ],
      photoUrl: null, signatureUrl: null, phone: '01711110003',
    },
  };

  const utilizationPlans: DemoUtilizationPlan[] = [
    {
      id: randomUUID(), applicationId: app1,
      items: [
        { category: 'sewing_machine', description: '4 × industrial machines', amount: '120000.00' },
        { category: 'working_capital', description: 'Fabric and thread stock', amount: '60000.00' },
      ],
      status: 'planned', verification: null, verifiedBy: null, verifiedAt: null, createdAt: daysAgo(9),
    },
  ];

  const holidays: Holiday[] = [
    { date: '2026-01-01', name: "New Year's Day", nameBn: 'নববর্ষ', isRecurring: true },
    { date: '2026-03-26', name: 'Independence Day', nameBn: 'স্বাধীনতা দিবস', isRecurring: true },
    { date: '2026-12-16', name: 'Victory Day', nameBn: 'বিজয় দিবস', isRecurring: true },
  ];

  const disbursements: DisbursementRecord[] = [
    {
      id: randomUUID(),
      applicationId: app1,
      orgId: ORG,
      branchId: BRANCH_DHAKA,
      samityId: '00000000-0000-4000-8000-0000000000s1',
      applicationNumber: 'DHK-LN-26-0003',
      memberId: MEMBER_A,
      memberName: 'Rahima Begum',
      memberCode: 'DHK-26-00001',
      productName: 'Microenterprise Loan',
      amount: '180000.00',
      mode: 'cash_branch',
      status: 'pending' as const,
      disbursementDate: new Date().toISOString().slice(0, 10),
      plannedDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      checks: Object.fromEntries(
        DISBURSEMENT_CHECKS.map((c) => [c, { done: false, note: null }]),
      ) as DisbursementRecord['checks'],
      mfsReference: null,
      bankReference: null,
      cashReceivedByName: null,
      actualUserOfFunds: null,
      actualUserRelation: null,
      note: null,
      schedule: { schedule: { method: 'declining_balance', installmentCount:0, installmentAmount: '0.00', totalInterest: '0.00', totalPayable: '0.00', installments: [] }, rows: [], shiftedCount: 0 },
      preparedBy: null,
      preparedAt: null,
      disbursedBy: null,
      disbursedAt: daysAgo(1),
      loanNumber: null,
      voucherNumber: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdAt: daysAgo(1),
    },
  ];

  return {
    orgId: ORG, policy, cyclePolicy, approvalMatrix, products, applications, steps,
    memberFacts, utilizationPlans, branchSeq, holidays, disbursements,
    branchCashLimits: { [BRANCH_DHAKA]: '500000.00', [BRANCH_MYMENSINGH]: '200000.00' },
    samityAssignments: {
      [app1]: '00000000-0000-4000-8000-0000000000s1',
      [app2]: '00000000-0000-4000-8000-0000000000s2',
      [app3]: '00000000-0000-4000-8000-0000000000s1',
    },
    journals: [],
    passbookEntries: [],
    smsOutbox: [],
    utilizationVisits: [],
    loanSeq: { [BRANCH_DHAKA]: 0, [BRANCH_MYMENSINGH]: 0 },
  };
}

const globalRef = globalThis as unknown as { __loanDemoData?: LoanDemoData };

export function loanDemoStore(): LoanDemoData {
  globalRef.__loanDemoData ??= buildDemoData();
  return globalRef.__loanDemoData;
}

/** Test isolation: rebuild the dataset from scratch. */
export function resetLoanDemoStore(): void {
  delete globalRef.__loanDemoData;
}

export class LoanDemoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// ── Store operations (mirroring the DB triggers + RLS gates) ────────────────

const demoMembers: Record<string, { name: string; code: string; branchId: string }> = {
  [MEMBER_A]: { name: 'Rahima Begum', code: 'DHK-26-00001', branchId: BRANCH_DHAKA },
  [MEMBER_B]: { name: 'Salma Khatun', code: 'MYM-26-00014', branchId: BRANCH_MYMENSINGH },
  [MEMBER_C]: { name: 'Jahanara Parvin', code: 'DHK-26-00042', branchId: BRANCH_DHAKA },
};
export function demoMemberName(memberId: string): string {
  return demoMembers[memberId]?.name ?? 'Unknown member';
}
export function demoMemberCode(memberId: string): string {
  return demoMembers[memberId]?.code ?? '';
}

export interface LoanCreateInput {
  memberId: string;
  productId: string;
  requestedAmount: string;
  purpose: string;
  termMonths?: number;
  requestedAt?: string;
}

export function createDemoApplication(store: LoanDemoData, input: LoanCreateInput, userId: string | null): LoanApplication {
  const member = demoMembers[input.memberId];
  if (!member) throw new LoanDemoError(404, 'NOT_FOUND', 'Member not found');
  const product = store.products.find((p) => p.id === input.productId);
  if (!product) throw new LoanDemoError(404, 'NOT_FOUND', 'Loan product not found');
  if (!product.isActive) throw new LoanDemoError(409, 'CONFLICT', 'Loan product is inactive');

  const amount = Number(input.requestedAmount);
  if (amount < Number(product.minAmount) || amount > Number(product.maxAmount)) {
    throw new LoanDemoError(
      409,
      'CONFLICT',
      `Amount must be between ৳${product.minAmount} and ৳${product.maxAmount} for ${product.code}`,
    );
  }

  const activeCount = store.applications.filter(
    (a) => a.memberId === input.memberId && !['rejected', 'closed'].includes(a.status),
  ).length;
  if (activeCount >= store.policy.maxActiveLoansPerMember) {
    throw new LoanDemoError(
      409,
      'CONFLICT',
      `Member already has ${activeCount} active loan applications (policy max ${store.policy.maxActiveLoansPerMember})`,
    );
  }

  const branchId = member.branchId;
  store.branchSeq[branchId] = (store.branchSeq[branchId] ?? 0) + 1;
  const now = new Date().toISOString();
  const application: LoanApplication = {
    id: randomUUID(),
    orgId: store.orgId,
    branchId,
    memberId: input.memberId,
    productId: input.productId,
    applicationNumber: `LO-${branchId === BRANCH_DHAKA ? 'DHK' : 'MYM'}-${String(store.branchSeq[branchId]).padStart(4, '0')}`,
    requestedAmount: amount.toFixed(2),
    purpose: input.purpose,
    status: 'submitted',
    termMonths: input.termMonths ?? product.termMonths,
    guarantors: [],
    decisionReason: null,
    decidedBy: null,
    decidedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  store.applications.unshift(application);
  store.steps.push({
    id: randomUUID(), applicationId: application.id, stage: 'member_request', action: 'done',
    actorRole: STAGE_ROLE.member_request, actorId: userId, note: 'Application submitted',
    payload: { amount: application.requestedAmount }, createdAt: input.requestedAt ?? now,
  });
  return application;
}

const OFFICER_STAGES: LoanStage[] = ['officer_visit', 'household_check', 'guarantor'];

export interface LoanStepInput {
  stage: LoanStage;
  note?: string;
  payload?: LoanStepPayload;
}

export function recordDemoStep(
  store: LoanDemoData,
  applicationId: string,
  input: LoanStepInput,
  ctx: { userId: string | null; role: string },
): LoanApplicationStep {
  const app = store.applications.find((a) => a.id === applicationId);
  if (!app) throw new LoanDemoError(404, 'NOT_FOUND', 'Loan application not found');
  if (['approved', 'rejected', 'disbursed', 'closed'].includes(app.status)) {
    throw new LoanDemoError(409, 'CONFLICT', `Application already decided (${app.status})`);
  }
  if (input.stage === 'member_request') {
    throw new LoanDemoError(409, 'CONFLICT', 'member_request is recorded automatically on submission');
  }
  if (input.stage === 'decision') {
    throw new LoanDemoError(409, 'CONFLICT', 'Use the decision endpoint to approve or reject');
  }

  const expectedRole = STAGE_ROLE[input.stage];
  if (ctx.role !== 'super_admin' && ctx.role !== expectedRole) {
    throw new LoanDemoError(403, 'FORBIDDEN', `Stage ${input.stage} requires role ${expectedRole}`);
  }

  if (input.stage === 'am_review' && app.status !== 'am_review') {
    throw new LoanDemoError(409, 'CONFLICT', 'Area review is not pending for this application');
  }
  if (input.stage === 'bm_review' && app.status !== 'bm_review') {
    throw new LoanDemoError(409, 'CONFLICT', 'Branch manager review is not pending for this application');
  }
  if (input.stage === 'guarantor' && !input.payload?.guarantor) {
    throw new LoanDemoError(400, 'VALIDATION_ERROR', 'Guarantor details are required for the guarantor step');
  }

  const alreadyDone = store.steps.some((s) => s.applicationId === applicationId && s.stage === input.stage && s.action === 'done');
  if (alreadyDone) {
    throw new LoanDemoError(409, 'CONFLICT', `Stage ${input.stage} already completed`);
  }

  const step: LoanApplicationStep = {
    id: randomUUID(),
    applicationId,
    stage: input.stage,
    action: 'done',
    actorRole: expectedRole,
    actorId: ctx.userId,
    note: input.note ?? null,
    payload: input.payload ?? null,
    createdAt: new Date().toISOString(),
  };
  store.steps.push(step);

  if (input.stage === 'guarantor' && input.payload?.guarantor) {
    app.guarantors.push(input.payload.guarantor);
  }

  // Advance the status machine: officer phase → bm_review; bm stage follows
  // nextLoanStage (am_review only when the amount exceeds the BM limit).
  if (OFFICER_STAGES.includes(input.stage)) {
    const doneOfficer = OFFICER_STAGES.filter((s) =>
      store.steps.some((st) => st.applicationId === applicationId && st.stage === s && st.action === 'done'),
    );
    if (doneOfficer.length === 1) app.status = nextLoanStage('submitted', app.requestedAmount, store.policy.bmApprovalLimitBdt)!;
    if (doneOfficer.length === OFFICER_STAGES.length) {
      app.status = nextLoanStage('officer_review', app.requestedAmount, store.policy.bmApprovalLimitBdt)!;
    }
  }

  app.updatedAt = step.createdAt;
  return step;
}

export function decideDemoApplication(
  store: LoanDemoData,
  applicationId: string,
  decision: 'approve' | 'reject',
  reason: string | undefined,
  ctx: { userId: string | null; role: string },
): LoanApplication {
  const app = store.applications.find((a) => a.id === applicationId);
  if (!app) throw new LoanDemoError(404, 'NOT_FOUND', 'Loan application not found');
  if (ctx.role !== 'super_admin' && !['branch_manager', 'area_manager'].includes(ctx.role)) {
    throw new LoanDemoError(403, 'FORBIDDEN', 'Only branch or area managers decide applications');
  }
  if (!['bm_review', 'am_review'].includes(app.status)) {
    throw new LoanDemoError(409, 'CONFLICT', `Application is not awaiting a decision (status: ${app.status})`);
  }
  if (decision === 'reject' && !reason) {
    throw new LoanDemoError(400, 'VALIDATION_ERROR', 'A reason is required to reject an application');
  }
  if (decision === 'approve' && app.status === 'bm_review' && Number(app.requestedAmount) > Number(store.policy.bmApprovalLimitBdt)) {
    throw new LoanDemoError(409, 'CONFLICT', 'Amount exceeds the branch manager approval limit — area manager approval required');
  }
  if (decision === 'approve') {
    const product = store.products.find((p) => p.id === app.productId);
    const needed = product?.guarantorsRequired ?? store.policy.guarantorsRequired;
    if (app.guarantors.length < needed) {
      throw new LoanDemoError(409, 'CONFLICT', `Guarantor requirement not met (${app.guarantors.length}/${needed})`);
    }
  }

  const now = new Date().toISOString();
  store.steps.push({
    id: randomUUID(), applicationId, stage: 'decision',
    action: decision === 'approve' ? 'approved' : 'rejected',
    actorRole: ctx.role, actorId: ctx.userId, note: reason ?? null, payload: null, createdAt: now,
  });

  app.status = decision === 'approve' ? 'approved' : 'rejected';
  app.decisionReason = decision === 'reject' ? (reason ?? null) : app.decisionReason;
  app.decidedBy = ctx.userId;
  app.decidedAt = now;
  app.updatedAt = now;
  return app;
}

export function demoLoanSchedule(store: LoanDemoData, applicationId: string, startFrom?: Date): LoanSchedule {
  const app = store.applications.find((a) => a.id === applicationId);
  if (!app) throw new LoanDemoError(404, 'NOT_FOUND', 'Loan application not found');
  const product = store.products.find((p) => p.id === app.productId)!;
  return computeLoanSchedule({
    principal: app.requestedAmount,
    annualRatePercent: product.interestRate,
    method: product.interestMethod,
    termMonths: app.termMonths,
    frequency: product.installmentFrequency,
    gracePeriodInstallments: product.gracePeriodInstallments,
    startFrom,
  });
}

export function demoPipeline(store: LoanDemoData): LoanPipelineBucket[] {
  const statuses: LoanApplicationStatus[] = ['submitted', 'officer_review', 'bm_review', 'am_review', 'approved', 'rejected', 'disbursed', 'closed'];
  return statuses
    .map((status) => {
      const items = store.applications.filter((a) => a.status === status);
      return {
        status,
        count: items.length,
        totalAmount: items.reduce((s, a) => s + Number(a.requestedAmount), 0).toFixed(2),
      } satisfies LoanPipelineBucket;
    })
    .filter((b) => b.count > 0);
}

// ── Governance store operations ─────────────────────────────────────────────

export function upsertDemoApprovalMatrix(store: LoanDemoData, rows: ApprovalMatrixRow[]): ApprovalMatrixRow[] {
  store.approvalMatrix = rows.map((r) => ({ ...r, id: r.id ?? randomUUID() }));
  return store.approvalMatrix;
}

export function demoMemberFactsFor(store: LoanDemoData, memberId: string): DemoMemberFacts {
  return (
    store.memberFacts[memberId] ?? {
      monthlyIncome: '15000.00', savingsBalance: '0.00', activeLoanBalance: '0.00',
      activeMonthlyInstallment: '0.00', completedCycles: [], overdueInstallments: [],
      photoUrl: null, signatureUrl: null, phone: '01700000000',
    }
  );
}

/** Rebuild facts whose demo seed can drift: active loans are live-aggregated. */
export function demoLiveFacts(store: LoanDemoData, memberId: string): DemoMemberFacts {
  const facts = demoMemberFactsFor(store, memberId);
  const active = store.applications.filter(
    (a) => a.memberId === memberId && ['approved', 'disbursed'].includes(a.status),
  );
  return {
    ...facts,
    activeLoanBalance: active.reduce((s, a) => s + Number(a.requestedAmount), 0).toFixed(2),
  };
}

export function saveDemoUtilizationPlan(
  store: LoanDemoData,
  applicationId: string,
  plan: UtilizationPlanInput,
  userId: string | null,
): DemoUtilizationPlan {
  const app = store.applications.find((a) => a.id === applicationId);
  if (!app) throw new LoanDemoError(404, 'NOT_FOUND', 'Loan application not found');
  const existing = store.utilizationPlans.find((p) => p.applicationId === applicationId);
  if (existing && existing.status === 'verified') {
    throw new LoanDemoError(409, 'CONFLICT', 'Utilization plan already verified and locked');
  }
  if (existing) {
    existing.items = plan.items;
    return existing;
  }
  const created: DemoUtilizationPlan = {
    id: randomUUID(), applicationId, items: plan.items, status: 'planned',
    verification: null, verifiedBy: null, verifiedAt: null, createdAt: new Date().toISOString(),
  };
  store.utilizationPlans.push(created);
  store.steps.push({
    id: randomUUID(), applicationId, stage: 'officer_visit', action: 'done',
    actorRole: 'account_officer', actorId: userId, note: 'Utilization plan captured',
    payload: { utilization: plan.items.map((i) => `${i.category}:${i.amount}`) }, createdAt: new Date().toISOString(),
  });
  return created;
}

export function verifyDemoUtilization(
  store: LoanDemoData,
  applicationId: string,
  input: UtilizationVerifyInput,
  userId: string | null,
): DemoUtilizationPlan {
  const plan = store.utilizationPlans.find((p) => p.applicationId === applicationId);
  if (!plan) throw new LoanDemoError(404, 'NOT_FOUND', 'Utilization plan not found for this application');
  if (plan.status === 'verified') throw new LoanDemoError(409, 'CONFLICT', 'Utilization plan already verified');
  const plannedCats = new Set(plan.items.map((i) => i.category));
  for (const item of input.verifiedItems) {
    if (!plannedCats.has(item.category)) {
      throw new LoanDemoError(400, 'VALIDATION_ERROR', `Verified category "${item.category}" is not in the plan`);
    }
  }
  plan.verification = { items: input.verifiedItems, verifierNote: input.verifierNote ?? null };
  plan.status = 'verified';
  plan.verifiedBy = userId;
  plan.verifiedAt = new Date().toISOString();
  store.steps.push({
    id: randomUUID(), applicationId, stage: 'bm_review', action: 'done',
    actorRole: 'branch_manager', actorId: userId, note: 'Utilization verified',
    payload: null, createdAt: new Date().toISOString(),
  });
  return plan;
}
// ── Disbursement store operations (mirrors 0016 + the service-layer gates) ──

function emptyChecks(): Record<DisbursementCheck, { done: boolean; note: string | null }> {
  return Object.fromEntries(
    (DISBURSEMENT_CHECKS as readonly DisbursementCheck[]).map((c) => [c, { done: false, note: null }]),
  ) as Record<DisbursementCheck, { done: boolean; note: string | null }>;
}

const SAMITY_NAMES: Record<string, string> = {
  '00000000-0000-4000-8000-0000000000s1': 'Dhaka Central Samity',
  '00000000-0000-4000-8000-0000000000s2': 'Mymensingh Sadar Samity',
};

const BRANCH_NAMES: Record<string, string> = {
  '00000000-0000-4000-8000-0000000000b1': 'Dhaka Branch',
  '00000000-0000-4000-8000-0000000000b2': 'Mymensingh Branch',
};

export function demoSamityName(samityId: string | null): string | null {
  return samityId ? (SAMITY_NAMES[samityId] ?? null) : null;
}

export function demoBranchName(branchId: string): string {
  return BRANCH_NAMES[branchId] ?? 'Branch';
}

/** Ensure (and return) the disbursement record for an application. */
export function demoDisbursementFor(store: LoanDemoData, applicationId: string): DisbursementRecord {
  const app = store.applications.find((a) => a.id === applicationId);
  if (!app) throw new LoanDemoError(404, 'NOT_FOUND', 'Loan application not found');
  let rec = store.disbursements.find((d) => d.applicationId === applicationId);
  if (!rec) {
    const product = store.products.find((p) => p.id === app.productId);
    rec = {
      id: randomUUID(),
      applicationId,
      orgId: store.orgId,
      branchId: app.branchId,
      samityId: null,
      applicationNumber: app.applicationNumber,
      memberId: app.memberId,
      memberName: demoMemberName(app.memberId),
      memberCode: demoMemberCode(app.memberId),
      productName: product?.name ?? null,
      amount: app.requestedAmount,
      mode: 'cash_branch',
      status: 'pending',
      disbursementDate: new Date().toISOString().slice(0, 10),
      plannedDate: null,
      checks: emptyChecks(),
      mfsReference: null,
      bankReference: null,
      cashReceivedByName: null,
      actualUserOfFunds: null,
      actualUserRelation: null,
      note: null,
      schedule: { schedule: { method: 'declining_balance', installmentCount: 0, installmentAmount: '0.00', totalInterest: '0.00', totalPayable: '0.00', installments: [] }, rows: [], shiftedCount: 0 },
      preparedBy: null,
      preparedAt: null,
      disbursedBy: null,
      disbursedAt: new Date().toISOString(),
      loanNumber: null,
      voucherNumber: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdAt: new Date().toISOString(),
    };
    store.disbursements.push(rec);
  }
  return rec;
}

export interface DemoDisbursementQueueItem {
  applicationId: string;
  applicationNumber: string;
  branchId: string;
  branchName: string;
  samityId: string | null;
  samityName: string | null;
  memberId: string;
  memberName: string;
  memberCode: string;
  productName: string | null;
  amount: string;
  plannedDate: string | null;
  checksDone: number;
  checksTotal: number;
  ready: boolean;
  mode: DisbursementMode;
  disbursementDate: string | null;
  status: 'pending' | 'completed';
}

/** Branch queue: approved applications, grouped client-side by samity/date. */
export function demoDisbursementQueue(store: LoanDemoData, branchId?: string): DemoDisbursementQueueItem[] {
  return store.applications
    .filter((a) => a.status === 'approved' && (branchId ? a.branchId === branchId : true))
    .map((app) => {
      const product = store.products.find((p) => p.id === app.productId);
      const rec = store.disbursements.find((d) => d.applicationId === app.id);
      const checks = rec?.checks ?? emptyChecks();
      const vals = DISBURSEMENT_CHECKS.map((c) => checks[c]);
      return {
        applicationId: app.id,
        applicationNumber: app.applicationNumber,
        branchId: app.branchId,
        branchName: demoBranchName(app.branchId),
        samityId: rec?.samityId ?? null,
        samityName: demoSamityName(rec?.samityId ?? null),
        memberId: app.memberId,
        memberName: demoMemberName(app.memberId),
        memberCode: demoMemberCode(app.memberId),
        productName: product?.name ?? null,
        amount: app.requestedAmount,
        plannedDate: rec?.plannedDate ?? null,
        checksDone: vals.filter((v) => v.done).length,
        checksTotal: DISBURSEMENT_CHECKS.length,
        ready: vals.every((v) => v.done),
        mode: rec?.mode ?? 'cash_branch',
        disbursementDate: rec?.status === 'completed' ? (rec?.disbursementDate ?? null) : null,
        status: (rec?.status === 'completed' ? 'completed' : 'pending') as 'pending' | 'completed',
      };
    })
    .sort(
      (a, b) =>
        (a.plannedDate ?? '9999-12-31').localeCompare(b.plannedDate ?? '9999-12-31') ||
        a.applicationNumber.localeCompare(b.applicationNumber),
    );
}

export interface DemoDisbursementCheckInput {
  check: DisbursementCheck;
  done: boolean;
  note?: string | null;
}

export interface DemoDisburseInput {
  mode: DisbursementMode;
  disbursementDate?: string;
  checkItems?: DemoDisbursementCheckInput[];
  mfsReference?: string | null;
  bankReference?: string | null;
  cashReceivedByName?: string | null;
  actualUserOfFunds?: string | null;
  actualUserRelation?: string | null;
  note?: string | null;
  branchCashLimitBdt?: string | null;
  cashAvailableBdt?: string | null;
}

function cashOutToday(store: LoanDemoData, branchId: string, date: string, excludeId?: string): number {
  return store.disbursements
    .filter(
      (d) =>
        d.branchId === branchId &&
        d.applicationId !== excludeId &&
        CASH_MODES.includes(d.mode) &&
        d.disbursementDate === date,
    )
    .reduce((s, d) => s + Number(d.amount), 0);
}

export interface DemoPrepareInput {
  plannedDate?: string;
  disbursementDate?: string;
  checkItems?: DemoDisbursementCheckInput[];
  mode?: DisbursementMode;
  note?: string | null;
}

/**
 * Step 1 of the two-step control (requirement 6): the Accountant records
 * check progress, the planned date, and the mode — without paying.
 */
export function prepareDemoDisbursement(
  store: LoanDemoData,
  applicationId: string,
  input: DemoPrepareInput,
  ctx: { userId: string | null; role: string },
): DisbursementRecord {
  if (!['super_admin', 'org_admin', 'branch_manager', 'accountant', 'account_officer'].includes(ctx.role)) {
    throw new LoanDemoError(403, 'FORBIDDEN', 'Only an accountant (or branch manager) can prepare a disbursement');
  }
  const app = store.applications.find((a) => a.id === applicationId);
  if (!app) throw new LoanDemoError(404, 'NOT_FOUND', 'Loan application not found');
  if (app.status !== 'approved') {
    throw new LoanDemoError(409, 'CONFLICT', `Only approved applications can be prepared for disbursement (status: ${app.status})`);
  }
  const rec = demoDisbursementFor(store, applicationId);
  if (rec.status === 'completed') throw new LoanDemoError(409, 'CONFLICT', 'This loan has already been disbursed');
  if (input.mode) rec.mode = input.mode;
  if (input.plannedDate) rec.plannedDate = input.plannedDate;
  if (input.disbursementDate) rec.disbursementDate = input.disbursementDate;
  if (input.note !== undefined) rec.note = input.note;
  for (const item of input.checkItems ?? []) {
    rec.checks[item.check] = { done: item.done, note: item.note ?? null };
  }
  if (rec.status === 'cancelled') {
    rec.status = 'pending';
    rec.cancelledAt = null;
    rec.cancelledBy = null;
    rec.cancelReason = null;
  }
  rec.preparedBy = ctx.userId;
  rec.preparedAt = new Date().toISOString();
  rec.status = 'prepared';
  return rec;
}

export interface DemoAuthorizeInput {
  disbursementDate?: string;
  mfsReference?: string | null;
  bankReference?: string | null;
  cashReceivedByName?: string | null;
  actualUserOfFunds?: string | null;
  actualUserRelation?: string | null;
  branchCashLimitBdt?: string | null;
  cashAvailableBdt?: string | null;
  note?: string | null;
}

export interface DemoAuthorizationResult {
  record: DisbursementRecord;
  journal: JournalEntryDraft | null;
  passbook: LoanPassbookEntry;
  sms: SmsMessage;
  visit: UtilizationVisit;
}

/**
 * Step 2 of the two-step control (requirement 6): the Branch Manager
 * authorizes. Mirrors the transactional `authorize_loan_disbursement` RPC in
 * migration 0018 — cash limit, balanced journal, loan number, stored
 * schedule rows, passbook, SMS, and the 15-day utilization visit.
 */
export function authorizeDemoDisbursement(
  store: LoanDemoData,
  applicationId: string,
  input: DemoAuthorizeInput,
  ctx: { userId: string | null; role: string },
): DemoAuthorizationResult {
  if (!['super_admin', 'org_admin', 'branch_manager'].includes(ctx.role)) {
    throw new LoanDemoError(403, 'FORBIDDEN', 'Only the branch manager can authorize a disbursement');
  }
  const app = store.applications.find((a) => a.id === applicationId);
  if (!app) throw new LoanDemoError(404, 'NOT_FOUND', 'Loan application not found');
  const rec = store.disbursements.find((d) => d.applicationId === applicationId);
  if (!rec) {
    // Creating the pending record here keeps the 404 surface read-only while
    // authorization (a write) reports the real two-step violation.
    demoDisbursementFor(store, applicationId);
    throw new LoanDemoError(409, 'CONFLICT', 'Two-step control violated — an accountant must prepare the disbursement first');
  }
  if (rec.status === 'completed') throw new LoanDemoError(409, 'CONFLICT', 'This loan has already been disbursed');
  if (rec.status !== 'prepared') {
    throw new LoanDemoError(409, 'CONFLICT', 'Two-step control violated — an accountant must prepare the disbursement first');
  }
  for (const c of DISBURSEMENT_CHECKS) {
    if (!rec.checks[c].done) {
      throw new LoanDemoError(409, 'CHECK_NOT_DONE', `Pre-disbursement check not completed: ${c}`);
    }
  }
  if (input.disbursementDate) rec.disbursementDate = input.disbursementDate;

  // Mode-specific evidence (mirrors disbursementCreateSchema + 0016).
  if (CASH_MODES.includes(rec.mode) && !(input.cashReceivedByName ?? rec.cashReceivedByName ?? '').trim()) {
    throw new LoanDemoError(400, 'VALIDATION_ERROR', 'cashReceivedByName is required for cash disbursement');
  }
  if (rec.mode === 'bank_transfer' && !(input.bankReference ?? '').trim()) {
    throw new LoanDemoError(400, 'VALIDATION_ERROR', 'bankReference is required for bank transfer');
  }
  if ((rec.mode === 'bkash' || rec.mode === 'nagad') && !(input.mfsReference ?? '').trim()) {
    throw new LoanDemoError(400, 'VALIDATION_ERROR', 'mfsReference (TrxID) is required for bKash/Nagad');
  }

  // Cash limit at authorization (requirement 6).
  if (CASH_MODES.includes(rec.mode)) {
    const limit = Number(input.branchCashLimitBdt ?? store.branchCashLimits[rec.branchId] ?? '0');
    const claimedAvailable = input.cashAvailableBdt === undefined ? null : Number(input.cashAvailableBdt);
    if (claimedAvailable !== null && claimedAvailable < Number(app.requestedAmount)) {
      throw new LoanDemoError(409, 'CASH_LIMIT', `Recorded available cash ${input.cashAvailableBdt} is less than the payout ${app.requestedAmount}`);
    }
    const outToday = cashOutToday(store, rec.branchId, rec.disbursementDate, rec.applicationId);
    if (outToday + Number(app.requestedAmount) > limit) {
      throw new LoanDemoError(
        409,
        'CASH_LIMIT',
        `Branch cash limit exceeded: ${outToday.toFixed(2)} already out today + ${Number(app.requestedAmount).toFixed(2)} requested > ${limit.toFixed(2)} limit`,
      );
    }
  }

  const product = store.products.find((p) => p.id === app.productId);
  const now = new Date().toISOString();

  // Loan number (requirement 8): LN-<branchCode>-<YY>-<seq>.
  const branchCode = rec.branchId === BRANCH_MYMENSINGH ? 'MYM' : 'DHK';
  store.loanSeq[rec.branchId] = (store.loanSeq[rec.branchId] ?? 0) + 1;
  const loanNumber = `LN-${branchCode}-${new Date().getFullYear().toString().slice(2)}-${String(store.loanSeq[rec.branchId]).padStart(4, '0')}`;

  // Stored schedule (requirement 4): computed once, dates shifted off holidays.
  const schedule = computeDisbursementSchedule({
    principal: app.requestedAmount,
    annualRatePercent: product?.interestRate ?? 0,
    method: product?.interestMethod ?? 'declining_balance',
    termMonths: app.termMonths,
    frequency: product?.installmentFrequency ?? 'monthly',
    gracePeriodInstallments: product?.gracePeriodInstallments,
    disbursementDate: new Date(`${rec.disbursementDate}T00:00:00Z`),
    holidays: store.holidays,
    holidayAction: 'shift_forward',
    weeklyClosureEnabled: false,
  });
  rec.schedule = schedule;

  rec.cashReceivedByName = input.cashReceivedByName ?? rec.cashReceivedByName ?? null;
  rec.actualUserOfFunds = input.actualUserOfFunds ?? null;
  rec.actualUserRelation = input.actualUserRelation ?? null;
  rec.mfsReference = input.mfsReference ?? null;
  rec.bankReference = input.bankReference ?? null;
  if (input.note !== undefined) rec.note = input.note;

  // Accounting entries (requirement 5): debit loan portfolio, credit the
  // settlement account and the collected fee incomes.
  const feeAmounts = {
    processingFee: ((Number(app.requestedAmount) * (product?.processingFeeRate ?? 0)) / 100).toFixed(2),
    serviceCharge: ((Number(app.requestedAmount) * (product?.serviceCharge ?? 0)) / 100).toFixed(2),
    insurancePremium: ((Number(app.requestedAmount) * (product?.insurancePremiumRate ?? 0)) / 100).toFixed(2),
  };
  const journal = buildDisbursementJournal({
    applicationId,
    disbursementDate: rec.disbursementDate,
    principal: app.requestedAmount,
    mode: rec.mode,
    feeAmounts,
  });
  store.journals.push(journal);

  // Passbook (requirement 8).
  const passbook: LoanPassbookEntry = {
    id: randomUUID(),
    applicationId,
    memberId: app.memberId,
    loanNumber,
    entryDate: rec.disbursementDate,
    description: `ঋণ বিতরণ / Loan disbursed (${product?.name ?? ''})`,
    debit: app.requestedAmount,
    credit: '0.00',
    balanceAfter: app.requestedAmount,
  };
  store.passbookEntries.push(passbook);

  // SMS (requirement 8).
  const facts = store.memberFacts[app.memberId];
  const sms: SmsMessage = {
    id: randomUUID(),
    memberId: app.memberId,
    phone: facts?.phone ?? null,
    template: 'loan_disbursed',
    body: loanDisbursementSms({ memberName: rec.memberName, amount: app.requestedAmount, loanNumber }),
    status: 'queued',
    createdAt: now,
  };
  store.smsOutbox.push(sms);

  // Utilization visit 15 days out (requirement 9).
  const visit: UtilizationVisit = {
    id: randomUUID(),
    applicationId,
    memberId: app.memberId,
    scheduledDate: new Date(new Date(`${rec.disbursementDate}T00:00:00Z`).getTime() + 15 * 86_400_000).toISOString().slice(0, 10),
    status: 'scheduled',
    visitedAt: null,
    notes: null,
  };
  store.utilizationVisits = store.utilizationVisits.filter((v) => v.applicationId !== applicationId);
  store.utilizationVisits.push(visit);

  rec.status = 'completed';
  rec.loanNumber = loanNumber;
  rec.voucherNumber = `VCH-${loanNumber}`;
  rec.preparedBy = rec.preparedBy ?? ctx.userId;
  rec.preparedAt = rec.preparedAt ?? now;
  rec.disbursedBy = ctx.userId;
  rec.disbursedAt = now;

  app.status = 'disbursed';
  app.updatedAt = now;
  store.steps.push({
    id: randomUUID(),
    applicationId,
    stage: 'decision',
    action: 'done',
    actorRole: ctx.role,
    actorId: ctx.userId,
    note: `Loan disbursed (${rec.mode}) — ${loanNumber}, ${schedule.rows.length} installments generated`,
    payload: null,
    createdAt: now,
  });
  return { record: rec, journal, passbook, sms, visit };
}

/**
 * Rollback (requirement 10): cancel a completed disbursement on the same
 * day, with a reason and an approver role. Mirrors the transactional
 * `cancel_loan_disbursement` RPC — posts the reversal journal, reverses the
 * passbook, drops the schedule and the scheduled visit, reverts the loan.
 */
export function cancelDemoDisbursement(
  store: LoanDemoData,
  applicationId: string,
  reason: string,
  ctx: { userId: string | null; role: string },
): { record: DisbursementRecord; reversal: JournalEntryDraft | null; sms: SmsMessage } {
  if (!['super_admin', 'org_admin', 'branch_manager'].includes(ctx.role)) {
    throw new LoanDemoError(403, 'FORBIDDEN', 'Only a manager can cancel a disbursement');
  }
  if (reason.trim().length < 10) {
    throw new LoanDemoError(400, 'VALIDATION_ERROR', 'A reason of at least 10 characters is required');
  }
  const rec = store.disbursements.find((d) => d.applicationId === applicationId);
  if (!rec) throw new LoanDemoError(404, 'NOT_FOUND', 'Disbursement record not found');
  if (rec.status !== 'completed') {
    throw new LoanDemoError(409, 'CONFLICT', `Only a completed disbursement can be cancelled (status: ${rec.status})`);
  }
  const today = new Date().toISOString().slice(0, 10);
  if (rec.disbursementDate !== today) {
    throw new LoanDemoError(409, 'CONFLICT', `A disbursement can only be cancelled on the same day (disbursed ${rec.disbursementDate})`);
  }

  const now = new Date().toISOString();

  // Reversal journal (requirement 5): flip the original entry's debits/credits.
  const original = [...store.journals].reverse().find((j) => j.sourceType === 'loan_disbursement' && j.sourceId === applicationId);
  let reversal: JournalEntryDraft | null = null;
  if (original) {
    reversal = {
      ...original,
      entryDate: today,
      sourceType: 'loan_disbursement_reversal',
      memo: `Reversal: ${reason}`,
      lines: original.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
    };
    store.journals.push(reversal);
  }

  // Passbook reversal entry.
  const app = store.applications.find((a) => a.id === applicationId);
  const priorBalance = store.passbookEntries
    .filter((p) => p.applicationId === applicationId)
    .reduce((s, p) => s + Number(p.credit) - Number(p.debit), 0);
  const balanceAfter = (priorBalance + Number(rec.amount)).toFixed(2);
  store.passbookEntries.push({
    id: randomUUID(),
    applicationId,
    memberId: app?.memberId ?? rec.memberId,
    loanNumber: rec.loanNumber ?? '',
    entryDate: today,
    description: `বাতিল / Disbursement cancelled: ${reason}`,
    debit: '0.00',
    credit: rec.amount,
    balanceAfter,
  });

  // Drop the schedule (regenerated on re-authorization) and the scheduled visit.
  rec.schedule = { schedule: { method: 'declining_balance', installmentCount: 0, installmentAmount: '0.00', totalInterest: '0.00', totalPayable: '0.00', installments: [] }, rows: [], shiftedCount: 0 };
  store.utilizationVisits = store.utilizationVisits.filter((v) => v.applicationId !== applicationId);

  const cancelledAt = now;
  rec.status = 'cancelled';
  rec.cancelledAt = cancelledAt;
  rec.cancelledBy = ctx.userId;
  rec.cancelReason = reason;

  if (app && app.status === 'disbursed') {
    app.status = 'approved';
    app.updatedAt = now;
  }

  // Notify the member of the cancellation.
  const sms: SmsMessage = {
    id: randomUUID(),
    memberId: app?.memberId ?? rec.memberId,
    phone: store.memberFacts[app?.memberId ?? '']?.phone ?? null,
    template: 'loan_cancelled',
    body: `প্রিয় সদস্য, আপনার ঋণ ${rec.loanNumber ?? rec.applicationNumber} বাতিল করা হয়েছে। — সমিতি ম্যানেজার`,
    status: 'queued',
    createdAt: now,
  };
  store.smsOutbox.push(sms);

  store.steps.push({
    id: randomUUID(),
    applicationId,
    stage: 'decision',
    action: 'done',
    actorRole: ctx.role,
    actorId: ctx.userId,
    note: `Disbursement cancelled (same-day rollback): ${reason}`,
    payload: null,
    createdAt: now,
  });
  return { record: rec, reversal, sms };
}

// ── Demo read models for the governance artifacts ──────────────────────────

export function demoVoucherFor(store: LoanDemoData, applicationId: string): LoanVoucherData {
  const rec = store.disbursements.find((d) => d.applicationId === applicationId);
  if (!rec || rec.status !== 'completed') throw new LoanDemoError(404, 'NOT_FOUND', 'No completed disbursement for this application');
  const journal = [...store.journals].reverse().find((j) => j.sourceType === 'loan_disbursement' && j.sourceId === applicationId) ?? null;
  return {
    voucherNumber: rec.voucherNumber ?? `VCH-${rec.loanNumber ?? ''}`,
    loanNumber: rec.loanNumber ?? '',
    orgName: 'সমিতি ম্যানেজার / Samity Manager',
    branchName: demoBranchName(rec.branchId),
    disbursementDate: rec.disbursementDate,
    memberName: rec.memberName,
    memberCode: rec.memberCode,
    applicationNumber: rec.applicationNumber,
    productName: rec.productName,
    amount: rec.amount,
    mode: rec.mode,
    modeBn: DISBURSEMENT_MODE_LABELS_BN[rec.mode],
    cashReceivedByName: rec.cashReceivedByName,
    mfsReference: rec.mfsReference,
    bankReference: rec.bankReference,
    actualUserOfFunds: rec.actualUserOfFunds,
    actualUserRelation: rec.actualUserRelation,
    journal,
    preparedBy: rec.preparedBy,
    authorizedBy: rec.disbursedBy,
    generatedAt: new Date().toISOString(),
  };
}

export function demoAgreementFor(store: LoanDemoData, applicationId: string): LoanAgreementData {
  const app = store.applications.find((a) => a.id === applicationId);
  if (!app) throw new LoanDemoError(404, 'NOT_FOUND', 'Loan application not found');
  const rec = store.disbursements.find((d) => d.applicationId === applicationId);
  if (!rec || rec.status !== 'completed') throw new LoanDemoError(404, 'NOT_FOUND', 'No completed disbursement for this application');
  const product = store.products.find((p) => p.id === app.productId);
  const facts = store.memberFacts[app.memberId];
  return {
    loanNumber: rec.loanNumber ?? '',
    orgName: 'সমিতি ম্যানেজার / Samity Manager',
    agreementDate: rec.disbursementDate,
    member: {
      name: rec.memberName,
      nameBn: null,
      code: rec.memberCode,
      address: null,
      mobile: facts?.phone ?? null,
    },
    product: {
      name: product?.name ?? rec.productName ?? '',
      nameBn: product?.nameBn ?? null,
      interestRate: product?.interestRate ?? 0,
      interestMethod: product?.interestMethod ?? 'declining_balance',
      installmentFrequency: product?.installmentFrequency ?? 'monthly',
    },
    amount: rec.amount,
    termMonths: app.termMonths,
    totalPayable: rec.schedule.schedule.totalPayable,
    totalInterest: rec.schedule.schedule.totalInterest,
    installments: rec.schedule.rows.map((r) => ({ seq: r.seq, dueDate: r.dueDate, principal: r.principal, interest: r.interest, total: r.total })),
    guarantors: app.guarantors.map((g) => ({ name: g.name, relation: g.relation, mobile: g.mobile })),
    utilization: (store.utilizationPlans.find((p) => p.applicationId === applicationId)?.items ?? []).map((i) => ({ category: i.category, description: i.description, amount: i.amount })),
    purpose: app.purpose,
  };
}

// ── Holiday calendar operations ─────────────────────────────────────────────

export function demoHolidayList(store: LoanDemoData): Holiday[] {
  return [...store.holidays].sort((a, b) => a.date.localeCompare(b.date));
}

export function demoHolidayUpsert(store: LoanDemoData, incoming: Holiday[]): Holiday[] {
  for (const h of incoming) {
    const existing = store.holidays.find((x) => x.date === h.date);
    if (existing) {
      existing.name = h.name;
      existing.nameBn = h.nameBn ?? null;
      existing.isRecurring = h.isRecurring;
    } else {
      store.holidays.push({ ...h, nameBn: h.nameBn ?? null });
    }
  }
  return demoHolidayList(store);
}

export function demoHolidayDelete(store: LoanDemoData, date: string): Holiday[] {
  const before = store.holidays.length;
  store.holidays = store.holidays.filter((h) => h.date !== date);
  if (store.holidays.length === before) {
    throw new LoanDemoError(404, 'NOT_FOUND', `No holiday on ${date}`);
  }
  return demoHolidayList(store);
}

/** Stored schedule for an application (preview before, real rows after). */
export function demoScheduleFor(store: LoanDemoData, applicationId: string): {
  rows: DisbursementRecord['schedule']['rows'];
  shiftedCount: number;
  stored: boolean;
} {
  const app = store.applications.find((a) => a.id === applicationId);
  if (!app) throw new LoanDemoError(404, 'NOT_FOUND', 'Loan application not found');
  const product = store.products.find((p) => p.id === app.productId);
  const rec = store.disbursements.find((d) => d.applicationId === applicationId);
  if (rec && rec.status === 'completed') {
    return { rows: rec.schedule.rows, shiftedCount: rec.schedule.shiftedCount, stored: true };
  }
  if (rec && rec.status === 'cancelled') {
    // Rolled back: the stored schedule was dropped; no preview either.
    return { rows: [], shiftedCount: 0, stored: false };
  }
  const schedule = computeDisbursementSchedule({
    principal: app.requestedAmount,
    annualRatePercent: product?.interestRate ?? 0,
    method: product?.interestMethod ?? 'declining_balance',
    termMonths: app.termMonths,
    frequency: product?.installmentFrequency ?? 'monthly',
    gracePeriodInstallments: product?.gracePeriodInstallments,
    disbursementDate: new Date(`${rec?.disbursementDate ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`),
    holidays: store.holidays,
    holidayAction: 'shift_forward',
    weeklyClosureEnabled: false,
  });
  return { rows: schedule.rows, shiftedCount: schedule.shiftedCount, stored: false };
}
