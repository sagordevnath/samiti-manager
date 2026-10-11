/**
 * ── Documents live router (Supabase) ────────────────────────────────────────
 * Mirrors documents.routes.ts against the real tables (migration 0054):
 * doc templates with version history, document generation with QR verify
 * codes, the no-auth public verification endpoint, and the bulk-job queue
 * with its on-demand tick. Print-HTML/PDF + QR helpers are reused from the
 * demo store (pure rendering, no store state).
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  DOC_KINDS,
  DOC_KIND_LABELS_BN,
  DOC_REGISTERS,
  banglaCalendarDate,
  bulkJobSchema,
  defaultDocTemplates,
  docTemplateSchema,
  docVariablesUsed,
  numberToWordsBn,
  renderDocTemplate,
  verifyCodePayload,
  type BulkJob,
  type BulkJobBody,
  type BulkJobItem,
  type DocKind,
  type DocRegister,
  type DocTemplate,
  type DocTemplateVersion,
  type DocumentRecord,
  type ProtectedField,
} from '@samity/shared';
import { canUnmaskField, maskValue } from '@samity/shared';
import { BadRequest, Conflict, Forbidden, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { orgOf } from '../lib/tenant.js';
import { newVerifyCode, printDocHtml, publicBaseUrl, qrDataUrl } from '../lib/doc-store.js';

export const documentsLiveRouter = Router();

const viewerOf = (req: RequestWithAuth) => ({ userId: req.auth?.userId ?? 'unknown', name: req.auth?.email ?? 'unknown', role: req.auth?.role ?? 'member' });

async function orgNameBnOf(orgId: string): Promise<string> {
  const { data } = await supabaseAdmin.from('organizations').select('name, name_bn').eq('id', orgId).maybeSingle();
  return data?.name_bn || data?.name || 'সমবায় সমিতি';
}

const DOC_NO_PREFIX: Record<DocKind, string> = {
  membership_form: 'MEM',
  loan_application: 'LAPP',
  loan_agreement: 'AGR',
  guarantor_declaration: 'GUA',
  receipt: 'RCP',
  passbook_page: 'PB',
  meeting_minutes: 'MIN',
  notice: 'NOT',
  appointment_letter: 'APL',
  transfer_letter: 'TRN',
  legal_notice: 'LEG',
};

/* ── Req 7: public verification — deliberately BEFORE requireAuth ─────────── */
export const publicVerifyLiveRouter = Router();

publicVerifyLiveRouter.get(
  '/verify/:code',
  asyncHandler(async (req, res) => {
    const code = (req.params['code'] as string).toUpperCase();
    const { data } = await supabaseAdmin.from('documents').select('kind, doc_no, issued_at, status, org_id').eq('verify_code', code).maybeSingle();
    res.set('cache-control', 'no-store');
    if (!data) {
      res.json({ kind: 'notice', kindLabelBn: '', docNo: '', orgName: '', issuedAt: '', status: 'unknown' });
      return;
    }
    res.json({
      kind: data.kind,
      kindLabelBn: DOC_KIND_LABELS_BN[data.kind as DocKind] ?? '',
      docNo: data.doc_no,
      orgName: await orgNameBnOf(data.org_id),
      issuedAt: data.issued_at,
      status: data.status === 'active' ? 'valid' : 'revoked',
    });
  }),
);

/* ── Templates (req 5): list, upsert, preview, versions, restore ──────────── */

documentsLiveRouter.use(requireAuth);

function templateToWire(r: Record<string, unknown>): DocTemplate {
  return {
    id: String(r['id']),
    orgId: String(r['org_id']),
    kind: r['kind'] as DocKind,
    register: r['register'] as DocRegister,
    orientation: (r['orientation'] as 'portrait' | 'landscape') ?? 'portrait',
    body: String(r['body'] ?? ''),
    enabled: Boolean(r['enabled']),
    version: Number(r['version'] ?? 1),
    updatedAt: String(r['updated_at']),
    updatedBy: String(r['updated_by'] ?? ''),
  };
}

/** Best-effort bootstrap: a fresh project has no doc templates, so generation
 * fails with "no enabled template". Seed the shared defaults (with their v1
 * version snapshots) on first read; uuid PKs are generated server-side.
 * Swallows every error (RLS on the anon key) so reads never break. */
