/**
 * ── Privacy live router (Supabase) ──────────────────────────────────────────
 * Mirrors privacy.routes.ts against the real tables (migration 0056):
 * consent records, retention rules + purge preview over live row counts,
 * the right-to-correction workflow (submit → review → approve → apply writes
 * the member row) and the member data export from live tables.
 */
import { Router } from 'express';
import {
  canTransitionCorrection,
  consentCreateSchema,
  correctionCreateSchema,
  correctionDecisionSchema,
  maskValue,
  retentionRuleSchema,
  type CorrectionStatus,
  type MemberDataExport,
  type ProtectedField,
  type RetentionRule,
} from '@samity/shared';
import { Conflict, Forbidden, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { orgOf } from '../lib/tenant.js';
import { setProtectedFieldLive } from './documents-live.routes.js';

export const privacyLiveRouter = Router();
privacyLiveRouter.use(requireAuth);

const viewerOf = (req: RequestWithAuth) => ({ userId: req.auth?.userId ?? 'unknown', userName: req.auth?.email ?? 'unknown', role: req.auth?.role ?? 'member' });

/* ── Consents ─────────────────────────────────────────────────────────────── */

privacyLiveRouter.get(
  '/consents',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin.from('member_consents').select('*').eq('org_id', orgOf(req)).order('granted_at', { ascending: false }).limit(500);
    const memberId = req.query['memberId'] as string | undefined;
    if (memberId) query = query.eq('member_id', memberId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((c) => ({
        id: c.id,
        orgId: c.org_id,
        memberId: c.member_id,
        kind: c.kind,
        granted: c.granted,
        textVersion: c.text_version,
        method: c.method,
        witnessName: c.witness_name ?? null,
        grantedAt: c.granted_at,
        revokedAt: c.revoked_at ?? null,
        recordedBy: c.recorded_by,
      })),
    });
  }),
);

privacyLiveRouter.post(
  '/consents',
  requirePermission('member:write'),
  validate(consentCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { memberId: string; kind: string; granted: boolean; textVersion?: string; method?: 'written' | 'verbal' | 'digital'; witnessName?: string | null };
    const { data, error } = await supabaseAdmin
      .from('member_consents')
      .insert({
        org_id: orgOf(req),
        member_id: body.memberId,
        kind: body.kind,
        granted: body.granted,
        text_version: body.textVersion ?? 'v1',
        method: body.method ?? 'written',
        witness_name: body.witnessName ?? null,
        revoked_at: body.granted ? null : new Date().toISOString(),
        recorded_by: req.auth?.userId ?? 'unknown',
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({
      id: data.id,
      orgId: data.org_id,
      memberId: data.member_id,
      kind: data.kind,
      granted: data.granted,
      textVersion: data.text_version,
      method: data.method,
      witnessName: data.witness_name ?? null,
      grantedAt: data.granted_at,
      revokedAt: data.revoked_at ?? null,
      recordedBy: data.recorded_by,
    });
  }),
);

/* ── Retention rules + purge preview (live row counts) ────────────────────── */

const DEFAULT_RETENTION_RULES: RetentionRule[] = [
  { class: 'member_core', retainMonths: 60, legalHold: false },
  { class: 'savings_transactions', retainMonths: 120, legalHold: false },
  { class: 'loan_records', retainMonths: 120, legalHold: false },
  { class: 'audit_logs', retainMonths: 84, legalHold: false },
  { class: 'sms_deliveries', retainMonths: 24, legalHold: false },
  { class: 'documents', retainMonths: 120, legalHold: false },
];

const RETENTION_SOURCE_TABLE: Record<RetentionRule['class'], string> = {
  member_core: 'members',
  savings_transactions: 'savings_transactions',
  loan_records: 'loan_applications',
  audit_logs: 'audit_records',
  sms_deliveries: 'message_deliveries',
  documents: 'documents',
};

privacyLiveRouter.get(
  '/retention-rules',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const { data, error } = await supabaseAdmin.from('retention_rules').select('*').eq('org_id', orgId).order('class');
    if (error) throw error;
    const rules: RetentionRule[] = (data ?? []).length > 0
      ? (data ?? []).map((r) => ({ class: r.class, retainMonths: r.retain_months, legalHold: r.legal_hold }))
      : DEFAULT_RETENTION_RULES;
    const preview: { class: RetentionRule['class']; eligibleCount: number | null }[] = [];
    for (const rule of rules) {
      if (rule.legalHold) {
        preview.push({ class: rule.class, eligibleCount: 0 });
        continue;
      }
      const cutoff = new Date(Date.now() - rule.retainMonths * 30 * 86_400_000).toISOString();
      const table = RETENTION_SOURCE_TABLE[rule.class];
      const timeCol: Record<string, string> = { members: 'created_at', savings_transactions: 'created_at', loan_applications: 'created_at', audit_records: 'at', message_deliveries: 'created_at', documents: 'issued_at' };
      const { count, error: cErr } = await supabaseAdmin
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .lt(timeCol[table] ?? 'created_at', cutoff);
      preview.push({ class: rule.class, eligibleCount: cErr ? null : (count ?? 0) });
    }
    res.json({ items: rules, preview });
  }),
);

