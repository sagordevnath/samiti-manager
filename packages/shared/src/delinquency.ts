/**
 * ── Delinquency Management & Recovery ────────────────────────────────────────
 * Nightly loan classification (days-past-due buckets, provisioning), portfolio
 * risk metrics (PAR1/30/90, on-time repayment rate) at every org level,
 * escalating worklists, and follow-up records with reminder tasks.
 *
 * All money is string "0.00"; the pure functions here are shared by the API
 * (authoritative), the DB triggers and the web UI.
 */
import { z } from 'zod';
import { uuidSchema } from './schemas.js';

/** ── 1) Classification buckets ──────────────────────────────────────────── */
export const DELINQUENCY_BUCKETS = [
  'regular', // 0 days past due
  'd1_30',
  'd31_90',
  'd91_180',
  'd180_plus',
] as const;
export type DelinquencyBucket = (typeof DELINQUENCY_BUCKETS)[number];

export const ASSET_CLASSES = ['standard', 'substandard', 'doubtful', 'bad'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const BUCKET_LABELS_BN: Record<DelinquencyBucket, string> = {
  regular: 'নিয়মিত',
  d1_30: '১–৩০ দিন',
  d31_90: '৩১–৯০ দিন',
  d91_180: '৯১–১৮০ দিন',
  d180_plus: '১৮০+ দিন',
};

export const ASSET_CLASS_LABELS_BN: Record<AssetClass, string> = {
  standard: 'মানসম্মত',
  substandard: 'অবনত',
  doubtful: 'সন্দেহজনক',
  bad: 'ক্ষতিগ্রস্ত',
};

/** ── 1) Editable settings (per org) ─────────────────────────────────────── */
export const DELINQUENCY_SETTINGS_DEFAULTS = {
  /** Bucket upper bounds, days past due. regular=0; each bucket is (lo, hi]. */
  buckets: { d1_30: 30, d31_90: 90, d91_180: 180 } as Record<'d1_30' | 'd31_90' | 'd91_180', number>,
  /** Provisioning percentage of outstanding per asset class. */
  provisioning: { standard: 0, substandard: 25, doubtful: 50, bad: 100 } as Record<AssetClass, number>,
  /** Asset class derives from days past due (editable thresholds). */
  assetClassByDpd: { substandard: 31, doubtful: 91, bad: 181 } as {
    substandard: number;
    doubtful: number;
    bad: number;
  },
  /** 3) Escalation days. */
  escalateToBmDays: 3,
  escalateToAmDays: 15,
} as const;

export const delinquencySettingsSchema = z.object({
  buckets: z.object({
    d1_30: z.number().int().min(1).max(365),
    d31_90: z.number().int().min(2).max(365),
    d91_180: z.number().int().min(3).max(365),
  }),
  provisioning: z.object({
    standard: z.number().min(0).max(100),
    substandard: z.number().min(0).max(100),
    doubtful: z.number().min(0).max(100),
    bad: z.number().min(0).max(100),
  }),
  assetClassByDpd: z.object({
    substandard: z.number().int().min(1).max(365),
    doubtful: z.number().int().min(2).max(365),
    bad: z.number().int().min(3).max(365),
  }),
  escalateToBmDays: z.number().int().min(1).max(180),
  escalateToAmDays: z.number().int().min(1).max(365),
});
export type DelinquencySettings = z.infer<typeof delinquencySettingsSchema>;

/** ── 1) Loan classification ─────────────────────────────────────────────── */
export interface ClassifiedLoan {
  applicationId: string;
  loanNumber: string | null;
  memberId: string;
  memberName: string;
  memberCode: string;
  branchId: string;
  samityId: string | null;
  officerId: string | null;
  productName: string | null;
  disbursedOn: string;
  outstanding: string;
  overduePrincipal: string;
  overdueInterest: string;
  overdueTotal: string;
  daysPastDue: number;
  bucket: DelinquencyBucket;
  assetClass: AssetClass;
  provisionPercent: number;
  provisionAmount: string;
  /** Oldest unpaid installment date (or null when regular). */
  oldestUnpaidDueDate: string | null;
}

/** ── 2) PAR metrics per org node ────────────────────────────────────────── */
export interface ParMetrics {
  scope: 'branch' | 'area' | 'zone' | 'org' | 'officer' | 'samity';
  scopeId: string;
  scopeName: string;
  /** Total outstanding principal of all active loans. */
  outstandingTotal: string;
  /** Outstanding of loans with any days past due > 0. */
  atRisk: string;
  par1: number; // 0..1
  par30: number;
  par90: number;
  onTimeRepaymentRate: number; // installments paid on/before due / installments due
  loansTotal: number;
  loansAtRisk: number;
}

export const delinquencySettingsPatchSchema = delinquencySettingsSchema.partial();
export type DelinquencySettingsPatch = z.infer<typeof delinquencySettingsPatchSchema>;

/** ── 3) Worklist ────────────────────────────────────────────────────────── */
export type WorklistLevel = 'field_officer' | 'branch_manager' | 'area_manager';

export const WORKLIST_LEVEL_LABELS_BN: Record<WorklistLevel, string> = {
  field_officer: 'ফিল্ড অফিসার',
  branch_manager: 'শাখা ব্যবস্থাপক',
  area_manager: 'এলাকা ব্যবস্থাপক',
};

export interface WorklistItem {
  loanId: string;
  loanNumber: string | null;
  memberId: string;
  memberName: string;
  memberCode: string;
  branchId: string;
  branchName: string | null;
  samityId: string | null;
  officerId: string | null;
  officerName: string | null;
  bucket: DelinquencyBucket;
  daysPastDue: number;
  overdueTotal: string;
  outstanding: string;
  assignedLevel: WorklistLevel;
  assignedToId: string | null;
  assignedToName: string | null;
  /** Open follow-ups already recorded against this loan. */
  followUpsCount: number;
  lastFollowUpAt: string | null;
  lastOutcome: FollowUpOutcome | null;
}

/** ── 4) Follow-up records ───────────────────────────────────────────────── */
export const FOLLOW_UP_TYPES = ['visit', 'phone_call', 'group_meeting', 'letter', 'legal_notice'] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];

