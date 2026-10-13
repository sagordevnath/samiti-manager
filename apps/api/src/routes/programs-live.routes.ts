/**
 * ── Programs & projects live router (Supabase) ───────────────────────────────
 * Mirrors programs.routes.ts (demo) against the real tables (migrations 0044
 * + 0046): project register with budget lines, logframe + indicator values,
 * beneficiaries/enrollments/services, activity planner, training batches with
 * attendance/scores/certificates, expenses, field visits, donor reports,
 * sensitive cases + access log, funding sources + amortization schedules.
 * Money stays numeric(14,2) in Postgres, aliased to camelCase strings for the
 * wire; jsonb columns carry the shared interfaces as-is. Pure rules
 * (lifecycles, budget monitor, donor report builder) live in @samity/shared
 * so the DB triggers, this API and the web UI share one implementation.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  activitySchema,
  beneficiarySchema,
  budgetMonitor,
  burnRate,
  buildDonorReport,
  buildDonorReportHtml,
  canManageCases,
  canTransitionActivity,
  canTransitionCase,
  canTransitionProject,
  caseFileSchema,
  donorUtilization,
  enrollmentSchema,
  fieldVisitSchema,
  fundingSourceSchema,
  indicatorValueSchema,
  logframeEntrySchema,
  maskCase,
  nextBatchCode,
  nextBeneficiaryCode,
  nextCaseNo,
  nextCertificateNo,
  projectExpenseSchema,
  projectSchema,
  repaymentSchedule,
  repaymentSummary,
  serviceRecordSchema,
  testScoreSchema,
  trainingAttendanceSchema,
  trainingBatchSchema,
  visitScore,
  type BatchStats,
  type CaseStatus,
  type ProjectAction,
  type ProjectStatus,
} from '@samity/shared';
import { Conflict, NotFound } from '../lib/errors.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { orgOf } from '../lib/tenant.js';

interface Viewer {
  userId: string;
  userName: string;
  role: string;
}

export const programsLiveRouter = Router();
programsLiveRouter.use(requireAuth);

const todayStr = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString();

function pgError(err: unknown): never {
  const e = err as { code?: string; message?: string; details?: string } | null;
  if (e?.code === '23505' || e?.code === '23P01' || e?.code === '23514') {
    throw Conflict(e.message ?? 'ডেটাবেজ সীমাবদ্ধতা / Database constraint violated');
  }
  if (e?.code === '23503') {
    throw NotFound('সম্পর্কিত রেকর্ড পাওয়া যায়নি / Related record not found');
  }
  throw (err as Error) ?? new Error('unknown');
}

/** Case-worker clearance mirrors 0046's RLS: workers see all, assignee their own. */
function viewerOf(req: RequestWithAuth): Viewer {
  return {
    userId: req.auth?.userId ?? 'unknown',
    userName: req.auth?.email ?? 'unknown',
    role: req.auth?.role ?? 'member',
  };
}

/** Next sequential number for code generation (count-based, like the DB fns). */
async function nextSeq(table: string, orgId: string, codeCol: string, prefix: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .like(codeCol, `${prefix}-%`);
  return (count ?? 0) + 1;
}

async function projectRow(orgId: string, id: string) {
  const { data, error } = await supabaseAdmin.from('projects').select('*').eq('org_id', orgId).eq('id', id).maybeSingle();
  if (error) pgError(error);
  if (!data) throw NotFound('প্রকল্প পাওয়া যায়নি / Project not found');
  return data as Record<string, unknown>;
}

/* ── 1) Project register ──────────────────────────────────────────────────── */

async function projectToWire(orgId: string, row: Record<string, unknown>) {
  const { data: lines } = await supabaseAdmin
    .from('project_budget_lines')
    .select('line_item, amount, note')
    .eq('org_id', orgId)
    .eq('project_id', row['id'] as string)
    .order('created_at');
  const budget = (lines ?? []).map((l) => ({ lineItem: l.line_item as string, amount: String(l.amount), note: l.note as string }));
  return {
    id: row['id'],
    orgId: row['org_id'],
    code: row['code'],
    nameBn: row['name_bn'],
    nameEn: row['name_en'],
    donor: row['donor'],
    grantAgreementNo: row['grant_agreement_no'],
    fundCode: row['fund_code'],
    sector: row['sector'],
    startDate: row['start_date'],
    endDate: row['end_date'],
    targetAreas: row['target_areas'] ?? [],
    targetBeneficiaries: row['target_beneficiaries'],
    managerName: row['manager_name'],
    budget,
    status: row['status'],
    createdAt: row['created_at'],
    updatedAt: row['updated_at'],
  };
}

programsLiveRouter.get(
  '/projects',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('projects').select('*').eq('org_id', orgId).order('code');
    const sector = req.query['sector'] as string | undefined;
    const status = req.query['status'] as string | undefined;
    const donor = req.query['donor'] as string | undefined;
    if (sector) q = q.eq('sector', sector);
    if (status) q = q.eq('status', status);
    if (donor) q = q.eq('donor', donor);
    const { data, error } = await q;
    if (error) pgError(error);
    const items = await Promise.all((data ?? []).map((r) => projectToWire(orgId, r as Record<string, unknown>)));
    res.json({ items });
  }),
);

programsLiveRouter.get(
  '/projects/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    res.json(await projectToWire(orgId, await projectRow(orgId, req.params['id'] as string)));
  }),
);

programsLiveRouter.post(
  '/projects',
  requirePermission('branch:manage'),
  validate(projectSchema),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const body = req.body as {
      code: string; nameBn: string; nameEn: string; donor: string; grantAgreementNo: string; fundCode: string;
      sector: string; startDate: string; endDate: string; targetAreas: string[]; targetBeneficiaries: number;
      managerName: string; budget: { lineItem: string; amount: string; note: string }[];
    };
    if (body.endDate <= body.startDate) throw Conflict('শেষ তারিখ শুরুর পরে হতে হবে / End date must be after start date');
    const seq = await nextSeq('projects', orgId, 'code', 'PRJ');
    const code = body.code || `PRJ-${new Date().getUTCFullYear()}-${String(seq).padStart(3, '0')}`;
    const { data, error } = await supabaseAdmin
      .from('projects')
      .insert({
        org_id: orgId,
        code,
        name_bn: body.nameBn,
        name_en: body.nameEn,
        donor: body.donor,
        grant_agreement_no: body.grantAgreementNo,
        fund_code: body.fundCode,
        sector: body.sector,
        start_date: body.startDate,
        end_date: body.endDate,
        target_areas: body.targetAreas,
        target_beneficiaries: body.targetBeneficiaries,
        manager_name: body.managerName,
        status: 'proposed',
      })
      .select('id')
      .single();
    if (error) pgError(error);
    await supabaseAdmin.from('project_budget_lines').insert(
      body.budget.map((b) => ({ org_id: orgId, project_id: data!['id'], line_item: b.lineItem, amount: b.amount, note: b.note })),
    );
    res.status(201).json(await projectToWire(orgId, await projectRow(orgId, data!['id'] as string)));
  }),
);

