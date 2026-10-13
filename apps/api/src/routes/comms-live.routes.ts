/**
 * ── Communication live router (Supabase) ────────────────────────────────────
 * Mirrors comm.routes.ts against the real tables (migration 0052):
 * notification center, bilingual templates with preview, the guarded send
 * pipeline (opt-out → window → cost caps → provider dispatch) persisting to
 * message_deliveries, retry pass, opt-outs, rules and spend counters.
 * Providers are reused from the demo store's env-driven factory (free SMTP +
 * generic BD SMS gateway or the built-in mock).
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  DEFAULT_COMM_RULES,
  DELIVERY_STATUS_LABELS_BN,
  SEND_CHANNELS,
  TEMPLATE_KINDS,
  TEMPLATE_KIND_AUDIENCE,
  assertWithinCaps,
  commRulesSchema,
  inSendWindow,
  isOptedOut,
  defaultTemplates,
  messageTemplateSchema,
  nextRetryAt,
  renderTemplate,
  smsParts,
  templateVariablesUsed,
  type CommRules,
  type DeliveryRecord,
  type DeliveryStatus,
  type MessageTemplate,
  type MessageTemplateBody,
  type NotificationRecord,
  type SendChannel,
  type TemplateKind,
  type TemplateVariable,
} from '@samity/shared';
import { BadRequest, Forbidden, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { orgOf } from '../lib/tenant.js';
import { sendMail, smtpFromEnv, smsProvider } from '../lib/comm-store.js';

export const commLiveRouter = Router();
commLiveRouter.use(requireAuth);

const viewerOf = (req: RequestWithAuth) => ({ userId: req.auth?.userId ?? 'unknown', name: req.auth?.email ?? 'unknown', role: req.auth?.role ?? 'member' });

/* ── Rules & spend ────────────────────────────────────────────────────────── */

async function loadRules(orgId: string): Promise<CommRules> {
  const { data } = await supabaseAdmin.from('comm_rules').select('*').eq('org_id', orgId).maybeSingle();
  if (!data) return { ...DEFAULT_COMM_RULES };
  return {
    sendWindowStart: data.send_window_start,
    sendWindowEnd: data.send_window_end,
    maxRetries: data.max_retries,
    retryBackoffMinutes: data.retry_backoff_minutes,
    dailyCostCap: Number(data.daily_cost_cap),
    monthlyCostCap: Number(data.monthly_cost_cap),
    costPerSmsPart: Number(data.cost_per_sms_part),
  };
}

async function spendFor(orgId: string, now = new Date()): Promise<{ day: string; dailyCost: number; month: string; monthlyCost: number }> {
  const day = now.toISOString().slice(0, 10);
  const { data } = await supabaseAdmin.from('comm_spend').select('daily_cost, monthly_cost').eq('org_id', orgId).eq('day', day).maybeSingle();
  return { day, dailyCost: Number(data?.daily_cost ?? 0), month: day.slice(0, 7), monthlyCost: Number(data?.monthly_cost ?? 0) };
}

async function bumpSpend(orgId: string, cost: number, now = new Date()): Promise<void> {
  if (cost <= 0) return;
  const { day, dailyCost, monthlyCost } = await spendFor(orgId, now);
  const { error } = await supabaseAdmin
    .from('comm_spend')
    .upsert({ org_id: orgId, day, month: day.slice(0, 7), daily_cost: (dailyCost + cost).toFixed(2), monthly_cost: (monthlyCost + cost).toFixed(2) }, { onConflict: 'org_id,day' });
  if (error) throw error;
}

commLiveRouter.get(
  '/rules',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const rules = await loadRules(orgOf(req));
    const spend = await spendFor(orgOf(req));
    res.json({ rules, spend: { ...spend, rules } });
  }),
);

commLiveRouter.put(
  '/rules',
  requirePermission('org:manage'),
  validate(commRulesSchema.partial()),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const patch = req.body as Partial<CommRules>;
    const current = await loadRules(orgId);
    const merged: CommRules = { ...current, ...patch };
    const { error } = await supabaseAdmin
      .from('comm_rules')
      .upsert(
        {
          org_id: orgId,
          send_window_start: merged.sendWindowStart,
          send_window_end: merged.sendWindowEnd,
          max_retries: merged.maxRetries,
          retry_backoff_minutes: merged.retryBackoffMinutes,
          daily_cost_cap: merged.dailyCostCap,
          monthly_cost_cap: merged.monthlyCostCap,
          cost_per_sms_part: merged.costPerSmsPart,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id' },
      );
    if (error) throw error;
    res.json({ rules: merged });
  }),
);

