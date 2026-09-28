/**
 * ── Reports, MIS & compliance (NGO-MFI management information) ───────────────
 * 1) Role-based dashboards (field officer, branch manager, area/zone, head
 *    office, board summary), 2) standard microfinance reports (member/loan
 *    statements, disbursement register, collection efficiency, outstanding,
 *    overdue aging, savings position, samity list, dropout analysis, staff
 *    productivity, loan utilization findings), 3) financial ratios (OSS,
 *    portfolio yield, cost per borrower, borrowers per officer, savings-to-
 *    loan, write-off ratio), 4) regulatory returns (MRA, PKSF) generated from
 *    a configurable report designer — templates of rows with formulas
 *    evaluated against named snapshot values, so new circulars are data, not
 *    code. Money is string numeric(14,2).
 */
import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';
import { toBanglaDigits } from './format.js';
import { num } from './work.js';
import type { ClassifiedLoan } from './delinquency.js';
import type { ParMetrics } from './delinquency.js';

/* ═══════════════════════════ 1) Role dashboards ═══════════════════════════ */

export const DASHBOARD_ROLES = ['field_officer', 'branch_manager', 'area_zone', 'head_office', 'board'] as const;
export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export const DASHBOARD_ROLE_LABELS_BN: Record<DashboardRole, string> = {
  field_officer: 'ফিল্ড অফিসার',
  branch_manager: 'শাখা ব্যবস্থাপক',
  area_zone: 'এলাকা/জোন',
  head_office: 'প্রধান কার্যালয়',
  board: 'বোর্ড সারসংক্ষেপ',
};

/** Role → dashboard mapping (requirement 1). The web maps auth roles onto these. */
export const ROLE_TO_DASHBOARD: Record<string, DashboardRole> = {
  account_officer: 'field_officer',
  branch_manager: 'branch_manager',
  area_manager: 'area_zone',
  org_admin: 'head_office',
  super_admin: 'head_office',
  member: 'board',
};

/** KPI card used by every dashboard. */
export interface KpiCard {
  key: string;
  labelBn: string;
  value: string;
  hintBn?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}

export interface OfficerDayRow {
  samityName: string;
  meetingDate: string;
  dueInstallments: number;
  collectedInstallments: number;
  dueAmount: string;
  collectedAmount: string;
  savingsDue: string;
  savingsCollected: string;
}

export interface OfficerTargetRow {
  metric: string;
  labelBn: string;
  target: number;
  actual: number;
  achievementPct: number;
}

export interface FieldOfficerDashboard {
  role: 'field_officer';
  officerName: string;
  date: string;
  todaySheet: OfficerDayRow[];
  summary: { dueAmount: string; collectedAmount: string; collectionPct: number; membersDue: number };
  targets: OfficerTargetRow[];
  overdueClients: { memberName: string; overdueAmount: string; daysPastDue: number }[];
}

export interface BranchManagerDashboard {
  role: 'branch_manager';
  branchName: string;
  date: string;
  collection: { dueThisMonth: string; collectedThisMonth: string; efficiencyPct: number; onTimeRate: number };
  par: ParMetrics | null;
  cash: { opening: string; collections: string; disbursements: string; closing: string; handoverPending: boolean };
  officers: { officerName: string; dueAmount: string; collectedAmount: string; efficiencyPct: number }[];
}

export interface BranchRankRow {
  branchName: string;
  members: number;
  outstanding: string;
  collectionEffPct: number;
  par30Pct: number;
  score: number;
  rank: number;
}

export interface AreaZoneDashboard {
  role: 'area_zone';
  areaName: string;
  zoneName: string;
  date: string;
  branches: BranchRankRow[];
  totals: { members: number; outstanding: string; par30Pct: number; avgEfficiencyPct: number };
}

export interface HeadOfficeDashboard {
  role: 'head_office';
  date: string;
  portfolio: { outstanding: string; activeLoans: number; borrowers: number; avgLoanSize: string; disbursementYtd: string; collectionYtd: string };
  growth: { memberGrowthPct: number; portfolioGrowthPct: number; savingsGrowthPct: number };
  ratios: Record<string, FinancialRatio>;
  savings: { totalSavings: string; membersWithSavings: number };
  branchesRanked: BranchRankRow[];
}

export interface BoardDashboard {
  role: 'board';
  date: string;
  summary: KpiCard[];
  headline: string;
}

/** Role-specific dashboard union (API returns the right one per caller). */
export type RoleDashboard = FieldOfficerDashboard | BranchManagerDashboard | AreaZoneDashboard | HeadOfficeDashboard | BoardDashboard;

/* ═══════════════════════════ 2) Standard reports ══════════════════════════ */

export const STANDARD_REPORTS = [
  'member_statement',
  'loan_statement',
  'disbursement_register',
  'collection_efficiency',
  'outstanding_loans',
  'overdue_aging',
  'savings_position',
  'samity_list',
  'dropout_analysis',
  'staff_productivity',
  'loan_utilization',
] as const;
export type StandardReportKind = (typeof STANDARD_REPORTS)[number];

export const STANDARD_REPORT_LABELS_BN: Record<StandardReportKind, string> = {
  member_statement: 'সদস্য বিবরণী',
  loan_statement: 'ঋণ বিবরণী',
  disbursement_register: 'ঋণ বিতরণ রেজিস্টার',
  collection_efficiency: 'আদায় দক্ষতা',
  outstanding_loans: 'বকেয়া ঋণ তালিকা',
  overdue_aging: 'অপরিশোধ বয়স্করণ',
  savings_position: 'সঞ্চয় অবস্থান',
  samity_list: 'সমিতি তালিকা',
  dropout_analysis: 'ঝরে পড়া বিশ্লেষণ',
  staff_productivity: 'কর্মীর উৎপাদনশীলতা',
  loan_utilization: 'ঋণ ব্যবহার প্রতিবেদন',
};

export interface ReportMeta {
  kind: StandardReportKind;
  titleBn: string;
  titleEn: string;
  periodStart: string | null;
  periodEnd: string;
  params: Record<string, string | number | null>;
  rowCount: number;
}

/** Every standard report returns columns + rows + totals — easy to render/export. */
export interface StandardReport {
  meta: ReportMeta;
  columns: { key: string; labelBn: string; type: 'text' | 'money' | 'number' | 'date' | 'pct' }[];
  rows: Record<string, string | number>[];
  totals: Record<string, string | number>;
}

type Col = StandardReport['columns'][number];

