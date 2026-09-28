/**
 * ── Communication & documents engine (pure) ──────────────────────────────────
 * Req 1: provider interface — in-app notifications, email over free SMTP and
 *   SMS through a pluggable provider list (mock + generic HTTP gateway; local
 *   BD bulk-SMS providers plug in by implementing MessageProvider).
 * Req 2: bilingual (bn/en) message templates with {{variables}} for the seven
 *   standard kinds (installment reminder … approval request).
 * Req 3: guard-rails — send windows (no night messages), opt-out per channel,
 *   retries with backoff, a delivery log, a daily cost counter and monthly cap.
 *
 * Everything here is pure: the API store owns IO (DB/SMTP/HTTP) and calls into
 * these helpers, mirroring the reports-mis-ops pattern.
 */
import { z } from 'zod';

/* ── Req 1: channels & providers ──────────────────────────────────────────── */

export const SEND_CHANNELS = ['in_app', 'email', 'sms'] as const;
export type SendChannel = (typeof SEND_CHANNELS)[number];

export const SEND_CHANNEL_LABELS_BN: Record<SendChannel, string> = {
  in_app: 'অ্যাপ-এর ভেতরে',
  email: 'ইমেইল',
  sms: 'এসএমএস',
};

export type DeliveryStatus =
  | 'queued'
  | 'sent'
  | 'failed'
  | 'opted_out'
  | 'outside_window'
  | 'cap_blocked'
  | 'retrying';

export const DELIVERY_STATUS_LABELS_BN: Record<DeliveryStatus, string> = {
  queued: 'অপেক্ষমাণ',
  sent: 'পাঠানো হয়েছে',
  failed: 'ব্যর্থ',
  opted_out: 'অপ্ট-আউট',
  outside_window: 'পাঠানোর সময় নয়',
  cap_blocked: 'খরচের সীমা অতিক্রান্ত',
  retrying: 'পুনরায় চেষ্টা হচ্ছে',
};

/** One outbound message handed to a provider. */
export interface MessageOut {
  channel: SendChannel;
  to: string;
  subject?: string;
  body: string;
}

export interface ProviderSendResult {
  ok: boolean;
  /** Provider-side message id when available. */
  providerId?: string;
  error?: string;
  /** Cost in BDT charged by the provider (0 for in_app/email). */
  cost: number;
}

/**
 * Pluggable provider interface (req 1). Local Bangladeshi bulk-SMS providers
 * (SSL Wireless, bulksmsbd, MimSMS…) implement this with their HTTP contract.
 */
export interface MessageProvider {
  readonly name: string;
  readonly channel: SendChannel;
  send(msg: MessageOut): Promise<ProviderSendResult>;
}

/** Unicode SMS segmentation: GSM-7 = 160 chars/part, UCS-2 (Bangla) = 70. */
export function smsParts(body: string): number {
  if (body.length === 0) return 1;
  const isUnicode = [...body].some((ch) => ch.codePointAt(0)! > 0x7f);
  const perPart = isUnicode ? 70 : 160;
  return Math.ceil(body.length / perPart);
}

/** Always-succeeds mock so demos and tests run without any external service. */
export class MockSmsProvider implements MessageProvider {
  readonly name = 'mock-sms';
  readonly channel = 'sms' as const;
  private seq = 0;
  constructor(private readonly costPerPart = 0.35) {}
  async send(msg: MessageOut): Promise<ProviderSendResult> {
    this.seq += 1;
    return {
      ok: true,
      providerId: `mock-${Date.now()}-${this.seq}`,
      cost: Number((smsParts(msg.body) * this.costPerPart).toFixed(2)),
    };
  }
}

export interface HttpGatewayConfig {
  /** POST endpoint of the gateway. */
  url: string;
  /** Static headers, e.g. an API key. Values may hold env references resolved by the store. */
  headers?: Record<string, string>;
  /**
   * Body template with {phone} and {message} placeholders, e.g.
   * `{"api_key":"…","number":"{phone}","sms":"{message}"}`.
   */
  bodyTemplate: string;
  /** HTTP status the gateway uses for success (default: 200-299). */
  successStatus?: number;
  /** charged BDT per SMS part (defaults to the rules config value). */
  costPerPart?: number;
}

