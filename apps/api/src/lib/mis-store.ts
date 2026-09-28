/**
 * ── Reports/MIS demo store ───────────────────────────────────────────────────
 * Builds the MisSnapshot from the existing demo stores (delinquency
 * classifications, savings, loan disbursements, utilization visits) and
 * serves role dashboards, standard reports, financial ratios and the
 * regulatory template/return registry. Preview/test only — the Supabase path
 * uses migrations 0048/0049 with the same shapes.
 */
import { randomUUID } from 'node:crypto';
import {
  areaZoneDashboard,
  buildBoardDashboard,
  buildOfficerDashboard,
  collectionEfficiencyReport,
  computeRatios,
  disbursementRegisterReport,
  dropoutAnalysisReport,
  generateRegulatoryReturn,
  headOfficeDashboard,
  loanStatementReport,
  loanUtilizationReport,
  memberStatementReport,
  mraStarterTemplate,
  outstandingLoansReport,
  overdueAgingReport,
  pksfStarterTemplate,
  samityListReport,
  savingsPositionReport,
  staffProductivityReport,
  validateTemplate,
  type BoardDashboard,
  type FinancialRatio,
  type MisSnapshot,
  type RatioInputs,
  type RatioKey,
  type ReportTemplate,
  type ReportTemplateBody,
  type RoleDashboard,
  type StandardReport,
  type StandardReportKind,
  num,
} from '@samity/shared';
import { delinquencyDemoStore, listClassifiedLoans, runNightlyClassification, DEMO_OFFICER_ID, DEMO_OFFICER_NAME } from './delinquency-store.js';
import { savingsDemoStore } from './savings-store.js';
import { loanDemoStore } from './loan-store.js';
import { ProgramsError } from './programs-store.js';

export { ProgramsError };

function err(status: number, code: string, message: string): never {
  throw new ProgramsError(status, code, message);
}

function memberNameOf(memberId: string, classified: MisSnapshot['loans']): string | null {
  return classified.find((l) => l.memberId === memberId)?.memberName ?? null;
}

export interface MisReturnRow {
  id: string;
  templateId: string;
  periodStart: string;
  periodEnd: string;
  generated: ReturnType<typeof generateRegulatoryReturn>;
  generatedBy: string;
  generatedAt: string;
  submittedAt: string | null;
}

interface MisRegistryData {
  orgId: string;
  templates: ReportTemplate[];
  returns: MisReturnRow[];
  audit: { id: string; kind: string; params: Record<string, unknown>; requestedBy: string; createdAt: string }[];
}

const globalRef = globalThis as unknown as { __misDemoData?: MisRegistryData };

function seedStore(): MisRegistryData {
  const orgId = '00000000-0000-4000-8000-0000000000aa';
  const now = new Date().toISOString();
  const mra: ReportTemplate = { id: randomUUID(), orgId, ...mraStarterTemplate(), createdAt: now, updatedAt: now };
  const pksf: ReportTemplate = { id: randomUUID(), orgId, ...pksfStarterTemplate(), createdAt: now, updatedAt: now };
  return { orgId, templates: [mra, pksf], returns: [], audit: [] };
}

export function misStore(): MisRegistryData {
  globalRef.__misDemoData ??= seedStore();
  return globalRef.__misDemoData;
}

export function resetMisStore(): void {
  delete globalRef.__misDemoData;
}

/* ── Snapshot assembly ─────────────────────────────────────────────────────── */

const BRANCH_META: Record<string, { name: string; area: string; zone: string }> = {
  '00000000-0000-4000-8000-0000000000b1': { name: 'ধানমন্ডি শাখা', area: 'Dhaka Central Area', zone: 'Dhaka Zone' },
  '00000000-0000-4000-8000-0000000000b2': { name: 'ময়মনসিংহ সদর শাখা', area: 'Mymensingh Sadar Area', zone: 'Mymensingh Zone' },
};

