/**
 * Savings module shared types + Zod schemas.
 *
 * Product taxonomy:
 *   compulsory   – auto-linked to loan disbursement or a fixed weekly amount.
 *   voluntary    – member-controlled recurring deposit.
 *   dps          – recurring deposit (Daily/Weekly/Monthly Savings Plan).
 *   fixed        – fixed deposit / fixed deposit receipt (FDR).
 *   share        – cooperative share capital (paid-up shares).
 *
 * Money is transmitted as string; numeric(14,2) in DB.
 */

import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';

// ── Enums (mirror DB enums) ──────────────────────────────────────────────────
export const SAVINGS_PRODUCT_TYPES = ['compulsory', 'voluntary', 'dps', 'fixed', 'share'] as const;
export type SavingsProductType = (typeof SAVINGS_PRODUCT_TYPES)[number];

export const COMPOUND_OPTIONS = ['none', 'simple', 'quarterly', 'monthly', 'yearly'] as const;
export type CompoundOption = (typeof COMPOUND_OPTIONS)[number];

export const SAVINGS_ACCOUNT_STATUSES = ['active', 'dormant', 'frozen', 'closed'] as const;
export type SavingsAccountStatus = (typeof SAVINGS_ACCOUNT_STATUSES)[number];

export const SAVINGS_TX_TYPES = [
  'deposit',
  'withdrawal',
  'interest',
  'transfer',
  'adjustment',
  'closure',
] as const;
export type SavingsTxType = (typeof SAVINGS_TX_TYPES)[number];

export const SAVINGS_TX_STATUSES = ['posted', 'reversed'] as const;
export type SavingsTxStatus = (typeof SAVINGS_TX_STATUSES)[number];

// ── Product setup ────────────────────────────────────────────────────────────
export const savingsProductCreateSchema = z.object({
  orgId: uuidSchema,
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(120),
  nameBn: z.string().trim().min(2).max(120).optional(),
  productType: z.enum(SAVINGS_PRODUCT_TYPES),
  interestRate: z.coerce.number().min(0).max(100).default(0), // percent per annum
  compounding: z.enum(COMPOUND_OPTIONS).default('none'),
  minBalance: moneySchema.default('0'),
  maxDeposit: moneySchema.optional(),
  withdrawalLimit: moneySchema.default('0'), // 0 = unlimited
  withdrawalLimitPeriod: z.enum(['per_tx', 'daily', 'monthly']).default('per_tx'),
  withdrawalRules: z.string().trim().max(500).optional(),
  lockWhileLoanActive: z.boolean().default(false),
  maturityMonths: z.coerce.number().int().min(0).max(600).default(0), // 0 = no maturity
  earlyWithdrawalPenaltyRate: z.coerce.number().min(0).max(100).default(0),
  autoLinkLoan: z.boolean().default(false), // compulsory → link to loan amount
  autoLinkWeeklyAmount: moneySchema.default('0'), // compulsory → fixed weekly auto-save
  requiresManagerApprovalAbove: moneySchema.default('0'), // approval threshold
  dormantAfterMonths: z.coerce.number().int().min(0).max(120).default(6),
  isActive: z.boolean().default(true),
});
export type SavingsProductCreateInput = z.infer<typeof savingsProductCreateSchema>;

// ── Account ──────────────────────────────────────────────────────────────────
export const savingsAccountCreateSchema = z.object({
  orgId: uuidSchema,
  branchId: uuidSchema,
  memberId: uuidSchema,
  productId: uuidSchema,
  nomineeId: uuidSchema.optional(),
  openingBalance: moneySchema.default('0'),
});
export type SavingsAccountCreateInput = z.infer<typeof savingsAccountCreateSchema>;

