/**
 * Loan module shared types + Zod schemas.
 *
 * Product taxonomy (NGO-MFI standard):
 *   general        – basic / general loan
 *   seasonal_agri  – seasonal agriculture (crop cycle aligned)
 *   microenterprise– microenterprise / SME
 *   housing        – housing / sanitation
 *   education      – education
 *   emergency      – emergency
 *   migration      – overseas migration
 *   device         – device (solar, phone, cookstove)
 *   climate        – climate adaptation
 *
 * Interest method: declining_balance (MRA-standard) or flat. Money is
 * transmitted as string; numeric(14,2) in DB.
 */

import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';

// ── Enums (mirror DB enums) ──────────────────────────────────────────────────
export const LOAN_PRODUCT_TYPES = [
  'general',
  'seasonal_agri',
  'microenterprise',
  'housing',
  'education',
  'emergency',
  'migration',
  'device',
  'climate',
] as const;
export type LoanProductType = (typeof LOAN_PRODUCT_TYPES)[number];

export const INSTALLMENT_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly'] as const;
export type InstallmentFrequency = (typeof INSTALLMENT_FREQUENCIES)[number];

export const INTEREST_METHODS = ['declining_balance', 'flat'] as const;
export type InterestMethod = (typeof INTEREST_METHODS)[number];

export const LOAN_APPLICATION_STATUSES = [
  'draft',
  'submitted',
  'officer_review',
  'bm_review',
  'am_review',
  'approved',
  'rejected',
  'disbursed',
  'closed',
  'written_off',
] as const;
export type LoanApplicationStatus = (typeof LOAN_APPLICATION_STATUSES)[number];

/** Stages requiring area-manager sign-off (amt > bm_approval_limit_bdt). */
export const AM_STAGES: readonly LoanApplicationStatus[] = ['am_review'];

// ── Regulatory rate cap (editable per org) ───────────────────────────────────
/**
 * The MRA limit is publicly stated as 27% on declining balance; stored as an
 * org-editable row (loan_policies.rate_cap_percent) so it can change with
 * regulation. A flat rate's effective declining-equivalent is roughly double
 * the stated rate for typical terms, so flat rates are validated as
 * rate × FLAT_RATE_FACTOR against the same cap.
 */
export const DEFAULT_MRA_CAP_PERCENT = 27;
export const FLAT_RATE_FACTOR = 2;

export const loanPolicyUpdateSchema = z.object({
  rateCapPercent: z.coerce.number().min(0).max(100),
  bmApprovalLimitBdt: moneySchema,
  guarantorsRequired: z.coerce.number().int().min(0).max(5).default(1),
  maxActiveLoansPerMember: z.coerce.number().int().min(1).max(10).default(2),
  minDaysBetweenLoans: z.coerce.number().int().min(0).max(365).default(0),
  // ── Loan-cycle governance (0014 columns; all optional on update) ──
  firstLoanCapBdt: moneySchema.optional(),
  stepUpPercent: z.coerce.number().min(0).max(500).optional(),
  maxCycleCapBdt: moneySchema.optional(),
  overdueGraceDays: z.coerce.number().int().min(0).max(365).optional(),
  maxDebtToIncomeRatio: z.coerce.number().min(0).max(5).optional(),
  maxLoanToSavingsRatio: z.coerce.number().min(0).max(50).optional(),
  maxOverlappingLoans: z.coerce.number().int().min(1).max(10).optional(),
});
export type LoanPolicyUpdateInput = z.infer<typeof loanPolicyUpdateSchema>;

// ── Product catalog ──────────────────────────────────────────────────────────
export const loanProductCreateSchema = z.object({
  orgId: uuidSchema,
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(120),
  nameBn: z.string().trim().min(2).max(120).optional(),
  productType: z.enum(LOAN_PRODUCT_TYPES),
  minAmount: moneySchema,
  maxAmount: moneySchema,
  termMonths: z.coerce.number().int().min(1).max(120),
  installmentFrequency: z.enum(INSTALLMENT_FREQUENCIES),
  interestMethod: z.enum(INTEREST_METHODS),
  interestRate: z.coerce.number().min(0).max(100), // percent per annum
  serviceCharge: z.coerce.number().min(0).max(100).default(0), // percent flat
  processingFeeRate: z.coerce.number().min(0).max(100).default(0), // percent of principal
  insurancePremiumRate: z.coerce.number().min(0).max(100).default(0), // percent of principal
  gracePeriodInstallments: z.coerce.number().int().min(0).max(12).default(0),
  eligibilityNote: z.string().trim().max(500).optional(),
  requiredDocuments: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  guarantorsRequired: z.coerce.number().int().min(0).max(5).default(1),
  guarantorMinRelationship: z.string().trim().max(60).optional(), // e.g. 'family_or_business'
  isActive: z.boolean().default(true),
});
export type LoanProductCreateInput = z.infer<typeof loanProductCreateSchema>;