/** Build the org snapshot from the live demo stores. */
export function buildSnapshot(asOf: string): MisSnapshot {
  const del = delinquencyDemoStore();
  const savings = savingsDemoStore();
  const loans = loanDemoStore();

  // Ensure the nightly classification has run so the snapshot is never empty.
  let classified = listClassifiedLoans(del);
  if (classified.length === 0) {
    runNightlyClassification(loans);
    classified = listClassifiedLoans(del);
  }
  const loanNumberByApp = new Map(loans.disbursements.map((d) => [d.applicationId, d.applicationNumber]));

  const members: MisSnapshot['members'] = classified.map((l) => ({
    id: l.memberId,
    code: l.memberCode,
    name: l.memberName,
    branchId: l.branchId,
    samityName: l.samityId ?? 'সমিতি',
    joinedAt: l.disbursedOn,
    active: l.daysPastDue === 0,
    droppedOutAt: null,
    dropoutReason: null,
  }));

  const branches: MisSnapshot['branches'] = Object.keys(BRANCH_META).map((id) => {
    const branchLoans = classified.filter((l) => l.branchId === id);
    return {
      id,
      name: BRANCH_META[id]!.name,
      areaName: BRANCH_META[id]!.area,
      zoneName: BRANCH_META[id]!.zone,
      members: branchLoans.length,
      centers: new Set(branchLoans.map((l) => l.samityId ?? 's1')).size,
    };
  });

  const savingsBalance = savings.accounts.reduce((t, a) => t + (a.status === 'closed' ? 0 : Number(a.balance)), 0);
  const byType = new Map<string, { accounts: number; balance: number }>();
  for (const a of savings.accounts) {
    if (a.status === 'closed') continue;
    const product = savings.products.find((p) => p.id === a.product_id);
    const type = product?.product_type ?? 'other';
    const row = byType.get(type) ?? { accounts: 0, balance: 0 };
    row.accounts += 1;
    row.balance += Number(a.balance);
    byType.set(type, row);
  }

  const ytdStart = `${asOf.slice(0, 4)}-01-01`;
  const monthStart = `${asOf.slice(0, 8)}01`;
  const done = (d: { status: string; disbursementDate: string; amount: string }) => d.status === 'completed';
  const disbursedYtd = loans.disbursements.filter((d) => done(d) && d.disbursementDate >= ytdStart && d.disbursementDate <= asOf).reduce((t, d) => t + Number(d.amount), 0);
  const disbursedPeriod = loans.disbursements.filter((d) => done(d) && d.disbursementDate >= monthStart && d.disbursementDate <= asOf).reduce((t, d) => t + Number(d.amount), 0);

  const utilization = loans.utilizationVisits
    .filter((u) => u.status === 'completed' && u.visitedAt)
    .map((u) => {
      const app = loans.applications.find((a) => a.id === u.applicationId);
      const disbursement = loans.disbursements.find((d) => d.applicationId === u.applicationId);
      return {
        loanNumber: disbursement?.applicationNumber ?? loanNumberByApp.get(u.applicationId) ?? '—',
        memberName: app ? (memberNameOf(app.memberId, classified) ?? 'সদস্য') : 'সদস্য',
        visitedAt: u.visitedAt!,
        finding: (u.notes?.includes('diverted') ? 'diverted' : u.notes?.includes('partial') ? 'partially_utilized' : 'fully_utilized') as 'fully_utilized' | 'partially_utilized' | 'not_utilized' | 'diverted',
        findingsNote: u.notes ?? '',
      };
    });

  const snapshot: MisSnapshot = {
    asOf,
    orgId: misStore().orgId,
    orgNameBn: 'স্যামিটি ডেমো সমবায় সমিতি',
    branches,
    members,
    loans: classified,
    loanStats: {
      disbursedPeriod: disbursedPeriod.toFixed(2),
      disbursedYtd: disbursedYtd.toFixed(2),
      collectedPeriod: (disbursedPeriod * 0.9).toFixed(2),
      collectedYtd: (disbursedYtd * 0.92).toFixed(2),
      writtenOff: '0.00',
      dueInstallments: classified.length * 12,
      paidInstallments: classified.filter((l) => l.daysPastDue === 0).length * 12,
    },
    savings: {
      accounts: savings.accounts.filter((a) => a.status !== 'closed').length,
      totalBalance: Math.max(0, savingsBalance).toFixed(2),
      byType: [...byType.entries()].map(([type, v]) => ({ type, accounts: v.accounts, balance: v.balance.toFixed(2) })),
      memberIdsWithSavings: new Set(savings.accounts.filter((a) => a.status !== 'closed').map((a) => a.member_id)),
    },
    utilization,
    staff: demoStaff(classified),
  };
  return snapshot;
}

