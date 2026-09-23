/**
 * ── Accounting operations (requirements 6–10) ────────────────────────────────
 * Fund requisitions + inter-branch transfers with matching entries, posting
 * rules (savings cannot fund fixed assets/expenses), financial reports
 * (ledger, receipts & payments, income & expenditure, balance sheet, fund
 * statement, budget vs actual), monthly/annual period close, and bilingual
 * voucher print labels.
 *
 * Money is transmitted as string; numeric(14,2) in DB. All report builders
 * are pure so the API (authoritative), the DB functions (defense in depth)
 * and the web UI share one implementation.
 */

import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';
import { isDebitNature, type AccountType, type Voucher } from './accounting.js';

// ── GL constants used across reports and rules ───────────────────────────────
/** Member savings deposit liability — money on this account is restricted. */
export const SAVINGS_CODES = ['2100', '2110'] as const;
/** Fixed-asset codes; extend per org as needed. */
export const FIXED_ASSET_CODES = ['1500', '1510', '1520'] as const;

// ── 6) Fund requisition & inter-branch transfer ──────────────────────────────
export const REQUISITION_STATUSES = ['requested', 'approved', 'rejected', 'disbursed', 'received'] as const;
export type RequisitionStatus = (typeof REQUISITION_STATUSES)[number];

export const REQUISITION_KINDS = ['branch_to_ho', 'ho_to_branch', 'inter_branch'] as const;
export type RequisitionKind = (typeof REQUISITION_KINDS)[number];

export const REQUISITION_LABELS_BN: Record<RequisitionKind, string> = {
  branch_to_ho: 'শাখা → প্রধান কার্যালয়',
  ho_to_branch: 'প্রধান কার্যালয় → শাখা',
  inter_branch: 'শাখা → শাখা',
};

export const REQUISITION_STATUS_LABELS_BN: Record<RequisitionStatus, string> = {
  requested: 'অনুরোধকৃত',
  approved: 'অনুমোদিত',
  rejected: 'প্রত্যাখ্যাত',
  disbursed: 'প্রেরিত',
  received: 'গৃহীত',
};

/** Branches / head office. `isHo` marks the head-office node. */
export interface OrgNode {
  id: string;
  code: string;
  name: string;
  isHo: boolean;
}

export interface FundRequisition {
  id: string;
  kind: RequisitionKind;
  /** Requesting node (branch or HO). */
  fromNodeId: string;
  fromNodeName: string;
  /** Supplying node (HO or branch). */
  toNodeId: string;
  toNodeName: string;
  amount: string;
  purpose: string;
  status: RequisitionStatus;
  /** Source account at the supplying node (1010 cash / 1020 bank). */
  settlementCode: string;
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  /** Set on disbursement; mirrors the outgoing voucher number. */
  outVoucherNumber: string | null;
  /** Set on receipt confirmation; mirrors the incoming voucher number. */
  inVoucherNumber: string | null;
  createdAt: string;
}

export const requisitionCreateSchema = z
  .object({
    kind: z.enum(REQUISITION_KINDS),
    fromNodeId: uuidSchema,
    toNodeId: uuidSchema,
    amount: moneySchema,
    purpose: z.string().trim().min(3).max(300),
    settlementCode: z.string().trim().regex(/^\d{4}$/),
  })
  .refine((r) => r.fromNodeId !== r.toNodeId, 'A node cannot requisition itself');
export type RequisitionCreateInput = z.infer<typeof requisitionCreateSchema>;

export const requisitionDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(300).optional(),
});
export type RequisitionDecisionInput = z.infer<typeof requisitionDecisionSchema>;

/**
 * Matching journal lines for a fund movement. The supplying node credits its
 * cash/bank; the receiving node debits its own cash/bank. HO books the
 * `dueFromBranches` / `dueToBranches` pair so consolidated statements cancel;
 * branch-to-branch movements additionally post both sides at HO (contra).
 */
