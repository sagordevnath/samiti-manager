/**
 * ── Delinquency & Recovery live router (Supabase) ────────────────────────────
 * Mirrors delinquency.routes.ts + delinquency-recovery.routes.ts against the
 * real tables (migration 0024 + collection tables): nightly classification
 * from stored repayment schedules, PAR rollups, worklist, settings, follow-ups
 * with reminder tasks, root causes, write-off proposals, early warning,
 * heatmap and trends.
 */
import { Router } from 'express';
import {
  DELINQUENCY_SETTINGS_DEFAULTS,
  bucketForDaysPastDue,
  assetClassForDpd,
  provisionPercentFor,
  worklistLevelFor,
  computePar,
  countConsecutiveMissed,
  attendanceFalling,
  renderLegalNoticeBn,
  delinquencySettingsPatchSchema,
  followUpCreateSchema,
  rootCauseTagSchema,
  savingsAdjustmentSchema,
  legalNoticeRequestSchema,
  writeOffProposalSchema,
  provisionProposalSchema,
  type ClassifiedLoan,
  type DelinquencySettings,
  type ParMetrics,
} from '@samity/shared';
import { Conflict, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { orgOf, scopeOrg, scopeToOrg } from '../lib/tenant.js';

export const delinquencyLiveRouter = Router();
delinquencyLiveRouter.use(requireAuth);

const todayStr = () => new Date().toISOString().slice(0, 10);

/**
 * Org settings mapped to the canonical `DelinquencySettings` shape.
 *
 * The DB row is snake_case (`bucket_bounds`, `provisioning_pct`, …) while the
 * shared classifier reads camelCase (`s.buckets`, `s.assetClassByDpd`, …).
 * Returning the raw row made every classifying endpoint read `undefined.d1_30`
 * and 500 — so the row is always mapped here, over the shared defaults, and
 * partial rows keep the missing fields. Exported for the MIS snapshot builder.
 */
export async function loadSettings(orgId: string): Promise<DelinquencySettings> {
  const { data } = await supabaseAdmin
    .from('delinquency_settings')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle();
  const row = data as {
    bucket_bounds?: Partial<DelinquencySettings['buckets']> | null;
    provisioning_pct?: Partial<DelinquencySettings['provisioning']> | null;
    asset_class_by_dpd?: Partial<DelinquencySettings['assetClassByDpd']> | null;
    escalate_to_bm_days?: number | null;
    escalate_to_am_days?: number | null;
  } | null;
  return {
    buckets: { ...DELINQUENCY_SETTINGS_DEFAULTS.buckets, ...(row?.bucket_bounds ?? {}) },
    provisioning: { ...DELINQUENCY_SETTINGS_DEFAULTS.provisioning, ...(row?.provisioning_pct ?? {}) },
    assetClassByDpd: { ...DELINQUENCY_SETTINGS_DEFAULTS.assetClassByDpd, ...(row?.asset_class_by_dpd ?? {}) },
    escalateToBmDays: row?.escalate_to_bm_days ?? DELINQUENCY_SETTINGS_DEFAULTS.escalateToBmDays,
    escalateToAmDays: row?.escalate_to_am_days ?? DELINQUENCY_SETTINGS_DEFAULTS.escalateToAmDays,
  };
}

/** Classify every active loan from the stored repayment schedule. Exported for MIS snapshots. */
export async function classifyLoans(orgId: string, settings: Awaited<ReturnType<typeof loadSettings>>): Promise<ClassifiedLoan[]> {
  const today = todayStr();
  const { data: apps, error } = await supabaseAdmin
    .from('loan_applications')
    .select(
      'id, application_number, branch_id, member_id, requested_amount, term_months, status, members(full_name, member_code), loan_products(name), loan_disbursements(disbursement_date, samity_id)',
    )
    .eq('org_id', orgId)
    .in('status', ['approved', 'disbursed']);
  if (error) throw error;
  const appIds = (apps ?? []).map((a) => a.id);
  if (appIds.length === 0) return [];

  const { data: schedule } = await supabaseAdmin
    .from('loan_repayment_schedule')
    .select('application_id, seq, due_date, principal, interest, total, paid_amount, paid_at')
    .in('application_id', appIds)
    .order('seq');

  const byApp = new Map<string, Array<Record<string, unknown>>>();
  for (const row of schedule ?? []) {
    const list = byApp.get(row.application_id) ?? [];
    list.push(row as unknown as Record<string, unknown>);
    byApp.set(row.application_id, list);
  }

  const loans: ClassifiedLoan[] = [];
  for (const app of apps ?? []) {
    const rows = byApp.get(app.id) ?? [];
    const paidRows = rows.filter((r) => Number(r['paid_amount'] ?? 0) >= Number(r['total'] ?? 0) - 0.001);
    const totalPaid = paidRows.reduce((s, r) => s + Number(r['paid_amount']), 0);
    const outstanding = Math.max(0, Number(app.requested_amount) - totalPaid);
    if (outstanding <= 0) continue;

    const unpaid = rows.filter((r) => Number(r['paid_amount'] ?? 0) < Number(r['total'] ?? 0) - 0.001);
    const overdueRows = unpaid.filter((r) => String(r['due_date']) < today);
    const overduePrincipal = overdueRows.reduce((s, r) => s + Number(r['principal']), 0);
    const overdueInterest = overdueRows.reduce((s, r) => s + Number(r['interest']), 0);
    const dpd = overdueRows.length > 0 ? Math.max(...overdueRows.map((r) => Math.floor((Date.parse(today) - Date.parse(String(r['due_date']))) / 86_400_000))) : 0;
    const bucket = bucketForDaysPastDue(dpd, settings as never);
    const assetClass = assetClassForDpd(dpd, settings as never);
    const pct = provisionPercentFor(assetClass, settings as never);
    const member = (app.members ?? null) as { full_name?: string; member_code?: string } | null;

    loans.push({
      applicationId: app.id,
      loanNumber: app.application_number,
      memberId: app.member_id,
      memberName: member?.full_name ?? '',
      memberCode: member?.member_code ?? '',
      branchId: app.branch_id,
      samityId: ((app.loan_disbursements as unknown as { samity_id?: string }[] | null)?.[0]?.samity_id) ?? null,
      officerId: null,
      productName: (app.loan_products as { name?: string } | null)?.name ?? null,
      disbursedOn: (app.loan_disbursements as { disbursement_date?: string } | null)?.disbursement_date ?? today,
      outstanding: outstanding.toFixed(2),
      overduePrincipal: overduePrincipal.toFixed(2),
      overdueInterest: overdueInterest.toFixed(2),
      overdueTotal: (overduePrincipal + overdueInterest).toFixed(2),
      daysPastDue: dpd,
      bucket,
      assetClass,
      provisionPercent: pct,
      provisionAmount: ((outstanding * pct) / 100).toFixed(2),
      oldestUnpaidDueDate: overdueRows.length > 0 ? String(overdueRows[0]!['due_date']) : null,
    });
  }
  return loans;
}

// ── 1) Nightly run ───────────────────────────────────────────────────────────
delinquencyLiveRouter.post(
  '/run',
  requirePermission('loan:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const settings = await loadSettings(orgId);
    const runDate = ((req.body as { runDate?: string }).runDate) ?? todayStr();
    const loans = await classifyLoans(orgId, settings);
    const atRisk = loans.filter((l) => l.daysPastDue > 0);
    const outstandingTotal = loans.reduce((s, l) => s + Number(l.outstanding), 0);
    const atRiskTotal = atRisk.reduce((s, l) => s + Number(l.outstanding), 0);
    const provisionTotal = atRisk.reduce((s, l) => s + Number(l.provisionAmount), 0);

    const { data: run, error } = await supabaseAdmin
      .from('delinquency_runs')
      .insert({
        org_id: orgId,
        run_date: runDate,
        settings,
        loans_total: loans.length,
        loans_risk: atRisk.length,
        outstanding_total: outstandingTotal.toFixed(2),
        at_risk_total: atRiskTotal.toFixed(2),
        provision_total: provisionTotal.toFixed(2),
      })
      .select('id')
      .single();
    if (error) throw error;

    // Upsert live classifications for the at-risk loans.
    for (const l of atRisk) {
      await supabaseAdmin
        .from('loan_classifications')
        .upsert(
          {
            org_id: orgId,
            run_id: run.id,
            run_date: runDate,
            application_id: l.applicationId,
            branch_id: l.branchId,
            samity_id: l.samityId,
            officer_id: l.officerId,
            member_id: l.memberId,
            outstanding: l.outstanding,
            overdue_principal: l.overduePrincipal,
            overdue_interest: l.overdueInterest,
            days_past_due: l.daysPastDue,
            bucket: l.bucket,
            asset_class: l.assetClass,
            provision_percent: l.provisionPercent,
            provision_amount: l.provisionAmount,
            oldest_unpaid_due: l.oldestUnpaidDueDate,
          },
          { onConflict: 'org_id, run_date, application_id' },
        );
      await supabaseAdmin
        .from('delinquency_cases')
        .upsert(
          {
            org_id: orgId,
            application_id: l.applicationId,
            branch_id: l.branchId,
            samity_id: l.samityId,
            officer_id: l.officerId,
            days_past_due: l.daysPastDue,
            bucket: l.bucket,
            overdue_total: l.overdueTotal,
            outstanding: l.outstanding,
            assigned_level: worklistLevelFor(l.daysPastDue, settings as never),
            status: 'open',
          },
          { onConflict: 'application_id, status' },
        );
    }
    res.status(201).json({ run: { runDate, loansTotal: loans.length, loansRisk: atRisk.length, outstandingTotal: outstandingTotal.toFixed(2), atRiskTotal: atRiskTotal.toFixed(2), provisionTotal: provisionTotal.toFixed(2) }, classified: atRisk.length });
  }),
);

