/**
 * ── Reports/MIS live router (Supabase) ──────────────────────────────────────
 * Mirrors mis.routes.ts against the real tables (migration 0048): role
 * dashboards computed from a live snapshot (branches, members, classified
 * loans, savings, collections, utilization visits), standard reports with
 * audit logging, financial ratios, and the regulatory template designer +
 * return registry.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  STANDARD_REPORTS,
  mraStarterTemplate,
  pksfStarterTemplate,
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
  num,
  outstandingLoansReport,
  overdueAgingReport,
  renderRegulatoryTextBn,
  reportTemplateSchema,
  samityListReport,
  savingsPositionReport,
  staffProductivityReport,
  validateTemplate,
  type FinancialRatio,
  type LoanStatementTx,
  type MisSnapshot,
  type RatioInputs,
  type RatioKey,
  type ReportTemplate,
  type ReportTemplateBody,
  type RoleDashboard,
  type StandardReport,
  type StandardReportKind,
} from '@samity/shared';
import { BadRequest, Conflict, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { orgOf, scopeOrg } from '../lib/tenant.js';
import { classifyLoans, loadSettings } from './delinquency-live.routes.js';

export const misLiveRouter = Router();
misLiveRouter.use(requireAuth);

const todayStr = () => new Date().toISOString().slice(0, 10);

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/* ═════════════════ Live snapshot (mirrors mis-store buildSnapshot) ════════ */

