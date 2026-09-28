/**
 * ── MIS ops demo store (reqs 5–10) ───────────────────────────────────────────
 * Complaint register with escalation, report builder over live snapshot data,
 * month freeze guards, export schedules with free-SMTP delivery and the
 * client-protection indicator rollup. Preview/test only — Supabase path uses
 * migrations 0050/0051 with the same shapes.
 */
import net from 'node:net';
import tls from 'node:tls';
import { randomUUID } from 'node:crypto';
import { num } from '@samity/shared';
import {
  clientProtectionIndicators,
  complaintDueAt,
  complaintCreateSchema,
  COMPLAINT_CATEGORY_LABELS_BN,
  COMPLAINT_STATUS_LABELS_BN,
  COMPLAINT_SEVERITY_LABELS_BN,
  COMPLAINT_CHANNEL_LABELS_BN,
  canTransitionComplaint as canTransitionComplaintShared,
  nextComplaintTicket,
  nextEscalationLevel,
  runBuilder,
  toCsv,
  toExcelXml,
  toPrintHtml,
  freezeCheck,
  FREEZE_MESSAGES_BN,
  isScheduleDue,
  smtpFromEnv,
  deliveryEmailSubjectBn,
  deliveryEmailBodyBn,
  type BuilderData,
  type ClientProtectionIndicators,
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
import { buildSnapshot, misStore, ProgramsError, standardReport } from './mis-store.js';

export { ProgramsError };

function err(status: number, code: string, message: string): never {
  throw new ProgramsError(status, code, message);
}

const ORG = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const BRANCH_MYM = '00000000-0000-4000-8000-0000000000b2';

export interface MisOpsData {
  orgId: string;
  complaints: ComplaintRecord[];
  complaintSeq: number;
  savedReports: SavedReport[];
  schedules: ExportSchedule[];
  freezes: MonthFreeze[];
  deliveries: { id: string; scheduleId: string; sentAt: string; status: 'ok' | 'error'; recipients: string[]; error: string | null }[];
}

const globalRef = globalThis as unknown as { __misOpsDemoData?: MisOpsData };

function seedStore(): MisOpsData {
  return { orgId: ORG, complaints: [], complaintSeq: 0, savedReports: [], schedules: [], freezes: [], deliveries: [] };
}

export function misOpsStore(): MisOpsData {
  globalRef.__misOpsDemoData ??= seedStore();
  return globalRef.__misOpsDemoData;
}

export function resetMisOpsStore(): void {
  delete globalRef.__misOpsDemoData;
}

/* ═══════════════════ 10) Complaint register ════════════════════════════════ */

export function createComplaint(body: ComplaintCreateBody, viewer: { userId: string; name: string }): ComplaintRecord {
  complaintCreateSchema.parse(body);
  const store = misOpsStore();
  const today = new Date().toISOString().slice(0, 10);
  // Req 9: a complaint dated in a hard-frozen month is a correction — reject.
  const fz = freezeCheck(store.freezes, body.reportedAt);
  if (fz.frozen && fz.mode === 'hard') err(409, 'ALREADY_CLOSED', FREEZE_MESSAGES_BN.hard);

  store.complaintSeq += 1;
  const now = new Date().toISOString();
  const rec: ComplaintRecord = {
    id: randomUUID(),
    orgId: store.orgId,
    ticketNo: nextComplaintTicket(store.complaintSeq),
    channel: body.channel,
    category: body.category,
    status: 'open',
    severity: body.severity,
    subject: body.subject,
    details: body.details,
    memberId: body.memberId,
    memberName: body.memberName,
    branchId: body.branchId,
    reportedAt: body.reportedAt,
    dueAt: complaintDueAt(body.reportedAt, body.severity),
    acknowledgedAt: null,
    resolvedAt: null,
    resolutionNote: '',
    escalations: [],
    createdAt: now,
    updatedAt: now,
  };
  store.complaints.push(rec);
  void today;
  void viewer;
  return rec;
}

export function listComplaints(filter: { status?: string; category?: string; branchId?: string; q?: string } = {}): ComplaintRecord[] {
  let rows = [...misOpsStore().complaints].sort((a, b) => b.reportedAt.localeCompare(a.reportedAt) || b.ticketNo.localeCompare(a.ticketNo));
  if (filter.status) rows = rows.filter((c) => c.status === filter.status);
  if (filter.category) rows = rows.filter((c) => c.category === filter.category);
  if (filter.branchId) rows = rows.filter((c) => c.branchId === filter.branchId);
  if (filter.q) {
    const q = filter.q.toLowerCase();
    rows = rows.filter((c) => c.ticketNo.toLowerCase().includes(q) || c.memberName.toLowerCase().includes(q) || c.subject.toLowerCase().includes(q));
  }
  return rows;
}

export function getComplaint(id: string): ComplaintRecord {
  const c = misOpsStore().complaints.find((x) => x.id === id);
  if (!c) err(404, 'NOT_FOUND', 'অভিযোগ পাওয়া যায়নি / Complaint not found');
  return c as ComplaintRecord;
}

const ACTION_TO_STATUS: Record<ComplaintActionBody['action'], ComplaintRecord['status']> = {
  acknowledge: 'in_progress',
  progress: 'in_progress',
  escalate: 'escalated',
  resolve: 'resolved',
  reject: 'rejected',
};

export function actOnComplaint(id: string, body: ComplaintActionBody, viewer: { userId: string; name: string; role: string }): ComplaintRecord {
  const rec = getComplaint(id);
  const to = ACTION_TO_STATUS[body.action];
  if (!canTransitionComplaintShared(rec.status, to)) {
    err(409, 'INVALID_STATUS', `অবৈধ অবস্থান্তর ${rec.status} → ${to} / Invalid complaint transition`);
  }
  const now = new Date().toISOString();
  if (body.action === 'acknowledge') rec.acknowledgedAt = now;
  if (body.action === 'escalate') {
    // Field officers may escalate; the ladder decides the next level.
    rec.escalations = [
      ...rec.escalations,
      { level: nextEscalationLevel(rec), at: now, note: body.note || `${viewer.name} উর্ধ্বতনে প্রেরণ করেছেন` },
    ];
  }
  if (body.action === 'resolve') {
    rec.resolutionNote = body.note;
    // Use the actual on-site resolution date when provided (defaults to today).
    rec.resolvedAt = body.resolvedOn ?? now.slice(0, 10);
  }
  if (body.action === 'reject' && !['super_admin', 'org_admin', 'area_manager'].includes(viewer.role)) {
    err(403, 'FORBIDDEN', 'প্রত্যাখ্যান শুধু ব্যবস্থাপক-স্তরে / Only managers may reject');
  }
  rec.status = to;
  rec.updatedAt = now;
  return rec;
}

/* ── 5) Client protection indicators ──────────────────────────────────────── */

export function protectionIndicators(periodStart?: string, periodEnd?: string): ClientProtectionIndicators {
  const store = misOpsStore();
  const s = buildSnapshot(new Date().toISOString().slice(0, 10));
  const overdueMemberIds = new Set(s.loans.filter((l) => l.daysPastDue > 0).map((l) => l.memberId));
  return clientProtectionIndicators(store.complaints, {
    borrowers: Math.max(1, new Set(s.loans.map((l) => l.memberId)).size),
    branches: s.branches.map((b) => ({ id: b.id, name: b.name })),
    overdueMemberIds,
    periodStart,
    periodEnd,
  });
}

/* ═══════════════════ 6) Report builder ═════════════════════════════════════ */

function builderData(): BuilderData {
  const s = buildSnapshot(new Date().toISOString().slice(0, 10));
  const branchName = (id: string | null) => s.branches.find((b) => b.id === id)?.name ?? '—';
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
    complaints: misOpsStore().complaints.map((c) => ({
      branchName: branchName(c.branchId),
      category: COMPLAINT_CATEGORY_LABELS_BN[c.category],
      status: COMPLAINT_STATUS_LABELS_BN[c.status],
      severity: COMPLAINT_SEVERITY_LABELS_BN[c.severity],
      channel: COMPLAINT_CHANNEL_LABELS_BN[c.channel],
    })),
    members: s.members.map((m) => ({ branchName: branchName(m.branchId), samityName: m.samityName, active: m.active ? 'হ্যাঁ' : 'না' })),
  };
}