delinquencyLiveRouter.get(
  '/runs/latest',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('delinquency_runs').select('*').order('run_date', { ascending: false }).limit(1);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data: run } = await query.maybeSingle();
    if (!run) {
      res.json({ run: null, auto: false });
      return;
    }
    res.json({
      run: {
        runDate: run.run_date,
        loansTotal: run.loans_total,
        loansRisk: run.loans_risk,
        outstandingTotal: String(run.outstanding_total),
        atRiskTotal: String(run.at_risk_total),
        provisionTotal: String(run.provision_total),
      },
    });
  }),
);

// ── 1) Classified loans (bucket view) ────────────────────────────────────────
delinquencyLiveRouter.get(
  '/loans',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const settings = await loadSettings(orgOf(req));
    const loans = await classifyLoans(orgOf(req), settings);
    const bucket = req.query['bucket'] as string | undefined;
    const branchId = req.query['branchId'] as string | undefined;
    const filtered = loans.filter((l) => (!bucket || l.bucket === bucket) && (!branchId || l.branchId === branchId));
    res.json({ items: filtered, count: filtered.length });
  }),
);

// ── 2) PAR by scope ──────────────────────────────────────────────────────────
delinquencyLiveRouter.get(
  '/par',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const scope = ((req.query['scope'] as ParMetrics['scope']) ?? 'branch') as ParMetrics['scope'];
    const settings = await loadSettings(orgOf(req));
    const loans = await classifyLoans(orgOf(req), settings);
    const branchIds = [...new Set(loans.map((l) => l.branchId))];
    const names = new Map<string, string>();
    if (branchIds.length > 0) {
      const { data: branches } = await supabaseAdmin.from('branches').select('id, name').in('id', branchIds);
      for (const b of branches ?? []) names.set(b.id, b.name);
    }
    const byScope = new Map<string, ClassifiedLoan[]>();
    for (const l of loans) {
      const key = scope === 'org' ? 'org' : (l.branchId ?? 'unknown');
      const list = byScope.get(key) ?? [];
      list.push(l);
      byScope.set(key, list);
    }
    const items: ParMetrics[] = [];
    if (scope === 'org') {
      items.push(computePar('org', orgOf(req), 'প্রতিষ্ঠান / Organization', loans));
    } else {
      for (const [id, list] of byScope) items.push(computePar(scope, id, names.get(id) ?? id, list));
    }
    res.json({ scope, items });
  }),
);

