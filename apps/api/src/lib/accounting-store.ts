/**
 * ── Accounting demo store (Module 10) ────────────────────────────────────────
 * Double-entry bookkeeping on the in-memory dataset (preview + tests): chart
 * of accounts, vouchers with draft→checked→approved workflow and per-branch
 * numbering, event-to-journal auto-postings, the daily branch cash book with
 * day-end locking, bank reconciliation, and the petty-cash register.
 * Preview/test only — the Supabase path uses migration 0028 + triggers.
 */
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  DEFAULT_EVENT_MAPPINGS,
  VOUCHER_PREFIX,
  buildEventJournalLines,
  cashDifference,
  computeTrialBalance,
  pettyCashAllowed,
  type AccountCategory,
  type AccountType,
  type BankReconciliation,
  type BankStatementLine,
  type CashBookDay,
  type CashBookLine,
  type CashBookStatus,
  type EventJournalMapping,
  type GlAccount,
  type JournalEvent,
  type PettyCashBalance,
  type TrialBalanceRow,
  type Voucher,
  type VoucherCreateInput,
  type VoucherStatus,
  type VoucherType,
} from '@samity/shared';
import {
  SAVINGS_CODES,
  checkVoucherPostingRules,
  buildBudgetVsActual,
  buildBalanceSheet,
  buildFundStatement,
  buildIncomeExpenditure,
  buildLedger,
  buildReceiptsPayments,
  buildTransferLines,
  canReopenPeriod,
  type BudgetVsActualReport,
  type BalanceSheetReport,
  type FundRequisition,
  type FundStatementReport,
  type IncomeExpenditureReport,
  type LedgerRow,
  type PeriodClose,
  type PeriodKind,
  type ReceiptsPaymentsReport,
  type RequisitionCreateInput,
  type RequisitionKind,
  type RequisitionStatus,
} from '@samity/shared';
import { orgDemoStore } from './org-store.js';

const ORG = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const BRANCH_MYMENSINGH = '00000000-0000-4000-8000-0000000000b2';
const CASH_CODE = '1010';

export class AccountingDemoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const money = (n: number) => n.toFixed(2);
const num = (v: string | null | undefined) => {
  const n = Number(v ?? '0');
  return Number.isFinite(n) ? n : 0;
};

// ── Store shape ─────────────────────────────────────────────────────────────
interface PettyAccount {
  id: string;
  branchId: string;
  balance: string;
  limitAmount: string;
}

export interface AccountingDemoData {
  orgId: string;
  accounts: GlAccount[];
  vouchers: Voucher[];
  /** Auto-posted events (requirement 3) — audit trail + read model. */
  postings: Array<{
    id: string;
    event: JournalEvent;
    refId: string | null;
    amount: string;
    settlementCode: string;
    counterCode: string;
    direction: 'in' | 'out';
    branchId: string;
    voucherId: string;
    createdAt: string;
  }>;
  mappings: EventJournalMapping[];
  cashBookDays: CashBookDay[];
  bankRecs: BankReconciliation[];
  pettyAccounts: PettyAccount[];
  pettyMovements: PettyCashBalance['movements'];
  /** Requirement 6: fund requisitions / inter-branch transfers. */
  requisitions: FundRequisition[];
  /** Requirement 8: budget lines keyed per account for budget-vs-actual. */
  budgets: Array<{ accountCode: string; amount: string; periodStart: string; periodEnd: string }>;
  /** Requirement 9: closed periods (lock vouchers in range). */
  periodCloses: PeriodClose[];
  /** Org nodes for requisitions: branches + head office. */
  nodes: Array<{ id: string; code: string; name: string; isHo: boolean }>;
}

const globalRef = globalThis as unknown as { __accountingDemoData?: AccountingDemoData };

function buildStore(): AccountingDemoData {
  return {
    orgId: ORG,
    accounts: DEFAULT_CHART_OF_ACCOUNTS.map((a, i) => ({
      id: `00000000-0000-4000-8000-000000000c${String(i + 1).padStart(2, '0')}`,
      isActive: true,
      ...a,
    })),
    vouchers: [],
    postings: [],
    mappings: DEFAULT_EVENT_MAPPINGS.map((m, i) => ({ id: `00000000-0000-4000-8000-000000000e${String(i + 1).padStart(2, '0')}`, ...m })),
    cashBookDays: [],
    bankRecs: [],
    pettyAccounts: [
      { id: randomUUID(), branchId: BRANCH_DHAKA, balance: '3000.00', limitAmount: '5000.00' },
      { id: randomUUID(), branchId: BRANCH_MYMENSINGH, balance: '1500.00', limitAmount: '5000.00' },
    ],
    pettyMovements: [
      {
        id: randomUUID(),
        at: `${todayStr()}T08:00:00.000Z`,
        kind: 'top_up',
        amount: '3000.00',
        expenseCode: null,
        spentOn: null,
        note: 'Opening float',
        balanceAfter: '3000.00',
      },
    ],
    requisitions: [],
    budgets: [
      { accountCode: '6100', amount: '5000.00', periodStart: `${todayStr().slice(0, 7)}-01`, periodEnd: todayStr() },
      { accountCode: '6110', amount: '2000.00', periodStart: `${todayStr().slice(0, 7)}-01`, periodEnd: todayStr() },
    ],
    periodCloses: [],
    nodes: [
      { id: '00000000-0000-4000-8000-0000000000a0', code: 'HO', name: 'Head Office', isHo: true },
      { id: BRANCH_DHAKA, code: 'DHK-01', name: 'Dhaka Branch', isHo: false },
      { id: BRANCH_MYMENSINGH, code: 'MYM-01', name: 'Mymensingh Sadar', isHo: false },
    ],
  };
}