programsLiveRouter.post(
  '/projects/:id/decision',
  requirePermission('branch:manage'),
  validate(z.object({ action: z.enum(['activate', 'suspend', 'resume', 'close']) })),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const row = await projectRow(orgId, req.params['id'] as string);
    const action = req.body['action'] as ProjectAction;
    const to = { activate: 'active', suspend: 'suspended', resume: 'active', close: 'closed' }[action] as ProjectStatus;
    if (!canTransitionProject(row['status'] as ProjectStatus, to)) {
      throw Conflict(`অবৈধ প্রকল্প অবস্থান্তর ${String(row['status'])} → ${to} / Invalid project transition`);
    }
    const { error } = await supabaseAdmin.from('projects').update({ status: to }).eq('id', row['id'] as string).eq('org_id', orgId);
    if (error) pgError(error);
    res.json(await projectToWire(orgId, { ...row, status: to }));
  }),
);

/* ── 2) Logframe + indicator values ───────────────────────────────────────── */

programsLiveRouter.get(
  '/projects/:id/logframe',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const projectId = req.params['id'] as string;
    const { data: entries, error } = await supabaseAdmin
      .from('logframe_entries')
      .select('*')
      .eq('org_id', orgId)
      .eq('project_id', projectId)
      .order('created_at');
    if (error) pgError(error);
    const { data: values, error: ve } = await supabaseAdmin
      .from('indicator_values')
      .select('*')
      .eq('org_id', orgId)
      .in('entry_id', (entries ?? []).map((e) => e.id));
    if (ve) pgError(ve);
    res.json({
      entries: (entries ?? []).map((e) => ({
        id: e.id, orgId: e.org_id, projectId: e.project_id, level: e.level, statement: e.statement,
        parentLabel: e.parent_label, indicatorCode: e.indicator_code, baseline: e.baseline,
        targetValue: e.target_value, unit: e.unit, meansOfVerification: e.means_of_verification,
        createdAt: e.created_at,
      })),
      values: (values ?? []).map((v) => ({
        id: v.id, orgId: v.org_id, entryId: v.entry_id, periodStart: v.period_start, periodEnd: v.period_end,
        value: v.value, evidence: v.evidence ?? [], note: v.note, enteredAt: v.entered_at,
      })),
    });
  }),
);

programsLiveRouter.post(
  '/projects/:id/logframe',
  requirePermission('branch:manage'),
  validate(logframeEntrySchema),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    await projectRow(orgId, req.params['id'] as string);
    const b = req.body as { level: string; statement: string; parentLabel: string | null; indicatorCode: string | null; baseline: string; targetValue: string; unit: string | null; meansOfVerification: string };
    const { data, error } = await supabaseAdmin
      .from('logframe_entries')
      .insert({
        org_id: orgId,
        project_id: req.params['id'],
        level: b.level,
        statement: b.statement,
        parent_label: b.parentLabel,
        indicator_code: b.indicatorCode,
        baseline: b.baseline || '0',
        target_value: b.targetValue || '0',
        unit: b.unit,
        means_of_verification: b.meansOfVerification,
      })
      .select('*')
      .single();
    if (error) pgError(error);
    const e = data as Record<string, unknown>;
    res.status(201).json({
      id: e['id'], orgId: e['org_id'], projectId: e['project_id'], level: e['level'], statement: e['statement'],
      parentLabel: e['parent_label'], indicatorCode: e['indicator_code'], baseline: e['baseline'],
      targetValue: e['target_value'], unit: e['unit'], meansOfVerification: e['means_of_verification'],
      createdAt: e['created_at'],
    });
  }),
);

programsLiveRouter.post(
  '/indicator-values',
  requirePermission('member:write'),
  validate(indicatorValueSchema),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const b = req.body as { entryId: string; periodStart: string; periodEnd: string; value: string; evidence: { id: string; labelBn: string; path: string }[]; note: string };
    const { data, error } = await supabaseAdmin
      .from('indicator_values')
      .insert({
        org_id: orgId,
        entry_id: b.entryId,
        period_start: b.periodStart,
        period_end: b.periodEnd,
        value: b.value,
        evidence: b.evidence,
        note: b.note,
      })
      .select('*')
      .single();
    if (error) pgError(error);
    const v = data as Record<string, unknown>;
    res.status(201).json({
      id: v['id'], orgId: v['org_id'], entryId: v['entry_id'], periodStart: v['period_start'],
      periodEnd: v['period_end'], value: v['value'], evidence: v['evidence'] ?? [], note: v['note'],
      enteredAt: v['entered_at'],
    });
  }),
);

/* ── 3) Beneficiaries, enrollments, services ──────────────────────────────── */

programsLiveRouter.get(
  '/beneficiaries',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('beneficiaries').select('*').eq('org_id', orgId).order('code');
    const village = req.query['village'] as string | undefined;
    if (village) q = q.ilike('village', `%${village}%`);
    let rows = ((await q).data ?? []) as Record<string, unknown>[];
    const projectId = req.query['projectId'] as string | undefined;
    if (projectId) {
      const { data: enrolled } = await supabaseAdmin
        .from('program_enrollments')
        .select('beneficiary_id')
        .eq('org_id', orgId)
        .eq('project_id', projectId);
      const ids = new Set((enrolled ?? []).map((e) => e.beneficiary_id));
      rows = rows.filter((b) => ids.has(b['id'] as string));
    }
    res.json({
      items: rows.map((b) => ({
        id: b['id'], orgId: b['org_id'], code: b['code'], memberId: b['member_id'], nameBn: b['name_bn'],
        guardianBn: b['guardian_bn'], phone: b['phone'], age: b['age'], gender: b['gender'],
        village: b['village'], createdAt: b['created_at'],
      })),
    });
  }),
);

programsLiveRouter.post(
  '/beneficiaries',
  requirePermission('member:write'),
  validate(beneficiarySchema),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const b = req.body as { memberId: string | null; nameBn: string; guardianBn: string; phone: string; age: number; gender: string; village: string };
    const seq = await nextSeq('beneficiaries', orgId, 'code', 'BEN');
    const { data, error } = await supabaseAdmin
      .from('beneficiaries')
      .insert({
        org_id: orgId,
        code: nextBeneficiaryCode(seq),
        member_id: b.memberId,
        name_bn: b.nameBn,
        guardian_bn: b.guardianBn,
        phone: b.phone,
        age: b.age,
        gender: b.gender,
        village: b.village,
      })
      .select('*')
      .single();
    if (error) pgError(error);
    const r = data as Record<string, unknown>;
    res.status(201).json({
      id: r['id'], orgId: r['org_id'], code: r['code'], memberId: r['member_id'], nameBn: r['name_bn'],
      guardianBn: r['guardian_bn'], phone: r['phone'], age: r['age'], gender: r['gender'],
      village: r['village'], createdAt: r['created_at'],
    });
  }),
);