// ── Branch drill-down ────────────────────────────────────────────────────────
delinquencyLiveRouter.get(
  '/branches/:branchId/summary',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const settings = await loadSettings(orgOf(req));
    const branchId = req.params['branchId'] as string;
    const loans = (await classifyLoans(orgOf(req), settings)).filter((l) => l.branchId === branchId);
    const { data: branch } = await supabaseAdmin.from('branches').select('name').eq('id', branchId).maybeSingle();
    const byBucket: Record<string, { count: number; outstanding: string; provision: string }> = {};
    for (const l of loans) {
      const b = (byBucket[l.bucket] ??= { count: 0, outstanding: '0.00', provision: '0.00' });
      b.count += 1;
      b.outstanding = (Number(b.outstanding) + Number(l.outstanding)).toFixed(2);
      b.provision = (Number(b.provision) + Number(l.provisionAmount)).toFixed(2);
    }
    res.json({
      branchId,
      branchName: branch?.name ?? '',
      loans: loans.length,
      byBucket,
      provisionTotal: loans.reduce((s, l) => s + Number(l.provisionAmount), 0).toFixed(2),
    });
  }),
);

// ── 3) Worklist ──────────────────────────────────────────────────────────────
delinquencyLiveRouter.get(
  '/worklist',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const settings = await loadSettings(orgOf(req));
    const loans = (await classifyLoans(orgOf(req), settings)).filter((l) => l.daysPastDue > 0);
    const level = req.query['level'] as string | undefined;
    const branchId = req.query['branchId'] as string | undefined;
    const memberIds = [...new Set(loans.map((l) => l.memberId))];
    const branchIds = [...new Set(loans.map((l) => l.branchId))];
    const [followUpsRes, branchesRes] = await Promise.all([
      memberIds.length > 0
        ? supabaseAdmin.from('delinquency_follow_ups').select('case_id, created_at, outcome, delinquency_cases!inner(application_id)').in('delinquency_cases.application_id', memberIds)
        : Promise.resolve({ data: [] as never[] } as { data: never[] }),
      branchIds.length > 0 ? supabaseAdmin.from('branches').select('id, name').in('id', branchIds) : Promise.resolve({ data: [] as never[] } as { data: never[] }),
    ]);
    void (followUpsRes as { error?: unknown }).error;
    const branchNames = new Map(((branchesRes.data ?? []) as Array<{ id: string; name: string }>).map((b) => [b.id, b.name]));
    const items = loans
      .filter((l) => (!level || worklistLevelFor(l.daysPastDue, settings as never) === level) && (!branchId || l.branchId === branchId))
      .map((l) => {
        const assignedLevel = worklistLevelFor(l.daysPastDue, settings as never);
        return {
          loanId: l.applicationId,
          loanNumber: l.loanNumber,
          memberId: l.memberId,
          memberName: l.memberName,
          memberCode: l.memberCode,
          branchId: l.branchId,
          branchName: branchNames.get(l.branchId) ?? '',
          samityId: l.samityId,
          officerId: l.officerId,
          officerName: null,
          bucket: l.bucket,
          daysPastDue: l.daysPastDue,
          overdueTotal: l.overdueTotal,
          outstanding: l.outstanding,
          assignedLevel,
          assignedToId: null,
          assignedToName: null,
          followUpsCount: 0,
          lastFollowUpAt: null,
          lastOutcome: null,
        };
      });
    res.json({ items });
  }),
);

