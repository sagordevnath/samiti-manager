/**
 * ── Communication demo store (reqs 1–3) ──────────────────────────────────────
 * In-memory implementation of the notification center, bilingual templates,
 * the send pipeline (window → opt-out → caps → provider dispatch) with the
 * delivery log, retries and spend counters. Mirrors migrations 0052/0053.
 *
 * Providers: email goes over the shared free-SMTP sender; SMS uses the mock
 * provider by default and switches to the generic HTTP gateway when
 * SMS_GATEWAY_URL is configured (any local BD bulk-SMS contract fits the
 * HttpSmsGatewayProvider body template). In-app writes go straight to the
 * recipient's notification feed (Supabase Realtime pushes it in production).
 */
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import {
  DEFAULT_COMM_RULES,
  DELIVERY_STATUS_LABELS_BN,
  HttpSmsGatewayProvider,
  MockSmsProvider,
  TEMPLATE_KIND_AUDIENCE,
  type CommRules,
  type DeliveryRecord,
  type DeliveryStatus,
  type MessageOut,
  type MessageProvider,
  type MessageTemplate,
  type MessageTemplateBody,
  type NotificationRecord,
  type OptOutPreference,
  type SendChannel,
  type TemplateKind,
  type TemplateVariable,
  assertWithinCaps,
  defaultTemplates,
  inSendWindow,
  isOptedOut,
  nextRetryAt,
  renderTemplate,
  smsParts,
  templateVariablesUsed,
} from '@samity/shared';

/* ── errors ─────────────────────────────────────────────────────────────────── */

export class CommError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function err(status: number, code: string, message: string): never {
  throw new CommError(status, code, message);
}

/* ── store shape ────────────────────────────────────────────────────────────── */

export interface CommOptOut extends OptOutPreference {
  orgId: string;
  recipient: string;
  note: string;
  updatedAt: string;
}

interface CommData {
  orgId: string;
  templates: MessageTemplate[];
  notifications: NotificationRecord[];
  deliveries: DeliveryRecord[];
  optOuts: CommOptOut[];
  rules: CommRules;
  /** daily cost, keyed 'YYYY-MM-DD'; monthly, keyed 'YYYY-MM'. */
  spendDaily: Map<string, number>;
  spendMonthly: Map<string, number>;
}

const g = globalThis as unknown as { __commDemoData?: CommData };

function seed(): CommData {
  const orgId = '00000000-0000-4000-8000-0000000000aa';
  const now = new Date().toISOString();
  const rules: CommRules = { ...DEFAULT_COMM_RULES };
  // Seed one opted-out recipient so the opt-out path is demonstrable.
  const optOuts: CommOptOut[] = [
    { orgId, recipient: '01700000001', email: false, sms: true, note: 'সদস্য এসএমএস চান না', updatedAt: now },
  ];
  // Seed a couple of in-app notifications for the demo user + officer.
  const notifications: NotificationRecord[] = [
    {
      id: randomUUID(),
      orgId,
      userId: '00000000-0000-4000-8000-000000000001',
      title: 'স্বাগতম',
      body: 'নোটিফিকেশন সেন্টার চালু হয়েছে।',
      kind: 'custom',
      link: '/comms',
      read: false,
      createdAt: now,
    },
    {
      id: randomUUID(),
      orgId,
      userId: '00000000-0000-4000-8000-0000000002a1',
      title: 'অনুমোদনের অনুরোধ',
      body: 'নতুন সদস্য অনুমোদনের অপেক্ষায় আছে।',
      kind: 'approval_request',
      link: '/members',
      read: false,
      createdAt: now,
    },
  ];
  return {
    orgId,
    templates: defaultTemplates(orgId, 'admin@samity.test', now),
    notifications,
    deliveries: [],
    optOuts,
    rules,
    spendDaily: new Map(),
    spendMonthly: new Map(),
  };
}