/** Generic HTTP bulk-SMS gateway adapter — works with most BD providers. */
export class HttpSmsGatewayProvider implements MessageProvider {
  readonly name: string;
  readonly channel = 'sms' as const;
  constructor(
    name: string,
    private readonly cfg: HttpGatewayConfig,
  ) {
    this.name = name;
  }
  async send(msg: MessageOut): Promise<ProviderSendResult> {
    const body = this.cfg.bodyTemplate
      .replaceAll('{phone}', encodeURIComponent(msg.to))
      .replaceAll('{message}', encodeURIComponent(msg.body));
    try {
      const res = await fetch(this.cfg.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(this.cfg.headers ?? {}) },
        body,
      });
      const ok = this.cfg.successStatus ? res.status === this.cfg.successStatus : res.ok;
      return {
        ok,
        providerId: res.headers.get('x-msg-id') ?? undefined,
        error: ok ? undefined : `gateway HTTP ${res.status}`,
        cost: ok ? Number((smsParts(msg.body) * (this.cfg.costPerPart ?? 0.35)).toFixed(2)) : 0,
      };
    } catch (e) {
      return { ok: false, error: (e as Error).message.slice(0, 200), cost: 0 };
    }
  }
}

/* ── Req 2: bilingual templates with variables ────────────────────────────── */

export const TEMPLATE_KINDS = [
  'installment_reminder',
  'disbursement_confirmation',
  'receipt',
  'meeting_notice',
  'overdue_notice',
  'greeting',
  'approval_request',
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_KIND_LABELS_BN: Record<TemplateKind, string> = {
  installment_reminder: 'কিস্তি স্মারক',
  disbursement_confirmation: 'ঋণ বিতরণ নিশ্চিতি',
  receipt: 'রশিদ',
  meeting_notice: 'সভার নোটিশ',
  overdue_notice: 'বকেয়া নোটিশ',
  greeting: 'শুভেচ্ছা (জন্মদিন/উৎসব)',
  approval_request: 'অনুমোদনের অনুরোধ (কর্মী)',
};

/** Which audiences a kind targets — approval requests go to staff, not members. */
export const TEMPLATE_KIND_AUDIENCE: Record<TemplateKind, 'member' | 'staff'> = {
  installment_reminder: 'member',
  disbursement_confirmation: 'member',
  receipt: 'member',
  meeting_notice: 'member',
  overdue_notice: 'member',
  greeting: 'member',
  approval_request: 'staff',
};

export const TEMPLATE_VARIABLES = [
  'orgName',
  'memberName',
  'samityName',
  'branchName',
  'amount',
  'dueDate',
  'installmentNo',
  'loanCode',
  'overdueAmount',
  'daysOverdue',
  'meetingDate',
  'meetingVenue',
  'festivalName',
  'staffName',
  'requesterName',
  'receiptNo',
  'disbursementDate',
] as const;
export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];

export const TEMPLATE_VARIABLE_LABELS_BN: Record<TemplateVariable, string> = {
  orgName: 'সংস্থার নাম',
  memberName: 'সদস্যের নাম',
  samityName: 'সমিতির নাম',
  branchName: 'শাখার নাম',
  amount: 'টাকার পরিমাণ',
  dueDate: 'কিস্তির তারিখ',
  installmentNo: 'কিস্তি নম্বর',
  loanCode: 'ঋণ কোড',
  overdueAmount: 'বকেয়ার পরিমাণ',
  daysOverdue: 'বকেয়া দিন সংখ্যা',
  meetingDate: 'সভার তারিখ',
  meetingVenue: 'সভার স্থান',
  festivalName: 'উৎসব/দিনের নাম',
  staffName: 'কর্মীর নাম',
  requesterName: 'অনুরোধকারীর নাম',
  receiptNo: 'রশিদ নম্বর',
  disbursementDate: 'বিতরণের তারিখ',
};

export const templateLocaleSchema = z.enum(['bn', 'en']);

export const messageTemplateSchema = z.object({
  kind: z.enum(TEMPLATE_KINDS),
  name: z.string().trim().min(2).max(120),
  locale: templateLocaleSchema,
  channel: z.enum(SEND_CHANNELS),
  /** Email subject (ignored for sms/in_app). */
  subject: z.string().trim().max(200).default(''),
  /** Body with {{variable}} placeholders. */
  body: z.string().trim().min(3).max(2000),
  enabled: z.boolean().default(true),
});
export type MessageTemplateBody = z.infer<typeof messageTemplateSchema>;

export interface MessageTemplate extends MessageTemplateBody {
  id: string;
  orgId: string;
  updatedAt: string;
  updatedBy: string;
}

/** {{var}} tokens used by a body — unknown ones are reported back. */
export function templateVariablesUsed(body: string): { known: TemplateVariable[]; unknown: string[] } {
  const found = [...body.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g)].map((m) => m[1]!);
  const known: TemplateVariable[] = [];
  const unknown: string[] = [];
  for (const v of found) {
    if ((TEMPLATE_VARIABLES as readonly string[]).includes(v)) {
      if (!known.includes(v as TemplateVariable)) known.push(v as TemplateVariable);
    } else if (!unknown.includes(v)) {
      unknown.push(v);
    }
  }
  return { known, unknown };
}

