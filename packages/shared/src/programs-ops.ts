/**
 * ── Programs & projects operations (reqs 5–9) ────────────────────────────────
 * 5) Budget monitoring: expense entries against budget lines, utilization
 *    with an 80% alert, burn rate vs elapsed project time, donor-wise rollup.
 * 6) Field monitoring visits with checklists, photos and follow-ups.
 * 7) Donor quarterly report generator (narrative + indicator table) that
 *    exports to Word (HTML) / PDF (print).
 * 8) Sensitive case management (children, survivors): restricted fields only
 *    for case workers/admins, masked rows for everyone else, access log
 *    recorded on every open. Never included in general donor reports.
 * 9) Grant and PKSF/bank borrowing tracker: source, principal, interest and
 *    an amortized repayment schedule (flat or declining-balance EMI).
 *
 * Money is string numeric(14,2); all helpers are pure so the API, DB triggers
 * and the web UI share one implementation.
 */

import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';
import { toBanglaDigits } from './format.js';
import type { LogframeEntry, IndicatorValue, ProjectRecord, ProjectBudgetLine } from './programs.js';

/* ── 5) Budget monitoring ─────────────────────────────────────────────────── */

export interface ExpenseRecord {
  id: string;
  orgId: string;
  projectId: string;
  expenseDate: string;
  budgetLine: string;
  amount: string;
  voucherNo: string; // optional link to Module 3 accounting voucher
  description: string;
  recordedBy: string;
  createdAt: string;
}

export const projectExpenseSchema = z.object({
  projectId: uuidSchema,
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  budgetLine: z.string().trim().min(2).max(160),
  amount: moneySchema,
  voucherNo: z.string().trim().max(40).default(''),
  description: z.string().trim().max(300).default(''),
});
export type ProjectExpenseBody = z.infer<typeof projectExpenseSchema>;

/** Alert level for a budget line's utilization. */
export type BudgetAlertLevel = 'ok' | 'warning' | 'critical';

export function budgetAlertLevel(utilizationPct: number): BudgetAlertLevel {
  if (utilizationPct >= 95) return 'critical';
  if (utilizationPct >= 80) return 'warning';
  return 'ok';
}

export const BUDGET_ALERT_THRESHOLD = 80;

export interface BudgetLineStatus {
  lineItem: string;
  budgeted: string;
  spent: string;
  remaining: string;
  utilizationPct: number;
  alert: BudgetAlertLevel;
}

export interface BudgetMonitor {
  projectId: string;
  lines: BudgetLineStatus[];
  budgetTotal: string;
  spentTotal: string;
  remainingTotal: string;
  utilizationPct: number;
  alert: BudgetAlertLevel;
  hasAlert: boolean;
  unbudgetedSpent: string; // expenses that hit no declared budget line
}

/**
 * Expense vs budget per line. Unmatched budget lines are returned with zero
 * spend; expenses whose budgetLine matches no declared line are summed into
 * `unbudgetedSpent` so overspending outside the plan is visible.
 */
export function budgetMonitor(project: Pick<ProjectRecord, 'id' | 'budget'>, expenses: Pick<ExpenseRecord, 'budgetLine' | 'amount'>[]): BudgetMonitor {
  const spentByLine = new Map<string, number>();
  let unbudgeted = 0;
  for (const e of expenses) {
    const amt = Number(e.amount);
    const line = project.budget.find((b) => b.lineItem === e.budgetLine);
    if (line) spentByLine.set(e.budgetLine, (spentByLine.get(e.budgetLine) ?? 0) + amt);
    else unbudgeted += amt;
  }
  const lines: BudgetLineStatus[] = project.budget.map((b) => {
    const budgeted = Number(b.amount);
    const spent = spentByLine.get(b.lineItem) ?? 0;
    const pct = budgeted > 0 ? Number(((spent / budgeted) * 100).toFixed(1)) : spent > 0 ? 100 : 0;
    return {
      lineItem: b.lineItem,
      budgeted: budgeted.toFixed(2),
      spent: spent.toFixed(2),
      remaining: (budgeted - spent).toFixed(2),
      utilizationPct: pct,
      alert: budgetAlertLevel(pct),
    };
  });
  const budgetTotal = project.budget.reduce((s, b) => s + Number(b.amount), 0);
  const spentTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const pct = budgetTotal > 0 ? Number(((spentTotal / budgetTotal) * 100).toFixed(1)) : 0;
  return {
    projectId: project.id,
    lines,
    budgetTotal: budgetTotal.toFixed(2),
    spentTotal: spentTotal.toFixed(2),
    remainingTotal: (budgetTotal - spentTotal).toFixed(2),
    utilizationPct: pct,
    alert: budgetAlertLevel(pct),
    hasAlert: lines.some((l) => l.alert !== 'ok') || pct >= BUDGET_ALERT_THRESHOLD,
    unbudgetedSpent: unbudgeted.toFixed(2),
  };
}