/** Build the org snapshot from the live tables. Exported for MIS-ops (builder, protection, matviews). */
export async function buildLiveSnapshot(orgId: string, asOf: string): Promise<MisSnapshot> {
  const settings = await loadSettings(orgId);
  const classified = await classifyLoans(orgId, settings);

  const ytdStart = `${asOf.slice(0, 4)}-01-01`;
  const monthStart = `${asOf.slice(0, 8)}01`;

  const [branchesRes, samitiesRes, membersRes, savingsRes, disbRes, collRes, visitsRes, orgRes] = await Promise.all([
    supabaseAdmin.from('branches').select('id, name, name_bn, district').eq('org_id', orgId).is('deleted_at', null),
    supabaseAdmin.from('samities').select('id, branch_id, name').eq('org_id', orgId).is('archived_at', null),
    supabaseAdmin.from('members').select('id, member_code, full_name, branch_id, samity_id, status, join_date').eq('org_id', orgId).is('deleted_at', null),
    supabaseAdmin.from('savings_accounts').select('member_id, product, balance').eq('org_id', orgId).is('deleted_at', null).neq('status', 'closed'),
    supabaseAdmin.from('loan_disbursements').select('disbursement_date, loan_applications(requested_amount)').eq('org_id', orgId).eq('status', 'completed').gte('disbursement_date', ytdStart).lte('disbursement_date', asOf),
    supabaseAdmin.from('collection_entries').select('meeting_date, loan_paid, collected_by, member_id').eq('org_id', orgId).gte('meeting_date', ytdStart).lte('meeting_date', asOf),
    supabaseAdmin.from('utilization_visits').select('application_id, visited_at, notes, loan_applications(application_number, members(full_name))').eq('org_id', orgId).eq('status', 'completed'),
    supabaseAdmin.from('organizations').select('name, name_bn').eq('id', orgId).maybeSingle(),
  ]);
  for (const r of [branchesRes, samitiesRes, membersRes, savingsRes, disbRes, collRes, visitsRes]) {
    if (r.error) throw r.error;
  }

  const branchRows = (branchesRes.data ?? []) as Array<{ id: string; name: string; name_bn: string | null; district: string | null }>;
  const samityRows = (samitiesRes.data ?? []) as Array<{ id: string; branch_id: string; name: string }>;
  const memberRows = (membersRes.data ?? []) as Array<{ id: string; member_code: string | null; full_name: string; branch_id: string; samity_id: string | null; status: string; join_date: string | null }>;
  const savingsRows = (savingsRes.data ?? []) as Array<{ member_id: string; product: string; balance: string | number }>;
  const disbRows = (disbRes.data ?? []) as unknown as Array<{ disbursement_date: string | null; loan_applications: { requested_amount: string | number } | null }>;
  const collRows = (collRes.data ?? []) as Array<{ meeting_date: string; loan_paid: string | number; collected_by: string | null; member_id: string }>;
  const visitRows = (visitsRes.data ?? []) as unknown as Array<{ application_id: string; visited_at: string | null; notes: string | null; loan_applications: { application_number: string; members: { full_name: string } | null } | null }>;
  const org = orgRes.data;

  const samityNameById = new Map(samityRows.map((s) => [s.id, s.name]));

  const branches: MisSnapshot['branches'] = branchRows.map((b) => ({
    id: b.id,
    name: b.name_bn || b.name,
    areaName: b.district || b.name,
    zoneName: b.district || '—',
    members: memberRows.filter((m) => m.branch_id === b.id).length,
    centers: samityRows.filter((s) => s.branch_id === b.id).length,
  }));

  const members: MisSnapshot['members'] = memberRows.map((m) => ({
    id: m.id,
    code: m.member_code ?? '',
    name: m.full_name,
    branchId: m.branch_id,
    samityName: (m.samity_id ? samityNameById.get(m.samity_id) : null) ?? 'সমিতি',
    joinedAt: m.join_date ?? asOf,
    active: m.status === 'active',
    droppedOutAt: null,
    dropoutReason: null,
  }));

  const savingsTotal = savingsRows.reduce((t, a) => t + Number(a.balance), 0);
  const byType = new Map<string, { accounts: number; balance: number }>();
  for (const a of savingsRows) {
    const row = byType.get(a.product) ?? { accounts: 0, balance: 0 };
    row.accounts += 1;
    row.balance += Number(a.balance);
    byType.set(a.product, row);
  }

  const disbursed = (d: { disbursement_date: string | null; loan_applications: { requested_amount: string | number } | null }) =>
    Number(d.loan_applications?.requested_amount ?? 0);
  const disbursedYtd = disbRows.reduce((t, d) => t + disbursed(d), 0);
  const disbursedPeriod = disbRows.filter((d) => (d.disbursement_date ?? '') >= monthStart).reduce((t, d) => t + disbursed(d), 0);

  const collectedYtd = collRows.reduce((t, c) => t + Number(c.loan_paid), 0);
  const collectedPeriod = collRows.filter((c) => c.meeting_date >= monthStart).reduce((t, c) => t + Number(c.loan_paid), 0);

  // Installment counts from the stored repayment schedule (classified loans).
  const appIds = [...new Set(classified.map((l) => l.applicationId))];
  let schedRows: Array<{ application_id: string }> = [];
  if (appIds.length > 0) {
    const { data } = await supabaseAdmin
      .from('loan_repayment_schedule')
      .select('application_id, seq, due_date, principal, interest, total, paid_amount, paid_at')
      .in('application_id', appIds)
      .order('seq');
    schedRows = (data ?? []) as typeof schedRows;
  }
  const dueInstallments = schedRows.length;
  const paidInstallments = schedRows.filter((r) => Number((r as { paid_amount?: string }).paid_amount ?? 0) >= Number((r as { total?: string }).total ?? 0) - 0.001).length;

  const utilization: MisSnapshot['utilization'] = visitRows
    .filter((v) => v.visited_at)
    .map((v) => {
      const app = v.loan_applications ?? null;
      const note = v.notes ?? '';
      return {
        loanNumber: app?.application_number ?? '—',
        memberName: app?.members?.full_name ?? 'সদস্য',
        visitedAt: v.visited_at as string,
        finding: note.includes('diverted') ? 'diverted' : note.includes('partial') ? 'partially_utilized' : 'fully_utilized',
        findingsNote: note,
      };
    });

  // Staff rollup: per-officer borrowers/samities from live collection entries.
  const officerIds = [...new Set(collRows.map((c) => c.collected_by).filter((x): x is string => Boolean(x)))];
  const officerNames = new Map<string, string>();
  if (officerIds.length > 0) {
    const { data: profs } = await supabaseAdmin.from('users_profile').select('id, full_name').in('id', officerIds);
    for (const p of profs ?? []) officerNames.set(p.id, p.full_name);
  }
  const memberBranch = new Map(memberRows.map((m) => [m.id, m.branch_id]));
  const memberSamity = new Map(memberRows.map((m) => [m.id, m.samity_id]));
  const outstandingByMember = new Map<string, number>();
  for (const l of classified) outstandingByMember.set(l.memberId, (outstandingByMember.get(l.memberId) ?? 0) + num(l.outstanding));
  const officers = new Map<string, { borrowers: Set<string>; samities: Set<string>; collected: number; branchId: string | null }>();
  for (const c of collRows) {
    const id = c.collected_by ?? 'unassigned';
    const row = officers.get(id) ?? { borrowers: new Set<string>(), samities: new Set<string>(), collected: 0, branchId: memberBranch.get(c.member_id) ?? branchRows[0]?.id ?? '' };
    row.borrowers.add(c.member_id);
    const samity = memberSamity.get(c.member_id);
    if (samity) row.samities.add(samity);
    row.collected += Number(c.loan_paid);
    if (!row.branchId) row.branchId = memberBranch.get(c.member_id) ?? row.branchId;
    officers.set(id, row);
  }
  const staff: MisSnapshot['staff'] = [...officers.entries()].map(([officerId, o]) => {
    // Monthly demand proxy ≈ 12% of the officer's borrowers' outstanding (same heuristic as the demo path).
    const due = [...o.borrowers].reduce((t, m) => t + (outstandingByMember.get(m) ?? 0), 0) * 0.12;
    return {
      officerId,
      officerName: officerNames.get(officerId) ?? 'ক্ষেত্র কর্মী / Field officer',
      branchId: o.branchId ?? '',
      borrowers: o.borrowers.size,
      dueAmount: Math.max(0, due).toFixed(2),
      collectedAmount: Math.max(0, o.collected).toFixed(2),
      samities: o.samities.size,
    };
  });

  return {
    asOf,
    orgId,
    orgNameBn: org?.name_bn || org?.name || 'সমবায় সমিতি',
    branches,
    members,
    loans: classified,
    loanStats: {
      disbursedPeriod: disbursedPeriod.toFixed(2),
      disbursedYtd: disbursedYtd.toFixed(2),
      collectedPeriod: collectedPeriod.toFixed(2),
      collectedYtd: collectedYtd.toFixed(2),
      writtenOff: '0.00',
      dueInstallments,
      paidInstallments,
    },
    savings: {
      accounts: savingsRows.length,
      totalBalance: savingsTotal.toFixed(2),
      byType: [...byType.entries()].map(([type, v]) => ({ type, accounts: v.accounts, balance: v.balance.toFixed(2) })),
      memberIdsWithSavings: new Set(savingsRows.map((a) => a.member_id)),
    },
    utilization,
    staff,
  };
}