/** Render {{var}} placeholders; returns leftover tokens when vars are missing. */
export function renderTemplate(
  body: string,
  vars: Partial<Record<TemplateVariable, string>>,
): { text: string; missing: string[] } {
  const missing = new Set<string>();
  const text = body.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, name: string) => {
    const val = vars[name as TemplateVariable];
    if (val === undefined || val === '') {
      missing.add(name);
      return `{{${name}}}`;
    }
    return val;
  });
  return { text, missing: [...missing] };
}

/** The seven standard kinds, pre-written in Bangla and English. */
export function defaultTemplates(orgId: string, updatedBy: string, nowIso: string): MessageTemplate[] {
  const mk = (
    id: string,
    kind: TemplateKind,
    locale: 'bn' | 'en',
    channel: SendChannel,
    subject: string,
    body: string,
  ): MessageTemplate => ({
    id,
    orgId,
    kind,
    name: `${TEMPLATE_KIND_LABELS_BN[kind]} (${locale === 'bn' ? 'বাংলা' : 'English'})`,
    locale,
    channel,
    subject,
    body,
    enabled: true,
    updatedAt: nowIso,
    updatedBy,
  });
  return [
    mk('tpl-inst-rem-bn', 'installment_reminder', 'bn', 'sms', '', 'আসসালামু আলাইকুম {{memberName}}, {{orgName}}-এর {{loanCode}} ঋণের {{installmentNo}} নম্বর কিস্তি ৳{{amount}} {{dueDate}} তারিখে জমা দিন। ধন্যবাদ।'),
    mk('tpl-inst-rem-en', 'installment_reminder', 'en', 'sms', '', 'Dear {{memberName}}, installment #{{installmentNo}} of loan {{loanCode}} (BDT {{amount}}) is due on {{dueDate}}. - {{orgName}}'),
    mk('tpl-disb-conf-bn', 'disbursement_confirmation', 'bn', 'sms', '', 'অভিনন্দন {{memberName}}! {{orgName}}-এর {{loanCode}} ঋণ ৳{{amount}} {{disbursementDate}} তারিখে আপনাকে বিতরণ করা হয়েছে।'),
    mk('tpl-disb-conf-en', 'disbursement_confirmation', 'en', 'email', 'Loan disbursement confirmation', 'Dear {{memberName}}, your loan {{loanCode}} of BDT {{amount}} was disbursed on {{disbursementDate}}. - {{orgName}}'),
    mk('tpl-receipt-bn', 'receipt', 'bn', 'sms', '', '{{orgName}}: {{memberName}}, রশিদ #{{receiptNo}} — ৳{{amount}} জমা গৃহীত হয়েছে। ধন্যবাদ।'),
    mk('tpl-receipt-en', 'receipt', 'en', 'sms', '', '{{orgName}}: Receipt #{{receiptNo}} — BDT {{amount}} received from {{memberName}}. Thank you.'),
    mk('tpl-meeting-bn', 'meeting_notice', 'bn', 'sms', '', '{{memberName}}, {{samityName}} সমিতির সভা {{meetingDate}} তারিখে {{meetingVenue}}-এ অনুষ্ঠিত হবে। উপস্থিত থাকার অনুরোধ রইল। - {{orgName}}'),
    mk('tpl-meeting-en', 'meeting_notice', 'en', 'email', 'Meeting notice', 'Dear {{memberName}}, the {{samityName}} samity meeting will be held on {{meetingDate}} at {{meetingVenue}}. Please attend. - {{orgName}}'),
    mk('tpl-overdue-bn', 'overdue_notice', 'bn', 'sms', '', '{{memberName}}, আপনার {{loanCode}} ঋণের ৳{{overdueAmount}} বকেয়া রয়েছে ({{daysOverdue}} দিন)। দ্রুত পরিশোধ করুন। - {{orgName}}'),
    mk('tpl-overdue-en', 'overdue_notice', 'en', 'sms', '', '{{memberName}}, your loan {{loanCode}} has BDT {{overdueAmount}} overdue for {{daysOverdue}} days. Please repay soon. - {{orgName}}'),
    mk('tpl-greeting-bn', 'greeting', 'bn', 'sms', '', '{{memberName}}, {{festivalName}}-এর শুভেচ্ছা ও অভিনন্দন! আপনার ও পরিবারের জন্য রইল আন্তরিক শুভকামনা। - {{orgName}}'),
    mk('tpl-greeting-en', 'greeting', 'en', 'email', 'Warm greetings', 'Dear {{memberName}}, warm greetings for {{festivalName}}! Best wishes to you and your family. - {{orgName}}'),
    mk('tpl-approval-bn', 'approval_request', 'bn', 'in_app', 'অনুমোদনের অনুরোধ', '{{requesterName}} আপনার অনুমোদন চেয়েছেন: ৳{{amount}} ({{branchName}})। অনুগ্রহ করে রিভিউ করুন।'),
    mk('tpl-approval-en', 'approval_request', 'en', 'in_app', 'Approval request', '{{requesterName}} requests your approval: BDT {{amount}} ({{branchName}}). Please review.'),
  ];
}

