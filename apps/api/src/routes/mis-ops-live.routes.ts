/**
 * ── MIS ops live router (Supabase) ──────────────────────────────────────────
 * Mirrors mis-ops.routes.ts against the real tables (migration 0050):
 * complaint register with SLA + escalation, client-protection indicators,
 * the ad-hoc report builder over live snapshot data, CSV/Excel/PDF exports,
 * scheduled delivery (free SMTP), month data-freeze and matview stats.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  COMPLAINT_CATEGORY_LABELS_BN,
  COMPLAINT_CHANNEL_LABELS_BN,
  COMPLAINT_SEVERITY_LABELS_BN,
  COMPLAINT_STATUS_LABELS_BN,
  FREEZE_MESSAGES_BN,
  STANDARD_REPORTS,
  canTransitionComplaint,
  clientProtectionIndicators,
  complaintCreateSchema,
  complaintActionSchema,
  complaintDueAt,
  deliveryEmailBodyBn,
  deliveryEmailSubjectBn,
  exportScheduleSchema,
  freezeCheck,
  isScheduleDue,
  monthFreezeSchema,
  nextComplaintTicket,
  nextEscalationLevel,
  num,
  runBuilder,
  savedReportSchema,
  smtpFromEnv,
  toCsv,
  toExcelXml,
  toPrintHtml,
  type BuilderData,
  type ComplaintActionBody,
  type ComplaintCreateBody,
  type ComplaintRecord,
  type ExportSchedule,
  type ExportScheduleBody,
  type MonthFreeze,
  type MonthFreezeBody,
  type SavedReport,
  type SavedReportBody,
  type StandardReportKind,
} from '@samity/shared';
import { BadRequest, Conflict, Forbidden, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { orgOf } from '../lib/tenant.js';
import { sendMail } from '../lib/mis-ops-store.js';
import { buildLiveSnapshot, liveStandardReport } from './mis-live.routes.js';

export const misOpsLiveRouter = Router();
misOpsLiveRouter.use(requireAuth);

const todayStr = () => new Date().toISOString().slice(0, 10);
const viewerOf = (req: RequestWithAuth) => ({ userId: req.auth?.userId ?? 'unknown', name: req.auth?.email ?? 'unknown', role: req.auth?.role ?? 'member' });

/** RFC 5987 Content-Disposition: Bangla filenames need an ASCII fallback + filename*. */
function contentDisposition(filename: string, inline: boolean): string {
  const type = inline ? 'inline' : 'attachment';
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/* ═════════════════ 10) Complaint register ═════════════════════════════════ */

function complaintToWire(r: Record<string, unknown>): ComplaintRecord {
  return {
    id: String(r['id']),
    orgId: String(r['org_id']),
    ticketNo: String(r['ticket_no']),
    channel: r['channel'] as ComplaintRecord['channel'],
    category: r['category'] as ComplaintRecord['category'],
    status: r['status'] as ComplaintRecord['status'],
    severity: r['severity'] as ComplaintRecord['severity'],
    subject: String(r['subject'] ?? ''),
    details: String(r['details'] ?? ''),
    memberId: (r['member_id'] as string | null) ?? '',
    memberName: String(r['member_name'] ?? ''),
    branchId: (r['branch_id'] as string | null) ?? '',
    reportedAt: String(r['reported_at'] ?? ''),
    dueAt: String(r['due_at'] ?? ''),
    acknowledgedAt: (r['acknowledged_at'] as string | null) ?? null,
    resolvedAt: (r['resolved_at'] as string | null) ?? null,
    resolutionNote: String(r['resolution_note'] ?? ''),
    escalations: (r['escalations'] ?? []) as ComplaintRecord['escalations'],
    createdAt: String(r['created_at']),
    updatedAt: String(r['updated_at']),
  };
}

misOpsLiveRouter.get(
  '/complaints',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const q = req.query;
    let query = supabaseAdmin.from('complaints').select('*').eq('org_id', orgOf(req)).order('reported_at', { ascending: false }).order('ticket_no', { ascending: false });
    if (q['status']) query = query.eq('status', q['status'] as string);
    if (q['category']) query = query.eq('category', q['category'] as string);
    if (q['branchId']) query = query.eq('branch_id', q['branchId'] as string);
    if (q['q']) {
      const like = `%${q['q']}%`;
      query = query.or(`ticket_no.ilike.${like},member_name.ilike.${like},subject.ilike.${like}`);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: (data ?? []).map((r) => complaintToWire(r as Record<string, unknown>)) });
  }),
);