export function buildTransferLines(params: {
  settlementCode: string;
  /** GL codes: due-from / due-to control accounts at HO. */
  dueFromCode: string;
  dueToCode: string;
  kind: RequisitionKind;
  amount: string;
  nameFor: (code: string) => string;
}): Array<{ accountCode: string; accountName: string; debit: string; credit: string }> {
  const { settlementCode, dueFromCode, dueToCode, kind, amount, nameFor } = params;
  const amt = Number(amount).toFixed(2);
  const settle = nameFor(settlementCode);
  const dueFrom = nameFor(dueFromCode);
  const dueTo = nameFor(dueToCode);
  if (kind === 'branch_to_ho') {
    // Branch: Cr cash/bank; HO: Dr cash/bank, Cr due-to.
    return [
      { accountCode: settlementCode, accountName: settle, debit: '0.00', credit: amt },
      { accountCode: dueFromCode, accountName: dueFrom, debit: amt, credit: '0.00' },
      { accountCode: dueToCode, accountName: dueTo, debit: '0.00', credit: amt },
      { accountCode: settlementCode, accountName: settle, debit: amt, credit: '0.00' },
    ];
  }
  // ho_to_branch: HO Cr cash/bank, Dr due-from; branch Dr cash/bank, Cr due-to.
  // inter_branch: same shape as ho_to_branch from the supplier's perspective.
  return [
    { accountCode: settlementCode, accountName: settle, debit: '0.00', credit: amt },
    { accountCode: dueFromCode, accountName: dueFrom, debit: amt, credit: '0.00' },
    { accountCode: settlementCode, accountName: settle, debit: amt, credit: '0.00' },
    { accountCode: dueToCode, accountName: dueTo, debit: '0.00', credit: amt },
  ];
}

// ── 7) Posting rule: savings are restricted ──────────────────────────────────
/** Destination account types that member savings must never fund. */
export type RestrictedDestination = 'fixed_asset' | 'expense';

export interface VoucherRuleResult {
  allowed: boolean;
  /** Machine-readable rule that fired, e.g. `savings_to_fixed_asset`. */
  violation: string | null;
  messageBn: string | null;
}

/**
 * A voucher that debits a fixed-asset or expense account while crediting a
 * savings liability is blocked: member deposits fund loans and cash, not
 * assets or running costs. Pure so the API and a DB trigger enforce identical
 * rules.
 */
export function checkVoucherPostingRules(input: {
  lines: Array<{ accountCode: string; debit: string; credit: string }>;
  accountTypes: Record<string, AccountType>;
}): VoucherRuleResult {
  const savingsCredits = input.lines
    .filter((l) => (SAVINGS_CODES as readonly string[]).includes(l.accountCode) && Number(l.credit) > 0)
    .reduce((s, l) => s + Number(l.credit), 0);
  if (savingsCredits === 0) return { allowed: true, violation: null, messageBn: null };

  const savingsSet = new Set<string>(SAVINGS_CODES);
  for (const l of input.lines) {
    if (Number(l.debit) === 0) continue;
    const type = input.accountTypes[l.accountCode];
    if (type === 'expense') {
      return {
        allowed: false,
        violation: 'savings_to_expense',
        messageBn: 'সদস্য সঞ্চয় ব্যয়ে ব্যবহার করা যাবে না',
      };
    }
    if ((FIXED_ASSET_CODES as readonly string[]).includes(l.accountCode) || type === 'asset') {
      // Only *fixed-asset* asset debits are blocked; cash/bank/loan debits are
      // the normal settlement of a deposit.
      if ((FIXED_ASSET_CODES as readonly string[]).includes(l.accountCode)) {
        return {
          allowed: false,
          violation: 'savings_to_fixed_asset',
          messageBn: 'সদস্য সঞ্চয় স্থায়ী সম্পদে ব্যবহার করা যাবে না',
        };
      }
    }
  }
  // Net: if savings credits exceed non-savings debits, the rest funded a
  // restricted destination somewhere — block as a mixed misuse too.
  const nonSavingsDebits = input.lines
    .filter((l) => Number(l.debit) > 0 && !savingsSet.has(l.accountCode))
    .reduce((s, l) => s + Number(l.debit), 0);
  if (savingsCredits > nonSavingsDebits + 0.005) {
    return {
      allowed: false,
      violation: 'savings_to_restricted',
      messageBn: 'সঞ্চয়ের তুলনায় অনুমোদিত খাত কম — ভাউচারটি ব্লক করা হয়েছে',
    };
  }
  return { allowed: true, violation: null, messageBn: null };
}

// ── 8) Financial reports ─────────────────────────────────────────────────────
export interface LedgerRow {
  date: string;
  voucherNumber: string;
  memo: string;
  debit: string;
  credit: string;
  /** Running balance for the account. */
  balance: string;
}

export interface ReceiptsPaymentsReport {
  periodStart: string;
  periodEnd: string;
  inflows: Array<{ label: string; labelBn: string; amount: string }>;
  outflows: Array<{ label: string; labelBn: string; amount: string }>;
  totalIn: string;
  totalOut: string;
  openingCash: string;
  closingCash: string;
}

