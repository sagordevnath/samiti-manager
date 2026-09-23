/**
 * ── Delinquency demo store ───────────────────────────────────────────────────
 * Nightly classification over the loan store's disbursed schedules, PAR
 * rollups at every org level, escalating worklist cases, and follow-ups with
 * reminder tasks. Preview/test only — the Supabase path uses migration 0024.
 */
import { randomUUID } from 'node:crypto';
import {
  assetClassForDpd,
  bucketForDaysPastDue,
  computePar,
  provisionPercentFor,
  worklistLevelFor,
  type AssetClass,
  type ClassifiedLoan,
  type DelinquencyBucket,
  type DelinquencyFollowUp,
  type DelinquencySettings,
  type DelinquencyTask,
  type DelinquencySettingsPatch,
  type FollowUpCreateInput,
  type ParMetrics,
  type WorklistItem,
  type WorklistLevel,
  DELINQUENCY_SETTINGS_DEFAULTS,
} from '@samity/shared';
import type { LoanDemoData } from './loan-store.js';
import { demoMemberName, demoSamityName } from './loan-store.js';

const num = (v: string | undefined | null) => Number(v ?? '0');
const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const todayStr = () => new Date().toISOString().slice(0, 10);

export const DEMO_OFFICER_ID = '00000000-0000-4000-8000-0000000002a1';
export const DEMO_OFFICER_NAME = 'Md. Kamrul Hasan (অফিসার)';
export const DEMO_BM_ID = '00000000-0000-4000-8000-0000000002b1';
export const DEMO_BM_NAME = 'শাখা ব্যবস্থাপক (Branch Manager)';
export const DEMO_AM_ID = '00000000-0000-4000-8000-0000000002c1';
export const DEMO_AM_NAME = 'এলাকা ব্যবস্থাপক (Area Manager)';

export class DelinquencyDemoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface DelinquencyDemoData {
  orgId: string;
  settings: DelinquencySettings;
  runs: Array<{
    id: string;
    runDate: string;
    loansTotal: number;
    loansRisk: number;
    outstandingTotal: string;
    atRiskTotal: string;
    provisionTotal: string;
  }>;
  /** applicationId → latest classification (the "current" nightly view). */
  classifications: Map<string, ClassifiedLoan>;
  cases: DelinquencyCase[];
  followUps: DelinquencyFollowUp[];
  tasks: DelinquencyTask[];
}

interface DelinquencyCase {
  id: string;
  applicationId: string;
  branchId: string;
  samityId: string | null;
  officerId: string | null;
  daysPastDue: number;
  bucket: DelinquencyBucket;
  overdueTotal: string;
  outstanding: string;
  assignedLevel: WorklistLevel;
  assignedTo: string | null;
  status: 'open' | 'cleared' | 'written_off';
  openedAt: string;
  clearedAt: string | null;
}

let store: DelinquencyDemoData | null = null;

export function delinquencyDemoStore(): DelinquencyDemoData {
  if (!store) store = buildStore();
  return store;
}

export function resetDelinquencyDemoStore(): void {
  store = null;
}

function buildStore(): DelinquencyDemoData {
  return {
    orgId: '00000000-0000-4000-8000-0000000000aa',
    settings: structuredClone(DELINQUENCY_SETTINGS_DEFAULTS) as DelinquencySettings,
    runs: [],
    classifications: new Map(),
    cases: [],
    followUps: [],
    tasks: [],
  };
}

/** Officer display names for worklist assignment. */
function officerName(id: string | null): string | null {
  if (!id) return null;
  if (id === DEMO_OFFICER_ID) return DEMO_OFFICER_NAME;
  if (id === DEMO_BM_ID) return DEMO_BM_NAME;
  if (id === DEMO_AM_ID) return DEMO_AM_NAME;
  return 'Demo Admin (কেন্দ্র পরিচালক)';
}

/** The demo officer who owns every Dhaka samity. */
function officerForBranch(branchId: string): string {
  return DEMO_OFFICER_ID;
}