misOpsLiveRouter.get(
  '/complaints/:id',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { data, error } = await supabaseAdmin.from('complaints').select('*').eq('id', req.params['id'] as string).eq('org_id', orgOf(req)).maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('অভিযোগ পাওয়া যায়নি / Complaint not found');
    res.json(complaintToWire(data as Record<string, unknown>));
  }),
);

misOpsLiveRouter.post(
  '/complaints',
  requirePermission('member:write'),
  validate(complaintCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const body = req.body as ComplaintCreateBody;
    // Req 9: a complaint dated in a hard-frozen month is a correction — reject.
    const month = body.reportedAt.slice(0, 7);
    const { data: frozen } = await supabaseAdmin.from('month_freezes').select('status').eq('org_id', orgId).eq('month', month).maybeSingle();
    if (frozen?.status === 'hard') throw Conflict(FREEZE_MESSAGES_BN.hard);

    const { count } = await supabaseAdmin.from('complaints').select('id', { count: 'exact', head: true }).eq('org_id', orgId);
    const ticketNo = nextComplaintTicket((count ?? 0) + 1);
    const { data, error } = await supabaseAdmin
      .from('complaints')
      .insert({
        org_id: orgId,
        ticket_no: ticketNo,
        channel: body.channel,
        category: body.category,
        severity: body.severity,
        subject: body.subject,
        details: body.details,
        member_id: body.memberId || null,
        member_name: body.memberName,
        branch_id: body.branchId || null,
        reported_at: body.reportedAt,
        due_at: complaintDueAt(body.reportedAt, body.severity),
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(complaintToWire(data as Record<string, unknown>));
  }),
);

const ACTION_TO_STATUS: Record<ComplaintActionBody['action'], ComplaintRecord['status']> = {
  acknowledge: 'in_progress',
  progress: 'in_progress',
  escalate: 'escalated',
  resolve: 'resolved',
  reject: 'rejected',
};

misOpsLiveRouter.post(
  '/complaints/:id/action',
  requirePermission('member:write'),
  validate(complaintActionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as ComplaintActionBody;
    const viewer = viewerOf(req);
    const { data, error } = await supabaseAdmin.from('complaints').select('*').eq('id', req.params['id'] as string).eq('org_id', orgOf(req)).maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('অভিযোগ পাওয়া যায়নি / Complaint not found');
    const rec = complaintToWire(data as Record<string, unknown>);

    const to = ACTION_TO_STATUS[body.action];
    if (!canTransitionComplaint(rec.status, to)) {
      throw Conflict(`অবৈধ অবস্থান্তর ${rec.status} → ${to} / Invalid complaint transition`);
    }
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: to, updated_at: now };
    if (body.action === 'acknowledge') patch['acknowledged_at'] = now;
    if (body.action === 'escalate') {
      patch['escalations'] = [
        ...rec.escalations,
        { level: nextEscalationLevel(rec), at: now, note: body.note || `${viewer.name} উর্ধ্বতনে প্রেরণ করেছেন` },
      ];
    }
    if (body.action === 'resolve') {
      patch['resolution_note'] = body.note ?? '';
      patch['resolved_at'] = body.resolvedOn ?? now.slice(0, 10);
    }
    if (body.action === 'reject' && !['super_admin', 'org_admin', 'area_manager'].includes(viewer.role)) {
      throw Forbidden('প্রত্যাখ্যান শুধু ব্যবস্থাপক-স্তরে / Only managers may reject');
    }
    const { data: updated, error: updErr } = await supabaseAdmin.from('complaints').update(patch).eq('id', rec.id).eq('org_id', orgOf(req)).select('*').single();
    if (updErr) throw updErr;
    res.json(complaintToWire(updated as Record<string, unknown>));
  }),
);

