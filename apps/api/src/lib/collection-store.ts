/**
 * ── Collection & Repayment demo store ────────────────────────────────────────
 * Daily field workflow on top of the loan + savings demo stores:
 * collection sheets, payment allocation (shared engine), idempotent entry
 * posting (offline-safe), receipts, and officer cash handovers.
 * Preview/test only — the Supabase path uses migration 0020 + RPCs.
 */
import { randomUUID } from 'node:crypto';
import {
  allocateCollectionPayment,
  checkCollectionDate,
  COLLECTION_RULE_DEFAULTS,
  computeClosureRebate,
  rowTotalDue,
  scanEntriesForFraud,
  type AllocationOrder,
  type CashHandover,
  type CashSummary,
  type CollectionAllocation,
  type CollectionDashboard,
  type CollectionEntryInput,
  type CollectionEntryMeta,
  type CollectionEntryResponse,
  type CollectionReceipt,
  type CollectionReversal,
  type CollectionSheet,
  type CollectionSheetRow,
  type CollectionSyncInput,
  type CollectionSyncResult,
  type FraudFlag,
  type JournalEntryDraft,
  type LoanClosure,
  type LoanClosureQuote,
  type LoanReschedule,
  type LoanRescheduleCreateInput,
  type LoanWriteOff,
  type LoanWriteOffCreateInput,
  type SamityCollectionRollup,
} from '@samity/shared';
import { DEMO_AUTH_USER_ID } from './demo.js';
import { LoanDemoError, demoMemberName, type LoanDemoData } from './loan-store.js';
import { postDemoTx, savingsDemoStore, SavingsDemoError } from './savings-store.js';

// Demo constants aligned with loan-store / savings-store.
const ORG = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const MEMBER_A = '00000000-0000-4000-8000-0000000001a1';
const MEMBER_B = '00000000-0000-4000-8000-0000000001a2';
const MEMBER_C = '00000000-0000-4000-8000-0000000001a3';

const demoMemberNames: Record<string, { name: string; code: string }> = {
  [MEMBER_A]: { name: 'Rahima Begum', code: 'DHK-26-00001' },
  [MEMBER_B]: { name: 'Salma Khatun', code: 'MYM-26-00014' },
  [MEMBER_C]: { name: 'Jahanara Parvin', code: 'DHK-26-00042' },
};

/** Demo meeting point for the Dhaka branch samity (Dhanmondi). */
export const DEMO_MEETING_POINT = { lat: 23.7806, lng: 90.4193 } as const;

/** The demo field officer who collects and hands over. */
export const DEMO_OFFICER_ID = '00000000-0000-4000-8000-0000000002a1';
export const DEMO_OFFICER_NAME = 'Md. Kamrul Hasan (অফিসার)';

const todayStr = () => new Date().toISOString().slice(0, 10);
const num = (v: string | undefined | null) => {
  const n = Number(v ?? '0');
  return Number.isFinite(n) ? n : 0;
};
const money = (n: number) => n.toFixed(2);

// ── Store shape ─────────────────────────────────────────────────────────────
export interface CollectionDemoData {
  orgId: string;
  /** Per-member advance credit (paid beyond dues in earlier meetings). */
  advanceBalances: Record<string, string>;
  entries: Array<{
    id: string;
    orgId: string;
    branchId: string;
    idempotencyKey: string;
    memberId: string;
    applicationId: string | null;
    meetingDate: string;
    loanPaid: string;
    savingsPaid: string;
    extraPaid: string;
    allocation: CollectionAllocation;
    receiptNo: string;
    collectedBy: string | null;
    capturedAt: string | null;
    note: string | null;
    meta: CollectionEntryMeta | null;
    createdAt: string;
  }>;
  handovers: CashHandover[];
  receiptSeq: Record<string, number>;
  /** 8) Date-rule config (org-level, mutable via API). */
  rules: { backdateLimitDays: number; futureLimitDays: number; identicalAmountMinMembers: number };
  /** 6) Branch-Manager reversals of wrong entries. */
  reversals: CollectionReversal[];
  /** 5) Reschedules + write-offs + closures (settlement requests). */
  reschedules: LoanReschedule[];
  writeOffs: LoanWriteOff[];
  closures: LoanClosure[];
  /** 9) Fraud flags from the post-entry scan. */
  fraudFlags: FraudFlag[];
  /** Reverse map: entry id → application id (reversal un-applies). */
  entryApplication: Record<string, string | null>;
}

const globalRef = globalThis as unknown as { __collectionDemoData?: CollectionDemoData };

export function collectionDemoStore(): CollectionDemoData {
  globalRef.__collectionDemoData ??= {
    orgId: ORG,
    advanceBalances: {
      // Rahima prepaid ৳100 beyond dues in an earlier meeting.
      [MEMBER_A]: '100.00',
    },
    entries: [],
    handovers: [],
    receiptSeq: {},
    rules: { ...COLLECTION_RULE_DEFAULTS, identicalAmountMinMembers: 2 },
    reversals: [],
    reschedules: [],
    writeOffs: [],
    closures: [],
    fraudFlags: [],
    entryApplication: {},
  };
  return globalRef.__collectionDemoData;
}

/** Test isolation: rebuild the dataset from scratch. */
export function resetCollectionDemoStore(): void {
  delete globalRef.__collectionDemoData;
}

