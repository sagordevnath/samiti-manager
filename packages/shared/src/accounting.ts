/**
 * ── Accounting & double-entry bookkeeping (Module 10) ────────────────────────
 * NGO-MFI / cooperative reporting: chart of accounts with fund/project and
 * branch dimensions, vouchers (receipt, payment, bank, journal, contra) with
 * draft → checked → approved workflow, event-to-journal mapping for automatic
 * postings from other modules, daily branch cash book with day-end closing,
 * bank reconciliation, and a petty-cash register.
 *
 * Money is transmitted as string; numeric(14,2) in DB. Balance/allocation
 * helpers are pure so the API (authoritative), DB triggers (defense in depth)
 * and the web UI (live feedback) share one implementation.
 */
import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';

// ── 1) Chart of accounts ─────────────────────────────────────────────────────
export const ACCOUNT_TYPES = ['asset', 'liability', 'fund', 'income', 'expense'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS_BN: Record<AccountType, string> = {
  asset: 'সম্পদ',
  liability: 'দায়',
  fund: 'তহবিল / মূলধন',
  income: 'আয়',
  expense: 'ব্যয়',
};

export const ACCOUNT_CATEGORIES = ['control', 'cash', 'bank', 'income', 'expense', 'party', 'member', 'memo'] as const;
export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

export const ACCOUNT_CATEGORY_LABELS_BN: Record<AccountCategory, string> = {
  control: 'নিয়ন্ত্রণ হিসাব',
  cash: 'নগদ',
  bank: 'ব্যাংক',
  income: 'আয়',
  expense: 'ব্যয়',
  party: 'পক্ষ',
  member: 'সদস্য',
  memo: 'স্মারক',
};

/** Asset and expense accounts are debit-natured (increases on debit). */
export function isDebitNature(type: AccountType): boolean {
  return type === 'asset' || type === 'expense';
}

export interface GlAccount {
  id: string;
  code: string; // e.g. 1010, 2100 — editable per org
  name: string;
  nameBn: string;
  type: AccountType;
  category: AccountCategory;
  parentCode: string | null;
  isActive: boolean;
}

export const glAccountSchema = z.object({
  code: z.string().trim().regex(/^\d{4}$/, '4-digit code'),
  name: z.string().trim().min(2).max(120),
  nameBn: z.string().trim().min(2).max(120),
  type: z.enum(ACCOUNT_TYPES),
  category: z.enum(ACCOUNT_CATEGORIES),
  parentCode: z
    .string()
    .trim()
    .regex(/^\d{4}$/)
    .nullish(),
  isActive: z.boolean().optional(),
});
export type GlAccountInput = z.infer<typeof glAccountSchema>;

/**
 * Default NGO-MFI chart of accounts. Codes mirror those already written by
 * the savings / disbursement / collection / delinquency modules so seeded
 * automatic postings post cleanly from day one. Editable per organization.
 */
export const DEFAULT_CHART_OF_ACCOUNTS: Array<Omit<GlAccount, 'id' | 'isActive'>> = [
  // ── Assets (1000–1999) ──
  { code: '1000', name: 'Cash & Bank (Control)', nameBn: 'নগদ ও ব্যাংক (নিয়ন্ত্রণ)', type: 'asset', category: 'control', parentCode: null },
  { code: '1010', name: 'Cash in Vault', nameBn: 'নগদ তহবিল', type: 'asset', category: 'cash', parentCode: '1000' },
  { code: '1015', name: 'Petty Cash', nameBn: 'খুচরা নগদ', type: 'asset', category: 'cash', parentCode: '1000' },
  { code: '1020', name: 'Bank Account', nameBn: 'ব্যাংক হিসাব', type: 'asset', category: 'bank', parentCode: '1000' },
  { code: '1030', name: 'MFS Clearing', nameBn: 'মোবাইল ব্যাংকিং ক্লিয়ারিং', type: 'asset', category: 'bank', parentCode: '1000' },
  { code: '1200', name: 'Loan Portfolio', nameBn: 'ঋণ পোর্টফোলিও', type: 'asset', category: 'control', parentCode: null },
  { code: '1300', name: 'Loan Loss Provision Reserve', nameBn: 'ঋণ ক্ষতি সঞ্চিতি সংরক্ষণ', type: 'asset', category: 'control', parentCode: null },
  { code: '1400', name: 'Stationery & Stock', nameBn: 'স্টেশনারি ও মজুদ', type: 'asset', category: 'control', parentCode: null },
  // ── Liabilities (2000–2999) ──
  { code: '2100', name: 'Member Savings Deposits', nameBn: 'সদস্য সঞ্চয় আমানত', type: 'liability', category: 'control', parentCode: null },
  { code: '2110', name: 'Term Deposits (DPS/FDR)', nameBn: 'মেয়াদি আমানত', type: 'liability', category: 'control', parentCode: '2100' },
  { code: '2200', name: 'Member Advance Credit', nameBn: 'সদস্য অগ্রিম জমা', type: 'liability', category: 'control', parentCode: null },
  { code: '2300', name: 'Loan Loss Provision (P&L offset)', nameBn: 'ঋণ ক্ষতি সঞ্চিতি (লাভ-ক্ষতি)', type: 'liability', category: 'control', parentCode: null },
  { code: '2400', name: 'Salary Payable', nameBn: 'বেতন বাক্যবাহী', type: 'liability', category: 'control', parentCode: null },
  { code: '2500', name: 'Insurance Claim Payable', nameBn: 'বীমা দাবি বাক্যবাহী', type: 'liability', category: 'control', parentCode: null },
  // ── Funds / equity (3000–3999) ──
  { code: '3100', name: 'Members’ Share Capital', nameBn: 'সদস্য শেয়ার মূলধন', type: 'fund', category: 'control', parentCode: null },
  { code: '3200', name: 'General Fund', nameBn: 'সাধারণ তহবিল', type: 'fund', category: 'control', parentCode: null },
  { code: '3300', name: 'Dividend Payable', nameBn: 'লভ্যাংশ বাক্যবাহী', type: 'fund', category: 'control', parentCode: null },
  // ── Income (4000–4999) ──
  { code: '4100', name: 'Interest Income', nameBn: 'সুদ আয়', type: 'income', category: 'income', parentCode: null },
  { code: '4200', name: 'Loan Processing Fee Income', nameBn: 'ঋণ প্রক্রিয়াকরণ ফি আয়', type: 'income', category: 'income', parentCode: null },
  { code: '4210', name: 'Service Charge Income', nameBn: 'সার্ভিস চার্জ আয়', type: 'income', category: 'income', parentCode: null },
  { code: '4220', name: 'Insurance Premium Income', nameBn: 'বীমা প্রিমিয়াম আয়', type: 'income', category: 'income', parentCode: null },
  { code: '4300', name: 'Savings Interest Expense (contra)', nameBn: 'সঞ্চয় সুদ ব্যয় (বিপরীত)', type: 'income', category: 'income', parentCode: null },
  { code: '4400', name: 'Write-off Recovery Income', nameBn: 'অপুনরুদ্ধারযোগ্য ঋণ পুনরুদ্ধার আয়', type: 'income', category: 'income', parentCode: null },
  { code: '4500', name: 'Other Income', nameBn: 'অন্যান্য আয়', type: 'income', category: 'income', parentCode: null },
  // ── Expenses (6000–6999) ──
  { code: '6100', name: 'Salaries & Allowances', nameBn: 'বেতন ও ভাতা', type: 'expense', category: 'expense', parentCode: null },
  { code: '6110', name: 'Office Rent', nameBn: 'অফিস ভাড়া', type: 'expense', category: 'expense', parentCode: null },
  { code: '6120', name: 'Utilities & Communication', nameBn: 'ইউটিলিটি ও যোগাযোগ', type: 'expense', category: 'expense', parentCode: null },
  { code: '6130', name: 'Travel & Conveyance', nameBn: 'ভ্রমণ ও যাতায়াত', type: 'expense', category: 'expense', parentCode: null },
  { code: '6200', name: 'Loan Write-off Expense', nameBn: 'ঋণ লেখা ব্যয়', type: 'expense', category: 'expense', parentCode: null },
  { code: '6210', name: 'Write-off Recovery Income (contra)', nameBn: 'পুনরুদ্ধার আয় (বিপরীত)', type: 'expense', category: 'expense', parentCode: null },
  { code: '6300', name: 'Audit & Legal', nameBn: 'নিরীক্ষা ও আইনগত', type: 'expense', category: 'expense', parentCode: null },
  { code: '7100', name: 'Loan Loss Provision Expense', nameBn: 'ঋণ ক্ষতি সঞ্চিতি ব্যয়', type: 'expense', category: 'expense', parentCode: null },
];

// ── 2) Vouchers ──────────────────────────────────────────────────────────────
export const VOUCHER_TYPES = ['cash_receipt', 'cash_payment', 'bank_payment', 'journal', 'contra'] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

export const VOUCHER_TYPE_LABELS_BN: Record<VoucherType, string> = {
  cash_receipt: 'নগদ আদায় বাউচার',
  cash_payment: 'নগদ পরিশোধ বাউচার',
  bank_payment: 'ব্যাংক বাউচার',
  journal: 'জাবেদা',
  contra: 'কন্ট্রা',
};

export const VOUCHER_STATUSES = ['draft', 'checked', 'approved'] as const;
export type VoucherStatus = (typeof VOUCHER_STATUSES)[number];

/** Prefix per type used in `VCH-<branchCode>-<YY>-<seq>` numbering. */
export const VOUCHER_PREFIX: Record<VoucherType, string> = {
  cash_receipt: 'CR',
  cash_payment: 'CP',
  bank_payment: 'BP',
  journal: 'JV',
  contra: 'CV',
};

export const voucherLineSchema = z
  .object({
    accountCode: z.string().trim().regex(/^\d{4}$/),
    /** Optional analytic dimensions. */
    fundId: uuidSchema.nullish(),
    projectName: z.string().trim().max(120).nullish(),
    partyName: z.string().trim().max(160).nullish(),
    note: z.string().trim().max(300).nullish(),
    debit: moneySchema,
    credit: moneySchema,
  })
  .refine((l) => Number(l.debit) === 0 || Number(l.credit) === 0, 'A line is either debit or credit, not both');

export const voucherCreateSchema = z
  .object({
    branchId: uuidSchema,
    voucherType: z.enum(VOUCHER_TYPES),
    voucherDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    fundId: uuidSchema.nullish(),
    projectName: z.string().trim().max(120).nullish(),
    payeePayer: z.string().trim().max(160).optional(),
    memo: z.string().trim().min(3).max(500),
    lines: z.array(voucherLineSchema).min(2),
    /** Attachment metadata (uploaded separately to Supabase Storage). */
    attachments: z
      .array(z.object({ name: z.string().max(200), path: z.string().max(400), sizeBytes: z.number().int().min(0).max(20_971_520) }))
      .max(10)
      .optional(),
  })
  .refine((v) => Math.abs(Number(v.lines.reduce((s, l) => s + Number(l.debit), 0)) - Number(v.lines.reduce((s, l) => s + Number(l.credit), 0))) < 0.005, 'Voucher is not balanced (debit ≠ credit)');
export type VoucherCreateInput = z.infer<typeof voucherCreateSchema>;

export const voucherCheckSchema = z.object({ note: z.string().trim().max(500).optional() });
export const voucherApproveSchema = voucherCheckSchema;

export interface VoucherLine {
  accountCode: string;
  accountName: string;
  fundId: string | null;
  projectName: string | null;
  partyName: string | null;
  note: string | null;
  debit: string;
  credit: string;
}

export interface Voucher {
  id: string;
  voucherNumber: string; // VCH-<prefix>-<branchCode>-<YY>-<seq>
  branchId: string;
  branchName: string;
  voucherType: VoucherType;
  voucherDate: string;
  fundId: string | null;
  fundName: string | null;
  projectName: string | null;
  payeePayer: string | null;
  memo: string;
  status: VoucherStatus;
  lines: VoucherLine[];
  attachments: Array<{ name: string; path: string; sizeBytes: number }>;
  /** Auto-posted from another module (event map) — read-only. */
  autoSource: string | null;
  preparedBy: string | null;
  checkedBy: string | null;
  checkedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

// ── 3) Event-to-journal mapping (automatic postings) ─────────────────────────
/** Module events that can be auto-posted to the GL. */
export const JOURNAL_EVENTS = [
  'savings_deposit',
  'savings_withdrawal',
  'loan_disbursement',
  'loan_collection',
  'fee_collected',
  'insurance_premium',
  'salary_payment',
  'loan_writeoff',
  'provision_posted',
] as const;
export type JournalEvent = (typeof JOURNAL_EVENTS)[number];

export const JOURNAL_EVENT_LABELS_BN: Record<JournalEvent, string> = {
  savings_deposit: 'সঞ্চয় জমা',
  savings_withdrawal: 'সঞ্চয় উত্তোলন',
  loan_disbursement: 'ঋণ বিতরণ',
  loan_collection: 'কিস্তি আদায়',
  fee_collected: 'ফি আদায়',
  insurance_premium: 'বীমা প্রিমিয়াম',
  salary_payment: 'বেতন পরিশোধ',
  loan_writeoff: 'ঋণ লেখা',
  provision_posted: 'সঞ্চিতি পোস্টিং',
};

export interface EventJournalMapping {
  id: string;
  event: JournalEvent;
  /** Settlement (credit when money comes in / debit when it goes out). */
  settlementCode: string;
  /** Counter account debited/credited for the economic substance. */
  counterCode: string;
  isActive: boolean;
}

export const eventMappingSchema = z.object({
  event: z.enum(JOURNAL_EVENTS),
  settlementCode: z.string().trim().regex(/^\d{4}$/),
  counterCode: z.string().trim().regex(/^\d{4}$/),
  isActive: z.boolean().optional(),
});
export type EventMappingInput = z.infer<typeof eventMappingSchema>;

export const DEFAULT_EVENT_MAPPINGS: Array<Omit<EventJournalMapping, 'id'>> = [
  { event: 'savings_deposit', settlementCode: '1010', counterCode: '2100', isActive: true },
  { event: 'savings_withdrawal', settlementCode: '1010', counterCode: '2100', isActive: true },
  { event: 'loan_disbursement', settlementCode: '1010', counterCode: '1200', isActive: true },
  { event: 'loan_collection', settlementCode: '1010', counterCode: '1200', isActive: true },
  { event: 'fee_collected', settlementCode: '1010', counterCode: '4200', isActive: true },
  { event: 'insurance_premium', settlementCode: '1010', counterCode: '4220', isActive: true },
  { event: 'salary_payment', settlementCode: '1010', counterCode: '6100', isActive: true },
  { event: 'loan_writeoff', settlementCode: '6200', counterCode: '1200', isActive: true },
  { event: 'provision_posted', settlementCode: '7100', counterCode: '1300', isActive: true },
];

/**
 * Build balanced lines for one auto-posted event. Money *in* (deposit,
 * collection, fee, premium) debits settlement / credits counter; money *out*
 * (withdrawal, disbursement, salary, write-off, provision) flips it.
 */
export function buildEventJournalLines(
  mapping: Pick<EventJournalMapping, 'settlementCode' | 'counterCode'>,
  event: JournalEvent,
  amount: string,
  nameFor: (code: string) => string,
): Array<{ accountCode: string; accountName: string; debit: string; credit: string }> {
  const moneyIn = ['savings_deposit', 'loan_collection', 'fee_collected', 'insurance_premium'].includes(event);
  const settlement = nameFor(mapping.settlementCode);
  const counter = nameFor(mapping.counterCode);
  const amt = Number(amount);
  return moneyIn
    ? [
        { accountCode: mapping.settlementCode, accountName: settlement, debit: amt.toFixed(2), credit: '0.00' },
        { accountCode: mapping.counterCode, accountName: counter, debit: '0.00', credit: amt.toFixed(2) },
      ]
    : [
        { accountCode: mapping.counterCode, accountName: counter, debit: amt.toFixed(2), credit: '0.00' },
        { accountCode: mapping.settlementCode, accountName: settlement, debit: '0.00', credit: amt.toFixed(2) },
      ];
}

// ── 4) Daily branch cash book ────────────────────────────────────────────────
export const CASH_BOOK_STATUS = ['open', 'closed'] as const;
export type CashBookStatus = (typeof CASH_BOOK_STATUS)[number];

export interface CashBookLine {
  voucherNumber: string;
  voucherType: VoucherType | 'auto';
  memo: string;
  cashIn: string;
  cashOut: string;
}

export const cashCountSchema = z.object({
  countedCash: moneySchema,
  note: z.string().trim().max(500).optional(),
});
export type CashCountInput = z.infer<typeof cashCountSchema>;

export const cashBookCloseSchema = z.object({
  countedCash: moneySchema,
  note: z.string().trim().max(500).optional(),
  /** BM + Accountant signatures are required to lock the day. */
  managerSignName: z.string().trim().min(3).max(120),
  accountantSignName: z.string().trim().min(3).max(120),
});
export type CashBookCloseInput = z.infer<typeof cashBookCloseSchema>;

export interface CashBookDay {
  id: string;
  branchId: string;
  branchName: string;
  bookDate: string;
  status: CashBookStatus;
  openingBalance: string;
  totalCashIn: string;
  totalCashOut: string;
  /** Expected closing = opening + in − out. */
  expectedClosing: string;
  countedCash: string | null;
  /** counted − expected (negative = shortage). */
  difference: string | null;
  differenceKind: 'shortage' | 'excess' | 'exact' | null;
  closingBalance: string | null;
  locked: boolean;
  managerSignName: string | null;
  accountantSignName: string | null;
  closedAt: string | null;
  note: string | null;
  lines: CashBookLine[];
}

/** Difference kind from a physical count vs the expected closing. */
export function cashDifference(
  counted: string | number,
  expected: string | number,
): { difference: string; kind: 'shortage' | 'excess' | 'exact' } {
  const d = Number(counted) - Number(expected);
  const diff = d.toFixed(2);
  if (Math.abs(d) < 0.005) return { difference: '0.00', kind: 'exact' };
  return { difference: diff, kind: d > 0 ? 'excess' : 'shortage' };
}

// ── 5) Bank reconciliation ───────────────────────────────────────────────────
export const bankRecStatusSchema = z.enum(['pending', 'cleared']);
export interface BankStatementLine {
  id: string;
  valueDate: string;
  narration: string;
  amount: string; // + credit (money in), − debit (money out)
  cleared: boolean;
  matchedVoucherNumber: string | null;
}

export interface BankReconciliation {
  id: string;
  branchId: string;
  bankCode: string; // GL account code, e.g. 1020
  periodStart: string;
  periodEnd: string;
  bookBalance: string;
  statementBalance: string;
  status: 'pending' | 'cleared';
  statementLines: BankStatementLine[];
  clearedCount: number;
  /** Un-cleared statement lines total (outstanding lodgements/unpresented cheques). */
  unclearedTotal: string;
  preparedBy: string | null;
  createdAt: string;
}

export const bankStatementLineSchema = z.object({
  valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  narration: z.string().trim().min(2).max(200),
  amount: z
    .string()
    .regex(/^-?\d+(\.\d{1,2})?$/, 'signed decimal (+ in / − out)'),
  matchedVoucherNumber: z.string().trim().max(40).nullish(),
});

export const bankRecCreateSchema = z.object({
  branchId: uuidSchema,
  bankCode: z.string().trim().regex(/^\d{4}$/),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  statementBalance: moneySchema,
  statementLines: z.array(bankStatementLineSchema).min(1).max(500),
});
export type BankRecCreateInput = z.infer<typeof bankRecCreateSchema>;

// ── Petty cash register ──────────────────────────────────────────────────────
export const pettyCashTopUpSchema = z.object({
  branchId: uuidSchema,
  amount: moneySchema,
  note: z.string().trim().max(300).optional(),
});
export type PettyCashTopUpInput = z.infer<typeof pettyCashTopUpSchema>;

export const pettyCashSpendSchema = z.object({
  branchId: uuidSchema,
  amount: moneySchema,
  expenseCode: z.string().trim().regex(/^\d{4}$/),
  spentOn: z.string().trim().min(3).max(200),
});
export type PettyCashSpendInput = z.infer<typeof pettyCashSpendSchema>;

export interface PettyCashBalance {
  branchId: string;
  branchName: string;
  balance: string;
  /** Spending above this limit requires replenishment first. */
  limit: string;
  withinLimit: boolean;
  movements: Array<{
    id: string;
    at: string;
    kind: 'top_up' | 'spend';
    amount: string;
    expenseCode: string | null;
    spentOn: string | null;
    note: string | null;
    balanceAfter: string;
  }>;
}

/** Petty-cash spending guard. */
export function pettyCashAllowed(balance: string | number, limit: string | number, amount: string | number): boolean {
  return Number(amount) <= Number(limit) && Number(balance) - Number(amount) >= 0;
}

// ── Trial balance (read model) ───────────────────────────────────────────────
export interface TrialBalanceRow {
  code: string;
  name: string;
  nameBn: string;
  type: AccountType;
  totalDebit: string;
  totalCredit: string;
  /** Debit-natured: debit−credit; credit-natured: credit−debit. */
  balance: string;
}

export function computeTrialBalance(
  accounts: Array<Pick<GlAccount, 'code' | 'name' | 'nameBn' | 'type'>>,
  lines: Array<{ accountCode: string; debit: string; credit: string }>,
): { rows: TrialBalanceRow[]; totalDebit: string; totalCredit: string; balanced: boolean } {
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const t = totals.get(l.accountCode) ?? { debit: 0, credit: 0 };
    t.debit += Number(l.debit);
    t.credit += Number(l.credit);
    totals.set(l.accountCode, t);
  }
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: TrialBalanceRow[] = [];
  for (const a of accounts) {
    const t = totals.get(a.code);
    const debit = t?.debit ?? 0;
    const credit = t?.credit ?? 0;
    if (debit === 0 && credit === 0) continue;
    // Net movement expressed as a POSITIVE number on the account's natural
    // side: debit-natured accounts carry debit−credit; credit-natured carry
    // the negated net so a normal credit balance lands on the CREDIT column.
    const net = isDebitNature(a.type) ? debit - credit : -(credit - debit);
    if (net > 0) totalDebit += net;
    else totalCredit += -net;
    rows.push({
      code: a.code,
      name: a.name,
      nameBn: a.nameBn,
      type: a.type,
      totalDebit: debit.toFixed(2),
      totalCredit: credit.toFixed(2),
      balance: Math.abs(net).toFixed(2),
    });
  }
  return {
    rows,
    totalDebit: totalDebit.toFixed(2),
    totalCredit: totalCredit.toFixed(2),
    balanced: Math.abs(totalDebit - totalCredit) < 0.005,
  };
}