async function seedDefaultDocTemplatesIfEmpty(orgId: string): Promise<void> {
  if (!orgId) return;
  try {
    const { count } = await supabaseAdmin
      .from('doc_templates')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);
    if ((count ?? 0) > 0) return;
    const now = new Date().toISOString();
    const templates = defaultDocTemplates(orgId, 'system', now);
    const inserted = await supabaseAdmin
      .from('doc_templates')
      .insert(
        templates.map((t) => ({
          org_id: t.orgId,
          kind: t.kind,
          register: t.register,
          orientation: t.orientation,
          body: t.body,
          enabled: t.enabled,
          version: t.version,
          updated_by: t.updatedBy,
          updated_at: t.updatedAt,
        })),
      )
      .select('id, kind, register, version, body, orientation, updated_by, updated_at');
    if (inserted.error || !inserted.data || inserted.data.length === 0) return;
    await supabaseAdmin.from('doc_template_versions').insert(
      (inserted.data as Array<Record<string, unknown>>).map((r) => ({
        org_id: orgId,
        template_id: String(r['id']),
        version: Number(r['version'] ?? 1),
        body: String(r['body'] ?? ''),
        orientation: (String(r['orientation'] ?? 'portrait') as 'portrait' | 'landscape'),
        updated_by: String(r['updated_by'] ?? 'system'),
        updated_at: String(r['updated_at'] ?? now),
      })),
    );
  } catch {
    // Seeding is best-effort only — the empty list is still a valid response.
  }
}

documentsLiveRouter.get(
  '/templates',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    await seedDefaultDocTemplatesIfEmpty(orgId);
    const { data, error } = await supabaseAdmin.from('doc_templates').select('*').eq('org_id', orgId).order('kind');
    if (error) throw error;
    res.json({ items: (data ?? []).map((t) => templateToWire(t as Record<string, unknown>)) });
  }),
);

const templateUpsertSchema = docTemplateSchema.extend({ id: z.string().trim().min(1).max(60).optional() });

documentsLiveRouter.put(
  '/templates',
  requirePermission('branch:manage'),
  validate(templateUpsertSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const body = req.body as DocTemplateBodyLike;
    const { unknown } = docVariablesUsed(body.body);
    if (unknown.length > 0) throw BadRequest(`অজানা ভেরিয়েবল / Unknown variables: ${unknown.join(', ')}`);
    const viewer = viewerOf(req);
    const now = new Date().toISOString();

    let existing: DocTemplate | null = null;
    if (body.id) {
      const { data } = await supabaseAdmin.from('doc_templates').select('*').eq('id', body.id).eq('org_id', orgId).maybeSingle();
      existing = data ? templateToWire(data as Record<string, unknown>) : null;
      if (!existing) throw NotFound(`ডক টেমপ্লেট নেই / Doc template not found: ${body.id}`);
    } else {
      const { data } = await supabaseAdmin.from('doc_templates').select('*').eq('org_id', orgId).eq('kind', body.kind).eq('register', body.register).maybeSingle();
      existing = data ? templateToWire(data as Record<string, unknown>) : null;
    }

    const version = (existing?.version ?? 0) + 1;
    const row = {
      org_id: orgId,
      kind: body.kind,
      register: body.register,
      orientation: body.orientation ?? 'portrait',
      body: body.body,
      enabled: body.enabled,
      version,
      updated_by: viewer.name,
      updated_at: now,
    };
    const upsertPayload = existing ? { ...row, id: existing.id } : row;
    const { data, error } = await supabaseAdmin
      .from('doc_templates')
      .upsert(upsertPayload, { onConflict: existing ? 'id' : 'org_id,kind,register' })
      .select('*')
      .single();
    if (error) throw error;
    const t = templateToWire(data as Record<string, unknown>);

    // Immutable version snapshot on every save.
    const snap = {
      org_id: orgId,
      template_id: t.id,
      version: t.version,
      body: t.body,
      orientation: t.orientation,
      updated_by: viewer.name,
      updated_at: now,
    };
    const { data: vRow, error: vErr } = await supabaseAdmin.from('doc_template_versions').insert(snap).select('*').single();
    if (vErr) throw vErr;
    res.status(201).json({ template: t, version: versionWire(vRow as Record<string, unknown>) });
  }),
);

interface DocTemplateBodyLike {
  id?: string;
  kind: DocKind;
  register: DocRegister;
  orientation?: 'portrait' | 'landscape';
  body: string;
  enabled: boolean;
}