function reportSkeleton(kind: StandardReportKind, titleBn: string, titleEn: string, periodEnd: string, params: ReportMeta['params'], periodStart: string | null = null): StandardReport {
  return { meta: { kind, titleBn, titleEn, periodStart, periodEnd, params, rowCount: 0 }, columns: [], rows: [], totals: {} };
}

function finishReport(r: StandardReport, sumKeys: string[]): StandardReport {
  r.meta.rowCount = r.rows.length;
  for (const k of sumKeys) {
    const total = r.rows.reduce((s, row) => s + Number(row[k] ?? 0), 0);
    r.totals[k] = r.columns.find((c) => c.key === k)?.type === 'money' ? total.toFixed(2) : total;
  }
  return r;
}

/* ── Snapshot: the single data contract between the API stores and reports ── */
export interface MisSnapshot {
  asOf: string;
  orgId: string;
  orgNameBn: string;
  branches: { id: string; name: string; areaName: string; zoneName: string; members: number; centers: number }[];
  members: { id: string; code: string; name: string; branchId: string; samityName: string; joinedAt: string; active: boolean; droppedOutAt: string | null; dropoutReason: string | null }[];
  loans: ClassifiedLoan[];
  loanStats: { disbursedPeriod: string; disbursedYtd: string; collectedPeriod: string; collectedYtd: string; writtenOff: string; dueInstallments: number; paidInstallments: number };
  savings: { accounts: number; totalBalance: string; byType: { type: string; accounts: number; balance: string }[]; memberIdsWithSavings: Set<string> };
  utilization: { loanNumber: string; memberName: string; visitedAt: string; finding: 'fully_utilized' | 'partially_utilized' | 'not_utilized' | 'diverted'; findingsNote: string }[];
  staff: { officerId: string; officerName: string; branchId: string; borrowers: number; dueAmount: string; collectedAmount: string; samities: number }[];
}

export interface LoanStatementTx {
  date: string;
  description: string;
  principal: string;
  interest: string;
  total: string;
  balance: string;
}

/** ── member_statement: savings balance + active loan summary per member ── */
export function memberStatementReport(s: MisSnapshot, memberId: string, loanTx: LoanStatementTx[] = [], savingsBalance = '0.00'): StandardReport {
  const m = s.members.find((x) => x.id === memberId);
  const r = reportSkeleton('member_statement', `সদস্য বিবরণী — ${m?.name ?? memberId}`, 'Member Statement', s.asOf, { memberId }, null);
  r.columns = [
    { key: 'item', labelBn: 'বিবরণ', type: 'text' },
    { key: 'value', labelBn: 'মান', type: 'text' },
  ];
  const active = s.loans.filter((l) => l.memberId === memberId);
  const outstanding = active.reduce((t, l) => t + Number(l.outstanding), 0);
  const overdue = active.reduce((t, l) => t + Number(l.overdueTotal), 0);
  const rows: StandardReport['rows'] = [
    { item: 'সদস্য নং', value: m?.code ?? '—' },
    { item: 'নাম', value: m?.name ?? '—' },
    { item: 'সমিতি', value: m?.samityName ?? '—' },
    { item: 'শাখা', value: s.branches.find((b) => b.id === m?.branchId)?.name ?? '—' },
    { item: 'সঞ্চয় জমা', value: savingsBalance },
    { item: 'চলমান ঋণ সংখ্যা', value: String(active.length) },
    { item: 'বকেয়া মূলধন', value: outstanding.toFixed(2) },
    { item: 'অপরিশোধিত কিস্তি', value: overdue.toFixed(2) },
  ];
  for (const tx of loanTx.slice(-12)) {
    rows.push({ item: `${tx.date} — ${tx.description}`, value: `${tx.total} (বাকি ${tx.balance})` });
  }
  r.rows = rows;
  return finishReport(r, []);
}

/** ── loan_statement: repayment ledger for one loan ── */
export function loanStatementReport(s: MisSnapshot, loanId: string, txs: LoanStatementTx[]): StandardReport {
  const loan = s.loans.find((l) => l.applicationId === loanId);
  const r = reportSkeleton('loan_statement', `ঋণ বিবরণী — ${loan?.loanNumber ?? loanId}`, 'Loan Statement', s.asOf, { loanId }, null);
  r.columns = [
    { key: 'date', labelBn: 'তারিখ', type: 'date' },
    { key: 'description', labelBn: 'বিবরণ', type: 'text' },
    { key: 'principal', labelBn: 'মূল', type: 'money' },
    { key: 'interest', labelBn: 'সুদ', type: 'money' },
    { key: 'total', labelBn: 'মোট', type: 'money' },
    { key: 'balance', labelBn: 'বাকি', type: 'money' },
  ];
  r.rows = txs.map((t) => ({ date: t.date, description: t.description, principal: t.principal, interest: t.interest, total: t.total, balance: t.balance }));
  return finishReport(r, ['principal', 'interest', 'total']);
}

/** ── disbursement_register: loans disbursed in the period ── */
export function disbursementRegisterReport(s: MisSnapshot, start: string, end: string): StandardReport {
  const r = reportSkeleton('disbursement_register', 'ঋণ বিতরণ রেজিস্টার', 'Disbursement Register', end, {}, start);
  r.columns = [
    { key: 'memberName', labelBn: 'সদস্য', type: 'text' },
    { key: 'branchName', labelBn: 'শাখা', type: 'text' },
    { key: 'disbursedOn', labelBn: 'বিতরণের তারিখ', type: 'date' },
    { key: 'outstanding', labelBn: 'বিতরণ/বকেয়া', type: 'money' },
    { key: 'productName', labelBn: 'পণ্য', type: 'text' },
  ];
  r.rows = s.loans
    .filter((l) => l.disbursedOn >= start && l.disbursedOn <= end)
    .map((l) => ({
      memberName: l.memberName,
      branchName: s.branches.find((b) => b.id === l.branchId)?.name ?? '—',
      disbursedOn: l.disbursedOn,
      outstanding: l.outstanding,
      productName: l.productName ?? '—',
    }));
  return finishReport(r, ['outstanding']);
}