/* ── Templates ────────────────────────────────────────────────────────────── */

function templateToWire(r: Record<string, unknown>): MessageTemplate {
  return {
    id: String(r['id']),
    orgId: String(r['org_id']),
    kind: r['kind'] as TemplateKind,
    name: String(r['name'] ?? ''),
    locale: r['locale'] as 'bn' | 'en',
    channel: r['channel'] as SendChannel,
    subject: String(r['subject'] ?? ''),
    body: String(r['body'] ?? ''),
    enabled: Boolean(r['enabled']),
    updatedAt: String(r['updated_at']),
    updatedBy: String(r['updated_by'] ?? ''),
  };
}

/** Best-effort bootstrap: a fresh project has no bilingual templates, so the
 * send pipeline has nothing to resolve. Seed the shared defaults on first read
 * (uuid PKs are generated server-side; conflicts resolve to the existing row).
 * Swallows every error (RLS on the anon key, missing org) so reads never break. */
async function seedDefaultTemplatesIfEmpty(orgId: string): Promise<void> {
  if (!orgId) return;
  try {
    const { count } = await supabaseAdmin
      .from('message_templates')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);
    if ((count ?? 0) > 0) return;
    const now = new Date().toISOString();
    const rows = defaultTemplates(orgId, 'system', now).map((t) => ({
      org_id: t.orgId,
      kind: t.kind,
      name: t.name,
      locale: t.locale,
      channel: t.channel,
      subject: t.subject,
      body: t.body,
      enabled: t.enabled,
      updated_by: t.updatedBy,
      updated_at: t.updatedAt,
    }));
    await supabaseAdmin
      .from('message_templates')
      .upsert(rows, { onConflict: 'org_id,kind,locale,channel', ignoreDuplicates: true });
  } catch {
    // Seeding is best-effort only — the empty list is still a valid response.
  }
}

commLiveRouter.get(
  '/templates',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    await seedDefaultTemplatesIfEmpty(orgId);
    const { data, error } = await supabaseAdmin.from('message_templates').select('*').eq('org_id', orgId).order('updated_at', { ascending: false });
    if (error) throw error;
    res.json({ items: (data ?? []).map((t) => templateToWire(t as Record<string, unknown>)) });
  }),
);

commLiveRouter.put(
  '/templates',
  requirePermission('branch:manage'),
  validate(messageTemplateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const body = req.body as MessageTemplateBody;
    const { unknown } = templateVariablesUsed(body.body);
    if (unknown.length > 0) throw BadRequest(`অজানা ভেরিয়েবল / Unknown variables: ${unknown.join(', ')}`);
    const { data, error } = await supabaseAdmin
      .from('message_templates')
      .upsert(
        {
          org_id: orgId,
          kind: body.kind,
          name: body.name,
          locale: body.locale,
          channel: body.channel,
          subject: body.subject ?? '',
          body: body.body,
          enabled: body.enabled,
          updated_by: req.auth?.email ?? 'unknown',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,kind,locale,channel' },
      )
      .select('*')
      .single();
    if (error) throw error;
    res.json(templateToWire(data as Record<string, unknown>));
  }),
);

const SAMPLE_VARS: Partial<Record<TemplateVariable, string>> = {
  orgName: 'সমবায় সমিতি',
  memberName: 'রহিমা বেগম',
  samityName: 'গাজীপুর সমিতি',
  branchName: 'ধানমন্ডি শাখা',
  amount: '১২০০',
  dueDate: '২০২৬-১০-১০',
  installmentNo: '৩',
  loanCode: 'LN-2026-0001',
  overdueAmount: '৬০০',
  daysOverdue: '১২',
  meetingDate: '২০২৬-১০-০৫',
  meetingVenue: 'গাজীপুর সমিতি অফিস',
  festivalName: 'ঈদুল ফিতর',
  staffName: 'নাসরিন সুলতানা',
  requesterName: 'করিম মিয়া',
  receiptNo: 'RCP-2026-0001',
  disbursementDate: '২০২৬-০৯-২৫',
};