programsLiveRouter.get(
  '/enrollments',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('program_enrollments').select('*').eq('org_id', orgId);
    if (req.query['beneficiaryId']) q = q.eq('beneficiary_id', req.query['beneficiaryId'] as string);
    if (req.query['projectId']) q = q.eq('project_id', req.query['projectId'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({
      items: (data ?? []).map((e) => ({
        id: e.id, orgId: e.org_id, beneficiaryId: e.beneficiary_id, projectId: e.project_id,
        enrolledAt: e.enrolled_at, note: e.note,
      })),
    });
  }),
);

programsLiveRouter.post(
  '/enrollments',
  requirePermission('member:write'),
  validate(enrollmentSchema),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const b = req.body as { beneficiaryId: string; projectId: string; enrolledAt: string; note: string };
    const { data, error } = await supabaseAdmin
      .from('program_enrollments')
      .insert({ org_id: orgId, beneficiary_id: b.beneficiaryId, project_id: b.projectId, enrolled_at: b.enrolledAt, note: b.note })
      .select('*')
      .single();
    if (error) pgError(error);
    const e = data as Record<string, unknown>;
    res.status(201).json({
      id: e['id'], orgId: e['org_id'], beneficiaryId: e['beneficiary_id'], projectId: e['project_id'],
      enrolledAt: e['enrolled_at'], note: e['note'],
    });
  }),
);

programsLiveRouter.get(
  '/services',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('program_services').select('*').eq('org_id', orgId).order('service_date', { ascending: false });
    if (req.query['projectId']) q = q.eq('project_id', req.query['projectId'] as string);
    if (req.query['beneficiaryId']) q = q.eq('beneficiary_id', req.query['beneficiaryId'] as string);
    if (req.query['kind']) q = q.eq('kind', req.query['kind'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({
      items: (data ?? []).map((s) => ({
        id: s.id, orgId: s.org_id, projectId: s.project_id, beneficiaryId: s.beneficiary_id, kind: s.kind,
        serviceDate: s.service_date, details: s.details, createdAt: s.created_at,
      })),
    });
  }),
);

programsLiveRouter.post(
  '/services',
  requirePermission('member:write'),
  validate(serviceRecordSchema),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const b = req.body as { projectId: string; beneficiaryId: string; kind: string; serviceDate: string; details: string };
    const { data, error } = await supabaseAdmin
      .from('program_services')
      .insert({ org_id: orgId, project_id: b.projectId, beneficiary_id: b.beneficiaryId, kind: b.kind, service_date: b.serviceDate, details: b.details })
      .select('*')
      .single();
    if (error) pgError(error);
    const s = data as Record<string, unknown>;
    res.status(201).json({
      id: s['id'], orgId: s['org_id'], projectId: s['project_id'], beneficiaryId: s['beneficiary_id'],
      kind: s['kind'], serviceDate: s['service_date'], details: s['details'], createdAt: s['created_at'],
    });
  }),
);

/* ── 4) Activities & training batches ─────────────────────────────────────── */

programsLiveRouter.get(
  '/activities',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('program_activities').select('*').eq('org_id', orgId).order('planned_date');
    if (req.query['projectId']) q = q.eq('project_id', req.query['projectId'] as string);
    if (req.query['status']) q = q.eq('status', req.query['status'] as string);
    const start = req.query['start'] as string | undefined;
    const end = req.query['end'] as string | undefined;
    if (start) q = q.gte('planned_date', start);
    if (end) q = q.lte('planned_date', end);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({
      items: (data ?? []).map((a) => ({
        id: a.id, orgId: a.org_id, projectId: a.project_id, titleBn: a.title_bn, kind: a.kind,
        plannedDate: a.planned_date, venue: a.venue, targetParticipants: a.target_participants,
        status: a.status, note: a.note, createdAt: a.created_at,
      })),
    });
  }),
);

programsLiveRouter.post(
  '/activities',
  requirePermission('member:write'),
  validate(activitySchema),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const b = req.body as { projectId: string; titleBn: string; kind: string; plannedDate: string; venue: string; targetParticipants: number; note: string };
    const { data, error } = await supabaseAdmin
      .from('program_activities')
      .insert({
        org_id: orgId, project_id: b.projectId, title_bn: b.titleBn, kind: b.kind,
        planned_date: b.plannedDate, venue: b.venue, target_participants: b.targetParticipants, note: b.note,
      })
      .select('*')
      .single();
    if (error) pgError(error);
    const a = data as Record<string, unknown>;
    res.status(201).json({
      id: a['id'], orgId: a['org_id'], projectId: a['project_id'], titleBn: a['title_bn'], kind: a['kind'],
      plannedDate: a['planned_date'], venue: a['venue'], targetParticipants: a['target_participants'],
      status: a['status'], note: a['note'], createdAt: a['created_at'],
    });
  }),
);

programsLiveRouter.post(
  '/activities/:id/decision',
  requirePermission('member:write'),
  validate(z.object({ status: z.enum(['done', 'cancelled']) })),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const { data, error } = await supabaseAdmin
      .from('program_activities')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!data) throw NotFound('কার্যক্রম পাওয়া যায়নি / Activity not found');
    const to = req.body['status'] as 'done' | 'cancelled';
    if (!canTransitionActivity(data.status as never, to)) {
      throw Conflict(`অবৈধ অবস্থান্তর ${data.status} → ${to} / Invalid activity transition`);
    }
    const up = await supabaseAdmin.from('program_activities').update({ status: to }).eq('id', data.id).eq('org_id', orgId);
    if (up.error) pgError(up.error);
    res.json({
      id: data.id, orgId: data.org_id, projectId: data.project_id, titleBn: data.title_bn, kind: data.kind,
      plannedDate: data.planned_date, venue: data.venue, targetParticipants: data.target_participants,
      status: to, note: data.note, createdAt: data.created_at,
    });
  }),
);

/** Batch stats from the shared pure helper over live rows. */
async function batchStatsFor(orgId: string, batch: Record<string, unknown>): Promise<BatchStats> {
  const [{ data: attendance }, { data: scores }, { data: certs }] = await Promise.all([
    supabaseAdmin.from('training_attendance').select('beneficiary_id, session_no, present').eq('org_id', orgId).eq('batch_id', batch['id'] as string),
    supabaseAdmin.from('training_test_scores').select('beneficiary_id, pre, post').eq('org_id', orgId).eq('batch_id', batch['id'] as string),
    supabaseAdmin.from('training_certificates').select('beneficiary_id').eq('org_id', orgId).eq('batch_id', batch['id'] as string),
  ]);
  const att = (attendance ?? []).map((a) => ({ batchId: batch['id'] as string, beneficiaryId: a.beneficiary_id, sessionNo: a.session_no, present: a.present }));
  const sc = (scores ?? []).map((s) => ({ batchId: batch['id'] as string, beneficiaryId: s.beneficiary_id, pre: Number(s.pre), post: Number(s.post) }));
  const certIds = new Set((certs ?? []).map((c) => c.beneficiary_id));
  const { batchStats } = await import('@samity/shared');
  return batchStats({ batch: { id: batch['id'] as string, sessions: batch['sessions'] as number }, attendance: att, scores: sc, certificates: [...certIds].map((beneficiaryId) => ({ id: '', orgId: '', certNo: '', batchId: batch['id'] as string, beneficiaryId, issuedAt: '' })) });
}