/** ── collection_efficiency: demand vs collection per branch/officer ── */
export function collectionEfficiencyReport(s: MisSnapshot, start: string, end: string): StandardReport {
  const r = reportSkeleton('collection_efficiency', 'আদায় দক্ষতা', 'Collection Efficiency', end, {}, start);
  r.columns = [
    { key: 'scope', labelBn: 'স্কোপ', type: 'text' },
    { key: 'name', labelBn: 'নাম', type: 'text' },
    { key: 'due', labelBn: 'প্রাপ্য', type: 'money' },
    { key: 'collected', labelBn: 'আদায়', type: 'money' },
    { key: 'efficiency', labelBn: 'দক্ষতা', type: 'pct' },
  ];
  for (const off of s.staff) {
    const eff = num(off.dueAmount) > 0 ? (num(off.collectedAmount) / num(off.dueAmount)) * 100 : 0;
    r.rows.push({ scope: 'officer', name: off.officerName, due: off.dueAmount, collected: off.collectedAmount, efficiency: eff.toFixed(1) });
  }
  for (const b of s.branches) {
    const staff = s.staff.filter((x) => x.branchId === b.id);
    const due = staff.reduce((t, x) => t + num(x.dueAmount), 0);
    const col = staff.reduce((t, x) => t + num(x.collectedAmount), 0);
    r.rows.push({ scope: 'branch', name: b.name, due: due.toFixed(2), collected: col.toFixed(2), efficiency: due > 0 ? ((col / due) * 100).toFixed(1) : '0.0' });
  }
  return finishReport(r, ['due', 'collected']);
}

/** ── outstanding_loans: all active loans with classification ── */
export function outstandingLoansReport(s: MisSnapshot, branchId?: string): StandardReport {
  const r = reportSkeleton('outstanding_loans', 'বকেয়া ঋণ তালিকা', 'Outstanding Loans', s.asOf, branchId ? { branchId } : {});
  r.columns = [
    { key: 'memberName', labelBn: 'সদস্য', type: 'text' },
    { key: 'loanNumber', labelBn: 'ঋণ নং', type: 'text' },
    { key: 'branchName', labelBn: 'শাখা', type: 'text' },
    { key: 'disbursedOn', labelBn: 'বিতরণ', type: 'date' },
    { key: 'outstanding', labelBn: 'বকেয়া', type: 'money' },
    { key: 'overdueTotal', labelBn: 'অপরিশোধিত', type: 'money' },
    { key: 'daysPastDue', labelBn: 'বকেয়া দিন', type: 'number' },
    { key: 'assetClass', labelBn: 'শ্রেণি', type: 'text' },
  ];
  r.rows = s.loans
    .filter((l) => !branchId || l.branchId === branchId)
    .map((l) => ({
      // applicationId travels with the row so UIs can deep-link the loan statement.
      applicationId: l.applicationId,
      memberName: l.memberName,
      loanNumber: l.loanNumber ?? '—',
      branchName: s.branches.find((b) => b.id === l.branchId)?.name ?? '—',
      disbursedOn: l.disbursedOn,
      outstanding: l.outstanding,
      overdueTotal: l.overdueTotal,
      daysPastDue: l.daysPastDue,
      assetClass: l.assetClass,
    }));
  return finishReport(r, ['outstanding', 'overdueTotal']);
}

/** ── overdue_aging: bucket totals per branch (uses delinquency buckets) ── */
export function overdueAgingReport(s: MisSnapshot): StandardReport {
  const r = reportSkeleton('overdue_aging', 'অপরিশোধ বয়স্করণ', 'Overdue Aging', s.asOf, {});
  r.columns = [
    { key: 'branchName', labelBn: 'শাখা', type: 'text' },
    { key: 'd1_30', labelBn: '১–৩০ দিন', type: 'money' },
    { key: 'd31_90', labelBn: '৩১–৯০ দিন', type: 'money' },
    { key: 'd91_180', labelBn: '৯১–১৮০ দিন', type: 'money' },
    { key: 'd180_plus', labelBn: '১৮০+ দিন', type: 'money' },
    { key: 'total', labelBn: 'মোট অপরিশোধিত', type: 'money' },
  ];
  const bucketSum = (loans: ClassifiedLoan[], bucket: ClassifiedLoan['bucket']) =>
    loans.filter((l) => l.bucket === bucket).reduce((t, l) => t + num(l.overdueTotal), 0);
  for (const b of s.branches) {
    const loans = s.loans.filter((l) => l.branchId === b.id);
    const row: Record<string, string | number> = { branchName: b.name };
    let total = 0;
    for (const bucket of ['d1_30', 'd31_90', 'd91_180', 'd180_plus'] as const) {
      const v = bucketSum(loans, bucket);
      row[bucket] = v.toFixed(2);
      total += v;
    }
    row['total'] = total.toFixed(2);
    r.rows.push(row);
  }
  return finishReport(r, ['d1_30', 'd31_90', 'd91_180', 'd180_plus', 'total']);
}

/** ── savings_position: balances by product type per branch ── */
export function savingsPositionReport(s: MisSnapshot): StandardReport {
  const r = reportSkeleton('savings_position', 'সঞ্চয় অবস্থান', 'Savings Position', s.asOf, {});
  r.columns = [
    { key: 'branchName', labelBn: 'শাখা', type: 'text' },
    { key: 'accounts', labelBn: 'হিসাব', type: 'number' },
    { key: 'balance', labelBn: 'জমা', type: 'money' },
    { key: 'perMember', labelBn: 'প্রতি সদস্য', type: 'money' },
  ];
  for (const b of s.branches) {
    const share = b.members > 0 ? b.members : 1;
    const branchShare = num(s.savings.totalBalance) * (b.members / Math.max(1, s.members.length));
    r.rows.push({ branchName: b.name, accounts: Math.round((s.savings.accounts * b.members) / Math.max(1, s.members.length)), balance: branchShare.toFixed(2), perMember: (branchShare / share).toFixed(2) });
  }
  return finishReport(r, ['accounts', 'balance']);
}

/** ── samity_list: centers with member counts (from branch centers) ── */
export function samityListReport(s: MisSnapshot): StandardReport {
  const r = reportSkeleton('samity_list', 'সমিতি তালিকা', 'Samity List', s.asOf, {});
  r.columns = [
    { key: 'branchName', labelBn: 'শাখা', type: 'text' },
    { key: 'samityName', labelBn: 'সমিতি', type: 'text' },
    { key: 'members', labelBn: 'সদস্য', type: 'number' },
    { key: 'active', labelBn: 'চলমান', type: 'number' },
  ];
  const bySamity = new Map<string, { branch: string; members: number; active: number }>();
  for (const m of s.members) {
    const key = `${m.branchId}::${m.samityName}`;
    const row = bySamity.get(key) ?? { branch: s.branches.find((b) => b.id === m.branchId)?.name ?? '—', members: 0, active: 0 };
    row.members += 1;
    if (m.active) row.active += 1;
    bySamity.set(key, row);
  }
  r.rows = [...bySamity.entries()].map(([key, v]) => ({ branchName: v.branch, samityName: key.split('::')[1] ?? '—', members: v.members, active: v.active }));
  return finishReport(r, ['members', 'active']);
}