function versionWire(r: Record<string, unknown>): DocTemplateVersion {
  return {
    id: String(r['id']),
    templateId: String(r['template_id']),
    version: Number(r['version']),
    body: String(r['body']),
    orientation: (r['orientation'] as 'portrait' | 'landscape') ?? 'portrait',
    updatedBy: String(r['updated_by'] ?? ''),
    updatedAt: String(r['updated_at']),
  };
}

const SAMPLE_DOC_VARS: Record<string, string> = {
  orgName: 'সমবায় সমিতি',
  branchName: 'ধানমন্ডি শাখা',
  memberName: 'রহিমা বেগম',
  memberCode: 'M-0001',
  fatherName: 'মোঃ আব্দুল জলিল',
  spouseName: 'মোঃ রফিকুল ইসলাম',
  address: 'গাজীপুর, ঢাকা',
  nationalId: '১৯৯০১২৩৪৫৬৭৮৯',
  mobile: '01711000001',
  samityName: 'গাজীপুর সমিতি',
  loanCode: 'LN-2026-0001',
  loanAmount: '25000',
  installment: '2500',
  installmentCount: '১০',
  termMonths: '১০',
  interestRate: '১২',
  purpose: 'গরুর পালন',
  guarantorName: 'করিম মিয়া',
  guarantorAddress: 'গাজীপুর, ঢাকা',
  receiptNo: 'RCP-2026-0001',
  paidAmount: '১২০০',
  paidFor: 'সঞ্চয় জমা',
  balance: '৫০০',
  passbookNo: 'PB-0001',
  savingsBalance: '৫০০০',
  meetingDate: '২০২৬-১০-০৫',
  meetingVenue: 'গাজীপুর সমিতি অফিস',
  agenda: '১. কিস্তি আদায় ২. নতুন সদস্য',
  decisions: 'কিস্তি প্রতি সপ্তাহে আদায় করা হবে',
  attendeeCount: '১৮',
  noticeSubject: 'মাসিক সভা',
  noticeDate: '২০২৬-১০-০১',
  effectiveDate: '২০২৬-১০-০১',
  staffName: 'নাসরিন সুলতানা',
  staffDesignation: 'অ্যাকাউন্ট অফিসার',
  oldBranch: 'ধানমন্ডি শাখা',
  newBranch: 'মিরপুর শাখা',
  referenceNo: 'REF-2026-0001',
};

function autoVars(orgNameBn: string, now = new Date()): Record<string, string> {
  const iso = now.toISOString().slice(0, 10);
  return { orgName: orgNameBn, issuedDateEn: iso, issuedDateBn: banglaCalendarDate(iso).text };
}

function withAmountWords(vars: Record<string, string>): Record<string, string> {
  const out = { ...vars };
  if (out['loanAmount'] && !out['loanAmountWords']) out['loanAmountWords'] = numberToWordsBn(out['loanAmount']!);
  if (out['paidAmount'] && !out['paidAmountWords']) out['paidAmountWords'] = numberToWordsBn(out['paidAmount']!);
  return out;
}

async function loadTemplate(orgId: string, id: string): Promise<DocTemplate> {
  const { data } = await supabaseAdmin.from('doc_templates').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (!data) throw NotFound(`ডক টেমপ্লেট নেই / Doc template not found: ${id}`);
  return templateToWire(data as Record<string, unknown>);
}

documentsLiveRouter.post(
  '/templates/:id/preview',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const t = await loadTemplate(orgId, req.params['id'] as string);
    const body = (req.body ?? {}) as { vars?: Record<string, string> };
    const vars = { ...SAMPLE_DOC_VARS, ...autoVars(await orgNameBnOf(orgId)), ...(body.vars ?? {}) };
    const r = renderDocTemplate(t.body, vars);
    const html = printDocHtml({ orgName: SAMPLE_DOC_VARS['orgName']!, titleBn: DOC_KIND_LABELS_BN[t.kind], bodyHtml: r.text, orientation: t.orientation });
    res.json({ html, missing: r.missing });
  }),
);

documentsLiveRouter.get(
  '/templates/:id/versions',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    await loadTemplate(orgOf(req), req.params['id'] as string);
    const { data, error } = await supabaseAdmin
      .from('doc_template_versions')
      .select('*')
      .eq('template_id', req.params['id'] as string)
      .order('version', { ascending: false });
    if (error) throw error;
    res.json({ items: (data ?? []).map((v) => versionWire(v as Record<string, unknown>)) });
  }),
);