// ── 1) Nightly classification run ───────────────────────────────────────────
export function runNightlyClassification(loanStore: LoanDemoData, runDate = todayStr()) {
  const d = delinquencyDemoStore();
  const settings = d.settings;
  const today = Date.parse(`${runDate}T00:00:00Z`);
  const classifications: ClassifiedLoan[] = [];

  for (const rec of loanStore.disbursements) {
    if (rec.cancelledAt) continue;
    const app = loanStore.applications.find((a) => a.id === rec.applicationId);
    if (!app || app.status !== 'disbursed') continue;

    const rows = rec.schedule.rows;
    const unpaid = rows.filter((r) => num(r.paidAmount) < num(r.total));
    const outstanding = unpaid.reduce((s, r) => s + (num(r.total) - num(r.paidAmount)), 0);

    // Days past due from the OLDEST unpaid installment (0 when none are past).
    let dpd = 0;
    let oldestUnpaidDue: string | null = null;
    let overduePrincipal = 0;
    let overdueInterest = 0;
    for (const r of unpaid) {
      const dd = Date.parse(`${r.dueDate}T00:00:00Z`);
      if (dd < today) {
        const late = Math.floor((today - dd) / 86_400_000);
        if (late > dpd) dpd = late;
        if (!oldestUnpaidDue || r.dueDate < oldestUnpaidDue) oldestUnpaidDue = r.dueDate;
        // Overdue splits pro-rata by the row's principal/interest mix.
        const rowOutstanding = num(r.total) - num(r.paidAmount);
        const share = num(r.total) > 0 ? rowOutstanding / num(r.total) : 0;
        overduePrincipal += num(r.principal) * share;
        overdueInterest += num(r.interest) * share;
      }
    }

    const bucket = bucketForDaysPastDue(dpd, settings);
    const assetClass = assetClassForDpd(dpd, settings);
    const pct = provisionPercentFor(assetClass, settings);
    const memberCode =
      rec.memberCode ||
      // The demo disbursement record already carries memberCode.
      '—';

    classifications.push({
      applicationId: rec.applicationId,
      loanNumber: rec.loanNumber,
      memberId: rec.memberId,
      memberName: rec.memberName || demoMemberName(rec.memberId),
      memberCode,
      branchId: rec.branchId,
      samityId: rec.samityId,
      officerId: DEMO_OFFICER_ID,
      productName: rec.productName,
      disbursedOn: rec.disbursementDate,
      outstanding: money(outstanding),
      overduePrincipal: money(overduePrincipal),
      overdueInterest: money(overdueInterest),
      overdueTotal: money(overduePrincipal + overdueInterest),
      daysPastDue: dpd,
      bucket,
      assetClass,
      provisionPercent: pct,
      provisionAmount: money((outstanding * pct) / 100),
      oldestUnpaidDueDate: oldestUnpaidDue,
    });
  }

  // Persist the run + swap the classification map.
  const run = {
    id: randomUUID(),
    runDate,
    loansTotal: classifications.length,
    loansRisk: classifications.filter((c) => c.daysPastDue > 0).length,
    outstandingTotal: money(classifications.reduce((s, c) => s + num(c.outstanding), 0)),
    atRiskTotal: money(classifications.filter((c) => c.daysPastDue > 0).reduce((s, c) => s + num(c.outstanding), 0)),
    provisionTotal: money(classifications.reduce((s, c) => s + num(c.provisionAmount), 0)),
  };
  d.runs.push(run);
  d.classifications = new Map(classifications.map((c) => [c.applicationId, c]));

  // ── 3) Reconcile worklist cases (open/refresh/close) ────────────────────
  reconcileCases(d, classifications, settings);
  return { run, classifications };
}

function reconcileCases(
  d: DelinquencyDemoData,
  classifications: ClassifiedLoan[],
  settings: DelinquencySettings,
): void {
  for (const c of classifications) {
    if (c.daysPastDue <= 0) {
      // Cleared: any open case closes.
      const open = d.cases.find((x) => x.applicationId === c.applicationId && x.status === 'open');
      if (open) {
        open.status = 'cleared';
        open.clearedAt = todayStr();
      }
      continue;
    }
    const level = worklistLevelFor(c.daysPastDue, settings);
    const assignedTo = level === 'field_officer' ? (c.officerId ?? DEMO_OFFICER_ID) : level === 'branch_manager' ? DEMO_BM_ID : DEMO_AM_ID;
    const existing = d.cases.find((x) => x.applicationId === c.applicationId && x.status === 'open');
    if (existing) {
      existing.daysPastDue = c.daysPastDue;
      existing.bucket = c.bucket;
      existing.overdueTotal = c.overdueTotal;
      existing.outstanding = c.outstanding;
      // Escalation only ratchets up; de-escalation is manual.
      if (rankLevel(level) > rankLevel(existing.assignedLevel)) {
        existing.assignedLevel = level;
        existing.assignedTo = assignedTo;
      }
    } else {
      d.cases.push({
        id: randomUUID(),
        applicationId: c.applicationId,
        branchId: c.branchId,
        samityId: c.samityId,
        officerId: c.officerId,
        daysPastDue: c.daysPastDue,
        bucket: c.bucket,
        overdueTotal: c.overdueTotal,
        outstanding: c.outstanding,
        assignedLevel: level,
        assignedTo,
        status: 'open',
        openedAt: todayStr(),
        clearedAt: null,
      });
    }
  }
}