/* ── 5) Client protection indicators ──────────────────────────────────────── */

misOpsLiveRouter.get(
  '/protection',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const s = await buildLiveSnapshot(orgId, todayStr());
    const { data: complaintRows } = await supabaseAdmin.from('complaints').select('*').eq('org_id', orgId);
    res.json(
      clientProtectionIndicators(
        (complaintRows ?? []).map((r) => complaintToWire(r as Record<string, unknown>)),
        {
          borrowers: Math.max(1, new Set(s.loans.map((l) => l.memberId)).size),
          branches: s.branches.map((b) => ({ id: b.id, name: b.name })),
          overdueMemberIds: new Set(s.loans.filter((l) => l.daysPastDue > 0).map((l) => l.memberId)),
          periodStart: (req.query['start'] as string | undefined) ?? undefined,
          periodEnd: (req.query['end'] as string | undefined) ?? undefined,
        },
      ),
    );
  }),
);

/* ═════════════════ 6) Report builder ══════════════════════════════════════ */

/** BuilderData rows assembled from the live snapshot + live complaints. */
async function liveBuilderData(orgId: string): Promise<BuilderData> {
  const s = await buildLiveSnapshot(orgId, todayStr());
  const branchName = (id: string | null) => s.branches.find((b) => b.id === id)?.name ?? '—';
  const { data: complaintRows } = await supabaseAdmin.from('complaints').select('*').eq('org_id', orgId);
  return {
    loans: s.loans.map((l) => ({
      branchName: branchName(l.branchId),
      assetClass: l.assetClass,
      productName: l.productName ?? '—',
      outstanding: num(l.outstanding),
      overdueTotal: num(l.overdueTotal),
      daysPastDue: l.daysPastDue,
    })),
    savings: s.savings.byType.map((t) => ({ branchName: 'সব শাখা', productType: t.type, status: 'active', balance: num(t.balance) })),
    collections: s.staff.map((o) => ({
      officerName: o.officerName,
      branchName: branchName(o.branchId),
      dueAmount: num(o.dueAmount),
      collectedAmount: num(o.collectedAmount),
    })),
    complaints: (complaintRows ?? []).map((raw) => {
      const c = complaintToWire(raw as Record<string, unknown>);
      return {
        branchName: branchName(c.branchId),
        category: COMPLAINT_CATEGORY_LABELS_BN[c.category],
        status: COMPLAINT_STATUS_LABELS_BN[c.status],
        severity: COMPLAINT_SEVERITY_LABELS_BN[c.severity],
        channel: COMPLAINT_CHANNEL_LABELS_BN[c.channel],
      };
    }),
    members: s.members.map((m) => ({ branchName: branchName(m.branchId), samityName: m.samityName, active: m.active ? 'হ্যাঁ' : 'না' })),
  };
}

async function runAdHocLive(orgId: string, body: SavedReportBody) {
  const result = runBuilder(await liveBuilderData(orgId), body.dataset, body);
  return { ...result, chartType: body.chartType };
}

function savedToWire(r: Record<string, unknown>): SavedReport {
  return {
    id: String(r['id']),
    orgId: String(r['org_id']),
    name: String(r['name']),
    dataset: r['dataset'] as SavedReport['dataset'],
    filters: (r['filters'] ?? []) as SavedReport['filters'],
    groupBy: String(r['group_by'] ?? ''),
    metric: r['metric'] as SavedReport['metric'],
    metricField: (r['metric_field'] as string | null) ?? null,
    chartType: r['chart_type'] as SavedReport['chartType'],
    sharedWithRoles: (r['shared_with_roles'] ?? []) as string[],
    ownerUserId: String(r['owner_user_id'] ?? ''),
    ownerName: String(r['owner_name'] ?? ''),
    createdAt: String(r['created_at']),
    updatedAt: String(r['updated_at']),
  };
}

