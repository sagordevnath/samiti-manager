/**
 * ── Insurance, Member Welfare & Dividend ─────────────────────────────────────
 * 1) Credit life insurance: premium per loan collected at disbursement,
 *    coverage period, nominee, death claim with documents, three-level review
 *    (Branch Manager → Area Manager → Head Office), payout or loan waiver,
 *    ledger entries.
 * 2) Cattle / crop / health micro-insurance products with premium, coverage
 *    limit, claim assessment form and photos.
 * 3) Member welfare / emergency fund: contribution rules, grant or
 *    interest-free loan requests (illness, funeral, flood) with an approval
 *    matrix and per-category cap.
 * 4) Staff welfare / benevolent fund with the same request flow, funded by
 *    payroll deduction.
 *
 * Money is transmitted as string; numeric(14,2) in DB. All rule helpers are
 * pure so the API (authoritative), the DB triggers (defense in depth) and
 * the web UI (live feedback) share one implementation.
 */

import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';

function cryptoRandomId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ── GL accounts (codes follow the default chart of accounts) ─────────────── */

export const WELFARE_ACCOUNTS = {
  insuranceIncome: { code: '4220', name: 'Insurance Premium Income', nameBn: 'বীমা প্রিমিয়াম আয়' },
  insurancePayable: { code: '2300', name: 'Insurance Claims Payable', nameBn: 'বীমা দাবি প্রদেয়' },
  claimsExpense: { code: '5300', name: 'Insurance Claims Expense', nameBn: 'বীমা দাবি ব্যয়' },
  loanPortfolio: { code: '1200', name: 'Loan Portfolio', nameBn: 'ঋণ পোর্টফোলিও' },
  cashVault: { code: '1010', name: 'Cash in Vault', nameBn: 'নগদ তহবিল' },
  welfareFund: { code: '3300', name: 'Member Welfare Fund', nameBn: 'সদস্য কল্যাণ তহবিল' },
  staffBenevolentFund: { code: '3310', name: 'Staff Benevolent Fund', nameBn: 'কর্মী সদয় তহবিল' },
  welfareContributionIncome: { code: '4310', name: 'Welfare Contributions', nameBn: 'কল্যাণ চাঁদা আয়' },
  welfareGrantsExpense: { code: '5310', name: 'Welfare Grants Expense', nameBn: 'কল্যাণ অনুদান ব্যয়' },
} as const;

/* ── 1) Credit life / borrower protection ─────────────────────────────────── */

export const CREDIT_LIFE_DEFAULTS = {
  /** Premium as percent of loan principal, collected once at disbursement. */
  premiumRatePct: 1.0,
  /** Minimum premium in BDT regardless of principal. */
  minPremiumBdt: 100,
  /** Coverage equals the outstanding loan at death, up to this cap. */
  coverageCapBdt: 500000,
  /** Coverage runs the full loan term. */
} as const;

export interface CreditLifePolicy {
  id: string;
  orgId: string;
  branchId: string;
  applicationId: string;
  loanNumber: string;
  memberId: string;
  memberName: string;
  /** Premium % and charged amount at issue. */
  premiumRatePct: number;
  premiumAmount: string;
  principal: string;
  coverageAmount: string;
  /** UTC dates. */
  startDate: string;
  endDate: string;
  nomineeName: string;
  nomineeRelation: string;
  nomineePhone: string | null;
  /** 1.0 = active; any claim closes it. */
  status: 'active' | 'claimed' | 'expired';
  createdAt: string;
  updatedAt: string;
}

export type ClaimReviewLevel = 'bm_review' | 'am_review' | 'ho_review';
export type ClaimStatus = 'submitted' | ClaimReviewLevel | 'approved' | 'paid' | 'rejected';

export const CLAIM_STATUS_LABELS_BN: Record<ClaimStatus, string> = {
  submitted: 'দাখিল',
  bm_review: 'শাখা পর্যালোচনা',
  am_review: 'এরিয়া পর্যালোচনা',
  ho_review: 'প্রধান কার্যালয় পর্যালোচনা',
  approved: 'অনুমোদিত',
  paid: 'পরিশোধিত',
  rejected: 'প্রত্যাখ্যাত',
};

/** Documents required before a death claim can leave branch review. */
export const DEATH_CLAIM_REQUIRED_DOCS = [
  { id: 'death_certificate', labelBn: 'মৃত্যুসনদ' },
  { id: 'nominee_nid', labelBn: 'নমিনির এনআইডি' },
  { id: 'nominee_proof', labelBn: 'নমিনি প্রমাণপত্র (ওয়ারিশান/সনদ)' },
] as const;
export type DeathClaimDocId = (typeof DEATH_CLAIM_REQUIRED_DOCS)[number]['id'];