documentsLiveRouter.post(
  '/templates/:id/restore/:version',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const v = Number(req.params['version']);
    if (!Number.isFinite(v)) throw BadRequest('ভার্সন নম্বর ভুল / Bad version');
    await loadTemplate(orgId, req.params['id'] as string);
    const { data: snap } = await supabaseAdmin.from('doc_template_versions').select('*').eq('template_id', req.params['id'] as string).eq('version', v).maybeSingle();
    if (!snap) throw NotFound(`ভার্সন নেই / Version not found: v${v}`);
    // Restore = save the old body as a NEW version.
    const viewer = viewerOf(req);
    const now = new Date().toISOString();
    const { data: current } = await supabaseAdmin.from('doc_templates').select('version').eq('id', req.params['id'] as string).maybeSingle();
    const nextVersion = Number(current?.version ?? 0) + 1;
    const { data: tRow, error: tErr } = await supabaseAdmin
      .from('doc_templates')
      .update({ body: snap.body, orientation: snap.orientation, version: nextVersion, updated_by: viewer.name, updated_at: now })
      .eq('id', req.params['id'] as string)
      .eq('org_id', orgId)
      .select('*')
      .single();
    if (tErr) throw tErr;
    const { data: vRow, error: vErr } = await supabaseAdmin
      .from('doc_template_versions')
      .insert({ org_id: orgId, template_id: tRow.id, version: nextVersion, body: snap.body, orientation: snap.orientation, updated_by: viewer.name, updated_at: now })
      .select('*')
      .single();
    if (vErr) throw vErr;
    res.json({ template: templateToWire(tRow as Record<string, unknown>), version: versionWire(vRow as Record<string, unknown>) });
  }),
);

/* ── Documents (req 4): generate, list, download, revoke ──────────────────── */

async function nextDocNo(orgId: string, kind: DocKind): Promise<string> {
  const prefix = `${DOC_NO_PREFIX[kind]}-${new Date().getUTCFullYear()}-`;
  const { count } = await supabaseAdmin.from('documents').select('id', { count: 'exact', head: true }).eq('org_id', orgId).like('doc_no', `${prefix}%`);
  return `${prefix}${String((count ?? 0) + 1).padStart(4, '0')}`;
}

const generateSchema = z.object({
  kind: z.enum(DOC_KINDS),
  register: z.enum(DOC_REGISTERS).default('cholito'),
  referenceId: z.string().trim().uuid().optional(),
  vars: z.record(z.string(), z.string()).default({}),
});

documentsLiveRouter.post(
  '/generate',
  requirePermission('member:write'),
  validate(generateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const body = req.body as { kind: DocKind; register: DocRegister; referenceId?: string; vars: Record<string, string> };
    const orgNameBn = await orgNameBnOf(orgId);
    const { data: tRow } = await supabaseAdmin
      .from('doc_templates')
      .select('*')
      .eq('org_id', orgId)
      .eq('kind', body.kind)
      .eq('register', body.register)
      .eq('enabled', true)
      .maybeSingle();
    if (!tRow) throw NotFound(`সক্রিয় টেমপ্লেট নেই / No enabled template for ${body.kind}/${body.register}`);
    const t = templateToWire(tRow as Record<string, unknown>);

    const docNo = await nextDocNo(orgId, body.kind);
    const vars = withAmountWords({ ...autoVars(orgNameBn), ...body.vars });
    if (!vars['receiptNo']) vars['receiptNo'] = docNo;
    const r = renderDocTemplate(t.body, vars);
    if (r.missing.length > 0) throw BadRequest(`ভেরিয়েবল অনুপস্থিত / Missing variables: ${r.missing.join(', ')}`);

    const verifyCode = newVerifyCode();
    const verifyUrl = verifyCodePayload(publicBaseUrl(), verifyCode);
    const qr = await qrDataUrl(verifyUrl);
    const html = printDocHtml({
      orgName: orgNameBn,
      titleBn: DOC_KIND_LABELS_BN[t.kind],
      bodyHtml: r.text,
      orientation: t.orientation,
      verifyCode,
      verifyUrl,
      qrDataUrl: qr,
    });
    const titleSnippet = r.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    const { data, error } = await supabaseAdmin
      .from('documents')
      .insert({
        org_id: orgId,
        kind: body.kind,
        register: body.register,
        doc_no: docNo,
        verify_code: verifyCode,
        title_snippet: titleSnippet,
        template_id: t.id,
        template_version: t.version,
        reference_id: body.referenceId ?? null,
        payload: vars,
        issued_by: req.auth?.email ?? 'unknown',
        status: 'active',
        html,
      })
      .select('id, kind, register, doc_no, verify_code, title_snippet, template_id, template_version, reference_id, issued_by, issued_at, status')
      .single();
    if (error) throw error;
    const d = data as Record<string, unknown>;
    const wire: DocumentRecord & { qrDataUrl: string } = {
      id: String(d['id']),
      orgId,
      kind: d['kind'] as DocKind,
      register: d['register'] as DocRegister,
      docNo: String(d['doc_no']),
      verifyCode: String(d['verify_code']),
      titleSnippet: String(d['title_snippet'] ?? ''),
      templateId: (d['template_id'] as string | null) ?? null,
      templateVersion: (d['template_version'] as number | null) ?? null,
      referenceId: (d['reference_id'] as string | null) ?? null,
      issuedBy: String(d['issued_by'] ?? ''),
      issuedAt: String(d['issued_at']),
      status: 'active',
      html: '',
      qrDataUrl: qr,
    };
    res.status(201).json(wire);
  }),
);