/** Paid installment rows → statement transactions with a running balance. */
async function statementTxs(applicationId: string) {
  const { data } = await supabaseAdmin
    .from('loan_repayment_schedule')
    .select('seq, due_date, principal, interest, total, paid_amount, paid_at')
    .eq('application_id', applicationId)
    .order('seq');
  const rows = data ?? [];
  const demand = rows.reduce((t, r) => t + Number(r.total ?? 0), 0);
  let paid = 0;
  const txs: LoanStatementTx[] = [];
  for (const r of rows) {
    if (Number(r.paid_amount ?? 0) <= 0) continue;
    paid += Number(r.paid_amount);
    txs.push({
      date: r.paid_at ? String(r.paid_at).slice(0, 10) : String(r.due_date),
      description: `কিস্তি #${r.seq} আদায়`,
      principal: Number(r.principal ?? 0).toFixed(2),
      interest: Number(r.interest ?? 0).toFixed(2),
      total: Number(r.paid_amount).toFixed(2),
      balance: Math.max(0, demand - paid).toFixed(2),
    });
  }
  return txs;
}

/* ═════════════════ Named formula values & ratio inputs ════════════════════ */

function formulaValues(s: MisSnapshot, ratios: Record<RatioKey, FinancialRatio>): Record<string, number> {
  const outstanding = s.loans.reduce((t, l) => t + num(l.outstanding), 0);
  return {
    total_savings: num(s.savings.totalBalance),
    own_funds: num(s.savings.totalBalance) * 2, // proxy until equity accounts flow in from accounting
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

function ratioInputs(s: MisSnapshot): RatioInputs {
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

/* ═════════════════ Dashboards ═════════════════════════════════════════════ */

interface MisViewer {
  role: string;
  userId: string;
  name: string;
  branchId: string | null;
}

function dashboardForRoleLive(viewer: MisViewer, s: MisSnapshot, ratios: Record<RatioKey, FinancialRatio>, overrideRole?: string): RoleDashboard {
  const asOf = s.asOf;
  const role = overrideRole ?? viewer.role;

  if (role === 'account_officer') {
    const officer = s.staff.find((x) => x.officerId === viewer.userId) ?? s.staff[0];
    const due = num(officer?.dueAmount ?? '0');
    const col = num(officer?.collectedAmount ?? '0');
    const eff = due > 0 ? Math.min(100, Number(((col / due) * 100).toFixed(1))) : 0;
    const sheet = [
      {
        samityName: '—',
        meetingDate: asOf,
        dueInstallments: 0,
        collectedInstallments: 0,
        dueAmount: officer?.dueAmount ?? '0.00',
        collectedAmount: officer?.collectedAmount ?? '0.00',
        savingsDue: '0.00',
        savingsCollected: '0.00',
      },
    ];
    return buildOfficerDashboard(s, officer?.officerName ?? viewer.name, officer?.officerId ?? viewer.userId, sheet, [
      { metric: 'collection', labelBn: 'আদায়', target: 100, actual: Math.round(eff), achievementPct: eff },
    ]);
  }

  if (role === 'branch_manager') {
    const branchId = viewer.branchId ?? s.branches[0]?.id ?? '';
    const branchName = s.branches.find((b) => b.id === branchId)?.name ?? '—';
    const branchStaff = s.staff.filter((x) => x.branchId === branchId);
    const due = branchStaff.reduce((t, x) => t + num(x.dueAmount), 0);
    const col = branchStaff.reduce((t, x) => t + num(x.collectedAmount), 0);
    const branchLoans = s.loans.filter((l) => l.branchId === branchId);
    const outstandingTotal = branchLoans.reduce((t, l) => t + num(l.outstanding), 0);
    const atRisk = branchLoans.filter((l) => l.daysPastDue > 0).reduce((t, l) => t + num(l.outstanding), 0);
    const at30 = branchLoans.filter((l) => l.daysPastDue >= 30).reduce((t, l) => t + num(l.outstanding), 0);
    return {
      role: 'branch_manager',
      branchName,
      date: asOf,
      collection: {
        dueThisMonth: due.toFixed(2),
        collectedThisMonth: col.toFixed(2),
        efficiencyPct: due > 0 ? Number(((col / due) * 100).toFixed(1)) : 0,
        onTimeRate: Number(((s.loanStats.paidInstallments / Math.max(1, s.loanStats.dueInstallments)) * 100).toFixed(1)),
      },
      par: branchLoans.length
        ? {
            scope: 'branch' as const,
            scopeId: branchId,
            scopeName: branchName,
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
        opening: '0.00',
        collections: col.toFixed(2),
        disbursements: s.loanStats.disbursedPeriod,
        closing: (col - num(s.loanStats.disbursedPeriod)).toFixed(2),
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

/* ═════════════════ Standard reports (audit-logged) ════════════════════════ */

/** Build a standard report from live data. Exported for MIS-ops exports. */
export async function liveStandardReport(
  orgId: string,
  kind: StandardReportKind,
  params: { start?: string; end?: string; memberId?: string; loanId?: string; branchId?: string },
  requestedBy: string,
): Promise<StandardReport> {
  const asOf = todayStr();
  const s = await buildLiveSnapshot(orgId, asOf);
  const start = params.start ?? `${asOf.slice(0, 8)}01`;
  const end = params.end ?? asOf;

  let report: StandardReport;
  switch (kind) {
    case 'member_statement': {
      if (!params.memberId) throw BadRequest('memberId প্রয়োজন / memberId required');
      const member = s.members.find((m) => m.id === params.memberId);
      if (!member) throw NotFound('সদস্য পাওয়া যায়নি / Member not found');
      const { data: accts } = await supabaseAdmin
        .from('savings_accounts')
        .select('balance')
        .eq('org_id', orgId)
        .eq('member_id', params.memberId)
        .is('deleted_at', null)
        .neq('status', 'closed');
      const savingsBalance = (accts ?? []).reduce((t, a) => t + Number(a.balance), 0).toFixed(2);
      const loanTx: LoanStatementTx[] = [];
      for (const l of s.loans.filter((x) => x.memberId === params.memberId).slice(0, 5)) {
        loanTx.push(...(await statementTxs(l.applicationId)));
      }
      report = memberStatementReport(s, params.memberId, loanTx, savingsBalance);
      break;
    }
    case 'loan_statement': {
      if (!params.loanId) throw BadRequest('loanId প্রয়োজন / loanId required');
      const loan = s.loans.find((l) => l.applicationId === params.loanId);
      if (!loan) throw NotFound('ঋণ পাওয়া যায়নি / Loan not found');
      report = loanStatementReport(s, params.loanId, await statementTxs(params.loanId));
      break;
    }
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
      throw BadRequest(`অজানা রিপোর্ট ${kind} / Unknown report kind`);
  }
  await supabaseAdmin.from('report_audit_log').insert({
    org_id: orgId,
    kind,
    params: params as Record<string, unknown>,
    requested_by: requestedBy,
  });
  return report;
}

async function probeValuesLive(orgId: string): Promise<Record<string, number>> {
  const s = await buildLiveSnapshot(orgId, todayStr());
  return formulaValues(s, computeRatios(ratioInputs(s)));
}

/* ═════════════════ Templates (report designer) ════════════════════════════ */

/** Best-effort bootstrap: on a fresh (empty) project the regulatory template
 * list would be blank, so seed the MRA/PKSF starter templates on first read.
 * Swallows every error (RLS on the anon key, missing org) so reads never break. */
async function seedStarterTemplatesIfEmpty(orgId: string): Promise<void> {
  if (!orgId) return;
  try {
    const { count } = await supabaseAdmin
      .from('report_templates')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);
    if ((count ?? 0) > 0) return;
    const starters = [mraStarterTemplate(), pksfStarterTemplate()];
    await supabaseAdmin.from('report_templates').insert(
      starters.map((t) => ({
        org_id: orgId,
        name: t.name,
        regulator: t.regulator,
        section: t.section,
        circular_ref: t.circularRef,
        needs_verification: t.needsVerification,
        rows: t.rows,
      })),
    );
  } catch {
    // Seeding is best-effort only — the empty list is still a valid response.
  }
}

function templateToWire(r: Record<string, unknown>): ReportTemplate {
  return {
    id: String(r['id']),
    orgId: String(r['org_id']),
    name: String(r['name']),
    regulator: r['regulator'] as ReportTemplate['regulator'],
    section: String(r['section'] ?? ''),
    circularRef: String(r['circular_ref'] ?? ''),
    needsVerification: Boolean(r['needs_verification']),
    rows: (r['rows'] ?? []) as ReportTemplate['rows'],
    createdAt: String(r['created_at']),
    updatedAt: String(r['updated_at']),
  };
}

/* ═════════════════ Routes ═════════════════════════════════════════════════ */

/* ── 1) Dashboards ────────────────────────────────────────────────────────── */

misLiveRouter.get(
  '/dashboard',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const auth = req.auth!;
    const overrideRole = (req.query['role'] as string | undefined) ?? undefined; // preview switch
    const s = await buildLiveSnapshot(orgOf(req), todayStr());
    const ratios = computeRatios(ratioInputs(s));
    res.json(dashboardForRoleLive({ role: auth.role, userId: auth.userId, name: auth.email, branchId: auth.branchId ?? null }, s, ratios, overrideRole));
  }),
);

misLiveRouter.get(
  '/dashboard/board',
  requirePermission('report:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const s = await buildLiveSnapshot(orgOf(req), todayStr());
    const ratios = computeRatios(ratioInputs(s));
    const ho = headOfficeDashboard(s, ratios);
    res.json(buildBoardDashboard(s, ratios, ho));
  }),
);

/* ── 2) Standard reports ──────────────────────────────────────────────────── */

misLiveRouter.get(
  '/reports/:kind',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const kind = req.params['kind'] as StandardReportKind;
    if (!STANDARD_REPORTS.includes(kind)) {
      throw BadRequest(`অজানা রিপোর্ট / Unknown report kind: ${kind}`);
    }
    const q = req.query;
    const report = await liveStandardReport(
      orgOf(req),
      kind,
      {
        start: (q['start'] as string | undefined) ?? undefined,
        end: (q['end'] as string | undefined) ?? undefined,
        memberId: (q['memberId'] as string | undefined) ?? undefined,
        loanId: (q['loanId'] as string | undefined) ?? undefined,
        branchId: (q['branchId'] as string | undefined) ?? undefined,
      },
      req.auth?.email ?? 'unknown',
    );
    res.json(report);
  }),
);

misLiveRouter.get(
  '/audit',
  requirePermission('report:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin.from('report_audit_log').select('*').order('created_at', { ascending: false }).limit(50);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: data ?? [] });
  }),
);