commLiveRouter.post(
  '/templates/:id/preview',
  requirePermission('member:read'),
  validate(z.object({ overrides: z.record(z.string()).optional() })),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { data } = await supabaseAdmin.from('message_templates').select('*').eq('id', req.params['id'] as string).eq('org_id', orgOf(req)).maybeSingle();
    if (!data) throw NotFound(`টেমপ্লেট পাওয়া যায়নি / Template not found: ${req.params['id']}`);
    const t = templateToWire(data as Record<string, unknown>);
    const vars = { ...SAMPLE_VARS, ...((req.body?.overrides ?? {}) as Partial<Record<TemplateVariable, string>>) };
    const r = renderTemplate(t.body, vars);
    const sr = t.subject ? renderTemplate(t.subject, vars) : { text: '', missing: [] as string[] };
    res.json({ text: r.text, subject: sr.text, missing: [...new Set([...r.missing, ...sr.missing])] });
  }),
);

/* ── Send pipeline ────────────────────────────────────────────────────────── */

export interface CommSendBody {
  kind: TemplateKind | 'custom';
  channel: SendChannel;
  templateId?: string;
  locale?: 'bn' | 'en';
  body?: string;
  subject?: string;
  vars?: Partial<Record<TemplateVariable, string>>;
  recipientName: string;
  recipient: string;
  force?: boolean;
}

async function resolveBody(orgId: string, b: CommSendBody): Promise<{ body: string; subject: string; templateId: string | null; locale: 'bn' | 'en'; error: string | null }> {
  if (b.templateId) {
    const { data } = await supabaseAdmin.from('message_templates').select('*').eq('id', b.templateId).eq('org_id', orgId).maybeSingle();
    if (!data) return { body: '', subject: '', templateId: null, locale: 'bn', error: 'template not found' };
    const t = templateToWire(data as Record<string, unknown>);
    const r = renderTemplate(t.body, b.vars ?? {});
    const sr = t.subject ? renderTemplate(t.subject, b.vars ?? {}) : { text: b.subject ?? '', missing: [] as string[] };
    return { body: r.text, subject: sr.text, templateId: t.id, locale: t.locale, error: r.missing.length ? `missing variables: ${r.missing.join(', ')}` : null };
  }
  if (b.kind === 'custom' && b.body) {
    return { body: b.body, subject: b.subject ?? '', templateId: null, locale: b.locale ?? 'bn', error: null };
  }
  const locale = b.locale ?? 'bn';
  const { data } = await supabaseAdmin
    .from('message_templates')
    .select('*')
    .eq('org_id', orgId)
    .eq('kind', b.kind)
    .eq('locale', locale)
    .eq('channel', b.channel)
    .eq('enabled', true)
    .maybeSingle();
  if (!data) return { body: '', subject: '', templateId: null, locale, error: `no enabled template for ${b.kind}/${locale}/${b.channel}` };
  const t = templateToWire(data as Record<string, unknown>);
  const r = renderTemplate(t.body, b.vars ?? {});
  const sr = t.subject ? renderTemplate(t.subject, b.vars ?? {}) : { text: b.subject ?? '', missing: [] as string[] };
  return { body: r.text, subject: sr.text, templateId: t.id, locale, error: r.missing.length ? `missing variables: ${r.missing.join(', ')}` : null };
}