/** ── dropout_analysis: members who left, by reason, with rate ── */
export function dropoutAnalysisReport(s: MisSnapshot, start: string, end: string): StandardReport {
  const r = reportSkeleton('dropout_analysis', 'ঝরে পড়া বিশ্লেষণ', 'Dropout Analysis', end, {}, start);
  r.columns = [
    { key: 'branchName', labelBn: 'শাখা', type: 'text' },
    { key: 'reason', labelBn: 'কারণ', type: 'text' },
    { key: 'count', labelBn: 'সদস্য', type: 'number' },
    { key: 'dropoutPct', labelBn: 'ঝরে পড়ার হার', type: 'pct' },
  ];
  const REASON_BN: Record<string, string> = {
    migration: 'স্থানান্তর',
    loan_dispute: 'ঋণ বিরোধ',
    high_installment: 'কিস্তি বেশি',
    religion: 'ধর্মীয় কারণ',
    death: 'মৃত্যু',
    other: 'অন্যান্য',
  };
  for (const b of s.branches) {
    const dropped = s.members.filter((m) => m.branchId === b.id && m.droppedOutAt && m.droppedOutAt >= start && m.droppedOutAt <= end);
    const branchMembers = s.members.filter((m) => m.branchId === b.id).length || 1;
    const byReason = new Map<string, number>();
    for (const d of dropped) {
      const reason = d.dropoutReason ?? 'other';
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    }
    if (dropped.length === 0) {
      r.rows.push({ branchName: b.name, reason: '—', count: 0, dropoutPct: '0.0' });
      continue;
    }
    for (const [reason, count] of byReason) {
      r.rows.push({ branchName: b.name, reason: REASON_BN[reason] ?? reason, count, dropoutPct: ((count / branchMembers) * 100).toFixed(1) });
    }
  }
  return finishReport(r, ['count']);
}

/** ── staff_productivity: per officer borrowers, samities, collection ── */
export function staffProductivityReport(s: MisSnapshot, start: string, end: string): StandardReport {
  const r = reportSkeleton('staff_productivity', 'কর্মীর উৎপাদনশীলতা', 'Staff Productivity', end, {}, start);
  r.columns = [
    { key: 'officerName', labelBn: 'কর্মী', type: 'text' },
    { key: 'branchName', labelBn: 'শাখা', type: 'text' },
    { key: 'samities', labelBn: 'সমিতি', type: 'number' },
    { key: 'borrowers', labelBn: 'ঋণগ্রহীতা', type: 'number' },
    { key: 'collected', labelBn: 'আদায়', type: 'money' },
    { key: 'efficiency', labelBn: 'দক্ষতা', type: 'pct' },
  ];
  for (const off of s.staff) {
    const eff = num(off.dueAmount) > 0 ? (num(off.collectedAmount) / num(off.dueAmount)) * 100 : 0;
    r.rows.push({
      officerName: off.officerName,
      branchName: s.branches.find((b) => b.id === off.branchId)?.name ?? '—',
      samities: off.samities,
      borrowers: off.borrowers,
      collected: off.collectedAmount,
      efficiency: eff.toFixed(1),
    });
  }
  return finishReport(r, ['collected']);
}

/** ── loan_utilization: findings from utilization visits ── */
export function loanUtilizationReport(s: MisSnapshot, start: string, end: string): StandardReport {
  const r = reportSkeleton('loan_utilization', 'ঋণ ব্যবহার প্রতিবেদন', 'Loan Utilization Findings', end, {}, start);
  r.columns = [
    { key: 'loanNumber', labelBn: 'ঋণ নং', type: 'text' },
    { key: 'memberName', labelBn: 'সদস্য', type: 'text' },
    { key: 'visitedAt', labelBn: 'পরিদর্শন', type: 'date' },
    { key: 'finding', labelBn: 'প্রত্যাবর্তন', type: 'text' },
    { key: 'findingsNote', labelBn: 'মন্তব্য', type: 'text' },
  ];
  const FINDING_BN: Record<string, string> = {
    fully_utilized: 'সম্পূর্ণ ব্যবহৃত',
    partially_utilized: 'আংশিক ব্যবহৃত',
    not_utilized: 'ব্যবহৃত হয়নি',
    diverted: 'অন্যত্র ব্যবহৃত',
  };
  r.rows = s.utilization
    .filter((u) => u.visitedAt >= start && u.visitedAt <= end)
    .map((u) => ({ loanNumber: u.loanNumber, memberName: u.memberName, visitedAt: u.visitedAt, finding: FINDING_BN[u.finding] ?? u.finding, findingsNote: u.findingsNote }));
  return finishReport(r, []);
}

/* ═══════════════════════════ 3) Financial ratios ══════════════════════════ */

export const RATIO_KEYS = [
  'oss',
  'portfolio_yield',
  'cost_per_borrower',
  'borrowers_per_officer',
  'savings_to_loan',
  'write_off_ratio',
] as const;
export type RatioKey = (typeof RATIO_KEYS)[number];

export const RATIO_LABELS_BN: Record<RatioKey, string> = {
  oss: 'অপারেশনাল স্বয়ংসম্পূর্ণতা (OSS)',
  portfolio_yield: 'পোর্টফোলিও ইউটিলাইজেশন / ইউটি হার',
  cost_per_borrower: 'ঋণগ্রহীতা প্রতি ব্যয়',
  borrowers_per_officer: 'কর্মী প্রতি ঋণগ্রহীতা',
  savings_to_loan: 'সঞ্চয় বনাম ঋণ অনুপাত',
  write_off_ratio: 'লেখ্য ঋণ অনুপাত',
};

export interface FinancialRatio {
  key: RatioKey;
  labelBn: string;
  value: number;
  formatted: string;
  /** Optional benchmark or target to compare against. */
  benchmark?: number;
  unit: 'ratio' | 'pct' | 'bdt' | 'count';
}