export function commStore(): CommData {
  if (!g.__commDemoData) g.__commDemoData = seed();
  return g.__commDemoData;
}

export function resetCommStore(): void {
  g.__commDemoData = undefined;
}

/* ── providers (req 1) ─────────────────────────────────────────────────────── */

/** Raw-socket free-SMTP sender (shared with the MIS module's approach). */
export function sendMail(
  cfg: { host: string; port: number; secure: boolean; user: string; pass: string; from: string },
  to: string[],
  subject: string,
  body: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket: net.Socket = cfg.secure
      ? tls.connect({ host: cfg.host, port: cfg.port, rejectUnauthorized: false })
      : net.connect({ host: cfg.host, port: cfg.port });
    socket.setTimeout(10_000);
    let buffer = '';
    let step = 0;
    const steps = ['220', '250', '250', '250', '250', '354', '250'];
    socket.on('data', (d) => {
      buffer += d.toString();
      if (!buffer.endsWith('\r\n')) return;
      const code = buffer.slice(0, 3);
      buffer = '';
      if (steps[step] && !code.startsWith(steps[step]!)) {
        socket.destroy();
        reject(new Error(`SMTP step ${step}: ${code}`));
        return;
      }
      step += 1;
      const send = (s: string) => socket.write(`${s}\r\n`);
      if (step === 1) send(`EHLO samity.local`);
      else if (step === 2) send('AUTH LOGIN');
      else if (step === 3) send(Buffer.from(cfg.user).toString('base64'));
      else if (step === 4) send(Buffer.from(cfg.pass).toString('base64'));
      else if (step === 5) send(`MAIL FROM:<${cfg.from}>`);
      else if (step === 6) {
        send(`RCPT TO:<${to[0]}>`);
      } else if (step === 7) {
        send(`DATA`);
        const msg = [`From: Samity Manager <${cfg.from}>`, `To: ${to.join(', ')}`, 'Subject: ' + subject, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '', body, '.'].join('\r\n');
        socket.write(msg);
      } else {
        send('QUIT');
        socket.end();
        resolve();
      }
    });
    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('SMTP timeout'));
    });
    socket.on('error', reject);
  });
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export function smtpFromEnv(env: Record<string, string | undefined>): SmtpConfig | null {
  if (!env['SMTP_HOST'] || !env['SMTP_USER']) return null;
  const port = Number(env['SMTP_PORT'] ?? 587);
  return {
    host: env['SMTP_HOST']!,
    port,
    secure: port === 465,
    user: env['SMTP_USER']!,
    pass: env['SMTP_PASS'] ?? '',
    from: env['SMTP_FROM'] ?? env['SMTP_USER']!,
  };
}

export interface SmsGatewayEnv {
  url: string;
  headers: Record<string, string>;
  bodyTemplate: string;
  name: string;
  costPerPart?: number;
}

export function smsGatewayFromEnv(env: Record<string, string | undefined>): SmsGatewayEnv | null {
  if (!env['SMS_GATEWAY_URL']) return null;
  return {
    url: env['SMS_GATEWAY_URL']!,
    headers: {
      'authorization': env['SMS_GATEWAY_API_KEY'] ? `Bearer ${env['SMS_GATEWAY_API_KEY']}` : '',
    },
    // Generic BD gateway contract; override with SMS_GATEWAY_BODY when needed.
    bodyTemplate: env['SMS_GATEWAY_BODY'] ?? '{"to":"{phone}","text":"{message}"}',
    name: env['SMS_GATEWAY_NAME'] ?? 'http-gateway',
    costPerPart: env['SMS_COST_PER_PART'] ? Number(env['SMS_COST_PER_PART']) : undefined,
  };
}

/** Build the active SMS provider: real gateway when configured, mock otherwise. */
export function smsProvider(env: Record<string, string | undefined>): MessageProvider {
  const gw = smsGatewayFromEnv(env);
  if (gw) return new HttpSmsGatewayProvider(gw.name, { url: gw.url, headers: gw.headers, bodyTemplate: gw.bodyTemplate, costPerPart: gw.costPerPart });
  return new MockSmsProvider();
}

