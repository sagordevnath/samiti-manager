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
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(500).optional(),
  reversalOf: uuidSchema.optional(), // original tx id when posting a reversal
  reversalReason: z.string().trim().max(500).optional(),
  reversalApprovedBy: uuidSchema.optional(),
});
export type SavingsTxCreateInput = z.infer<typeof savingsTxCreateSchema>;

// ── Interest run ─────────────────────────────────────────────────────────────
export const interestRunSchema = z.object({
  productIds: z.array(uuidSchema).optional(),
  asOf: z.string().datetime().optional(),
  dryRun: z.boolean().default(true),
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