/* ── 3) Financial ratios ──────────────────────────────────────────────────── */

misLiveRouter.get(
  '/ratios',
  requirePermission('report:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const s = await buildLiveSnapshot(orgOf(req), todayStr());
    res.json({ items: Object.values(computeRatios(ratioInputs(s))) });
  }),
);

/* ── 4) Regulatory templates & returns ────────────────────────────────────── */

misLiveRouter.get(
  '/templates',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    if (orgOf(req)) await seedStarterTemplatesIfEmpty(orgOf(req));
    let query = supabaseAdmin.from('report_templates').select('*').order('created_at', { ascending: false });
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: (data ?? []).map((t) => templateToWire(t as Record<string, unknown>)) });
  }),
);

misLiveRouter.get(
  '/templates/:id',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin.from('report_templates').select('*').eq('id', req.params['id'] as string);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('টেমপ্লেট পাওয়া যায়নি / Template not found');
    res.json(templateToWire(data as Record<string, unknown>));
  }),
);

misLiveRouter.post(
  '/templates',
  requirePermission('branch:manage'),
  validate(reportTemplateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as ReportTemplateBody;
    const validation = validateTemplate(body, await probeValuesLive(orgOf(req)));
    if (!validation.ok) throw BadRequest(`টেমপ্লেট অবৈধ: ${validation.errors.join('; ')}`);
    const { data, error } = await supabaseAdmin
      .from('report_templates')
      .insert({
        org_id: orgOf(req),
        name: body.name,
        regulator: body.regulator,
        section: body.section,
        circular_ref: body.circularRef,
        needs_verification: body.needsVerification,
        rows: body.rows,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ ...templateToWire(data as Record<string, unknown>), validation });
  }),
);

