/**
 * ── Delinquency recovery store ops (requirements 5–9) ────────────────────────
 * Root-cause tags, waivers, savings adjustments, legal notices, write-off
 * proposals with approval chain + later recovery, provision proposals,
 * early-warning scans, and heatmap/trend read models. Preview/test only —
 * the Supabase path uses migration 0026.
 */
import { randomUUID } from 'node:crypto';
import {
  attendanceFalling,
  countConsecutiveMissed,
  renderLegalNoticeBn,
  type EarlyWarningSignal,
  type HeatmapResponse,
  type LegalNoticeDoc,
  type LoanWaiver,
  type ProvisionProposal,
  type RootCauseTag,
  type SavingsAdjustmentResult,
  type TrendResponse,
  type WaiverCreateInput,
  type WriteOffProposal,
  type WriteOffProposalInput,
  type WriteOffRecoveryInput,
  type SavingsAdjustmentInput,
} from '@samity/shared';
import {
  delinquencyDemoStore,
  DEMO_OFFICER_ID,
  DEMO_OFFICER_NAME,
  listClassifiedLoans,
  latestRun,
  type DelinquencyDemoData,
} from './delinquency-store.js';
import type { LoanDemoData } from './loan-store.js';
import { demoBranchName, demoMemberName } from './loan-store.js';
import { postDemoTx, savingsDemoStore, SavingsDemoError } from './savings-store.js';

const num = (v: string | undefined | null) => Number(v ?? '0');
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const todayStr = () => new Date().toISOString().slice(0, 10);

export class RecoveryDemoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Recovery state hangs off the delinquency demo data (single lifecycle). */
interface RecoveryState {
  rootCauses: RootCauseTag[];
  waivers: LoanWaiver[];
  savingsAdjustments: SavingsAdjustmentResult[];
  legalNotices: LegalNoticeDoc[];
  writeOffProposals: WriteOffProposal[];
  provisionProposals: ProvisionProposal[];
  earlyWarnings: EarlyWarningSignal[];
  scans: Array<{ id: string; scanDate: string; signals: number }>;
}

const globalRef = globalThis as unknown as { __recoveryDemoData?: RecoveryState };

export function recoveryDemoStore(): RecoveryState {
  globalRef.__recoveryDemoData ??= {
    rootCauses: [],
    waivers: [],
    savingsAdjustments: [],
    legalNotices: [],
    writeOffProposals: [],
    provisionProposals: [],
    earlyWarnings: [],
    scans: [],
  };
  return globalRef.__recoveryDemoData;
}

export function resetRecoveryDemoStore(): void {
  globalRef.__recoveryDemoData = undefined;
}

/** The disbursed record + member identity for a loan, or 404. */
function loanContext(store: LoanDemoData, loanId: string) {
  const app = store.applications.find((a) => a.id === loanId);
  if (!app) throw new RecoveryDemoError(404, 'NOT_FOUND', 'Loan application not found');
  const rec = store.disbursements.find((d) => d.applicationId === loanId && !d.cancelledAt && d.schedule.rows.length > 0);
  if (!rec) throw new RecoveryDemoError(409, 'INVALID_STATUS', 'Loan has no active disbursement');
  return { app, rec };
}

/** Outstanding + overdue from the stored schedule. */
function loanAmounts(rec: { schedule: { rows: Array<{ total: string; paidAmount?: string; principal: string; interest: string; dueDate: string }> } }) {
  const today = todayStr();
  let outstanding = 0;
  let overdueInterest = 0;
  let overdueTotal = 0;
  for (const r of rec.schedule.rows) {
    const left = Math.max(num(r.total) - num(r.paidAmount), 0);
    outstanding += left;
    if (r.dueDate < today && left > 0) {
      overdueTotal += left;
      overdueInterest += (num(r.interest) * left) / num(r.total);
    }
  }
  return { outstanding: money(outstanding), overdueTotal: money(overdueTotal), overdueInterest: money(overdueInterest) };
}

