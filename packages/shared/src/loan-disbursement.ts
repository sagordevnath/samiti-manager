/**
 * Loan disbursement: converts approved loan applications into active loans.
 * Extends the loan module (loan.ts + loan-governance.ts) with requirements
 * 1–4 of the disbursement spec:
 *
 *   1) branch disbursement queue grouped by samity and planned date
 *   2) pre-disbursement checks (savings deposit, insurance, fees, member
 *      present, guarantor signature, cash available within the branch limit)
 *   3) disbursement modes — cash at branch/center, bank transfer, MFS
 *      (bKash/Nagad reference number, no gateway) — plus who received the
 *      cash and the actual user of funds (women borrowers)
 *   4) automatic repayment schedule on disbursement: declining balance and
 *      flat methods, holidays and weekly-closure days shift due dates,
 *      grace periods honored; rows stored per installment.
 *
 * Money is transmitted as string; numeric(14,2) in DB. All helpers are pure
 * so the API (authoritative), the DB (defense in depth) and the web queue
 * (live feedback) share one implementation.
 */

import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';
import {
  computeLoanSchedule,
  type InstallmentFrequency,
  type InterestMethod,
  type LoanSchedule,
  type ScheduleInstallment,
} from './loan.js';

// ── 3) Disbursement modes ───────────────────────────────────────────────────
export const DISBURSEMENT_MODES = ['cash_branch', 'cash_center', 'bank_transfer', 'bkash', 'nagad'] as const;
export type DisbursementMode = (typeof DISBURSEMENT_MODES)[number];

export const DISBURSEMENT_MODE_LABELS_BN: Record<DisbursementMode, string> = {
  cash_branch: 'শাখায় নগদ',
  cash_center: 'কেন্দ্রে নগদ',
  bank_transfer: 'ব্যাংক ট্রান্সফার',
  bkash: 'বিকাশ',
  nagad: 'নগদ (মোবাইল)',
};

/** Modes that physically hand over cash (receiver recording is mandatory). */
export const CASH_MODES: readonly DisbursementMode[] = ['cash_branch', 'cash_center'];
/** Modes that require an external reference number. */
export const REFERENCE_MODES: readonly DisbursementMode[] = ['bank_transfer', 'bkash', 'nagad'];

// ── 2) Pre-disbursement checks ──────────────────────────────────────────────
export const DISBURSEMENT_CHECKS = [
  'savings_deposit_paid',
  'insurance_premium_collected',
  'fees_paid',
  'member_present',
  'guarantor_signature',
  'cash_available',
] as const;
export type DisbursementCheck = (typeof DISBURSEMENT_CHECKS)[number];

export const DISBURSEMENT_CHECK_LABELS_BN: Record<DisbursementCheck, string> = {
  savings_deposit_paid: 'প্রথম সঞ্চয় কিস্তি জমা হয়েছে',
  insurance_premium_collected: 'বীমা প্রিমিয়াম আদায় হয়েছে',
  fees_paid: 'প্রক্রিয়াকরণ ফি ও সার্ভিস চার্জ পরিশোধিত',
  member_present: 'সদস্য উপস্থিত',
  guarantor_signature: 'গ্যারান্টরের স্বাক্ষর সংগ্রহ',
  cash_available: 'শাখায় নগদ সীমার মধ্যে আছে',
};

export const disbursementCheckItemSchema = z.object({
  check: z.enum(DISBURSEMENT_CHECKS),
  done: z.boolean(),
  note: z.string().trim().max(300).optional(),
});
export type DisbursementCheckItem = z.infer<typeof disbursementCheckItemSchema>;