misLiveRouter.put(
  '/templates/:id',
  requirePermission('branch:manage'),
  validate(reportTemplateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as ReportTemplateBody;
    const validation = validateTemplate(body, await probeValuesLive(orgOf(req)));
    if (!validation.ok) throw BadRequest(`টেমপ্লেট অবৈধ: ${validation.errors.join('; ')}`);
    let query = supabaseAdmin
      .from('report_templates')
      .update({
        name: body.name,
        regulator: body.regulator,
        section: body.section,
        circular_ref: body.circularRef,
        needs_verification: body.needsVerification,
        rows: body.rows,
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params['id'] as string);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query.select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('টেমপ্লেট পাওয়া যায়নি / Template not found');
    res.json(templateToWire(data as Record<string, unknown>));
  }),
);

misLiveRouter.post(
  '/templates/:id/verify',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const verifiedBy = req.auth?.email ?? 'unknown';
    let query = supabaseAdmin
      .from('report_templates')
      .update({ needs_verification: false, verified_at: new Date().toISOString(), verified_by: verifiedBy, updated_at: new Date().toISOString() })
      .eq('id', req.params['id'] as string);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query.select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('টেমপ্লেট পাওয়া যায়নি / Template not found');
    await supabaseAdmin.from('report_audit_log').insert({
      org_id: data.org_id,
      kind: `template_verified:${data.id}`,
      params: { verifiedBy },
      requested_by: verifiedBy,
    });
    res.json(templateToWire(data as Record<string, unknown>));
  }),
);