// ── 5) Root-cause tagging ───────────────────────────────────────────────────
export function tagDemoRootCause(
  store: LoanDemoData,
  input: { loanId: string; cause: RootCauseTag['cause']; note?: string },
  createdBy: string | null,
): RootCauseTag {
  const { app } = loanContext(store, input.loanId);
  const tag: RootCauseTag = {
    id: randomUUID(),
    loanId: input.loanId,
    loanNumber: null,
    cause: input.cause,
    note: input.note ?? null,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  recoveryDemoStore().rootCauses.push(tag);
  void app;
  return tag;
}

export function listDemoRootCauses(loanId?: string): RootCauseTag[] {
  const all = recoveryDemoStore().rootCauses;
  return loanId ? all.filter((t) => t.loanId === loanId) : all;
}

// ── 6) Partial waiver (BM requests → AM/admin approves) ─────────────────────
export function createDemoWaiver(
  store: LoanDemoData,
  input: WaiverCreateInput,
  requestedBy: string | null,
): LoanWaiver {
  const { rec } = loanContext(store, input.loanId);
  const amounts = loanAmounts(rec);
  if (num(amounts.overdueTotal) <= 0) {
    throw new RecoveryDemoError(409, 'ALREADY_PAID', 'Nothing overdue to waive');
  }
  const base = input.basis === 'overdue_interest' ? amounts.overdueInterest : amounts.overdueTotal;
  const waived = money((num(base) * input.percent) / 100);
  const w: LoanWaiver = {
    id: randomUUID(),
    loanId: input.loanId,
    loanNumber: null,
    memberName: demoMemberName(rec.memberId),
    basis: input.basis,
    percent: input.percent,
    waivedAmount: waived,
    reason: input.reason,
    status: 'pending',
    requestedBy,
    requestedAt: new Date().toISOString(),
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
  };
  recoveryDemoStore().waivers.push(w);
  return w;
}

export function decideDemoWaiver(
  store: LoanDemoData,
  id: string,
  decision: 'approved' | 'rejected',
  decidedBy: string | null,
  decisionNote: string | null,
): LoanWaiver {
  const w = recoveryDemoStore().waivers.find((x) => x.id === id);
  if (!w) throw new RecoveryDemoError(404, 'NOT_FOUND', 'Waiver not found');
  if (w.status !== 'pending') throw new RecoveryDemoError(409, 'ALREADY_DECIDED', 'Waiver already decided');
  w.status = decision;
  w.decidedBy = decidedBy;
  w.decidedAt = new Date().toISOString();
  w.decisionNote = decisionNote;

  if (decision === 'approved') {
    // Apply: reduce unpaid rows proportionally up to the waived amount.
    const { rec } = loanContext(store, w.loanId);
    let left = num(w.waivedAmount);
    for (const r of rec.schedule.rows) {
      if (left <= 0) break;
      const due = num(r.total) - num(r.paidAmount);
      if (due <= 0) continue;
      const cut = Math.min(due, left);
      r.paidAmount = money(num(r.paidAmount) + cut); // waived = treated as settled
      left -= cut;
    }
    const d = delinquencyDemoStore();
    const cls = d.classifications.get(w.loanId);
    if (cls) cls.outstanding = money(Math.max(num(cls.outstanding) - num(w.waivedAmount), 0));
  }
  return w;
}

// ── 6) Adjustment against savings ───────────────────────────────────────────
export function adjustDemoFromSavings(
  store: LoanDemoData,
  input: SavingsAdjustmentInput,
  createdBy: string | null,
): SavingsAdjustmentResult {
  const { rec } = loanContext(store, input.loanId);
  const savings = savingsDemoStore();
  const account = savings.accounts.find(
    (a) => a.member_id === rec.memberId && a.branch_id === rec.branchId && a.status === 'active',
  );
  if (!account) throw new RecoveryDemoError(409, 'INVALID_STATUS', 'Member has no active savings account');
  if (num(account.balance) < num(input.amount)) {
    throw new RecoveryDemoError(409, 'INSUFFICIENT_SAVINGS', 'Savings balance is lower than the adjustment amount');
  }
  try {
    postDemoTx(savings, {
      accountId: account.id,
      type: 'adjustment',
      amount: input.amount,
      reference: `loan-adjust:${input.loanId.slice(0, 8)}`,
      note: input.note ?? 'ঋণ পরিশোধে সঞ্চয় সমন্বয় / Loan offset from savings',
      userId: createdBy,
    });
  } catch (err) {
    if (err instanceof SavingsDemoError) {
      throw new RecoveryDemoError(err.status, err.code as never, err.message);
    }
    throw err;
  }

  // Apply the same amount to the oldest unpaid rows.
  let left = num(input.amount);
  for (const r of rec.schedule.rows) {
    if (left <= 0) break;
    const due = num(r.total) - num(r.paidAmount);
    if (due <= 0) continue;
    const cut = Math.min(due, left);
    r.paidAmount = money(num(r.paidAmount) + cut);
    left -= cut;
  }

  // Journal: Dr Member Savings Deposits (2100) / Cr Loan Portfolio (1200).
  store.journals.push({
    entryDate: todayStr(),
    sourceType: 'savings',
    sourceId: input.loanId,
    memo: `Savings adjustment on loan ${input.loanId.slice(0, 8)}`,
    lines: [
      { accountCode: '2100', accountName: 'Member Savings Deposits', debit: input.amount, credit: '0.00' },
      { accountCode: '1200', accountName: 'Loan Portfolio', debit: '0.00', credit: input.amount },
    ],
  });

  const result: SavingsAdjustmentResult = {
    id: randomUUID(),
    loanId: input.loanId,
    loanNumber: rec.loanNumber,
    amount: input.amount,
    savingsAccountId: account.id,
    balanceAfter: savingsDemoStore().accounts.find((a) => a.id === account.id)?.balance ?? null,
    journalId: null,
    createdAt: new Date().toISOString(),
  };
  recoveryDemoStore().savingsAdjustments.push(result);
  return result;
}

// ── 6) Legal notice (Bangla template) ───────────────────────────────────────
export function issueDemoLegalNotice(
  store: LoanDemoData,
  input: { loanId: string; replyWithinDays: number },
  issuedBy: string | null,
): LegalNoticeDoc {
  const { rec } = loanContext(store, input.loanId);
  const amounts = loanAmounts(rec);
  if (num(amounts.overdueTotal) <= 0) {
    throw new RecoveryDemoError(409, 'ALREADY_PAID', 'Nothing overdue — a legal notice is not applicable');
  }
  const doc: LegalNoticeDoc = {
    loanId: input.loanId,
    loanNumber: rec.loanNumber,
    memberName: rec.memberName || demoMemberName(rec.memberId),
    memberAddress: null,
    branchName: demoBranchName(rec.branchId),
    issuedOn: todayStr(),
    replyWithinDays: input.replyWithinDays,
    overdueTotal: amounts.overdueTotal,
    outstanding: amounts.outstanding,
    bodyBn: renderLegalNoticeBn({
      orgName: 'সমিটি ডেমো সমবায় সমিতি',
      branchName: demoBranchName(rec.branchId),
      memberName: rec.memberName || demoMemberName(rec.memberId),
      memberAddress: null,
      loanNumber: rec.loanNumber,
      overdueTotal: amounts.overdueTotal,
      outstanding: amounts.outstanding,
      issuedOn: todayStr(),
      replyWithinDays: input.replyWithinDays,
    }),
  };
  recoveryDemoStore().legalNotices.push(doc);
  void issuedBy;
  return doc;
}

// ── 6) Write-off proposal with approval chain + later recovery ──────────────
export function createDemoWriteOffProposal(
  store: LoanDemoData,
  input: WriteOffProposalInput,
  requestedBy: string | null,
): WriteOffProposal {
  const { rec } = loanContext(store, input.loanId);
  const amounts = loanAmounts(rec);
  if (num(amounts.outstanding) <= 0) {
    throw new RecoveryDemoError(409, 'ALREADY_PAID', 'Nothing outstanding — write-off is not applicable');
  }
  const p: WriteOffProposal = {
    id: randomUUID(),
    loanId: input.loanId,
    loanNumber: rec.loanNumber,
    memberName: rec.memberName || demoMemberName(rec.memberId),
    outstandingAmount: amounts.outstanding,
    reason: input.reason,
    legalActionTaken: input.legalActionTaken ?? null,
    status: 'pending',
    requestedBy,
    requestedAt: new Date().toISOString(),
    recommendedBy: null,
    recommendedAt: null,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    recoveredAmount: '0.00',
    recoveries: [],
  };
  recoveryDemoStore().writeOffProposals.push(p);
  return p;
}

export function decideDemoWriteOffProposal(
  store: LoanDemoData,
  id: string,
  decision: 'recommended' | 'approved' | 'rejected',
  decidedBy: string | null,
  decisionNote: string | null,
): WriteOffProposal {
  const p = recoveryDemoStore().writeOffProposals.find((x) => x.id === id);
  if (!p) throw new RecoveryDemoError(404, 'NOT_FOUND', 'Write-off proposal not found');
  if (p.status === 'approved' || p.status === 'rejected') {
    throw new RecoveryDemoError(409, 'ALREADY_DECIDED', 'Proposal already finally decided');
  }
  if (decision === 'recommended') {
    if (p.status !== 'pending') throw new RecoveryDemoError(409, 'INVALID_STATUS', 'Already recommended');
    p.status = 'recommended';
    p.recommendedBy = decidedBy;
    p.recommendedAt = new Date().toISOString();
    return p;
  }
  if (p.status !== 'recommended') {
    throw new RecoveryDemoError(409, 'INVALID_STATUS', 'Approval requires a prior recommendation');
  }
  p.status = decision;
  p.decidedBy = decidedBy;
  p.decidedAt = new Date().toISOString();
  p.decisionNote = decisionNote;

  if (decision === 'approved') {
    // Zero the schedule and mark the application written_off.
    const app = store.applications.find((a) => a.id === p.loanId);
    if (app) app.status = 'written_off';
    const rec = store.disbursements.find((d) => d.applicationId === p.loanId && !d.cancelledAt);
    if (rec) {
      for (const r of rec.schedule.rows) {
        if (num(r.paidAmount) < num(r.total)) {
          r.paidAmount = r.total;
          r.paidAt = new Date().toISOString();
        }
      }
    }
    store.journals.push({
      entryDate: todayStr(),
      sourceType: 'collection',
      sourceId: p.loanId,
      memo: `Write-off approved ${p.loanNumber ?? ''} — ${p.reason.slice(0, 60)}`,
      lines: [
        { accountCode: '6200', accountName: 'Loan Write-off Expense', debit: p.outstandingAmount, credit: '0.00' },
        { accountCode: '1200', accountName: 'Loan Portfolio', debit: '0.00', credit: p.outstandingAmount },
      ],
    });
  }
  return p;
}

export function recordDemoWriteOffRecovery(
  store: LoanDemoData,
  proposalId: string,
  input: WriteOffRecoveryInput,
  receivedBy: string | null,
): WriteOffProposal {
  const p = recoveryDemoStore().writeOffProposals.find((x) => x.id === proposalId);
  if (!p) throw new RecoveryDemoError(404, 'NOT_FOUND', 'Write-off proposal not found');
  if (p.status !== 'approved') {
    throw new RecoveryDemoError(409, 'INVALID_STATUS', 'Recoveries post only against an approved write-off');
  }
  if (num(p.recoveredAmount) + num(input.amount) > num(p.outstandingAmount) + 0.001) {
    throw new RecoveryDemoError(409, 'OVER_RECOVERY', 'Recovery exceeds the written-off amount');
  }
  p.recoveries.push({ id: randomUUID(), amount: input.amount, note: input.note ?? null, receivedAt: new Date().toISOString() });
  p.recoveredAmount = money(num(p.recoveredAmount) + num(input.amount));
  // Journal: Dr Cash (1010) / Cr Recovery Income (6210).
  store.journals.push({
    entryDate: todayStr(),
    sourceType: 'collection',
    sourceId: p.loanId,
    memo: `Write-off recovery ${p.loanNumber ?? ''}`,
    lines: [
      { accountCode: '1010', accountName: 'Cash in Vault', debit: input.amount, credit: '0.00' },
      { accountCode: '6210', accountName: 'Write-off Recovery Income', debit: '0.00', credit: input.amount },
    ],
  });
  void receivedBy;
  return p;
}

// ── 7) Loan-loss provision proposal + posting ───────────────────────────────
export function createDemoProvisionProposal(
  d: DelinquencyDemoData,
  input: { runDate?: string; note?: string },
  requestedBy: string | null,
): ProvisionProposal {
  const run = latestRun(d);
  if (!run) throw new RecoveryDemoError(409, 'INVALID_STATUS', 'Run the nightly classification first');
  const loans = listClassifiedLoans(d);
  const byClass = ['standard', 'substandard', 'doubtful', 'bad'].map((ac) => {
    const rows = loans.filter((l) => l.assetClass === ac);
    const outstanding = money(rows.reduce((s, l) => s + num(l.outstanding), 0));
    const pct = rows[0]?.provisionPercent ?? 0;
    return { assetClass: ac, outstanding, provisionPercent: pct, provisionAmount: money(rows.reduce((s, l) => s + num(l.provisionAmount), 0)) };
  });
  const provisionTotal = money(byClass.reduce((s, c) => s + num(c.provisionAmount), 0));
  const prior = recoveryDemoStore().provisionProposals.filter((p) => p.status === 'posted');
  const priorTotal = prior.length ? prior[prior.length - 1]!.provisionTotal : '0.00';
  const proposal: ProvisionProposal = {
    id: randomUUID(),
    runDate: input.runDate ?? run.runDate,
    byClass,
    provisionTotal,
    priorProvisionTotal: priorTotal,
    provisionExpense: money(Math.max(num(provisionTotal) - num(priorTotal), 0)),
    status: 'pending_approval',
    note: input.note ?? null,
    requestedBy,
    requestedAt: new Date().toISOString(),
    postedAt: null,
    journalPreview: [
      { accountCode: '7100', accountName: 'Loan Loss Provision Expense', debit: money(Math.max(num(provisionTotal) - num(priorTotal), 0)), credit: '0.00' },
      { accountCode: '1300', accountName: 'Loan Loss Provision Reserve', debit: '0.00', credit: money(Math.max(num(provisionTotal) - num(priorTotal), 0)) },
    ],
  };
  recoveryDemoStore().provisionProposals.push(proposal);
  return proposal;
}

export function postDemoProvisionProposal(
  store: LoanDemoData,
  id: string,
  postedBy: string | null,
): ProvisionProposal {
  const p = recoveryDemoStore().provisionProposals.find((x) => x.id === id);
  if (!p) throw new RecoveryDemoError(404, 'NOT_FOUND', 'Provision proposal not found');
  if (p.status === 'posted') throw new RecoveryDemoError(409, 'ALREADY_DECIDED', 'Provision already posted');
  p.status = 'posted';
  p.postedAt = new Date().toISOString();
  if (num(p.provisionExpense) > 0) {
    store.journals.push({
      entryDate: todayStr(),
      sourceType: 'collection',
      sourceId: p.id,
      memo: `Loan loss provision ${p.runDate}`,
      lines: p.journalPreview,
    });
  }
  void postedBy;
  return p;
}

// ── 8) Early-warning scan ───────────────────────────────────────────────────
export function runDemoEarlyWarningScan(
  store: LoanDemoData,
  d: DelinquencyDemoData,
): EarlyWarningSignal[] {
  const rec = recoveryDemoStore();
  const today = todayStr();
  const signals: EarlyWarningSignal[] = [];
  const detectedAt = new Date().toISOString();

  // (a) Members with ≥2 consecutive missed installments.
  for (const app of store.applications.filter((a) => a.status === 'disbursed')) {
    const disbursement = store.disbursements.find((x) => x.applicationId === app.id && !x.cancelledAt);
    if (!disbursement) continue;
    const missed = countConsecutiveMissed(
      disbursement.schedule.rows.map((r) => ({ seq: r.seq, dueDate: r.dueDate, total: r.total, paidAmount: r.paidAmount })),
      today,
    );
    if (missed >= 2) {
      const memberName = disbursement.memberName || demoMemberName(app.memberId);
      signals.push({
        id: randomUUID(),
        kind: 'member_missed_two',
        severity: missed >= 3 ? 'high' : 'medium',
        refId: app.memberId,
        refName: memberName,
        branchId: app.branchId,
        detail: `${missed} consecutive missed installments`,
        detailBn: `টানা ${missed} কিস্তি বকেয়া`,
        metric: missed,
        priorMetric: null,
        detectedAt,
        acknowledged: false,
      });
    }
  }

  // (b) Samities with falling attendance (demo synthesizes meeting history).
  for (const [samityId, samityName] of Object.entries({
    '00000000-0000-4000-8000-0000000000s1': 'Dhaka Central Samity',
    '00000000-0000-4000-8000-0000000000s2': 'Mymensingh Sadar Samity',
  })) {
    const branchLoans = listClassifiedLoans(d).filter((l) => l.samityId === samityId);
    const base = branchLoans.length > 0 ? 0.82 : 0.9;
    // Synthetic weekly attendance with a mild downward drift for demo signal 2.
    const rates = [0.9, 0.88, 0.85, 0.8].map((r, i) => Math.min(1, r - (branchLoans.length > 0 ? i * 0.02 : 0)));
    const verdict = attendanceFalling(rates);
    if (verdict.falling) {
      signals.push({
        id: randomUUID(),
        kind: 'samity_attendance_falling',
        severity: verdict.drop > 0.2 ? 'high' : 'medium',
        refId: samityId,
        refName: samityName,
        branchId: branchLoans[0]?.branchId ?? null,
        detail: `Attendance dropped ${(verdict.drop * 100).toFixed(0)} points over recent meetings (base ${base})`,
        detailBn: 'সাম্প্রতিক মিটিংয়ে উপস্থিতি উল্লেখযোগ্যভাবে কমেছে',
        metric: rates[rates.length - 1] ?? 0,
        priorMetric: rates[0] ?? null,
        detectedAt,
        acknowledged: false,
      });
    }
  }

  // (c) Officers with rising PAR (current vs previous run).
  const runs = d.runs;
  if (runs.length >= 2) {
    const current = listClassifiedLoans(d);
    const officerIds = new Set(current.map((l) => l.officerId ?? DEMO_OFFICER_ID));
    for (const officerId of officerIds) {
      const par = (ls: typeof current) => {
        const mine = ls.filter((l) => (l.officerId ?? DEMO_OFFICER_ID) === officerId);
        const total = mine.reduce((s, l) => s + num(l.outstanding), 0);
        const risk = mine.filter((l) => l.daysPastDue > 0).reduce((s, l) => s + num(l.outstanding), 0);
        return total > 0 ? risk / total : 0;
      };
      const now = par(current);
      // Prior run's snapshot is approximated from the previous run's totals.
      const prior = runs[runs.length - 2]!;
      const priorPar =
        num(prior.outstandingTotal) > 0 ? num(prior.atRiskTotal) / num(prior.outstandingTotal) : 0;
      if (now > priorPar + 0.02) {
        signals.push({
          id: randomUUID(),
          kind: 'officer_par_rising',
          severity: now - priorPar > 0.1 ? 'high' : 'medium',
          refId: officerId,
          refName: officerId === DEMO_OFFICER_ID ? DEMO_OFFICER_NAME : 'Demo Admin (কেন্দ্র পরিচালক)',
          branchId: null,
          detail: `Officer PAR rose from ${(priorPar * 100).toFixed(1)}% to ${(now * 100).toFixed(1)}%`,
          detailBn: 'অফিসারের ঝুঁকিপূর্ণ ঋণের অনুপাত বেড়েছে',
          metric: now,
          priorMetric: priorPar,
          detectedAt,
          acknowledged: false,
        });
      }
    }
  }

  // Dedupe against unacknowledged signals of the same kind+ref today.
  const seen = new Set(
    rec.earlyWarnings.filter((w) => !w.acknowledged).map((w) => `${w.kind}:${w.refId}`),
  );
  const fresh = signals.filter((s) => !seen.has(`${s.kind}:${s.refId}`));
  rec.earlyWarnings.push(...fresh);
  rec.scans.push({ id: randomUUID(), scanDate: today, signals: fresh.length });
  return fresh;
}

export function listDemoEarlyWarnings(kind?: string, acknowledged?: boolean): EarlyWarningSignal[] {
  const all = recoveryDemoStore().earlyWarnings;
  return all.filter(
    (w) => (kind ? w.kind === kind : true) && (acknowledged === undefined ? true : w.acknowledged === acknowledged),
  );
}

export function acknowledgeDemoEarlyWarning(id: string, by: string | null): EarlyWarningSignal {
  const w = recoveryDemoStore().earlyWarnings.find((x) => x.id === id);
  if (!w) throw new RecoveryDemoError(404, 'NOT_FOUND', 'Signal not found');
  w.acknowledged = true;
  void by;
  return w;
}

// ── 9) Heatmap + trend read models ──────────────────────────────────────────
export function demoHeatmap(d: DelinquencyDemoData): HeatmapResponse {
  const loans = listClassifiedLoans(d);
  const buckets = ['regular', 'd1_30', 'd31_90', 'd91_180', 'd180_plus'];
  const map = new Map<string, { branchId: string; branchName: string; officerId: string | null; officerName: string | null; bucket: string; value: number; loans: number }>();
  for (const l of loans) {
    const key = `${l.branchId}:${l.bucket}`;
    const cur = map.get(key) ?? {
      branchId: l.branchId,
      branchName: demoBranchName(l.branchId),
      officerId: l.officerId,
      officerName: l.officerId === DEMO_OFFICER_ID ? DEMO_OFFICER_NAME : 'Demo Admin',
      bucket: l.bucket,
      value: 0,
      loans: 0,
    };
    cur.value += num(l.outstanding);
    cur.loans += 1;
    map.set(key, cur);
  }
  const cells = [...map.values()].map((c) => ({
    ...c,
    value: money(c.value),
    loans: c.loans,
  }));
  const max = money(Math.max(...cells.map((c) => num(c.value)), 0));
  return { cells, max, buckets };
}

export function demoTrend(d: DelinquencyDemoData): TrendResponse {
  const points = d.runs.map((r) => ({
    runDate: r.runDate,
    par1: num(r.outstandingTotal) > 0 ? num(r.atRiskTotal) / num(r.outstandingTotal) : 0,
    par30: 0,
    par90: 0,
    outstanding: r.outstandingTotal,
    atRisk: r.atRiskTotal,
    provision: r.provisionTotal,
  }));
  return { points };
}