/* ── templates (req 2) ─────────────────────────────────────────────────────── */

export function listTemplates(): MessageTemplate[] {
  return [...commStore().templates];
}

export function upsertTemplate(body: MessageTemplateBody, viewer: { name: string }): MessageTemplate {
  const store = commStore();
  const { known, unknown } = templateVariablesUsed(body.body);
  if (unknown.length > 0) {
    err(422, 'VALIDATION_ERROR', `অজানা ভেরিয়েবল / Unknown variables: ${unknown.join(', ')}`);
  }
  const existing = store.templates.find(
    (t) => t.kind === body.kind && t.locale === body.locale && t.channel === body.channel,
  );
  const now = new Date().toISOString();
  if (existing) {
    Object.assign(existing, { ...body, updatedAt: now, updatedBy: viewer.name });
    return existing;
  }
  const rec: MessageTemplate = { id: randomUUID(), orgId: store.orgId, ...body, updatedAt: now, updatedBy: viewer.name };
  store.templates.push(rec);
  return rec;
}

/** Preview a template with sample variables (used by the UI before sending). */
export function previewTemplate(id: string, overrides: Partial<Record<TemplateVariable, string>>): { text: string; subject: string; missing: string[] } {
  const t = commStore().templates.find((x) => x.id === id);
  if (!t) err(404, 'NOT_FOUND', `টেমপ্লেট পাওয়া যায়নি / Template not found: ${id}`);
  const vars: Partial<Record<TemplateVariable, string>> = {
    orgName: 'স্যামিটি ডেমো সমবায় সমিতি',
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
    ...overrides,
  };
  const r = renderTemplate(t!.body, vars);
  const sr = t!.subject ? renderTemplate(t!.subject, vars) : { text: '', missing: [] };
  return { text: r.text, subject: sr.text, missing: [...new Set([...r.missing, ...sr.missing])] };
}

/* ── opt-outs & rules ──────────────────────────────────────────────────────── */

export function listOptOuts(): CommOptOut[] {
  return [...commStore().optOuts];
}

export function setOptOut(recipient: string, pref: { email?: boolean; sms?: boolean; note?: string }): CommOptOut {
  const store = commStore();
  const existing = store.optOuts.find((o) => o.recipient === recipient);
  const now = new Date().toISOString();
  if (existing) {
    if (pref.email !== undefined) existing.email = pref.email;
    if (pref.sms !== undefined) existing.sms = pref.sms;
    if (pref.note !== undefined) existing.note = pref.note;
    existing.updatedAt = now;
    return existing;
  }
  const rec: CommOptOut = {
    orgId: store.orgId,
    recipient,
    email: pref.email ?? false,
    sms: pref.sms ?? false,
    note: pref.note ?? '',
    updatedAt: now,
  };
  store.optOuts.push(rec);
  return rec;
}

export function getRules(): CommRules {
  return { ...commStore().rules };
}

export function updateRules(patch: Partial<CommRules>): CommRules {
  const rules = commStore().rules;
  Object.assign(rules, patch);
  return { ...rules };
}

/* ── spend counters ────────────────────────────────────────────────────────── */

function bumpSpend(cost: number, now = new Date()): { day: string; dailyCost: number; month: string; monthlyCost: number } {
  const store = commStore();
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  const d = (store.spendDaily.get(day) ?? 0) + cost;
  const m = (store.spendMonthly.get(month) ?? 0) + cost;
  store.spendDaily.set(day, d);
  store.spendMonthly.set(month, m);
  return { day, dailyCost: Number(d.toFixed(2)), month, monthlyCost: Number(m.toFixed(2)) };
}