export interface IncomeExpenditureReport {
  periodStart: string;
  periodEnd: string;
  income: Array<{ code: string; name: string; nameBn: string; amount: string }>;
  expenditure: Array<{ code: string; name: string; nameBn: string; amount: string }>;
  totalIncome: string;
  totalExpenditure: string;
  surplus: string;
}

export interface BalanceSheetReport {
  asOf: string;
  assets: Array<{ code: string; name: string; nameBn: string; amount: string }>;
  liabilities: Array<{ code: string; name: string; nameBn: string; amount: string }>;
  funds: Array<{ code: string; name: string; nameBn: string; amount: string }>;
  totalAssets: string;
  totalLiabilities: string;
  totalFunds: string;
  /** Retained surplus folded into funds for the balancing check. */
  retainedSurplus: string;
  balanced: boolean;
}

export interface FundStatementReport {
  fundId: string | null;
  fundName: string;
  periodStart: string;
  periodEnd: string;
  lines: Array<{ date: string; voucherNumber: string; memo: string; debit: string; credit: string; balance: string }>;
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
}

export interface BudgetLine {
  accountCode: string;
  accountName: string;
  accountNameBn: string;
  budgeted: string;
  actual: string;
  variance: string;
}
export interface BudgetVsActualReport {
  periodStart: string;
  periodEnd: string;
  lines: BudgetLine[];
  totalBudgeted: string;
  totalActual: string;
}

export const budgetSetSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lines: z
    .array(
      z.object({
        accountCode: z.string().trim().regex(/^\d{4}$/),
        amount: moneySchema,
      }),
    )
    .min(1)
    .max(100),
});
export type BudgetSetInput = z.infer<typeof budgetSetSchema>;

/** Running-balance ledger for one account across approved vouchers. */
export function buildLedger(
  lines: Array<{ date: string; voucherNumber: string; memo: string; debit: string; credit: string }>,
  debitNature: boolean,
): { rows: LedgerRow[]; closing: string } {
  let bal = 0;
  const rows = lines.map((l) => {
    bal += debitNature ? Number(l.debit) - Number(l.credit) : Number(l.credit) - Number(l.debit);
    return { ...l, balance: bal.toFixed(2) };
  });
  return { rows, closing: bal.toFixed(2) };
}

/** Receipts & payments (cash-basis) from cash/bank category movements. */
export function buildReceiptsPayments(input: {
  periodStart: string;
  periodEnd: string;
  vouchers: Voucher[];
  accountCategory: (code: string) => 'cash' | 'bank' | string | undefined;
}): ReceiptsPaymentsReport {
  const inflow = new Map<string, number>();
  const outflow = new Map<string, number>();
  let openingCash = 0;
  for (const v of input.vouchers) {
    if (v.status !== 'approved') continue;
    for (const l of v.lines) {
      const cat = input.accountCategory(l.accountCode);
      if (cat !== 'cash' && cat !== 'bank') continue;
      const before = v.voucherDate < input.periodStart;
      if (before) {
        openingCash += Number(l.debit) - Number(l.credit);
        continue;
      }
      if (v.voucherDate > input.periodEnd) continue;
      const d = Number(l.debit);
      const c = Number(l.credit);
      if (d > 0) inflow.set(l.accountCode, (inflow.get(l.accountCode) ?? 0) + d);
      if (c > 0) outflow.set(l.accountCode, (outflow.get(l.accountCode) ?? 0) + c);
    }
  }
  const mk = (m: Map<string, number>) =>
    [...m.entries()].map(([code, amt]) => ({ label: code, labelBn: code, amount: amt.toFixed(2) }));
  const inflows = mk(inflow);
  const outflows = mk(outflow);
  const totalIn = inflows.reduce((s, r) => s + Number(r.amount), 0);
  const totalOut = outflows.reduce((s, r) => s + Number(r.amount), 0);
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    inflows,
    outflows,
    totalIn: totalIn.toFixed(2),
    totalOut: totalOut.toFixed(2),
    openingCash: openingCash.toFixed(2),
    closingCash: (openingCash + totalIn - totalOut).toFixed(2),
  };
}