function rankLevel(l: WorklistLevel): number {
  return l === 'field_officer' ? 0 : l === 'branch_manager' ? 1 : 2;
}

// ── Read models ─────────────────────────────────────────────────────────────
export function latestRun(d: DelinquencyDemoData) {
  return d.runs[d.runs.length - 1] ?? null;
}

export function listClassifiedLoans(d: DelinquencyDemoData): ClassifiedLoan[] {
  return [...d.classifications.values()];
}

/** 2) PAR at every org node from the current classifications. */
export function parByScope(
  d: DelinquencyDemoData,
  loanStore: LoanDemoData,
  scope: ParMetrics['scope'],
): ParMetrics[] {
  const loans = listClassifiedLoans(d);
  if (scope === 'org') {
    return [computePar('org', d.orgId, 'সমিটি ডেমো সমবায় সমিতি', loans)];
  }
  const nodes = new Map<string, string>();
  if (scope === 'officer') {
    for (const l of loans) nodes.set(l.officerId ?? 'none', officerName(l.officerId) ?? 'Unassigned');
  } else if (scope === 'samity') {
    for (const l of loans) nodes.set(l.samityId ?? 'none', demoSamityName(l.samityId) ?? 'অবিন্যস্ত');
  } else {
    // branch/area/zone come from the org store hierarchy; demo has one zone/area per branch.
    const areaOfBranch: Record<string, string> = {
      '00000000-0000-4000-8000-0000000000b1': 'Dhaka Central Area',
      '00000000-0000-4000-8000-0000000000b2': 'Mymensingh Sadar Area',
    };
    const zoneOfBranch: Record<string, string> = {
      '00000000-0000-4000-8000-0000000000b1': 'Dhaka Zone',
      '00000000-0000-4000-8000-0000000000b2': 'Mymensingh Zone',
    };
    for (const l of loans) {
      if (scope === 'branch') nodes.set(l.branchId, l.branchId === '00000000-0000-4000-8000-0000000000b1' ? 'Dhanmondi Branch' : 'Mymensingh Sadar Branch');
      if (scope === 'area') nodes.set(areaOfBranch[l.branchId] ?? 'unknown', areaOfBranch[l.branchId] ?? 'Unknown Area');
      if (scope === 'zone') nodes.set(zoneOfBranch[l.branchId] ?? 'unknown', zoneOfBranch[l.branchId] ?? 'Unknown Zone');
    }
  }
  return [...nodes.entries()].map(([id, name]) =>
    computePar(scope, id, name, loans.filter((l) => keyFor(l, scope) === id)),
  );
}

function keyFor(l: ClassifiedLoan, scope: ParMetrics['scope']): string {
  switch (scope) {
    case 'officer': return l.officerId ?? 'none';
    case 'samity': return l.samityId ?? 'none';
    case 'branch': return l.branchId;
    case 'area': return l.branchId === '00000000-0000-4000-8000-0000000000b2' ? 'Mymensingh Sadar Area' : 'Dhaka Central Area';
    case 'zone': return l.branchId === '00000000-0000-4000-8000-0000000000b2' ? 'Mymensingh Zone' : 'Dhaka Zone';
    default: return d_org();
  }
}
function d_org(): string {
  return delinquencyDemoStore().orgId;
}

/** 2) Loans for a branch drill-down. */
export function loansForBranch(d: DelinquencyDemoData, branchId: string): ClassifiedLoan[] {
  return listClassifiedLoans(d).filter((l) => l.branchId === branchId);
}