documentsLiveRouter.get(
  '/',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin
      .from('documents')
      .select('id, org_id, kind, register, doc_no, verify_code, title_snippet, template_id, template_version, reference_id, issued_by, issued_at, status')
      .eq('org_id', orgOf(req))
      .order('issued_at', { ascending: false })
      .limit(200);
    const kind = req.query['kind'] as string | undefined;
    if (kind && (DOC_KINDS as readonly string[]).includes(kind)) query = query.eq('kind', kind);
    if (req.query['q']) {
      const like = `%${req.query['q']}%`;
      query = query.or(`doc_no.ilike.${like},title_snippet.ilike.${like},verify_code.ilike.${like}`);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((raw) => {
        const d = raw as Record<string, unknown>;
        return {
          id: String(d['id']),
          orgId: String(d['org_id']),
          kind: d['kind'] as DocKind,
          register: d['register'] as DocRegister,
          docNo: String(d['doc_no']),
          verifyCode: String(d['verify_code']),
          titleSnippet: String(d['title_snippet'] ?? ''),
          templateId: (d['template_id'] as string | null) ?? null,
          templateVersion: (d['template_version'] as number | null) ?? null,
          referenceId: (d['reference_id'] as string | null) ?? null,
          issuedBy: String(d['issued_by'] ?? ''),
          issuedAt: String(d['issued_at']),
          status: d['status'] as 'active' | 'revoked',
        };
      }),
    });
  }),
);

documentsLiveRouter.get(
  '/:id/download',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { data, error } = await supabaseAdmin.from('documents').select('doc_no, html').eq('id', req.params['id'] as string).eq('org_id', orgOf(req)).maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound(`দলিল নেই / Document not found: ${req.params['id']}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${data.doc_no}.html"; filename*=UTF-8''${encodeURIComponent(`${data.doc_no}.html`)}`);
    res.send(data.html);
  }),
);

documentsLiveRouter.post(
  '/:id/revoke',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const viewer = viewerOf(req);
    if (!['super_admin', 'org_admin', 'branch_manager', 'area_manager'].includes(viewer.role)) {
      throw Forbidden('বাতিলের অনুমতি নেই / Only managers may revoke');
    }
    const { data, error } = await supabaseAdmin
      .from('documents')
      .update({ status: 'revoked' })
      .eq('id', req.params['id'] as string)
      .eq('org_id', orgOf(req))
      .select('id, status')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound(`দলিল নেই / Document not found: ${req.params['id']}`);
    res.json({ id: data.id, status: data.status });
  }),
);

/* ── Req 8: bulk jobs ─────────────────────────────────────────────────────── */

function jobWire(r: Record<string, unknown>, items: BulkJobItem[]): BulkJob {
  return {
    id: String(r['id']),
    orgId: String(r['org_id']),
    kind: r['kind'] as BulkJob['kind'],
    scope: r['scope'] as 'samity' | 'branch',
    scopeId: String(r['scope_id']),
    scopeName: String(r['scope_name']),
    params: (r['params'] ?? {}) as BulkJob['params'],
    status: r['status'] as BulkJob['status'],
    total: Number(r['total'] ?? 0),
    processed: Number(r['processed'] ?? 0),
    failed: Number(r['failed'] ?? 0),
    items,
    createdBy: String(r['created_by'] ?? ''),
    createdAt: String(r['created_at']),
    finishedAt: (r['finished_at'] as string | null) ?? null,
  };
}