/** Income & expenditure (accrual view of income/expense accounts). */
export function buildIncomeExpenditure(input: {
  periodStart: string;
  periodEnd: string;
  vouchers: Voucher[];
  accountType: (code: string) => AccountType | undefined;
  accountName: (code: string) => { name: string; nameBn: string };
}): IncomeExpenditureReport {
  const income = new Map<string, number>();
  const expenditure = new Map<string, number>();
  for (const v of input.vouchers) {
    if (v.status !== 'approved') continue;
    if (v.voucherDate < input.periodStart || v.voucherDate > input.periodEnd) continue;
    for (const l of v.lines) {
      const type = input.accountType(l.accountCode);
      if (type === 'income') income.set(l.accountCode, (income.get(l.accountCode) ?? 0) + Number(l.credit) - Number(l.debit));
      if (type === 'expense') expenditure.set(l.accountCode, (expenditure.get(l.accountCode) ?? 0) + Number(l.debit) - Number(l.credit));
    }
  }
  const incomeRows = [...income.entries()]
    .filter(([, amt]) => Math.abs(amt) > 0.004)
    .map(([code, amt]) => ({ code, ...input.accountName(code), amount: amt.toFixed(2) }));
  const expenditureRows = [...expenditure.entries()]
    .filter(([, amt]) => Math.abs(amt) > 0.004)
    .map(([code, amt]) => ({ code, ...input.accountName(code), amount: amt.toFixed(2) }));
  const totalIncome = incomeRows.reduce((s, r) => s + Number(r.amount), 0);
  const totalExpenditure = expenditureRows.reduce((s, r) => s + Number(r.amount), 0);
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    income: incomeRows,
    expenditure: expenditureRows,
    totalIncome: totalIncome.toFixed(2),
    totalExpenditure: totalExpenditure.toFixed(2),
    surplus: (totalIncome - totalExpenditure).toFixed(2),
  };
}

/** Balance sheet as of a date: assets vs liabilities + funds (+ retained). */
export function buildBalanceSheet(input: {
  asOf: string;
  vouchers: Voucher[];
  accounts: Array<{ code: string; name: string; nameBn: string; type: AccountType }>;
  accountType: (code: string) => AccountType | undefined;
}): BalanceSheetReport {
  const totals = new Map<string, number>();
  for (const v of input.vouchers) {
    if (v.status !== 'approved' || v.voucherDate > input.asOf) continue;
    for (const l of v.lines) {
      totals.set(l.accountCode, (totals.get(l.accountCode) ?? 0) + Number(l.debit) - Number(l.credit));
    }
  }
  const row = (code: string, acct: { name: string; nameBn: string; type: AccountType }) => {
    const raw = totals.get(code) ?? 0;
    const net = isDebitNature(acct.type) ? raw : -raw;
    return { code, name: acct.name, nameBn: acct.nameBn, amount: net.toFixed(2) };
  };
  const assets = input.accounts.filter((a) => a.type === 'asset' && (totals.get(a.code) ?? 0) !== 0).map((a) => row(a.code, a));
  const liabilities = input.accounts.filter((a) => a.type === 'liability' && (totals.get(a.code) ?? 0) !== 0).map((a) => row(a.code, a));
  const funds = input.accounts.filter((a) => a.type === 'fund' && (totals.get(a.code) ?? 0) !== 0).map((a) => row(a.code, a));
  // Retained surplus: income − expense up to asOf. Income accounts carry a
  // credit balance (raw Dr−Cr negative), so flip its sign into the surplus.
  let surplus = 0;
  for (const [code, raw] of totals) {
    const t = input.accountType(code);
    if (t === 'income') surplus += -raw;
    if (t === 'expense') surplus -= raw;
  }
  const totalAssets = assets.reduce((s, r) => s + Number(r.amount), 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + Number(r.amount), 0);
  const totalFundsRaw = funds.reduce((s, r) => s + Number(r.amount), 0);
  const totalFunds = (totalFundsRaw + surplus).toFixed(2);
  return {
    asOf: input.asOf,
    assets,
    liabilities,
    funds,
    totalAssets: totalAssets.toFixed(2),
    totalLiabilities: totalLiabilities.toFixed(2),
    totalFunds,
    retainedSurplus: surplus.toFixed(2),
    balanced: Math.abs(totalAssets - (totalLiabilities + totalFundsRaw + surplus)) < 0.005,
  };
}

