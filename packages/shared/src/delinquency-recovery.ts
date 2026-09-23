/**
 * ── Delinquency Recovery (requirements 5–9) ──────────────────────────────────
 * Root-cause tagging, recovery actions (reschedule hook, partial waiver,
 * group discussion, savings adjustment, legal notice, write-off proposal with
 * an approval chain, write-off recovery), loan-loss provision proposals,
 * early-warning signals, and heatmap/trend payloads for Recharts.
 */
import { z } from 'zod';
import { uuidSchema } from './schemas.js';

/** ── 5) Root causes ─────────────────────────────────────────────────────── */
export const ROOT_CAUSES = [
  'business_failure',
  'illness',
  'flood_disaster',
  'migration',
  'diversion_of_funds',
  'staff_weakness',
  'over_lending',
] as const;
export type RootCause = (typeof ROOT_CAUSES)[number];

export const ROOT_CAUSE_LABELS_BN: Record<RootCause, string> = {
  business_failure: 'ব্যবসায়িক ব্যর্থতা',
  illness: 'অসুস্থতা',
  flood_disaster: 'বন্যা বা দুর্যোগ',
  migration: 'স্থানান্তর',
  diversion_of_funds: 'অর্থের অন্যত্র ব্যবহার',
  staff_weakness: 'কর্মীর দুর্বলতা',
  over_lending: 'অতিরিক্ত ঋণ',
};

export const rootCauseSchema = z.enum(ROOT_CAUSES);

export const rootCauseTagSchema = z.object({
  loanId: uuidSchema,
  cause: rootCauseSchema,
  note: z.string().trim().max(500).optional(),
});
export type RootCauseTagInput = z.infer<typeof rootCauseTagSchema>;

export interface RootCauseTag {
  id: string;
  loanId: string;
  loanNumber: string | null;
  cause: RootCause;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** ── 6) Recovery actions ────────────────────────────────────────────────── */
export const RECOVERY_ACTIONS = [
  'reschedule',
  'partial_waiver',
  'group_discussion',
  'savings_adjustment',
  'legal_notice',
  'write_off',
] as const;
export type RecoveryAction = (typeof RECOVERY_ACTIONS)[number];

export const RECOVERY_ACTION_LABELS_BN: Record<RecoveryAction, string> = {
  reschedule: 'পুনঃনির্ধারণ',
  partial_waiver: 'আংশিক মওকুফ',
  group_discussion: 'কেন্দ্র আলোচনা',
  savings_adjustment: 'সঞ্চয় থেকে সমন্বয়',
  legal_notice: 'আইনি নোটিশ',
  write_off: 'লেখা (অপুনরুদ্ধারযোগ্য)',
};

// ── 6) Partial waiver (approval chain: BM recommends → AM approves) ─────────
export const waiverCreateSchema = z.object({
  loanId: uuidSchema,
  /** Waiver can cover overdue interest only, or principal + interest. */
  basis: z.enum(['overdue_interest', 'total_overdue']),
  percent: z.number().min(1).max(100),
  reason: z.string().trim().min(10).max(500),
});
export type WaiverCreateInput = z.infer<typeof waiverCreateSchema>;

export const waiverDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected']),
  decisionNote: z.string().trim().max(500).optional(),
});
export type WaiverDecisionInput = z.infer<typeof waiverDecisionSchema>;