export function runAdHocReport(body: SavedReportBody): { rows: ReturnType<typeof runBuilder>['rows']; scanned: number; chartType: string } {
  const result = runBuilder(builderData(), body.dataset, body);
  return { ...result, chartType: body.chartType };
}

export function listSavedReports(viewer: { userId: string; role: string }): SavedReport[] {
  return misOpsStore().savedReports.filter((r) => r.ownerUserId === viewer.userId || r.sharedWithRoles.includes(viewer.role) || ['super_admin', 'org_admin'].includes(viewer.role));
}

export function saveReport(body: SavedReportBody, viewer: { userId: string; name: string }): SavedReport {
  const store = misOpsStore();
  const now = new Date().toISOString();
  const rec: SavedReport = {
    id: randomUUID(),
    orgId: store.orgId,
    ...body,
    ownerUserId: viewer.userId,
    ownerName: viewer.name,
    createdAt: now,
    updatedAt: now,
  };
  store.savedReports.push(rec);
  return rec;
}

export function getSavedReport(id: string, viewer: { userId: string; role: string }): SavedReport {
  const r = misOpsStore().savedReports.find((x) => x.id === id);
  if (!r) err(404, 'NOT_FOUND', 'সংরক্ষিত রিপোর্ট নেই / Saved report not found');
  if (!(r.ownerUserId === viewer.userId || r.sharedWithRoles.includes(viewer.role) || ['super_admin', 'org_admin'].includes(viewer.role))) {
    err(403, 'FORBIDDEN', 'প্রবেশাধিকার নেই / Not shared with you');
  }
  return r as SavedReport;
}