function batchToWire(b: Record<string, unknown>) {
  return {
    id: b['id'], orgId: b['org_id'], projectId: b['project_id'], code: b['code'], titleBn: b['title_bn'],
    trainerName: b['trainer_name'], trainerOrgBn: b['trainer_org_bn'], startDate: b['start_date'],
    endDate: b['end_date'], hours: b['hours'], sessions: b['sessions'], createdAt: b['created_at'],
  };
}

programsLiveRouter.get(
  '/batches',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('training_batches').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    if (req.query['projectId']) q = q.eq('project_id', req.query['projectId'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({ items: (data ?? []).map((b) => batchToWire(b as Record<string, unknown>)) });
  }),
);

programsLiveRouter.post(
  '/batches',
  requirePermission('branch:manage'),
  validate(trainingBatchSchema),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const b = req.body as { projectId: string; titleBn: string; trainerName: string; trainerOrgBn: string; startDate: string; endDate: string; hours: number; sessions: number };
    if (b.endDate < b.startDate) throw Conflict('শেষ তারিখ ভুল / End date before start');
    const seq = await nextSeq('training_batches', orgId, 'code', 'TRN');
    const { data, error } = await supabaseAdmin
      .from('training_batches')
      .insert({
        org_id: orgId, project_id: b.projectId, code: nextBatchCode(seq), title_bn: b.titleBn,
        trainer_name: b.trainerName, trainer_org_bn: b.trainerOrgBn, start_date: b.startDate,
        end_date: b.endDate, hours: b.hours, sessions: b.sessions,
      })
      .select('*')
      .single();
    if (error) pgError(error);
    res.status(201).json(batchToWire(data as Record<string, unknown>));
  }),
);

programsLiveRouter.get(
  '/batches/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const { data: batch, error } = await supabaseAdmin
      .from('training_batches')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!batch) throw NotFound('ব্যাচ পাওয়া যায়নি / Batch not found');
    const [{ data: attendance }, { data: scores }] = await Promise.all([
      supabaseAdmin.from('training_attendance').select('*').eq('org_id', orgId).eq('batch_id', batch.id),
      supabaseAdmin.from('training_test_scores').select('*').eq('org_id', orgId).eq('batch_id', batch.id),
    ]);
    res.json({
      batch: batchToWire(batch as Record<string, unknown>),
      attendance: (attendance ?? []).map((a) => ({ batchId: a.batch_id, beneficiaryId: a.beneficiary_id, sessionNo: a.session_no, present: a.present })),
      scores: (scores ?? []).map((s) => ({ batchId: s.batch_id, beneficiaryId: s.beneficiary_id, pre: Number(s.pre), post: Number(s.post) })),
      stats: await batchStatsFor(orgId, batch as Record<string, unknown>),
    });
  }),
);

programsLiveRouter.put(
  '/batches/:id/attendance',
  requirePermission('member:write'),
  validate(trainingAttendanceSchema.omit({ batchId: true })),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const batchId = req.params['id'] as string;
    const b = req.body as { beneficiaryId: string; sessionNo: number; present: boolean };
    const { data: batch } = await supabaseAdmin.from('training_batches').select('sessions').eq('org_id', orgId).eq('id', batchId).maybeSingle();
    if (!batch) throw NotFound('ব্যাচ পাওয়া যায়নি / Batch not found');
    if (b.sessionNo > batch.sessions) throw Conflict('সেশন নম্বর ব্যাচের সেশন সংখ্যার বেশি / Session beyond batch plan');
    // Upsert on the (batch, beneficiary, session) unique key → re-marking
    // attendance updates instead of duplicating (demo store semantics).
    const { error } = await supabaseAdmin.from('training_attendance').upsert(
      { org_id: orgId, batch_id: batchId, beneficiary_id: b.beneficiaryId, session_no: b.sessionNo, present: b.present },
      { onConflict: 'batch_id,beneficiary_id,session_no' },
    );
    if (error) pgError(error);
    res.json({ batchId, beneficiaryId: b.beneficiaryId, sessionNo: b.sessionNo, present: b.present });
  }),
);

programsLiveRouter.put(
  '/batches/:id/scores',
  requirePermission('member:write'),
  validate(testScoreSchema.omit({ batchId: true })),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const batchId = req.params['id'] as string;
    const b = req.body as { beneficiaryId: string; pre: number; post: number };
    const { error } = await supabaseAdmin
      .from('training_test_scores')
      .upsert(
        { org_id: orgId, batch_id: batchId, beneficiary_id: b.beneficiaryId, pre: b.pre, post: b.post },
        { onConflict: 'batch_id,beneficiary_id' },
      );
    if (error) pgError(error);
    res.json({ batchId, beneficiaryId: b.beneficiaryId, pre: b.pre, post: b.post });
  }),
);