export const FOLLOW_UP_OUTCOMES = [
  'promise_to_pay',
  'partial_paid',
  'refused',
  'not_found',
  'rescheduled',
  'escalated',
] as const;
export type FollowUpOutcome = (typeof FOLLOW_UP_OUTCOMES)[number];

export const FOLLOW_UP_TYPE_LABELS_BN: Record<FollowUpType, string> = {
  visit: 'সদস্য পরিদর্শন',
  phone_call: 'টেলিফোন কল',
  group_meeting: 'কেন্দ্র মিটিং',
  letter: 'চিঠি',
  legal_notice: 'আইনি নোটিশ',
};

export const FOLLOW_UP_OUTCOME_LABELS_BN: Record<FollowUpOutcome, string> = {
  promise_to_pay: 'পরিশোধের প্রতিশ্রুতি',
  partial_paid: 'আংশিক পরিশোধ',
  refused: 'অস্বীকৃতি',
  not_found: 'পাওয়া যায়নি',
  rescheduled: 'পুনঃনির্ধারিত',
  escalated: 'উর্ধ্বতনে প্রেরিত',
};

export const followUpCreateSchema = z.object({
  loanId: uuidSchema,
  type: z.enum(FOLLOW_UP_TYPES),
  outcome: z.enum(FOLLOW_UP_OUTCOMES),
  /** Promise-to-pay (outcome = promise_to_pay): date + amount. */
  promiseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional(),
  promiseAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  note: z.string().trim().max(1000).optional(),
  nextVisitDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
    .optional(),
});
export type FollowUpCreateInput = z.infer<typeof followUpCreateSchema>;

export interface DelinquencyFollowUp {
  id: string;
  loanId: string;
  loanNumber: string | null;
  memberName: string;
  type: FollowUpType;
  outcome: FollowUpOutcome;
  promiseDate: string | null;
  promiseAmount: string | null;
  note: string | null;
  nextVisitDate: string | null;
  /** 4) Reminder task created for the follow-up (Module 12 queue). */
  reminderTaskId: string | null;
  due: boolean;
  createdBy: string | null;
  createdAt: string;
}