/** 3) Worklist with assignment + follow-up context. */
export function buildWorklist(d: DelinquencyDemoData, opts: { level?: WorklistLevel; branchId?: string } = {}): WorklistItem[] {
  const items: WorklistItem[] = [];
  for (const c of d.cases.filter((x) => x.status === 'open')) {
    if (opts.level && c.assignedLevel !== opts.level) continue;
    if (opts.branchId && c.branchId !== opts.branchId) continue;
    const cls = d.classifications.get(c.applicationId);
    const fus = d.followUps.filter((f) => f.loanId === c.applicationId);
    const last = fus[fus.length - 1];
    items.push({
      loanId: c.applicationId,
      loanNumber: cls?.loanNumber ?? null,
      memberId: cls?.memberId ?? '',
      memberName: cls?.memberName ?? '',
      memberCode: cls?.memberCode ?? '—',
      branchId: c.branchId,
      branchName: c.branchId === '00000000-0000-4000-8000-0000000000b1' ? 'Dhanmondi Branch' : 'Mymensingh Sadar Branch',
      samityId: c.samityId,
      officerId: c.officerId,
      officerName: officerName(c.officerId),
      bucket: c.bucket,
      daysPastDue: c.daysPastDue,
      overdueTotal: c.overdueTotal,
      outstanding: c.outstanding,
      assignedLevel: c.assignedLevel,
      assignedToId: c.assignedTo,
      assignedToName: officerName(c.assignedTo),
      followUpsCount: fus.length,
      lastFollowUpAt: last?.createdAt ?? null,
      lastOutcome: last?.outcome ?? null,
    });
  }
  return items.sort((a, b) => b.daysPastDue - a.daysPastDue);
}

// ── 1) Settings ─────────────────────────────────────────────────────────────
export function getDemoDelinquencySettings(d: DelinquencyDemoData): DelinquencySettings {
  return d.settings;
}

export function patchDemoDelinquencySettings(d: DelinquencyDemoData, patch: DelinquencySettingsPatch): DelinquencySettings {
  if (patch.buckets) d.settings.buckets = { ...d.settings.buckets, ...patch.buckets };
  if (patch.provisioning) d.settings.provisioning = { ...d.settings.provisioning, ...patch.provisioning };
  if (patch.assetClassByDpd) d.settings.assetClassByDpd = { ...d.settings.assetClassByDpd, ...patch.assetClassByDpd };
  if (patch.escalateToBmDays !== undefined) d.settings.escalateToBmDays = patch.escalateToBmDays;
  if (patch.escalateToAmDays !== undefined) d.settings.escalateToAmDays = patch.escalateToAmDays;
  return d.settings;
}

// ── 4) Follow-ups + reminder tasks ──────────────────────────────────────────
export function createDemoFollowUp(
  d: DelinquencyDemoData,
  input: FollowUpCreateInput,
  createdBy: string | null,
): DelinquencyFollowUp {
  const kase = d.cases.find((c) => c.applicationId === input.loanId && c.status === 'open');
  if (!kase) {
    throw new DelinquencyDemoError(404, 'NOT_FOUND', 'No open delinquency case for this loan');
  }
  if (input.outcome === 'promise_to_pay' && !input.promiseDate) {
    throw new DelinquencyDemoError(400, 'VALIDATION_ERROR', 'A promise-to-pay outcome requires promiseDate');
  }
  const cls = d.classifications.get(input.loanId);
  const f: DelinquencyFollowUp = {
    id: randomUUID(),
    loanId: input.loanId,
    loanNumber: cls?.loanNumber ?? null,
    memberName: cls?.memberName ?? '',
    type: input.type,
    outcome: input.outcome,
    promiseDate: input.promiseDate ?? null,
    promiseAmount: input.promiseAmount ?? null,
    note: input.note ?? null,
    nextVisitDate: input.nextVisitDate ?? null,
    // 4) Reminder task (Module 12): next visit, or the promise date.
    reminderTaskId: null,
    due: false,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  const reminderDue = input.nextVisitDate ?? input.promiseDate;
  if (reminderDue) {
    const task: DelinquencyTask = {
      id: randomUUID(),
      title: `Follow-up: ${f.loanNumber ?? input.loanId}`,
      titleBn: `ফলো-আপ: ${f.loanNumber ?? ''}`,
      dueDate: reminderDue,
      loanId: input.loanId,
      memberId: cls?.memberId ?? null,
      memberName: cls?.memberName ?? null,
      source: 'delinquency',
      status: 'open',
      assignedToId: kase.assignedTo,
      createdAt: new Date().toISOString(),
    };
    d.tasks.push(task);
    f.reminderTaskId = task.id;
  }
  d.followUps.push(f);
  return f;
}

export function listDemoFollowUps(d: DelinquencyDemoData, loanId?: string): DelinquencyFollowUp[] {
  return loanId ? d.followUps.filter((f) => f.loanId === loanId) : d.followUps;
}

export function listDemoTasks(d: DelinquencyDemoData, status: 'open' | 'done' = 'open'): DelinquencyTask[] {
  return d.tasks.filter((t) => t.status === status);
}

export function completeDemoTask(d: DelinquencyDemoData, taskId: string): DelinquencyTask {
  const t = d.tasks.find((x) => x.id === taskId);
  if (!t) throw new DelinquencyDemoError(404, 'NOT_FOUND', 'Task not found');
  t.status = 'done';
  return t;
}