/** Demo staff rollup: per-officer borrowers/due/collected from classifications. */
function demoStaff(snapshotLoans: MisSnapshot['loans']): MisSnapshot['staff'] {
  const officers = new Map<string, { branchId: string; borrowers: Set<string>; due: number; overdue: number; samities: Set<string> }>();
  for (const l of snapshotLoans) {
    const id = l.officerId ?? DEMO_OFFICER_ID;
    const row = officers.get(id) ?? { branchId: l.branchId, borrowers: new Set<string>(), due: 0, overdue: 0, samities: new Set<string>() };
    row.borrowers.add(l.memberId);
    row.samities.add(l.samityId ?? 's1');
    row.due += num(l.outstanding) * 0.12; // monthly demand ≈ 12% of outstanding
    row.overdue += num(l.overdueTotal);
    officers.set(id, row);
  }
  return [...officers.entries()].map(([officerId, o]) => ({
    officerId,
    officerName: officerId === DEMO_OFFICER_ID ? DEMO_OFFICER_NAME : 'Demo Admin (কেন্দ্র পরিচালক)',
    branchId: o.branchId,
    borrowers: o.borrowers.size,
    dueAmount: Math.max(0, o.due).toFixed(2),
    collectedAmount: Math.max(0, o.due - o.overdue).toFixed(2),
    samities: o.samities.size,
  }));
}

/** Named formula values for the regulatory designer (mirrors mis_formula_values). */
export function formulaValues(s: MisSnapshot, ratios: Record<RatioKey, FinancialRatio>): Record<string, number> {
  const outstanding = s.loans.reduce((t, l) => t + num(l.outstanding), 0);
  return {
    total_savings: num(s.savings.totalBalance),
    own_funds: num(s.savings.totalBalance) * 2, // demo proxy: own funds ≈ 2× savings
    outstanding,
    borrowers: new Set(s.loans.map((l) => l.memberId)).size,
    oss: ratios.oss.value,
    par30: outstanding > 0 ? (s.loans.filter((l) => l.daysPastDue >= 30).reduce((t, l) => t + num(l.outstanding), 0) / outstanding) * 100 : 0,
    active_loans: s.loans.length,
    branches: s.branches.length,
    members: s.branches.reduce((t, b) => t + b.members, 0),
    written_off: num(s.loanStats.writtenOff),
  };
}

/** Ratio inputs derived from snapshot (demo proxies where the GL is thin). */
export function ratioInputs(s: MisSnapshot): RatioInputs {
  const outstanding = s.loans.reduce((t, l) => t + num(l.outstanding), 0);
  const interestYtd = num(s.loanStats.collectedYtd) * 0.18; // ≈18% of collections is interest/fees
  return {
    operatingIncome: (interestYtd * 1.1).toFixed(2),
    operatingExpense: (interestYtd * 0.75).toFixed(2),
    financialExpense: (interestYtd * 0.25).toFixed(2),
    interestFeesIncome: interestYtd.toFixed(2),
    avgPortfolio: (outstanding || 1).toFixed(2),
    totalOperatingCost: (interestYtd * 0.75).toFixed(2),
    borrowers: new Set(s.loans.map((l) => l.memberId)).size,
    fieldOfficers: Math.max(1, new Set(s.loans.map((l) => l.officerId ?? 'u')).size),
    totalSavings: s.savings.totalBalance,
    avgOutstandingLoans: (outstanding || 1).toFixed(2),
    writtenOff: s.loanStats.writtenOff,
  };
}

export function ratiosFor(asOf: string): Record<RatioKey, FinancialRatio> {
  return computeRatios(ratioInputs(buildSnapshot(asOf)));
}

/* ── Dashboards (req 1) ────────────────────────────────────────────────────── */

export interface MisViewer {
  role: string;
  userId: string;
  name: string;
  branchId: string | null;
}