function itemWire(r: Record<string, unknown>): BulkJobItem {
  return {
    targetId: String(r['target_id']),
    targetName: String(r['target_name']),
    status: r['status'] as BulkJobItem['status'],
    refId: (r['ref_id'] as string | null) ?? null,
    error: (r['error'] as string | null) ?? null,
  };
}

async function resolveTargets(orgId: string, scope: 'samity' | 'branch', scopeId: string): Promise<{ id: string; name: string; memberCode: string | null; phone: string }[]> {
  let query = supabaseAdmin.from('members').select('id, full_name, member_code, phone').eq('org_id', orgId).is('deleted_at', null);
  query = scope === 'samity' ? query.eq('samity_id', scopeId) : query.eq('branch_id', scopeId);
  const { data, error } = await query.limit(500);
  if (error) throw error;
  return (data ?? []).map((m) => ({ id: m.id, name: m.full_name, memberCode: m.member_code, phone: m.phone }));
}

documentsLiveRouter.post(
  '/bulk-jobs',
  requirePermission('branch:manage'),
  validate(bulkJobSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const body = req.body as BulkJobBody;
    const targets = await resolveTargets(orgId, body.scope, body.scopeId);
    if (targets.length === 0) throw BadRequest('নিশ্চিত সমিতি/শাখায় সদস্য নেই / No members found for the given scope');
    const { data: job, error } = await supabaseAdmin
      .from('bulk_jobs')
      .insert({
        org_id: orgId,
        kind: body.kind,
        scope: body.scope,
        scope_id: body.scopeId,
        scope_name: body.scopeName,
        params: body.params,
        status: 'pending',
        total: targets.length,
        created_by: req.auth?.email ?? 'unknown',
      })
      .select('*')
      .single();
    if (error) throw error;
    const { data: items, error: iErr } = await supabaseAdmin
      .from('bulk_job_items')
      .insert(targets.map((t) => ({ org_id: orgId, job_id: job.id, target_id: t.id, target_name: t.name, status: 'pending' })))
      .select('*');
    if (iErr) throw iErr;
    res.status(201).json(jobWire(job as Record<string, unknown>, (items ?? []).map((i) => itemWire(i as Record<string, unknown>))));
  }),
);

documentsLiveRouter.get(
  '/bulk-jobs',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { data, error } = await supabaseAdmin.from('bulk_jobs').select('*').eq('org_id', orgOf(req)).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json({ items: (data ?? []).map((j) => jobWire(j as Record<string, unknown>, [])) });
  }),
);

async function loadJobWithItems(orgId: string, id: string): Promise<{ job: Record<string, unknown>; items: Record<string, unknown>[] }> {
  const { data: job, error } = await supabaseAdmin.from('bulk_jobs').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (error) throw error;
  if (!job) throw NotFound(`জব নেই / Job not found: ${id}`);
  const { data: items } = await supabaseAdmin.from('bulk_job_items').select('*').eq('job_id', id).order('created_at');
  return { job: job as Record<string, unknown>, items: (items ?? []) as Record<string, unknown>[] };
}

documentsLiveRouter.get(
  '/bulk-jobs/:id',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { job, items } = await loadJobWithItems(orgOf(req), req.params['id'] as string);
    res.json(jobWire(job, items.map(itemWire)));
  }),
);