function canViewSaved(r: SavedReport, viewer: { userId: string; role: string }): boolean {
  return r.ownerUserId === viewer.userId || r.sharedWithRoles.includes(viewer.role) || ['super_admin', 'org_admin'].includes(viewer.role);
}

misOpsLiveRouter.get(
  '/builder/saved',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const viewer = viewerOf(req);
    const { data, error } = await supabaseAdmin.from('saved_reports').select('*').eq('org_id', orgOf(req)).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ items: (data ?? []).map((r) => savedToWire(r as Record<string, unknown>)).filter((r) => canViewSaved(r, viewer)) });
  }),
);

misOpsLiveRouter.post(
  '/builder/saved',
  requirePermission('member:read'),
  validate(savedReportSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as SavedReportBody;
    const viewer = viewerOf(req);
    const { data, error } = await supabaseAdmin
      .from('saved_reports')
      .insert({
        org_id: orgOf(req),
        name: body.name,
        dataset: body.dataset,
        filters: body.filters,
        group_by: body.groupBy,
        metric: body.metric,
        metric_field: body.metricField ?? null,
        chart_type: body.chartType,
        shared_with_roles: body.sharedWithRoles,
        owner_user_id: viewer.userId,
        owner_name: viewer.name,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(savedToWire(data as Record<string, unknown>));
  }),
);

misOpsLiveRouter.get(
  '/builder/saved/:id',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const viewer = viewerOf(req);
    const { data, error } = await supabaseAdmin.from('saved_reports').select('*').eq('id', req.params['id'] as string).eq('org_id', orgOf(req)).maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('সংরক্ষিত রিপোর্ট নেই / Saved report not found');
    const wire = savedToWire(data as Record<string, unknown>);
    if (!canViewSaved(wire, viewer)) throw Forbidden('প্রবেশাধিকার নেই / Not shared with you');
    res.json(wire);
  }),
);

misOpsLiveRouter.delete(
  '/builder/saved/:id',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const viewer = viewerOf(req);
    const { data, error } = await supabaseAdmin.from('saved_reports').select('*').eq('id', req.params['id'] as string).eq('org_id', orgOf(req)).maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('সংরক্ষিত রিপোর্ট নেই / Saved report not found');
    const wire = savedToWire(data as Record<string, unknown>);
    if (wire.ownerUserId !== viewer.userId && !['super_admin', 'org_admin'].includes(viewer.role)) {
      throw Forbidden('শুধু মালিক মুছতে পারেন / Only the owner may delete');
    }
    const { error: delErr } = await supabaseAdmin.from('saved_reports').delete().eq('id', wire.id).eq('org_id', orgOf(req));
    if (delErr) throw delErr;
    res.status(204).send();
  }),
);

misOpsLiveRouter.post(
  '/builder/run',
  requirePermission('member:read'),
  validate(savedReportSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    res.json(await runAdHocLive(orgOf(req), req.body as SavedReportBody));
  }),
);

misOpsLiveRouter.post(
  '/builder/saved/:id/run',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const viewer = viewerOf(req);
    const { data, error } = await supabaseAdmin.from('saved_reports').select('*').eq('id', req.params['id'] as string).eq('org_id', orgOf(req)).maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('সংরক্ষিত রিপোর্ট নেই / Saved report not found');
    const wire = savedToWire(data as Record<string, unknown>);
    if (!canViewSaved(wire, viewer)) throw Forbidden('প্রবেশাধিকার নেই / Not shared with you');
    res.json(await runAdHocLive(orgOf(req), wire as unknown as SavedReportBody));
  }),
);