export const DEATH_CAUSES = ['natural', 'accident', 'illness', 'other'] as const;
export type DeathCause = (typeof DEATH_CAUSES)[number];

export interface InsuranceClaim {
  id: string;
  orgId: string;
  branchId: string;
  policyId: string;
  claimNo: string; // CL-YYYY-NNNN
  kind: 'death' | 'cattle' | 'crop' | 'health';
  memberId: string;
  memberName: string;
  eventDate: string;
  reportedDate: string;
  cause: string;
  /** Required docs (death) or assessment photos (cattle/crop/health). */
  documents: { id: string; labelBn: string; path: string }[];
  /** Assessment notes per claim type. */
  assessmentNote: string;
  claimedAmount: string;
  approvedAmount: string | null;
  /** 'payout' = cash to nominee/member; 'waiver' = loan written off. */
  settlementMode: 'payout' | 'waiver' | null;
  status: ClaimStatus;
  decisionNote: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const claimSubmitSchema = z.object({
  policyId: uuidSchema,
  kind: z.enum(['death', 'cattle', 'crop', 'health']),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cause: z.string().trim().max(60).default(''),
  documents: z
    .array(z.object({ id: z.string().trim().min(1), labelBn: z.string().trim().min(1), path: z.string().trim().min(1) }))
    .max(12)
    .default([]),
  assessmentNote: z.string().trim().max(2000).default(''),
  claimedAmount: moneySchema,
});
export type ClaimSubmitBody = z.infer<typeof claimSubmitSchema>;

export const claimDecisionSchema = z.object({
  action: z.enum(['advance', 'approve', 'reject', 'pay', 'settle_waiver']),
  note: z.string().trim().max(1000).default(''),
  approvedAmount: moneySchema.optional(),
});
export type ClaimDecisionBody = z.infer<typeof claimDecisionSchema>;

/** Docs a claim still needs before it can leave BM review. */
export function missingDeathDocs(claim: Pick<InsuranceClaim, 'kind' | 'documents'>): string[] {
  if (claim.kind !== 'death') return [];
  const have = new Set(claim.documents.map((d) => d.id));
  return DEATH_CLAIM_REQUIRED_DOCS.filter((d) => !have.has(d.id)).map((d) => d.labelBn);
}

/** Premium charged at disbursement: pct of principal with a floor. */
export function creditLifePremium(principal: string, ratePct: number, minPremium: number): string {
  const p = Number(principal) * (ratePct / 100);
  return Math.max(p, minPremium).toFixed(2);
}

/** Coverage = outstanding principal at event, capped. Outstanding ≈ principal − paid installments × installment amount; here simple cap. */
export function creditLifeCoverage(principal: string, cap: number): string {
  return Math.min(Number(principal), cap).toFixed(2);
}

const REVIEW_FLOW: Record<ClaimStatus, ClaimStatus[]> = {
  submitted: ['bm_review', 'rejected'],
  bm_review: ['am_review', 'rejected'],
  am_review: ['ho_review', 'rejected'],
  ho_review: ['approved', 'rejected'],
  approved: ['paid'],
  paid: [],
  rejected: [],
};

export function canTransitionClaim(from: ClaimStatus, to: ClaimStatus): boolean {
  return REVIEW_FLOW[from].includes(to);
}

/** Death claims may not leave BM review with documents missing. */
export function claimCanAdvance(claim: Pick<InsuranceClaim, 'kind' | 'documents' | 'status'>): { ok: boolean; missing: string[] } {
  if (claim.status !== 'submitted') return { ok: true, missing: [] };
  const missing = missingDeathDocs(claim);
  return { ok: missing.length === 0, missing };
}

/** Journal for a settled claim: payout (cash out, claims expense) or waiver (portfolio written off). */
export function buildClaimJournal(input: {
  claimNo: string;
  settlementMode: 'payout' | 'waiver';
  amount: string;
}): { memo: string; lines: { accountCode: string; accountName: string; debit: string; credit: string }[] } {
  const amount = Number(input.amount).toFixed(2);
  if (input.settlementMode === 'waiver') {
    return {
      memo: `ঋণ মাফ ${input.claimNo}`,
      lines: [
        { accountCode: WELFARE_ACCOUNTS.claimsExpense.code, accountName: WELFARE_ACCOUNTS.claimsExpense.name, debit: amount, credit: '0.00' },
        { accountCode: WELFARE_ACCOUNTS.loanPortfolio.code, accountName: WELFARE_ACCOUNTS.loanPortfolio.name, debit: '0.00', credit: amount },
      ],
    };
  }
  return {
    memo: `বীমা দাবি পরিশোধ ${input.claimNo}`,
    lines: [
      { accountCode: WELFARE_ACCOUNTS.claimsExpense.code, accountName: WELFARE_ACCOUNTS.claimsExpense.name, debit: amount, credit: '0.00' },
      { accountCode: WELFARE_ACCOUNTS.cashVault.code, accountName: WELFARE_ACCOUNTS.cashVault.name, debit: '0.00', credit: amount },
    ],
  };
}

/** Premium collection journal at disbursement: cash in, premium income. */
export function buildPremiumJournal(amount: string): { memo: string; lines: { accountCode: string; accountName: string; debit: string; credit: string }[] } {
  const amt = Number(amount).toFixed(2);
  return {
    memo: 'বীমা প্রিমিয়াম আদায়',
    lines: [
      { accountCode: WELFARE_ACCOUNTS.cashVault.code, accountName: WELFARE_ACCOUNTS.cashVault.name, debit: amt, credit: '0.00' },
      { accountCode: WELFARE_ACCOUNTS.insuranceIncome.code, accountName: WELFARE_ACCOUNTS.insuranceIncome.name, debit: '0.00', credit: amt },
    ],
  };
}

/* ── 2) Micro-insurance products (cattle, crop, health) ───────────────────── */

export const MICRO_INSURANCE_KINDS = ['cattle', 'crop', 'health'] as const;
export type MicroInsuranceKind = (typeof MICRO_INSURANCE_KINDS)[number];

export const MICRO_INSURANCE_LABELS_BN: Record<MicroInsuranceKind, string> = {
  cattle: 'গবাদি পশু বীমা',
  crop: 'ফসলের বীমা',
  health: 'স্বাস্থ্য বীমা',
};

export interface MicroInsuranceProduct {
  id: string;
  orgId: string;
  kind: MicroInsuranceKind;
  nameBn: string;
  /** Annual premium, charged upfront per enrolled animal/season/person. */
  annualPremium: string;
  coverageLimit: string;
  /** Number of premium-paying units covered (animals, seasons, persons). */
  units: number;
  active: boolean;
}

export const MICRO_CLAIM_CAUSES: Record<MicroInsuranceKind, readonly string[]> = {
  cattle: ['death', 'theft', 'injury'],
  crop: ['flood', 'drought', 'pest', 'storm'],
  health: ['hospitalization', 'surgery', 'critical_illness'],
};

export const microProductUpsertSchema = z.object({
  kind: z.enum(MICRO_INSURANCE_KINDS),
  nameBn: z.string().trim().min(2).max(120),
  annualPremium: moneySchema,
  coverageLimit: moneySchema,
  units: z.coerce.number().int().min(1).max(50).default(1),
  active: z.boolean().default(true),
});
export type MicroProductUpsertBody = z.infer<typeof microProductUpsertSchema>;

export const microEnrollSchema = z.object({
  productId: uuidSchema,
  memberId: uuidSchema,
  memberName: z.string().trim().min(2).max(120),
  units: z.coerce.number().int().min(1).max(20).default(1),
  /** For cattle: tag numbers; for crop: season; for health: beneficiary names. */
  subjectRef: z.string().trim().max(200).default(''),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type MicroEnrollBody = z.infer<typeof microEnrollSchema>;

export interface MicroEnrollment {
  id: string;
  orgId: string;
  branchId: string;
  productId: string;
  kind: MicroInsuranceKind;
  memberId: string;
  memberName: string;
  units: number;
  subjectRef: string;
  annualPremium: string;
  coverageLimit: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'claimed' | 'expired';
  createdAt: string;
  updatedAt: string;
}

export const microClaimSchema = z.object({
  enrollmentId: uuidSchema,
  cause: z.string().trim().min(2).max(40),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  assessmentNote: z.string().trim().max(2000).default(''),
  photos: z.array(z.string().trim().min(1)).max(10).default([]),
  claimedAmount: moneySchema,
});
export type MicroClaimBody = z.infer<typeof microClaimSchema>;

/** Coverage for a micro claim = per-unit limit × units, capped at claimed amount's limit. */
export function microCoverageFor(enrollment: Pick<MicroEnrollment, 'units' | 'coverageLimit'>, claimedAmount: string): string {
  const perUnit = Number(enrollment.coverageLimit) / Math.max(1, enrollment.units);
  const eligible = perUnit * enrollment.units;
  return Math.min(eligible, Number(claimedAmount)).toFixed(2);
}

/* ── 3) Member welfare / emergency fund ───────────────────────────────────── */

export const WELFARE_REQUEST_KINDS = ['illness', 'funeral', 'flood', 'disaster', 'education'] as const;
export type WelfareRequestKind = (typeof WELFARE_REQUEST_KINDS)[number];

export const WELFARE_REQUEST_LABELS_BN: Record<WelfareRequestKind, string> = {
  illness: 'অসুস্থতা',
  funeral: 'অন্ত্যেষ্টিক্রিয়া',
  flood: 'বন্যা',
  disaster: 'দুর্যোগ',
  education: 'শিক্ষা',
};

export type WelfareRequestType = 'grant' | 'interest_free_loan';
export type WelfareRequestStatus = 'submitted' | 'bm_review' | 'am_review' | 'approved' | 'rejected' | 'disbursed';

/** Per-kind caps for grants and interest-free loans (org-editable). */
export interface WelfareRules {
  grantCapBdt: number;
  loanCapBdt: number;
  /** Interest-free loans must be repaid within N months. */
  loanTermMonths: number;
  /** Approver role by amount tier. */
  bmApprovalUpToBdt: number;
  amApprovalUpToBdt: number;
}

export const DEFAULT_WELFARE_RULES: WelfareRules = {
  grantCapBdt: 5000,
  loanCapBdt: 20000,
  loanTermMonths: 10,
  bmApprovalUpToBdt: 3000,
  amApprovalUpToBdt: 10000,
};

export const welfareRulesSchema = z.object({
  grantCapBdt: z.coerce.number().min(0),
  loanCapBdt: z.coerce.number().min(0),
  loanTermMonths: z.coerce.number().int().min(1).max(36),
  bmApprovalUpToBdt: z.coerce.number().min(0),
  amApprovalUpToBdt: z.coerce.number().min(0),
});
export type WelfareRulesInput = z.infer<typeof welfareRulesSchema>;

export interface WelfareFundRules {
  id: string;
  orgId: string;
  /** Monthly contribution per active member, auto-dedicated at collection. */
  monthlyContribution: string;
  /** Whether staff also contribute (staff fund separate ledger). */
  staffContribution: string;
  rules: WelfareRules;
  updatedAt: string;
}

export interface WelfareRequest {
  id: string;
  orgId: string;
  branchId: string;
  fund: 'member' | 'staff';
  requestId: string; // WF-YYYY-NNNN / SB-YYYY-NNNN
  requesterId: string;
  requesterName: string;
  kind: WelfareRequestKind;
  type: WelfareRequestType;
  amount: string;
  reason: string;
  /** Supporting photos (medical certificate, damage photo…). */
  photos: string[];
  status: WelfareRequestStatus;
  decisionNote: string;
  decidedAt: string | null;
  disbursedAt: string | null;
  /** Interest-free repayment plan (installments). */
  repaymentMonths: number | null;
  createdAt: string;
  updatedAt: string;
}

export const welfareRequestSchema = z.object({
  fund: z.enum(['member', 'staff']).default('member'),
  requesterId: uuidSchema,
  requesterName: z.string().trim().min(2).max(120),
  kind: z.enum(WELFARE_REQUEST_KINDS),
  type: z.enum(['grant', 'interest_free_loan']),
  amount: moneySchema,
  reason: z.string().trim().min(3).max(1000),
  photos: z.array(z.string().trim().min(1)).max(10).default([]),
});
export type WelfareRequestBody = z.infer<typeof welfareRequestSchema>;

export const welfareDecisionSchema = z.object({
  action: z.enum(['advance', 'approve', 'reject', 'disburse']),
  note: z.string().trim().max(1000).default(''),
});
export type WelfareDecisionBody = z.infer<typeof welfareDecisionSchema>;

const WELFARE_FLOW: Record<WelfareRequestStatus, WelfareRequestStatus[]> = {
  submitted: ['bm_review', 'rejected'],
  bm_review: ['am_review', 'approved', 'rejected'],
  am_review: ['approved', 'rejected'],
  approved: ['disbursed'],
  disbursed: [],
  rejected: [],
};

export function canTransitionWelfare(from: WelfareRequestStatus, to: WelfareRequestStatus): boolean {
  return WELFARE_FLOW[from].includes(to);
}

/** Which level reviews next based on amount and the rules. */
export function welfareNextLevel(
  status: WelfareRequestStatus,
  amount: string,
  rules: WelfareRules = DEFAULT_WELFARE_RULES,
): { next: WelfareRequestStatus | null; approverBn: string } {
  const amt = Number(amount);
  if (status === 'submitted') return { next: 'bm_review', approverBn: 'শাখা ব্যবস্থাপক' };
  if (status === 'bm_review') {
    if (amt <= rules.bmApprovalUpToBdt) return { next: 'approved', approverBn: 'শাখা ব্যবস্থাপক' };
    return { next: 'am_review', approverBn: 'এরিয়া ব্যবস্থাপক' };
  }
  if (status === 'am_review') {
    if (amt <= rules.amApprovalUpToBdt) return { next: 'approved', approverBn: 'এরিয়া ব্যবস্থাপক' };
    return { next: 'approved', approverBn: 'প্রধান কার্যালয় (সরাসরি সীমা ছাড়িয়ে গেলেও পরবর্তী পর্যায়)' };
  }
  return { next: null, approverBn: '—' };
}

/** Cap check per kind; grants and loans have separate ceilings. */
export function welfareCapCheck(
  type: WelfareRequestType,
  amount: string,
  rules: WelfareRules = DEFAULT_WELFARE_RULES,
): { ok: boolean; capBdt: number; messageBn: string | null } {
  const amt = Number(amount);
  const cap = type === 'grant' ? rules.grantCapBdt : rules.loanCapBdt;
  if (amt > cap) {
    return {
      ok: false,
      capBdt: cap,
      messageBn: `${type === 'grant' ? 'অনুদান' : 'বিনামূল্যে ঋণ'} সর্বোচ্চ ${cap.toLocaleString('bn-BD')} ৳ / Cap exceeded`,
    };
  }
  return { ok: true, capBdt: cap, messageBn: null };
}

/** Fund balance check: grants + disbursed loans must not overdraw the fund. */
export function welfareFundAvailable(fundBalance: string, pendingCommitted: string, amount: string): boolean {
  return Number(fundBalance) - Number(pendingCommitted) >= Number(amount);
}

/* ── 4) Staff welfare / benevolent fund ───────────────────────────────────── */

/** Payroll deduction for the benevolent fund (a fixed monthly sum per staff). */
export const BENEVOLENT_MONTHLY_DEFAULT = '50.00';

export function benevolentMonthlyDeduction(staffCount: number, perStaff: string = BENEVOLENT_MONTHLY_DEFAULT): string {
  return (staffCount * Number(perStaff)).toFixed(2);
}

/* ── Dividend (cooperative share of surplus, wired to the share module) ───── */

/** Dividend per member = payout pool × (member shares / total shares). */
export function computeDividend(
  input: { surplus: string; payoutPct: number; totalShares: number },
  holders: { memberId: string; memberName: string; shares: number }[],
): { pool: string; reserve: string; perHolder: { memberId: string; memberName: string; shares: number; amount: string }[] } {
  const pool = (Number(input.surplus) * (input.payoutPct / 100)).toFixed(2);
  const reserve = (Number(input.surplus) - Number(pool)).toFixed(2);
  const total = input.totalShares || holders.reduce((s, h) => s + h.shares, 0);
  const perHolder = holders.map((h) => ({
    memberId: h.memberId,
    memberName: h.memberName,
    shares: h.shares,
    amount: total > 0 ? ((Number(pool) * h.shares) / total).toFixed(2) : '0.00',
  }));
  return { pool, reserve, perHolder };
}

/* ── ID / number helpers used by the store ────────────────────────────────── */

export function nextClaimNo(seq: number): string {
  return `CL-${new Date().getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
}

export function nextWelfareRequestNo(seq: number, fund: 'member' | 'staff'): string {
  const prefix = fund === 'member' ? 'WF' : 'SB';
  return `${prefix}-${new Date().getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
}

/** Coverage end = start + full-term months (credit life follows the loan). */
export function coveragePeriod(startDate: string, termMonths: number): { endDate: string; days: number } {
  const d = new Date(`${startDate}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + termMonths);
  const endDate = d.toISOString().slice(0, 10);
  const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000);
  return { endDate, days };
}

export { cryptoRandomId, todayIso };