// ── 1) Settings ──────────────────────────────────────────────────────────────
delinquencyLiveRouter.get(
  '/settings',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const s = await loadSettings(orgOf(req));
    res.json(s);
  }),
);

delinquencyLiveRouter.patch(
  '/settings',
  requirePermission('loan:write'),
  validate(delinquencySettingsPatchSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body['buckets']) patch['bucket_bounds'] = body['buckets'];
    if (body['provisioning']) patch['provisioning_pct'] = body['provisioning'];
    if (body['assetClassByDpd']) patch['asset_class_by_dpd'] = body['assetClassByDpd'];
    if (body['escalateToBmDays'] !== undefined) patch['escalate_to_bm_days'] = body['escalateToBmDays'];
    if (body['escalateToAmDays'] !== undefined) patch['escalate_to_am_days'] = body['escalateToAmDays'];
    const { error } = await supabaseAdmin.from('delinquency_settings').upsert(
      { org_id: orgOf(req), ...patch },
      { onConflict: 'org_id' },
    );
    if (error) throw error;
    const s = await loadSettings(orgOf(req));
    res.json(s);
  }),
);

// ── 4) Follow-ups + reminder tasks ───────────────────────────────────────────
delinquencyLiveRouter.get(
  '/follow-ups',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const loanId = req.query['loanId'] as string | undefined;
    let query = supabaseAdmin
      .from('delinquency_follow_ups')
      .select('*, delinquency_cases(application_id)')
      .order('created_at', { ascending: false })
      .limit(200);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    const items = (data ?? [])
      .filter((f) => !loanId || f.delinquency_cases?.application_id === loanId)
      .map((f) => ({
        id: f.id,
        loanId: f.delinquency_cases?.application_id ?? '',
        loanNumber: null,
        memberName: '',
        type: f.type,
        outcome: f.outcome,
        promiseDate: f.promise_date ?? null,
        promiseAmount: f.promise_amount != null ? String(f.promise_amount) : null,
        note: f.note ?? null,
        nextVisitDate: f.next_visit_date ?? null,
        reminderTaskId: null,
        due: false,
        createdBy: f.created_by ?? null,
        createdAt: f.created_at,
      }));
    res.json({ items });
  }),
);