export function dashboardForRole(viewer: MisViewer, overrideRole?: string): RoleDashboard {
  const asOf = new Date().toISOString().slice(0, 10);
  const s = buildSnapshot(asOf);
  const ratios = computeRatios(ratioInputs(s));
  // Demo override lets any signed-in preview role inspect each dashboard;
  // production (Supabase path) resolves the role from the JWT only.
  const role = overrideRole ?? viewer.role;

  if (role === 'account_officer') {
    const officer = s.staff.find((x) => x.officerId === DEMO_OFFICER_ID) ?? s.staff[0];
    const sheet = [
      {
        samityName: 'গাজীপুর সমিতি',
        meetingDate: asOf,
        dueInstallments: 24,
        collectedInstallments: 22,
        dueAmount: officer?.dueAmount ?? '0.00',
        collectedAmount: officer?.collectedAmount ?? '0.00',
        savingsDue: '1200.00',
        savingsCollected: '1140.00',
      },
    ];
    return buildOfficerDashboard(s, officer?.officerName ?? viewer.name, officer?.officerId ?? DEMO_OFFICER_ID, sheet, [
      { metric: 'collection', labelBn: 'আদায়', target: 100, actual: 92, achievementPct: 92 },
      { metric: 'new_members', labelBn: 'নতুন সদস্য', target: 4, actual: 3, achievementPct: 75 },
      { metric: 'savings', labelBn: 'সঞ্চয়', target: 1500, actual: 1140, achievementPct: 76 },
    ]);
  }

  if (role === 'branch_manager') {
    const branchId = viewer.branchId ?? s.branches[0]!.id;
    const branchStaff = s.staff.filter((x) => x.branchId === branchId);
    const due = branchStaff.reduce((t, x) => t + num(x.dueAmount), 0);
    const col = branchStaff.reduce((t, x) => t + num(x.collectedAmount), 0);
    const branchLoans = s.loans.filter((l) => l.branchId === branchId);
    const outstandingTotal = branchLoans.reduce((t, l) => t + num(l.outstanding), 0);
    const atRisk = branchLoans.filter((l) => l.daysPastDue > 0).reduce((t, l) => t + num(l.outstanding), 0);
    const at30 = branchLoans.filter((l) => l.daysPastDue >= 30).reduce((t, l) => t + num(l.outstanding), 0);
    return {
      role: 'branch_manager',
      branchName: BRANCH_META[branchId]?.name ?? '—',
      date: asOf,
      collection: {
        dueThisMonth: due.toFixed(2),
        collectedThisMonth: col.toFixed(2),
        efficiencyPct: due > 0 ? Number(((col / due) * 100).toFixed(1)) : 0,
        onTimeRate: Number(((s.loanStats.paidInstallments / Math.max(1, s.loanStats.dueInstallments)) * 100).toFixed(1)),
      },
      par: branchLoans.length
        ? {
            scope: 'branch',
            scopeId: branchId,
            scopeName: BRANCH_META[branchId]?.name ?? '—',
            outstandingTotal: outstandingTotal.toFixed(2),
            atRisk: atRisk.toFixed(2),
            par1: outstandingTotal > 0 ? atRisk / outstandingTotal : 0,
            par30: outstandingTotal > 0 ? at30 / outstandingTotal : 0,
            par90: outstandingTotal > 0 ? branchLoans.filter((l) => l.daysPastDue >= 90).reduce((t, l) => t + num(l.outstanding), 0) / outstandingTotal : 0,
            onTimeRepaymentRate: branchLoans.length ? branchLoans.filter((l) => l.daysPastDue === 0).length / branchLoans.length : 1,
            loansTotal: branchLoans.length,
            loansAtRisk: branchLoans.filter((l) => l.daysPastDue > 0).length,
          }
        : null,
      cash: {
        opening: '50000.00',
        collections: col.toFixed(2),
        disbursements: s.loanStats.disbursedPeriod,
        closing: (50000 + col - num(s.loanStats.disbursedPeriod)).toFixed(2),
        handoverPending: false,
      },
      officers: branchStaff.map((x) => ({
        officerName: x.officerName,
        dueAmount: x.dueAmount,
        collectedAmount: x.collectedAmount,
        efficiencyPct: num(x.dueAmount) > 0 ? Number(((num(x.collectedAmount) / num(x.dueAmount)) * 100).toFixed(1)) : 0,
      })),
    };
  }

  if (role === 'area_manager') {
    const b = s.branches[0];
    return areaZoneDashboard(s, b?.areaName ?? '—', b?.zoneName ?? '—');
  }

  if (role === 'member') {
    const ho = headOfficeDashboard(s, ratios);
    return buildBoardDashboard(s, ratios, ho);
  }

  return headOfficeDashboard(s, ratios);
}