export const disbursementCreateSchema = z
  .object({
    mode: z.enum(DISBURSEMENT_MODES),
    /** Planned disbursement date (queue grouping); defaults to today. */
    plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
    disbursementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
    checkItems: z.array(disbursementCheckItemSchema).min(DISBURSEMENT_CHECKS.length).max(DISBURSEMENT_CHECKS.length),
    // Mode-specific evidence.
    mfsReference: z.string().trim().min(4).max(40).optional(), // bKash/Nagad TrxID
    bankReference: z.string().trim().min(4).max(60).optional(),
    cashReceivedByName: z.string().trim().min(3).max(120).optional(),
    // Women borrowers: who actually uses the funds (requirement 3).
    actualUserOfFunds: z.string().trim().min(3).max(120).optional(),
    actualUserRelation: z.string().trim().max(60).optional(),
    // Cash-limit evidence for the cash_available check.
    branchCashLimitBdt: moneySchema.optional(),
    cashAvailableBdt: moneySchema.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((d, ctx) => {
    // Every check must pass before money leaves the drawer.
    for (const c of DISBURSEMENT_CHECKS) {
      const item = d.checkItems.find((i) => i.check === c);
      if (!item) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Missing check: ${c}`, path: ['checkItems'] });
      } else if (!item.done) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Pre-disbursement check not completed: ${c}`, path: ['checkItems'] });
      }
    }
    if (CASH_MODES.includes(d.mode) && !d.cashReceivedByName) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cashReceivedByName is required for cash disbursement', path: ['cashReceivedByName'] });
    }
    if (d.mode === 'bank_transfer' && !d.bankReference) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'bankReference is required for bank transfer', path: ['bankReference'] });
    }
    if ((d.mode === 'bkash' || d.mode === 'nagad') && !d.mfsReference) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'mfsReference (TrxID) is required for bKash/Nagad', path: ['mfsReference'] });
    }
    if (d.mode === 'cash_branch' && d.checkItems.find((i) => i.check === 'cash_available')?.done) {
      if (d.branchCashLimitBdt === undefined || d.cashAvailableBdt === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Record branchCashLimitBdt and cashAvailableBdt as cash-limit evidence', path: ['cashAvailableBdt'] });
      } else if (Number(d.cashAvailableBdt) < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cashAvailableBdt must not be negative', path: ['cashAvailableBdt'] });
      }
    }
  });
export type DisbursementCreateInput = z.infer<typeof disbursementCreateSchema>;

/** Pre-execution draft: record planned date, mode and check progress without paying. */
export const disbursementUpdateSchema = z.object({
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
  mode: z.enum(DISBURSEMENT_MODES).optional(),
  checkItems: z.array(disbursementCheckItemSchema).max(DISBURSEMENT_CHECKS.length).optional(),
  note: z.string().trim().max(500).optional(),
});
export type DisbursementUpdateInput = z.infer<typeof disbursementUpdateSchema>;

/** A pending disbursement row in the branch queue (requirement 1). */
export interface DisbursementQueueItem {
  applicationId: string;
  applicationNumber: string;
  branchId: string;
  branchName: string | null;
  samityId: string | null;
  samityName: string | null;
  memberId: string;
  memberName: string;
  memberCode: string;
  productName: string | null;
  productNameBn: string | null;
  amount: string;
  termMonths: number;
  frequency: InstallmentFrequency;
  method: InterestMethod;
  interestRate: number;
  plannedDate: string | null;
  checksDone: number;
  checksTotal: number;
  ready: boolean; // all six checks recorded as done
  approvedAt: string | null;
}

/** The stored schedule row (loan_repayment_schedule in migration 0016). */
export interface DisbursementScheduleRow {
  id: string;
  applicationId: string;
  seq: number;
  dueDate: string; // shifted date actually used
  originalDueDate: string; // pre-shift calendar date
  shifted: boolean;
  shiftReason: string | null; // holiday name or weekly closure
  principal: string;
  interest: string;
  total: string;
  balanceAfter: string;
  /** Collected so far against this installment (collection module writes). */
  paidAmount?: string;
  paidAt?: string | null;
}

export interface DisbursementSchedule {
  schedule: LoanSchedule;
  rows: DisbursementScheduleRow[];
  shiftedCount: number;
}

export type DisbursementStatus = 'pending' | 'prepared' | 'completed' | 'cancelled';

export interface DisbursementRecord {
  id: string;
  applicationId: string;
  orgId: string;
  branchId: string;
  samityId: string | null;
  applicationNumber: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  productName: string | null;
  amount: string;
  mode: DisbursementMode;
  status: DisbursementStatus;
  disbursementDate: string;
  plannedDate: string | null;
  checks: Record<DisbursementCheck, { done: boolean; note: string | null }>;
  mfsReference: string | null;
  bankReference: string | null;
  cashReceivedByName: string | null;
  actualUserOfFunds: string | null;
  actualUserRelation: string | null;
  note: string | null;
  schedule: DisbursementSchedule;
  /** Two-step control (requirement 6). */
  preparedBy: string | null;
  preparedAt: string | null;
  disbursedBy: string | null;
  disbursedAt: string;
  /** 8) Loan number assigned at authorization. */
  loanNumber: string | null;
  voucherNumber: string | null;
  /** 10) Same-day rollback. */
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  createdAt: string;
}

/** 10) Cancel is allowed only on the disbursement day, with a reason. */
export const disbursementCancelSchema = z.object({
  reason: z.string().trim().min(10, 'A reason of at least 10 characters is required').max(500),
});
export type DisbursementCancelInput = z.infer<typeof disbursementCancelSchema>;