/** Execute one pending item of a job (documents/sms/notifications/status flip). */
async function runBulkItemLive(orgId: string, job: Record<string, unknown>, item: Record<string, unknown>): Promise<{ refId: string | null; error: string | null }> {
  const p = (job['params'] ?? {}) as Record<string, unknown>;
  const targetId = String(item['target_id']);
  if (job['kind'] === 'documents_batch') {
    const { data: doc, error } = await supabaseAdmin
      .from('documents')
      .insert({
        org_id: orgId,
        kind: (p['docKind'] as DocKind) ?? 'receipt',
        register: (p['register'] as DocRegister) ?? 'cholito',
        doc_no: `BULK-${Date.now()}-${targetId.slice(0, 8)}`,
        verify_code: newVerifyCode(),
        title_snippet: `${String(item['target_name'])}: bulk`,
        reference_id: targetId,
        payload: p,
        issued_by: String(job['created_by'] ?? 'bulk'),
        status: 'active',
        html: '<!DOCTYPE html><html lang="bn"><meta charset="utf-8"/><body><p>বাল্ক দলিল — স্টাফ প্রিভিউ প্রয়োজন</p></body></html>',
      })
      .select('id')
      .single();
    if (error) return { refId: null, error: error.message.slice(0, 200) };
    return { refId: doc.id, error: null };
  }
  if (job['kind'] === 'status_flip') {
    const nextStatus = String(p['status'] ?? 'inactive');
    const { error } = await supabaseAdmin.from('members').update({ status: nextStatus, updated_at: new Date().toISOString() }).eq('id', targetId).eq('org_id', orgId);
    if (error) return { refId: null, error: error.message.slice(0, 200) };
    return { refId: null, error: null };
  }
  // sms_batch / notification_batch: the communication module's own send
  // pipeline handles them in production (its bulk alias under /comms/bulk).
  return { refId: null, error: 'handled by the communication bulk pipeline' };
}

documentsLiveRouter.post(
  '/bulk-jobs/:id/tick',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const { job, items } = await loadJobWithItems(orgId, req.params['id'] as string);
    if (job['status'] === 'done' || job['status'] === 'failed') {
      res.json(jobWire(job, items.map(itemWire)));
      return;
    }
    await supabaseAdmin.from('bulk_jobs').update({ status: 'running' }).eq('id', String(job['id'])).eq('org_id', orgId);
    let processed = Number(job['processed'] ?? 0);
    let failed = Number(job['failed'] ?? 0);
    for (const item of items) {
      if (item['status'] !== 'pending') continue;
      let result: { refId: string | null; error: string | null };
      try {
        result = await runBulkItemLive(orgId, job, item);
      } catch (e) {
        result = { refId: null, error: (e as Error).message.slice(0, 200) };
      }
      await supabaseAdmin
        .from('bulk_job_items')
        .update({ status: result.error ? 'failed' : 'done', ref_id: result.refId, error: result.error })
        .eq('id', String(item['id']))
        .eq('org_id', orgId);
      processed += 1;
      if (result.error) failed += 1;
    }
    const status = failed === Number(job['total'] ?? items.length) ? 'failed' : 'done';
    const now = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin
      .from('bulk_jobs')
      .update({ status, processed, failed, finished_at: now })
      .eq('id', String(job['id']))
      .eq('org_id', orgId)
      .select('*')
      .single();
    if (error) throw error;
    const { data: freshItems } = await supabaseAdmin.from('bulk_job_items').select('*').eq('job_id', String(job['id'])).order('created_at');
    res.json(jobWire(updated as Record<string, unknown>, (freshItems ?? []).map((i) => itemWire(i as Record<string, unknown>))));
  }),
);

/* ── Alias under /comms/bulk for the communication module UI ─────────────── */

export const commBulkLiveRouter = Router();
commBulkLiveRouter.use(requireAuth);

commBulkLiveRouter.post(
  '/',
  requirePermission('branch:manage'),
  validate(bulkJobSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const body = req.body as BulkJobBody;
    const targets = await resolveTargets(orgId, body.scope, body.scopeId);
    if (targets.length === 0) throw BadRequest('নিশ্চিত সমিতি/শাখায় সদস্য নেই / No members found for the given scope');
    const { data: job, error } = await supabaseAdmin
      .from('bulk_jobs')
      .insert({
        org_id: orgId,
        kind: body.kind,
        scope: body.scope,
        scope_id: body.scopeId,
        scope_name: body.scopeName,
        params: body.params,
        status: 'pending',
        total: targets.length,
        created_by: req.auth?.email ?? 'unknown',
      })
      .select('*')
      .single();
    if (error) throw error;
    const { data: items, error: iErr } = await supabaseAdmin
      .from('bulk_job_items')
      .insert(targets.map((t) => ({ org_id: orgId, job_id: job.id, target_id: t.id, target_name: t.name, status: 'pending' })))
      .select('*');
    if (iErr) throw iErr;
    res.status(201).json(jobWire(job as Record<string, unknown>, (items ?? []).map((i) => itemWire(i as Record<string, unknown>))));
  }),
);

commBulkLiveRouter.get(
  '/',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { data, error } = await supabaseAdmin.from('bulk_jobs').select('*').eq('org_id', orgOf(req)).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json({ items: (data ?? []).map((j) => jobWire(j as Record<string, unknown>, [])) });
  }),
);