/** Fund/project-wise statement: movements tagged with fundId or projectName. */
export function buildFundStatement(input: {
  fundId: string | null;
  fundName: string;
  periodStart: string;
  periodEnd: string;
  vouchers: Voucher[];
}): FundStatementReport {
  let bal = 0;
  const lines: FundStatementReport['lines'] = [];
  for (const v of input.vouchers) {
    if (v.status !== 'approved') continue;
    if (v.voucherDate < input.periodStart || v.voucherDate > input.periodEnd) continue;
    for (const l of v.lines) {
      const tagged = l.fundId === input.fundId || (!!input.fundName && l.projectName === input.fundName);
      if (!tagged) continue;
      const d = Number(l.debit);
      const c = Number(l.credit);
      bal += d - c;
      lines.push({ date: v.voucherDate, voucherNumber: v.voucherNumber, memo: v.memo, debit: d.toFixed(2), credit: c.toFixed(2), balance: bal.toFixed(2) });
    }
  }
  return {
    fundId: input.fundId,
    fundName: input.fundName,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    lines,
    totalDebit: lines.reduce((s, r) => s + Number(r.debit), 0).toFixed(2),
    totalCredit: lines.reduce((s, r) => s + Number(r.credit), 0).toFixed(2),
    closingBalance: bal.toFixed(2),
  };
}

/** Budget vs actual for expense (or income) accounts over a period. */
export function buildBudgetVsActual(input: {
  periodStart: string;
  periodEnd: string;
  budgets: Array<{ accountCode: string; amount: string }>;
  vouchers: Voucher[];
  accountName: (code: string) => { name: string; nameBn: string };
  accountType: (code: string) => AccountType | undefined;
}): BudgetVsActualReport {
  const actuals = new Map<string, number>();
  for (const v of input.vouchers) {
    if (v.status !== 'approved') continue;
    if (v.voucherDate < input.periodStart || v.voucherDate > input.periodEnd) continue;
    for (const l of v.lines) {
      const t = input.accountType(l.accountCode);
      if (t !== 'expense') continue;
      actuals.set(l.accountCode, (actuals.get(l.accountCode) ?? 0) + Number(l.debit) - Number(l.credit));
    }
  }
  const lines: BudgetLine[] = input.budgets.map((b) => {
    const actual = actuals.get(b.accountCode) ?? 0;
    const nm = input.accountName(b.accountCode);
    return {
      accountCode: b.accountCode,
      accountName: nm.name,
      accountNameBn: nm.nameBn,
      budgeted: Number(b.amount).toFixed(2),
      actual: actual.toFixed(2),
      variance: (Number(b.amount) - actual).toFixed(2),
    };
  });
  return {
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    lines,
    totalBudgeted: lines.reduce((s, r) => s + Number(r.budgeted), 0).toFixed(2),
    totalActual: lines.reduce((s, r) => s + Number(r.actual), 0).toFixed(2),
  };
}