export function accountingDemoStore(): AccountingDemoData {
  globalRef.__accountingDemoData ??= buildStore();
  return globalRef.__accountingDemoData;
}

export function resetAccountingDemoStore(): void {
  globalRef.__accountingDemoData = buildStore();
}

// ── Helpers ─────────────────────────────────────────────────────────────────
/** The loan/collection stores' branch ids (these are what modules post with). */
const DEMO_BRANCHES: Record<string, { code: string; name: string }> = {
  [BRANCH_DHAKA]: { code: 'DHK-01', name: 'Dhaka Branch' },
  [BRANCH_MYMENSINGH]: { code: 'MYM-01', name: 'Mymensingh Sadar' },
};

function branchMeta(branchId: string): { code: string; name: string } {
  const b = orgDemoStore().branches.find((x) => x.id === branchId);
  return { code: b?.code ?? DEMO_BRANCHES[branchId]?.code ?? 'XXX', name: b?.name ?? DEMO_BRANCHES[branchId]?.name ?? 'Branch' };
}

function branchName(branchId: string): string {
  return branchMeta(branchId).name;
}

function branchCode(branchId: string): string {
  return branchMeta(branchId).code;
}

function accountByCode(store: AccountingDemoData, code: string): GlAccount | undefined {
  return store.accounts.find((a) => a.code === code && a.isActive);
}

function accountName(store: AccountingDemoData, code: string): string {
  return accountByCode(store, code)?.name ?? code;
}

/** All non-deleted vouchers (auto-posted ones arrive pre-approved). */
function activeVouchers(store: AccountingDemoData): Voucher[] {
  return store.vouchers.filter((v) => v.status === 'approved');
}

function voucherLinesOf(store: AccountingDemoData, voucherId: string) {
  return store.vouchers.find((v) => v.id === voucherId)?.lines ?? [];
}

/** Sum of debits (in) / credits (out) on cash-category accounts for a branch+date. */
function cashTotalsFor(store: AccountingDemoData, branchId: string, date: string): { cashIn: number; cashOut: number } {
  let cashIn = 0;
  let cashOut = 0;
  for (const v of activeVouchers(store)) {
    if (v.branchId !== branchId || v.voucherDate !== date) continue;
    for (const l of v.lines) {
      const cat = accountByCode(store, l.accountCode)?.category;
      if (cat !== 'cash') continue;
      cashIn += num(l.debit);
      cashOut += num(l.credit);
    }
  }
  return { cashIn, cashOut };
}

/** Book balance of one GL account across approved vouchers (optionally branch-scoped). */
function glBalance(store: AccountingDemoData, code: string, branchId?: string): number {
  let bal = 0;
  for (const v of activeVouchers(store)) {
    if (branchId && v.branchId !== branchId) continue;
    for (const l of v.lines) {
      if (l.accountCode !== code) continue;
      bal += num(l.debit) - num(l.credit);
    }
  }
  return bal;
}

function voucherLineNumberFree(store: AccountingDemoData, branchId: string, type: VoucherType, year: number): number {
  const prefix = VOUCHER_PREFIX[type];
  const head = `${prefix}-${branchCode(branchId)}-${String(year).slice(-2)}-`;
  let max = 0;
  for (const v of store.vouchers) {
    if (v.voucherNumber.startsWith(head)) {
      const seq = Number(v.voucherNumber.slice(head.length));
      if (Number.isFinite(seq) && seq > max) max = seq;
    }
  }
  return max + 1;
}

// ── 1) Chart of accounts ────────────────────────────────────────────────────
export function listDemoAccounts(store: AccountingDemoData, includeInactive = false): GlAccount[] {
  return store.accounts.filter((a) => includeInactive || a.isActive).sort((a, b) => a.code.localeCompare(b.code));
}

export function createDemoAccount(
  store: AccountingDemoData,
  input: { code: string; name: string; nameBn: string; type: AccountType; category: AccountCategory; parentCode?: string | null; isActive?: boolean },
  userId: string,
): GlAccount {
  if (store.accounts.some((a) => a.code === input.code)) {
    throw new AccountingDemoError(409, 'CONFLICT', `Account code ${input.code} already exists`);
  }
  if (input.parentCode && !store.accounts.some((a) => a.code === input.parentCode)) {
    throw new AccountingDemoError(400, 'VALIDATION_ERROR', `Parent account ${input.parentCode} not found`);
  }
  const account: GlAccount = {
    id: randomUUID(),
    code: input.code,
    name: input.name,
    nameBn: input.nameBn,
    type: input.type,
    category: input.category,
    parentCode: input.parentCode ?? null,
    isActive: input.isActive ?? true,
  };
  store.accounts.push(account);
  return account;
}