delinquencyLiveRouter.post(
  '/follow-ups',
  requirePermission('loan:write'),
  validate(followUpCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { loanId: string; type: string; outcome: string; promiseDate?: string; promiseAmount?: string; note?: string; nextVisitDate?: string };
    const { data: caseRow } = await supabaseAdmin
      .from('delinquency_cases')
      .select('id, org_id')
      .eq('application_id', body.loanId)
      .eq('status', 'open')
      .maybeSingle();
    if (!caseRow) throw NotFound('No open delinquency case for this loan — run the classification first');
    const { data: f, error } = await supabaseAdmin
      .from('delinquency_follow_ups')
      .insert({
        org_id: caseRow.org_id,
        case_id: caseRow.id,
        type: body.type,
        outcome: body.outcome,
        promise_date: body.promiseDate ?? null,
        promise_amount: body.promiseAmount ?? null,
        note: body.note ?? null,
        next_visit_date: body.nextVisitDate ?? null,
        created_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    // Reminder task in the delinquency queue.
    const { data: task } = await supabaseAdmin
      .from('delinquency_tasks')
      .insert({
        org_id: caseRow.org_id,
        follow_up_id: f.id,
        application_id: body.loanId,
        title: `ফলোআপ রিমাইন্ডার / Follow-up reminder`,
        title_bn: `ফলোআপ রিমাইন্ডার`,
        due_date: body.nextVisitDate ?? todayStr(),
        status: 'open',
        source: 'delinquency',
      })
      .select('id')
      .single();
    res.status(201).json({ id: f.id, reminderTaskId: task?.id ?? null, ok: true });
  }),
);

delinquencyLiveRouter.get(
  '/tasks',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    const status = ((req.query['status'] as string) ?? 'open') as 'open' | 'done';
    let query = supabaseAdmin.from('delinquency_tasks').select('*').eq('status', status).order('due_date').limit(200);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        titleBn: t.title_bn,
        dueDate: t.due_date,
        loanId: t.application_id ?? null,
        memberId: t.member_id ?? null,
        memberName: null,
        source: t.source,
        status: t.status,
        assignedToId: t.assigned_to ?? null,
        createdAt: t.created_at,
      })),
    });
  }),
);

delinquencyLiveRouter.post(
  '/tasks/:id/complete',
  requirePermission('loan:write'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin
      .from('delinquency_tasks')
      .update({ status: 'done', done_at: new Date().toISOString() })
      .eq('id', req.params['id'] as string);
    query = scopeToOrg(query, req as RequestWithAuth);
    const { data, error } = await query.select('id').maybeSingle();
    if (error || !data) throw NotFound('Task not found');
    res.json({ ok: true });
  }),
);

/* ═══════════════ Recovery (requirements 5–9) ═══════════════════════════════ */

// ── 5) Root causes ───────────────────────────────────────────────────────────
delinquencyLiveRouter.get(
  '/root-causes',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('delinquency_root_causes').select('*').order('created_at', { ascending: false }).limit(200);
    const loanId = req.query['loanId'] as string | undefined;
    if (loanId) query = query.eq('application_id', loanId);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((t) => ({
        id: t.id,
        loanId: t.application_id,
        loanNumber: null,
        cause: t.cause,
        note: t.note ?? null,
        createdBy: t.created_by ?? null,
        createdAt: t.created_at,
      })),
    });
  }),
);

delinquencyLiveRouter.post(
  '/root-causes',
  requirePermission('loan:write'),
  validate(rootCauseTagSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { loanId: string; cause: string; note?: string };
    const { data, error } = await supabaseAdmin
      .from('delinquency_root_causes')
      .insert({
        org_id: orgOf(req),
        application_id: body.loanId,
        cause: body.cause,
        note: body.note ?? null,
        created_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ok: true });
  }),
);

// ── 6) Savings adjustment ────────────────────────────────────────────────────
delinquencyLiveRouter.post(
  '/savings-adjustments',
  requirePermission('loan:write'),
  validate(savingsAdjustmentSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { loanId: string; amount: string; note?: string };
    // Both lookups are client-addressed (`loanId` from the body), so each has
    // to carry the tenant predicate — the service client bypasses RLS and a
    // guessed id must not move another organization's savings balance.
    const { data: app } = await scopeToOrg(supabaseAdmin.from('loan_applications').select('id, member_id'), req)
      .eq('id', body.loanId)
      .maybeSingle();
    if (!app) throw NotFound('Loan not found');
    const { data: account } = await scopeToOrg(
      supabaseAdmin.from('savings_accounts').select('id, balance').eq('member_id', app.member_id).eq('status', 'active'),
      req,
    )
      .limit(1)
      .maybeSingle();
    if (!account) throw Conflict('Member has no active savings account');
    if (Number(body.amount) > Number(account.balance)) throw Conflict('Adjustment exceeds the savings balance');
    const after = Number(account.balance) - Number(body.amount);
    await scopeToOrg(supabaseAdmin.from('savings_accounts').update({ balance: after.toFixed(2) }), req).eq('id', account.id);
    await supabaseAdmin.from('savings_transactions').insert({
      org_id: orgOf(req),
      account_id: account.id,
      transaction_type: 'withdrawal',
      amount: body.amount,
      balance_after: after.toFixed(2),
      reference: `ঋণ সমন্বয় / Loan adjustment: ${body.loanId.slice(0, 8)}`,
    });
    res.status(201).json({ id: account.id, loanId: body.loanId, amount: body.amount, savingsAccountId: account.id, balanceAfter: after.toFixed(2) });
  }),
);