// ── 9) Period close ──────────────────────────────────────────────────────────
export const PERIOD_KINDS = ['monthly', 'annual'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export interface PeriodClose {
  id: string;
  orgId: string;
  kind: PeriodKind;
  /** Inclusive period: 2026-09-01..2026-09-30 (monthly) or calendar year. */
  periodStart: string;
  periodEnd: string;
  closedBy: string;
  closedAt: string;
  /** Snapshot totals at close time for the audit trail. */
  snapshot: { totalDebit: string; totalCredit: string; balanced: boolean; voucherCount: number };
  note: string | null;
}

export const periodCloseSchema = z.object({
  kind: z.enum(PERIOD_KINDS),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(300).optional(),
});

export const periodReopenSchema = z.object({
  note: z.string().trim().min(3).max(300),
});

/**
 * True when any approved voucher falls inside the closed period — used by
 * close validation (nothing pending may be left) and reopen authorization.
 */
export function periodHasVouchers(vouchers: Voucher[], periodStart: string, periodEnd: string): boolean {
  return vouchers.some((v) => v.status === 'approved' && v.voucherDate >= periodStart && v.voucherDate <= periodEnd);
}

/** Director Finance is the only role allowed to reopen a closed period. */
export function canReopenPeriod(role: string): boolean {
  return role === 'super_admin' || role === 'org_admin';
}

// ── 10) Bilingual voucher print ──────────────────────────────────────────────
export const VOUCHER_TYPE_LABELS: Record<Voucher['voucherType'], { bn: string; en: string }> = {
  cash_receipt: { bn: 'নগদ প্রাপ্তি ভাউচার', en: 'Cash Receipt Voucher' },
  cash_payment: { bn: 'নগদ পরিশোধ ভাউচার', en: 'Cash Payment Voucher' },
  bank_payment: { bn: 'ব্যাংক পেমেন্ট ভাউচার', en: 'Bank Payment Voucher' },
  journal: { bn: 'জাবেদা ভাউচার', en: 'Journal Voucher' },
  contra: { bn: 'কন্ট্রা ভাউচার', en: 'Contra Voucher' },
};

export const VOUCHER_PRINT_LABELS: Record<'bn' | 'en', Record<string, string>> = {
  bn: {
    voucherNo: 'ভাউচার নং',
    date: 'তারিখ',
    branch: 'শাখা',
    payeePayer: 'প্রাপক/প্রদানকারী',
    memo: 'বিবরণ',
    account: 'হিসাব',
    fund: 'তহবিল/প্রকল্প',
    debit: 'ডেবিট',
    credit: 'ক্রেডিট',
    total: 'মোট',
    amountInWords: 'কথায়',
    preparedBy: 'প্রস্তুতকারক',
    checkedBy: 'যাচাইকারী',
    approvedBy: 'অনুমোদনকারী',
    signature: 'স্বাক্ষর',
    status: 'অবস্থা',
    autoSource: 'স্বয়ংক্রিয় পোস্টিং',
  },
  en: {
    voucherNo: 'Voucher No',
    date: 'Date',
    branch: 'Branch',
    payeePayer: 'Payee/Payer',
    memo: 'Memo',
    account: 'Account',
    fund: 'Fund/Project',
    debit: 'Debit',
    credit: 'Credit',
    total: 'Total',
    amountInWords: 'Amount in words',
    preparedBy: 'Prepared by',
    checkedBy: 'Checked by',
    approvedBy: 'Approved by',
    signature: 'Signature',
    status: 'Status',
    autoSource: 'Auto-posted',
  },
};

/** Bangla amount-in-words for the voucher footer (whole taka). */
const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const BN_UNITS = ['', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়'];  const BN_TEENS = ['দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ'] as const;
  const BN_TENS = ['', '', 'বিশ', 'ত্রিশ', 'চল্লিশ', 'পঞ্চাশ', 'ষাট', 'সত্তর', 'আশি', 'নব্বই'] as const;

  function bnTwoDigits(n: number): string {
    if (n === 0) return '';
    if (n < 10) return BN_UNITS[n] ?? '';
    if (n < 20) return BN_TEENS[n - 10] ?? '';
    const t = Math.floor(n / 10);
    const u = n % 10;
    return u ? `${BN_TENS[t]} ${BN_UNITS[u]}` : BN_TENS[t] ?? '';
  }

/** Bengali idiom: কোটি → লক্ষ → হাজার → শত. */
export function amountInWordsBn(amount: string | number): string {
  let n = Math.floor(Number(amount));
  if (n === 0) return 'শূন্য টাকা';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n -= crore * 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n -= lakh * 100_000;
  const thousand = Math.floor(n / 1000);
  n -= thousand * 1000;
  const hundred = Math.floor(n / 100);
  n -= hundred * 100;
  if (crore) parts.push(`${bnTwoDigits(crore)} কোটি`);
  if (lakh) parts.push(`${bnTwoDigits(lakh)} লক্ষ`);
  if (thousand) parts.push(`${bnTwoDigits(thousand)} হাজার`);
  if (hundred) parts.push(`${BN_UNITS[hundred]} শত`);
  if (n) parts.push(bnTwoDigits(n));
  return `${parts.join(' ')} টাকা`;
}

/** English amount-in-words (integer taka) for the bilingual footer. */
export function amountInWordsEn(amount: string | number): string {
  let n = Math.floor(Number(amount));
  if (n === 0) return 'Zero Taka';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'] as const;
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'] as const;
  const below1000 = (x: number): string => {
    const parts: string[] = [];
    const h = Math.floor(x / 100);
    x -= h * 100;
    if (h) parts.push(`${ones[h]} Hundred`);
    if (x >= 20) {
      const t = Math.floor(x / 10);
      const u = x % 10;
      parts.push(u ? `${tens[t]}-${ones[u]}` : tens[t] ?? '');
    } else if (x > 0) parts.push(ones[x] ?? '');
    return parts.join(' ');
  };
  const crore = Math.floor(n / 10_000_000);
  n -= crore * 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n -= lakh * 100_000;
  const thousand = Math.floor(n / 1000);
  n -= thousand * 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return `${parts.join(' ')} Taka`;
}

/** Bilingual print footer: "এক হাজার পাঁচ শত টাকা / One Thousand Five Hundred Taka". */
export function amountInWords(amount: string | number): string {
  return `${amountInWordsBn(amount)} / ${amountInWordsEn(amount)}`;
}