export interface RatioInputs {
  /** Operating income: loan interest + fees + other operating income. */
  operatingIncome: string;
  /** Operating expenses: salaries + admin + depreciation (financial expense excluded). */
  operatingExpense: string;
  /** Financial expense: interest paid on borrowings. */
  financialExpense: string;
  /** Interest + fees earned on the loan portfolio over the period (annualized by caller). */
  interestFeesIncome: string;
  /** Average outstanding portfolio over the period. */
  avgPortfolio: string;
  totalOperatingCost: string;
  borrowers: number;
  fieldOfficers: number;
  totalSavings: string;
  avgOutstandingLoans: string;
  writtenOff: string;
}

/** Compute the six ratios (requirement 3) from accounting + portfolio figures. */
export function computeRatios(i: RatioInputs): Record<RatioKey, FinancialRatio> {
  const oi = num(i.operatingIncome);
  const oe = num(i.operatingExpense);
  const fe = num(i.financialExpense);
  const interest = num(i.interestFeesIncome);
  const portfolio = num(i.avgPortfolio);
  const savings = num(i.totalSavings);
  const avgLoans = num(i.avgOutstandingLoans);
  const wo = num(i.writtenOff);

  const oss = oi + fe > 0 ? (oi) / (oe + fe) : 0;
  const yieldPct = portfolio > 0 ? (interest / portfolio) * 100 : 0;
  const costPerBorrower = i.borrowers > 0 ? num(i.totalOperatingCost) / i.borrowers : 0;
  const perOfficer = i.fieldOfficers > 0 ? i.borrowers / i.fieldOfficers : 0;
  const savingsToLoan = avgLoans > 0 ? savings / avgLoans : 0;
  const writeOffRatio = portfolio > 0 ? (wo / portfolio) * 100 : 0;

  return {
    oss: { key: 'oss', labelBn: RATIO_LABELS_BN.oss, value: Number(oss.toFixed(3)), formatted: `${(oss * 100).toFixed(1)}%`, unit: 'ratio', benchmark: 1.2 },
    portfolio_yield: { key: 'portfolio_yield', labelBn: RATIO_LABELS_BN.portfolio_yield, value: Number(yieldPct.toFixed(2)), formatted: `${yieldPct.toFixed(2)}%`, unit: 'pct', benchmark: 20 },
    cost_per_borrower: { key: 'cost_per_borrower', labelBn: RATIO_LABELS_BN.cost_per_borrower, value: Number(costPerBorrower.toFixed(2)), formatted: costPerBorrower.toFixed(2), unit: 'bdt', benchmark: 500 },
    borrowers_per_officer: { key: 'borrowers_per_officer', labelBn: RATIO_LABELS_BN.borrowers_per_officer, value: Number(perOfficer.toFixed(1)), formatted: perOfficer.toFixed(1), unit: 'count', benchmark: 300 },
    savings_to_loan: { key: 'savings_to_loan', labelBn: RATIO_LABELS_BN.savings_to_loan, value: Number(savingsToLoan.toFixed(3)), formatted: `${(savingsToLoan * 100).toFixed(1)}%`, unit: 'ratio', benchmark: 0.8 },
    write_off_ratio: { key: 'write_off_ratio', labelBn: RATIO_LABELS_BN.write_off_ratio, value: Number(writeOffRatio.toFixed(2)), formatted: `${writeOffRatio.toFixed(2)}%`, unit: 'pct', benchmark: 2 },
  };
}

/* ═══════════════════════════ 4) Regulatory returns + designer ═════════════ */

/** MRA periodic return sections (Microcredit Regulatory Authority). */
export const MRA_RETURN_SECTIONS = [
  'institution_profile',
  'portfolio_quality',
  'savings_and_own_funds',
  'income_expenditure',
  'loan_products',
  'governance',
] as const;
export type MraSection = (typeof MRA_RETURN_SECTIONS)[number];

export const MRA_SECTION_LABELS_BN: Record<MraSection, string> = {
  institution_profile: 'প্রতিষ্ঠানের পরিচিতি',
  portfolio_quality: 'ঋণের মান ও ঝুঁকি',
  savings_and_own_funds: 'সঞ্চয় ও নিজস্ব তহবিল',
  income_expenditure: 'আয়-ব্যয়',
  loan_products: 'ঋণ পণ্য',
  governance: 'সুশাসন',
};

/** Partner templates (PKSF etc.). */
export const PARTNER_TEMPLATES = ['pksf_quarterly', 'pksf_annual', 'custom'] as const;
export type PartnerTemplate = (typeof PARTNER_TEMPLATES)[number];

export const PARTNER_TEMPLATE_LABELS_BN: Record<PartnerTemplate, string> = {
  pksf_quarterly: 'পিকেএসএফ ত্রৈমাসিক প্রতিবেদন',
  pksf_annual: 'পিকেএসএফ বার্ষিক প্রতিবেদন',
  custom: 'কাস্টম টেমপ্লেট',
};

/**
 * ── Report designer (configurable templates) ───────────────────────────────
 * A template is an ordered list of rows. Each row has a code, label and a
 * FORMULA over named snapshot values (`values` map), e.g. "=oss" or
 * "=outstanding/1000" or plain text ("-"). Rows can be sections or totals.
 * Adding a new circular = inserting a template row set; no code changes.
 */
export const REPORT_FORMULA_OPS = ['+', '-', '*', '/', '(', ')'] as const;

export interface TemplateRow {
  code: string;
  labelBn: string;
  /** Formula string: "=expr" evaluates against snapshot values; "-" or text is literal. */
  formula: string;
  kind: 'value' | 'section' | 'note';
  unit?: 'bdt' | 'count' | 'pct' | 'ratio';
  bold?: boolean;
}

export const templateRowSchema = z.object({
  code: z.string().trim().min(1).max(30),
  labelBn: z.string().trim().min(1).max(200),
  formula: z.string().trim().max(300).default('-'),
  kind: z.enum(['value', 'section', 'note']).default('value'),
  unit: z.enum(['bdt', 'count', 'pct', 'ratio']).default('bdt'),
  bold: z.boolean().default(false),
});
export type TemplateRowBody = z.infer<typeof templateRowSchema>;

export const reportTemplateSchema = z.object({
  name: z.string().trim().min(2).max(160),
  regulator: z.enum(['MRA', 'PKSF', 'OTHER']),
  section: z.string().trim().max(60).default(''),
  /** Official circular reference this template mirrors, e.g. "MRA Circular 12/2025". */
  circularRef: z.string().trim().max(160).default(''),
  /** Templates must be marked for verification against the latest official circular. */
  needsVerification: z.boolean().default(true),
  rows: z.array(templateRowSchema).min(1).max(200),
});
export type ReportTemplateBody = z.infer<typeof reportTemplateSchema>;

