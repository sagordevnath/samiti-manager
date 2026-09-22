/**
 * Loan governance: approval matrix, loan-cycle progression, overlap checks,
 * utilization plans, and proposal data. Extends 0012/0013 (products +
 * applications workflow) with the governance spec.
 *
 * Money is transmitted as string; numeric(14,2) in DB. All rule helpers are
 * pure so the API (authoritative), the DB triggers (defense in depth) and
 * the web wizard (live feedback) share one implementation.
 */

import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';
import { ROLES } from './roles.js';

// ── 4) Approval matrix ──────────────────────────────────────────────────────
/**
 * Who may approve what: rows map (product, amount band) → the roles allowed
 * to give final approval. Evaluated top-down; the first matching row wins.
 * Designations reuse the fixed role set; `null` amounts open the band.
 */
export const APPROVAL_ACTIONS = ['approve', 'forward', 'reject'] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export const approvalMatrixRowSchema = z
  .object({
    id: uuidSchema.optional(),
    productId: uuidSchema.nullable(), // null → applies to every product
    minAmount: moneySchema.nullable(), // null → no lower bound
    maxAmount: moneySchema.nullable(), // null → no upper bound
    approverRoles: z.array(z.enum(ROLES)).min(1),
    // Amount cap THIS role may approve on its own (null = unlimited / no solo cap)
    soloApprovalLimit: moneySchema.nullable(),
    priority: z.number().int().min(0).max(999).default(0),
    isActive: z.boolean().default(true),
  })
  .refine((row) => row.minAmount == null || row.maxAmount == null || Number(row.minAmount) <= Number(row.maxAmount), {
    message: 'minAmount must not exceed maxAmount',
  });
export type ApprovalMatrixRow = z.infer<typeof approvalMatrixRowSchema>;

export const approvalMatrixUpsertSchema = z.object({
  rows: z.array(approvalMatrixRowSchema).max(100),
});
export type ApprovalMatrixUpsertInput = z.infer<typeof approvalMatrixUpsertSchema>;

export interface ResolvedApproval {
  rowId: string | null;
  approverRoles: string[];
  /** Roles whose solo limit covers this amount (may approve alone). */
  canApproveSolo: string[];
  /** Roles that may approve only jointly / after forwarding upward. */
  needsEscalation: string[];
  matchedBand: { minAmount: string | null; maxAmount: string | null } | null;
}

/**
 * Resolve the matrix for a (product, amount) request. Pure. Rows must be
 * pre-sorted by priority descending (the API persists them in that order);
 * the first active row matching product + band wins. `null` bounds are open.
 */
export function resolveApproval(
  rows: ApprovalMatrixRow[],
  input: { productId: string; amount: string },
): ResolvedApproval {
  const amount = Number(input.amount);
  const active = [...rows]
    .filter((r) => r.isActive)
    .sort((a, b) => b.priority - a.priority);
  const row =
    active.find(
      (r) =>
        (r.productId === null || r.productId === input.productId) &&
        (r.minAmount === null || amount >= Number(r.minAmount)) &&
        (r.maxAmount === null || amount <= Number(r.maxAmount)),
    ) ?? null;

  if (!row) {
    return { rowId: null, approverRoles: [], canApproveSolo: [], needsEscalation: [], matchedBand: null };
  }
  const canApproveSolo = row.approverRoles.filter((role) => {
    const solo = row.soloApprovalLimit;
    return solo === null || amount <= Number(solo);
  });
  return {
    rowId: row.id ?? null,
    approverRoles: [...row.approverRoles],
    canApproveSolo,
    needsEscalation: row.approverRoles.filter((r) => !canApproveSolo.includes(r)),
    matchedBand: { minAmount: row.minAmount, maxAmount: row.maxAmount },
  };
}

// ── 5) Loan-cycle policy + evaluation ───────────────────────────────────────
export const loanCyclePolicySchema = z.object({
  /** First-time borrower cap in BDT. */
  firstLoanCapBdt: moneySchema,
  /** Percentage increase of the cap per fully repaid cycle (e.g. 25 → ×1.25). */
  stepUpPercent: z.coerce.number().min(0).max(500).default(25),
  /** Maximum cap reachable by step-ups. */
  maxCycleCapBdt: moneySchema,
  /** Block new loans while any installment is overdue by more than N days. */
  overdueGraceDays: z.coerce.number().int().min(0).max(365).default(0),
  /** Maximum total installment debt vs monthly household income. */
  maxDebtToIncomeRatio: z.coerce.number().min(0).max(5).default(0.4),
  /** Maximum loan balance vs member savings balance. */
  maxLoanToSavingsRatio: z.coerce.number().min(0).max(50).default(3),
  /** Maximum simultaneous active loans per member across the institution. */
  maxOverlappingLoans: z.coerce.number().int().min(1).max(10).default(2),
});
export type LoanCyclePolicy = z.infer<typeof loanCyclePolicySchema>;
export type LoanCyclePolicyInput = z.input<typeof loanCyclePolicySchema>;

export interface LoanCycleSummary {
  cycleNumber: number; // completed cycles + 1 (1 = first loan)
  completedCycles: number;
  currentCapBdt: string;
  repaidOnTime: number;
  everOverdue: number;
}