/* ═════════════════ 7) Exports (CSV/Excel/PDF) ═════════════════════════════ */

interface ExportPayload {
  filename: string;
  contentType: string;
  body: string;
}

const STANDARD_TITLES: Record<string, string> = {
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

async function orgNameBnOf(orgId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('organizations').select('name, name_bn').eq('id', orgId).maybeSingle();
  return data?.name_bn || data?.name || 'সমবায় সমিতি';
}

function buildExportPayload(title: string, columns: { key: string; labelBn: string }[], rows: Record<string, unknown>[], format: 'csv' | 'excel' | 'pdf', orgNameBn: string): ExportPayload {
  const safe = title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'report';
  if (format === 'csv') {
    return { filename: `${safe}.csv`, contentType: 'text/csv; charset=utf-8', body: toCsv(columns, rows) };
  }
  if (format === 'excel') {
    return { filename: `${safe}.xls`, contentType: 'application/vnd.ms-excel; charset=utf-8', body: toExcelXml(safe, columns, rows) };
  }
  return { filename: `${safe}.html`, contentType: 'text/html; charset=utf-8', body: toPrintHtml(title, columns, rows, orgNameBn) };
}

misOpsLiveRouter.get(
  '/export/standard/:kind/:format',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const kind = req.params['kind'] as StandardReportKind;
    if (!STANDARD_REPORTS.includes(kind)) throw BadRequest(`অজানা রিপোর্ট / Unknown report kind: ${kind}`);
    const format = req.params['format'] as 'csv' | 'excel' | 'pdf';
    if (!['csv', 'excel', 'pdf'].includes(format)) throw BadRequest('অজানা ফরম্যাট / Unknown format');
    const orgId = orgOf(req);
    const report = await liveStandardReport(orgId, kind, {}, req.auth?.email ?? 'unknown');
    const payload = buildExportPayload(STANDARD_TITLES[kind] ?? kind, report.columns, report.rows, format, await orgNameBnOf(orgId));
    res.setHeader('Content-Disposition', contentDisposition(payload.filename, format === 'pdf'));
    res.setHeader('Content-Type', payload.contentType);
    res.send(payload.body);
  }),
);

misOpsLiveRouter.get(
  '/export/saved/:id/:format',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const format = req.params['format'] as 'csv' | 'excel' | 'pdf';
    if (!['csv', 'excel', 'pdf'].includes(format)) throw BadRequest('অজানা ফরম্যাট / Unknown format');
    const orgId = orgOf(req);
    const viewer = viewerOf(req);
    const { data, error } = await supabaseAdmin.from('saved_reports').select('*').eq('id', req.params['id'] as string).eq('org_id', orgId).maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('সংরক্ষিত রিপোর্ট নেই / Saved report not found');
    const wire = savedToWire(data as Record<string, unknown>);
    if (!canViewSaved(wire, viewer)) throw Forbidden('প্রবেশাধিকার নেই / Not shared with you');
    const result = await runAdHocLive(orgId, wire as unknown as SavedReportBody);
    const columns = [
      { key: 'group', labelBn: 'গ্রুপ' },
      { key: 'count', labelBn: 'সংখ্যা' },
      { key: 'metric', labelBn: wire.metric === 'count' ? 'গণনা' : wire.metric === 'sum' ? 'যোগফল' : 'গড়' },
    ];
    const rows = result.rows.map((r) => ({ group: r.group, count: r.count, metric: r.metric }));
    const payload = buildExportPayload(wire.name, columns, rows, format, await orgNameBnOf(orgId));
    res.setHeader('Content-Disposition', contentDisposition(payload.filename, false));
    res.setHeader('Content-Type', payload.contentType);
    res.send(payload.body);
  }),
);

/* ═════════════════ 7) Schedules (free-SMTP delivery) ══════════════════════ */