/** ── 4) Reminder tasks (Module 12 interface) ────────────────────────────── */
export interface DelinquencyTask {
  id: string;
  title: string;
  titleBn: string;
  dueDate: string;
  loanId: string | null;
  memberId: string | null;
  memberName: string | null;
  source: 'delinquency' | 'manual';
  status: 'open' | 'done';
  assignedToId: string | null;
  createdAt: string;
}

/** ── Engine: pure classification ────────────────────────────────────────── */
export function bucketForDaysPastDue(dpd: number, s: DelinquencySettings = DELINQUENCY_SETTINGS_DEFAULTS): DelinquencyBucket {
  if (dpd <= 0) return 'regular';
  if (dpd <= s.buckets.d1_30) return 'd1_30';
  if (dpd <= s.buckets.d31_90) return 'd31_90';
  if (dpd <= s.buckets.d91_180) return 'd91_180';
  return 'd180_plus';
}

export function assetClassForDpd(dpd: number, s: DelinquencySettings = DELINQUENCY_SETTINGS_DEFAULTS): AssetClass {
  if (dpd >= s.assetClassByDpd.bad) return 'bad';
  if (dpd >= s.assetClassByDpd.doubtful) return 'doubtful';
  if (dpd >= s.assetClassByDpd.substandard) return 'substandard';
  return 'standard';
}

export function provisionPercentFor(assetClass: AssetClass, s: DelinquencySettings = DELINQUENCY_SETTINGS_DEFAULTS): number {
  return s.provisioning[assetClass];
}

/** ── 3) Escalation level ────────────────────────────────────────────────── */
export function worklistLevelFor(
  dpd: number,
  s: DelinquencySettings = DELINQUENCY_SETTINGS_DEFAULTS,
): WorklistLevel {
  if (dpd > s.escalateToAmDays) return 'area_manager';
  if (dpd > s.escalateToBmDays) return 'branch_manager';
  return 'field_officer';
}

/** ── 2) On-time repayment rate ──────────────────────────────────────────── */
export function onTimeRepaymentRate(rows: Array<{ dueDate: string; paidAt: string | null; total: string; paidAmount?: string }>): number {
  let due = 0;
  let onTime = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const r of rows) {
    if (Date.parse(`${r.dueDate}T00:00:00Z`) > Date.parse(`${today}T00:00:00Z`)) continue; // future: not yet due
    due += 1;
    const paid = Number(r.paidAmount ?? 0) >= Number(r.total) - 0.001;
    if (paid && r.paidAt && r.paidAt.slice(0, 10) <= r.dueDate) onTime += 1;
  }
  return due === 0 ? 1 : onTime / due;
}

/** ── 2) PAR computation ─────────────────────────────────────────────────── */
export function computePar(
  scope: ParMetrics['scope'],
  scopeId: string,
  scopeName: string,
  loans: ClassifiedLoan[],
): ParMetrics {
  const outstandingTotal = loans.reduce((s, l) => s + Number(l.outstanding), 0);
  const atRisk = loans.filter((l) => l.daysPastDue > 0);
  const atRiskValue = atRisk.reduce((s, l) => s + Number(l.outstanding), 0);
  const at30 = loans.filter((l) => l.daysPastDue >= 30);
  const at90 = loans.filter((l) => l.daysPastDue >= 90);
  const onTime =
    loans.length === 0
      ? 1
      : loans.reduce((s, l) => s + (l.daysPastDue > 0 ? 0 : 1), 0) / loans.length;
  return {
    scope,
    scopeId,
    scopeName,
    outstandingTotal: outstandingTotal.toFixed(2),
    atRisk: atRiskValue.toFixed(2),
    par1: outstandingTotal > 0 ? atRiskValue / outstandingTotal : 0,
    par30: outstandingTotal > 0 ? at30.reduce((s, l) => s + Number(l.outstanding), 0) / outstandingTotal : 0,
    par90: outstandingTotal > 0 ? at90.reduce((s, l) => s + Number(l.outstanding), 0) / outstandingTotal : 0,
    onTimeRepaymentRate: onTime,
    loansTotal: loans.length,
    loansAtRisk: atRisk.length,
  };
}