// ── 6) Legal notice ──────────────────────────────────────────────────────────
delinquencyLiveRouter.post(
  '/legal-notices',
  requirePermission('loan:write'),
  validate(legalNoticeRequestSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { loanId: string; replyWithinDays: number };
    const settings = await loadSettings(orgOf(req));
    const loans = await classifyLoans(orgOf(req), settings);
    const loan = loans.find((l) => l.applicationId === body.loanId);
    if (!loan) throw NotFound('Loan not found among classified loans');
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('full_name, address')
      .eq('id', loan.memberId)
      .maybeSingle();
    const { data: branch } = await supabaseAdmin.from('branches').select('name').eq('id', loan.branchId).maybeSingle();
    const bodyBn = renderLegalNoticeBn({
      orgName: 'Samity Manager',
      branchName: branch?.name ?? '',
      memberName: member?.full_name ?? loan.memberName,
      memberAddress: member?.address ?? null,
      loanNumber: loan.loanNumber,
      overdueTotal: loan.overdueTotal,
      outstanding: loan.outstanding,
      issuedOn: todayStr(),
      replyWithinDays: body.replyWithinDays,
    });
    res.status(201).json({
      loanId: body.loanId,
      loanNumber: loan.loanNumber,
      memberName: member?.full_name ?? loan.memberName,
      memberAddress: member?.address ?? null,
      branchName: branch?.name ?? '',
      issuedOn: todayStr(),
      replyWithinDays: body.replyWithinDays,
      overdueTotal: loan.overdueTotal,
      outstanding: loan.outstanding,
      bodyBn,
    });
  }),
);

// ── 6) Write-off proposals (loan_write_offs table, 0022) ─────────────────────
delinquencyLiveRouter.get(
  '/write-off-proposals',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin
      .from('loan_write_offs')
      .select('*, loan_applications(application_number, members(full_name))')
      .is('deleted_at', null)
      .order('requested_at', { ascending: false });
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((p) => ({
        id: p.id,
        loanId: p.application_id,
        loanNumber: p.loan_applications?.application_number ?? null,
        memberName: p.loan_applications?.members?.full_name ?? '',
        outstandingAmount: String(p.outstanding_amount),
        reason: p.note ?? '',
        legalActionTaken: null,
        status: p.status,
        requestedBy: p.requested_by ?? null,
        requestedAt: p.requested_at,
        recommendedBy: null,
        recommendedAt: null,
        decidedBy: p.decided_by ?? null,
        decidedAt: p.decided_at ?? null,
        decisionNote: p.decision_note ?? null,
        recoveredAmount: '0.00',
        recoveries: [],
      })),
    });
  }),
);

delinquencyLiveRouter.post(
  '/write-off-proposals',
  requirePermission('loan:write'),
  validate(writeOffProposalSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { loanId: string; reason: string; legalActionTaken?: string };
    const settings = await loadSettings(orgOf(req));
    const loan = (await classifyLoans(orgOf(req), settings)).find((l) => l.applicationId === body.loanId);
    if (!loan) throw NotFound('Loan not found among classified loans');
    const { data, error } = await supabaseAdmin
      .from('loan_write_offs')
      .insert({
        org_id: orgOf(req),
        branch_id: loan.branchId,
        application_id: body.loanId,
        outstanding_amount: loan.outstanding,
        reason: 'other',
        note: body.reason,
        status: 'pending',
        requested_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) {
      if (String(error.message).includes('duplicate key')) throw Conflict('A write-off proposal already exists for this loan');
      throw error;
    }
    res.status(201).json({ id: data.id, ok: true });
  }),
);