function scheduleToWire(r: Record<string, unknown>): ExportSchedule {
  return {
    id: String(r['id']),
    orgId: String(r['org_id']),
    name: String(r['name']),
    kind: r['kind'] as ExportSchedule['kind'],
    reportId: String(r['report_id'] ?? ''),
    format: r['format'] as ExportSchedule['format'],
    frequency: r['frequency'] as ExportSchedule['frequency'],
    runOn: Number(r['run_on'] ?? 1),
    recipients: (r['recipients'] ?? []) as string[],
    enabled: Boolean(r['enabled']),
    lastRunAt: (r['last_run_at'] as string | null) ?? null,
    lastStatus: (r['last_status'] as 'ok' | 'error' | null) ?? null,
    lastError: (r['last_error'] as string | null) ?? null,
    createdBy: String(r['created_by'] ?? ''),
    createdAt: String(r['created_at']),
  };
}

/** Build the attachment for a schedule's report (standard or saved). */
async function schedulePayload(orgId: string, s: ExportSchedule): Promise<ExportPayload | null> {
  if (s.kind === 'standard_report') {
    const kind = s.reportId as StandardReportKind;
    if (!STANDARD_REPORTS.includes(kind)) return null;
    const report = await liveStandardReport(orgId, kind, {}, 'schedule');
    return buildExportPayload(STANDARD_TITLES[kind] ?? kind, report.columns, report.rows, s.format, await orgNameBnOf(orgId));
  }
  const { data } = await supabaseAdmin.from('saved_reports').select('*').eq('id', s.reportId).maybeSingle();
  if (!data) return null;
  const body = savedToWire(data as Record<string, unknown>) as unknown as SavedReportBody;
  const result = await runAdHocLive(orgId, body);
  const columns = [
    { key: 'group', labelBn: 'গ্রুপ' },
    { key: 'count', labelBn: 'সংখ্যা' },
    { key: 'metric', labelBn: body.metric === 'count' ? 'গণনা' : body.metric === 'sum' ? 'যোগফল' : 'গড়' },
  ];
  const rows = result.rows.map((r) => ({ group: r.group, count: r.count, metric: r.metric }));
  return buildExportPayload(body.name, columns, rows, s.format, await orgNameBnOf(orgId));
}

/** Run one schedule: build the export, send via free SMTP, log the delivery. */
async function deliverSchedule(orgId: string, s: ExportSchedule): Promise<{ status: 'ok' | 'error'; error: string | null; lastRunAt: string }> {
  const now = new Date().toISOString();
  const record = async (status: 'ok' | 'error', error: string | null) => {
    await supabaseAdmin
      .from('export_schedules')
      .update({ last_run_at: now, last_status: status, last_error: error })
      .eq('id', s.id)
      .eq('org_id', orgId);
    await supabaseAdmin.from('export_deliveries').insert({
      org_id: orgId,
      schedule_id: s.id,
      status,
      recipients: s.recipients,
      error,
    });
  };

  const payload = await schedulePayload(orgId, s);
  if (!payload) {
    await record('error', 'report not found');
    return { status: 'error', error: 'report not found', lastRunAt: now };
  }
  const cfg = smtpFromEnv(process.env as Record<string, string | undefined>);
  if (!cfg) {
    await record('error', 'smtp-not-configured');
    return { status: 'error', error: 'smtp-not-configured', lastRunAt: now };
  }
  const today = todayStr();
  try {
    await sendMail(cfg, s.recipients, deliveryEmailSubjectBn(s.name, today, today), deliveryEmailBodyBn(s.name, 0, await orgNameBnOf(orgId)), {
      filename: payload.filename,
      content: payload.body,
    });
    await record('ok', null);
    return { status: 'ok', error: null, lastRunAt: now };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 200);
    await record('error', msg);
    return { status: 'error', error: msg, lastRunAt: now };
  }
}

