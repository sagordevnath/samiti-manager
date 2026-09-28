/**
 * ── Reports/MIS operations (reqs 5–10) ───────────────────────────────────────
 * 5) Client-protection indicators (complaints, resolution time, overlap,
 *    repayment stress), 6) ad-hoc report builder (dataset, filters, group-by,
 *    chart type, saved + role-shared), 7) exports (CSV, Excel-compatible XML
 *    workbook, print-PDF HTML with Bangla fonts) and scheduled email delivery
 *    over free SMTP, 8) nightly materialized-view refresh + documented
 *    indexes, 9) data freeze — closed months are immutable, 10) complaint &
 *    grievance register with escalation.
 *
 * Money is string numeric(14,2); helpers are pure so API, DB and UI share one
 * implementation.
 */
import { z } from 'zod';
import { uuidSchema } from './schemas.js';
import { toBanglaDigits } from './format.js';
import { num } from './work.js';

/* ═══════════════════ 5) Client protection indicators ═══════════════════════ */

export interface ComplaintRecord {
  id: string;
  orgId: string;
  ticketNo: string; // CMP-0001
  channel: 'branch' | 'hotline' | 'field_visit' | 'whistlebox' | 'regulator';
  category: 'product_transparency' | 'overcharging' | 'staff_behaviour' | 'coercive_collection' | 'privacy' | 'delay' | 'other';
  status: 'open' | 'in_progress' | 'escalated' | 'resolved' | 'rejected';
  severity: 'low' | 'medium' | 'high' | 'critical';
  subject: string;
  details: string;
  memberId: string | null;
  memberName: string;
  branchId: string | null;
  reportedAt: string;
  /** SLA: 3 working days baseline, 1 day for critical. */
  dueAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string;
  /** Escalation trail (10). */
  escalations: { level: 'branch_manager' | 'area_manager' | 'head_office' | 'board'; at: string; note: string }[];
  createdAt: string;
  updatedAt: string;
}

export const COMPLAINT_CATEGORIES = [
  'product_transparency',
  'overcharging',
  'staff_behaviour',
  'coercive_collection',
  'privacy',
  'delay',
  'other',
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];

export const COMPLAINT_CATEGORY_LABELS_BN: Record<ComplaintCategory, string> = {
  product_transparency: 'পণ্যের স্বচ্ছতা',
  overcharging: 'অতিরিক্ত চার্জ',
  staff_behaviour: 'কর্মীর আচরণ',
  coercive_collection: 'জোরপূর্বক আদায়',
  privacy: 'গোপনীয়তা',
  delay: 'বিলম্ব',
  other: 'অন্যান্য',
};

export const COMPLAINT_CHANNEL_LABELS_BN: Record<ComplaintRecord['channel'], string> = {
  branch: 'শাখা',
  hotline: 'হটলাইন',
  field_visit: 'মাঠ পরিদর্শন',
  whistlebox: 'হুইসেল বক্স',
  regulator: 'নিয়ন্ত্রক',
};

export const COMPLAINT_STATUS_LABELS_BN: Record<ComplaintRecord['status'], string> = {
  open: 'খোলা',
  in_progress: 'চলমান',
  escalated: 'উর্ধ্বতনে',
  resolved: 'সমাধান',
  rejected: 'প্রত্যাখ্যাত',
};

export const COMPLAINT_SEVERITY_LABELS_BN: Record<ComplaintRecord['severity'], string> = {
  low: 'কম',
  medium: 'মধ্যম',
  high: 'উচ্চ',
  critical: 'অতি জরুরি',
};