commBulkLiveRouter.post(
  '/:id/tick',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    // Same worker as the documents tick.
    const orgId = orgOf(req);
    const { data: existing, error: exErr } = await supabaseAdmin.from('bulk_jobs').select('id').eq('id', req.params['id'] as string).eq('org_id', orgId).maybeSingle();
    if (exErr) throw exErr;
    if (!existing) throw NotFound(`জব নেই / Job not found: ${req.params['id']}`);
    const { job, items } = await loadJobWithItems(orgId, String(existing.id));
    if (job['status'] === 'done' || job['status'] === 'failed') {
      res.json(jobWire(job, items.map(itemWire)));
      return;
    }
    await supabaseAdmin.from('bulk_jobs').update({ status: 'running' }).eq('id', String(job['id'])).eq('org_id', orgId);
    let processed = Number(job['processed'] ?? 0);
    let failed = Number(job['failed'] ?? 0);
    for (const item of items) {
      if (item['status'] !== 'pending') continue;
      let result: { refId: string | null; error: string | null };
      try {
        result = await runBulkItemLive(orgId, job, item);
      } catch (e) {
        result = { refId: null, error: (e as Error).message.slice(0, 200) };
      }
      await supabaseAdmin
        .from('bulk_job_items')
        .update({ status: result.error ? 'failed' : 'done', ref_id: result.refId, error: result.error })
        .eq('id', String(item['id']))
        .eq('org_id', orgId);
      processed += 1;
      if (result.error) failed += 1;
    }
    const status = failed === Number(job['total'] ?? items.length) ? 'failed' : 'done';
    const now = new Date().toISOString();
    const { data: updated, error } = await supabaseAdmin
      .from('bulk_jobs')
      .update({ status, processed, failed, finished_at: now })
      .eq('id', String(job['id']))
      .eq('org_id', orgId)
      .select('*')
      .single();
    if (error) throw error;
    const { data: freshItems } = await supabaseAdmin.from('bulk_job_items').select('*').eq('job_id', String(job['id'])).order('created_at');
    res.json(jobWire(updated as Record<string, unknown>, (freshItems ?? []).map((i) => itemWire(i as Record<string, unknown>))));
  }),
);

/* ── Protected-field helpers reused by Security live router ───────────────── */

/** Masked display for a members-row protected field (no log write). */
export async function maskedProtectedFieldLive(orgId: string, memberId: string, field: ProtectedField): Promise<string> {
  const col = field === 'bank_account' ? null : field;
  if (!col) return '';
  const { data } = await supabaseAdmin.from('members').select(col).eq('id', memberId).eq('org_id', orgId).maybeSingle();
  const raw = data ? (data as Record<string, unknown>)[col] : null;
  if (!raw) return '';
  return maskValue(field, String(raw));
}

/** Role-checked reveal: returns null value when nothing stored; throws 403 when the role may not see the field. */
export async function revealProtectedFieldLive(
  orgId: string,
  memberId: string,
  field: ProtectedField,
  viewer: { userId: string; userName: string; role: string; ip?: string | null },
): Promise<string | null> {
  if (!canUnmaskField(viewer.role, field)) {
    throw Forbidden(`এই তথ্য দেখার অনুমতি নেই / Role ${viewer.role} may not reveal ${field}`);
  }
  const col = field === 'bank_account' ? null : field;
  const raw = col
    ? (await supabaseAdmin.from('members').select(col).eq('id', memberId).eq('org_id', orgId).maybeSingle()).data
    : null;
  const value = raw ? (raw as Record<string, unknown>)[col!] : null;
  if (!value) return null;
  await supabaseAdmin.from('unmask_log').insert({
    org_id: orgId,
    entity_table: 'members',
    entity_id: memberId,
    field,
    user_id: viewer.userId,
    user_name: viewer.userName,
    role: viewer.role,
    ip: viewer.ip ?? null,
  });
  return String(value);
}

/** Persist a corrected protected field (live schema keeps NID/phone in the row; RLS + unmask log protect them). */
export async function setProtectedFieldLive(orgId: string, memberId: string, field: ProtectedField, plaintext: string): Promise<void> {
  if (field === 'bank_account') return; // members table has no bank column in this schema
  const { error } = await supabaseAdmin.from('members').update({ [field]: plaintext }).eq('id', memberId).eq('org_id', orgId);
  if (error) throw error;
}