export function spendToday(now = new Date()): { day: string; dailyCost: number; month: string; monthlyCost: number; rules: CommRules } {
  const store = commStore();
  const day = now.toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  return {
    day,
    dailyCost: Number((store.spendDaily.get(day) ?? 0).toFixed(2)),
    month,
    monthlyCost: Number((store.spendMonthly.get(month) ?? 0).toFixed(2)),
    rules: { ...store.rules },
  };
}

/* ── send pipeline (reqs 1–3) ──────────────────────────────────────────────── */

export interface SendBody {
  kind: TemplateKind | 'custom';
  channel: SendChannel;
  templateId?: string;
  locale?: 'bn' | 'en';
  /** Direct body (custom) or template + vars. */
  body?: string;
  subject?: string;
  vars?: Partial<Record<TemplateVariable, string>>;
  recipientName: string;
  recipient: string;
  /** Force past the send window (admins only, logged). */
  force?: boolean;
}

function resolveBody(b: SendBody): { body: string; subject: string; templateId: string | null; locale: 'bn' | 'en'; error: string | null } {
  if (b.templateId) {
    const t = commStore().templates.find((x) => x.id === b.templateId);
    if (!t) return { body: '', subject: '', templateId: null, locale: 'bn', error: 'template not found' };
    const r = renderTemplate(t.body, b.vars ?? {});
    const sr = t.subject ? renderTemplate(t.subject, b.vars ?? {}) : { text: b.subject ?? '', missing: [] };
    return { body: r.text, subject: sr.text, templateId: t.id, locale: t.locale, error: r.missing.length ? `missing variables: ${r.missing.join(', ')}` : null };
  }
  if (b.kind === 'custom' && b.body) {
    return { body: b.body, subject: b.subject ?? '', templateId: null, locale: b.locale ?? 'bn', error: null };
  }
  // kind without template id → pick the enabled template for kind+locale+channel.
  const locale = b.locale ?? 'bn';
  const t = commStore().templates.find((x) => x.kind === b.kind && x.locale === locale && x.channel === b.channel && x.enabled);
  if (!t) return { body: '', subject: '', templateId: null, locale, error: `no enabled template for ${b.kind}/${locale}/${b.channel}` };
  const r = renderTemplate(t.body, b.vars ?? {});
  const sr = t.subject ? renderTemplate(t.subject, b.vars ?? {}) : { text: b.subject ?? '', missing: [] };
  return { body: r.text, subject: sr.text, templateId: t.id, locale, error: r.missing.length ? `missing variables: ${r.missing.join(', ')}` : null };
}

function estimatedCost(channel: SendChannel, body: string, rules: CommRules): number {
  if (channel === 'sms') return Number((smsParts(body) * rules.costPerSmsPart).toFixed(2));
  return 0;
}

async function dispatch(channel: SendChannel, recipient: string, subject: string, body: string): Promise<{ ok: boolean; provider: string; providerId?: string; error?: string; cost: number }> {
  const env = process.env as Record<string, string | undefined>;
  if (channel === 'in_app') {
    return { ok: true, provider: 'in-app', cost: 0 };
  }
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
  const res = await p.send({ channel: 'sms', to: recipient, body });
  return { ok: res.ok, provider: p.name, providerId: res.providerId, error: res.error, cost: res.cost };
}

/** Current HH:MM in the org's timezone (send windows are local business hours). */
function localHhmm(now = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
}