/** Current HH:MM in the org's timezone (send windows are local business hours). */
function localHhmm(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

async function dispatch(channel: SendChannel, recipient: string, subject: string, body: string): Promise<{ ok: boolean; provider: string; error?: string; cost: number }> {
  const env = process.env as Record<string, string | undefined>;
  if (channel === 'in_app') return { ok: true, provider: 'in-app', cost: 0 };
  if (channel === 'email') {
    const cfg = smtpFromEnv(env);
    if (!cfg) return { ok: false, provider: 'smtp', error: 'smtp-not-configured', cost: 0 };
    try {
      await sendMail(cfg, [recipient], subject, body);
      return { ok: true, provider: 'smtp', cost: 0 };
    } catch (e) {
      return { ok: false, provider: 'smtp', error: (e as Error).message.slice(0, 200), cost: 0 };
    }
  }
  const p = smsProvider(env);
  const out = await p.send({ channel: 'sms', to: recipient, body });
  return { ok: out.ok, provider: p.name, error: out.error, cost: out.cost };
}

function deliveryToWire(r: Record<string, unknown>): DeliveryRecord {
  return {
    id: String(r['id']),
    orgId: String(r['org_id']),
    channel: r['channel'] as SendChannel,
    provider: String(r['provider']),
    recipientName: String(r['recipient_name'] ?? ''),
    recipient: String(r['recipient'] ?? ''),
    kind: r['kind'] as TemplateKind,
    templateId: (r['template_id'] as string | null) ?? null,
    locale: r['locale'] as 'bn' | 'en',
    subject: String(r['subject'] ?? ''),
    body: String(r['body'] ?? ''),
    status: r['status'] as DeliveryStatus,
    attempts: Number(r['attempts'] ?? 0),
    cost: Number(r['cost'] ?? 0),
    error: (r['error'] as string | null) ?? null,
    sentAt: (r['sent_at'] as string | null) ?? null,
    nextRetryAt: (r['next_retry_at'] as string | null) ?? null,
    createdAt: String(r['created_at']),
  };
}

/** The guarded send pipeline, shared by /send and the bulk job worker. */
export async function sendMessageLive(orgId: string, b: CommSendBody, _viewer: { userId: string; name: string; role: string }): Promise<DeliveryRecord> {
  const rules = await loadRules(orgId);
  const now = new Date();
  const nowIso = now.toISOString();
  const resolved = await resolveBody(orgId, b);

  const base = {
    org_id: orgId,
    channel: b.channel,
    provider: 'pending',
    recipient_name: b.recipientName,
    recipient: b.recipient,
    kind: b.kind,
    template_id: resolved.templateId,
    locale: resolved.locale,
    subject: resolved.subject,
    body: resolved.body,
    attempts: 1,
    cost: 0,
    error: resolved.error as string | null,
    sent_at: null as string | null,
    next_retry_at: null as string | null,
  };
  let status: DeliveryStatus = 'queued';

  if (resolved.error && !resolved.body) {
    status = 'failed';
  } else if (b.kind !== 'custom' && TEMPLATE_KIND_AUDIENCE[b.kind as TemplateKind] === 'staff' && b.channel === 'sms') {
    status = 'failed';
    base.error = 'অনুমোদনের অনুরোধ এসএমএস-এ যায় না / approval requests are in-app or email';
  } else {
    // Guard 1: opt-out.
    const { data: pref } = await supabaseAdmin.from('comm_opt_outs').select('email, sms').eq('org_id', orgId).eq('recipient', b.recipient).maybeSingle();
    if (isOptedOut(b.channel, pref ? { email: pref.email, sms: pref.sms } : undefined)) {
      status = 'opted_out';
      base.error = 'অপ্ট-আউট / recipient opted out';
      base.provider = 'guard';
    } else {
      // Guard 2: send window (admins may force).
      const hhmm = localHhmm(now);
      if (!b.force && !inSendWindow(hhmm, rules)) {
        status = 'outside_window';
        base.error = `পাঠানোর সময় নয় (${hhmm}, জানালা ${rules.sendWindowStart}–${rules.sendWindowEnd})`;
        base.provider = 'guard';
      } else {
        // Guard 3: cost caps (daily → monthly).
        const est = b.channel === 'sms' ? Number((smsParts(resolved.body) * rules.costPerSmsPart).toFixed(2)) : 0;
        const spent = await spendFor(orgId, now);
        const cap = assertWithinCaps({ dailyCost: spent.dailyCost, monthlyCost: spent.monthlyCost }, est, rules);
        if (!cap.ok) {
          status = 'cap_blocked';
          base.error = cap.reason === 'daily_cap' ? `দৈনিক খরচের সীমা ৳${rules.dailyCostCap} অতিক্রান্ত` : `মাসিক খরচের সীমা ৳${rules.monthlyCostCap} অতিক্রান্ত`;
          base.provider = 'guard';
          base.cost = est;
        } else {
          const out = await dispatch(b.channel, b.recipient, resolved.subject, resolved.body);
          base.provider = out.provider;
          base.cost = out.cost;
          if (out.ok) {
            status = 'sent';
            base.sent_at = new Date().toISOString();
            base.error = null;
          } else {
            const retry = nextRetryAt(nowIso, 1, rules);
            status = retry ? 'retrying' : 'failed';
            base.error = out.error ?? 'unknown error';
            base.next_retry_at = retry;
          }
        }
      }
    }
  }

  const { data, error } = await supabaseAdmin
    .from('message_deliveries')
    .insert({ ...base, status })
    .select('*')
    .single();
  if (error) throw error;
  if (status === 'sent' && base.cost > 0) await bumpSpend(orgId, base.cost, now);

  // In-app messages also land in the notification center.
  if (b.channel === 'in_app' && status === 'sent') {
    await supabaseAdmin.from('notifications').insert({
      org_id: orgId,
      user_id: b.recipient,
      title: resolved.subject || 'নোটিফিকেশন',
      body: resolved.body,
      kind: b.kind,
      read: false,
    });
  }
  return deliveryToWire(data as Record<string, unknown>);
}

commLiveRouter.post(
  '/send',
  requirePermission('member:write'),
  validate(
    z.object({
      kind: z.enum([...TEMPLATE_KINDS, 'custom']),
      channel: z.enum(SEND_CHANNELS),
      templateId: z.string().uuid().optional(),
      locale: z.enum(['bn', 'en']).optional(),
      body: z.string().trim().max(2000).optional(),
      subject: z.string().trim().max(200).optional(),
      vars: z.record(z.string()).optional(),
      recipientName: z.string().trim().min(1).max(120),
      recipient: z.string().trim().min(3).max(200),
      force: z.boolean().optional(),
    }),
  ),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const viewer = viewerOf(req);
    const body = { ...(req.body as CommSendBody) };
    // Only admins may force past the send window.
    if (body.force && !['super_admin', 'org_admin'].includes(viewer.role)) delete body.force;
    res.status(201).json(await sendMessageLive(orgOf(req), body, viewer));
  }),
);