/** Throws when a product's rate breaches the org's policy cap. */
export class RateCapExceededError extends Error {
  constructor(
    public readonly method: InterestMethod,
    public readonly rate: number,
    public readonly cap: number,
  ) {
    super(
      method === 'flat'
        ? `Flat rate ${rate}% has a declining-equivalent of ${rate * FLAT_RATE_FACTOR}% — above the regulatory cap of ${cap}%`
        : `Declining rate ${rate}% exceeds the regulatory cap of ${cap}%`,
    );
  }
}

export function effectiveRateForMethod(input: { interestRate: number; interestMethod: InterestMethod }): number {
  return input.interestMethod === 'flat' ? input.interestRate * FLAT_RATE_FACTOR : input.interestRate;
}

/**
 * Validate a (rate, method) pair against the org's cap. Pure; used by the
 * API on product create/update and mirrored in the UI for live feedback.
 */
export function validateRateAgainstCap(input: { interestRate: number; interestMethod: InterestMethod }, capPercent: number): void {
  if (effectiveRateForMethod(input) > capPercent) {
    throw new RateCapExceededError(input.interestMethod, input.interestRate, capPercent);
  }
}

// ── Application workflow ─────────────────────────────────────────────────────
export const guarantorSchema = z.object({
  name: z.string().trim().min(3).max(120),
  relation: z.enum(['spouse', 'parent', 'sibling', 'same_group_member', 'business_peer', 'other']),
  mobile: z.string().regex(/^01[3-9]\d{8}$/, 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন (01XXXXXXXXX)'),
  nidLast4: z.string().regex(/^\d{4}$/, 'NID last 4 digits'),
  isMember: z.boolean().default(false),
  consentGiven: z.boolean().default(false),
});
export type GuarantorInput = z.infer<typeof guarantorSchema>;

export const loanApplicationCreateSchema = z.object({
  memberId: uuidSchema,
  productId: uuidSchema,
  requestedAmount: moneySchema,
  purpose: z.string().trim().min(3).max(500),
  termMonths: z.coerce.number().int().min(1).max(120).optional(),
  guarantor: guarantorSchema.optional(),
  /** Stage-1 artifacts: officer visit + enterprise assessment notes. */
  officerVisitNote: z.string().trim().max(1000).optional(),
  enterpriseAssessment: z
    .object({
      activity: z.string().trim().min(2).max(200),
      monthlyRevenueBdt: moneySchema,
      monthlyCostBdt: moneySchema,
      yearsOperating: z.coerce.number().min(0).max(70),
    })
    .optional(),
  householdCheck: z
    .object({
      monthlyIncomeBdt: moneySchema,
      monthlyDebtServiceBdt: moneySchema,
      otherMfiLoans: z.coerce.number().int().min(0).max(20).default(0),
    })
    .optional(),
  requestedAt: z.string().datetime().optional(),
});

/** Steps the wizard must walk, in order. */
export const LOAN_STAGES = [
  'member_request',
  'officer_visit',
  'household_check',
  'guarantor',
  'bm_review',
  'am_review',
  'decision',
] as const;
export type LoanStage = (typeof LOAN_STAGES)[number];

/** Stage actions captured on loan_application_steps (audit trail). */
export const LOAN_STAGE_ACTIONS = ['done', 'approved', 'rejected', 'returned'] as const;
export type LoanStageAction = (typeof LOAN_STAGE_ACTIONS)[number];

/** Which role is responsible for each step. */
export const STAGE_ROLE: Record<LoanStage, string> = {
  member_request: 'account_officer',
  officer_visit: 'account_officer',
  household_check: 'account_officer',
  guarantor: 'account_officer',
  bm_review: 'branch_manager',
  am_review: 'area_manager',
  decision: 'branch_manager',
};

export interface LoanStepPayload {
  amount?: string;
  note?: string;
  guarantor?: GuarantorInput;
  enterpriseAssessment?: { activity: string; monthlyRevenueBdt: string; monthlyCostBdt: string; yearsOperating: number };
  householdCheck?: { monthlyIncomeBdt: string; monthlyDebtServiceBdt: string; otherMfiLoans: number };
  visitNote?: string;
  attachments?: string[];
  /** Utilization plan summary strings (category:amount) captured at a step. */
  utilization?: string[];
}

export const loanStepDoneSchema = z.object({
  stage: z.enum(LOAN_STAGES),
  note: z.string().trim().max(1000).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});
export type LoanStepDoneInput = z.infer<typeof loanStepDoneSchema>;

export const loanDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
});
export type LoanDecisionInput = z.infer<typeof loanDecisionSchema>;

/**
 * Stage machine. `am_review` is skipped for requests within the branch
 * manager's policy limit; the API enforces that at runtime.
 */
export function nextLoanStage(current: LoanApplicationStatus, amountBdt: string, bmApprovalLimitBdt: string): LoanApplicationStatus | null {
  const needsArea = Number(amountBdt) > Number(bmApprovalLimitBdt);
  const transitions: Record<LoanApplicationStatus, LoanApplicationStatus | null> = {
    draft: 'submitted',
    submitted: 'officer_review',
    officer_review: 'bm_review',
    bm_review: needsArea ? 'am_review' : 'approved',
    am_review: 'approved',
    approved: 'disbursed',
    disbursed: 'closed',
    rejected: null,
    closed: null,
    written_off: null,
  };
  return transitions[current];
}