programsLiveRouter.post(
  '/batches/:id/certificates',
  requirePermission('branch:manage'),
  validate(z.object({ beneficiaryId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const batchId = req.params['id'] as string;
    const beneficiaryId = req.body['beneficiaryId'] as string;
    const [{ data: batch }, { data: marks }, { data: score }] = await Promise.all([
      supabaseAdmin.from('training_batches').select('id, sessions').eq('org_id', orgId).eq('id', batchId).maybeSingle(),
      supabaseAdmin.from('training_attendance').select('present').eq('org_id', orgId).eq('batch_id', batchId).eq('beneficiary_id', beneficiaryId),
      supabaseAdmin.from('training_test_scores').select('post').eq('org_id', orgId).eq('batch_id', batchId).eq('beneficiary_id', beneficiaryId).maybeSingle(),
    ]);
    if (!batch) throw NotFound('ব্যাচ পাওয়া যায়নি / Batch not found');
    // Mirrors the 0044 DB trigger + demo rules: ≥60% attendance and post ≥ 40.
    const present = (marks ?? []).filter((m) => m.present).length;
    if (marks!.length === 0 || present < Math.ceil(marks!.length * 0.6) || present < Math.ceil(batch.sessions * 0.6)) {
      throw Conflict('সার্টিফিকেটে ন্যূনতম ৬০% উপস্থিতি আবশ্যক / Certificate requires ≥ 60% attendance');
    }
    if (!score || Number(score.post) < 40) {
      throw Conflict('পোস্ট-টেস্টে ন্যূনতম ৪০ নম্বর আবশ্যক / Post-test score ≥ 40 required');
    }
    const seq = await nextSeq('training_certificates', orgId, 'cert_no', `CERT-${new Date().getUTCFullYear()}`);
    const { data: cert, error } = await supabaseAdmin
      .from('training_certificates')
      .insert({ org_id: orgId, cert_no: nextCertificateNo(seq), batch_id: batchId, beneficiary_id: beneficiaryId })
      .select('*')
      .single();
    if (error) pgError(error);
    const c = cert as Record<string, unknown>;
    res.status(201).json({
      id: c['id'], orgId: c['org_id'], certNo: c['cert_no'], batchId: c['batch_id'],
      beneficiaryId: c['beneficiary_id'], issuedAt: c['issued_at'],
    });
  }),
);

programsLiveRouter.get(
  '/certificates',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('training_certificates').select('*').eq('org_id', orgId);
    if (req.query['batchId']) q = q.eq('batch_id', req.query['batchId'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    const [{ data: batches }, { data: beneficiaries }] = await Promise.all([
      supabaseAdmin.from('training_batches').select('*').eq('org_id', orgId),
      supabaseAdmin.from('beneficiaries').select('*').eq('org_id', orgId),
    ]);
    res.json({
      items: (data ?? []).map((c) => ({
        id: c.id, orgId: c.org_id, certNo: c.cert_no, batchId: c.batch_id, beneficiaryId: c.beneficiary_id, issuedAt: c.issued_at,
      })),
      batches: (batches ?? []).map((b) => batchToWire(b as Record<string, unknown>)),
      beneficiaries: (beneficiaries ?? []).map((b) => ({
        id: b['id'], orgId: b['org_id'], code: b['code'], memberId: b['member_id'], nameBn: b['name_bn'],
        guardianBn: b['guardian_bn'], phone: b['phone'], age: b['age'], gender: b['gender'],
        village: b['village'], createdAt: b['created_at'],
      })),
    });
  }),
);

/* ── 5) Budget monitoring ─────────────────────────────────────────────────── */

programsLiveRouter.get(
  '/expenses',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('project_expenses').select('*').eq('org_id', orgId).order('expense_date');
    if (req.query['projectId']) q = q.eq('project_id', req.query['projectId'] as string);
    if (req.query['start']) q = q.gte('expense_date', req.query['start'] as string);
    if (req.query['end']) q = q.lte('expense_date', req.query['end'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({
      items: (data ?? []).map((e) => ({
        id: e.id, orgId: e.org_id, projectId: e.project_id, expenseDate: e.expense_date,
        budgetLine: e.budget_line, amount: String(e.amount), voucherNo: e.voucher_no,
        description: e.description, recordedBy: e.recorded_by, createdAt: e.created_at,
      })),
    });
  }),
);

programsLiveRouter.post(
  '/expenses',
  requirePermission('member:write'),
  validate(projectExpenseSchema),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const b = req.body as { projectId: string; expenseDate: string; budgetLine: string; amount: string; voucherNo: string; description: string };
    const { data, error } = await supabaseAdmin
      .from('project_expenses')
      .insert({
        org_id: orgId, project_id: b.projectId, expense_date: b.expenseDate, budget_line: b.budgetLine,
        amount: b.amount, voucher_no: b.voucherNo, description: b.description,
        recorded_by: (req as RequestWithAuth).auth?.email ?? 'unknown',
      })
      .select('*')
      .single();
    if (error) pgError(error);
    const e = data as Record<string, unknown>;
    res.status(201).json({
      id: e['id'], orgId: e['org_id'], projectId: e['project_id'], expenseDate: e['expense_date'],
      budgetLine: e['budget_line'], amount: String(e['amount']), voucherNo: e['voucher_no'],
      description: e['description'], recordedBy: e['recorded_by'], createdAt: e['created_at'],
    });
  }),
);

/** All expenses as wire rows (feeds the shared budget/burn/donor helpers). */
async function expensesFor(orgId: string, projectId?: string) {
  let q = supabaseAdmin.from('project_expenses').select('project_id, budget_line, amount, expense_date').eq('org_id', orgId);
  if (projectId) q = q.eq('project_id', projectId);
  const { data } = await q;
  return (data ?? []).map((e) => ({ projectId: e.project_id as string, budgetLine: e.budget_line as string, amount: String(e.amount), expenseDate: e.expense_date as string }));
}

programsLiveRouter.get(
  '/projects/:id/budget-status',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const row = await projectRow(orgId, req.params['id'] as string);
    const project = await projectToWire(orgId, row);
    const expenses = await expensesFor(orgId, project.id as string);
    const asOf = (req.query['asOf'] as string | undefined) ?? todayStr();
    const allProjects = await Promise.all(
      ((await supabaseAdmin.from('projects').select('id, code, donor').eq('org_id', orgId)).data ?? []).map(async (p) => ({
        id: p.id as string, code: p.code as string, donor: p.donor as string,
        budget: (await projectToWire(orgId, p as Record<string, unknown>)).budget as { lineItem: string; amount: string; note: string }[],
      })),
    );
    res.json({
      monitor: budgetMonitor({ id: project.id as string, budget: project.budget as { lineItem: string; amount: string; note: string }[] }, expenses),
      burn: burnRate({ startDate: project.startDate as string, endDate: project.endDate as string, budget: project.budget as { lineItem: string; amount: string; note: string }[] }, expenses, asOf),
      donorRow: donorUtilization(allProjects, expenses).find((d) => d.projectCodes.includes(project.code as string)) ?? null,
    });
  }),
);

programsLiveRouter.get(
  '/budget/alerts',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const projects = ((await supabaseAdmin.from('projects').select('*').eq('org_id', orgId)).data ?? []) as Record<string, unknown>[];
    const expenses = await expensesFor(orgId);
    const rows = [];
    for (const p of projects) {
      const monitor = budgetMonitor({ id: p['id'] as string, budget: ((p['target_areas'] ?? []), []) }, expenses.filter((e) => e.projectId === p['id']));
      void monitor; // budget lines loaded separately below
      const wire = await projectToWire(orgId, p);
      const m = budgetMonitor({ id: wire.id as string, budget: wire.budget as { lineItem: string; amount: string; note: string }[] }, expenses.filter((e) => e.projectId === wire.id));
      for (const line of m.lines) {
        if (line.alert === 'ok') continue;
        rows.push({
          projectId: wire.id, projectCode: wire.code, projectNameBn: wire.nameBn, donor: wire.donor,
          lineItem: line.lineItem, budgeted: line.budgeted, spent: line.spent,
          utilizationPct: line.utilizationPct, alert: line.alert,
        });
      }
    }
    rows.sort((a, b) => b.utilizationPct - a.utilizationPct);
    res.json({ items: rows });
  }),
);