misOpsLiveRouter.get(
  '/schedules',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { data, error } = await supabaseAdmin.from('export_schedules').select('*').eq('org_id', orgOf(req)).order('created_at', { ascending: false });
    if (error) throw error;
    res.json({
      items: (data ?? []).map((r) => scheduleToWire(r as Record<string, unknown>)),
      smtpConfigured: Boolean(process.env['SMTP_HOST']),
    });
  }),
);

misOpsLiveRouter.post(
  '/schedules',
  requirePermission('branch:manage'),
  validate(exportScheduleSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as ExportScheduleBody;
    const viewer = viewerOf(req);
    const { data, error } = await supabaseAdmin
      .from('export_schedules')
      .insert({
        org_id: orgOf(req),
        name: body.name,
        kind: body.kind,
        report_id: body.reportId,
        format: body.format,
        frequency: body.frequency,
        run_on: body.runOn,
        recipients: body.recipients,
        enabled: body.enabled ?? true,
        created_by: viewer.name,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ ...scheduleToWire(data as Record<string, unknown>), smtpConfigured: Boolean(process.env['SMTP_HOST']) });
  }),
);

misOpsLiveRouter.delete(
  '/schedules/:id',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const viewer = viewerOf(req);
    const { data, error } = await supabaseAdmin.from('export_schedules').select('*').eq('id', req.params['id'] as string).eq('org_id', orgOf(req)).maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('শিডিউল নেই / Schedule not found');
    const wire = scheduleToWire(data as Record<string, unknown>);
    if (wire.createdBy !== viewer.name && !['super_admin', 'org_admin'].includes(viewer.role)) {
      throw Forbidden('শুধু নির্মাতা মুছতে পারেন / Only the creator may delete');
    }
    const { error: delErr } = await supabaseAdmin.from('export_schedules').delete().eq('id', wire.id).eq('org_id', orgOf(req));
    if (delErr) throw delErr;
    res.status(204).send();
  }),
);

/** "Run now" for a single schedule, regardless of due date. */
misOpsLiveRouter.post(
  '/schedules/:id/run',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { data, error } = await supabaseAdmin.from('export_schedules').select('*').eq('id', req.params['id'] as string).eq('org_id', orgOf(req)).maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('শিডিউল পাওয়া যায়নি / Schedule not found');
    res.json(await deliverSchedule(orgOf(req), scheduleToWire(data as Record<string, unknown>)));
  }),
);

/** Cron entry: delivers every due schedule (call from pg_cron/worker with the service token). */
misOpsLiveRouter.post(
  '/schedules/run-due',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const { data, error } = await supabaseAdmin.from('export_schedules').select('*').eq('org_id', orgId).eq('enabled', true);
    if (error) throw error;
    const today = todayStr();
    let run = 0;
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const raw of data ?? []) {
      const s = scheduleToWire(raw as Record<string, unknown>);
      if (!isScheduleDue(s, today)) continue;
      run += 1;
      const result = await deliverSchedule(orgId, s);
      if (result.status === 'ok') sent += 1;
      else if (result.error === 'smtp-not-configured') skipped += 1;
      else failed += 1;
    }
    res.json({ run, sent, failed, skippedNoSmtp: skipped });
  }),
);

/* ═════════════════ 9) Data freeze ═════════════════════════════════════════ */

function freezeToWire(r: Record<string, unknown>): MonthFreeze {
  return {
    id: String(r['id']),
    orgId: String(r['org_id']),
    month: String(r['month']),
    status: r['status'] as MonthFreeze['status'],
    frozenBy: String(r['frozen_by'] ?? ''),
    frozenAt: String(r['frozen_at']),
    note: String(r['note'] ?? ''),
  };
}

misOpsLiveRouter.get(
  '/freeze',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { data, error } = await supabaseAdmin.from('month_freezes').select('*').eq('org_id', orgOf(req)).order('month', { ascending: false });
    if (error) throw error;
    res.json({ items: (data ?? []).map((r) => freezeToWire(r as Record<string, unknown>)) });
  }),
);