/* ── Req 3: rules — windows, opt-out, retry, caps ─────────────────────────── */

export const commRulesSchema = z.object({
  /** Local HH:MM window in which sending is allowed (night is excluded). */
  sendWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('09:00'),
  sendWindowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('20:00'),
  maxRetries: z.number().int().min(0).max(10).default(3),
  retryBackoffMinutes: z.number().int().min(1).max(1440).default(15),
  dailyCostCap: z.number().min(0).default(500),
  monthlyCostCap: z.number().min(0).default(5000),
  costPerSmsPart: z.number().min(0).default(0.35),
});
export type CommRules = z.infer<typeof commRulesSchema>;

export const DEFAULT_COMM_RULES: CommRules = {
  sendWindowStart: '09:00',
  sendWindowEnd: '20:00',
  maxRetries: 3,
  retryBackoffMinutes: 15,
  dailyCostCap: 500,
  monthlyCostCap: 5000,
  costPerSmsPart: 0.35,
};

/** Is `hhmm` inside the inclusive [start, end] window? Handles windows crossing midnight. */
export function inSendWindow(hhmm: string, rules: Pick<CommRules, 'sendWindowStart' | 'sendWindowEnd'>): boolean {
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const t = toMin(hhmm);
  const a = toMin(rules.sendWindowStart);
  const b = toMin(rules.sendWindowEnd);
  return a <= b ? t >= a && t <= b : t >= a || t <= b; // e.g. 22:00→06:00
}

export interface OptOutPreference {
  email: boolean;
  sms: boolean;
}

export function isOptedOut(channel: SendChannel, pref: OptOutPreference | undefined): boolean {
  if (!pref) return false;
  if (channel === 'email') return pref.email;
  if (channel === 'sms') return pref.sms;
  return false;
}

export interface SpendCounters {
  /** 'YYYY-MM-DD' */
  day: string;
  dailyCost: number;
  /** 'YYYY-MM' */
  month: string;
  monthlyCost: number;
}

/** Cap check before dispatch — keeps spend low (req 3). */
export function assertWithinCaps(
  spent: Pick<SpendCounters, 'dailyCost' | 'monthlyCost'>,
  estimatedCost: number,
  rules: Pick<CommRules, 'dailyCostCap' | 'monthlyCostCap'>,
): { ok: boolean; reason?: 'daily_cap' | 'monthly_cap' } {
  if (spent.dailyCost + estimatedCost > rules.dailyCostCap) return { ok: false, reason: 'daily_cap' };
  if (spent.monthlyCost + estimatedCost > rules.monthlyCostCap) return { ok: false, reason: 'monthly_cap' };
  return { ok: true };
}

/** When the next retry may run (attempt is 1-based; after maxRetries → null). */
export function nextRetryAt(failedAtIso: string, attempt: number, rules: Pick<CommRules, 'maxRetries' | 'retryBackoffMinutes'>): string | null {
  if (attempt > rules.maxRetries) return null;
  return new Date(Date.parse(failedAtIso) + attempt * rules.retryBackoffMinutes * 60_000).toISOString();
}

/* ── Records ──────────────────────────────────────────────────────────────── */

export interface DeliveryRecord {
  id: string;
  orgId: string;
  channel: SendChannel;
  provider: string;
  /** Recipient identity (member name / staff name). */
  recipientName: string;
  /** Phone or email or user id for in_app. */
  recipient: string;
  kind: TemplateKind | 'custom';
  templateId: string | null;
  locale: 'bn' | 'en';
  subject: string;
  body: string;
  status: DeliveryStatus;
  attempts: number;
  cost: number;
  error: string | null;
  sentAt: string | null;
  nextRetryAt: string | null;
  createdAt: string;
}

export interface NotificationRecord {
  id: string;
  orgId: string;
  /** Recipient user id (in-app notification center). */
  userId: string;
  title: string;
  body: string;
  kind: TemplateKind | 'custom';
  link?: string;
  read: boolean;
  createdAt: string;
}

/** Pure decision for one delivery — the store executes it. */
export interface DeliveryDecision {
  status: DeliveryStatus;
  cost: number;
  body: string;
  subject: string;
  error: string | null;
  nextRetryAt: string | null;
}