/**
 * Cycle cap: first-loan cap × (1 + step-up)ᵏ for each completed cycle,
 * clamped to maxCycleCapBdt. Uses integer-safe fixed-point math (2 decimals).
 */
export function cycleCapFor(policy: LoanCyclePolicy, completedCycles: number): string {
  const base = Number(policy.firstLoanCapBdt);
  const factor = Math.pow(1 + policy.stepUpPercent / 100, completedCycles);
  const raw = base * factor;
  const capped = Math.min(raw, Number(policy.maxCycleCapBdt));
  return (Math.round(capped * 100) / 100).toFixed(2);
}

export function summarizeCycle(
  policy: LoanCyclePolicy,
  history: Array<{ status: 'closed' | 'approved' | 'rejected' | 'disbursed'; closedOnTime: boolean }>,
): LoanCycleSummary {
  const completed = history.filter((h) => h.status === 'closed');
  const completedCycles = completed.length;
  return {
    cycleNumber: completedCycles + 1,
    completedCycles,
    currentCapBdt: cycleCapFor(policy, completedCycles),
    repaidOnTime: completed.filter((h) => h.closedOnTime).length,
    everOverdue: completed.filter((h) => !h.closedOnTime).length,
  };
}

export const ELIGIBILITY_BLOCK_REASONS = [
  'AMOUNT_ABOVE_CYCLE_CAP',
  'OVERDUE_INSTALLMENT',
  'DEBT_TO_INCOME',
  'LOAN_TO_SAVINGS',
  'OVERLAP_LIMIT',
] as const;
export type EligibilityBlockReason = (typeof ELIGIBILITY_BLOCK_REASONS)[number];

export const ELIGIBILITY_BLOCK_MESSAGES_BN: Record<EligibilityBlockReason, string> = {
  AMOUNT_ABOVE_CYCLE_CAP: 'পরিমাণ বর্তমান ঋণ-চক্রের সর্বোচ্চ সীমার বাইরে',
  OVERDUE_INSTALLMENT: 'অপরিশোধিত কিস্তি রয়েছে — আবেদন ব্লক করা হয়েছে',
  DEBT_TO_INCOME: 'মাসিক কিস্তি আয়ের তুলনায় অতিরিক্ত',
  LOAN_TO_SAVINGS: 'ঋণ ও সঞ্চয়ের অনুপাত নীতিমালার বাইরে',
  OVERLAP_LIMIT: 'সংস্থার মধ্যে সক্রিয় ঋণের সংখ্যা সীমা ছাড়িয়েছে',
};

export interface OverdueInstallment {
  installmentId: string;
  loanId: string;
  dueDate: string;
  daysOverdue: number;
  amountDue: string;
}

export interface LoanCycleCheckInput {
  amount: string;
  policy: LoanCyclePolicy;
  cycle: LoanCycleSummary;
  overdueInstallments: OverdueInstallment[];
  /** Existing active installment total per month (this institution). */
  activeMonthlyInstallments: string;
  monthlyIncome: string;
  totalActiveLoanBalance: string;
  savingsBalance: string;
  activeLoanCount: number;
}

export interface LoanCycleCheckResult {
  eligible: boolean;
  blocks: EligibilityBlockReason[];
  details: {
    cycleCapBdt: string;
    worstOverdueDays: number;
    debtToIncome: number;
    loanToSavings: number;
    activeLoanCount: number;
  };
}

/**
 * The full pre-approval gate. Pure; the API runs it on application create
 * AND before final approval (defense in depth).
 */
export function evaluateLoanEligibility(input: LoanCycleCheckInput): LoanCycleCheckResult {
  const { policy, cycle } = input;
  const blocks: EligibilityBlockReason[] = [];

  if (Number(input.amount) > Number(cycle.currentCapBdt)) blocks.push('AMOUNT_ABOVE_CYCLE_CAP');

  const worstOverdue = input.overdueInstallments.reduce((max, o) => Math.max(max, o.daysOverdue), 0);
  if (worstOverdue > policy.overdueGraceDays) blocks.push('OVERDUE_INSTALLMENT');

  const income = Number(input.monthlyIncome);
  const dti = income > 0 ? Number(input.activeMonthlyInstallments) / income : Infinity;
  if (dti > policy.maxDebtToIncomeRatio) blocks.push('DEBT_TO_INCOME');

  const savings = Number(input.savingsBalance);
  const lts = savings > 0 ? Number(input.totalActiveLoanBalance) / savings : Infinity;
  if (lts > policy.maxLoanToSavingsRatio) blocks.push('LOAN_TO_SAVINGS');

  if (input.activeLoanCount > policy.maxOverlappingLoans) blocks.push('OVERLAP_LIMIT');

  return {
    eligible: blocks.length === 0,
    blocks,
    details: {
      cycleCapBdt: cycle.currentCapBdt,
      worstOverdueDays: worstOverdue,
      debtToIncome: Number.isFinite(dti) ? Math.round(dti * 100) / 100 : 99.99,
      loanToSavings: Number.isFinite(lts) ? Math.round(lts * 100) / 100 : 99.99,
      activeLoanCount: input.activeLoanCount,
    },
  };
}