/** Send one message through the full guard pipeline. Returns the delivery row. */
export async function sendMessage(b: SendBody, viewer: { userId: string; name: string; role: string }): Promise<DeliveryRecord> {
  const store = commStore();
  const rules = store.rules;
  const now = new Date();
  const nowIso = now.toISOString();
  const resolved = resolveBody(b);
  const attempts = 1;

  const base: DeliveryRecord = {
    id: randomUUID(),
    orgId: store.orgId,
    channel: b.channel,
    provider: 'pending',
    recipientName: b.recipientName,
    recipient: b.recipient,
    kind: b.kind,
    templateId: resolved.templateId,
    locale: resolved.locale,
    subject: resolved.subject,
    body: resolved.body,
    status: 'queued',
    attempts,
    cost: 0,
    error: resolved.error,
    sentAt: null,
    nextRetryAt: null,
    createdAt: nowIso,
  };

  if (resolved.error && !resolved.body) {
    base.status = 'failed';
    store.deliveries.unshift(base);
    return base;
  }

  // Guard 1: opt-out (req 3).
  const pref = store.optOuts.find((o) => o.recipient === b.recipient);
  if (isOptedOut(b.channel, pref ? { email: pref.email, sms: pref.sms } : undefined)) {
    base.status = 'opted_out';
    base.error = 'অপ্ট-আউট / recipient opted out';
    base.provider = 'guard';
    store.deliveries.unshift(base);
    return base;
  }

  // Guard 2: send window (night messages blocked; admins may force).
  const hhmm = localHhmm(now);
  if (!b.force && !inSendWindow(hhmm, rules)) {
    base.status = 'outside_window';
    base.error = `পাঠানোর সময় নয় (${hhmm}, জানালা ${rules.sendWindowStart}–${rules.sendWindowEnd})`;
    base.provider = 'guard';
    store.deliveries.unshift(base);
    return base;
  }

  // Guard 3: cost caps (daily → monthly).
  const est = estimatedCost(b.channel, resolved.body, rules);
  const spent = spendToday(now);
  const cap = assertWithinCaps({ dailyCost: spent.dailyCost, monthlyCost: spent.monthlyCost }, est, rules);
  if (!cap.ok) {
    base.status = 'cap_blocked';
    base.error = cap.reason === 'daily_cap' ? `দৈনিক খরচের সীমা ৳${rules.dailyCostCap} অতিক্রান্ত` : `মাসিক খরচের সীমা ৳${rules.monthlyCostCap} অতিক্রান্ত`;
    base.provider = 'guard';
    base.cost = est;
    store.deliveries.unshift(base);
    return base;
  }

  // Dispatch through the provider.
  const res = await dispatch(b.channel, b.recipient, resolved.subject, resolved.body);
  base.provider = res.provider;
  base.cost = res.cost;
  if (res.ok) {
    base.status = 'sent';
    base.sentAt = new Date().toISOString();
    base.error = null;
    if (res.cost > 0) bumpSpend(res.cost, now);
  } else {
    const retry = nextRetryAt(new Date().toISOString(), attempts, rules);
    base.status = retry ? 'retrying' : 'failed';
    base.error = res.error ?? 'unknown error';
    base.nextRetryAt = retry;
  }
  store.deliveries.unshift(base);

  // In-app copies also land in the notification center (req 1).
  if (b.channel === 'in_app' && base.status === 'sent') {
    store.notifications.unshift({
      id: randomUUID(),
      orgId: store.orgId,
      userId: b.recipient,
      title: resolved.subject || 'নোটিফিকেশন',
      body: resolved.body,
      kind: b.kind,
      link: undefined,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }
  return base;
}

/** Retry pass: re-dispatch deliveries in 'retrying' whose next_retry_at has passed. */
export async function retryDue(now = new Date()): Promise<{ retried: number; sent: number; failed: number }> {
  const store = commStore();
  const rules = store.rules;
  const iso = now.toISOString();
  const due = store.deliveries.filter((d) => d.status === 'retrying' && d.nextRetryAt && d.nextRetryAt <= iso);
  let sent = 0;
  let failed = 0;
  for (const d of due) {
    const res = await dispatch(d.channel, d.recipient, d.subject, d.body);
    d.attempts += 1;
    d.provider = res.provider;
    if (res.ok) {
      d.status = 'sent';
      d.sentAt = new Date().toISOString();
      d.error = null;
      d.nextRetryAt = null;
      d.cost = res.cost;
      if (res.cost > 0) bumpSpend(res.cost, now);
      sent += 1;
    } else {
      const retry = nextRetryAt(new Date().toISOString(), d.attempts, rules);
      d.status = retry ? 'retrying' : 'failed';
      d.error = res.error ?? 'unknown error';
      d.nextRetryAt = retry;
      failed += 1;
    }
  }
  return { retried: due.length, sent, failed };
}

/* ── delivery log & notification center ───────────────────────────────────── */

export function listDeliveries(filter: { channel?: SendChannel; status?: DeliveryStatus; q?: string } = {}): DeliveryRecord[] {
  let rows = [...commStore().deliveries];
  if (filter.channel) rows = rows.filter((d) => d.channel === filter.channel);
  if (filter.status) rows = rows.filter((d) => d.status === filter.status);
  if (filter.q) {
    const q = filter.q.toLowerCase();
    rows = rows.filter((d) => d.recipientName.toLowerCase().includes(q) || d.recipient.toLowerCase().includes(q) || d.body.toLowerCase().includes(q));
  }
  return rows;
}

export function deliveryStats(): { byStatus: { status: DeliveryStatus; labelBn: string; count: number }[]; total: number; costToday: number; costMonth: number } {
  const rows = commStore().deliveries;
  const byStatus = (Object.keys(DELIVERY_STATUS_LABELS_BN) as DeliveryStatus[])
    .map((status) => ({ status, labelBn: DELIVERY_STATUS_LABELS_BN[status], count: rows.filter((r) => r.status === status).length }))
    .filter((s) => s.count > 0);
  const spend = spendToday();
  return { byStatus, total: rows.length, costToday: spend.dailyCost, costMonth: spend.monthlyCost };
}

/** List the caller's notification feed. Field staff see only their own rows. */
export function listNotifications(viewer: { userId: string; role: string }, onlyUnread = false): NotificationRecord[] {
  const store = commStore();
  // Admins may read the org feed for moderation; everyone else only their own.
  const own = ['super_admin', 'org_admin'].includes(viewer.role)
    ? store.notifications
    : store.notifications.filter((n) => n.userId === viewer.userId);
  const rows = own.filter((n) => (onlyUnread ? !n.read : true));
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function markNotificationRead(id: string, viewer: { userId: string; role: string }): NotificationRecord {
  const store = commStore();
  const n = store.notifications.find((x) => x.id === id);
  if (!n) err(404, 'NOT_FOUND', `নোটিফিকেশন পাওয়া যায়নি / Notification not found: ${id}`);
  if (n.userId !== viewer.userId && !['super_admin', 'org_admin'].includes(viewer.role)) {
    err(403, 'FORBIDDEN', 'শুধু নিজের নোটিফিকেশন / Only your own notifications');
  }
  n.read = true;
  return n;
}

/** Broadcast an in-app announcement to every seeded staff user (or one target). */
export function broadcast(body: { title: string; message: string; userId?: string }, viewer: { name: string }): NotificationRecord[] {
  const store = commStore();
  const targets = body.userId
    ? [body.userId]
    : ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000002a1'];
  const now = new Date().toISOString();
  const rows = targets.map((userId) => ({
    id: randomUUID(),
    orgId: store.orgId,
    userId,
    title: body.title,
    body: body.message,
    kind: 'custom' as const,
    link: undefined,
    read: false,
    createdAt: now,
  }));
  store.notifications.unshift(...rows);
  return rows;
}

/** Staff audit note: who is allowed to see the delivery log (members never). */
export function canViewDeliveries(role: string): boolean {
  return ['super_admin', 'org_admin', 'area_manager', 'branch_manager', 'accountant'].includes(role);
}

export function assertKindAudience(kind: TemplateKind | 'custom', channel: SendChannel): void {
  if (kind === 'custom') return;
  if (TEMPLATE_KIND_AUDIENCE[kind] === 'staff' && channel === 'sms') {
    err(422, 'VALIDATION_ERROR', 'অনুমোদনের অনুরোধ এসএমএস-এ যায় না / approval requests are in-app or email');
  }
}