/* ── Delivery log, retry ──────────────────────────────────────────────────── */

commLiveRouter.get(
  '/deliveries',
  requirePermission('report:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    let query = supabaseAdmin.from('message_deliveries').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(500);
    if (req.query['channel']) query = query.eq('channel', req.query['channel'] as string);
    if (req.query['status']) query = query.eq('status', req.query['status'] as string);
    if (req.query['q']) {
      const like = `%${req.query['q']}%`;
      query = query.or(`recipient_name.ilike.${like},recipient.ilike.${like},body.ilike.${like}`);
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []).map((r) => deliveryToWire(r as Record<string, unknown>));
    const byStatus = (Object.keys(DELIVERY_STATUS_LABELS_BN) as DeliveryStatus[])
      .map((status) => ({ status, labelBn: DELIVERY_STATUS_LABELS_BN[status], count: rows.filter((r) => r.status === status).length }))
      .filter((s) => s.count > 0);
    const spend = await spendFor(orgId);
    res.json({
      items: rows,
      stats: { byStatus, total: rows.length, costToday: spend.dailyCost, costMonth: spend.monthlyCost },
    });
  }),
);

commLiveRouter.post(
  '/deliveries/retry-due',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const rules = await loadRules(orgId);
    const iso = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('message_deliveries')
      .select('*')
      .eq('org_id', orgId)
      .eq('status', 'retrying')
      .lte('next_retry_at', iso)
      .limit(100);
    if (error) throw error;
    let sent = 0;
    let failed = 0;
    for (const raw of data ?? []) {
      const row = raw as Record<string, unknown>;
      const out = await dispatch(row['channel'] as SendChannel, String(row['recipient']), String(row['subject'] ?? ''), String(row['body'] ?? ''));
      const attempts = Number(row['attempts'] ?? 0) + 1;
      let status: DeliveryStatus;
      let retryAt: string | null = null;
      if (out.ok) {
        status = 'sent';
        sent += 1;
      } else {
        const retry = nextRetryAt(new Date().toISOString(), attempts, rules);
        status = retry ? 'retrying' : 'failed';
        retryAt = retry;
        failed += 1;
      }
      const { error: updErr } = await supabaseAdmin
        .from('message_deliveries')
        .update({
          attempts,
          provider: out.provider,
          status,
          cost: Number(out.cost ?? 0),
          error: out.ok ? null : (out.error ?? 'unknown error'),
          sent_at: out.ok ? new Date().toISOString() : null,
          next_retry_at: retryAt,
        })
        .eq('id', String(row['id']))
        // The row came from an org-scoped read above, but the write carries the
        // predicate too: the service-role client bypasses RLS, so the invariant
        // must hold in code.
        .eq('org_id', orgId);
      if (updErr) throw updErr;
      if (out.ok && out.cost > 0) await bumpSpend(orgId, out.cost);
    }
    res.json({ retried: (data ?? []).length, sent, failed });
  }),
);

/* ── Opt-outs ─────────────────────────────────────────────────────────────── */

commLiveRouter.get(
  '/opt-outs',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { data, error } = await supabaseAdmin.from('comm_opt_outs').select('*').eq('org_id', orgOf(req)).order('updated_at', { ascending: false });
    if (error) throw error;
    res.json({
      items: (data ?? []).map((o) => ({
        orgId: o.org_id,
        recipient: o.recipient,
        email: o.email,
        sms: o.sms,
        note: o.note,
        updatedAt: o.updated_at,
      })),
    });
  }),
);