programsLiveRouter.get(
  '/budget/donor-utilization',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const projects = ((await supabaseAdmin.from('projects').select('id, code, donor').eq('org_id', orgId)).data ?? []) as Record<string, unknown>[];
    const expenses = await expensesFor(orgId);
    const all = await Promise.all(
      projects.map(async (p) => ({
        id: p['id'] as string, code: p['code'] as string, donor: p['donor'] as string,
        budget: (await projectToWire(orgId, p)).budget as { lineItem: string; amount: string; note: string }[],
      })),
    );
    res.json({ items: donorUtilization(all, expenses) });
  }),
);

/* ── 6) Field monitoring visits ───────────────────────────────────────────── */

function visitToWire(v: Record<string, unknown>, today: string) {
  const checklist = v['checklist'] as { item: string; passed: boolean; note: string }[];
  const followUps = v['follow_ups'] as { action: string; owner: string; dueDate: string; done: boolean }[];
  return {
    id: v['id'], orgId: v['org_id'], projectId: v['project_id'], visitDate: v['visit_date'],
    officerId: v['officer_id'], officerName: v['officer_name'], village: v['village'],
    beneficiariesMet: v['beneficiaries_met'], checklist, photos: v['photos'] ?? [],
    findings: v['findings'], followUps,
    scorePct: visitScore(checklist),
    overdueFollowUps: followUps.filter((f) => !f.done && f.dueDate < today).length,
    createdAt: v['created_at'],
  };
}

programsLiveRouter.get(
  '/visits',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('field_visits').select('*').eq('org_id', orgId).order('visit_date', { ascending: false });
    if (req.query['projectId']) q = q.eq('project_id', req.query['projectId'] as string);
    if (req.query['officerId']) q = q.eq('officer_id', req.query['officerId'] as string);
    if (req.query['start']) q = q.gte('visit_date', req.query['start'] as string);
    if (req.query['end']) q = q.lte('visit_date', req.query['end'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({ items: (data ?? []).map((v) => visitToWire(v as Record<string, unknown>, todayStr())) });
  }),
);

programsLiveRouter.post(
  '/visits',
  requirePermission('member:write'),
  validate(fieldVisitSchema),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const b = req.body as {
      projectId: string; visitDate: string; officerId: string; officerName: string; village: string;
      beneficiariesMet: number; checklist: { item: string; passed: boolean; note: string }[];
      photos: { id: string; labelBn: string; path: string }[]; findings: string;
      followUps: { action: string; owner: string; dueDate: string; done: boolean }[];
    };
    const { data, error } = await supabaseAdmin
      .from('field_visits')
      .insert({
        org_id: orgId, project_id: b.projectId, visit_date: b.visitDate, officer_id: b.officerId,
        officer_name: b.officerName, village: b.village, beneficiaries_met: b.beneficiariesMet,
        checklist: b.checklist, photos: b.photos, findings: b.findings, follow_ups: b.followUps,
      })
      .select('*')
      .single();
    if (error) pgError(error);
    res.status(201).json(visitToWire(data as Record<string, unknown>, todayStr()));
  }),
);

programsLiveRouter.get(
  '/visits/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const { data, error } = await supabaseAdmin
      .from('field_visits')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!data) throw NotFound('পরিদর্শন পাওয়া যায়নি / Visit not found');
    res.json(visitToWire(data as Record<string, unknown>, todayStr()));
  }),
);

/* ── 7) Donor reports ─────────────────────────────────────────────────────── */

programsLiveRouter.get(
  '/donor-reports',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('donor_reports').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    if (req.query['projectId']) q = q.eq('project_id', req.query['projectId'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({
      items: (data ?? []).map((r) => ({
        id: r.id, orgId: r.org_id, projectId: r.project_id, periodStart: r.period_start,
        periodEnd: r.period_end, report: r.payload, generatedBy: r.generated_by, generatedAt: r.created_at,
      })),
    });
  }),
);

programsLiveRouter.post(
  '/donor-reports',
  requirePermission('branch:manage'),
  validate(z.object({ projectId: z.string().uuid(), periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const projectId = req.body['projectId'] as string;
    const periodStart = req.body['periodStart'] as string;
    const periodEnd = req.body['periodEnd'] as string;
    if (periodEnd < periodStart) throw Conflict('পর্বের তারিখ ভুল / Invalid reporting period');
    const project = await projectToWire(orgId, await projectRow(orgId, projectId));
    const [{ data: logframe }, { data: values }, expenses, servicesRes, activitiesRes, enrollmentsRes, { data: visits }] = await Promise.all([
      supabaseAdmin.from('logframe_entries').select('*').eq('org_id', orgId).eq('project_id', projectId),
      supabaseAdmin.from('indicator_values').select('*').eq('org_id', orgId),
      expensesFor(orgId, projectId),
      supabaseAdmin.from('program_services').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('project_id', projectId),
      supabaseAdmin.from('program_activities').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('project_id', projectId).eq('status', 'done'),
      supabaseAdmin.from('program_enrollments').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('project_id', projectId),
      supabaseAdmin.from('field_visits').select('visit_date, checklist, findings, follow_ups, officer_name, beneficiaries_met, photos, project_id, id, org_id, officer_id, village, created_at').eq('org_id', orgId),
    ]);
    const report = buildDonorReport({
      project: {
        id: project.id as string, orgId: project.orgId as string, code: project.code as string,
        nameBn: project.nameBn as string, nameEn: project.nameEn as string, donor: project.donor as string,
        grantAgreementNo: project.grantAgreementNo as string, fundCode: project.fundCode as string,
        sector: project.sector as never, startDate: project.startDate as string,
        endDate: project.endDate as string, targetAreas: project.targetAreas as string[],
        targetBeneficiaries: project.targetBeneficiaries as number,
        budget: project.budget as { lineItem: string; amount: string; note: string }[],
        status: project.status as never, managerName: project.managerName as string,
        createdAt: project.createdAt as string, updatedAt: project.updatedAt as string,
      },
      logframe: (logframe ?? []).map((e) => ({
        id: e.id, orgId: e.org_id, projectId: e.project_id, level: e.level, statement: e.statement,
        parentLabel: e.parent_label, indicatorCode: e.indicator_code, baseline: e.baseline,
        targetValue: e.target_value, unit: e.unit, meansOfVerification: e.means_of_verification, createdAt: e.created_at,
      })),
      indicatorValues: (values ?? []).map((v) => ({
        id: v.id, orgId: v.org_id, entryId: v.entry_id, periodStart: v.period_start, periodEnd: v.period_end,
        value: v.value, evidence: v.evidence ?? [], note: v.note, enteredAt: v.entered_at,
      })),
      expenses,
      servicesCount: servicesRes.count ?? 0,
      activitiesDone: activitiesRes.count ?? 0,
      beneficiariesEnrolled: enrollmentsRes.count ?? 0,
      visits: (visits ?? []).filter((v) => v.project_id === projectId).map((v) => visitToWire(v as Record<string, unknown>, todayStr())) as never,
      periodStart,
      periodEnd,
    });
    const { data, error } = await supabaseAdmin
      .from('donor_reports')
      .upsert(
        { org_id: orgId, project_id: projectId, period_start: periodStart, period_end: periodEnd, payload: report, generated_by: (req as RequestWithAuth).auth?.email ?? 'unknown' },
        { onConflict: 'org_id,project_id,period_start,period_end' },
      )
      .select('*')
      .single();
    if (error) pgError(error);
    const r = data as Record<string, unknown>;
    res.status(201).json({
      id: r['id'], orgId: r['org_id'], projectId: r['project_id'], periodStart: r['period_start'],
      periodEnd: r['period_end'], report: r['payload'], generatedBy: r['generated_by'], generatedAt: r['created_at'],
    });
  }),
);

programsLiveRouter.get(
  '/donor-reports/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const { data, error } = await supabaseAdmin
      .from('donor_reports')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!data) throw NotFound('প্রতিবেদন পাওয়া যায়নি / Report not found');
    res.json({
      id: data.id, orgId: data.org_id, projectId: data.project_id, periodStart: data.period_start,
      periodEnd: data.period_end, report: data.payload, generatedBy: data.generated_by, generatedAt: data.created_at,
    });
  }),
);