export const complaintCreateSchema = z.object({
  channel: z.enum(['branch', 'hotline', 'field_visit', 'whistlebox', 'regulator']),
  category: z.enum(COMPLAINT_CATEGORIES),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  subject: z.string().trim().min(3).max(200),
  details: z.string().trim().max(2000).default(''),
  memberId: uuidSchema.nullable().default(null),
  memberName: z.string().trim().min(2).max(120),
  branchId: uuidSchema.nullable().default(null),
  reportedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ComplaintCreateBody = z.infer<typeof complaintCreateSchema>;

export const complaintActionSchema = z.object({
  action: z.enum(['acknowledge', 'progress', 'escalate', 'resolve', 'reject']),
  note: z.string().trim().max(500).default(''),
  /** Actual resolution date when recording an on-site resolution after the fact. */
  resolvedOn: z.string().date().optional(),
});
export type ComplaintActionBody = z.infer<typeof complaintActionSchema>;

export function nextComplaintTicket(seq: number): string {
  return `CMP-${String(seq).padStart(4, '0')}`;
}

/** SLA deadline: critical = next day, else +3 days. */
export function complaintDueAt(reportedAt: string, severity: ComplaintRecord['severity']): string {
  const days = severity === 'critical' ? 1 : 3;
  const d = new Date(Date.parse(`${reportedAt}T00:00:00Z`) + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Escalation ladder (10): severity-based level after each 'escalate' action. */
export const ESCALATION_LADDER = ['branch_manager', 'area_manager', 'head_office', 'board'] as const;
export type EscalationLevel = (typeof ESCALATION_LADDER)[number];

/** Next rung = one above the highest level already reached; critical skips branch. */
export function nextEscalationLevel(complaint: Pick<ComplaintRecord, 'escalations' | 'severity'>): EscalationLevel {
  const maxIdx = complaint.escalations.reduce((max, e) => Math.max(max, ESCALATION_LADDER.indexOf(e.level)), -1);
  const base = maxIdx < 0 ? (complaint.severity === 'critical' ? 1 : 0) : maxIdx + 1;
  return ESCALATION_LADDER[Math.min(base, ESCALATION_LADDER.length - 1)]!;
}

export const ESCALATION_LEVEL_LABELS_BN: Record<EscalationLevel, string> = {
  branch_manager: 'শাখা ব্যবস্থাপক',
  area_manager: 'এলাকা ব্যবস্থাপক',
  head_office: 'প্রধান কার্যালয়',
  board: 'বোর্ড',
};

/** Complaint action state machine (mirrors the DB trigger in 0050).
 * Escalated complaints can escalate further up the ladder (or be resolved). */
export function canTransitionComplaint(from: ComplaintRecord['status'], to: ComplaintRecord['status']): boolean {
  if (from === 'resolved' || from === 'rejected') return false; // terminal
  if (from === to) return from === 'escalated'; // escalate→escalate climbs the ladder
  return ['in_progress', 'escalated', 'resolved', 'rejected'].includes(to);
}

/* ── 5) Client-protection indicator rollup ────────────────────────────────── */

export interface ClientProtectionIndicators {
  complaintsTotal: number;
  complaintsOpen: number;
  /** Median + average resolution days of resolved complaints in the period. */
  resolutionDaysAvg: number;
  resolutionDaysMedian: number;
  /** Share resolved within SLA (dueAt). */
  slaCompliancePct: number;
  /** Complaints per 1,000 active borrowers. */
  complaintsPer1000Borrowers: number;
  /** Overlap: complaints whose member also appears in another open complaint. */
  overlapCases: number;
  /** Repayment-stress cases: overdue borrowers with an open complaint. */
  repaymentStressCases: number;
  byCategory: { category: ComplaintCategory; count: number; open: number }[];
  byBranch: { branchName: string; count: number; open: number; escalated: number }[];
}

export function clientProtectionIndicators(
  complaints: Pick<ComplaintRecord, 'status' | 'severity' | 'category' | 'reportedAt' | 'dueAt' | 'resolvedAt' | 'memberId' | 'escalations' | 'branchId'>[],
  opts: { borrowers: number; branches: { id: string; name: string }[]; overdueMemberIds: Set<string>; periodStart?: string; periodEnd?: string },
): ClientProtectionIndicators {
  let rows = complaints;
  if (opts.periodStart) rows = rows.filter((c) => c.reportedAt >= opts.periodStart!);
  if (opts.periodEnd) rows = rows.filter((c) => c.reportedAt <= opts.periodEnd!);

  const resolved = rows.filter((c) => c.status === 'resolved' && c.resolvedAt);
  const days = resolved.map((c) => Math.max(0, Math.round((Date.parse(`${c.resolvedAt!.slice(0, 10)}T00:00:00Z`) - Date.parse(`${c.reportedAt}T00:00:00Z`)) / 86_400_000)));
  const slaOk = resolved.filter((c) => c.resolvedAt!.slice(0, 10) <= c.dueAt).length;

  const openMemberIds = new Set(rows.filter((c) => !['resolved', 'rejected'].includes(c.status) && c.memberId).map((c) => c.memberId!));
  const memberCounts = new Map<string, number>();
  for (const c of rows) {
    if (c.memberId) memberCounts.set(c.memberId, (memberCounts.get(c.memberId) ?? 0) + 1);
  }
  const overlap = [...memberCounts.values()].filter((n) => n > 1).length;

  const stressIds = new Set(rows.filter((c) => !['resolved', 'rejected'].includes(c.status) && c.memberId && opts.overdueMemberIds.has(c.memberId)).map((c) => c.memberId!));

  const byCategory = COMPLAINT_CATEGORIES.map((category) => {
    const cat = rows.filter((c) => c.category === category);
    return { category, count: cat.length, open: cat.filter((c) => !['resolved', 'rejected'].includes(c.status)).length };
  }).filter((c) => c.count > 0);

  const byBranch = opts.branches.map((b) => {
    const br = rows.filter((c) => c.branchId === b.id);
    return { branchName: b.name, count: br.length, open: br.filter((c) => !['resolved', 'rejected'].includes(c.status)).length, escalated: br.filter((c) => c.status === 'escalated').length };
  });

  const avg = days.length ? days.reduce((s, d) => s + d, 0) / days.length : 0;
  const sorted = [...days].sort((a, b) => a - b);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2) : 0;

  return {
    complaintsTotal: rows.length,
    complaintsOpen: rows.filter((c) => ['open', 'in_progress', 'escalated'].includes(c.status)).length,
    resolutionDaysAvg: Number(avg.toFixed(1)),
    resolutionDaysMedian: median,
    slaCompliancePct: resolved.length ? Number(((slaOk / resolved.length) * 100).toFixed(1)) : 100,
    complaintsPer1000Borrowers: opts.borrowers > 0 ? Number(((rows.length / opts.borrowers) * 1000).toFixed(2)) : 0,
    overlapCases: overlap,
    repaymentStressCases: stressIds.size,
    byCategory,
    byBranch,
  };
}

/* ═══════════════════ 6) Ad-hoc report builder ══════════════════════════════ */

export const BUILDER_DATASETS = ['loans', 'savings', 'collections', 'complaints', 'members'] as const;
export type BuilderDataset = (typeof BUILDER_DATASETS)[number];

export const BUILDER_DATASET_LABELS_BN: Record<BuilderDataset, string> = {
  loans: 'ঋণ',
  savings: 'সঞ্চয়',
  collections: 'আদায়',
  complaints: 'অভিযোগ',
  members: 'সদস্য',
};

export const CHART_TYPES = ['table', 'bar', 'line', 'pie'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const CHART_TYPE_LABELS_BN: Record<ChartType, string> = {
  table: 'টেবিল',
  bar: 'বার',
  line: 'লাইন',
  pie: 'পাই',
};

/** Comparison operators for dataset fields. */
export const FILTER_OPS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains'] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export interface BuilderFilter {
  field: string;
  op: FilterOp;
  value: string;
}

export interface SavedReport {
  id: string;
  orgId: string;
  name: string;
  dataset: BuilderDataset;
  /** Field definitions come from DATASET_FIELDS; values validated at run time. */
  filters: BuilderFilter[];
  groupBy: string;
  metric: 'count' | 'sum' | 'avg';
  metricField: string | null;
  chartType: ChartType;
  /** Sharing: owner always; listed roles may run it. */
  sharedWithRoles: string[];
  ownerUserId: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
}

export const savedReportSchema = z.object({
  name: z.string().trim().min(2).max(120),
  dataset: z.enum(BUILDER_DATASETS),
  filters: z
    .array(
      z.object({
        field: z.string().trim().min(1).max(60),
        op: z.enum(FILTER_OPS),
        value: z.string().trim().max(120),
      }),
    )
    .max(10)
    .default([]),
  groupBy: z.string().trim().min(1).max(60),
  metric: z.enum(['count', 'sum', 'avg']).default('count'),
  metricField: z.string().trim().max(60).nullable().default(null),
  chartType: z.enum(CHART_TYPES).default('bar'),
  sharedWithRoles: z.array(z.string().trim().max(30)).max(10).default([]),
});
export type SavedReportBody = z.infer<typeof savedReportSchema>;

/** Apply one filter row to a numeric or string value. */
export function applyFilter(value: string | number | boolean | null, op: FilterOp, raw: string): boolean {
  const sv = value === null ? '' : String(value);
  const nv = Number(sv);
  const nr = Number(raw);
  switch (op) {
    case 'eq': return Number.isFinite(nv) && Number.isFinite(nr) ? nv === nr : sv === raw;
    case 'neq': return !(Number.isFinite(nv) && Number.isFinite(nr) ? nv === nr : sv === raw);
    case 'gt': return nv > nr;
    case 'gte': return nv >= nr;
    case 'lt': return nv < nr;
    case 'lte': return nv <= nr;
    case 'contains': return sv.toLowerCase().includes(raw.toLowerCase());
    default: return true;
  }
}

export interface BuilderRow {
  group: string;
  count: number;
  metric: number;
}

/** Group rows by a field and aggregate count/sum/avg of a metric field. */
export function buildReportRows(
  rows: Record<string, string | number | boolean | null>[],
  groupBy: string,
  metric: SavedReport['metric'],
  metricField: string | null,
): BuilderRow[] {
  const groups = new Map<string, { count: number; sum: number }>();
  for (const row of rows) {
    const key = String(row[groupBy] ?? '—');
    const g = groups.get(key) ?? { count: 0, sum: 0 };
    g.count += 1;
    if (metric !== 'count' && metricField) g.sum += Number(row[metricField] ?? 0);
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([group, g]) => ({
      group,
      count: g.count,
      metric: metric === 'avg' ? (g.count ? Number((g.sum / g.count).toFixed(2)) : 0) : metric === 'sum' ? Number(g.sum.toFixed(2)) : g.count,
    }))
    .sort((a, b) => b.metric - a.metric);
}

/** Field catalogue per dataset (drives the UI dropdowns). */
export const DATASET_FIELDS: Record<BuilderDataset, { fields: { key: string; labelBn: string; numeric: boolean }[] }> = {
  loans: {
    fields: [
      { key: 'branchName', labelBn: 'শাখা', numeric: false },
      { key: 'assetClass', labelBn: 'শ্রেণি', numeric: false },
      { key: 'productName', labelBn: 'পণ্য', numeric: false },
      { key: 'outstanding', labelBn: 'বকেয়া', numeric: true },
      { key: 'overdueTotal', labelBn: 'অপরিশোধিত', numeric: true },
      { key: 'daysPastDue', labelBn: 'বকেয়া দিন', numeric: true },
    ],
  },
  savings: {
    fields: [
      { key: 'branchName', labelBn: 'শাখা', numeric: false },
      { key: 'productType', labelBn: 'পণ্যের ধরন', numeric: false },
      { key: 'status', labelBn: 'অবস্থা', numeric: false },
      { key: 'balance', labelBn: 'জমা', numeric: true },
    ],
  },
  collections: {
    fields: [
      { key: 'officerName', labelBn: 'কর্মী', numeric: false },
      { key: 'branchName', labelBn: 'শাখা', numeric: false },
      { key: 'dueAmount', labelBn: 'প্রাপ্য', numeric: true },
      { key: 'collectedAmount', labelBn: 'আদায়', numeric: true },
    ],
  },
  complaints: {
    fields: [
      { key: 'branchName', labelBn: 'শাখা', numeric: false },
      { key: 'category', labelBn: 'ধরন', numeric: false },
      { key: 'status', labelBn: 'অবস্থা', numeric: false },
      { key: 'severity', labelBn: 'তীব্রতা', numeric: false },
      { key: 'channel', labelBn: 'চ্যানেল', numeric: false },
    ],
  },
  members: {
    fields: [
      { key: 'branchName', labelBn: 'শাখা', numeric: false },
      { key: 'samityName', labelBn: 'সমিতি', numeric: false },
      { key: 'active', labelBn: 'চলমান', numeric: false },
    ],
  },
};

/** Can this viewer run the saved report? Owner, shared role, or org admin. */
export function canRunSavedReport(r: Pick<SavedReport, 'ownerUserId' | 'sharedWithRoles'>, viewer: { userId: string; role: string }): boolean {
  if (r.ownerUserId === viewer.userId) return true;
  if (['super_admin', 'org_admin'].includes(viewer.role)) return true;
  return r.sharedWithRoles.includes(viewer.role);
}

/* ═══════════════════ 7) Exports & scheduled delivery ═══════════════════════ */

/** RFC-4180 CSV with BOM so Excel opens Bangla correctly. */
export function toCsv(columns: { key: string; labelBn: string }[], rows: Record<string, unknown>[], includeBom = true): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.labelBn)).join(',');
  const body = rows.map((r) => columns.map((c) => esc(r[c.key])).join(',')).join('\n');
  return (includeBom ? '\uFEFF' : '') + head + '\n' + body;
}