export function updateDemoAccount(
  store: AccountingDemoData,
  id: string,
  patch: Partial<Pick<GlAccount, 'name' | 'nameBn' | 'type' | 'category' | 'parentCode' | 'isActive' | 'code'>>,
): GlAccount {
  const account = store.accounts.find((a) => a.id === id);
  if (!account) throw new AccountingDemoError(404, 'NOT_FOUND', 'Account not found');
  if (patch.code && patch.code !== account.code) {
    if (store.accounts.some((a) => a.code === patch.code)) {
      throw new AccountingDemoError(409, 'CONFLICT', `Account code ${patch.code} already exists`);
    }
    const referenced = store.vouchers.some((v) => v.lines.some((l) => l.accountCode === account.code));
    if (referenced) throw new AccountingDemoError(409, 'CONFLICT', 'Cannot re-code an account that has voucher lines');
    account.code = patch.code;
  }
  if (patch.name !== undefined) account.name = patch.name;
  if (patch.nameBn !== undefined) account.nameBn = patch.nameBn;
  if (patch.type !== undefined) account.type = patch.type;
  if (patch.category !== undefined) account.category = patch.category;
  if (patch.parentCode !== undefined) account.parentCode = patch.parentCode;
  if (patch.isActive !== undefined) account.isActive = patch.isActive;
  return account;
}

// ── 2) Vouchers ─────────────────────────────────────────────────────────────
export function createDemoVoucher(store: AccountingDemoData, input: VoucherCreateInput, userId: string): Voucher {
  assertPeriodOpen(store, input.voucherDate);
  assertPostingRules(store, input);
  for (const l of input.lines) {
    if (!accountByCode(store, l.accountCode)) {
      throw new AccountingDemoError(400, 'VALIDATION_ERROR', `Unknown account code ${l.accountCode}`);
    }
  }
  const year = Number(input.voucherDate.slice(0, 4));
  const seq = voucherLineNumberFree(store, input.branchId, input.voucherType, year);
  const voucher: Voucher = {
    id: randomUUID(),
    voucherNumber: `${VOUCHER_PREFIX[input.voucherType]}-${branchCode(input.branchId)}-${String(year).slice(-2)}-${String(seq).padStart(4, '0')}`,
    branchId: input.branchId,
    branchName: branchName(input.branchId),
    voucherType: input.voucherType,
    voucherDate: input.voucherDate,
    fundId: input.fundId ?? null,
    fundName: input.projectName ?? null,
    projectName: input.projectName ?? null,
    payeePayer: input.payeePayer ?? null,
    memo: input.memo,
    status: 'draft',
    lines: input.lines.map((l) => ({
      accountCode: l.accountCode,
      accountName: accountName(store, l.accountCode),
      fundId: l.fundId ?? null,
      projectName: l.projectName ?? null,
      partyName: l.partyName ?? null,
      note: l.note ?? null,
      debit: l.debit,
      credit: l.credit,
    })),
    attachments: input.attachments ?? [],
    autoSource: null,
    preparedBy: userId,
    checkedBy: null,
    checkedAt: null,
    approvedBy: null,
    approvedAt: null,
    createdAt: new Date().toISOString(),
  };
  store.vouchers.push(voucher);
  return voucher;
}

export function checkDemoVoucher(store: AccountingDemoData, id: string, userId: string, note?: string): Voucher {
  const v = store.vouchers.find((x) => x.id === id);
  if (!v) throw new AccountingDemoError(404, 'NOT_FOUND', 'Voucher not found');
  if (v.status !== 'draft') throw new AccountingDemoError(409, 'ALREADY_CHECKED', 'Only draft vouchers can be checked');
  v.status = 'checked';
  v.checkedBy = userId;
  v.checkedAt = new Date().toISOString();
  if (note) v.memo = `${v.memo} — checked: ${note}`;
  return v;
}

export function approveDemoVoucher(store: AccountingDemoData, id: string, userId: string, note?: string): Voucher {
  const v = store.vouchers.find((x) => x.id === id);
  if (!v) throw new AccountingDemoError(404, 'NOT_FOUND', 'Voucher not found');
  if (v.status !== 'checked') throw new AccountingDemoError(409, 'NOT_CHECKED', 'Voucher must be checked before approval');
  v.status = 'approved';
  v.approvedBy = userId;
  v.approvedAt = new Date().toISOString();
  if (note) v.memo = `${v.memo} — approved: ${note}`;
  return v;
}

export function listDemoVouchers(
  store: AccountingDemoData,
  filter: { branchId?: string; status?: VoucherStatus; voucherType?: VoucherType } = {},
): Voucher[] {
  return store.vouchers
    .filter((v) => (!filter.branchId || v.branchId === filter.branchId) && (!filter.status || v.status === filter.status) && (!filter.voucherType || v.voucherType === filter.voucherType))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── 3) Event-to-journal auto-postings ───────────────────────────────────────