programsLiveRouter.get(
  '/donor-reports/:id/export',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const { data, error } = await supabaseAdmin
      .from('donor_reports')
      .select('payload, period_start, project_id')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!data) throw NotFound('প্রতিবেদন পাওয়া যায়নি / Report not found');
    const html = buildDonorReportHtml(data.payload, 'স্যামিটি ম্যানেজার সমবায় সমিতি', 'Samity Manager Cooperative Society');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="donor-report-${data.project_id}-${data.period_start}.html"`);
    res.send(html);
  }),
);

/* ── 8) Sensitive case management ─────────────────────────────────────────── */
// Row-level clearance mirrors 0046's RLS: case workers (admins + area
// managers) and the assigned worker see full rows; everyone else gets masked
// rows. Every read of a case writes a case_access_log row (view/view_restricted).

programsLiveRouter.get(
  '/cases/stats',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const { data } = await supabaseAdmin.from('cases').select('type, status').eq('org_id', orgId);
    const rows = data ?? [];
    const byType: Record<string, number> = {};
    for (const c of rows) byType[c.type] = (byType[c.type] ?? 0) + 1;
    res.json({
      total: rows.length,
      open: rows.filter((c) => c.status === 'open').length,
      inProgress: rows.filter((c) => c.status === 'in_progress').length,
      referred: rows.filter((c) => c.status === 'referred').length,
      closed: rows.filter((c) => c.status === 'closed').length,
      byType,
    });
  }),
);

function caseWire(c: Record<string, unknown>) {
  return {
    id: c['id'], orgId: c['org_id'], caseNo: c['case_no'], type: c['type'], severity: c['severity'],
    status: c['status'], beneficiaryId: c['beneficiary_id'], beneficiaryName: c['beneficiary_name'],
    restrictedDetails: c['restricted_details'], consentGiven: c['consent_given'],
    openedAt: c['opened_at'], assignedWorkerId: c['assigned_worker_id'],
    assignedWorkerName: c['assigned_worker_name'], closedAt: c['closed_at'],
    createdAt: c['created_at'], updatedAt: c['updated_at'],
  };
}

programsLiveRouter.get(
  '/cases',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const viewer = viewerOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('cases').select('*').eq('org_id', orgId).order('opened_at', { ascending: false });
    if (req.query['status']) q = q.eq('status', req.query['status'] as string);
    if (req.query['type']) q = q.eq('type', req.query['type'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    const rows = data ?? [];
    // Access log writes are best-effort; the listing itself never fails on them.
    await supabaseAdmin.from('case_access_log').insert(
      rows.map((c) => ({ org_id: orgId, case_id: c.id, user_id: viewer.userId, user_name: viewer.userName, action: 'view' as const })),
    );
    const items = rows.map((c) => (canManageCases(viewer.role, c.assigned_worker_id, viewer.userId) ? caseWire(c as Record<string, unknown>) : maskCase(caseWire(c as Record<string, unknown>) as never)));
    const first = items[0] as { restrictedDetails: string | null } | undefined;
    res.json({ items, restrictedUnlocked: first !== undefined && first.restrictedDetails !== null });
  }),
);

programsLiveRouter.post(
  '/cases',
  requirePermission('member:read'),
  validate(caseFileSchema),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const viewer = viewerOf(req as RequestWithAuth);
    if (!canManageCases(viewer.role, null, viewer.userId)) {
      throw NotFound('শুধু কেস ওয়ার্কার কেস খুলতে পারেন / Only case workers open cases');
    }
    const b = req.body as {
      type: string; severity: string; beneficiaryId: string | null; beneficiaryName: string;
      restrictedDetails: string; consentGiven: boolean; assignedWorkerId: string; assignedWorkerName: string;
    };
    const seq = await nextSeq('cases', orgId, 'case_no', 'CASE');
    const { data, error } = await supabaseAdmin
      .from('cases')
      .insert({
        org_id: orgId, case_no: nextCaseNo(seq), type: b.type, severity: b.severity, status: 'open',
        beneficiary_id: b.beneficiaryId, beneficiary_name: b.beneficiaryName,
        restricted_details: b.restrictedDetails, consent_given: b.consentGiven,
        assigned_worker_id: b.assignedWorkerId, assigned_worker_name: b.assignedWorkerName,
      })
      .select('*')
      .single();
    if (error) pgError(error);
    await supabaseAdmin.from('case_access_log').insert({ org_id: orgId, case_id: (data as Record<string, unknown>)['id'], user_id: viewer.userId, user_name: viewer.userName, action: 'create' });
    res.status(201).json(caseWire(data as Record<string, unknown>));
  }),
);

programsLiveRouter.get(
  '/cases/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const viewer = viewerOf(req as RequestWithAuth);
    const { data, error } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!data) throw NotFound('কেস পাওয়া যায়নি / Case not found');
    const cleared = canManageCases(viewer.role, data.assigned_worker_id, viewer.userId);
    await supabaseAdmin.from('case_access_log').insert({ org_id: orgId, case_id: data.id, user_id: viewer.userId, user_name: viewer.userName, action: cleared ? 'view_restricted' : 'view' });
    const wire = caseWire(data as Record<string, unknown>);
    res.json({ case: cleared ? wire : maskCase(wire as never), restrictedUnlocked: cleared });
  }),
);

programsLiveRouter.post(
  '/cases/:id/decision',
  requirePermission('member:read'),
  validate(z.object({ status: z.enum(['open', 'in_progress', 'referred', 'closed']) })),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const viewer = viewerOf(req as RequestWithAuth);
    const { data, error } = await supabaseAdmin
      .from('cases')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!data) throw NotFound('কেস পাওয়া যায়নি / Case not found');
    if (!canManageCases(viewer.role, data.assigned_worker_id, viewer.userId)) {
      throw NotFound('শুধু কেস ওয়ার্কার কেস পরিবর্তন করতে পারেন / Only case workers update cases');
    }
    const to = req.body['status'] as CaseStatus;
    if (!canTransitionCase(data.status as CaseStatus, to)) {
      throw Conflict(`অবৈধ কেস অবস্থান্তর ${data.status} → ${to} / Invalid case transition`);
    }
    const upd = await supabaseAdmin
      .from('cases')
      .update({ status: to, closed_at: to === 'closed' ? nowIso() : data.closed_at })
      .eq('id', data.id)
      .eq('org_id', orgId);
    if (upd.error) pgError(upd.error);
    await supabaseAdmin.from('case_access_log').insert({ org_id: orgId, case_id: data.id, user_id: viewer.userId, user_name: viewer.userName, action: to === 'closed' ? 'close' : 'update' });
    res.json(caseWire({ ...data, status: to, closed_at: to === 'closed' ? nowIso() : data.closed_at }));
  }),
);

programsLiveRouter.get(
  '/cases/:id/access-log',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const viewer = viewerOf(req as RequestWithAuth);
    const { data: record, error } = await supabaseAdmin
      .from('cases')
      .select('assigned_worker_id')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!record) throw NotFound('কেস পাওয়া যায়নি / Case not found');
    if (!canManageCases(viewer.role, record.assigned_worker_id, viewer.userId)) {
      throw NotFound('অ্যাক্সেস লগ শুধু কেস ওয়ার্কার দেখেন / Access log is case-worker only');
    }
    const { data, error: le } = await supabaseAdmin
      .from('case_access_log')
      .select('*')
      .eq('org_id', orgId)
      .eq('case_id', req.params['id'] as string)
      .order('at', { ascending: false });
    if (le) pgError(le);
    res.json({
      items: (data ?? []).map((l) => ({
        id: l.id, orgId: l.org_id, caseId: l.case_id, userId: l.user_id, userName: l.user_name,
        action: l.action, at: l.at,
      })),
    });
  }),
);

/* ── 9) Grants & borrowing tracker ────────────────────────────────────────── */

function fundingToWire(f: Record<string, unknown>) {
  return {
    id: f['id'], orgId: f['org_id'], code: f['code'], sourceName: f['source_name'], kind: f['kind'],
    principal: String(f['principal']), interestRatePct: String(f['interest_rate_pct']),
    tenureMonths: f['tenure_months'], disbursementDate: f['disbursement_date'],
    repaymentStart: f['repayment_start'], purposeProjectId: f['purpose_project_id'],
    lenderContact: f['lender_contact'], status: f['status'], createdAt: f['created_at'],
  };
}

programsLiveRouter.get(
  '/funding',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    let q = supabaseAdmin.from('funding_sources').select('*').eq('org_id', orgId).order('created_at', { ascending: false });
    if (req.query['kind']) q = q.eq('kind', req.query['kind'] as string);
    if (req.query['status']) q = q.eq('status', req.query['status'] as string);
    const { data, error } = await q;
    if (error) pgError(error);
    res.json({
      items: (data ?? []).map((f) => {
        const wire = fundingToWire(f as Record<string, unknown>);
        const method = f.kind === 'grant' || f.kind === 'internal_fund' ? 'flat' : 'declining';
        return { ...wire, summary: repaymentSummary(repaymentSchedule({ principal: wire.principal as string, interestRatePct: wire.interestRatePct as string, tenureMonths: wire.tenureMonths as number, repaymentStart: wire.repaymentStart as string, method })) };
      }),
    });
  }),
);

programsLiveRouter.post(
  '/funding',
  requirePermission('branch:manage'),
  validate(fundingSourceSchema),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const b = req.body as {
      sourceName: string; kind: string; principal: string; interestRatePct: string; tenureMonths: number;
      disbursementDate: string; repaymentStart: string; purposeProjectId: string | null; lenderContact: string;
    };
    if (b.repaymentStart < b.disbursementDate) throw Conflict('পরিশোধ শুরু চেক ইস্যুর পরে হতে হবে / Repayment must start after disbursement');
    if (b.purposeProjectId) await projectRow(orgId, b.purposeProjectId);
    const seq = await nextSeq('funding_sources', orgId, 'code', 'FND');
    const code = `FND-${String(seq).padStart(4, '0')}`;
    const method = b.kind === 'grant' || b.kind === 'internal_fund' ? 'flat' : 'declining';
    const schedule = repaymentSchedule({ principal: b.principal, interestRatePct: b.interestRatePct, tenureMonths: b.tenureMonths, repaymentStart: b.repaymentStart, method });
    const { data, error } = await supabaseAdmin
      .from('funding_sources')
      .insert({
        org_id: orgId, code, source_name: b.sourceName, kind: b.kind, principal: b.principal,
        interest_rate_pct: b.interestRatePct, tenure_months: b.tenureMonths,
        disbursement_date: b.disbursementDate, repayment_start: b.repaymentStart,
        purpose_project_id: b.purposeProjectId, lender_contact: b.lenderContact, status: 'active',
      })
      .select('*')
      .single();
    if (error) pgError(error);
    // Persist the amortization rows (used by the detail endpoint + repayments page).
    if (schedule.length > 0) {
      await supabaseAdmin.from('funding_repayments').insert(
        schedule.map((s) => ({
          org_id: orgId, source_id: (data as Record<string, unknown>)['id'], installment_no: s.installmentNo,
          due_date: s.dueDate, principal: s.principal, interest: s.interest, total: s.total,
          balance: s.balance, paid: false,
        })),
      );
    }
    res.status(201).json({ ...fundingToWire(data as Record<string, unknown>), schedule, summary: repaymentSummary(schedule) });
  }),
);

programsLiveRouter.get(
  '/funding/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const orgId = orgOf(req as RequestWithAuth);
    const { data: f, error } = await supabaseAdmin
      .from('funding_sources')
      .select('*')
      .eq('org_id', orgId)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) pgError(error);
    if (!f) throw NotFound('তহবিল উৎস পাওয়া যায়নি / Funding source not found');
    const { data: rows } = await supabaseAdmin
      .from('funding_repayments')
      .select('*')
      .eq('org_id', orgId)
      .eq('source_id', f.id)
      .order('installment_no');
    const schedule = (rows ?? []).map((r) => ({
      installmentNo: r.installment_no as number, dueDate: r.due_date as string,
      principal: String(r.principal), interest: String(r.interest), total: String(r.total),
      balance: String(r.balance), paid: r.paid as boolean, paidAt: r.paid_at as string | null,
    }));
    const scheduleOrComputed = schedule.length > 0
      ? schedule
      : repaymentSchedule({ principal: String(f.principal), interestRatePct: String(f.interest_rate_pct), tenureMonths: f.tenure_months, repaymentStart: f.repayment_start, method: f.kind === 'grant' || f.kind === 'internal_fund' ? 'flat' : 'declining' });
    res.json({ ...fundingToWire(f as Record<string, unknown>), schedule: scheduleOrComputed, summary: repaymentSummary(scheduleOrComputed) });
  }),
);