// ── Transaction ──────────────────────────────────────────────────────────────
export const savingsTxCreateSchema = z.object({
  accountId: uuidSchema,
  type: z.enum(SAVINGS_TX_TYPES),
  amount: moneySchema,
  toAccountId: uuidSchema.optional(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  reversalOf: uuidSchema.optional(), // original tx id when posting a reversal
  reversalReason: z.string().trim().min(1).max(500).optional(),
  approvalReference: z.string().trim().max(120).optional(),
});
export type SavingsTxCreateInput = z.infer<typeof savingsTxCreateSchema>;

// ── Interest run ─────────────────────────────────────────────────────────────
export const interestRunSchema = z.object({
  productIds: z.array(uuidSchema).optional(),
  asOf: z.string().datetime().optional(),
  dryRun: z.boolean().default(true),
  frequency: z.enum(['monthly', 'yearly']).default('monthly'),
});
export type InterestRunInput = z.infer<typeof interestRunSchema>;

// ── Share capital ────────────────────────────────────────────────────────────
export const shareProductCreateSchema = z.object({
  orgId: uuidSchema,
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(2).max(120),
  nameBn: z.string().trim().min(2).max(120).optional(),
  faceValue: moneySchema,
  maxShares: z.coerce.number().int().min(0).default(0), // 0 = unlimited
  isActive: z.boolean().default(true),
});
export type ShareProductCreateInput = z.infer<typeof shareProductCreateSchema>;

export const shareAllotmentSchema = z.object({
  orgId: uuidSchema,
  memberId: uuidSchema,
  productId: uuidSchema,
  shares: z.coerce.number().int().min(1),
  paidAmount: moneySchema,
  reference: z.string().trim().max(120).optional(),
});
export type ShareAllotmentInput = z.infer<typeof shareAllotmentSchema>;

export const dividendDeclarationSchema = z.object({
  orgId: uuidSchema,
  productId: uuidSchema,
  financialYear: z.string().trim().max(20),
  surplus: moneySchema,
  payoutRate: z.coerce.number().min(0).max(100), // percent of surplus
  approvedByMeetingRef: z.string().trim().max(120),
  approvedAt: z.string().datetime(),
});
export type DividendDeclarationInput = z.infer<typeof dividendDeclarationSchema>;

// ── Passbook statement (view + printable) ──────────────────────────────────
export const passbookQuerySchema = z.object({
  accountId: uuidSchema,
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
});
export type PassbookQuery = z.infer<typeof passbookQuerySchema>;

/** One printed/fetchable ledger line of a passbook. */
export interface PassbookLine {
  id: string;
  date: string; // ISO timestamp
  type: SavingsTxType;
  deposit: string;
  withdrawal: string;
  balanceAfter: string;
  reference: string | null;
  note: string | null;
}

export interface PassbookStatement {
  account: {
    id: string;
    accountNumber: string;
    memberName: string;
    memberNameBn: string | null;
    memberCode: string | null;
    productName: string;
    productNameBn: string | null;
    branchName: string | null;
    orgName: string | null;
    status: SavingsAccountStatus;
  };
  from: string;
  to: string;
  openingBalance: string;
  closingBalance: string;
  totalDeposits: string;
  totalWithdrawals: string;
  lines: PassbookLine[];
}

/**
 * Pure statement builder — shared by the API (demo + Supabase paths) and the
 * web print view, so both compute identical opening/closing figures.
 */
export function computeStatement(
  account: PassbookStatement['account'],
  from: string,
  to: string,
  allLines: PassbookLine[],
  ledgerBalance: string,
): PassbookStatement {
  const inRange = allLines.filter((l) => l.date.slice(0, 10) >= from && l.date.slice(0, 10) <= to);
  const totalDeposits = inRange.reduce((s, l) => s + Number(l.deposit), 0);
  const totalWithdrawals = inRange.reduce((s, l) => s + Number(l.withdrawal), 0);
  const closing = inRange.length > 0 ? Number(inRange[inRange.length - 1]!.balanceAfter) : Number(ledgerBalance);
  const opening = closing - totalDeposits + totalWithdrawals;
  return {
    account,
    from,
    to,
    openingBalance: opening.toFixed(2),
    closingBalance: closing.toFixed(2),
    totalDeposits: totalDeposits.toFixed(2),
    totalWithdrawals: totalWithdrawals.toFixed(2),
    lines: inRange,
  };
}

// ── Balance integrity / reconciliation ──────────────────────────────────────
export const reconciliationRunSchema = z.object({
  accountId: uuidSchema.optional(), // omit = check all org accounts
});
export type ReconciliationRunInput = z.infer<typeof reconciliationRunSchema>;

export interface ReconciliationResult {
  accountId: string;
  accountNumber: string;
  storedBalance: string;
  ledgerBalance: string; // recomputed from savings_transactions
  difference: string;
  entryCount: number;
  lastEntryAt: string | null;
  status: 'ok' | 'mismatch';
}

export interface ReconciliationReport {
  runAt: string;
  checked: number;
  mismatches: number;
  results: ReconciliationResult[];
}

/** DB-side counterpart: recompute_balance(account_id) + nightly report query in 0011. */

// ── Dividend calculation helpers (pure) ────────────────────────────────────
export const DIVIDEND_STATUSES = ['draft', 'approved'] as const;
export type DividendStatus = (typeof DIVIDEND_STATUSES)[number];

/**
 * Split declared surplus into dividend pool and retained reserves.
 * payoutRate is a percent of surplus approved by the general meeting.
 */
export function splitDividendSurplus(surplus: string, payoutRate: number): { dividendPool: string; retained: string } {
  const pool = (Number(surplus) * payoutRate) / 100;
  return { dividendPool: pool.toFixed(2), retained: (Number(surplus) - pool).toFixed(2) };
}

/** One member's dividend: pool prorated by paid-up shares of the total. */
export function memberDividend(dividendPool: string, paidShares: number, totalPaidShares: number, faceValue: string): string {
  if (totalPaidShares <= 0) return '0.00';
  const paidCapital = paidShares * Number(faceValue);
  const totalCapital = totalPaidShares * Number(faceValue);
  return ((Number(dividendPool) * paidCapital) / totalCapital).toFixed(2);
}

/** State machine: dividends become immutable once approved by the meeting record. */
export function nextDividendStatus(current: DividendStatus): DividendStatus | null {
  const transitions: Record<DividendStatus, DividendStatus | null> = { draft: 'approved', approved: null };
  return transitions[current];
}

/**
 * Per-share dividend preview given declaration inputs — used by the API
 * preview endpoint and the UI before a declaration is saved.
 */
export function previewDividend(
  declarations: Array<{ memberId: string; paidShares: number }>,
  input: { surplus: string; payoutRate: number; faceValue: string },
): { dividendPool: string; retained: string; perMember: Array<{ memberId: string; paidShares: number; amount: string }> } {
  const { dividendPool, retained } = splitDividendSurplus(input.surplus, input.payoutRate);
  const totalPaidShares = declarations.reduce((s, d) => s + d.paidShares, 0);
  return {
    dividendPool,
    retained,
    perMember: declarations.map((d) => ({
      memberId: d.memberId,
      paidShares: d.paidShares,
      amount: memberDividend(dividendPool, d.paidShares, totalPaidShares, input.faceValue),
    })),
  };
}