export function deleteSavedReport(id: string, viewer: { userId: string; role: string }): void {
  const store = misOpsStore();
  const idx = store.savedReports.findIndex((x) => x.id === id);
  if (idx === -1) err(404, 'NOT_FOUND', 'সংরক্ষিত রিপোর্ট নেই / Saved report not found');
  const r = store.savedReports[idx]!;
  if (r.ownerUserId !== viewer.userId && !['super_admin', 'org_admin'].includes(viewer.role)) {
    err(403, 'FORBIDDEN', 'শুধু মালিক মুছতে পারেন / Only the owner may delete');
  }
  store.savedReports.splice(idx, 1);
}

/* ═══════════════════ 7) Exports (CSV/Excel/PDF) ════════════════════════════ */

export interface ExportPayload {
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

/** Build a downloadable export from a standard report. */
export function exportStandardReport(kind: StandardReportKind, format: 'csv' | 'excel' | 'pdf', requestedBy: string): ExportPayload {
  const report = standardReport(kind, {}, requestedBy);
  const title = STANDARD_TITLES[kind] ?? kind;
  return buildExport(title, report.columns, report.rows, format);
}

export function exportSavedReport(id: string, format: 'csv' | 'excel' | 'pdf', viewer: { userId: string; name: string; role: string }): ExportPayload {
  const saved = getSavedReport(id, viewer);
  const result = runAdHocReport(saved as unknown as SavedReportBody);
  const columns = [
    { key: 'group', labelBn: 'গ্রুপ' },
    { key: 'count', labelBn: 'সংখ্যা' },
    { key: 'metric', labelBn: saved.metric === 'count' ? 'গণনা' : saved.metric === 'sum' ? 'যোগফল' : 'গড়' },
  ];
  const rows = result.rows.map((r) => ({ group: r.group, count: r.count, metric: r.metric }));
  return buildExport(saved.name, columns, rows, format);
}

function buildExport(title: string, columns: { key: string; labelBn: string }[], rows: Record<string, unknown>[], format: 'csv' | 'excel' | 'pdf'): ExportPayload {
  const safe = title.replace(/[^\p{L}\p{N}\-_ ]/gu, '').trim() || 'report';
  if (format === 'csv') {
    return { filename: `${safe}.csv`, contentType: 'text/csv; charset=utf-8', body: toCsv(columns, rows) };
  }
  if (format === 'excel') {
    return { filename: `${safe}.xls`, contentType: 'application/vnd.ms-excel; charset=utf-8', body: toExcelXml(safe, columns, rows) };
  }
  return { filename: `${safe}.html`, contentType: 'text/html; charset=utf-8', body: toPrintHtml(title, columns, rows, 'স্যামিটি ডেমো সমবায় সমিতি') };
}

/* ── 7) Schedules + free SMTP delivery ────────────────────────────────────── */

export function listSchedules(): ExportSchedule[] {
  return [...misOpsStore().schedules];
}

export function createSchedule(body: ExportScheduleBody, viewer: { userId: string; name: string }): ExportSchedule & { smtpConfigured: boolean } {
  const store = misOpsStore();
  const now = new Date().toISOString();
  const rec: ExportSchedule = {
    id: randomUUID(),
    orgId: store.orgId,
    ...body,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    createdBy: viewer.name,
    createdAt: now,
  };
  store.schedules.push(rec);
  return { ...rec, smtpConfigured: !!smtpFromEnv(process.env as Record<string, string | undefined>) };
}

export function deleteSchedule(id: string, viewer: { userId: string; name: string; role: string }): void {
  const store = misOpsStore();
  const idx = store.schedules.findIndex((x) => x.id === id);
  if (idx === -1) err(404, 'NOT_FOUND', 'শিডিউল নেই / Schedule not found');
  const s = store.schedules[idx]!;
  if (s.createdBy !== viewer.name && !['super_admin', 'org_admin'].includes(viewer.role)) {
    err(403, 'FORBIDDEN', 'শুধু নির্মাতা মুছতে পারেন / Only the creator may delete');
  }
  store.schedules.splice(idx, 1);
}

/** Minimal SMTP client (no dependency): EHLO → AUTH LOGIN → MAIL FROM → RCPT → DATA → QUIT. */
export function sendMail(cfg: { host: string; port: number; secure: boolean; user: string; pass: string; from: string }, to: string[], subject: string, body: string, attachment?: { filename: string; content: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket: net.Socket = cfg.secure
      ? tls.connect({ host: cfg.host, port: cfg.port, rejectUnauthorized: false })
      : net.connect({ host: cfg.host, port: cfg.port });
    socket.setTimeout(10_000);
    let buffer = '';
    let step = 0;
    const boundary = '----mis-boundary-' + randomUUID().slice(0, 8);

    const fail = (e: Error) => {
      socket.destroy();
      reject(e);
    };

    const readCode = (): number => {
      const lines = buffer.split('\r\n').filter((l) => l.length > 3);
      const last = lines[lines.length - 1] ?? '';
      return Number(last.slice(0, 3));
    };

    const send = (line: string) => {
      socket.write(line + '\r\n');
    };

    const buildMessage = (): string => {
      const att = attachment
        ? [
            `--${boundary}`,
            `Content-Type: text/plain; charset=utf-8`,
            `Content-Disposition: attachment; filename="${attachment.filename}"`,
            `Content-Transfer-Encoding: 8bit`,
            '',
            attachment.content,
            '',
          ].join('\r\n')
        : '';
      return [
        `From: ${cfg.from}`,
        `To: ${to.join(', ')}`,
        `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
        'MIME-Version: 1.0',
        attachment ? `Content-Type: multipart/mixed; boundary="${boundary}"` : 'Content-Type: text/plain; charset=utf-8',
        '',
        attachment ? `--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n${att}--${boundary}--` : body,
      ].join('\r\n');
    };

    const nextStep = () => {
      const code = readCode();
      step += 1;
      if (step === 1) {
        if (code !== 220) return fail(new Error(`SMTP greeting ${code}`));
        send('EHLO samity-manager');
      } else if (step === 2) {
        if (code >= 500) return fail(new Error(`EHLO failed ${code}`));
        send('AUTH LOGIN');
      } else if (step === 3) {
        if (code !== 334) return fail(new Error(`AUTH not offered (${code})`));
        send(Buffer.from(cfg.user).toString('base64'));
      } else if (step === 4) {
        if (code !== 334) return fail(new Error(`AUTH user rejected (${code})`));
        send(Buffer.from(cfg.pass).toString('base64'));
      } else if (step === 5) {
        if (code !== 235) return fail(new Error(`AUTH failed (${code})`));
        send(`MAIL FROM:<${cfg.from}>`);
      } else if (step === 6) {
        if (code !== 250) return fail(new Error(`MAIL FROM rejected (${code})`));
        send(`RCPT TO:<${to[0]!}>`);
      } else if (step === 7) {
        if (code !== 250) return fail(new Error(`RCPT rejected (${code})`));
        for (const r of to.slice(1)) send(`RCPT TO:<${r}>`);
        send('DATA');
      } else if (step === 8) {
        if (code !== 354) return fail(new Error(`DATA rejected (${code})`));
        send(buildMessage());
        send('.');
      } else if (step === 9) {
        if (code !== 250) return fail(new Error(`Message rejected (${code})`));
        send('QUIT');
        socket.end();
        resolve();
      }
    };

    socket.on('data', (d) => {
      buffer += d.toString();
      if (buffer.includes('\r\n')) {
        const pending = buffer;
        buffer = '';
        void pending;
        try {
          nextStep();
        } catch (e) {
          fail(e as Error);
        }
      }
    });
    socket.on('error', fail);
    socket.on('timeout', () => fail(new Error('SMTP timeout')));
  });
}

/**
 * Run every schedule that is due. With SMTP configured it sends real email;
 * without SMTP the schedule is recorded with an 'error' status so the UI can
 * show why nothing landed (free-SMTP creds come from env only).
 */
export async function runDueSchedules(today: string): Promise<{ run: number; sent: number; failed: number; skippedNoSmtp: number }> {
  const store = misOpsStore();
  const cfg = smtpFromEnv(process.env as Record<string, string | undefined>);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let run = 0;

  for (const s of store.schedules) {
    if (!isScheduleDue(s, today)) continue;
    run += 1;
    const payload =
      s.kind === 'standard_report'
        ? exportStandardReport(s.reportId as StandardReportKind, s.format, 'cron')
        : (() => {
            const saved = store.savedReports.find((r) => r.id === s.reportId);
            if (!saved) return null;
            return exportSavedReport(saved.id, s.format, { userId: saved.ownerUserId, name: saved.ownerName, role: 'super_admin' });
          })();
    if (!payload) {
      s.lastRunAt = new Date().toISOString();
      s.lastStatus = 'error';
      s.lastError = 'report not found';
      failed += 1;
      continue;
    }
    if (!cfg) {
      s.lastRunAt = new Date().toISOString();
      s.lastStatus = 'error';
      s.lastError = 'smtp-not-configured';
      skipped += 1;
      store.deliveries.push({ id: randomUUID(), scheduleId: s.id, sentAt: s.lastRunAt, status: 'error', recipients: [...s.recipients], error: 'smtp-not-configured' });
      continue;
    }
    try {
      await sendMail(
        cfg,
        s.recipients,
        deliveryEmailSubjectBn(s.name, today, today),
        deliveryEmailBodyBn(s.name, 0, 'স্যামিটি ডেমো সমবায় সমিতি'),
        { filename: payload.filename, content: payload.body },
      );
      s.lastRunAt = new Date().toISOString();
      s.lastStatus = 'ok';
      s.lastError = null;
      sent += 1;
      store.deliveries.push({ id: randomUUID(), scheduleId: s.id, sentAt: s.lastRunAt, status: 'ok', recipients: [...s.recipients], error: null });
    } catch (e) {
      s.lastRunAt = new Date().toISOString();
      s.lastStatus = 'error';
      s.lastError = (e as Error).message.slice(0, 200);
      failed += 1;
      store.deliveries.push({ id: randomUUID(), scheduleId: s.id, sentAt: s.lastRunAt, status: 'error', recipients: [...s.recipients], error: s.lastError });
    }
  }
  return { run, sent, failed, skippedNoSmtp: skipped };
}

/** "Run now" for one schedule, regardless of the due date (forces even if already run today). */
export async function runScheduleNow(id: string): Promise<{ status: 'ok' | 'error'; error: string | null; lastRunAt: string }> {
  const store = misOpsStore();
  const s = store.schedules.find((x) => x.id === id);
  if (!s) err(404, 'NOT_FOUND', `শিডিউল পাওয়া যায়নি / Schedule not found: ${id}`);
  const cfg = smtpFromEnv(process.env as Record<string, string | undefined>);
  const payload =
    s!.kind === 'standard_report'
      ? exportStandardReport(s!.reportId as StandardReportKind, s!.format, 'manual')
      : (() => {
          const saved = store.savedReports.find((r) => r.id === s!.reportId);
          if (!saved) return null;
          return exportSavedReport(saved.id, s!.format, { userId: saved.ownerUserId, name: saved.ownerName, role: 'super_admin' });
        })();
  if (!payload) {
    s!.lastRunAt = new Date().toISOString();
    s!.lastStatus = 'error';
    s!.lastError = 'report not found';
    return { status: 'error', error: s!.lastError, lastRunAt: s!.lastRunAt! };
  }
  if (!cfg) {
    s!.lastRunAt = new Date().toISOString();
    s!.lastStatus = 'error';
    s!.lastError = 'smtp-not-configured';
    store.deliveries.push({ id: randomUUID(), scheduleId: s!.id, sentAt: s!.lastRunAt, status: 'error', recipients: [...s!.recipients], error: 'smtp-not-configured' });
    return { status: 'error', error: s!.lastError, lastRunAt: s!.lastRunAt! };
  }
  try {
    await sendMail(cfg, s!.recipients, deliveryEmailSubjectBn(s!.name, new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)), deliveryEmailBodyBn(s!.name, 0, 'স্যামিটি ডেমো সমবায় সমিতি'), { filename: payload.filename, content: payload.body });
    s!.lastRunAt = new Date().toISOString();
    s!.lastStatus = 'ok';
    s!.lastError = null;
    store.deliveries.push({ id: randomUUID(), scheduleId: s!.id, sentAt: s!.lastRunAt, status: 'ok', recipients: [...s!.recipients], error: null });
    return { status: 'ok', error: null, lastRunAt: s!.lastRunAt! };
  } catch (e) {
    s!.lastRunAt = new Date().toISOString();
    s!.lastStatus = 'error';
    s!.lastError = (e as Error).message.slice(0, 200);
    store.deliveries.push({ id: randomUUID(), scheduleId: s!.id, sentAt: s!.lastRunAt, status: 'error', recipients: [...s!.recipients], error: s!.lastError });
    return { status: 'error', error: s!.lastError, lastRunAt: s!.lastRunAt! };
  }
}

/* ═══════════════════ 9) Month freeze ═══════════════════════════════════════ */

export function listFreezes(): MonthFreeze[] {
  return [...misOpsStore().freezes].sort((a, b) => b.month.localeCompare(a.month));
}

export function freezeMonth(body: MonthFreezeBody, viewer: { name: string; role: string }, status: 'soft' | 'hard'): MonthFreeze {
  if (!['super_admin', 'org_admin'].includes(viewer.role)) {
    err(403, 'FORBIDDEN', 'মাস হিমায়িত শুধু অ্যাডমিন করেন / Only admins freeze months');
  }
  const store = misOpsStore();
  const existing = store.freezes.find((f) => f.month === body.month);
  if (existing) err(409, 'CONFLICT', `মাস ${body.month} ইতিমধ্যে হিমায়িত / Month already frozen`);
  const rec: MonthFreeze = {
    id: randomUUID(),
    orgId: store.orgId,
    month: body.month,
    status,
    frozenBy: viewer.name,
    frozenAt: new Date().toISOString(),
    note: body.note,
  };
  store.freezes.push(rec);
  return rec;
}

export function unfreezeMonth(month: string, viewer: { name: string; role: string }): void {
  if (!['super_admin', 'org_admin'].includes(viewer.role)) {
    err(403, 'FORBIDDEN', 'আনহিমায়িত শুধু অ্যাডমিন / Only admins unfreeze');
  }
  const store = misOpsStore();
  const idx = store.freezes.findIndex((f) => f.month === month);
  if (idx === -1) err(404, 'NOT_FOUND', 'হিমায়িত মাস নেই / Month not frozen');
  store.freezes.splice(idx, 1);
}

/** Guard used by write endpoints: rejects writes into hard-frozen months. */
export function assertNotFrozen(date: string): void {
  const fz = freezeCheck(misOpsStore().freezes, date);
  if (fz.frozen && fz.mode === 'hard') err(409, 'ALREADY_CLOSED', FREEZE_MESSAGES_BN.hard);
}

/* ═══════════════════ 8) Matview stats (demo surface) ═══════════════════════ */

export interface MatviewStats {
  views: { name: string; labelBn: string; descriptionBn: string; rows: number; refreshMode: string }[];
  refreshSql: string;
  lastRefreshAt: string | null;
  indexes: { table: string; index: string; columns: string; purposeBn: string }[];
}

/** In demo mode the matviews are emulated from the live snapshot; the SQL in
 *  0050 defines the real Supabase objects refreshed by refresh_mis_matviews(). */
export function matviewStats(): MatviewStats {
  const s = buildSnapshot(new Date().toISOString().slice(0, 10));
  const byBranch = new Map<string, number>();
  for (const l of s.loans) byBranch.set(l.branchId, (byBranch.get(l.branchId) ?? 0) + num(l.outstanding));
  const complaintRows = misOpsStore().complaints.length;
  return {
    views: [
      { name: 'mv_branch_portfolio_daily', labelBn: 'শাখা পোর্টফোলিও (দৈনিক)', descriptionBn: 'শাখা-ভিত্তিক বকেয়া, ঋণ সংখ্যা, PAR — রাতে রিফ্রেশ', rows: byBranch.size, refreshMode: 'nightly (concurrently)' },
      { name: 'mv_officer_productivity_monthly', labelBn: 'কর্মী উৎপাদনশীলতা (মাসিক)', descriptionBn: 'কর্মী-ভিত্তিক আদায় দক্ষতা ও ঋণগ্রহীতা', rows: s.staff.length, refreshMode: 'nightly (concurrently)' },
      { name: 'mv_savings_position_daily', labelBn: 'সঞ্চয় অবস্থান (দৈনিক)', descriptionBn: 'শাখা/পণ্য-ভিত্তিক সঞ্চয় জমা', rows: s.savings.byType.length, refreshMode: 'nightly (concurrently)' },
      { name: 'mv_complaint_sla_daily', labelBn: 'অভিযোগ এসএলএ (দৈনিক)', descriptionBn: 'খোলা/সমাধা অভিযোগ, গড় সমাধান দিন', rows: complaintRows, refreshMode: 'nightly (concurrently)' },
    ],
    refreshSql: 'select refresh_mis_matviews();  -- pg_cron: 0 2 * * *',
    lastRefreshAt: new Date().toISOString(),
    indexes: [],
  };
}