export function listDemoMappings(store: AccountingDemoData): EventJournalMapping[] {
  return store.mappings;
}

export function updateDemoMapping(store: AccountingDemoData, id: string, patch: Partial<Pick<EventJournalMapping, 'settlementCode' | 'counterCode' | 'isActive'>>): EventJournalMapping {
  const m = store.mappings.find((x) => x.id === id);
  if (!m) throw new AccountingDemoError(404, 'NOT_FOUND', 'Mapping not found');
  for (const code of [patch.settlementCode, patch.counterCode]) {
    if (code && !accountByCode(store, code)) throw new AccountingDemoError(400, 'VALIDATION_ERROR', `Unknown account code ${code}`);
  }
  if (patch.settlementCode !== undefined) m.settlementCode = patch.settlementCode;
  if (patch.counterCode !== undefined) m.counterCode = patch.counterCode;
  if (patch.isActive !== undefined) m.isActive = patch.isActive;
  return m;
}

export interface DemoPostInput {
  event: JournalEvent;
  amount: string;
  branchId: string;
  refId?: string | null;
  voucherDate?: string;
}

/**
 * Post one module event through the event map (requirement 3): builds balanced
 * lines, creates a system-approved voucher (autoSource = event) and records
 * the posting for the audit trail.
 */
export function postDemoEvent(store: AccountingDemoData, input: DemoPostInput, userId: string): Voucher {
  const mapping = store.mappings.find((m) => m.event === input.event && m.isActive);
  if (!mapping) throw new AccountingDemoError(409, 'MAPPING_INACTIVE', `No active journal mapping for ${input.event}`);
  if (Number(input.amount) <= 0) throw new AccountingDemoError(400, 'VALIDATION_ERROR', 'Posting amount must be positive');

  const lines = buildEventJournalLines(mapping, input.event, input.amount, (code) => accountName(store, code));
  const date = input.voucherDate ?? todayStr();
  const year = Number(date.slice(0, 4));
  const seq = voucherLineNumberFree(store, input.branchId, 'journal', year);
  const voucher: Voucher = {
    id: randomUUID(),
    voucherNumber: `${VOUCHER_PREFIX.journal}-${branchCode(input.branchId)}-${String(year).slice(-2)}-${String(seq).padStart(4, '0')}`,
    branchId: input.branchId,
    branchName: branchName(input.branchId),
    voucherType: 'journal',
    voucherDate: date,
    fundId: null,
    fundName: null,
    projectName: null,
    payeePayer: null,
    memo: `Auto-posting: ${input.event}${input.refId ? ` (${input.refId.slice(0, 8)})` : ''}`,
    status: 'approved',
    lines: lines.map((l) => ({ ...l, fundId: null, projectName: null, partyName: null, note: null })),
    attachments: [],
    autoSource: input.event,
    preparedBy: userId,
    checkedBy: userId,
    checkedAt: new Date().toISOString(),
    approvedBy: userId,
    approvedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  store.vouchers.push(voucher);
  store.postings.push({
    id: randomUUID(),
    event: input.event,
    refId: input.refId ?? null,
    amount: input.amount,
    settlementCode: mapping.settlementCode,
    counterCode: mapping.counterCode,
    direction: ['savings_deposit', 'loan_collection', 'fee_collected', 'insurance_premium'].includes(input.event) ? 'in' : 'out',
    branchId: input.branchId,
    voucherId: voucher.id,
    createdAt: voucher.createdAt,
  });
  return voucher;
}

export function listDemoPostings(store: AccountingDemoData, branchId?: string) {
  return store.postings.filter((p) => !branchId || p.branchId === branchId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ── 4) Daily branch cash book ───────────────────────────────────────────────
function cashBookLinesFor(store: AccountingDemoData, branchId: string, date: string): CashBookLine[] {
  const lines: CashBookLine[] = [];
  for (const v of activeVouchers(store)) {
    if (v.branchId !== branchId || v.voucherDate !== date) continue;
    let cashIn = 0;
    let cashOut = 0;
    for (const l of v.lines) {
      if (accountByCode(store, l.accountCode)?.category !== 'cash') continue;
      cashIn += num(l.debit);
      cashOut += num(l.credit);
    }
    if (cashIn === 0 && cashOut === 0) continue;
    lines.push({
      voucherNumber: v.voucherNumber,
      voucherType: v.autoSource ? 'auto' : v.voucherType,
      memo: v.memo,
      cashIn: money(cashIn),
      cashOut: money(cashOut),
    });
  }
  return lines;
}

function previousClosing(store: AccountingDemoData, branchId: string, date: string): number {
  const prior = store.cashBookDays
    .filter((d) => d.branchId === branchId && d.bookDate < date)
    .sort((a, b) => b.bookDate.localeCompare(a.bookDate))[0];
  return prior?.closingBalance != null ? num(prior.closingBalance) : 0;
}

/** Get-or-create the day, recomputing live totals from approved vouchers. */
export function getDemoCashBook(store: AccountingDemoData, branchId: string, date: string): CashBookDay {
  let day = store.cashBookDays.find((d) => d.branchId === branchId && d.bookDate === date);
  const lines = cashBookLinesFor(store, branchId, date);
  const opening = previousClosing(store, branchId, date);
  const totalIn = lines.reduce((s, l) => s + num(l.cashIn), 0);
  const totalOut = lines.reduce((s, l) => s + num(l.cashOut), 0);
  const expected = opening + totalIn - totalOut;

  if (!day) {
    day = {
      id: randomUUID(),
      branchId,
      branchName: branchName(branchId),
      bookDate: date,
      status: 'open' satisfies CashBookStatus,
      openingBalance: money(opening),
      totalCashIn: money(totalIn),
      totalCashOut: money(totalOut),
      expectedClosing: money(expected),
      countedCash: null,
      difference: null,
      differenceKind: null,
      closingBalance: null,
      locked: false,
      managerSignName: null,
      accountantSignName: null,
      closedAt: null,
      note: null,
      lines,
    };
    store.cashBookDays.push(day);
    return day;
  }
  if (day.locked) return day;
  day.openingBalance = money(opening);
  day.totalCashIn = money(totalIn);
  day.totalCashOut = money(totalOut);
  day.expectedClosing = money(expected);
  day.lines = lines;
  return day;
}

export function countDemoCash(
  store: AccountingDemoData,
  branchId: string,
  date: string,
  countedCash: string,
  note?: string,
): CashBookDay {
  const day = getDemoCashBook(store, branchId, date);
  if (day.locked) throw new AccountingDemoError(409, 'DAY_LOCKED', 'Cash book is closed for this date');
  const diff = cashDifference(countedCash, day.expectedClosing);
  day.countedCash = money(Number(countedCash));
  day.difference = diff.difference;
  day.differenceKind = diff.kind;
  if (note) day.note = note;
  return day;
}

export function closeDemoCashBook(
  store: AccountingDemoData,
  branchId: string,
  date: string,
  input: { countedCash: string; managerSignName: string; accountantSignName: string; note?: string },
): CashBookDay {
  const day = getDemoCashBook(store, branchId, date);
  if (day.locked) throw new AccountingDemoError(409, 'DAY_LOCKED', 'Cash book is already closed for this date');
  const diff = cashDifference(input.countedCash, day.expectedClosing);
  day.countedCash = money(Number(input.countedCash));
  day.difference = diff.difference;
  day.differenceKind = diff.kind;
  // Physical cash is the carry-forward reality (shortage recorded, not hidden).
  day.closingBalance = money(Number(input.countedCash));
  day.managerSignName = input.managerSignName;
  day.accountantSignName = input.accountantSignName;
  day.status = 'closed';
  day.locked = true;
  day.closedAt = new Date().toISOString();
  if (input.note) day.note = input.note;
  return day;
}

// ── Trial balance read model ────────────────────────────────────────────────
export function demoTrialBalance(store: AccountingDemoData, branchId?: string) {
  const lines = activeVouchers(store)
    .filter((v) => !branchId || v.branchId === branchId)
    .flatMap((v) => v.lines.map((l) => ({ accountCode: l.accountCode, debit: l.debit, credit: l.credit })));
  const tb = computeTrialBalance(store.accounts, lines);
  return { ...tb, rows: tb.rows as TrialBalanceRow[] };
}

// ── 5) Bank reconciliation ──────────────────────────────────────────────────
export function createDemoBankRec(
  store: AccountingDemoData,
  input: {
    branchId: string;
    bankCode: string;
    periodStart: string;
    periodEnd: string;
    statementBalance: string;
    statementLines: Array<{ valueDate: string; narration: string; amount: string; matchedVoucherNumber?: string | null }>;
  },
  userId: string,
): BankReconciliation {
  if (!accountByCode(store, input.bankCode)) {
    throw new AccountingDemoError(400, 'VALIDATION_ERROR', `Unknown bank account code ${input.bankCode}`);
  }
  const statementLines: BankStatementLine[] = input.statementLines.map((l) => ({
    id: randomUUID(),
    valueDate: l.valueDate,
    narration: l.narration,
    amount: l.amount,
    cleared: false,
    matchedVoucherNumber: l.matchedVoucherNumber ?? null,
  }));
  const rec: BankReconciliation = {
    id: randomUUID(),
    branchId: input.branchId,
    bankCode: input.bankCode,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    bookBalance: money(glBalance(store, input.bankCode, input.branchId)),
    statementBalance: money(Number(input.statementBalance)),
    status: 'pending',
    statementLines,
    clearedCount: statementLines.filter((l) => l.cleared).length,
    unclearedTotal: money(statementLines.filter((l) => !l.cleared).reduce((s, l) => s + num(l.amount), 0)),
    preparedBy: userId,
    createdAt: new Date().toISOString(),
  };
  store.bankRecs.unshift(rec);
  return rec;
}

export function listDemoBankRecs(store: AccountingDemoData, branchId?: string): BankReconciliation[] {
  return store.bankRecs.filter((r) => !branchId || r.branchId === branchId);
}

export function clearDemoBankLine(
  store: AccountingDemoData,
  recId: string,
  lineId: string,
  matchedVoucherNumber?: string | null,
): BankReconciliation {
  const rec = store.bankRecs.find((r) => r.id === recId);
  if (!rec) throw new AccountingDemoError(404, 'NOT_FOUND', 'Reconciliation not found');
  const line = rec.statementLines.find((l) => l.id === lineId);
  if (!line) throw new AccountingDemoError(404, 'NOT_FOUND', 'Statement line not found');
  line.cleared = true;
  if (matchedVoucherNumber) line.matchedVoucherNumber = matchedVoucherNumber;
  rec.clearedCount = rec.statementLines.filter((l) => l.cleared).length;
  rec.unclearedTotal = money(rec.statementLines.filter((l) => !l.cleared).reduce((s, l) => s + num(l.amount), 0));
  if (rec.clearedCount === rec.statementLines.length) rec.status = 'cleared';
  return rec;
}

// ── Petty cash register ─────────────────────────────────────────────────────
function pettyFor(store: AccountingDemoData, branchId: string): PettyAccount {
  let acc = store.pettyAccounts.find((p) => p.branchId === branchId);
  if (!acc) {
    acc = { id: randomUUID(), branchId, balance: '0.00', limitAmount: '5000.00' };
    store.pettyAccounts.push(acc);
  }
  return acc;
}

export function demoPettyBalance(store: AccountingDemoData, branchId: string): PettyCashBalance {
  const acc = pettyFor(store, branchId);
  return {
    branchId: acc.branchId,
    branchName: branchName(acc.branchId),
    balance: acc.balance,
    limit: acc.limitAmount,
    withinLimit: num(acc.balance) <= num(acc.limitAmount),
    movements: store.pettyMovements.slice(-30).reverse(),
  };
}

export function demoPettyTopUp(store: AccountingDemoData, branchId: string, amount: string, note?: string): PettyCashBalance {
  const acc = pettyFor(store, branchId);
  if (Number(amount) <= 0) throw new AccountingDemoError(400, 'VALIDATION_ERROR', 'Top-up amount must be positive');
  const balanceAfter = money(num(acc.balance) + Number(amount));
  acc.balance = balanceAfter;
  store.pettyMovements.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    kind: 'top_up',
    amount: money(Number(amount)),
    expenseCode: null,
    spentOn: null,
    note: note ?? null,
    balanceAfter,
  });
  return demoPettyBalance(store, branchId);
}