misLiveRouter.delete(
  '/templates/:id',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin.from('report_templates').delete().eq('id', req.params['id'] as string);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query.select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('টেমপ্লেট পাওয়া যায়নি / Template not found');
    res.status(204).send();
  }),
);

function returnRowToWire(r: Record<string, unknown>) {
  const payload = (r['payload'] ?? {}) as ReturnType<typeof generateRegulatoryReturn>;
  return { ...payload, id: r['id'], submittedAt: r['submitted_at'] };
}

misLiveRouter.get(
  '/returns',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin.from('regulatory_returns').select('*').order('created_at', { ascending: false });
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const templateId = req.query['templateId'] as string | undefined;
    if (templateId) query = query.eq('template_id', templateId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: (data ?? []).map((r) => returnRowToWire(r as Record<string, unknown>)) });
  }),
);

misLiveRouter.post(
  '/returns',
  requirePermission('branch:manage'),
  validate(z.object({ templateId: z.string().uuid(), periodStart: z.string().regex(dateRe), periodEnd: z.string().regex(dateRe) })),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const body = req.body as { templateId: string; periodStart: string; periodEnd: string };
    if (body.periodEnd < body.periodStart) throw BadRequest('পর্ব ভুল / Invalid period');
    const { data: tRow } = await supabaseAdmin.from('report_templates').select('*').eq('id', body.templateId).eq('org_id', orgId).maybeSingle();
    if (!tRow) throw NotFound('টেমপ্লেট পাওয়া যায়নি / Template not found');
    const { data: dup } = await supabaseAdmin
      .from('regulatory_returns')
      .select('id')
      .eq('org_id', orgId)
      .eq('template_id', body.templateId)
      .eq('period_start', body.periodStart)
      .eq('period_end', body.periodEnd)
      .maybeSingle();
    if (dup) throw Conflict('এই প্রান্তিকের রিটার্ন আছে / Return already generated');
    const t = templateToWire(tRow as Record<string, unknown>);
    const generated = generateRegulatoryReturn(t, await probeValuesLive(orgId), body.periodStart, body.periodEnd);
    const { data, error } = await supabaseAdmin
      .from('regulatory_returns')
      .insert({
        org_id: orgId,
        template_id: body.templateId,
        period_start: body.periodStart,
        period_end: body.periodEnd,
        payload: generated,
        missing_values: generated.missingValues,
        generated_by: req.auth?.email ?? 'unknown',
      })
      .select('*')
      .single();
    if (error) throw error;
    await supabaseAdmin.from('report_audit_log').insert({
      org_id: orgId,
      kind: 'regulatory_return',
      params: { templateId: body.templateId, periodStart: body.periodStart, periodEnd: body.periodEnd },
      requested_by: req.auth?.email ?? 'unknown',
    });
    res.status(201).json(returnRowToWire(data as Record<string, unknown>));
  }),
);