export interface BurnRateStatus {
  asOf: string;
  elapsedDays: number;
  totalDays: number;
  elapsedPct: number;
  spent: string;
  budgetTotal: string;
  burnPct: number;
  expectedPct: number;
  variancePct: number;
  status: 'on_track' | 'overspent' | 'underspent';
}

/** Burn rate: cumulative spend relative to the elapsed share of project time. */
export function burnRate(
  project: Pick<ProjectRecord, 'startDate' | 'endDate' | 'budget'>,
  expenses: Pick<ExpenseRecord, 'amount' | 'expenseDate'>[],
  asOf: string,
): BurnRateStatus {
  const total = project.budget.reduce((s, b) => s + Number(b.amount), 0);
  const dayMs = 86_400_000;
  const start = Date.parse(`${project.startDate}T00:00:00Z`);
  const end = Date.parse(`${project.endDate}T00:00:00Z`);
  const now = Date.parse(`${asOf}T00:00:00Z`);
  const totalDays = Math.max(1, Math.round((end - start) / dayMs) + 1);
  const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((now - start) / dayMs) + (now >= start ? 1 : 0)));
  const elapsedPct = Number(Math.min(100, (elapsedDays / totalDays) * 100).toFixed(1));
  const spent = expenses.filter((e) => e.expenseDate <= asOf).reduce((s, e) => s + Number(e.amount), 0);
  const burnPct = total > 0 ? Number(((spent / total) * 100).toFixed(1)) : 0;
  const variancePct = Number((burnPct - elapsedPct).toFixed(1));
  return {
    asOf,
    elapsedDays,
    totalDays,
    elapsedPct,
    spent: spent.toFixed(2),
    budgetTotal: total.toFixed(2),
    burnPct,
    expectedPct: elapsedPct,
    variancePct,
    status: variancePct > 10 ? 'overspent' : variancePct < -25 ? 'underspent' : 'on_track',
  };
}

export interface DonorUtilizationRow {
  donor: string;
  projects: number;
  budgetTotal: string;
  spentTotal: string;
  utilizationPct: number;
  alert: BudgetAlertLevel;
  projectCodes: string[];
}

/** Donor-wise fund utilization rollup across the register. */
export function donorUtilization(
  projects: Pick<ProjectRecord, 'id' | 'code' | 'donor' | 'budget'>[],
  expenses: Pick<ExpenseRecord, 'projectId' | 'amount'>[],
): DonorUtilizationRow[] {
  const byDonor = new Map<string, { budget: number; spent: number; codes: string[] }>();
  for (const p of projects) {
    const row = byDonor.get(p.donor) ?? { budget: 0, spent: 0, codes: [] };
    row.budget += p.budget.reduce((s, b) => s + Number(b.amount), 0);
    row.codes.push(p.code);
    byDonor.set(p.donor, row);
  }
  const projectById = new Map(projects.map((p) => [p.id, p]));
  for (const e of expenses) {
    const p = projectById.get(e.projectId);
    if (!p) continue;
    const row = byDonor.get(p.donor)!;
    row.spent += Number(e.amount);
  }
  return [...byDonor.entries()]
    .map(([donor, r]) => {
      const pct = r.budget > 0 ? Number(((r.spent / r.budget) * 100).toFixed(1)) : 0;
      return {
        donor,
        projects: r.codes.length,
        budgetTotal: r.budget.toFixed(2),
        spentTotal: r.spent.toFixed(2),
        utilizationPct: pct,
        alert: budgetAlertLevel(pct),
        projectCodes: r.codes.sort(),
      };
    })
    .sort((a, b) => b.budgetTotal.localeCompare(a.budgetTotal, undefined, { numeric: true }));
}