/**
 * Step 2 of the two-step control — authorization payload (Branch Manager).
 * Checks were recorded at prepare; the mode is already on the record, so the
 * payload carries only the payout date, mode evidence and cash-limit figures.
 */
export const disbursementAuthorizeSchema = z.object({
  disbursementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
  mfsReference: z.string().trim().min(4).max(40).optional(),
  bankReference: z.string().trim().min(4).max(60).optional(),
  cashReceivedByName: z.string().trim().min(3).max(120).optional(),
  actualUserOfFunds: z.string().trim().min(3).max(120).optional(),
  actualUserRelation: z.string().trim().max(60).optional(),
  branchCashLimitBdt: moneySchema.optional(),
  cashAvailableBdt: moneySchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export type DisbursementAuthorizeInput = z.infer<typeof disbursementAuthorizeSchema>;

// ── 5) Accounting postings (Module 10 hooks) ────────────────────────────────
export const DISBURSEMENT_ACCOUNTS = {
  loanPortfolio: { code: '1200', name: 'Loan Portfolio', nameBn: 'ঋণ পোর্টফোলিও' },
  cashVault: { code: '1010', name: 'Cash in Vault', nameBn: 'নগদ তহবিল' },
  bankAccount: { code: '1020', name: 'Bank Account', nameBn: 'ব্যাংক হিসাব' },
  mfsClearing: { code: '1030', name: 'MFS Clearing', nameBn: 'মোবাইল ব্যাংকিং ক্লিয়ারিং' },
  feeIncome: { code: '4200', name: 'Loan Processing Fee Income', nameBn: 'ঋণ প্রক্রিয়াকরণ ফি আয়' },
  serviceChargeIncome: { code: '4210', name: 'Service Charge Income', nameBn: 'সার্ভিস চার্জ আয়' },
  insuranceIncome: { code: '4220', name: 'Insurance Premium Income', nameBn: 'বীমা প্রিমিয়াম আয়' },
} as const;

export interface JournalLineDraft {
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
}

export interface JournalEntryDraft {
  entryDate: string;
  sourceType: 'loan_disbursement' | 'loan_disbursement_reversal' | 'collection' | 'savings';
  sourceId: string;
  memo: string;
  lines: JournalLineDraft[];
}

/**
 * Double-entry postings for one disbursement (requirement 5):
 * debit Loan Portfolio (principal) — credit Cash/Bank/MFS clearing (net
 * payout after collected fees) — credit the collected fee incomes.
 * Always balanced; the reversal flips every debit/credit.
 */
export function buildDisbursementJournal(input: {
  applicationId: string;
  disbursementDate: string;
  principal: string;
  mode: DisbursementMode;
  feeAmounts?: { processingFee?: string; serviceCharge?: string; insurancePremium?: string };
  reversal?: boolean;
}): JournalEntryDraft {
  const principal = Number(input.principal);
  const fees = {
    processingFee: Number(input.feeAmounts?.processingFee ?? 0),
    serviceCharge: Number(input.feeAmounts?.serviceCharge ?? 0),
    insurancePremium: Number(input.feeAmounts?.insurancePremium ?? 0),
  };
  const payout = principal - fees.processingFee - fees.serviceCharge - fees.insurancePremium;
  const settlement =
    input.mode === 'bank_transfer' ? DISBURSEMENT_ACCOUNTS.bankAccount
    : input.mode === 'bkash' || input.mode === 'nagad' ? DISBURSEMENT_ACCOUNTS.mfsClearing
    : DISBURSEMENT_ACCOUNTS.cashVault;
  const money = (n: number) => n.toFixed(2);

  const lines: JournalLineDraft[] = [
    { accountCode: DISBURSEMENT_ACCOUNTS.loanPortfolio.code, accountName: DISBURSEMENT_ACCOUNTS.loanPortfolio.name, debit: money(principal), credit: '0.00' },
    { accountCode: settlement.code, accountName: settlement.name, debit: '0.00', credit: money(Math.max(payout, 0)) },
  ];
  if (fees.processingFee > 0) {
    lines.push({ accountCode: DISBURSEMENT_ACCOUNTS.feeIncome.code, accountName: DISBURSEMENT_ACCOUNTS.feeIncome.name, debit: '0.00', credit: money(fees.processingFee) });
  }
  if (fees.serviceCharge > 0) {
    lines.push({ accountCode: DISBURSEMENT_ACCOUNTS.serviceChargeIncome.code, accountName: DISBURSEMENT_ACCOUNTS.serviceChargeIncome.name, debit: '0.00', credit: money(fees.serviceCharge) });
  }
  if (fees.insurancePremium > 0) {
    lines.push({ accountCode: DISBURSEMENT_ACCOUNTS.insuranceIncome.code, accountName: DISBURSEMENT_ACCOUNTS.insuranceIncome.name, debit: '0.00', credit: money(fees.insurancePremium) });
  }
  if (input.reversal) {
    for (const line of lines) {
      [line.debit, line.credit] = [line.credit, line.debit];
    }
  }
  return {
    entryDate: input.disbursementDate,
    sourceType: input.reversal ? 'loan_disbursement_reversal' : 'loan_disbursement',
    sourceId: input.applicationId,
    memo: input.reversal ? 'Loan disbursement reversal (same-day cancel)' : `Loan disbursement ${input.applicationId}`,
    lines,
  };
}

/** 8) Passbook entry recorded when the loan is disbursed. */
export interface LoanPassbookEntry {
  id: string;
  applicationId: string;
  memberId: string;
  loanNumber: string;
  entryDate: string;
  description: string;
  debit: string;
  credit: string;
  balanceAfter: string;
}

/** 8) SMS notification queued at disbursement. */
export interface SmsMessage {
  id: string;
  memberId: string;
  phone: string | null;
  template: 'loan_disbursed' | 'loan_cancelled';
  body: string;
  status: 'queued' | 'sent' | 'failed';
  createdAt: string;
}

/** 9) Utilization visit, auto-scheduled 15 days after disbursement. */
export interface UtilizationVisit {
  id: string;
  applicationId: string;
  memberId: string;
  scheduledDate: string;
  status: 'scheduled' | 'completed' | 'missed';
  visitedAt: string | null;
  notes: string | null;
}

/** Number of days after disbursement for the auto utilization visit. */
export const UTILIZATION_VISIT_DAYS = 15;

/** Bangla SMS body for a disbursement (8). */
export function loanDisbursementSms(input: { memberName: string; amount: string; loanNumber: string }): string {
  return `প্রিয় ${input.memberName}, আপনার ঋণ ${input.amount} টি ${input.loanNumber} নম্বরে বিতরণ হয়েছে। — সমিতি ম্যানেজার`;
}

// ── Holiday calendar ────────────────────────────────────────────────────────
export const HOLIDAY_ACTIONS = ['shift_forward', 'shift_back'] as const;
export type HolidayAction = (typeof HOLIDAY_ACTIONS)[number];

export const holidaySchema = z.object({
  id: uuidSchema.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  name: z.string().trim().min(2).max(120),
  nameBn: z.string().trim().max(120).nullish(),
  isRecurring: z.boolean().default(false), // recurs every year (same month/day)
});
export type Holiday = z.infer<typeof holidaySchema>;

export const holidayUpsertSchema = z.object({ holidays: z.array(holidaySchema).max(200) });
export type HolidayUpsertInput = z.infer<typeof holidayUpsertSchema>;

// ── 4) Holiday-aware schedule generation ────────────────────────────────────
const DAYS_IN: Record<InstallmentFrequency, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

/** Replicates the schedule engine's due-date arithmetic. */
function addInterval(from: Date, i: number, frequency: InstallmentFrequency): Date {
  const d = new Date(from);
  if (frequency === 'monthly') d.setUTCMonth(d.getUTCMonth() + i);
  else d.setUTCDate(d.getUTCDate() + i * DAYS_IN[frequency]);
  return d;
}

/**
 * Weekly (and biweekly) installments naturally fall on the weekday the loan
 * was disbursed; branch samity meetings close on a fixed weekday. Returns
 * that weekday (0=Sun..6=Sat) for weekly/biweekly, else null.
 */
export function weeklyClosureDay(frequency: InstallmentFrequency, startFrom: Date): number | null {
  return frequency === 'weekly' || frequency === 'biweekly' ? startFrom.getUTCDay() : null;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isRecurringHolidayMatch(holiday: Holiday, date: string): boolean {
  if (!holiday.isRecurring) return holiday.date === date;
  return holiday.date.slice(5) === date.slice(5); // same month-day every year
}

/**
 * Shift `date` off holidays and the weekly closure day. Pure. `action`
 * decides forward (default, never later than needed) or back (fit the
 * samity meeting that already happened). A holiday landing on the closure
 * day keeps shifting until a working day is found.
 */
export function nextWorkingDay(
  date: string,
  opts: { holidays: Holiday[]; closureDay: number | null; action: HolidayAction },
): { date: string; shifted: boolean; reason: string | null } {
  const reasons: string[] = [];
  let current = new Date(`${date}T00:00:00Z`);
  const step = opts.action === 'shift_back' ? -1 : 1;
  for (let guard = 0; guard < 366; guard++) {
    const iso = isoDate(current);
    const holiday = opts.holidays.find((h) => isRecurringHolidayMatch(h, iso));
    if (holiday) {
      reasons.push(holiday.name);
      current.setUTCDate(current.getUTCDate() + step);
      continue;
    }
    if (opts.closureDay !== null && current.getUTCDay() === opts.closureDay) {
      reasons.push('সাপ্তাহিক বন্ধ / weekly closure');
      current.setUTCDate(current.getUTCDate() + step);
      continue;
    }
    break;
  }
  const shifted = isoDate(current) !== date;
  return { date: isoDate(current), shifted, reason: shifted ? [...new Set(reasons)].join(', ') : null };
}

/**
 * Generate the stored repayment schedule for a disbursement: the pure
 * amortization from `computeLoanSchedule` (declining balance or flat, grace
 * periods honored), then each due date shifted off holidays and the weekly
 * closure day. Shifts never change amounts — only calendar dates.
 */
export function computeDisbursementSchedule(input: {
  principal: string;
  annualRatePercent: number;
  method: InterestMethod;
  termMonths: number;
  frequency: InstallmentFrequency;
  gracePeriodInstallments?: number;
  disbursementDate: Date;
  holidays: Holiday[];
  holidayAction: HolidayAction;
  weeklyClosureEnabled?: boolean;
}): DisbursementSchedule {
  const closure = input.weeklyClosureEnabled === false ? null : weeklyClosureDay(input.frequency, input.disbursementDate);
  const schedule = computeLoanSchedule({
    principal: input.principal,
    annualRatePercent: input.annualRatePercent,
    method: input.method,
    termMonths: input.termMonths,
    frequency: input.frequency,
    gracePeriodInstallments: input.gracePeriodInstallments,
    startFrom: input.disbursementDate,
  });

  const rows: DisbursementScheduleRow[] = [];
  let shiftedCount = 0;
  schedule.installments.forEach((inst: ScheduleInstallment, idx: number) => {
    const original = isoDate(addInterval(input.disbursementDate, idx + 1, input.frequency));
    const { date, shifted, reason } = nextWorkingDay(original, {
      holidays: input.holidays,
      closureDay: closure,
      action: input.holidayAction,
    });
    if (shifted) shiftedCount++;
    rows.push({
      id: `sched-${inst.seq}`,
      applicationId: '',
      seq: inst.seq,
      dueDate: date,
      originalDueDate: original,
      shifted,
      shiftReason: reason,
      principal: inst.principal,
      interest: inst.interest,
      total: inst.total,
      balanceAfter: inst.balanceAfter,
    });
  });

  return { schedule, rows, shiftedCount };
}

/** Queue grouping key: samity first, then planned date (requirement 1). */
export function queueGroupKey(item: Pick<DisbursementQueueItem, 'samityName' | 'samityId' | 'plannedDate'>): string {
  const samity = item.samityName ?? item.samityId ?? 'unassigned';
  return `${samity}::${item.plannedDate ?? 'unscheduled'}`;
}

// ── 7) Printable voucher + loan agreement (Bangla) ──────────────────────────
export interface LoanVoucherData {
  voucherNumber: string;
  loanNumber: string;
  orgName: string;
  branchName: string;
  disbursementDate: string;
  memberName: string;
  memberCode: string;
  applicationNumber: string;
  productName: string | null;
  amount: string;
  mode: DisbursementMode;
  modeBn: string;
  cashReceivedByName: string | null;
  mfsReference: string | null;
  bankReference: string | null;
  actualUserOfFunds: string | null;
  actualUserRelation: string | null;
  journal: JournalEntryDraft | null;
  preparedBy: string | null;
  authorizedBy: string | null;
  generatedAt: string;
}

export interface LoanAgreementData {
  loanNumber: string;
  orgName: string;
  agreementDate: string;
  member: { name: string; nameBn: string | null; code: string; address: string | null; mobile: string | null };
  product: { name: string; nameBn: string | null; interestRate: number; interestMethod: string; installmentFrequency: string };
  amount: string;
  termMonths: number;
  totalPayable: string;
  totalInterest: string;
  installments: Array<{ seq: number; dueDate: string; principal: string; interest: string; total: string }>;
  guarantors: Array<{ name: string; relation: string; mobile: string }>;
  utilization: Array<{ category: string; description: string; amount: string }>;
  purpose: string;
}