export interface LoanWaiver {
  id: string;
  loanId: string;
  loanNumber: string | null;
  memberName: string;
  basis: 'overdue_interest' | 'total_overdue';
  percent: number;
  waivedAmount: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string | null;
  requestedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

// ── 6) Adjustment against savings ───────────────────────────────────────────
export const savingsAdjustmentSchema = z.object({
  loanId: uuidSchema,
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  note: z.string().trim().max(500).optional(),
});
export type SavingsAdjustmentInput = z.infer<typeof savingsAdjustmentSchema>;

export interface SavingsAdjustmentResult {
  id: string;
  loanId: string;
  loanNumber: string | null;
  amount: string;
  savingsAccountId: string | null;
  balanceAfter: string | null;
  journalId: string | null;
  createdAt: string;
}

// ── 6) Legal notice (Bangla template) ───────────────────────────────────────
export const legalNoticeRequestSchema = z.object({
  loanId: uuidSchema,
  replyWithinDays: z.number().int().min(3).max(60).default(7),
});
export type LegalNoticeRequestInput = z.infer<typeof legalNoticeRequestSchema>;

export interface LegalNoticeDoc {
  loanId: string;
  loanNumber: string | null;
  memberName: string;
  memberAddress: string | null;
  branchName: string;
  issuedOn: string;
  replyWithinDays: number;
  overdueTotal: string;
  outstanding: string;
  /** Printable Bangla body ({{member}} etc. already interpolated). */
  bodyBn: string;
}

export function renderLegalNoticeBn(input: {
  orgName: string;
  branchName: string;
  memberName: string;
  memberAddress: string | null;
  loanNumber: string | null;
  overdueTotal: string;
  outstanding: string;
  issuedOn: string;
  replyWithinDays: number;
}): string {
  return [
    `বিষয়: ঋণের বকেয়া পরিশোধের আইনি নোটিশ।`,
    ``,
    `জনাব/বেগম ${input.memberName},`,
    `${input.memberAddress ?? 'ঠিকানা: শাখা রেকর্ড অনুযায়ী'}`,
    ``,
    `আপনি ${input.orgName}, ${input.branchName}-এর নিকট ${input.loanNumber ?? 'আপনার ঋণ চুক্তি'}-এর অধীনে ঋণ গ্রহণ করেছেন। ${input.issuedOn} তারিখ পর্যন্ত উক্ত ঋণের বকেয়া ৳${input.overdueTotal} এবং মোট বাকি ৳${input.outstanding}, যা চুক্তি অনুযায়ী পরিশোধের সময়সীমা পার হয়েছে।`,
    ``,
    `এতদ্বারা আপনাকে আদেশ দেওয়া হচ্ছে যে, এই নোটিশ জারির ${input.replyWithinDays} দিনের মধ্যে সম্পূর্ণ বকেয়া পরিশোধ করুন, অথবা শাখা কার্যালয়ে যোগাযোগ করে পরিশোধের বিষয়ে লিখিত ব্যবস্থা গ্রহণ করুন।`,
    ``,
    `নির্ধারিত সময়ের মধ্যে পরিশোধ না করলে সমবায় আইন ও চুক্তির শর্ত অনুযায়ী আপনার বিরুদ্ধে আইনানুগ ব্যবস্থা গ্রহণ করা হবে; এতে হওয়া সকল খরচ আপনাকে বহন করতে হবে।`,
    ``,
    `আদেশক্রমে,`,
    `${input.branchName}, ${input.orgName}`,
  ].join('\n');
}

// ── 6) Write-off proposal with approval chain (AM recommends → Director ops
//      approves), plus later recovery of written-off loans ───────────────────
export const writeOffProposalSchema = z.object({
  loanId: uuidSchema,
  reason: z.string().trim().min(10).max(1000),
  legalActionTaken: z.string().trim().max(500).optional(),
});
export type WriteOffProposalInput = z.infer<typeof writeOffProposalSchema>;

export const writeOffRecoverySchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  note: z.string().trim().max(500).optional(),
});
export type WriteOffRecoveryInput = z.infer<typeof writeOffRecoverySchema>;

export interface WriteOffProposal {
  id: string;
  loanId: string;
  loanNumber: string | null;
  memberName: string;
  outstandingAmount: string;
  reason: string;
  legalActionTaken: string | null;
  /** AM recommends → org admin (Director Operations) approves. */
  status: 'pending' | 'recommended' | 'approved' | 'rejected';
  requestedBy: string | null;
  requestedAt: string;
  recommendedBy: string | null;
  recommendedAt: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** Cumulative recovery on this written-off loan. */
  recoveredAmount: string;
  recoveries: Array<{ id: string; amount: string; note: string | null; receivedAt: string }>;
}