/* ── 6) Field monitoring visits ───────────────────────────────────────────── */export interface VisitChecklistRow {
  item: string;
  passed: boolean;
  note: string;
}

export const checklistItemSchema = z.object({
  item: z.string().trim().min(2).max(200),
  passed: z.boolean(),
  note: z.string().trim().max(200).default(''),
});

export interface VisitPhoto {
  id: string;
  labelBn: string;
  path: string;
}

export const visitPhotoSchema = z.object({
  id: z.string().trim().min(1).max(60),
  labelBn: z.string().trim().min(1).max(120),
  path: z.string().trim().min(1).max(300),
});

export interface FollowUp {
  action: string;
  owner: string;
  dueDate: string;
  done: boolean;
}

export const followUpSchema = z.object({
  action: z.string().trim().min(2).max(200),
  owner: z.string().trim().min(2).max(120),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  done: z.boolean().default(false),
});

export interface FieldVisit {
  id: string;
  orgId: string;
  projectId: string;
  visitDate: string;
  officerId: string;
  officerName: string;
  village: string;
  beneficiariesMet: number;
  checklist: VisitChecklistRow[];
  photos: VisitPhoto[];
  findings: string;
  followUps: FollowUp[];
  createdAt: string;
}

export const fieldVisitSchema = z.object({
  projectId: uuidSchema,
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  officerId: z.string().trim().min(1).max(60),
  officerName: z.string().trim().min(2).max(120),
  village: z.string().trim().max(120).default(''),
  beneficiariesMet: z.coerce.number().int().min(0).max(10_000).default(0),
  checklist: z.array(checklistItemSchema).min(1).max(40),
  photos: z.array(visitPhotoSchema).max(50).default([]),
  findings: z.string().trim().max(2_000).default(''),
  followUps: z.array(followUpSchema).max(40).default([]),
});
export type FieldVisitBody = z.infer<typeof fieldVisitSchema>;

/** Compliance score: share of checklist items passed. */
export function visitScore(checklist: VisitChecklistRow[]): number {
  if (checklist.length === 0) return 0;
  return Number(((checklist.filter((c) => c.passed).length / checklist.length) * 100).toFixed(1));
}

export function overdueFollowUps(visit: Pick<FieldVisit, 'followUps'>, today: string): FollowUp[] {
  return visit.followUps.filter((f) => !f.done && f.dueDate < today);
}

/* ── 7) Donor reports ─────────────────────────────────────────────────────── */

export interface DonorReportIndicatorRow {
  indicatorCode: string | null;
  statement: string;
  unit: string | null;
  baseline: string;
  target: string;
  achieved: string;
  progressPct: number;
  evidenceCount: number;
}

export interface DonorReportFinancialLine {
  lineItem: string;
  budgeted: string;
  spentPeriod: string;
  spentCumulative: string;
  utilizationPct: number;
}

export interface DonorReport {
  projectId: string;
  projectCode: string;
  projectNameBn: string;
  projectNameEn: string;
  donor: string;
  grantAgreementNo: string;
  fundCode: string;
  sector: string;
  periodStart: string;
  periodEnd: string;
  narrativeBn: string[];
  indicators: DonorReportIndicatorRow[];
  financials: DonorReportFinancialLine[];
  financialSummary: { budgetTotal: string; spentCumulative: string; spentPeriod: string; utilizationPct: number };
  delivery: { services: number; activitiesDone: number; beneficiariesEnrolled: number; visits: number; visitScorePct: number };
  generatedAt: string;
}