export interface ReportTemplate extends ReportTemplateBody {
  id: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedRegulatoryRow {
  code: string;
  labelBn: string;
  kind: 'value' | 'section' | 'note';
  unit: 'bdt' | 'count' | 'pct' | 'ratio';
  value: string | null;
  bold: boolean;
}

export interface GeneratedRegulatoryReturn {
  templateId: string;
  templateName: string;
  regulator: 'MRA' | 'PKSF' | 'OTHER';
  circularRef: string;
  needsVerification: boolean;
  periodStart: string;
  periodEnd: string;
  rows: GeneratedRegulatoryRow[];
  generatedAt: string;
  missingValues: string[];
}

/**
 * Tiny safe arithmetic evaluator: numbers, + - * / ( ), and identifiers
 * resolved from the values map. No function calls, no property access —
 * formulas come from admins, so keep the surface closed.
 */
export function evalFormula(expr: string, values: Record<string, number>): number | null {
  const src = expr.replace(/^\s*=\s*/, '').trim();
  if (!src) return null;
  // Tokenize: numbers, identifiers, operators, parens.
  const tokens: string[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j += 1;
      tokens.push(src.slice(i, j));
      i = j;
      continue;
    }
    if (/[A-Za-z_\u0980-\u09FF]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_\u0980-\u09FF]/.test(src[j]!)) j += 1;
      tokens.push(src.slice(i, j));
      i = j;
      continue;
    }
    if ('+-*/()'.includes(ch)) { tokens.push(ch); i += 1; continue; }
    return null; // unknown character → invalid formula
  }
  let pos = 0;
  const peek = () => tokens[pos];
  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (peek() === '+' || peek() === '-') {
      const op = tokens[pos++]!;
      const right = parseTerm();
      if (right === null) return null;
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };
  const parseTerm = (): number | null => {
    let left = parseFactor();
    if (left === null) return null;
    while (peek() === '*' || peek() === '/') {
      const op = tokens[pos++]!;
      const right = parseFactor();
      if (right === null) return null;
      if (op === '/' && right === 0) return null;
      left = op === '*' ? left * right : left / right;
    }
    return left;
  };
  const parseFactor = (): number | null => {
    const t = peek();
    if (t === undefined) return null;
    if (t === '(') {
      pos += 1;
      const v = parseExpr();
      if (v === null || peek() !== ')') return null;
      pos += 1;
      return v;
    }
    if (t === '-') { pos += 1; const v = parseFactor(); return v === null ? null : -v; }
    if (t === '+') { pos += 1; return parseFactor(); }
    if (/^[0-9.]+$/.test(t)) { pos += 1; const n = Number(t); return Number.isFinite(n) ? n : null; }
    if (/^[A-Za-z_\u0980-\u09FF][A-Za-z0-9_\u0980-\u09FF]*$/.test(t)) {
      pos += 1;
      return t in values ? values[t]! : null; // missing identifier → null (surfaced as missingValues)
    }
    return null;
  };
  const result = parseExpr();
  if (result === null || pos !== tokens.length) return null;
  return Number.isFinite(result) ? result : null;
}

/** Collect identifiers a formula references (for validation UI + missing-values). */
export function formulaIdentifiers(expr: string): string[] {
  const ids = new Set<string>();
  const src = expr.replace(/^\s*=\s*/, '');
  const re = /[A-Za-z_\u0980-\u09FF][A-Za-z0-9_\u0980-\u09FF]*/g;
  for (const m of src.matchAll(re)) {
    const t = m[0];
    if (!['+', '-', '*', '/', '(', ')'].includes(t ?? '')) ids.add(t!);
  }
  return [...ids];
}

/** Validate a template body before save: formulas must parse against a probe. */
export function validateTemplate(t: ReportTemplateBody, probeValues: Record<string, number> = {}): { ok: boolean; errors: string[]; missingIdentifiers: string[] } {
  const errors: string[] = [];
  const missing = new Set<string>();
  for (const row of t.rows) {
    if (row.kind === 'section' || row.kind === 'note') continue;
    if (!row.formula.startsWith('=')) {
      errors.push(`row ${row.code}: formula must start with "="`);
      continue;
    }
    // Syntax check: eval against all-ones probe so unknown identifiers are the only failure.
    const ids = formulaIdentifiers(row.formula);
    const probe: Record<string, number> = { ...probeValues };
    for (const id of ids) if (!(id in probe)) probe[id] = 1;
    const v = evalFormula(row.formula, probe);
    if (v === null) errors.push(`row ${row.code}: invalid formula "${row.formula}"`);
    for (const id of ids) if (!(id in probeValues)) missing.add(id);
  }
  return { ok: errors.length === 0, errors, missingIdentifiers: [...missing] };
}

/** Generate a filled regulatory return from a template + snapshot values. */
export function generateRegulatoryReturn(t: ReportTemplate, values: Record<string, number>, periodStart: string, periodEnd: string): GeneratedRegulatoryReturn {
  const rows: GeneratedRegulatoryRow[] = [];
  const missingValues = new Set<string>();
  for (const row of t.rows) {
    if (row.kind === 'section' || row.kind === 'note' || !row.formula.startsWith('=')) {
      rows.push({ code: row.code, labelBn: row.labelBn, kind: row.kind, unit: row.unit, value: null, bold: row.bold });
      continue;
    }
    const v = evalFormula(row.formula, values);
    if (v === null) {
      for (const id of formulaIdentifiers(row.formula)) if (!(id in values)) missingValues.add(id);
      rows.push({ code: row.code, labelBn: row.labelBn, kind: 'value', unit: row.unit, value: null, bold: row.bold });
      continue;
    }
    const formatted =
      row.unit === 'pct' ? `${v.toFixed(2)}%`
      : row.unit === 'ratio' ? v.toFixed(3)
      : row.unit === 'count' ? String(Math.round(v))
      : v.toFixed(2);
    rows.push({ code: row.code, labelBn: row.labelBn, kind: 'value', unit: row.unit, value: formatted, bold: row.bold });
  }
  return {
    templateId: t.id,
    templateName: t.name,
    regulator: t.regulator,
    circularRef: t.circularRef,
    needsVerification: t.needsVerification,
    periodStart,
    periodEnd,
    rows,
    generatedAt: new Date().toISOString(),
    missingValues: [...missingValues],
  };
}