/**
 * Excel 2003 XML SpreadsheetML workbook (opens natively in Excel/WPS/LibreOffice;
 * no dependency needed). Bangla is carried as UTF-8 text cells.
 */
export function toExcelXml(sheetName: string, columns: { key: string; labelBn: string }[], rows: Record<string, unknown>[]): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    const isNum = /^-?\d+(\.\d+)?$/.test(s) && s.trim() !== '';
    return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${esc(s)}</Data></Cell>`;
  };
  const header = `<Row>${columns.map((c) => `<Cell ss:StyleID="hdr"><Data ss:Type="String">${esc(c.labelBn)}</Data></Cell>`).join('')}</Row>`;
  const body = rows.map((r) => `<Row>${columns.map((c) => cell(r[c.key])).join('')}</Row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="hdr"><Font ss:FontName="Nirmala UI" ss:Bold="1"/><Interior ss:Color="#E0F2F1" ss:Pattern="Solid"/></Style>
  <Style ss:ID="def"><Font ss:FontName="Nirmala UI"/></Style>
 </Styles>
 <Worksheet ss:Name="${esc(sheetName.slice(0, 30))}">
  <Table>${header}${body}</Table>
 </Worksheet>
</Workbook>`;
}

/** Print/PDF HTML with explicit Bangla font stack (browsers embed fonts on print). */
export function toPrintHtml(titleBn: string, columns: { key: string; labelBn: string }[], rows: Record<string, unknown>[], orgNameBn: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const head = columns.map((c) => `<th>${esc(c.labelBn)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${columns.map((c) => `<td>${esc(r[c.key] === null || r[c.key] === undefined ? '' : String(r[c.key]))}</td>`).join('')}</tr>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="bn"><head><meta charset="utf-8"/><title>${esc(titleBn)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  body { font-family: 'Noto Sans Bengali','Nirmala UI','SolaimanLipi','Vrinda',sans-serif; }
  h1 { text-align: center; color: #0f766e; font-size: 18px; margin: 0; }
  h2 { text-align: center; font-size: 14px; margin: 4px 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #94a3b8; padding: 4px 6px; text-align: left; }
  th { background: #f0fdfa; }
  tfoot { font-weight: bold; background: #f0fdfa; }
</style></head>
<body>
<h1>${esc(orgNameBn)}</h1>
<h2>${esc(titleBn)}</h2>
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body></html>`;
}

/* ── 7) Scheduled email delivery (free SMTP: Gmail/Brevo/Zoho free tier) ──── */

export const SCHEDULE_FREQUENCIES = ['daily', 'weekly', 'monthly'] as const;
export type ScheduleFrequency = (typeof SCHEDULE_FREQUENCIES)[number];

export const SCHEDULE_FREQUENCY_LABELS_BN: Record<ScheduleFrequency, string> = {
  daily: 'প্রতিদিন',
  weekly: 'সাপ্তাহিক',
  monthly: 'মাসিক',
};

export interface ExportSchedule {
  id: string;
  orgId: string;
  name: string;
  /** What to deliver: a saved report id, or a standard report kind. */
  kind: 'saved_report' | 'standard_report';
  reportId: string; // SavedReport id or StandardReportKind
  format: 'csv' | 'excel' | 'pdf';
  frequency: ScheduleFrequency;
  /** For weekly: 1=Mon..7=Sun; for monthly: day of month 1..28. */
  runOn: number;
  recipients: string[];
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: 'ok' | 'error' | null;
  lastError: string | null;
  createdBy: string;
  createdAt: string;
}

export const exportScheduleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['saved_report', 'standard_report']),
  reportId: z.string().trim().min(1).max(60),
  format: z.enum(['csv', 'excel', 'pdf']),
  frequency: z.enum(SCHEDULE_FREQUENCIES),
  runOn: z.coerce.number().int().min(1).max(28).default(1),
  recipients: z.array(z.string().trim().email('অবৈধ ইমেইল / Invalid email')).min(1).max(10),
  enabled: z.boolean().default(true),
});
export type ExportScheduleBody = z.infer<typeof exportScheduleSchema>;

/** Is the schedule due at `today` (UTC date)? Pure so the cron can call it. */
export function isScheduleDue(s: Pick<ExportSchedule, 'frequency' | 'runOn' | 'enabled' | 'lastRunAt'>, today: string): boolean {
  if (!s.enabled) return false;
  if (s.lastRunAt && s.lastRunAt.slice(0, 10) >= today) return false; // already ran today
  const d = new Date(`${today}T00:00:00Z`);
  const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1=Mon..7=Sun
  const dom = d.getUTCDate();
  if (s.frequency === 'daily') return true;
  if (s.frequency === 'weekly') return dow === s.runOn;
  return dom === s.runOn;
}

/** Free-SMTP configuration (env-driven; creds never stored in the DB). */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export function smtpFromEnv(env: Record<string, string | undefined>): SmtpConfig | null {
  const host = env['SMTP_HOST'];
  const user = env['SMTP_USER'];
  const pass = env['SMTP_PASS'];
  if (!host || !user || !pass) return null;
  const port = Number(env['SMTP_PORT'] ?? '587');
  return { host, port: Number.isFinite(port) ? port : 587, secure: port === 465, user, pass, from: env['SMTP_FROM'] ?? user };
}

export const SMTP_MISSING_MESSAGE =
  'SMTP কনফিগার করা হয়নি (SMTP_HOST/SMTP_USER/SMTP_PASS) — শিডিউল সংরক্ষিত হয়েছে, ইমেইল পাঠানো হবে যখন কনফিগ পাওয়া যাবে।';

/** Subject/body for a delivery (Bangla). */
export function deliveryEmailSubjectBn(name: string, periodStart: string, periodEnd: string): string {
  return `${name} — ${toBanglaDigits(periodStart)} থেকে ${toBanglaDigits(periodEnd)}`;
}

export function deliveryEmailBodyBn(name: string, rowCount: number, orgNameBn: string): string {
  return [
    `${orgNameBn}`,
    '',
    `প্রতিবেদন: ${name}`,
    `সারি সংখ্যা: ${toBanglaDigits(String(rowCount))}`,
    '',
    'স্বয়ংক্রিয় ইমেইল — স্যামিটি ম্যানেজার এমআইএস',
  ].join('\n');
}

/* ═══════════════════ 8) Materialized views & indexes (docs) ════════════════ */

/** Names + definitions of the nightly-refreshed materialized views. */
export const MIS_MATVIEWS = [
  {
    name: 'mv_branch_portfolio_daily',
    labelBn: 'শাখা পোর্টফোলিও (দৈনিক)',
    descriptionBn: 'শাখা-ভিত্তিক বকেয়া, ঋণ সংখ্যা, PAR — রাতে রিফ্রেশ',
    sqlRef: '0050_reports_mis_ops.sql',
  },
  {
    name: 'mv_officer_productivity_monthly',
    labelBn: 'কর্মী উৎপাদনশীলতা (মাসিক)',
    descriptionBn: 'কর্মী-ভিত্তিক আদায় দক্ষতা ও ঋণগ্রহীতা',
    sqlRef: '0050_reports_mis_ops.sql',
  },
  {
    name: 'mv_savings_position_daily',
    labelBn: 'সঞ্চয় অবস্থান (দৈনিক)',
    descriptionBn: 'শাখা/পণ্য-ভিত্তিক সঞ্চয় জমা',
    sqlRef: '0050_reports_mis_ops.sql',
  },
  {
    name: 'mv_complaint_sla_daily',
    labelBn: 'অভিযোগ এসএলএ (দৈনিক)',
    descriptionBn: 'খোলা/সমাধা অভিযোগ, গড় সমাধান দিন',
    sqlRef: '0050_reports_mis_ops.sql',
  },
] as const;

/** Refresh cadence documented for the nightly job (pg_cron or app cron). */
export const MATVIEW_REFRESH_SQL = `-- Nightly (after the delinquency classification job):
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_branch_portfolio_daily;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_officer_productivity_monthly;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_savings_position_daily;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_complaint_sla_daily;`;

/** Index catalogue surfaced in the UI (docs-as-code, req 8). */
export const MIS_INDEX_DOCS = [
  { table: 'loans', index: 'idx_loans_org_branch_status', columns: 'org_id, branch_id, status', purposeBn: 'শাখা পোর্টফোলিও স্ক্যান' },
  { table: 'loan_repayments', index: 'idx_repayments_due_date', columns: 'org_id, due_date', purposeBn: 'বয়স্করণ ও আদায় রিপোর্ট' },
  { table: 'savings_accounts', index: 'idx_savings_org_branch_product', columns: 'org_id, branch_id, product_id', purposeBn: 'সঞ্চয় অবস্থান' },
  { table: 'savings_transactions', index: 'idx_savings_tx_account_created', columns: 'account_id, created_at', purposeBn: 'পাসবুক ও জমা-উতোল' },
  { table: 'vouchers', index: 'idx_vouchers_org_date', columns: 'org_id, voucher_date', purposeBn: 'আর্থিক রিপোর্ট পর্ব-স্ক্যান' },
  { table: 'complaints', index: 'idx_complaints_org_status_reported', columns: 'org_id, status, reported_at desc', purposeBn: 'ক্লায়েন্ট প্রোটেকশন সূচক' },
  { table: 'complaints', index: 'idx_complaints_member', columns: 'member_id', purposeBn: 'ওভারল্যাপ শনাক্তকরণ' },
  { table: 'project_expenses', index: 'idx_expenses_project', columns: 'org_id, project_id, expense_date', purposeBn: 'বাজেট নিরীক্ষা' },
] as const;

/* ═══════════════════ 9) Data freeze ════════════════════════════════════════ */

export type FreezeStatus = 'none' | 'soft' | 'hard';

export interface MonthFreeze {
  id: string;
  orgId: string;
  /** Frozen month 'YYYY-MM'. */
  month: string;
  status: FreezeStatus;
  /** soft: figures locked but corrections flagged; hard: fully immutable. */
  frozenBy: string;
  frozenAt: string;
  note: string;
}

export const monthFreezeSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'মাস ফরম্যাট YYYY-MM'),
  note: z.string().trim().max(300).default(''),
});
export type MonthFreezeBody = z.infer<typeof monthFreezeSchema>;

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Is `date` inside a frozen month?
 * hard → writes rejected; soft → writes allowed with a correction flag.
 */
export function freezeCheck(freezes: Pick<MonthFreeze, 'month' | 'status'>[], date: string): { frozen: boolean; mode: FreezeStatus; month: string | null } {
  const m = monthOf(date);
  const f = freezes.find((x) => x.month === m && x.status !== 'none');
  return { frozen: !!f, mode: f?.status ?? 'none', month: f?.month ?? null };
}

export const FREEZE_MESSAGES_BN = {
  hard: 'হিমায়িত মাস — তথ্য পরিবর্তন করা যাবে না। সংশোধন পরবর্তী মাসের এন্ট্রি হিসেবে করুন।',
  soft: 'হিমায়িত মাস (সফট) — সংশোধন ফ্ল্যাগ হয়ে যাবে।',
} as const;

/* ═══════════════════ Builder dataset adapters ══════════════════════════════ */

/**
 * Builder row maps (field keys match DATASET_FIELDS). The API store produces
 * these from its snapshot so the builder is dataset-agnostic.
 */
export interface BuilderData {
  loans: Record<string, string | number | boolean | null>[];
  savings: Record<string, string | number | boolean | null>[];
  collections: Record<string, string | number | boolean | null>[];
  complaints: Record<string, string | number | boolean | null>[];
  members: Record<string, string | number | boolean | null>[];
}

export function runBuilder(data: BuilderData, dataset: BuilderDataset, body: SavedReportBody): { rows: BuilderRow[]; scanned: number } {
  const all = data[dataset];
  const filtered = all.filter((row) => body.filters.every((f) => applyFilter(row[f.field] ?? null, f.op, f.value)));
  return { rows: buildReportRows(filtered, body.groupBy, body.metric, body.metricField), scanned: filtered.length };
}