privacyLiveRouter.put(
  '/retention-rules',
  requirePermission('org:manage'),
  validate(retentionRuleSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const viewer = viewerOf(req);
    if (!['super_admin', 'org_admin'].includes(viewer.role)) throw Forbidden('শুধু হেড অফিস / Head Office only');
    const rule = req.body as RetentionRule;
    const { data, error } = await supabaseAdmin
      .from('retention_rules')
      .upsert({ org_id: orgOf(req), class: rule.class, retain_months: rule.retainMonths, legal_hold: rule.legalHold, updated_by: viewer.userName, updated_at: new Date().toISOString() }, { onConflict: 'org_id,class' })
      .select('*')
      .single();
    if (error) throw error;
    res.json({ class: data.class, retainMonths: data.retain_months, legalHold: data.legal_hold });
  }),
);

/* ── Right-to-correction workflow ─────────────────────────────────────────── */

privacyLiveRouter.get(
  '/corrections',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin.from('member_corrections').select('*').eq('org_id', orgOf(req)).order('created_at', { ascending: false }).limit(200);
    const status = req.query['status'] as string | undefined;
    if (status) query = query.eq('status', status);
    const memberId = req.query['memberId'] as string | undefined;
    if (memberId) query = query.eq('member_id', memberId);
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((c) => ({
        id: c.id,
        orgId: c.org_id,
        memberId: c.member_id,
        memberName: c.member_name,
        field: c.field,
        currentValue: c.current_value,
        requestedValue: c.requested_value,
        reason: c.reason,
        status: c.status as CorrectionStatus,
        decidedBy: c.decided_by ?? null,
        decidedAt: c.decided_at ?? null,
        decisionNote: c.decision_note ?? '',
        appliedAt: c.applied_at ?? null,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    });
  }),
);

privacyLiveRouter.post(
  '/corrections',
  requirePermission('member:write'),
  validate(correctionCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const body = req.body as { memberId: string; field: string; requestedValue: string; reason: string };
    const { data: m } = await supabaseAdmin.from('members').select('full_name, national_id, phone, address').eq('id', body.memberId).eq('org_id', orgId).maybeSingle();
    if (!m) throw NotFound(`সদস্য পাওয়া যায়নি / Member not found: ${body.memberId}`);
    const field = body.field as ProtectedField | string;
    const currentRaw = field === 'national_id' || field === 'phone' ? (m as Record<string, unknown>)[field] : (m as Record<string, unknown>)['address'];
    const currentValue = currentRaw ? maskValue(field as ProtectedField, String(currentRaw)) : '';
    const { data, error } = await supabaseAdmin
      .from('member_corrections')
      .insert({
        org_id: orgId,
        member_id: body.memberId,
        member_name: m.full_name,
        field: body.field,
        current_value: currentValue,
        requested_value: body.requestedValue,
        reason: body.reason,
        status: 'submitted',
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, status: data.status });
  }),
);

privacyLiveRouter.post(
  '/corrections/:id/decide',
  requirePermission('member:approve'),
  validate(correctionDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const viewer = viewerOf(req);
    if (!['super_admin', 'org_admin', 'branch_manager'].includes(viewer.role)) {
      throw Forbidden('শুধু ম্যানেজাররা সিদ্ধান্ত নেন / Only managers decide corrections');
    }
    const body = req.body as { decision: 'approve' | 'reject' | 'review'; note: string };
    const to: CorrectionStatus = body.decision === 'approve' ? 'approved' : body.decision === 'review' ? 'in_review' : 'rejected';
    const { data, error } = await supabaseAdmin
      .from('member_corrections')
      .select('id, status')
      .eq('id', req.params['id'] as string)
      .eq('org_id', orgOf(req))
      .maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound(`সংশোধনের আবেদন নেই / Correction not found: ${req.params['id']}`);
    if (!canTransitionCorrection(data.status as CorrectionStatus, to)) {
      throw Conflict(`${data.status} থেকে ${to}-এ যাওয়া যাবে না / Invalid transition ${data.status} → ${to}`);
    }
    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('member_corrections')
      .update({ status: to, decided_by: viewer.userId, decided_at: now, decision_note: body.note ?? '', updated_at: now })
      .eq('id', data.id)
      .eq('org_id', orgOf(req))
      .select('id, status, decided_at')
      .single();
    if (updErr) throw updErr;
    res.json({ id: updated.id, status: updated.status, decidedAt: updated.decided_at });
  }),
);