/** Built-in MRA return starter template (rows from the standard return layout). */
export function mraStarterTemplate(): ReportTemplateBody {
  return {
    name: 'MRA ত্রৈমাসিক রিটার্ন (স্টার্টার)',
    regulator: 'MRA',
    section: MRA_RETURN_SECTIONS[2],
    circularRef: 'MRA standard return layout — verify against latest circular',
    needsVerification: true,
    rows: [
      { code: 'SEC_SAV', labelBn: 'সঞ্চয় ও নিজস্ব তহবিল', formula: '-', kind: 'section', unit: 'bdt', bold: false },
      { code: 'M1', labelBn: 'মোট সঞ্চয়', formula: '=total_savings', kind: 'value', unit: 'bdt', bold: false },
      { code: 'M2', labelBn: 'নিজস্ব তহবিল', formula: '=own_funds', kind: 'value', unit: 'bdt', bold: false },
      { code: 'M3', labelBn: 'বকেয়া ঋণ (মূল)', formula: '=outstanding', kind: 'value', unit: 'bdt', bold: true },
      { code: 'SEC_PQ', labelBn: 'ঋণের মান', formula: '-', kind: 'section', unit: 'bdt', bold: false },
      { code: 'M4', labelBn: 'ওএসএস', formula: '=oss', kind: 'value', unit: 'ratio', bold: false },
      { code: 'M5', labelBn: 'পার-৩০ (%)', formula: '=par30', kind: 'value', unit: 'pct', bold: false },
      { code: 'M6', labelBn: 'ঋণগ্রহীতা সংখ্যা', formula: '=borrowers', kind: 'value', unit: 'count', bold: false },
    ],
  };
}

/** Built-in PKSF quarterly template (exposure summary per funded org). */
export function pksfStarterTemplate(): ReportTemplateBody {
  return {
    name: 'PKSF ত্রৈমাসিক প্রতিবেদন (স্টার্টার)',
    regulator: 'PKSF',
    section: '',
    circularRef: 'PKSF quarterly reporting format — verify against latest PO circular',
    needsVerification: true,
    rows: [
      { code: 'P1', labelBn: 'বকেয়া ঋণ', formula: '=outstanding', kind: 'value', unit: 'bdt', bold: true },
      { code: 'P2', labelBn: 'মোট সঞ্চয়', formula: '=total_savings', kind: 'value', unit: 'bdt', bold: false },
      { code: 'P3', labelBn: 'ঋণগ্রহীতা', formula: '=borrowers', kind: 'value', unit: 'count', bold: false },
      { code: 'P4', labelBn: 'সঞ্চয়-ঋণ অনুপাত', formula: '=total_savings/outstanding', kind: 'value', unit: 'ratio', bold: false },
      { code: 'P5', labelBn: 'নোট: সর্বশেষ সার্কুলারের সাথে যাচাই প্রয়োজন', formula: '-', kind: 'note', unit: 'bdt', bold: false },
    ],
  };
}

/** Bangla-digit rendering of a generated return (web export helper). */
export function renderRegulatoryTextBn(g: GeneratedRegulatoryReturn, orgNameBn: string): string {
  const lines: string[] = [
    orgNameBn,
    `${g.regulator} প্রতিবেদন — ${g.templateName}`,
    `মেয়াদ: ${toBanglaDigits(g.periodStart)} থেকে ${toBanglaDigits(g.periodEnd)}`,
    '',
  ];
  for (const r of g.rows) {
    lines.push(`${r.kind === 'section' ? '■' : ' '} ${r.labelBn}${r.value !== null ? `: ${r.value}` : ''}`);
  }
  if (g.needsVerification) {
    lines.push('', '⚠ সর্বশেষ দপ্তর/সার্কুলারের সাথে যাচাই প্রয়োজন।');
  }
  return lines.join('\n');
}

/* ── Dashboard builders from snapshot ─────────────────────────────────────── */

export function branchRanking(s: MisSnapshot): BranchRankRow[] {
  const rows: BranchRankRow[] = s.branches.map((b) => {
    const loans = s.loans.filter((l) => l.branchId === b.id);
    const outstanding = loans.reduce((t, l) => t + num(l.outstanding), 0);
    const par30Base = outstanding || 1;
    const par30 = loans.filter((l) => l.daysPastDue >= 30).reduce((t, l) => t + num(l.outstanding), 0) / par30Base;
    const staff = s.staff.filter((x) => x.branchId === b.id);
    const due = staff.reduce((t, x) => t + num(x.dueAmount), 0);
    const col = staff.reduce((t, x) => t + num(x.collectedAmount), 0);
    const eff = due > 0 ? col / due : 0;
    const score = eff * 100 * 0.4 + (1 - Math.min(1, par30 * 5)) * 100 * 0.4 + Math.min(1, b.members / 500) * 100 * 0.2;
    return {
      branchName: b.name,
      members: b.members,
      outstanding: outstanding.toFixed(2),
      collectionEffPct: Number((eff * 100).toFixed(1)),
      par30Pct: Number((par30 * 100).toFixed(2)),
      score: Number(score.toFixed(1)),
      rank: 0,
    };
  });
  rows.sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}

export function headOfficeDashboard(s: MisSnapshot, ratios: Record<RatioKey, FinancialRatio>, prev?: { members: number; outstanding: string; savings: string }): HeadOfficeDashboard {
  const outstanding = s.loans.reduce((t, l) => t + num(l.outstanding), 0);
  const ranked = branchRanking(s);
  const totalMembers = s.branches.reduce((t, b) => t + b.members, 0) || s.members.length;
  const growth = (now: number, before: number | null | undefined): number =>
    before !== null && before !== undefined && before > 0 ? ((now - before) / before) * 100 : 0;
  return {
    role: 'head_office',
    date: s.asOf,
    portfolio: {
      outstanding: outstanding.toFixed(2),
      activeLoans: s.loans.length,
      borrowers: new Set(s.loans.map((l) => l.memberId)).size,
      avgLoanSize: (s.loans.length ? outstanding / s.loans.length : 0).toFixed(2),
      disbursementYtd: s.loanStats.disbursedYtd,
      collectionYtd: s.loanStats.collectedYtd,
    },
    growth: {
      memberGrowthPct: Number(growth(totalMembers, prev?.members ?? null).toFixed(2)),
      portfolioGrowthPct: Number(growth(outstanding, prev ? num(prev.outstanding) : null).toFixed(2)),
      savingsGrowthPct: Number(growth(num(s.savings.totalBalance), prev ? num(prev.savings) : null).toFixed(2)),
    },
    ratios,
    savings: { totalSavings: s.savings.totalBalance, membersWithSavings: s.savings.memberIdsWithSavings.size },
    branchesRanked: ranked,
  };
}