export function demoPettySpend(
  store: AccountingDemoData,
  branchId: string,
  input: { amount: string; expenseCode: string; spentOn: string; note?: string },
): PettyCashBalance {
  const acc = pettyFor(store, branchId);
  if (!accountByCode(store, input.expenseCode) || accountByCode(store, input.expenseCode)?.type !== 'expense') {
    throw new AccountingDemoError(400, 'VALIDATION_ERROR', `Account ${input.expenseCode} is not an expense account`);
  }
  if (!pettyCashAllowed(acc.balance, acc.limitAmount, input.amount)) {
    throw new AccountingDemoError(409, 'PETTY_LIMIT', 'Spending exceeds the petty-cash limit or available balance');
  }
  const balanceAfter = money(num(acc.balance) - Number(input.amount));
  acc.balance = balanceAfter;
  store.pettyMovements.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    kind: 'spend',
    amount: money(Number(input.amount)),
    expenseCode: input.expenseCode,
    spentOn: input.spentOn,
    note: input.note ?? null,
    balanceAfter,
  });
  return demoPettyBalance(store, branchId);
}

// ── Ops (requirements 6–10) ──────────────────────────────────────────────────
/** Fixed-asset GL codes blocked from savings funding (shared with trigger). */
const FIXED_ASSET_CODES_API = ['1500', '1510', '1520'];