export class CollectionDemoError extends Error {
  constructor(
    public status: number,
    public code: import('@samity/shared').ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// ── Sheet building (requirement 1) ──────────────────────────────────────────
interface SheetContext {
  store: LoanDemoData;
  meetingDate: string;
  branchId: string;
  allocationOrder: AllocationOrder;
}

/**
 * Build the per-meeting collection sheet: every active borrower / saver of
 * the branch with due installment, overdue rows, advance credit and the net
 * total to collect. Advances (credit from earlier overpayments) offset the
 * gross total; leftover advance is surfaced in `advanceBalance`.
 */
export function buildDemoSheet(ctx: SheetContext): CollectionSheet {
  const { store, meetingDate, branchId, allocationOrder } = ctx;
  const coll = collectionDemoStore();
  const savings = savingsDemoStore();
  const rows: CollectionSheetRow[] = [];

  const memberIds = new Set<string>();
  for (const app of store.applications) {
    if (app.branchId === branchId && ['approved', 'disbursed'].includes(app.status)) memberIds.add(app.memberId);
  }
  for (const acc of savings.accounts) {
    if (acc.branch_id === branchId && acc.status === 'active') memberIds.add(acc.member_id);
  }

  for (const memberId of memberIds) {
    const app = store.applications.find(
      (a) => a.memberId === memberId && a.branchId === branchId && ['approved', 'disbursed'].includes(a.status),
    );

    // ── Loan dues from the stored disbursement schedule ──
    let loan: CollectionSheetRow['loan'] = null;
    if (app) {
      const rec = store.disbursements.find((d) => d.applicationId === app.id);
      if (rec?.schedule.rows.length) {
        const ms = Date.parse(`${meetingDate}T00:00:00Z`);
        const unpaid = rec.schedule.rows.filter((r) => num(r.paidAmount) < num(r.total));
        const overdue = unpaid
          .filter((r) => Date.parse(`${r.dueDate}T00:00:00Z`) < ms)
          .map((r) => ({
            installmentId: r.id,
            seq: r.seq,
            dueDate: r.dueDate,
            amount: money(num(r.total) - num(r.paidAmount)),
            daysOverdue: Math.floor((ms - Date.parse(`${r.dueDate}T00:00:00Z`)) / 86_400_000),
          }));
        const currentRow = unpaid.find((r) => Date.parse(`${r.dueDate}T00:00:00Z`) >= ms) ?? null;
        loan = {
          applicationId: app.id,
          loanNumber: rec.loanNumber,
          productName: rec.productName,
          installmentAmount: rec.schedule.schedule.installmentAmount,
          overdue,
          current: currentRow
            ? {
                installmentId: currentRow.id,
                seq: currentRow.seq,
                dueDate: currentRow.dueDate,
                amount: money(num(currentRow.total) - num(currentRow.paidAmount)),
              }
            : null,
        };
      }
    }

    // ── Savings due: first active savings account with a meeting cadence ──
    const savingsAccount = savings.accounts.find(
      (a) => a.member_id === memberId && a.branch_id === branchId && a.status === 'active',
    );
    const savingsProduct = savingsAccount ? savings.products.find((p) => p.id === savingsAccount.product_id) : null;
    const weeklyDue =
      savingsProduct && num(savingsProduct.auto_link_weekly_amount) > 0 ? savingsProduct.auto_link_weekly_amount : null;

    // ── Advance credit (offsets today's gross total) ──
    const advance = num(coll.advanceBalances[memberId] ?? '0');
    const grossDue = num(rowTotalDue({ loan, savingsDue: null }));
    const advanceOffset = Math.min(advance, grossDue);
    const leftoverAdvance = advance - advanceOffset;

    rows.push({
      memberId,
      memberCode: demoMemberNames[memberId]?.code ?? '—',
      memberName: demoMemberNames[memberId]?.name ?? 'Unknown member',
      samityId: app ? (store.samityAssignments[app.id] ?? null) : null,
      samityName: app ? 'কেন্দ্র (সমিতি)' : null,
      loan,
      savingsDue:
        savingsAccount && savingsProduct && weeklyDue
          ? {
              accountId: savingsAccount.id,
              accountNumber: savingsAccount.account_number,
              productName: savingsProduct.name,
              amount: weeklyDue,
            }
          : null,
      advanceBalance: money(leftoverAdvance),
      // Net total: gross dues minus the advance consumed here. The offset is
      // not cash — it reduces what the officer collects today.
      totalDue: money(grossDue - advanceOffset),
    });
  }

  const totalDue = rows.reduce((s, r) => s + num(r.totalDue), 0);
  const collected = coll.entries
    .filter((e) => e.meetingDate === meetingDate && e.branchId === branchId)
    .reduce((s, e) => s + num(e.loanPaid) + num(e.savingsPaid) + num(e.extraPaid), 0);

  return {
    meetingDate,
    branchId,
    branchName: branchId === BRANCH_DHAKA ? 'Dhaka Branch' : 'Mymensingh Sadar',
    officerId: DEMO_OFFICER_ID,
    allocationOrder,
    rows,
    totals: {
      due: money(totalDue),
      collected: money(collected),
      members: rows.length,
    },
  };
}

/** Context for posting: the store + who collects + allocation policy. */
export interface PostContext {
  store: LoanDemoData;
  officerId: string | null;
  officerRole: string;
  allocationOrder: AllocationOrder;
}

/**
 * Post one collection entry (idempotent by idempotencyKey):
 * allocates via the shared engine, marks installments paid, posts the savings
 * deposit, writes the journal + loan passbook, and mints a receipt number.
 * A second call with the same key returns the stored receipt with duplicate=true.
 */
export function postDemoCollectionEntry(
  store: LoanDemoData,
  coll: CollectionDemoData,
  input: CollectionEntryInput,
  ctx: PostContext,
): CollectionEntryResponse {
  const loanTotal = num(input.loanPaid);
  const savingsTotal = num(input.savingsPaid);
  const extraTotal = num(input.extraPaid);
  if (loanTotal + savingsTotal + extraTotal <= 0) {
    throw new CollectionDemoError(400, 'VALIDATION_ERROR', 'At least one paid amount is required');
  }

  const existing = coll.entries.find((e) => e.idempotencyKey === input.idempotencyKey);
  if (existing) {
    return { duplicate: true, receipt: demoReceiptFrom(existing) };
  }

  // ── 8) Date rule engine: no future dating, backdate within the org limit ──
  const dateCheck = checkCollectionDate(input.meetingDate, todayStr(), coll.rules.backdateLimitDays);
  if (!dateCheck.allowed) {
    throw new CollectionDemoError(
      422,
      dateCheck.reason === 'future_dated' ? 'FUTURE_DATED' : 'BACKDATED',
      dateCheck.reason === 'future_dated'
        ? 'ভবিষ্যতের তারিখ দেওয়া যাবে না / Future-dated collections are blocked'
        : `ব্যাকডেট সীমা ${dateCheck.maxDays} দিন / Backdating beyond ${dateCheck.maxDays} day(s) is blocked`,
    );
  }

  const app = store.applications.find((a) => a.memberId === input.memberId && ['approved', 'disbursed'].includes(a.status));
  const branchId =
    app?.branchId ?? savingsDemoStore().accounts.find((a) => a.member_id === input.memberId)?.branch_id ?? BRANCH_DHAKA;
  const sheet = buildDemoSheet({ store, meetingDate: input.meetingDate, branchId, allocationOrder: ctx.allocationOrder });
  const row = sheet.rows.find((r) => r.memberId === input.memberId);
  if (!row) throw new CollectionDemoError(404, 'NOT_FOUND', 'Member not found on the collection sheet');

  // The engine treats advance credit as pre-paid money: pass it in the pool so
  // buckets (incl. the advance overflow) reconcile against the sheet's totals.
  const pool = loanTotal + savingsTotal + extraTotal;
  const allocation = allocateCollectionPayment(row, { loanPaid: pool, savingsPaid: 0, extraPaid: 0 }, ctx.allocationOrder);

  const today = input.meetingDate;
  const now = new Date().toISOString();
  const rec = app ? store.disbursements.find((d) => d.applicationId === app.id) : undefined;

  // ── Mark installments paid (stored schedule rows) ──
  const markPaid = (installmentId: string, seq: number, amount: string) => {
    if (!rec) return;
    const r = rec.schedule.rows.find((x) => x.id === installmentId || x.seq === seq);
    if (r) {
      r.paidAmount = money(Math.min(num(r.paidAmount) + num(amount), num(r.total)));
      r.paidAt = now;
    }
  };
  for (const o of allocation.overdueApplied) markPaid(o.installmentId, o.seq, o.amount);
  if (allocation.currentApplied) markPaid(allocation.currentApplied.installmentId, allocation.currentApplied.seq, allocation.currentApplied.amount);

  // ── Savings deposit via the savings store (throws on conflicts) ──
  if (num(allocation.savingsApplied) > 0 && row.savingsDue) {
    try {
      postDemoTx(savingsDemoStore(), {
        accountId: row.savingsDue.accountId,
        type: 'deposit',
        amount: allocation.savingsApplied,
        reference: `collection:${input.idempotencyKey.slice(0, 8)}`,
        note: 'সমিতি চাঁদা / Meeting collection',
        userId: ctx.officerId,
      });
    } catch (err) {
      if (err instanceof SavingsDemoError)
        throw new CollectionDemoError(err.status, err.code as import('@samity/shared').ErrorCode, err.message);
      throw err;
    }
  }

  // ── Advance ledger update: consume credit, add new overflow ──
  const appliedToDues =
    allocation.overdueApplied.reduce((s, o) => s + num(o.amount), 0) +
    num(allocation.currentApplied?.amount ?? '0') +
    num(allocation.savingsApplied);
  const newAdvance = pool - appliedToDues;
  coll.advanceBalances[input.memberId] = money(Math.max(newAdvance, 0));

  // ── Receipt number (RCP-<branchCode>-<YY>-<seq>) ──
  const branchCode = branchId === BRANCH_DHAKA ? 'DHK' : 'MYM';
  const yy = today.slice(2, 4);
  coll.receiptSeq[branchCode] = (coll.receiptSeq[branchCode] ?? 0) + 1;
  const receiptNo = `RCP-${branchCode}-${yy}-${String(coll.receiptSeq[branchCode]).padStart(4, '0')}`;

  // ── Journal (debit cash, credit loan portfolio / savings deposits) ──
  const lines: JournalEntryDraft['lines'] = [];
  const loanApplied =
    allocation.overdueApplied.reduce((s, o) => s + num(o.amount), 0) + num(allocation.currentApplied?.amount ?? '0');
  if (loanApplied > 0) {
    lines.push({ accountCode: '1010', accountName: 'Cash in Vault', debit: money(loanApplied), credit: '0.00' });
    lines.push({ accountCode: '1200', accountName: 'Loan Portfolio', debit: '0.00', credit: money(loanApplied) });
  }
  if (num(allocation.savingsApplied) > 0) {
    lines.push({ accountCode: '1010', accountName: 'Cash in Vault', debit: allocation.savingsApplied, credit: '0.00' });
    lines.push({ accountCode: '2100', accountName: 'Member Savings Deposits', debit: '0.00', credit: allocation.savingsApplied });
  }
  if (num(allocation.advanceApplied) > 0) {
    lines.push({ accountCode: '1010', accountName: 'Cash in Vault', debit: allocation.advanceApplied, credit: '0.00' });
    lines.push({ accountCode: '2200', accountName: 'Member Advance Credit', debit: '0.00', credit: allocation.advanceApplied });
  }
  const journal: JournalEntryDraft = {
    entryDate: today,
    sourceType: 'collection',
    sourceId: input.memberId,
    memo: `Collection ${receiptNo} — ${row.memberName}`,
    lines,
  };
  store.journals.push(journal);

  // ── Loan passbook entry ──
  if (app && rec && loanApplied > 0) {
    const prior = store.passbookEntries
      .filter((p) => p.applicationId === app.id)
      .reduce((s, p) => s + num(p.credit) - num(p.debit), 0);
    store.passbookEntries.push({
      id: randomUUID(),
      applicationId: app.id,
      memberId: input.memberId,
      loanNumber: rec.loanNumber ?? '',
      entryDate: today,
      description: `কিস্তি আদায় / Installment collected (${receiptNo})`,
      debit: '0.00',
      credit: money(loanApplied),
      balanceAfter: money(Math.max(prior - loanApplied, 0)),
    });
  }

  const entry: CollectionDemoData['entries'][number] = {
    id: randomUUID(),
    orgId: ORG,
    branchId,
    idempotencyKey: input.idempotencyKey,
    memberId: input.memberId,
    applicationId: app?.id ?? null,
    meetingDate: today,
    // Cash inputs (what the officer actually received) — the allocation
    // breakdown lives in `allocation` and drives passbook/receipt lines.
    loanPaid: money(loanTotal),
    savingsPaid: money(savingsTotal),
    extraPaid: money(extraTotal),
    allocation,
    receiptNo,
    collectedBy: ctx.officerId,
    capturedAt: input.capturedAt ?? null,
    note: input.note ?? null,
    meta: input.meta ?? null,
    createdAt: now,
  };
  coll.entries.push(entry);
  coll.entryApplication[entry.id] = app?.id ?? null;
  runFraudScan(store, coll, ctx.officerId, today);

  return { duplicate: false, receipt: demoReceiptFrom(entry) };
}

/** Read-model receipt from a stored entry (requirement 3). */
function demoReceiptFrom(entry: CollectionDemoData['entries'][number]): CollectionReceipt {
  const member = demoMemberNames[entry.memberId] ?? { name: 'Unknown', code: '—' };
  const loanApplied = entry.allocation.overdueApplied.reduce((s, o) => s + num(o.amount), 0) +
    num(entry.allocation.currentApplied?.amount ?? '0');
  const total = loanApplied + num(entry.allocation.savingsApplied) + num(entry.allocation.advanceApplied);
  const passbookLines: CollectionReceipt['passbookLines'] = [];
  if (loanApplied > 0)
    passbookLines.push({ book: 'loan', description: 'কিস্তি আদায় / Installment', amount: money(loanApplied) });
  if (num(entry.allocation.savingsApplied) > 0)
    passbookLines.push({ book: 'savings', description: 'সঞ্চয় জমা / Savings deposit', amount: entry.allocation.savingsApplied });
  if (num(entry.allocation.advanceApplied) > 0)
    passbookLines.push({ book: 'savings', description: 'অগ্রিম জমা / Advance', amount: entry.allocation.advanceApplied });
  return {
    receiptNo: entry.receiptNo,
    entryId: entry.id,
    idempotencyKey: entry.idempotencyKey,
    meetingDate: entry.meetingDate,
    memberName: member.name,
    memberCode: member.code,
    loanNumber: null,
    allocation: entry.allocation,
    totalCollected: money(total),
    passbookLines,
    collectedBy: entry.collectedBy,
    createdAt: entry.createdAt,
  };
}

/** Batch sync with per-entry status (requirement 2). Never throws on item failure. */
export function syncDemoCollection(
  store: LoanDemoData,
  coll: CollectionDemoData,
  input: CollectionSyncInput,
  ctx: PostContext,
): CollectionSyncResult {
  const results: CollectionSyncResult['results'] = [];
  let posted = 0;
  let duplicates = 0;
  let failed = 0;
  for (const item of input.entries) {
    try {
      const res = postDemoCollectionEntry(store, coll, item, ctx);
      if (res.duplicate) {
        duplicates += 1;
        results.push({ idempotencyKey: item.idempotencyKey, status: 'duplicate', receiptNo: res.receipt.receiptNo });
      } else {
        posted += 1;
        results.push({ idempotencyKey: item.idempotencyKey, status: 'posted', receiptNo: res.receipt.receiptNo });
      }
    } catch (err) {
      failed += 1;
      const message = err instanceof LoanDemoError || err instanceof CollectionDemoError ? err.message : 'Unknown error';
      results.push({ idempotencyKey: item.idempotencyKey, status: 'failed', error: message });
    }
  }
  return { results, posted, duplicates, failed };
}

// ── Officer cash handover (requirement 4) ───────────────────────────────────
export function demoCashSummary(
  coll: CollectionDemoData,
  officerId: string,
  handoverDate: string,
): CashSummary {
  const collectedToday = coll.entries
    .filter((e) => e.collectedBy === officerId && e.meetingDate === handoverDate)
    .reduce((s, e) => s + num(e.loanPaid) + num(e.savingsPaid) + num(e.extraPaid), 0);
  const handedOver = coll.handovers
    .filter((h) => h.officerId === officerId && h.handoverDate === handoverDate && ['submitted', 'confirmed'].includes(h.status))
    .reduce((s, h) => s + num(h.countedAmount ?? '0'), 0);
  const lastHandover =
    [...coll.handovers].filter((h) => h.officerId === officerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ??
    null;
  return {
    officerId,
    handoverDate,
    collectedToday: money(collectedToday),
    handedOver: money(handedOver),
    cashInHand: money(Math.max(collectedToday - handedOver, 0)),
    lastHandover,
  };
}

export function createDemoHandover(
  coll: CollectionDemoData,
  officerId: string,
  handoverDate: string,
  officerNote: string | null,
): CashHandover {
  const existing = coll.handovers.find(
    (h) => h.officerId === officerId && h.handoverDate === handoverDate && h.status !== 'rejected',
  );
  if (existing) return existing;

  const collectedToday = coll.entries
    .filter((e) => e.collectedBy === officerId && e.meetingDate === handoverDate)
    .reduce((s, e) => s + num(e.loanPaid) + num(e.savingsPaid) + num(e.extraPaid), 0);

  const handover: CashHandover = {
    id: randomUUID(),
    officerId,
    officerName: DEMO_OFFICER_NAME,
    branchId: BRANCH_DHAKA,
    handoverDate,
    expectedAmount: money(collectedToday),
    countedAmount: null,
    receivedAmount: null,
    difference: '0.00',
    differenceKind: 'none',
    status: 'draft',
    officerNote: officerNote ?? null,
    accountantNote: null,
    confirmedBy: null,
    confirmedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  coll.handovers.push(handover);
  return handover;
}

export function submitDemoHandover(
  coll: CollectionDemoData,
  handoverId: string,
  countedAmount: string,
  officerNote: string | null,
  officerId: string,
): CashHandover {
  const h = coll.handovers.find((x) => x.id === handoverId);
  if (!h) throw new CollectionDemoError(404, 'NOT_FOUND', 'Handover not found');
  const isDemoAdmin = officerId === '00000000-0000-4000-8000-000000000001';
  if (h.officerId !== officerId && !isDemoAdmin) {
    throw new CollectionDemoError(403, 'FORBIDDEN', 'Only the officer can submit their handover');
  }
  if (h.status !== 'draft') {
    throw new CollectionDemoError(409, 'CONFLICT', `Only a draft handover can be submitted (status: ${h.status})`);
  }
  h.countedAmount = countedAmount;
  h.officerNote = officerNote ?? h.officerNote;
  h.difference = money(num(countedAmount) - num(h.expectedAmount));
  h.differenceKind = Math.abs(num(h.difference)) < 0.005 ? 'none' : num(h.difference) < 0 ? 'shortage' : 'excess';
  h.status = 'submitted';
  h.updatedAt = new Date().toISOString();
  return h;
}

export function confirmDemoHandover(
  coll: CollectionDemoData,
  handoverId: string,
  decision: 'confirm' | 'reject',
  receivedAmount: string | null,
  accountantNote: string | null,
  confirmRole: string,
  confirmUserId: string | null,
): CashHandover {
  if (!['super_admin', 'org_admin', 'branch_manager'].includes(confirmRole)) {
    throw new CollectionDemoError(403, 'FORBIDDEN', 'Only an accountant or manager can confirm a handover');
  }
  const h = coll.handovers.find((x) => x.id === handoverId);
  if (!h) throw new CollectionDemoError(404, 'NOT_FOUND', 'Handover not found');
  if (h.status !== 'submitted') {
    throw new CollectionDemoError(409, 'CONFLICT', `Only a submitted handover can be confirmed (status: ${h.status})`);
  }
  h.accountantNote = accountantNote ?? h.accountantNote;
  if (decision === 'reject') {
    h.status = 'rejected';
    h.updatedAt = new Date().toISOString();
    return h;
  }
  h.receivedAmount = receivedAmount ?? h.countedAmount;
  h.difference = money(num(h.receivedAmount ?? '0') - num(h.expectedAmount));
  h.differenceKind = Math.abs(num(h.difference)) < 0.005 ? 'none' : num(h.difference) < 0 ? 'shortage' : 'excess';
  h.status = 'confirmed';
  h.confirmedBy = confirmUserId;
  h.confirmedAt = new Date().toISOString();
  h.updatedAt = new Date().toISOString();
  return h;
}

/** List handovers with optional date/status filters. */
export function listDemoHandovers(
  coll: CollectionDemoData,
  q: { from?: string; to?: string; status?: CashHandover['status'] },
): CashHandover[] {
  return coll.handovers
    .filter((h) => (!q.from || h.handoverDate >= q.from) && (!q.to || h.handoverDate <= q.to) && (!q.status || h.status === q.status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export { todayStr };

// ── 8) Rule config ──────────────────────────────────────────────────────────
export function getDemoRules(coll: CollectionDemoData) {
  return coll.rules;
}

export function updateDemoRules(
  coll: CollectionDemoData,
  patch: { backdateLimitDays?: number; futureLimitDays?: number },
) {
  if (patch.backdateLimitDays !== undefined) coll.rules.backdateLimitDays = patch.backdateLimitDays;
  if (patch.futureLimitDays !== undefined) coll.rules.futureLimitDays = patch.futureLimitDays;
  return coll.rules;
}

// ── 9) Fraud scan (runs after every posting) ────────────────────────────────
function runFraudScan(
  store: LoanDemoData,
  coll: CollectionDemoData,
  officerId: string | null,
  meetingDate: string,
): void {
  const oid = officerId ?? DEMO_OFFICER_ID;
  const dayEntries = coll.entries.filter((e) => e.collectedBy === oid && e.meetingDate === meetingDate);
  if (dayEntries.length === 0) return;

  // Peer totals: entries for the same members by *other* officers (any date).
  const peerTotalsByMember: Record<string, string[]> = {};
  for (const e of coll.entries) {
    if (e.collectedBy === oid) continue;
    (peerTotalsByMember[e.memberId] ??= []).push(
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      String(Number(e.loanPaid) + Number(e.savingsPaid) + Number(e.extraPaid)),
    );
  }

  const flags = scanEntriesForFraud({
    entries: dayEntries.map((e) => ({
      entryId: e.id,
      receiptNo: e.receiptNo,
      officerId: e.collectedBy ?? DEMO_OFFICER_ID,
      memberId: e.memberId,
      totalCollected: String(Number(e.loanPaid) + Number(e.savingsPaid) + Number(e.extraPaid)),
      meta: e.meta,
      createdAt: e.createdAt,
    })),
    peerTotalsByMember,
    meetingPoint: DEMO_MEETING_POINT,
    config: { identicalAmountMinMembers: coll.rules.identicalAmountMinMembers },
  });

  const seen = new Set(coll.fraudFlags.map((f) => `${f.entryId}:${f.rule}`));
  for (const f of flags) {
    if (seen.has(`${f.entryId}:${f.rule}`)) continue;
    coll.fraudFlags.push({
      id: randomUUID(),
      entryId: f.entryId,
      receiptNo: f.receiptNo,
      rule: f.rule,
      severity: f.severity,
      detail: f.detail,
      detailBn: f.detailBn,
      createdAt: new Date().toISOString(),
      reviewed: false,
      reviewedBy: null,
    });
  }
}

export function listDemoFraudFlags(coll: CollectionDemoData, reviewed?: boolean): FraudFlag[] {
  return reviewed === undefined ? coll.fraudFlags : coll.fraudFlags.filter((f) => f.reviewed === reviewed);
}

export function reviewDemoFraudFlag(
  coll: CollectionDemoData,
  flagId: string,
  reviewerId: string | null,
): FraudFlag {
  const flag = coll.fraudFlags.find((f) => f.id === flagId);
  if (!flag) throw new CollectionDemoError(404, 'NOT_FOUND', 'Fraud flag not found');
  flag.reviewed = true;
  flag.reviewedBy = reviewerId;
  return flag;
}

// ── 6) Branch-Manager reversal of a wrong entry ─────────────────────────────
export function reverseDemoEntry(
  store: LoanDemoData,
  coll: CollectionDemoData,
  entryId: string,
  reason: string,
  reversedBy: string | null,
): CollectionReversal {
  if (coll.reversals.some((r) => r.entryId === entryId)) {
    throw new CollectionDemoError(409, 'ALREADY_REVERSED', 'This entry has already been reversed');
  }
  const entry = coll.entries.find((e) => e.id === entryId);
  if (!entry) throw new CollectionDemoError(404, 'NOT_FOUND', 'Entry not found');

  const unapplied: CollectionReversal['unapplied'] = {
    overdue: [],
    current: '0.00',
    savings: '0.00',
    advance: '0.00',
  };

  // Un-apply the loan schedule rows.
  const applicationId = coll.entryApplication[entryId] ?? null;
  const rec = applicationId
    ? store.disbursements.find((d) => d.applicationId === applicationId)
    : undefined;
  if (rec) {
    for (const o of entry.allocation.overdueApplied) {
      const row = rec.schedule.rows.find((x) => x.id === o.installmentId || x.seq === o.seq);
      if (row) {
        row.paidAmount = money(Math.max(num(row.paidAmount) - num(o.amount), 0));
        row.paidAt = null;
        unapplied.overdue.push({ seq: o.seq, amount: o.amount });
      }
    }
    if (entry.allocation.currentApplied) {
      const row = rec.schedule.rows.find(
        (x) => x.id === entry.allocation.currentApplied?.installmentId || x.seq === entry.allocation.currentApplied?.seq,
      );
      if (row) {
        row.paidAmount = money(Math.max(num(row.paidAmount) - num(entry.allocation.currentApplied.amount), 0));
        row.paidAt = null;
        unapplied.current = entry.allocation.currentApplied.amount;
      }
    }
  }

  // Reverse the savings deposit leg.
  if (num(entry.allocation.savingsApplied) > 0) {
    try {
      const sheet = buildDemoSheet({
        store,
        meetingDate: entry.meetingDate,
        branchId: entry.branchId,
        allocationOrder: 'overdue_first',
      });
      const row = sheet.rows.find((r) => r.memberId === entry.memberId);
      if (row?.savingsDue) {
        postDemoTx(savingsDemoStore(), {
          accountId: row.savingsDue.accountId,
          type: 'withdrawal',
          amount: entry.allocation.savingsApplied,
          reference: `reversal:${entry.receiptNo}`,
          note: 'ভুল এন্ট্রি বাতিল / Wrong-entry reversal',
          userId: reversedBy,
        });
        unapplied.savings = entry.allocation.savingsApplied;
      }
    } catch (err) {
      if (err instanceof SavingsDemoError) {
        throw new CollectionDemoError(
          err.status,
          err.code as import('@samity/shared').ErrorCode,
          `Savings reversal failed: ${err.message}`,
        );
      }
      throw err;
    }
  }

  // Advance credit is un-allocated.
  unapplied.advance = entry.allocation.advanceApplied;
  coll.advanceBalances[entry.memberId] = money(
    Math.max(num(coll.advanceBalances[entry.memberId] ?? '0') - num(entry.allocation.advanceApplied), 0),
  );

  // Remove the journal entry (exact mirror of the posting) and the passbook line.
  const jIdx = store.journals.findIndex((j) => j.memo.includes(entry.receiptNo));
  if (jIdx >= 0) store.journals.splice(jIdx, 1);
  const pIdx = store.passbookEntries.findIndex((p) => p.description.includes(entry.receiptNo));
  if (pIdx >= 0) store.passbookEntries.splice(pIdx, 1);

  const reversal: CollectionReversal = {
    id: randomUUID(),
    entryId,
    receiptNo: entry.receiptNo,
    reason,
    reversedBy,
    reversedAt: new Date().toISOString(),
    unapplied,
  };
  coll.reversals.push(reversal);
  return reversal;
}

// ── 5) Early closure with rebate ────────────────────────────────────────────
interface ClosureCtx {
  store: LoanDemoData;
  closedBy: string | null;
}

function disbursedRecordFor(store: LoanDemoData, applicationId: string) {
  const app = store.applications.find((a) => a.id === applicationId);
  if (!app) throw new CollectionDemoError(404, 'NOT_FOUND', 'Loan application not found');
  if (app.status !== 'disbursed') {
    throw new CollectionDemoError(409, 'INVALID_STATUS', 'Only a disbursed loan can be closed early');
  }
  const rec = store.disbursements.find((d) => d.applicationId === applicationId && !d.cancelledAt);
  if (!rec) throw new CollectionDemoError(409, 'INVALID_STATUS', 'No active disbursement for this loan');
  return { app, rec };
}

export function demoClosureQuote(
  store: LoanDemoData,
  applicationId: string,
  serviceDeductionPercent?: number,
): LoanClosureQuote {
  const { rec } = disbursedRecordFor(store, applicationId);
  const q = computeClosureRebate({ rows: rec.schedule.rows, serviceDeductionPercent });
  return { applicationId, loanNumber: rec.loanNumber, ...q };
}

export function closeDemoLoan(
  ctx: ClosureCtx,
  coll: CollectionDemoData,
  applicationId: string,
  serviceDeductionPercent?: number,
): LoanClosure {
  const { app, rec } = disbursedRecordFor(ctx.store, applicationId);
  if (coll.closures.some((c) => c.applicationId === applicationId)) {
    throw new CollectionDemoError(409, 'ALREADY_CLOSED', 'This loan is already closed');
  }
  const quote = computeClosureRebate({ rows: rec.schedule.rows, serviceDeductionPercent });
  if (quote.remainingInstallments === 0) {
    throw new CollectionDemoError(409, 'ALREADY_PAID', 'Every installment is already paid — no closure needed');
  }

  // Zero the remaining rows (rebate waives unearned interest net of deduction)
  // and close the application.
  for (const row of rec.schedule.rows) {
    if (num(row.paidAmount) < num(row.total)) {
      row.paidAmount = row.total;
      row.paidAt = new Date().toISOString();
    }
  }
  app.status = 'closed';

  // Journal: debit cash (payoff + kept deduction), credit portfolio (principal),
  // credit interest income (kept service deduction). Mirrors the DB trigger.
  const lines: JournalEntryDraft['lines'] = [
    { accountCode: '1010', accountName: 'Cash in Vault', debit: quote.closureAmount, credit: '0.00' },
    { accountCode: '1200', accountName: 'Loan Portfolio', debit: '0.00', credit: quote.outstandingPrincipal },
  ];
  if (num(quote.serviceDeduction) > 0) {
    lines.push({ accountCode: '4100', accountName: 'Interest Income', debit: '0.00', credit: quote.serviceDeduction });
  }
  ctx.store.journals.push({
    entryDate: todayStr(),
    sourceType: 'collection',
    sourceId: applicationId,
    memo: `Early closure ${rec.loanNumber ?? ''} — rebate ${quote.rebate}`,
    lines,
  });

  const closure: LoanClosure = {
    id: randomUUID(),
    applicationId,
    loanNumber: rec.loanNumber,
    memberName: demoMemberName(app.memberId),
    outstandingPrincipal: quote.outstandingPrincipal,
    unearnedInterest: quote.unearnedInterest,
    rebate: quote.rebate,
    serviceDeduction: quote.serviceDeduction,
    closureAmount: quote.closureAmount,
    remainingInstallments: quote.remainingInstallments,
    closedAt: new Date().toISOString(),
    closedBy: ctx.closedBy,
  };
  coll.closures.push(closure);
  return closure;
}

// ── 5) Reschedule (request → decision) ──────────────────────────────────────
export function requestDemoReschedule(
  store: LoanDemoData,
  coll: CollectionDemoData,
  input: LoanRescheduleCreateInput,
  requestedBy: string | null,
): LoanReschedule {
  const { app, rec } = disbursedRecordFor(store, input.applicationId);
  if (coll.reschedules.some((r) => r.applicationId === input.applicationId && r.status !== 'rejected')) {
    throw new CollectionDemoError(409, 'ALREADY_RESCHEDULED', 'This loan already has a reschedule request');
  }
  // Move every unpaid row by shiftInstallments × its cadence gap.
  const unpaid = rec.schedule.rows.filter((r) => num(r.paidAmount) < num(r.total));
  if (unpaid.length === 0) {
    throw new CollectionDemoError(409, 'ALREADY_PAID', 'Nothing left to reschedule');
  }
  const gap =
    unpaid.length >= 2
      ? Math.max(Math.round((Date.parse(unpaid[1]!.dueDate) - Date.parse(unpaid[0]!.dueDate)) / 86_400_000), 1)
      : 7;
  const movedRows = unpaid.map((r) => ({
    seq: r.seq,
    oldDueDate: r.dueDate,
    newDueDate: new Date(Date.parse(r.dueDate) + input.shiftInstallments * gap * 86_400_000)
      .toISOString()
      .slice(0, 10),
  }));

  const reschedule: LoanReschedule = {
    id: randomUUID(),
    applicationId: input.applicationId,
    loanNumber: rec.loanNumber,
    memberName: demoMemberName(app.memberId),
    shiftInstallments: input.shiftInstallments,
    reason: input.reason,
    note: input.note,
    movedRows,
    requestedBy,
    requestedAt: new Date().toISOString(),
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
  };
  coll.reschedules.push(reschedule);
  return reschedule;
}

export function decideDemoReschedule(
  store: LoanDemoData,
  coll: CollectionDemoData,
  id: string,
  decision: 'approved' | 'rejected',
  decidedBy: string | null,
): LoanReschedule {
  const r = coll.reschedules.find((x) => x.id === id);
  if (!r) throw new CollectionDemoError(404, 'NOT_FOUND', 'Reschedule request not found');
  if (r.status !== 'pending') throw new CollectionDemoError(409, 'ALREADY_DECIDED', 'Already decided');
  r.status = decision;
  r.decidedBy = decidedBy;
  r.decidedAt = new Date().toISOString();
  if (decision === 'approved') {
    const rec = store.disbursements.find((d) => d.applicationId === r.applicationId && !d.cancelledAt);
    for (const m of r.movedRows) {
      const row = rec?.schedule.rows.find((x) => x.seq === m.seq);
      if (row) {
        row.originalDueDate = row.dueDate;
        row.dueDate = m.newDueDate;
        row.shifted = true;
        row.shiftReason = `reschedule: ${r.reason}`;
      }
    }
  }
  return r;
}

// ── 5) Write-off (request → approve) ────────────────────────────────────────
export function requestDemoWriteOff(
  store: LoanDemoData,
  coll: CollectionDemoData,
  input: LoanWriteOffCreateInput,
  requestedBy: string | null,
): LoanWriteOff {
  const { app, rec } = disbursedRecordFor(store, input.applicationId);
  if (coll.writeOffs.some((w) => w.applicationId === input.applicationId)) {
    throw new CollectionDemoError(409, 'ALREADY_REQUESTED', 'A write-off already exists for this loan');
  }
  const outstanding = rec.schedule.rows.reduce(
    (s, r) => s + Math.max(num(r.total) - num(r.paidAmount), 0),
    0,
  );
  if (outstanding <= 0) {
    throw new CollectionDemoError(409, 'ALREADY_PAID', 'Nothing outstanding — use early closure instead');
  }
  const w: LoanWriteOff = {
    id: randomUUID(),
    applicationId: input.applicationId,
    loanNumber: rec.loanNumber,
    memberName: demoMemberName(app.memberId),
    outstandingAmount: money(outstanding),
    reason: input.reason,
    note: input.note,
    requestedBy,
    requestedAt: new Date().toISOString(),
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
  };
  coll.writeOffs.push(w);
  return w;
}

export function decideDemoWriteOff(
  store: LoanDemoData,
  coll: CollectionDemoData,
  id: string,
  decision: 'recommended' | 'approved' | 'rejected',
  decidedBy: string | null,
  decisionNote: string | null,
): LoanWriteOff {
  const w = coll.writeOffs.find((x) => x.id === id);
  if (!w) throw new CollectionDemoError(404, 'NOT_FOUND', 'Write-off request not found');
  if (w.status === 'approved' || w.status === 'rejected') {
    throw new CollectionDemoError(409, 'ALREADY_DECIDED', 'Already finally decided');
  }
  w.status = decision;
  w.decidedBy = decidedBy;
  w.decidedAt = new Date().toISOString();
  w.decisionNote = decisionNote;
  if (decision === 'approved') {
    const app = store.applications.find((a) => a.id === w.applicationId);
    if (app) app.status = 'written_off';
    const rec = store.disbursements.find((d) => d.applicationId === w.applicationId && !d.cancelledAt);
    if (rec) {
      for (const row of rec.schedule.rows) {
        if (num(row.paidAmount) < num(row.total)) {
          row.paidAmount = row.total;
          row.paidAt = new Date().toISOString();
        }
      }
    }
    // Journal: debit write-off expense (6200) / credit loan portfolio (1200).
    store.journals.push({
      entryDate: todayStr(),
      sourceType: 'collection',
      sourceId: w.applicationId,
      memo: `Write-off ${w.loanNumber ?? ''} — ${w.reason}`,
      lines: [
        { accountCode: '6200', accountName: 'Loan Write-off Expense', debit: w.outstandingAmount, credit: '0.00' },
        { accountCode: '1200', accountName: 'Loan Portfolio', debit: '0.00', credit: w.outstandingAmount },
      ],
    });
  }
  return w;
}

// ── 7) BM dashboard rollups ─────────────────────────────────────────────────
export function demoCollectionDashboard(
  store: LoanDemoData,
  coll: CollectionDemoData,
  meetingDate: string,
  branchId: string,
): CollectionDashboard {
  const sheet = buildDemoSheet({ store, meetingDate, branchId, allocationOrder: 'overdue_first' });

  const collectedByMember = new Map<string, number>();
  let collectedTotal = 0;
  let entriesCount = 0;
  for (const e of coll.entries.filter((x) => x.meetingDate === meetingDate && x.branchId === branchId)) {
    const t = num(e.loanPaid) + num(e.savingsPaid) + num(e.extraPaid);
    collectedByMember.set(e.memberId, (collectedByMember.get(e.memberId) ?? 0) + t);
    collectedTotal += t;
    entriesCount += 1;
  }

  // "Expected" is the pre-collection demand: what the sheet shows now plus
  // what today's entries already collected for that member (postings shrink
  // the live dues, so the rollup reconstructs the opening expectation).
  const expectedFor = (memberId: string, totalDue: string) =>
    num(totalDue) + (collectedByMember.get(memberId) ?? 0);

  const samityMap = new Map<string, SamityCollectionRollup>();
  for (const r of sheet.rows) {
    const key = r.samityId ?? 'none';
    const cur = samityMap.get(key) ?? {
      samityId: key,
      samityName: r.samityName ?? 'অবিন্যস্ত / Unassigned',
      officerId: sheet.officerId,
      expected: '0.00',
      collected: '0.00',
      membersPresent: 0,
      membersTotal: 0,
    };
    cur.expected = money(num(cur.expected) + expectedFor(r.memberId, r.totalDue));
    const c = collectedByMember.get(r.memberId) ?? 0;
    cur.collected = money(num(cur.collected) + c);
    cur.membersTotal += 1;
    if (c > 0) cur.membersPresent += 1;
    samityMap.set(key, cur);
  }

  const expectedTotal = sheet.rows.reduce((s, r) => s + expectedFor(r.memberId, r.totalDue), 0);

  // Officer rollup: one bucket per officer who owns meetings or posted today.
  const byOfficer = [
    { officerId: DEMO_AUTH_USER_ID, officerName: 'Demo Admin (কেন্দ্র পরিচালক)' },
    { officerId: DEMO_OFFICER_ID, officerName: DEMO_OFFICER_NAME },
  ]
    .map((o) => {
      const officerEntries = coll.entries.filter(
        (x) => x.meetingDate === meetingDate && x.branchId === branchId && x.collectedBy === o.officerId,
      );
      const c = officerEntries.reduce((s, e) => s + num(e.loanPaid) + num(e.savingsPaid) + num(e.extraPaid), 0);
      return {
        officerId: o.officerId,
        officerName: o.officerName,
        expected: money(expectedTotal),
        collected: money(c),
        entriesCount: officerEntries.length,
        collectionRate: expectedTotal > 0 ? c / expectedTotal : 0,
      };
    });

  return {
    meetingDate,
    branchId,
    generatedAt: new Date().toISOString(),
    totals: {
      expected: money(expectedTotal),
      collected: money(collectedTotal),
      entriesCount,
      collectionRate: expectedTotal > 0 ? collectedTotal / expectedTotal : 0,
    },
    byOfficer,
    bySamity: [...samityMap.values()],
  };
}