/** Branch-manager dashboard: collection efficiency, PAR, cash position. */
export function buildBranchDashboard(
  s: MisSnapshot,
  branchId: string,
  cash: BranchManagerDashboard['cash'],
): BranchManagerDashboard {
  const branch = s.branches.find((b) => b.id === branchId);
  const loans = s.loans.filter((l) => l.branchId === branchId);
  const staff = s.staff.filter((x) => x.branchId === branchId);
  const due = staff.reduce((t, x) => t + num(x.dueAmount), 0);
  const collected = staff.reduce((t, x) => t + num(x.collectedAmount), 0);
  const atRisk = loans.filter((l) => l.daysPastDue > 0).reduce((t, l) => t + num(l.outstanding), 0);
  const par = loans.length
    ? {
        scope: 'branch' as const,
        scopeId: branchId,
        scopeName: branch?.name ?? '—',
        outstandingTotal: loans.reduce((t, l) => t + num(l.outstanding), 0).toFixed(2),
        atRisk: atRisk.toFixed(2),
        par1: 0,
        par30: 0,
        par90: 0,
        onTimeRepaymentRate: loans.length ? loans.filter((l) => l.daysPastDue === 0).length / loans.length : 1,
        loansTotal: loans.length,
        loansAtRisk: loans.filter((l) => l.daysPastDue > 0).length,
      }
    : null;
  return {
    role: 'branch_manager',
    branchName: branch?.name ?? '—',
    date: s.asOf,
    collection: {
      dueThisMonth: due.toFixed(2),
      collectedThisMonth: collected.toFixed(2),
      efficiencyPct: due > 0 ? Number(((collected / due) * 100).toFixed(1)) : 0,
      onTimeRate: Number(((s.loanStats.paidInstallments / Math.max(1, s.loanStats.dueInstallments)) * 100).toFixed(1)),
    },
    par,
    cash,
    officers: staff.map((x) => ({
      officerName: x.officerName,
      dueAmount: x.dueAmount,
      collectedAmount: x.collectedAmount,
      efficiencyPct: num(x.dueAmount) > 0 ? Number(((num(x.collectedAmount) / num(x.dueAmount)) * 100).toFixed(1)) : 0,
    })),
  };
}

/** Board summary: KPI cards only — no operational detail. */
export function buildBoardDashboard(s: MisSnapshot, ratios: Record<RatioKey, FinancialRatio>, ho: HeadOfficeDashboard): BoardDashboard {
  const kpi = (key: string, labelBn: string, value: string, tone: KpiCard['tone'], hintBn?: string): KpiCard => ({ key, labelBn, value, tone, hintBn });
  const oss = ratios.oss.value;
  const par30 = ho.branchesRanked[0]?.par30Pct ?? 0;
  return {
    role: 'board',
    date: s.asOf,
    summary: [
      kpi('members', 'মোট সদস্য', String(s.members.length), 'default'),
      kpi('outstanding', 'বকেয়া ঋণ', s.loanStats.collectedYtd === s.loanStats.disbursedYtd ? s.loans.reduce((t, l) => t + num(l.outstanding), 0).toFixed(2) : ho.portfolio.outstanding, 'default'),
      kpi('savings', 'মোট সঞ্চয়', s.savings.totalBalance, 'default'),
      kpi('oss', 'OSS', ratios.oss.formatted, oss >= 1.2 ? 'good' : oss >= 1 ? 'warn' : 'bad', 'লক্ষ্য ≥ ১২০%'),
      kpi('par30', 'PAR-30', `${ho.branchesRanked.length ? ((ho.branchesRanked.reduce((t, b) => t + b.par30Pct, 0) / ho.branchesRanked.length)).toFixed(2) : '0.00'}%`, ho.branchesRanked.every((b) => b.par30Pct < 5) ? 'good' : 'warn'),
      kpi('efficiency', 'আদায় দক্ষতা', `${ho.branchesRanked.length ? (ho.branchesRanked.reduce((t, b) => t + b.collectionEffPct, 0) / ho.branchesRanked.length).toFixed(1) : '0.0'}%`, 'default'),
    ],
    headline: `${s.orgNameBn}: ${s.members.length} সদস্য, OSS ${ratios.oss.formatted}`,
  };
}

/** Field-officer dashboard: today's sheet, targets, overdue clients. */
export function buildOfficerDashboard(
  s: MisSnapshot,
  officerName: string,
  officerId: string,
  todaySheet: OfficerDayRow[],
  targets: OfficerTargetRow[],
): FieldOfficerDashboard {
  const due = todaySheet.reduce((t, r) => t + num(r.dueAmount), 0);
  const collected = todaySheet.reduce((t, r) => t + num(r.collectedAmount), 0);
  const overdueClients = s.loans
    .filter((l) => l.officerId === officerId && l.daysPastDue > 0)
    .sort((a, b) => b.daysPastDue - a.daysPastDue)
    .slice(0, 10)
    .map((l) => ({ memberName: l.memberName, overdueAmount: l.overdueTotal, daysPastDue: l.daysPastDue }));
  return {
    role: 'field_officer',
    officerName,
    date: s.asOf,
    todaySheet,
    summary: {
      dueAmount: due.toFixed(2),
      collectedAmount: collected.toFixed(2),
      collectionPct: due > 0 ? Number(((collected / due) * 100).toFixed(1)) : 0,
      membersDue: todaySheet.reduce((t, r) => t + r.dueInstallments, 0),
    },
    targets,
    overdueClients,
  };
}

export function areaZoneDashboard(s: MisSnapshot, areaName: string, zoneName: string): AreaZoneDashboard {
  const branches = branchRanking(s);
  const members = s.branches.reduce((t, b) => t + b.members, 0);
  const outstanding = s.loans.reduce((t, l) => t + num(l.outstanding), 0);
  const par30 = s.loans.filter((l) => l.daysPastDue >= 30).reduce((t, l) => t + num(l.outstanding), 0);
  return {
    role: 'area_zone',
    areaName,
    zoneName: zoneName ?? areaName,
    date: s.asOf,
    branches,
    totals: {
      members,
      outstanding: outstanding.toFixed(2),
      par30Pct: outstanding > 0 ? Number(((par30 / outstanding) * 100).toFixed(2)) : 0,
      avgEfficiencyPct: branches.length ? Number((branches.reduce((t, b) => t + b.collectionEffPct, 0) / branches.length).toFixed(1)) : 0,
    },
  };
}