/**
 * Quarterly narrative + financial report. Indicator tables come from the
 * logframe (period-filtered measurements), financials from budget lines with
 * expenses split into in-period vs cumulative. Sensitive cases are NEVER
 * included — case data stays behind the case-management endpoints.
 */
export function buildDonorReport(input: {
  project: ProjectRecord;
  logframe: LogframeEntry[];
  indicatorValues: IndicatorValue[];
  expenses: Pick<ExpenseRecord, 'projectId' | 'budgetLine' | 'amount' | 'expenseDate'>[];
  servicesCount: number;
  activitiesDone: number;
  beneficiariesEnrolled: number;
  visits: Pick<FieldVisit, 'projectId' | 'checklist'>[];
  periodStart: string;
  periodEnd: string;
}): DonorReport {
  const { project, periodStart, periodEnd } = input;
  const periodExpenses = input.expenses.filter((e) => e.expenseDate >= periodStart && e.expenseDate <= periodEnd);
  const cumulativeExpenses = input.expenses.filter((e) => e.expenseDate <= periodEnd);

  const indicators: DonorReportIndicatorRow[] = [];
  for (const entry of input.logframe) {
    if (entry.level !== 'indicator') continue;
    // Only measurements overlapping the reporting period count toward the
    // period table (cumulative progress is visible via the logframe tab).
    const rows = input.indicatorValues.filter((v) => v.entryId === entry.id && v.periodStart <= periodEnd && v.periodEnd >= periodStart);
    const achieved = rows.reduce((s, v) => s + Number(v.value), 0);
    const target = Number(entry.targetValue) || 0;
    indicators.push({
      indicatorCode: entry.indicatorCode,
      statement: entry.statement,
      unit: entry.unit,
      baseline: entry.baseline,
      target: entry.targetValue,
      achieved: achieved.toFixed(2),
      progressPct: target > 0 ? Number((Math.min(100, (achieved / target) * 100)).toFixed(1)) : 0,
      evidenceCount: rows.reduce((s, v) => s + v.evidence.length, 0),
    });
  }

  const financials: DonorReportFinancialLine[] = project.budget.map((b: ProjectBudgetLine) => {
    const inPeriod = periodExpenses.filter((e) => e.budgetLine === b.lineItem).reduce((s, e) => s + Number(e.amount), 0);
    const cum = cumulativeExpenses.filter((e) => e.budgetLine === b.lineItem).reduce((s, e) => s + Number(e.amount), 0);
    const budgeted = Number(b.amount);
    return {
      lineItem: b.lineItem,
      budgeted: budgeted.toFixed(2),
      spentPeriod: inPeriod.toFixed(2),
      spentCumulative: cum.toFixed(2),
      utilizationPct: budgeted > 0 ? Number(((cum / budgeted) * 100).toFixed(1)) : 0,
    };
  });

  const budgetTotal = project.budget.reduce((s, b) => s + Number(b.amount), 0);
  const spentCumulative = cumulativeExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const spentPeriod = periodExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const visits = input.visits.filter((v) => v.projectId === project.id);
  const avgVisitScore = visits.length
    ? Number((visits.reduce((s, v) => s + visitScore(v.checklist), 0) / visits.length).toFixed(1))
    : 0;

  const pctBn = (v: number) => `${toBanglaDigits(v.toFixed(1))}%`;
  const takaBn = (v: string) => toBanglaDigits(Number(v).toLocaleString('en-US'));
  const narrativeBn = [
    `${project.nameBn} প্রকল্পের ${toBanglaDigits(periodStart)} থেকে ${toBanglaDigits(periodEnd)} মেয়াদের প্রতিবেদন।`,
    `দাতা: ${project.donor} (চুক্তি নং ${project.grantAgreementNo})। প্রকল্প অবস্থা: ${project.status === 'active' ? 'চলমান' : project.status}।`,
    `এই প্রান্তিকে ${takaBn(spentPeriod.toFixed(2))} টাকা ব্যয় হয়েছে; চলতি মেয়াদে সর্বমোট ব্যয় ${takaBn(spentCumulative.toFixed(2))} টাকা (বাজেটের ${pctBn(budgetTotal > 0 ? (spentCumulative / budgetTotal) * 100 : 0)})।`,
    indicators.length
      ? `সূচক অর্জন: ${indicators.map((i) => `${i.indicatorCode ?? '—'} — ${pctBn(i.progressPct)}`).join(', ')}।`
      : 'এই প্রান্তিকে কোনো সূচক মাপা হয়নি।',
    `সেবা ভুক্তি ${toBanglaDigits(String(input.servicesCount))}টি, সম্পন্ন কার্যক্রম ${toBanglaDigits(String(input.activitiesDone))}টি, ভর্তি উপকারভোগী ${toBanglaDigits(String(input.beneficiariesEnrolled))} জন, মাঠ পরিদর্শন ${toBanglaDigits(String(visits.length))}টি (গড় স্কোর ${pctBn(avgVisitScore)})।`,
  ];

  return {
    projectId: project.id,
    projectCode: project.code,
    projectNameBn: project.nameBn,
    projectNameEn: project.nameEn,
    donor: project.donor,
    grantAgreementNo: project.grantAgreementNo,
    fundCode: project.fundCode,
    sector: project.sector,
    periodStart,
    periodEnd,
    narrativeBn,
    indicators,
    financials,
    financialSummary: {
      budgetTotal: budgetTotal.toFixed(2),
      spentCumulative: spentCumulative.toFixed(2),
      spentPeriod: spentPeriod.toFixed(2),
      utilizationPct: budgetTotal > 0 ? Number(((spentCumulative / budgetTotal) * 100).toFixed(1)) : 0,
    },
    delivery: {
      services: input.servicesCount,
      activitiesDone: input.activitiesDone,
      beneficiariesEnrolled: input.beneficiariesEnrolled,
      visits: visits.length,
      visitScorePct: avgVisitScore,
    },
    generatedAt: new Date().toISOString(),
  };
}