export function boardDashboard(): BoardDashboard {
  const asOf = new Date().toISOString().slice(0, 10);
  const s = buildSnapshot(asOf);
  const ratios = computeRatios(ratioInputs(s));
  return buildBoardDashboard(s, ratios, headOfficeDashboard(s, ratios));
}

/* ── Standard reports (req 2) ─────────────────────────────────────────────── */

export function standardReport(kind: StandardReportKind, params: { start?: string; end?: string; memberId?: string; loanId?: string; branchId?: string }, requestedBy: string): StandardReport {
  const asOf = new Date().toISOString().slice(0, 10);
  const s = buildSnapshot(asOf);
  const start = params.start ?? `${asOf.slice(0, 8)}01`;
  const end = params.end ?? asOf;

  let report: StandardReport;
  switch (kind) {
    case 'member_statement':
      if (!params.memberId) err(422, 'VALIDATION_ERROR', 'memberId প্রয়োজন / memberId required');
      {
        const member = s.members.find((m) => m.id === params.memberId);
        if (!member) err(404, 'NOT_FOUND', 'সদস্য পাওয়া যায়নি / Member not found');
        const savingsAccts = savingsDemoStore().accounts.filter((a) => a.member_id === params.memberId && a.status !== 'closed');
        const savingsBalance = savingsAccts.reduce((t, a) => t + Number(a.balance), 0).toFixed(2);
        report = memberStatementReport(s, params.memberId, [], savingsBalance);
      }
      break;
    case 'loan_statement':
      if (!params.loanId) err(422, 'VALIDATION_ERROR', 'loanId প্রয়োজন / loanId required');
      {
        const loan = s.loans.find((l) => l.applicationId === params.loanId);
        if (!loan) err(404, 'NOT_FOUND', 'ঋণ পাওয়া যায়নি / Loan not found');
        const txs = [
          { date: loan.disbursedOn, description: 'ঋণ বিতরণ', principal: loan.outstanding, interest: '0.00', total: loan.outstanding, balance: loan.outstanding },
          { date: end, description: 'কিস্তি আদায় (চলতি)', principal: (num(loan.outstanding) * 0.1).toFixed(2), interest: (num(loan.outstanding) * 0.02).toFixed(2), total: (num(loan.outstanding) * 0.12).toFixed(2), balance: (num(loan.outstanding) * 0.88).toFixed(2) },
        ];
        report = loanStatementReport(s, params.loanId, txs);
      }
      break;
    case 'disbursement_register':
      report = disbursementRegisterReport(s, start, end);
      break;
    case 'collection_efficiency':
      report = collectionEfficiencyReport(s, start, end);
      break;
    case 'outstanding_loans':
      report = outstandingLoansReport(s, params.branchId);
      break;
    case 'overdue_aging':
      report = overdueAgingReport(s);
      break;
    case 'savings_position':
      report = savingsPositionReport(s);
      break;
    case 'samity_list':
      report = samityListReport(s);
      break;
    case 'dropout_analysis':
      report = dropoutAnalysisReport(s, start, end);
      break;
    case 'staff_productivity':
      report = staffProductivityReport(s, start, end);
      break;
    case 'loan_utilization':
      report = loanUtilizationReport(s, start, end);
      break;
    default:
      err(422, 'VALIDATION_ERROR', `অজানা রিপোর্ট ${kind} / Unknown report kind`);
  }
  misStore().audit.push({ id: randomUUID(), kind, params, requestedBy, createdAt: new Date().toISOString() });
  return report;
}

/* ── Templates & returns (req 4) ──────────────────────────────────────────── */

export function listTemplates(): ReportTemplate[] {
  return [...misStore().templates];
}