// ── 6) Overlap check (all active loans across the institution) ──────────────
export interface OverlapLoanRow {
  applicationId: string;
  applicationNumber: string;
  productId: string | null;
  productName: string | null;
  status: string;
  outstanding: string;
  monthlyInstallment: string | null;
  branchId: string | null;
}

export interface OverlapReport {
  memberId: string;
  totalActive: number;
  totalOutstanding: string;
  totalMonthlyInstallments: string;
  loans: OverlapLoanRow[];
  exceedsLimit: boolean;
  limit: number;
}

// ── 9) Utilization plan ─────────────────────────────────────────────────────
export const utilizationItemSchema = z.object({
  category: z.string().trim().min(2).max(80), // e.g. 'solar_panel', 'livestock'
  description: z.string().trim().min(2).max(300),
  amount: moneySchema,
});
export type UtilizationItem = z.infer<typeof utilizationItemSchema>;

export const utilizationPlanSchema = z
  .object({
    items: z.array(utilizationItemSchema).min(1).max(20),
  })
  .superRefine((plan, ctx) => {
    // Amounts are decimal strings; sum must exceed zero.
    const total = plan.items.reduce((s, i) => s + Number(i.amount), 0);
    if (!(total > 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Utilization total must be positive' });
    }
  });
export type UtilizationPlanInput = z.infer<typeof utilizationPlanSchema>;

export const utilizationVerifySchema = z.object({
  verifiedItems: z
    .array(
      z.object({
        category: z.string().trim().min(2).max(80),
        verifiedAmount: moneySchema,
        note: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(20),
  verifierNote: z.string().trim().max(500).optional(),
});
export type UtilizationVerifyInput = z.infer<typeof utilizationVerifySchema>;

export interface UtilizationVerification {
  category: string;
  plannedAmount: string;
  verifiedAmount: string;
  variance: string;
  note: string | null;
}

export interface UtilizationReport {
  plannedTotal: string;
  verifiedTotal: string;
  variance: string; // verified - planned
  items: UtilizationVerification[];
  verifiedAt: string | null;
  verifiedBy: string | null;
  verifierNote: string | null;
}

/** Variance per category, aligned to the plan order. Pure; used by API + UI. */
export function buildUtilizationReport(
  plan: { items: UtilizationItem[] },
  verification: { items: Array<{ category: string; verifiedAmount: string; note?: string }>; verifiedAt: string | null; verifiedBy: string | null; verifierNote: string | null } | null,
): UtilizationReport {
  const plannedTotal = plan.items.reduce((s, i) => s + Number(i.amount), 0);
  if (!verification) {
    return {
      plannedTotal: plannedTotal.toFixed(2),
      verifiedTotal: '0.00',
      variance: (-plannedTotal).toFixed(2),
      items: plan.items.map((i) => ({ category: i.category, plannedAmount: i.amount, verifiedAmount: '0.00', variance: (-Number(i.amount)).toFixed(2), note: null })),
      verifiedAt: null,
      verifiedBy: null,
      verifierNote: null,
    };
  }
  const items = plan.items.map((i) => {
    const v = verification.items.find((x) => x.category === i.category);
    const verified = v ? Number(v.verifiedAmount) : 0;
    return {
      category: i.category,
      plannedAmount: i.amount,
      verifiedAmount: verified.toFixed(2),
      variance: (verified - Number(i.amount)).toFixed(2),
      note: v?.note ?? null,
    };
  });
  const verifiedTotal = items.reduce((s, i) => s + Number(i.verifiedAmount), 0);
  return {
    plannedTotal: plannedTotal.toFixed(2),
    verifiedTotal: verifiedTotal.toFixed(2),
    variance: (verifiedTotal - plannedTotal).toFixed(2),
    items,
    verifiedAt: verification.verifiedAt,
    verifiedBy: verification.verifiedBy,
    verifierNote: verification.verifierNote,
  };
}

// ── 7) Proposal PDF payload ─────────────────────────────────────────────────
export interface LoanProposalData {
  applicationNumber: string;
  status: string;
  member: { name: string; nameBn: string | null; code: string; photoUrl: string | null; branchName: string | null; mobile: string | null };
  product: { name: string; nameBn: string | null; code: string; interestRate: number; interestMethod: string; installmentFrequency: string };
  requestedAmount: string;
  termMonths: number;
  purpose: string;
  utilization: UtilizationReport;
  eligibility: LoanCycleCheckResult | null;
  schedule: Array<{ seq: number; dueDate: string; principal: string; interest: string; total: string }>;
  steps: Array<{ stage: string; action: string; actorRole: string; note: string | null; createdAt: string }>;
  guarantors: Array<{ name: string; relation: string; mobile: string }>;
  orgName: string;
  generatedAt: string;
}

// ── 8) Timeline read model ──────────────────────────────────────────────────
export interface LoanTimelineEntry {
  id: string;
  stage: string;
  stageBn: string;
  action: string;
  actorRole: string;
  actorName: string | null;
  note: string | null;
  createdAt: string;
}