delinquencyLiveRouter.post(
  '/write-off-proposals/:id/decision',
  requirePermission('loan:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { decision: 'recommended' | 'approved' | 'rejected'; decisionNote?: string };
    let query = supabaseAdmin
      .from('loan_write_offs')
      .update({
        status: body.decision,
        decided_by: req.auth!.userId,
        decided_at: new Date().toISOString(),
        decision_note: body.decisionNote ?? null,
      })
      .eq('id', req.params['id'] as string);
    query = scopeToOrg(query, req);
    const { data, error } = await query.select('id').maybeSingle();
    if (error || !data) throw NotFound('Proposal not found');
    res.json({ ok: true });
  }),
);

// ── 7) Provision proposals (derived from the latest run) ─────────────────────
delinquencyLiveRouter.get(
  '/provision-proposals',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('delinquency_runs').select('*').order('run_date', { ascending: false }).limit(10);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data: runs, error } = await query;
    if (error) throw error;
    res.json({
      items: (runs ?? []).map((r) => ({
        id: r.id,
        runDate: r.run_date,
        byClass: [],
        provisionTotal: String(r.provision_total),
        priorProvisionTotal: '0.00',
        provisionExpense: String(r.provision_total),
        status: 'pending_approval',
        note: null,
        requestedBy: null,
        requestedAt: r.created_at,
        postedAt: null,
        journalPreview: [],
      })),
    });
  }),
);

delinquencyLiveRouter.post(
  '/provision-proposals',
  requirePermission('loan:write'),
  validate(provisionProposalSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const settings = await loadSettings(orgId);
    const loans = await classifyLoans(orgId, settings);
    const byClass = new Map<string, { outstanding: number; pct: number }>();
    for (const l of loans) {
      const row = byClass.get(l.assetClass) ?? { outstanding: 0, pct: l.provisionPercent };
      row.outstanding += Number(l.outstanding);
      byClass.set(l.assetClass, row);
    }
    const provisionTotal = [...byClass.entries()].reduce((s, [, row]) => s + (row.outstanding * row.pct) / 100, 0);
    const { data: run, error } = await supabaseAdmin
      .from('delinquency_runs')
      .insert({
        org_id: orgId,
        run_date: ((req.body as { runDate?: string }).runDate) ?? todayStr(),
        settings,
        loans_total: loans.length,
        loans_risk: loans.filter((l) => l.daysPastDue > 0).length,
        outstanding_total: loans.reduce((s, l) => s + Number(l.outstanding), 0).toFixed(2),
        at_risk_total: loans.filter((l) => l.daysPastDue > 0).reduce((s, l) => s + Number(l.outstanding), 0).toFixed(2),
        provision_total: provisionTotal.toFixed(2),
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({
      id: run.id,
      runDate: (run as unknown as { run_date: string }).run_date,
      byClass: [...byClass.entries()].map(([assetClass, row]) => ({
        assetClass,
        outstanding: row.outstanding.toFixed(2),
        provisionPercent: row.pct,
        provisionAmount: ((row.outstanding * row.pct) / 100).toFixed(2),
      })),
      provisionTotal: provisionTotal.toFixed(2),
      status: 'pending_approval',
    });
  }),
);

// ── 8) Early warning ─────────────────────────────────────────────────────────
delinquencyLiveRouter.post(
  '/early-warning/scan',
  requirePermission('loan:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const settings = await loadSettings(orgId);
    const loans = (await classifyLoans(orgId, settings)).filter((l) => l.daysPastDue > 0);
    const today = todayStr();
    const { data: schedule } = await supabaseAdmin
      .from('loan_repayment_schedule')
      .select('application_id, seq, due_date, total, paid_amount')
      .in('application_id', loans.map((l) => l.applicationId));
    const byApp = new Map<string, Array<{ seq: number; dueDate: string; total: string; paidAmount?: string }>>();
    for (const r of schedule ?? []) {
      const list = byApp.get(r.application_id) ?? [];
      list.push({ seq: r.seq, dueDate: r.due_date, total: r.total, paidAmount: r.paid_amount ?? undefined });
      byApp.set(r.application_id, list);
    }
    const fresh: unknown[] = [];
    for (const loan of loans) {
      const missed = countConsecutiveMissed(byApp.get(loan.applicationId) ?? [], today);
      if (missed >= 2) {
        const { data: sig, error } = await supabaseAdmin
          .from('early_warning_signals')
          .insert({
            org_id: orgId,
            kind: 'member_missed_two',
            severity: missed >= 4 ? 'high' : 'medium',
            ref_id: loan.memberId,
            branch_id: loan.branchId,
            detail: `Missed ${missed} consecutive installments (loan ${loan.loanNumber})`,
            detail_bn: `টানা ${missed} কিস্তি বকেয়া (${loan.loanNumber})`,
            metric: missed,
            prior_metric: null,
          })
          .select('id')
          .single();
        if (!error && sig) fresh.push({ id: sig.id, kind: 'member_missed_two', refId: loan.memberId, metric: missed });
      }
    }
    // Attendance-falling signals from recent meeting attendance.
    const { data: attendance } = await supabaseAdmin
      .from('meeting_attendance')
      .select('samity_id, meeting_id')
      .order('created_at', { ascending: false })
      .limit(500);
    const bySamity = new Map<string, number>();
    for (const a of attendance ?? []) bySamity.set(a.samity_id, (bySamity.get(a.samity_id) ?? 0) + 1);
    void attendanceFalling; // rates need per-meeting member counts; kept for future use
    res.status(201).json({ detected: fresh.length, items: fresh });
  }),
);

