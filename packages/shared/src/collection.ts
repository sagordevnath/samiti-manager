/**
 * ── Collection & Repayment module ────────────────────────────────────────────
 * The daily field workflow: per-meeting collection sheets, payment allocation
 * (overdue → current installment → savings due → advance), offline-friendly
 * idempotent entry posting, receipts, and officer cash handovers.
 *
 * Money is transmitted as string; numeric(14,2) in DB. The allocation engine
 * is pure so the API (authoritative), the DB trigger (defense in depth) and
 * the web sheet (live feedback) share one implementation.
 */

import { z } from 'zod';
import { moneySchema, paginationQuerySchema, uuidSchema } from './schemas.js';

// ── Allocation order (requirement 1) ────────────────────────────────────────
export const ALLOCATION_ORDERS = [
  'overdue_first', // overdue → current installment → savings → advance
  'savings_first', // savings due → overdue → installment → advance
  'proportional', // (kept for orgs that split pro-rata; documented as approximate)
] as const;
export type AllocationOrder = (typeof ALLOCATION_ORDERS)[number];

export const ALLOCATION_ORDER_LABELS_BN: Record<AllocationOrder, string> = {
  overdue_first: 'বকেয়া → বর্তমান কিস্তি → সঞ্চয় → অগ্রিম',
  savings_first: 'সঞ্চয় → বকেয়া → কিস্তি → অগ্রিম',
  proportional: 'আনুপাতিক বণ্টন',
};

// ── Zod primitives ──────────────────────────────────────────────────────────
export const collectionSheetQuerySchema = z.object({
  branchId: uuidSchema.optional(),
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD').optional(),
  officerId: uuidSchema.optional(),
});
export type CollectionSheetQuery = z.infer<typeof collectionSheetQuerySchema>;

/** One member row of the collection sheet (requirement 1). */
export interface CollectionSheetRow {
  memberId: string;
  memberCode: string;
  memberName: string;
  samityId: string | null;
  samityName: string | null;
  /** Active loan context (null when savings-only member). */
  loan: {
    applicationId: string;
    loanNumber: string | null;
    productName: string | null;
    installmentAmount: string;
    /** All unpaid installments up to today: overdue ones first. */
    overdue: Array<{ installmentId: string; seq: number; dueDate: string; amount: string; daysOverdue: number }>;
    current: { installmentId: string; seq: number; dueDate: string; amount: string } | null;
  } | null;
  /** Compulsory savings due for this meeting (per meeting cadence). */
  savingsDue: { accountId: string; accountNumber: string; productName: string; amount: string } | null;
  /** Already-advanced money (paid beyond all dues). */
  advanceBalance: string;
  /** overdue + installment + savings due (advance excluded — it is credit). */
  totalDue: string;
}

export interface CollectionSheet {
  meetingDate: string;
  branchId: string;
  branchName: string | null;
  officerId: string | null;
  allocationOrder: AllocationOrder;
  rows: CollectionSheetRow[];
  totals: { due: string; collected: string; members: number };
}

// ── Entry posting (offline-safe, idempotent) ────────────────────────────────
export const collectionEntrySchema = z.object({
  /** Client-generated idempotency key (uuid). Same key ⇒ same stored reply. */
  idempotencyKey: uuidSchema,
  memberId: uuidSchema,
  meetingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  /** Paid against the loan (allocated by the engine). */
  loanPaid: moneySchema.optional(),
  /** Paid against savings due (posts a savings deposit). */
  savingsPaid: moneySchema.optional(),
  /** Free-form extra collection beyond dues (becomes advance). */
  extraPaid: moneySchema.optional(),
  note: z.string().trim().max(300).optional(),
  /** Offline-captured timestamp for the audit trail. */
  capturedAt: z.string().datetime().optional(),
});
export type CollectionEntryInput = z.infer<typeof collectionEntrySchema>;

/** How one payment was allocated across buckets (read model + receipt). */
export interface CollectionAllocation {
  overdueApplied: Array<{ installmentId: string; seq: number; amount: string }>;
  currentApplied: { installmentId: string; seq: number; amount: string } | null;
  savingsApplied: string;
  advanceApplied: string;
  unapplied: string;
}