misOpsLiveRouter.post(
  '/freeze',
  requirePermission('org:manage'),
  validate(z.object({ ...monthFreezeSchema.shape, status: z.enum(['soft', 'hard']).default('hard') })),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const viewer = viewerOf(req);
    if (!['super_admin', 'org_admin'].includes(viewer.role)) {
      throw Forbidden('মাস হিমায়িত শুধু অ্যাডমিন করেন / Only admins freeze months');
    }
    const body = req.body as MonthFreezeBody & { status: 'soft' | 'hard' };
    const orgId = orgOf(req);
    const { data: existing } = await supabaseAdmin.from('month_freezes').select('id').eq('org_id', orgId).eq('month', body.month).maybeSingle();
    if (existing) throw Conflict(`মাস ${body.month} ইতিমধ্যে হিমায়িত / Month already frozen`);
    const { data, error } = await supabaseAdmin
      .from('month_freezes')
      .insert({ org_id: orgId, month: body.month, status: body.status ?? 'hard', frozen_by: viewer.name, note: body.note ?? '' })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(freezeToWire(data as Record<string, unknown>));
  }),
);

misOpsLiveRouter.delete(
  '/freeze/:month',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const viewer = viewerOf(req);
    if (!['super_admin', 'org_admin'].includes(viewer.role)) {
      throw Forbidden('আনহিমায়িত শুধু অ্যাডমিন / Only admins unfreeze');
    }
    const { data, error } = await supabaseAdmin
      .from('month_freezes')
      .delete()
      .eq('org_id', orgOf(req))
      .eq('month', req.params['month'] as string)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('হিমায়িত মাস নেই / Month not frozen');
    res.status(204).send();
  }),
);

/* ═════════════════ 8) Matview stats ═══════════════════════════════════════ */

misOpsLiveRouter.get(
  '/matviews',
  requirePermission('report:read'),
  asyncHandler(async (_req, res) => {
    const views: { name: string; labelBn: string; descriptionBn: string; rows: number | null; refreshMode: string }[] = [];
    for (const v of [
      { name: 'mv_branch_portfolio_daily', labelBn: 'শাখা পোর্টফোলিও (দৈনিক)', descriptionBn: 'শাখা-ভিত্তিক বকেয়া, ঋণ সংখ্যা, PAR — রাতে রিফ্রেশ' },
      { name: 'mv_officer_productivity_monthly', labelBn: 'কর্মী উৎপাদনশীলতা (মাসিক)', descriptionBn: 'কর্মী-ভিত্তিক আদায় দক্ষতা ও ঋণগ্রহীতা' },
      { name: 'mv_savings_position_daily', labelBn: 'সঞ্চয় অবস্থান (দৈনিক)', descriptionBn: 'শাখা/পণ্য-ভিত্তিক সঞ্চয় জমা' },
      { name: 'mv_complaint_sla_daily', labelBn: 'অভিযোগ এসএলএ (দৈনিক)', descriptionBn: 'খোলা/সমাধা অভিযোগ, গড় সমাধান দিন' },
    ]) {
      const { count, error } = await supabaseAdmin.from(v.name).select('*', { count: 'exact', head: true });
      views.push({ ...v, rows: error ? null : (count ?? 0), refreshMode: 'nightly (concurrently)' });
    }
    res.json({
      views,
      refreshSql: 'select refresh_mis_matviews();  -- pg_cron: 0 2 * * *',
      lastRefreshAt: new Date().toISOString(),
      indexes: [],
    });
  }),
);

/** Freeze guard exported for other live routers: rejects writes into hard-frozen months. */
export async function assertNotFrozenLive(orgId: string, date: string): Promise<void> {
  const { data } = await supabaseAdmin.from('month_freezes').select('status').eq('org_id', orgId).eq('month', date.slice(0, 7)).maybeSingle();
  if (data?.status === 'hard') throw Conflict(FREEZE_MESSAGES_BN.hard);
}

export { freezeCheck };