misLiveRouter.get(
  '/returns/:id',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin.from('regulatory_returns').select('*').eq('id', req.params['id'] as string);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('রিটার্ন পাওয়া যায়নি / Return not found');
    res.json({
      id: data.id,
      templateId: data.template_id,
      periodStart: data.period_start,
      periodEnd: data.period_end,
      generated: data.payload,
      generatedBy: data.generated_by,
      generatedAt: data.created_at,
      submittedAt: data.submitted_at,
    });
  }),
);

misLiveRouter.post(
  '/returns/:id/submit',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin.from('regulatory_returns').select('id, submitted_at').eq('id', req.params['id'] as string);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('রিটার্ন পাওয়া যায়নি / Return not found');
    if (data.submitted_at) throw Conflict('ইতিমধ্যে দাখিল / Already submitted');
    const submittedAt = new Date().toISOString();
    // The read above is org-scoped for a non-super_admin; the write mirrors it
    // so the id-addressed update can never reach another tenant's row.
    let submitQuery = supabaseAdmin.from('regulatory_returns').update({ submitted_at: submittedAt }).eq('id', data.id);
    if (scopeOrg(req)) submitQuery = submitQuery.eq('org_id', orgOf(req));
    const { error: updErr } = await submitQuery;
    if (updErr) throw updErr;
    res.json({ id: data.id, submittedAt });
  }),
);

/** Plain-text (Word-openable) export of a generated return. */
misLiveRouter.get(
  '/returns/:id/export',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin.from('regulatory_returns').select('payload, period_start, org_id').eq('id', req.params['id'] as string);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('রিটার্ন পাওয়া যায়নি / Return not found');
    const payload = data.payload as ReturnType<typeof generateRegulatoryReturn>;
    const { data: org } = await supabaseAdmin.from('organizations').select('name, name_bn').eq('id', data.org_id).maybeSingle();
    const text = renderRegulatoryTextBn(payload, org?.name_bn || org?.name || 'সমবায় সমিতি');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="return-${payload.regulator}-${data.period_start}.txt"`);
    res.send(text);
  }),
);
