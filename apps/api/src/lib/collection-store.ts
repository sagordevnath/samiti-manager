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
  rowTotalDue,
  type AllocationOrder,
  type CashHandover,
  type CashSummary,
  type CollectionAllocation,
  type CollectionEntryInput,
  type CollectionEntryResponse,
  type CollectionReceipt,
  type CollectionSheet,
  type CollectionSheetRow,
  type CollectionSyncInput,
  type CollectionSyncResult,
  type JournalEntryDraft,
} from '@samity/shared';
import { LoanDemoError, type LoanDemoData } from './loan-store.js';
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
    createdAt: string;
  }>;
  handovers: CashHandover[];
  receiptSeq: Record<string, number>;
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
    public code: string,
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

  const app = store.applications.find((a) => a.memberId === input.memberId && ['approved', 'disbursed'].includes(a.status));
  const branchId = app?.branchId ?? BRANCH_DHAKA;
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
      if (err instanceof SavingsDemoError) throw new CollectionDemoError(err.status, err.code, err.message);
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
    createdAt: now,
  };
  coll.entries.push(entry);

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