/** Word-compatible (msword) HTML for the report; PDF via the browser print. */
export function buildDonorReportHtml(report: DonorReport, orgNameBn: string, orgNameEn: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const taka = (v: string) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const rows = report.indicators
    .map(
      (i) =>
        `<tr><td>${esc(i.indicatorCode ?? '—')}</td><td>${esc(i.statement)}</td><td>${esc(i.baseline)}</td><td>${esc(i.target)}${i.unit ? ` ${esc(i.unit)}` : ''}</td><td>${esc(i.achieved)}</td><td>${i.progressPct}%</td><td>${i.evidenceCount}</td></tr>`,
    )
    .join('');
  const finRows = report.financials
    .map(
      (f) =>
        `<tr><td>${esc(f.lineItem)}</td><td style="text-align:right">${taka(f.budgeted)}</td><td style="text-align:right">${taka(f.spentPeriod)}</td><td style="text-align:right">${taka(f.spentCumulative)}</td><td style="text-align:right">${f.utilizationPct}%</td></tr>`,
    )
    .join('');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${esc(report.projectCode)} Donor Report</title></head>
<body style="font-family:'Noto Sans Bengali','SolaimanLipi',Arial,sans-serif; margin:36px;">
  <h1 style="text-align:center; color:#0f766e;">${esc(orgNameBn)}</h1>
  <p style="text-align:center; margin-top:-8px;">${esc(orgNameEn)}</p>
  <h2 style="border-bottom:2px solid #0f766e; padding-bottom:6px;">দাতা প্রতিবেদন / Donor Report — ${esc(report.projectCode)}</h2>
  <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
    <tr><td><b>প্রকল্প:</b> ${esc(report.projectNameBn)} (${esc(report.projectNameEn)})</td><td><b>দাতা:</b> ${esc(report.donor)}</td></tr>
    <tr><td><b>চুক্তি নং:</b> ${esc(report.grantAgreementNo)}</td><td><b>ফান্ড কোড:</b> ${esc(report.fundCode)}</td></tr>
    <tr><td><b>মেয়াদ:</b> ${esc(report.periodStart)} থেকে ${esc(report.periodEnd)}</td><td><b>খাত:</b> ${esc(report.sector)}</td></tr>
  </table>

  <h3>১) বিবরণী / Narrative</h3>
  ${report.narrativeBn.map((p) => `<p>• ${esc(p)}</p>`).join('\n  ')}

  <h3>২) সূচক তালিকা / Indicator table</h3>
  <table border="1" style="width:100%; border-collapse:collapse; font-size:12px;">
    <thead style="background:#f0fdfa;"><tr><th>কোড</th><th>সূচক</th><th>বেসলাইন</th><th>লক্ষ্য</th><th>অর্জিত</th><th>অগ্রগতি</th><th>প্রমাণ</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7">—</td></tr>'}</tbody>
  </table>

  <h3>৩) আর্থিক বিবরণী / Financial summary</h3>
  <table border="1" style="width:100%; border-collapse:collapse; font-size:12px;">
    <thead style="background:#f0fdfa;"><tr><th>বাজেট লাইন</th><th style="text-align:right">বাজেট (৳)</th><th style="text-align:right">প্রান্তিক ব্যয়</th><th style="text-align:right">ক্রমপুঞ্জিত ব্যয়</th><th style="text-align:right">ব্যবহার</th></tr></thead>
    <tbody>${finRows || '<tr><td colspan="5">—</td></tr>'}</tbody>
    <tfoot>
      <tr style="font-weight:bold; background:#f0fdfa;"><td>মোট</td><td style="text-align:right">${taka(report.financialSummary.budgetTotal)}</td><td style="text-align:right">${taka(report.financialSummary.spentPeriod)}</td><td style="text-align:right">${taka(report.financialSummary.spentCumulative)}</td><td style="text-align:right">${report.financialSummary.utilizationPct}%</td></tr>
    </tfoot>
  </table>

  <p style="margin-top:24px; font-size:11px; color:#64748b;">প্রজন্মের তারিখ: ${esc(report.generatedAt)} · সংবেদনশীল কেস-ব্যবস্থাপনার তথ্য এই প্রতিবেদনে অন্তর্ভুক্ত নয়।</p>