delinquencyLiveRouter.get(
  '/early-warning',
  requirePermission('loan:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('early_warning_signals').select('*').order('detected_at', { ascending: false }).limit(200);
    const kind = req.query['kind'] as string | undefined;
    if (kind) query = query.eq('kind', kind);
    const ack = req.query['acknowledged'];
    if (ack !== undefined) query = query.eq('acknowledged', ack === 'true');
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    // ref_id is a generic reference (member/samity/officer) without an FK —
    // resolve member names in a second pass where they match.
    const refIds = [...new Set((data ?? []).map((s) => s.ref_id).filter(Boolean))];
    const names = new Map<string, string>();
    if (refIds.length > 0) {
      const { data: memberRows } = await supabaseAdmin.from('members').select('id, full_name').in('id', refIds);
      for (const m of memberRows ?? []) names.set(m.id, m.full_name);
    }
    res.json({
      items: (data ?? []).map((s) => ({
        id: s.id,
        kind: s.kind,
        severity: s.severity,
        refId: s.ref_id,
        refName: names.get(s.ref_id) ?? '',
        branchId: s.branch_id ?? null,
        detail: s.detail ?? '',
        detailBn: s.detail_bn ?? '',
        metric: Number(s.metric ?? 0),
        priorMetric: s.prior_metric != null ? Number(s.prior_metric) : null,
        detectedAt: s.detected_at,
        acknowledged: s.acknowledged ?? false,
      })),
    });
  }),
);

delinquencyLiveRouter.post(
  '/early-warning/:id/acknowledge',
  requirePermission('loan:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin
      .from('early_warning_signals')
      .update({ acknowledged: true, acknowledged_by: req.auth!.userId, acknowledged_at: new Date().toISOString() })
      .eq('id', req.params['id'] as string);
    query = scopeToOrg(query, req);
    const { data, error } = await query.select('id').maybeSingle();
    if (error || !data) throw NotFound('Signal not found');
    res.json({ ok: true });
  }),
);

// ── 9) Heatmap + trends ──────────────────────────────────────────────────────
delinquencyLiveRouter.get(
  '/heatmap',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    const settings = await loadSettings(orgOf(req));
    const loans = await classifyLoans(orgOf(req), settings);
    const branchIds = [...new Set(loans.map((l) => l.branchId))];
    const { data: branches } = branchIds.length > 0 ? await supabaseAdmin.from('branches').select('id, name').in('id', branchIds) : { data: [] };
    const names = new Map((branches ?? []).map((b: { id: string; name: string }) => [b.id, b.name]));
    const cells = loans
      .filter((l) => l.daysPastDue > 0)
      .map((l) => ({
        branchId: l.branchId,
        branchName: names.get(l.branchId) ?? '',
        officerId: l.officerId,
        officerName: null,
        bucket: l.bucket,
        value: l.outstanding,
        loans: 1,
      }));
    const max = loans.reduce((s, l) => Math.max(s, Number(l.outstanding)), 0).toFixed(2);
    res.json({ cells, max, buckets: ['d1_30', 'd31_90', 'd91_180', 'd180_plus'] });
  }),
);

delinquencyLiveRouter.get(
  '/trends',
  requirePermission('report:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('delinquency_runs').select('*').order('run_date', { ascending: true }).limit(60);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data: runs, error } = await query;
    if (error) throw error;
    res.json({
      points: (runs ?? []).map((r) => ({
        runDate: r.run_date,
        par1: Number(r.outstanding_total) > 0 ? Number(r.at_risk_total) / Number(r.outstanding_total) : 0,
        par30: 0,
        par90: 0,
        outstanding: String(r.outstanding_total),
        atRisk: String(r.at_risk_total),
        provision: String(r.provision_total),
      })),
    });
  }),
);