// ── 7) Loan-loss provision posting proposal ─────────────────────────────────
export const provisionProposalSchema = z.object({
  runDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional(),
  note: z.string().trim().max(500).optional(),
});
export type ProvisionProposalInput = z.infer<typeof provisionProposalSchema>;

export interface ProvisionProposal {
  id: string;
  runDate: string;
  /** Per-asset-class totals from the latest classification run. */
  byClass: Array<{ assetClass: string; outstanding: string; provisionPercent: number; provisionAmount: string }>;
  provisionTotal: string;
  /** Movements vs the last approved proposal (incremental posting). */
  priorProvisionTotal: string;
  provisionExpense: string;
  status: 'pending_approval' | 'posted';
  note: string | null;
  requestedBy: string | null;
  requestedAt: string;
  postedAt: string | null;
  /** Journal lines previewed/posted: Dr expense, Cr provision reserve. */
  journalPreview: Array<{ accountCode: string; accountName: string; debit: string; credit: string }>;
}

// ── 8) Early-warning signals ────────────────────────────────────────────────
export const EARLY_WARNING_KINDS = [
  'member_missed_two',
  'samity_attendance_falling',
  'officer_par_rising',
] as const;
export type EarlyWarningKind = (typeof EARLY_WARNING_KINDS)[number];

export const EARLY_WARNING_LABELS_BN: Record<EarlyWarningKind, string> = {
  member_missed_two: 'টানা দুই কিস্তি বকেয়া',
  samity_attendance_falling: 'কেন্দ্রের উপস্থিতি কমছে',
  officer_par_rising: 'অফিসারের PAR বাড়ছে',
};

export interface EarlyWarningSignal {
  id: string;
  kind: EarlyWarningKind;
  severity: 'low' | 'medium' | 'high';
  refId: string; // memberId / samityId / officerId
  refName: string;
  branchId: string | null;
  detail: string;
  detailBn: string;
  /** Metric snapshot powering the signal. */
  metric: number;
  priorMetric: number | null;
  detectedAt: string;
  acknowledged: boolean;
}

/** 8) Consecutive missed installments (from stored schedule rows). */
export function countConsecutiveMissed(
  rows: Array<{ seq: number; dueDate: string; total: string; paidAmount?: string }>,
  today: string,
): number {
  const t = Date.parse(`${today}T00:00:00Z`);
  const missed = rows
    .filter((r) => Date.parse(`${r.dueDate}T00:00:00Z`) < t && Number(r.paidAmount ?? 0) < Number(r.total) - 0.001)
    .map((r) => r.seq)
    .sort((a, b) => a - b);
  // Longest tail of consecutive seq numbers ending at the most recent due.
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const s of missed) {
    run = prev !== null && s === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = s;
  }
  return best;
}

/** 8) Attendance trend: falling when the last period rate < earlier rate − gap. */
export function attendanceFalling(
  periodRates: number[],
  minMeetings: number = 4,
  dropThreshold: number = 0.1,
): { falling: boolean; drop: number } {
  if (periodRates.length < minMeetings) return { falling: false, drop: 0 };
  const half = Math.floor(periodRates.length / 2);
  const prior = periodRates.slice(0, half).reduce((s, r) => s + r, 0) / half;
  const recent = periodRates.slice(half).reduce((s, r) => s + r, 0) / (periodRates.length - half);
  const drop = prior - recent;
  return { falling: drop >= dropThreshold, drop };
}

/** ── 9) Heatmap + trend payloads (Recharts) ─────────────────────────────── */
export interface HeatmapCell {
  branchId: string;
  branchName: string;
  officerId: string | null;
  officerName: string | null;
  bucket: string;
  /** Outstanding value in this cell. */
  value: string;
  loans: number;
}

export interface HeatmapResponse {
  cells: HeatmapCell[];
  max: string;
  buckets: string[];
}

export interface TrendPoint {
  runDate: string;
  par1: number;
  par30: number;
  par90: number;
  outstanding: string;
  atRisk: string;
  provision: string;
}

export interface TrendResponse {
  points: TrendPoint[];
}