privacyLiveRouter.post(
  '/corrections/:id/apply',
  requirePermission('member:approve'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const { data, error } = await supabaseAdmin.from('member_corrections').select('*').eq('id', req.params['id'] as string).eq('org_id', orgId).maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound(`সংশোধনের আবেদন নেই / Correction not found: ${req.params['id']}`);
    if (!canTransitionCorrection(data.status as CorrectionStatus, 'applied')) {
      throw Conflict(`অনুমোদনের পরেই প্রয়োগ হয় / Only approved corrections can be applied (${data.status})`);
    }
    // Write the corrected value into the member row (protected fields go
    // through the same path the security module uses for its apply step).
    const field = data.field as ProtectedField | string;
    const isProtected = (['national_id', 'bank_account', 'phone'] as readonly string[]).includes(field);
    if (isProtected) {
      await setProtectedFieldLive(orgId, data.member_id, field as ProtectedField, data.requested_value);
    } else {
      const { error: mErr } = await supabaseAdmin.from('members').update({ [field]: data.requested_value, updated_at: new Date().toISOString() }).eq('id', data.member_id).eq('org_id', orgId);
      if (mErr) throw mErr;
    }
    const now = new Date().toISOString();
    const { data: updated, error: updErr } = await supabaseAdmin
      .from('member_corrections')
      .update({ status: 'applied', applied_at: now, updated_at: now })
      .eq('id', data.id)
      .eq('org_id', orgOf(req))
      .select('id, status, applied_at')
      .single();
    if (updErr) throw updErr;
    res.json({ id: updated.id, status: updated.status, appliedAt: updated.applied_at });
  }),
);

/* ── Member data export (right-to-export) from live tables ───────────────── */

privacyLiveRouter.get(
  '/export/:memberId',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const memberId = req.params['memberId'] as string;
    const { data: m, error: mErr } = await supabaseAdmin
      .from('members')
      .select('id, member_code, full_name, national_id, phone, address, status, join_date')
      .eq('id', memberId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!m) throw NotFound(`সদস্য পাওয়া যায়নি / Member not found: ${memberId}`);

    const [consentsRes, savingsRes, loansRes, correctionsRes, auditRes] = await Promise.all([
      supabaseAdmin.from('member_consents').select('kind, granted, granted_at, text_version').eq('org_id', orgId).eq('member_id', memberId).order('granted_at', { ascending: false }),
      supabaseAdmin.from('savings_accounts').select('account_number, product, balance').eq('org_id', orgId).eq('member_id', memberId).is('deleted_at', null),
      supabaseAdmin
        .from('loan_applications')
        .select('application_number, purpose, requested_amount, status, loan_products(name)')
        .eq('org_id', orgId)
        .eq('member_id', memberId)
        .limit(20),
      supabaseAdmin.from('member_corrections').select('field, requested_value, status, created_at').eq('org_id', orgId).eq('member_id', memberId).order('created_at', { ascending: false }),
      supabaseAdmin.from('audit_records').select('at, action, table_name, user_id').eq('org_id', orgId).eq('record_id', memberId).order('at', { ascending: false }).limit(100),
    ]);
    for (const r of [consentsRes, savingsRes, loansRes, correctionsRes, auditRes]) {
      if (r.error) throw r.error;
    }

    const exportPayload: MemberDataExport = {
      exportedAt: new Date().toISOString(),
      orgId,
      member: {
        id: m.id,
        memberCode: m.member_code ?? '',
        name: m.full_name,
        nationalIdMasked: m.national_id ? maskValue('national_id', String(m.national_id)) : '',
        phoneMasked: m.phone ? maskValue('phone', String(m.phone)) : '',
        address: m.address ?? '',
        status: m.status,
        joinedAt: m.join_date ?? null,
      },
      consents: (consentsRes.data ?? []).map((c) => ({ kind: c.kind, granted: c.granted, grantedAt: c.granted_at, textVersion: c.text_version })),
      savings: (savingsRes.data ?? []).map((s) => ({ accountNo: s.account_number ?? '—', product: s.product, balance: String(s.balance ?? '0') })),
      loans: (loansRes.data ?? []).map((l) => ({
        code: l.application_number,
        product: (l.loan_products as { name?: string } | null)?.name ?? l.purpose,
        principal: String(l.requested_amount ?? '0'),
        status: l.status,
      })),
      corrections: (correctionsRes.data ?? []).map((c) => ({ field: c.field, requestedValue: c.requested_value, status: c.status as CorrectionStatus, createdAt: c.created_at })),
      auditTrail: (auditRes.data ?? []).map((a) => ({ at: a.at, action: a.action, tableName: a.table_name, userId: a.user_id ?? null })),
    };
    res.json(exportPayload);
  }),
);