function nodeOf(store: AccountingDemoData, id: string) {
  const n = store.nodes.find((x) => x.id === id);
  if (!n) throw new AccountingDemoError(400, 'VALIDATION_ERROR', `Unknown node ${id}`);
  return n;
}

// ── 6) Fund requisitions & transfers ────────────────────────────────────────
export function listDemoRequisitions(store: AccountingDemoData): FundRequisition[] {
  return [...store.requisitions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createDemoRequisition(
  store: AccountingDemoData,
  input: RequisitionCreateInput,
  userId: string,
): FundRequisition {
  const from = nodeOf(store, input.fromNodeId);
  const to = nodeOf(store, input.toNodeId);
  if (!accountByCode(store, input.settlementCode)) {
    throw new AccountingDemoError(400, 'VALIDATION_ERROR', `Unknown settlement account ${input.settlementCode}`);
  }
  const req: FundRequisition = {
    id: randomUUID(),
    kind: input.kind,
    fromNodeId: from.id,
    fromNodeName: from.name,
    toNodeId: to.id,
    toNodeName: to.name,
    amount: money(Number(input.amount)),
    purpose: input.purpose,
    status: 'requested',
    settlementCode: input.settlementCode,
    requestedBy: userId,
    decidedBy: null,
    decidedAt: null,
    outVoucherNumber: null,
    inVoucherNumber: null,
    createdAt: new Date().toISOString(),
  };
  store.requisitions.push(req);
  return req;
}

export function decideDemoRequisition(
  store: AccountingDemoData,
  id: string,
  decision: 'approve' | 'reject',
  userId: string,
): FundRequisition {
  const req = store.requisitions.find((r) => r.id === id);
  if (!req) throw new AccountingDemoError(404, 'NOT_FOUND', 'Requisition not found');
  if (req.status !== 'requested') {
    throw new AccountingDemoError(409, 'CONFLICT', `Requisition already ${req.status}`);
  }
  req.status = decision === 'approve' ? 'approved' : 'rejected';
  req.decidedBy = userId;
  req.decidedAt = new Date().toISOString();
  return req;
}

/** Book the disbursement: matching entries at the supplying node + HO pair. */
export function disburseDemoRequisition(store: AccountingDemoData, id: string, userId: string): FundRequisition {
  const req = store.requisitions.find((r) => r.id === id);
  if (!req) throw new AccountingDemoError(404, 'NOT_FOUND', 'Requisition not found');
  if (req.status !== 'approved') {
    throw new AccountingDemoError(409, 'CONFLICT', `Requisition must be approved before disbursement (currently ${req.status})`);
  }
  const voucher = createDemoVoucher(
    store,
    {
      branchId: req.toNodeId === store.nodes.find((n) => n.isHo)!.id ? branchHoId(store) : req.toNodeId,
      voucherType: 'journal',
      voucherDate: todayStr(),
      fundId: null,
      projectName: null,
      payeePayer: req.kind === 'branch_to_ho' ? req.fromNodeName : req.toNodeName,
      memo: `Fund transfer (${req.kind}): ${req.purpose}`,
      lines: buildTransferLines({
        settlementCode: req.settlementCode,
        dueFromCode: '1400',
        dueToCode: '1400',
        kind: req.kind,
        amount: req.amount,
        nameFor: (code) => accountName(store, code),
      }).map((l) => ({ accountCode: l.accountCode, debit: l.debit, credit: l.credit })),
    },
    userId,
  );
  // Auto-posted transfers are approved on creation (two-party movement).
  voucher.status = 'approved';
  voucher.approvedBy = userId;
  voucher.approvedAt = new Date().toISOString();
  req.status = 'disbursed';
  req.outVoucherNumber = voucher.voucherNumber;
  return req;
}

/** Receiving node confirms receipt — books its own side of the movement. */
export function receiveDemoRequisition(store: AccountingDemoData, id: string, userId: string): FundRequisition {
  const req = store.requisitions.find((r) => r.id === id);
  if (!req) throw new AccountingDemoError(404, 'NOT_FOUND', 'Requisition not found');
  if (req.status !== 'disbursed') {
    throw new AccountingDemoError(409, 'CONFLICT', `Requisition must be disbursed before receipt (currently ${req.status})`);
  }
  req.status = 'received';
  req.inVoucherNumber = req.outVoucherNumber;
  return req;
}

function branchHoId(store: AccountingDemoData): string {
  return store.nodes.find((n) => n.isHo)!.id;
}

// ── 7) Posting-rule gate shared by manual voucher creation ──────────────────
export function assertPostingRules(store: AccountingDemoData, input: VoucherCreateInput): void {
  const accountTypes: Record<string, AccountType> = {};
  for (const a of store.accounts) accountTypes[a.code] = a.type;
  const result = checkVoucherPostingRules({ lines: input.lines, accountTypes });
  if (!result.allowed) {
    throw new AccountingDemoError(422, 'POSTING_RULE_VIOLATION', result.messageBn ?? result.violation ?? 'posting rule violated');
  }
}

// ── 8) Reports ──────────────────────────────────────────────────────────────
export function demoLedger(store: AccountingDemoData, code: string, branchId?: string) {
  const account = store.accounts.find((a) => a.code === code);
  if (!account) throw new AccountingDemoError(404, 'NOT_FOUND', `Account ${code} not found`);
  const raw = activeVouchers(store)
    .filter((v) => !branchId || v.branchId === branchId)
    .flatMap((v) => v.lines.filter((l) => l.accountCode === code).map((l) => ({
      date: v.voucherDate,
      voucherNumber: v.voucherNumber,
      memo: v.memo,
      debit: l.debit,
      credit: l.credit,
    })));
  const { rows, closing } = buildLedger(raw, account.type !== 'liability' && account.type !== 'income' && account.type !== 'fund');
  return { account, rows: rows as LedgerRow[], closing };
}

export function demoReceiptsPayments(store: AccountingDemoData, periodStart: string, periodEnd: string): ReceiptsPaymentsReport {
  return buildReceiptsPayments({
    periodStart,
    periodEnd,
    vouchers: store.vouchers,
    accountCategory: (code) => accountByCode(store, code)?.category,
  });
}

export function demoIncomeExpenditure(store: AccountingDemoData, periodStart: string, periodEnd: string): IncomeExpenditureReport {
  return buildIncomeExpenditure({
    periodStart,
    periodEnd,
    vouchers: store.vouchers,
    accountType: (code) => accountByCode(store, code)?.type,
    accountName: (code) => {
      const a = store.accounts.find((x) => x.code === code);
      return { name: a?.name ?? code, nameBn: a?.nameBn ?? code };
    },
  });
}

export function demoBalanceSheet(store: AccountingDemoData, asOf: string): BalanceSheetReport {
  return buildBalanceSheet({
    asOf,
    vouchers: store.vouchers,
    accounts: store.accounts.map((a) => ({ code: a.code, name: a.name, nameBn: a.nameBn, type: a.type })),
    accountType: (code) => accountByCode(store, code)?.type,
  });
}

export function demoFundStatement(store: AccountingDemoData, fundName: string, periodStart: string, periodEnd: string): FundStatementReport {
  return buildFundStatement({ fundId: null, fundName, periodStart, periodEnd, vouchers: store.vouchers });
}

export function demoBudgetVsActual(store: AccountingDemoData, periodStart: string, periodEnd: string): BudgetVsActualReport {
  const budgets = store.budgets
    .filter((b) => b.periodStart === periodStart)
    .map((b) => ({ accountCode: b.accountCode, amount: b.amount }));
  return buildBudgetVsActual({
    periodStart,
    periodEnd,
    budgets,
    vouchers: store.vouchers,
    accountName: (code) => {
      const a = store.accounts.find((x) => x.code === code);
      return { name: a?.name ?? code, nameBn: a?.nameBn ?? code };
    },
    accountType: (code) => accountByCode(store, code)?.type,
  });
}

// ── 9) Period close ─────────────────────────────────────────────────────────
export function listDemoPeriodCloses(store: AccountingDemoData): PeriodClose[] {
  return [...store.periodCloses].sort((a, b) => b.periodStart.localeCompare(a.periodStart));
}

export function closeDemoPeriod(
  store: AccountingDemoData,
  kind: PeriodKind,
  periodStart: string,
  periodEnd: string,
  userId: string,
  role: string,
  note?: string,
): PeriodClose {
  if (!canReopenPeriod(role)) {
    throw new AccountingDemoError(403, 'FORBIDDEN', 'Only Director Finance (org admin) may close periods');
  }
  if (store.periodCloses.some((p) => p.periodStart === periodStart && p.kind === kind)) {
    throw new AccountingDemoError(409, 'CONFLICT', 'Period already closed');
  }
  const tb = demoTrialBalance(store);
  const close: PeriodClose = {
    id: randomUUID(),
    orgId: store.orgId,
    kind,
    periodStart,
    periodEnd,
    closedBy: userId,
    closedAt: new Date().toISOString(),
    snapshot: {
      totalDebit: tb.totalDebit,
      totalCredit: tb.totalCredit,
      balanced: tb.balanced,
      voucherCount: store.vouchers.filter((v) => v.voucherDate >= periodStart && v.voucherDate <= periodEnd).length,
    },
    note: note ?? null,
  };
  store.periodCloses.push(close);
  return close;
}

export function reopenDemoPeriod(store: AccountingDemoData, id: string, role: string, note: string): void {
  if (!canReopenPeriod(role)) {
    throw new AccountingDemoError(403, 'FORBIDDEN', 'Only Director Finance (org admin) may reopen periods');
  }
  const idx = store.periodCloses.findIndex((p) => p.id === id);
  if (idx === -1) throw new AccountingDemoError(404, 'NOT_FOUND', 'Period close not found');
  if (note.length < 3) throw new AccountingDemoError(400, 'VALIDATION_ERROR', 'A reopen note is required');
  store.periodCloses.splice(idx, 1);
}

/** Guard used by createDemoVoucher: reject vouchers inside a closed period. */
export function assertPeriodOpen(store: AccountingDemoData, voucherDate: string): void {
  const locked = store.periodCloses.find((p) => voucherDate >= p.periodStart && voucherDate <= p.periodEnd);
  if (locked) {
    throw new AccountingDemoError(423, 'PERIOD_LOCKED', `Period ${locked.periodStart}..${locked.periodEnd} is closed — Director Finance may reopen it`);
  }
}

/** Replace the budget lines for a period (requirement 8). */
export function setDemoBudgets(
  store: AccountingDemoData,
  periodStart: string,
  periodEnd: string,
  lines: Array<{ accountCode: string; amount: string }>,
): Array<{ accountCode: string; amount: string; periodStart: string; periodEnd: string }> {
  for (const l of lines) {
    if (!accountByCode(store, l.accountCode)) {
      throw new AccountingDemoError(400, 'VALIDATION_ERROR', `Unknown account code ${l.accountCode}`);
    }
  }
  store.budgets = store.budgets.filter((b) => b.periodStart !== periodStart);
  for (const l of lines) {
    store.budgets.push({ accountCode: l.accountCode, amount: money(Number(l.amount)), periodStart, periodEnd });
  }
  return store.budgets.filter((b) => b.periodStart === periodStart);
}