commLiveRouter.put(
  '/opt-outs',
  requirePermission('member:write'),
  validate(z.object({ recipient: z.string().trim().min(3).max(200), email: z.boolean().optional(), sms: z.boolean().optional(), note: z.string().trim().max(200).optional() })),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { recipient, email, sms, note } = req.body as { recipient: string; email?: boolean; sms?: boolean; note?: string };
    const { data: existing } = await supabaseAdmin.from('comm_opt_outs').select('email, sms, note').eq('org_id', orgOf(req)).eq('recipient', recipient).maybeSingle();
    const row = {
      org_id: orgOf(req),
      recipient,
      email: email ?? existing?.email ?? false,
      sms: sms ?? existing?.sms ?? false,
      note: note ?? existing?.note ?? '',
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin.from('comm_opt_outs').upsert(row, { onConflict: 'org_id,recipient' }).select('*').single();
    if (error) throw error;
    res.json({ orgId: data.org_id, recipient: data.recipient, email: data.email, sms: data.sms, note: data.note, updatedAt: data.updated_at });
  }),
);

/* ── Notification center ──────────────────────────────────────────────────── */

function notificationToWire(r: Record<string, unknown>): NotificationRecord {
  return {
    id: String(r['id']),
    orgId: String(r['org_id']),
    userId: String(r['user_id']),
    title: String(r['title']),
    body: String(r['body'] ?? ''),
    kind: ((r['kind'] as NotificationRecord['kind']) ?? 'custom'),
    link: (r['link'] as string | null) ?? undefined,
    read: Boolean(r['read']),
    createdAt: String(r['created_at']),
  };
}

commLiveRouter.get(
  '/notifications',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const viewer = viewerOf(req);
    const onlyUnread = req.query['unread'] === '1';
    let query = supabaseAdmin.from('notifications').select('*').eq('org_id', orgOf(req)).order('created_at', { ascending: false }).limit(200);
    // Admins may read the org feed for moderation; everyone else only their own.
    if (!['super_admin', 'org_admin'].includes(viewer.role)) query = query.eq('user_id', viewer.userId);
    if (onlyUnread) query = query.eq('read', false);
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: (data ?? []).map((n) => notificationToWire(n as Record<string, unknown>)) });
  }),
);

commLiveRouter.post(
  '/notifications/:id/read',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const viewer = viewerOf(req);
    const { data, error } = await supabaseAdmin.from('notifications').select('*').eq('id', req.params['id'] as string).eq('org_id', orgOf(req)).maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound(`নোটিফিকেশন পাওয়া যায়নি / Notification not found: ${req.params['id']}`);
    if (data.user_id !== viewer.userId && !['super_admin', 'org_admin'].includes(viewer.role)) {
      throw Forbidden('শুধু নিজের নোটিফিকেশন / Only your own notifications');
    }
    const { error: updErr } = await supabaseAdmin.from('notifications').update({ read: true }).eq('id', data.id).eq('org_id', orgOf(req));
    if (updErr) throw updErr;
    res.json(notificationToWire({ ...data, read: true }));
  }),
);

const broadcastSchema = z.object({
  title: z.string().trim().min(2).max(120),
  message: z.string().trim().min(2).max(2000),
  userId: z.string().trim().uuid().optional(),
});

commLiveRouter.post(
  '/broadcast',
  requirePermission('branch:manage'),
  validate(broadcastSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const orgId = orgOf(req);
    const body = req.body as { title: string; message: string; userId?: string };
    let targets: string[] = [];
    if (body.userId) {
      targets = [body.userId];
    } else {
      const { data: staff } = await supabaseAdmin.from('users_profile').select('id').eq('org_id', orgId).is('deleted_at', null);
      targets = (staff ?? []).map((s) => s.id);
    }
    if (targets.length === 0) throw BadRequest('প্রাপক নেই / No recipients found');
    const now = new Date().toISOString();
    const rows = targets.map((userId) => ({
      org_id: orgId,
      user_id: userId,
      title: body.title,
      body: body.message,
      kind: 'custom',
      read: false,
      created_at: now,
    }));
    const { data, error } = await supabaseAdmin.from('notifications').insert(rows).select('*');
    if (error) throw error;
    res.status(201).json({ items: (data ?? []).map((n) => notificationToWire(n as Record<string, unknown>)) });
  }),
);