export function getTemplate(id: string): ReportTemplate {
  const t = misStore().templates.find((x) => x.id === id);
  if (!t) err(404, 'NOT_FOUND', 'টেমপ্লেট পাওয়া যায়নি / Template not found');
  return t as ReportTemplate;
}

function probeValues(): Record<string, number> {
  const asOf = new Date().toISOString().slice(0, 10);
  return formulaValues(buildSnapshot(asOf), ratiosFor(asOf));
}

export function createTemplate(body: ReportTemplateBody): ReportTemplate & { validation: ReturnType<typeof validateTemplate> } {
  const validation = validateTemplate(body, probeValues());
  if (!validation.ok) {
    err(422, 'VALIDATION_ERROR', `টেমপ্লেট অবৈধ: ${validation.errors.join('; ')}`);
  }
  const now = new Date().toISOString();
  const t: ReportTemplate = { id: randomUUID(), orgId: misStore().orgId, ...body, createdAt: now, updatedAt: now };
  misStore().templates.push(t);
  return { ...t, validation };
}

export function updateTemplate(id: string, body: ReportTemplateBody): ReportTemplate {
  const t = getTemplate(id);
  const validation = validateTemplate(body, probeValues());
  if (!validation.ok) err(422, 'VALIDATION_ERROR', `টেমপ্লেট অবৈধ: ${validation.errors.join('; ')}`);
  t.name = body.name;
  t.regulator = body.regulator;
  t.section = body.section;
  t.circularRef = body.circularRef;
  t.needsVerification = body.needsVerification;
  t.rows = body.rows;
  t.updatedAt = new Date().toISOString();
  return t;
}

export function verifyTemplate(id: string, verifiedBy: string): ReportTemplate {
  const t = getTemplate(id);
  t.needsVerification = false;
  t.updatedAt = new Date().toISOString();
  t.rows = t.rows; // verifiedBy is recorded in the audit trail below
  misStore().audit.push({ id: randomUUID(), kind: `template_verified:${t.id}`, params: { verifiedBy }, requestedBy: verifiedBy, createdAt: new Date().toISOString() });
  return t;
}

export function deleteTemplate(id: string): void {
  const store = misStore();
  const idx = store.templates.findIndex((x) => x.id === id);
  if (idx === -1) err(404, 'NOT_FOUND', 'টেমপ্লেট পাওয়া যায়নি / Template not found');
  store.templates.splice(idx, 1);
}

export function generateReturn(templateId: string, periodStart: string, periodEnd: string, generatedBy: string): MisReturnRow {
  const t = getTemplate(templateId);
  if (periodEnd < periodStart) err(422, 'VALIDATION_ERROR', 'পর্ব ভুল / Invalid period');
  const store = misStore();
  if (store.returns.some((r) => r.templateId === templateId && r.periodStart === periodStart && r.periodEnd === periodEnd)) {
    err(409, 'CONFLICT', 'এই প্রান্তিকের রিটার্ন আছে / Return already generated');
  }
  const asOf = new Date().toISOString().slice(0, 10);
  const generated = generateRegulatoryReturn(t, probeValues(), periodStart, periodEnd);
  const row: MisReturnRow = { id: randomUUID(), templateId, periodStart, periodEnd, generated, generatedBy, generatedAt: new Date().toISOString(), submittedAt: null };
  store.returns.push(row);
  return row;
}

export function listReturns(templateId?: string): MisReturnRow[] {
  let rows = [...misStore().returns].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  if (templateId) rows = rows.filter((r) => r.templateId === templateId);
  return rows;
}

export function getReturn(id: string): MisReturnRow {
  const r = misStore().returns.find((x) => x.id === id);
  if (!r) err(404, 'NOT_FOUND', 'রিটার্ন পাওয়া যায়নি / Return not found');
  return r as MisReturnRow;
}

export function submitReturn(id: string): { id: string; submittedAt: string } {
  const row = getReturn(id);
  if (row.submittedAt) err(409, 'CONFLICT', 'ইতিমধ্যে দাখিল / Already submitted');
  row.submittedAt = new Date().toISOString();
  return { id: row.id, submittedAt: row.submittedAt };
}

export function listAudit() {
  return [...misStore().audit].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
}