</body></html>`;
}

/* ── 8) Sensitive case management ─────────────────────────────────────────── */

export const CASE_TYPES = ['child_protection', 'gbv_survivor', 'child_marriage', 'trafficking', 'other_sensitive'] as const;
export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_TYPE_LABELS_BN: Record<CaseType, string> = {
  child_protection: 'শিশু সুরক্ষা',
  gbv_survivor: 'নারী সহিংসতার শিকার',
  child_marriage: 'বাল্যবিবাহ',
  trafficking: 'মানব পাচার',
  other_sensitive: 'অন্যান্য সংবেদনশীল',
};

export type CaseStatus = 'open' | 'in_progress' | 'referred' | 'closed';

export const CASE_FLOW: Record<CaseStatus, CaseStatus[]> = {
  open: ['in_progress', 'referred', 'closed'],
  in_progress: ['referred', 'closed'],
  referred: ['closed'],
  closed: [],
};

export function canTransitionCase(from: CaseStatus, to: CaseStatus): boolean {
  return CASE_FLOW[from].includes(to);
}

export const CASE_STATUS_LABELS_BN: Record<CaseStatus, string> = {
  open: 'খোলা',
  in_progress: 'চলমান',
  referred: 'রেফার করা',
  closed: 'বন্ধ',
};

export type CaseSeverity = 'low' | 'medium' | 'high' | 'critical';

export const CASE_SEVERITY_LABELS_BN: Record<CaseSeverity, string> = {
  low: 'কম',
  medium: 'মধ্যম',
  high: 'উচ্চ',
  critical: 'অতি জরুরি',
};

export interface CaseFile {
  id: string;
  orgId: string;
  caseNo: string; // CASE-0001
  type: CaseType;
  severity: CaseSeverity;
  status: CaseStatus;
  beneficiaryId: string | null;
  beneficiaryName: string;
  /** Restricted details — only case workers/admins may read this field. */
  restrictedDetails: string;
  consentGiven: boolean;
  openedAt: string;
  assignedWorkerId: string;
  assignedWorkerName: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const caseFileSchema = z.object({
  type: z.enum(CASE_TYPES),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  beneficiaryId: uuidSchema.nullable().default(null),
  beneficiaryName: z.string().trim().min(2).max(120),
  restrictedDetails: z.string().trim().min(3).max(4_000),
  consentGiven: z.boolean().default(false),
  assignedWorkerId: z.string().trim().min(1).max(60),
  assignedWorkerName: z.string().trim().min(2).max(120),
});
export type CaseFileBody = z.infer<typeof caseFileSchema>;

export function nextCaseNo(seq: number): string {
  return `CASE-${String(seq).padStart(4, '0')}`;
}

export interface CaseAccessLogRow {
  id: string;
  orgId: string;
  caseId: string;
  userId: string;
  userName: string;
  action: 'create' | 'view' | 'view_restricted' | 'update' | 'close';
  at: string;
}

/** Roles that may open cases and read restricted fields (RLS mirror). */
export const CASE_WORKER_ROLES = ['super_admin', 'org_admin', 'area_manager'] as const;

/** Can this viewer read restricted fields / open cases? */
export function canManageCases(role: string, assignedWorkerId: string | null, userId: string | null): boolean {
  if ((CASE_WORKER_ROLES as readonly string[]).includes(role)) return true;
  return assignedWorkerId !== null && userId !== null && assignedWorkerId === userId;
}

/** A masked case row: safe for any staff member and for general reports. */
export interface MaskedCase {
  id: string;
  caseNo: string;
  type: CaseType;
  severity: CaseSeverity;
  status: CaseStatus;
  openedAt: string;
  closedAt: string | null;
  restrictedDetails: null;
  beneficiaryName: null;
}

/** Mask identity + restricted details for viewers without case access. */
export function maskCase(c: CaseFile): MaskedCase {
  return {
    id: c.id,
    caseNo: c.caseNo,
    type: c.type,
    severity: c.severity,
    status: c.status,
    openedAt: c.openedAt,
    closedAt: c.closedAt,
    restrictedDetails: null,
    beneficiaryName: null,
  };
}

/** Record the viewer saw the case (called on every GET by id / list). */
export function accessLogEntry(orgId: string, caseId: string, userId: string, userName: string, action: CaseAccessLogRow['action']): Omit<CaseAccessLogRow, 'id'> {
  return { orgId, caseId, userId, userName, action, at: new Date().toISOString() };
}

/* ── 9) Grants & PKSF/bank borrowing tracker ──────────────────────────────── */

export const FUNDING_KINDS = ['grant', 'pksf', 'bank', 'mfi_wholesale', 'internal_fund'] as const;
export type FundingKind = (typeof FUNDING_KINDS)[number];

export const FUNDING_KIND_LABELS_BN: Record<FundingKind, string> = {
  grant: 'অনুদান',
  pksf: 'পল্লী কর্মসহায় ফাউন্ডেশন (PKSF)',
  bank: 'ব্যাংক ঋণ',
  mfi_wholesale: 'এমএফআই পাইকারি তহবিল',
  internal_fund: 'নিজস্ব তহবিল',
};

export interface FundingSource {
  id: string;
  orgId: string;
  code: string; // FND-0001
  sourceName: string;
  kind: FundingKind;
  principal: string;
  interestRatePct: string; // annual, e.g. '6.00'; grant = 0
  tenureMonths: number;
  disbursementDate: string;
  repaymentStart: string;
  purposeProjectId: string | null;
  lenderContact: string;
  status: 'active' | 'repaid' | 'defaulted';
  createdAt: string;
}

export const fundingSourceSchema = z.object({
  sourceName: z.string().trim().min(2).max(160),
  kind: z.enum(FUNDING_KINDS),
  principal: moneySchema,
  interestRatePct: z.string().regex(/^\d{1,2}(\.\d{1,2})?$/).default('0'),
  tenureMonths: z.coerce.number().int().min(0).max(600),
  disbursementDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  repaymentStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  purposeProjectId: uuidSchema.nullable().default(null),
  lenderContact: z.string().trim().max(300).default(''),
});
export type FundingSourceBody = z.infer<typeof fundingSourceSchema>;

export function nextFundingCode(seq: number): string {
  return `FND-${String(seq).padStart(4, '0')}`;
}

export interface RepaymentInstallment {
  installmentNo: number;
  dueDate: string;
  principal: string;
  interest: string;
  total: string;
  balance: string;
}

export type RepaymentMethod = 'flat' | 'declining';

/**
 * Amortized repayment schedule.
 * - flat: equal monthly principal; interest each month on the original principal.
 * - declining: constant EMI (P·r·(1+r)^n / ((1+r)^n − 1)), interest on the
 *   remaining balance. Zero-interest (grants) produce principal-only rows.
 */
export function repaymentSchedule(input: {
  principal: string;
  interestRatePct: string;
  tenureMonths: number;
  repaymentStart: string;
  method?: RepaymentMethod;
}): RepaymentInstallment[] {
  const P = Number(input.principal);
  const n = input.tenureMonths;
  if (P <= 0 || n <= 0) return [];
  const method = input.method ?? 'declining';
  const monthlyRate = Number(input.interestRatePct) / 100 / 12;
  const rows: RepaymentInstallment[] = [];
  const [y, m] = input.repaymentStart.split('-').map(Number) as [number, number];
  const dueDate = (i: number): string => {
    const total = (y * 12 + (m - 1)) + (i - 1);
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-28`;
  };

  if (monthlyRate === 0) {
    const principalPart = P / n;
    let balance = P;
    for (let i = 1; i <= n; i++) {
      balance -= principalPart;
      rows.push({ installmentNo: i, dueDate: dueDate(i), principal: principalPart.toFixed(2), interest: '0.00', total: principalPart.toFixed(2), balance: Math.abs(balance) < 0.005 ? '0.00' : balance.toFixed(2) });
    }
    return rows;
  }

  if (method === 'flat') {
    const principalPart = P / n;
    const interestPart = (P * Number(input.interestRatePct)) / 100 / 12;
    let balance = P;
    for (let i = 1; i <= n; i++) {
      balance -= principalPart;
      const total = principalPart + interestPart;
      rows.push({ installmentNo: i, dueDate: dueDate(i), principal: principalPart.toFixed(2), interest: interestPart.toFixed(2), total: total.toFixed(2), balance: Math.abs(balance) < 0.005 ? '0.00' : balance.toFixed(2) });
    }
    return rows;
  }

  // Declining-balance EMI (rounded to 2 dp like MFI accounting sheets).
  const pow = Math.pow(1 + monthlyRate, n);
  const emi = (P * monthlyRate * pow) / (pow - 1);
  let balance = P;
  for (let i = 1; i <= n; i++) {
    const interest = balance * monthlyRate;
    let principalPart = emi - interest;
    if (i === n) principalPart = balance; // clear rounding residue on the last row
    balance -= principalPart;
    rows.push({
      installmentNo: i,
      dueDate: dueDate(i),
      principal: principalPart.toFixed(2),
      interest: interest.toFixed(2),
      total: (principalPart + interest).toFixed(2),
      balance: Math.abs(balance) < 0.005 ? '0.00' : balance.toFixed(2),
    });
  }
  return rows;
}

export interface RepaymentSummary {
  installmentCount: number;
  totalPrincipal: string;
  totalInterest: string;
  totalPayable: string;
  monthlyEmi: string | null;
}

export function repaymentSummary(schedule: RepaymentInstallment[]): RepaymentSummary {
  const totalPrincipal = schedule.reduce((s, r) => s + Number(r.principal), 0);
  const totalInterest = schedule.reduce((s, r) => s + Number(r.interest), 0);
  return {
    installmentCount: schedule.length,
    totalPrincipal: totalPrincipal.toFixed(2),
    totalInterest: totalInterest.toFixed(2),
    totalPayable: (totalPrincipal + totalInterest).toFixed(2),
    monthlyEmi: schedule.length ? schedule[0]!.total : null,
  };
}