/** Pure repayment schedule (declining balance or flat), used by API + UI. */
export interface ScheduleInstallment {
  seq: number;
  dueDate: string; // ISO date
  principal: string;
  interest: string;
  total: string;
  balanceAfter: string;
}

export interface LoanSchedule {
  method: InterestMethod;
  installmentCount: number;
  installmentAmount: string; // first installment (flat) or level payment (declining)
  totalInterest: string;
  totalPayable: string;
  installments: ScheduleInstallment[];
}

const DAYS_IN: Record<InstallmentFrequency, number> = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 };

function addInterval(from: Date, i: number, freq: InstallmentFrequency): Date {
  const d = new Date(from);
  if (freq === 'monthly') d.setUTCMonth(d.getUTCMonth() + i);
  else d.setUTCDate(d.getUTCDate() + i * DAYS_IN[freq]);
  return d;
}

export function computeLoanSchedule(input: {
  principal: string;
  annualRatePercent: number;
  method: InterestMethod;
  termMonths: number;
  frequency: InstallmentFrequency;
  gracePeriodInstallments?: number;
  startFrom?: Date;
}): LoanSchedule {
  const principal = Number(input.principal);
  const { method, frequency, termMonths } = input;
  const grace = input.gracePeriodInstallments ?? 0;

  // Periods per year from frequency; monthly is the reference calendar.
  const periodsPerYear =
    frequency === 'monthly' ? 12 : frequency === 'biweekly' ? 26 : frequency === 'weekly' ? 52 : 365;
  const installmentCount = termMonths * (frequency === 'monthly' ? 1 : Math.round(periodsPerYear / 12));
  const payN = Math.max(installmentCount - grace, 1);
  const r = input.annualRatePercent / 100 / periodsPerYear;

  // Level installment: annuity for declining; principal + full flat interest for flat.
  const installment =
    method === 'declining_balance'
      ? r > 0
        ? (principal * r) / (1 - Math.pow(1 + r, -payN))
        : principal / payN
      : (principal + (principal * input.annualRatePercent) / 100 * (termMonths / 12)) / installmentCount;

  const installments: ScheduleInstallment[] = [];
  let balance = principal;
  let totalInterest = 0;
  const start = input.startFrom ?? new Date();
  for (let i = 1; i <= installmentCount; i++) {
    const dueDate = addInterval(start, i, frequency).toISOString().slice(0, 10);
    let interest: number;
    let principalPart: number;
    if (i <= grace) {
      interest = balance * r;
      principalPart = 0;
    } else if (method === 'declining_balance') {
      interest = balance * r;
      principalPart = Math.min(installment - interest, balance);
    } else {
      interest = ((principal * input.annualRatePercent) / 100 / installmentCount) * (termMonths / 12);
      principalPart = Math.min(installment - interest, balance);
    }
    totalInterest += interest;
    balance = Math.max(balance - principalPart, 0);
    const total = principalPart + interest;
    installments.push({
      seq: i,
      dueDate,
      principal: principalPart.toFixed(2),
      interest: interest.toFixed(2),
      total: total.toFixed(2),
      balanceAfter: balance.toFixed(2),
    });
  }
  return {
    method,
    installmentCount,
    installmentAmount: installment.toFixed(2),
    totalInterest: totalInterest.toFixed(2),
    totalPayable: (principal + totalInterest).toFixed(2),
    installments,
  };
}

// ── Read models ──────────────────────────────────────────────────────────────
export interface LoanPolicy {
  orgId: string;
  rateCapPercent: number;
  bmApprovalLimitBdt: string;
  guarantorsRequired: number;
  maxActiveLoansPerMember: number;
  minDaysBetweenLoans: number;
  updatedAt: string;
}

export interface LoanProduct {
  id: string;
  orgId: string;
  code: string;
  name: string;
  nameBn: string | null;
  productType: LoanProductType;
  minAmount: string;
  maxAmount: string;
  termMonths: number;
  installmentFrequency: InstallmentFrequency;
  interestMethod: InterestMethod;
  interestRate: number;
  serviceCharge: number;
  processingFeeRate: number;
  insurancePremiumRate: number;
  gracePeriodInstallments: number;
  eligibilityNote: string | null;
  requiredDocuments: string[];
  guarantorsRequired: number;
  guarantorMinRelationship: string | null;
  isActive: boolean;
}

export interface LoanApplicationStep {
  id: string;
  applicationId: string;
  stage: LoanStage;
  action: LoanStageAction;
  actorRole: string;
  actorId: string | null;
  note: string | null;
  payload: LoanStepPayload | null;
  createdAt: string;
}

export interface LoanApplication {
  id: string;
  orgId: string;
  branchId: string;
  memberId: string;
  productId: string;
  applicationNumber: string;
  requestedAmount: string;
  purpose: string;
  status: LoanApplicationStatus;
  termMonths: number;
  guarantors: GuarantorInput[];
  decisionReason: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoanPipelineBucket {
  status: LoanApplicationStatus;
  count: number;
  totalAmount: string;
}