export interface CollectionReceipt {
  receiptNo: string;
  entryId: string;
  idempotencyKey: string;
  meetingDate: string;
  memberName: string;
  memberCode: string;
  loanNumber: string | null;
  allocation: CollectionAllocation;
  totalCollected: string;
  /** Passbook lines produced by this entry (loan + savings). */
  passbookLines: Array<{ book: 'loan' | 'savings'; description: string; amount: string }>;
  collectedBy: string | null;
  createdAt: string;
}

export interface CollectionEntryResponse {
  /** true when this exact idempotency key had already been posted. */
  duplicate: boolean;
  receipt: CollectionReceipt;
}

// ── Batch sync (offline queue flush, requirement 2) ─────────────────────────
export const collectionSyncSchema = z.object({
  entries: z.array(collectionEntrySchema).min(1).max(500),
});
export type CollectionSyncInput = z.infer<typeof collectionSyncSchema>;

export interface CollectionSyncResultItem {
  idempotencyKey: string;
  status: 'posted' | 'duplicate' | 'failed';
  receiptNo?: string;
  error?: string;
}

export interface CollectionSyncResult {
  results: CollectionSyncResultItem[];
  posted: number;
  duplicates: number;
  failed: number;
}

// ── Officer cash handover (requirement 4) ───────────────────────────────────
export const HANDOVER_STATUSES = ['draft', 'submitted', 'confirmed', 'rejected'] as const;
export type HandoverStatus = (typeof HANDOVER_STATUSES)[number];

export const cashHandoverCreateSchema = z.object({
  handoverDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  officerNote: z.string().trim().max(300).optional(),
});
export type CashHandoverCreateInput = z.infer<typeof cashHandoverCreateSchema>;

export const cashHandoverSubmitSchema = z.object({
  countedAmount: moneySchema,
  officerNote: z.string().trim().max(300).optional(),
});
export type CashHandoverSubmitInput = z.infer<typeof cashHandoverSubmitSchema>;

export const cashHandoverConfirmSchema = z.object({
  decision: z.enum(['confirm', 'reject']),
  receivedAmount: moneySchema.optional(),
  accountantNote: z.string().trim().max(300).optional(),
});
export type CashHandoverConfirmInput = z.infer<typeof cashHandoverConfirmSchema>;

export interface CashHandover {
  id: string;
  officerId: string;
  officerName: string;
  branchId: string;
  handoverDate: string;
  /** System tally: collections allocated to cash modes for that date. */
  expectedAmount: string;
  /** What the officer physically counted and submitted. */
  countedAmount: string | null;
  /** What the accountant received (defaults to counted on confirm). */
  receivedAmount: string | null;
  /** counted − expected: negative = shortage, positive = excess. */
  difference: string;
  differenceKind: 'none' | 'shortage' | 'excess';
  status: HandoverStatus;
  officerNote: string | null;
  accountantNote: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CashSummary {
  officerId: string;
  handoverDate: string;
  /** Sum of today's collected allocations (cash-mode by default). */
  collectedToday: string;
  /** Amount already handed over in confirmed/submitted handovers. */
  handedOver: string;
  /** collectedToday − handedOver: what should be in the officer's cashbag. */
  cashInHand: string;
  lastHandover: CashHandover | null;
}

// ── Database row shapes (mirror supabase/migrations 0020) ───────────────────
export interface CollectionEntryRow {
  id: string;
  org_id: string;
  branch_id: string;
  idempotency_key: string;
  member_id: string;
  application_id: string | null;
  meeting_date: string;
  loan_paid: string;
  savings_paid: string;
  extra_paid: string;
  allocation: CollectionAllocation;
  receipt_no: string;
  collected_by: string | null;
  captured_at: string | null;
  note: string | null;
  created_at: string;
}

export interface CashHandoverRow {
  id: string;
  org_id: string;
  branch_id: string;
  officer_id: string;
  handover_date: string;
  expected_amount: string;
  counted_amount: string | null;
  received_amount: string | null;
  difference: string;
  difference_kind: 'none' | 'shortage' | 'excess';
  status: HandoverStatus;
  officer_note: string | null;
  accountant_note: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Page query for list endpoints ───────────────────────────────────────────
export const handoverQuerySchema = paginationQuerySchema.partial().extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(HANDOVER_STATUSES).optional(),
});
export type HandoverQuery = z.infer<typeof handoverQuerySchema>;
