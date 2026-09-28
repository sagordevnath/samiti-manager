/**
 * ── Supervision, Internal Audit, Approval Inbox, Escalation (req 5–9) ────────
 * 5) Supervision forms with checklists (center visit, branch inspection,
 *    passbook verification, cash verification, loan utilization check),
 *    mobile submission with photos + GPS.
 * 6) Internal audit: plan by branch, random sampling tool, findings register
 *    with severity → branch response → deadline → follow-up → closed.
 * 7) Approval inbox: single screen of everything pending for the current user.
 * 8) Escalation rules by time (task/finding aging → next role).
 * 9) Calendar + Kanban views and a per-role daily digest.
 *
 * Money is transmitted as string; numeric(14,2) in DB. All rule helpers are
 * pure so the API (authoritative), the DB triggers (defense in depth) and
 * the web UI (live feedback) share one implementation.
 */

import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';
import type { TaskPriority, TaskStatus, WorkTask } from './work.js';

/** ── 5) Supervision forms ────────────────────────────────────────────────── */

export const SUPERVISION_FORM_TYPES = [
  'center_visit',
  'branch_inspection',
  'passbook_verification',
  'cash_verification',
  'loan_utilization',
] as const;
export type SupervisionFormType = (typeof SUPERVISION_FORM_TYPES)[number];

export const SUPERVISION_FORM_LABELS_BN: Record<SupervisionFormType, string> = {
  center_visit: 'কেন্দ্র পরিদর্শন',
  branch_inspection: 'শাখা পরিদর্শন',
  passbook_verification: 'পাসবুক যাচাই',
  cash_verification: 'নগদ যাচাই',
  loan_utilization: 'ঋণ ব্যবহার যাচাই',
};

/** One checklist row: the question plus its outcome. */
export interface SupervisionChecklistItem {
  id: string;
  questionBn: string;
  /** yes / no / na — null until answered. */
  answer: 'yes' | 'no' | 'na' | null;
  note: string;
}

export interface SupervisionSubmission {
  id: string;
  orgId: string;
  branchId: string;
  formType: SupervisionFormType;
  /** Center/samity, member, or loan the visit was about. */
  linkId: string | null;
  linkLabel: string;
  /** Officer who submitted (device user). */
  submittedBy: string;
  submittedByName: string;
  submittedAt: string; // ISO
  /** GPS of the device at submission. */
  lat: number | null;
  lng: number | null;
  /** Distance from the expected point in meters (null when not measured). */
  distanceMeters: number | null;
  /** Supabase Storage paths of attached photos. */
  photos: string[];
  items: SupervisionChecklistItem[];
  /** Count of answered "no" — the follow-up driver. */
  exceptions: number;
  note: string;
}

/** The per-form default checklists (editable per org later; seeded here). */
export const DEFAULT_CHECKLISTS: Record<SupervisionFormType, Omit<SupervisionChecklistItem, 'answer' | 'note'>[]> = {
  center_visit: [
    { id: 'cv1', questionBn: 'সভা নির্ধারিত সময়ে হয়েছে' },
    { id: 'cv2', questionBn: 'সকল সদস্য উপস্থিত ছিল বা অনুপস্থিতির কারণ জানা গেছে' },
    { id: 'cv3', questionBn: 'কিস্তি ও সঞ্চয় আদায় রসিদসহ সম্পন্ন হয়েছে' },
    { id: 'cv4', questionBn: 'পাসবুক সদস্যের হাতে সংরক্ষিত' },
  ],
  branch_inspection: [
    { id: 'bi1', questionBn: 'নগদ বই ও হার্ড ক্যাশ মিলেছে' },
    { id: 'bi2', questionBn: 'রেজিস্টার হালনাগাদ' },
    { id: 'bi3', questionBn: 'কর্মীদের হাজিরা ও ভ্রমণ বিল নিয়মিত' },
    { id: 'bi4', questionBn: 'গুরুত্বপূর্ণ নথিপত্র সুরক্ষিত' },
  ],
  passbook_verification: [
    { id: 'pv1', questionBn: 'পাসবুকের ব্যালেন্স সফটওয়্যারের সাথে মিলেছে' },
    { id: 'pv2', questionBn: 'সকল লেনদেন রসিদসহ লিপিবদ্ধ' },
    { id: 'pv3', questionBn: 'সদস্যের স্বাক্ষর আছে' },
  ],
  cash_verification: [
    { id: 'cav1', questionBn: 'হাতে নগদ ক্যাশ বইয়ের সাথে মিলেছে' },
    { id: 'cav2', questionBn: 'নগদ সীমার মধ্যে আছে' },
    { id: 'cav3', questionBn: 'ভাউচার ক্রমানুসারে সাজানো' },
  ],
  loan_utilization: [
    { id: 'lu1', questionBn: 'ঋণের অর্থ ঘোষিত খাতে ব্যবহৃত হয়েছে' },
    { id: 'lu2', questionBn: 'ক্রয়ের প্রমাণ দেখা গেছে' },
    { id: 'lu3', questionBn: 'পরিবারের আয় বৃদ্ধির লক্ষণ আছে' },
  ],
};

export const supervisionSubmitSchema = z.object({
  branchId: uuidSchema,
  formType: z.enum(SUPERVISION_FORM_TYPES),
  linkId: uuidSchema.nullish(),
  linkLabel: z.string().trim().max(160).default(''),
  /** Device GPS. */
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  /** Distance from expected point (meters), computed server-side if omitted. */
  distanceMeters: z.number().min(0).max(100000).nullish(),
  photos: z.array(z.string().trim().min(1)).max(10).default([]),
  /** Pre-filled answers; anything omitted stays unanswered. */
  answers: z.record(z.enum(['yes', 'no', 'na'])).default({}),
  note: z.string().trim().max(2000).default(''),
});
export type SupervisionSubmitBody = z.infer<typeof supervisionSubmitSchema>;

/** Build a submission from a device payload (shared with demo store + UI preview). */
export function buildSupervisionSubmission(
  body: SupervisionSubmitBody,
  ctx: { orgId: string; submittedBy: string; submittedByName: string; submittedAt?: string },
): SupervisionSubmission {
  const template = DEFAULT_CHECKLISTS[body.formType];
  const items: SupervisionChecklistItem[] = template.map((q) => ({
    ...q,
    answer: body.answers[q.id] ?? null,
    note: '',
  }));
  const exceptions = items.filter((i) => i.answer === 'no').length;
  return {
    id: cryptoRandomId(),
    orgId: ctx.orgId,
    branchId: body.branchId,
    formType: body.formType,
    linkId: body.linkId ?? null,
    linkLabel: body.linkLabel ?? '',
    submittedBy: ctx.submittedBy,
    submittedByName: ctx.submittedByName,
    submittedAt: ctx.submittedAt ?? new Date().toISOString(),
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    distanceMeters: body.distanceMeters ?? null,
    photos: body.photos ?? [],
    items,
    exceptions,
    note: body.note ?? '',
  };
}

/** Anything above this distance (meters) is flagged in the register view. */
export const GPS_OUT_OF_RANGE_METERS = 2000;

/* ── 6) Internal audit ───────────────────────────────────────────────────── */

export const AUDIT_STATUSES = ['planned', 'in_progress', 'draft_report', 'closed'] as const;
export type AuditStatus = (typeof AUDIT_STATUSES)[number];

export const AUDIT_STATUS_LABELS_BN: Record<AuditStatus, string> = {
  planned: 'পরিকল্পিত',
  in_progress: 'চলমান',
  draft_report: 'প্রতিবেদন প্রস্তুত',
  closed: 'সমাপ্ত',
};

export const FINDING_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_SEVERITY_LABELS_BN: Record<FindingSeverity, string> = {
  low: 'নিম্ন',
  medium: 'মধ্যম',
  high: 'উচ্চ',
  critical: 'অতি উচ্চ',
};

/** Response SLA by severity, in days (editable per org later). */
export const SEVERITY_RESPONSE_DAYS: Record<FindingSeverity, number> = {
  low: 30,
  medium: 21,
  high: 14,
  critical: 7,
};

export interface AuditPlan {
  id: string;
  orgId: string;
  branchId: string;
  branchName: string;
  title: string;
  plannedDate: string; // YYYY-MM-DD
  leadAuditorId: string;
  leadAuditorName: string;
  status: AuditStatus;
  /** Sampled loan ids (random pick tool). */
  loanSample: string[];
  /** Sampled member ids (random pick tool). */
  memberSample: string[];
  /** Sample size requested from the pick tool. */
  sampleSize: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type FindingStatus = 'open' | 'responded' | 'in_followup' | 'closed';

export const FINDING_STATUS_LABELS_BN: Record<FindingStatus, string> = {
  open: 'উন্মুক্ত',
  responded: 'শাখার জবাব',
  in_followup: 'অনুসরণে',
  closed: 'বন্ধ',
};

export interface AuditFinding {
  id: string;
  orgId: string;
  auditId: string;
  /** Checklist reference, e.g. bi1. */
  ref: string;
  title: string;
  detail: string;
  severity: FindingSeverity;
  status: FindingStatus;
  /** Branch's written response. */
  response: string;
  respondedAt: string | null;
  /** Commitment date the branch promised to fix by. */
  deadline: string | null; // YYYY-MM-DD
  /** Auditor follow-up notes appended over time. */
  followUps: { id: string; at: string; note: string; byName: string }[];
  closedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const auditPlanCreateSchema = z.object({
  branchId: uuidSchema,
  branchName: z.string().trim().min(2).max(120),
  title: z.string().trim().min(3).max(160),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  leadAuditorId: uuidSchema,
  leadAuditorName: z.string().trim().min(2).max(120).optional(),
  sampleSize: z.coerce.number().int().min(1).max(200).default(10),
});
export type AuditPlanCreateBody = z.infer<typeof auditPlanCreateSchema>;

export const auditSampleSchema = z.object({
  sampleSize: z.coerce.number().int().min(1).max(200).default(10),
  /** Optional explicit pools; the API defaults to the branch's active records. */
  loanPool: z.array(uuidSchema).max(5000).optional(),
  memberPool: z.array(uuidSchema).max(5000).optional(),
});
export type AuditSampleBody = z.infer<typeof auditSampleSchema>;

export const findingCreateSchema = z.object({
  auditId: uuidSchema,
  ref: z.string().trim().max(12).default(''),
  title: z.string().trim().min(3).max(160),
  detail: z.string().trim().max(2000).default(''),
  severity: z.enum(FINDING_SEVERITIES),
});
export type FindingCreateBody = z.infer<typeof findingCreateSchema>;

export const findingRespondSchema = z.object({
  response: z.string().trim().min(3).max(2000),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish(),
});
export type FindingRespondBody = z.infer<typeof findingRespondSchema>;

export const findingFollowUpSchema = z.object({
  note: z.string().trim().min(2).max(1000),
  /** Follow-up may close the finding directly. */
  close: z.boolean().default(false),
});
export type FindingFollowUpBody = z.infer<typeof findingFollowUpSchema>;

/** Fisher–Yates shuffle then take n — unbiased enough for audit sampling. */
export function pickRandomSample<T>(pool: readonly T[], n: number): T[] {
  const copy = [...pool];
  const take = Math.max(0, Math.min(n, copy.length));
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i] as T;
    copy[i] = copy[j] as T;
    copy[j] = tmp;
  }
  return copy.slice(0, take);
}

/** Default response deadline = plan date context ignored; severities carry the SLA. */
export function responseDeadlineFor(severity: FindingSeverity, fromIso: string): string {
  const d = new Date(fromIso);
  d.setUTCDate(d.getUTCDate() + SEVERITY_RESPONSE_DAYS[severity]);
  return d.toISOString().slice(0, 10);
}

export function canTransitionFinding(from: FindingStatus, to: FindingStatus): boolean {
  const allowed: Record<FindingStatus, FindingStatus[]> = {
    open: ['responded', 'closed'],
    responded: ['in_followup', 'closed'],
    in_followup: ['closed'],
    closed: [],
  };
  return allowed[from].includes(to);
}

/* ── 7) Approval inbox ───────────────────────────────────────────────────── */

/** A normalized pending-approval row shown in the single inbox screen. */
export interface ApprovalItem {
  kind: string; // e.g. 'loan_application' | 'branch_opening' | 'finding' | 'leave'
  kindLabelBn: string;
  refId: string;
  title: string;
  subtitle: string;
  /** Route the approver can deep-link to. */
  linkTo: string | null;
  requestedAt: string;
  requesterName: string;
  amount: string | null;
  /** Older items bubble up. */
  waitingDays: number;
  escalated: boolean;
}

/** Assemble the inbox from arbitrary lists of pending things. */
export function buildApprovalInbox(
  groups: { items: ApprovalItem[] }[],
): ApprovalItem[] {
  return groups
    .flatMap((g) => g.items)
    .sort((a, b) => b.waitingDays - a.waitingDays || a.requestedAt.localeCompare(b.requestedAt));
}

/** Each module publishes its pending approvals in this shape. */
export interface ApprovalSourceDef {
  kind: string;
  kindLabelBn: string;
  /** How many waiting days before the item escalates to the next role. */
  escalateAfterDays: number;
}

/** Registration of the known approval kinds (escaltion defaults). */
export const APPROVAL_SOURCES: Record<string, ApprovalSourceDef> = {
  loan_application: { kind: 'loan_application', kindLabelBn: 'ঋণের আবেদন', escalateAfterDays: 3 },
  branch_opening: { kind: 'branch_opening', kindLabelBn: 'শাখা খোলা', escalateAfterDays: 7 },
  member_transfer: { kind: 'member_transfer', kindLabelBn: 'সদস্য বদলি', escalateAfterDays: 3 },
  payroll_run: { kind: 'payroll_run', kindLabelBn: 'পেরোল', escalateAfterDays: 2 },
  audit_finding_response: { kind: 'audit_finding_response', kindLabelBn: 'অডিট জবাব', escalateAfterDays: 5 },
  leave_request: { kind: 'leave_request', kindLabelBn: 'ছুটির আবেদন', escalateAfterDays: 2 },
};

export function waitingDaysSince(iso: string, todayIso = new Date().toISOString().slice(0, 10)): number {
  const day = (s: string) => s.slice(0, 10);
  const diff = new Date(`${day(todayIso)}T00:00:00Z`).getTime() - new Date(`${day(iso)}T00:00:00Z`).getTime();
  return Math.max(0, Math.round(diff / 86_400_000));
}

/* ── 8) Escalation rules by time ─────────────────────────────────────────── */

export interface EscalationTier {
  /** Consecutive days overdue before this tier fires. */
  afterDays: number;
  /** Role the item escalates to. */
  role: 'branch_manager' | 'area_manager' | 'org_admin';
  roleLabelBn: string;
}

/** Default task escalation ladder (org-editable later). */
export const ESCALATION_TIERS: EscalationTier[] = [
  { afterDays: 3, role: 'branch_manager', roleLabelBn: 'শাখা ব্যবস্থাপক' },
  { afterDays: 7, role: 'area_manager', roleLabelBn: 'এরিয়া ব্যবস্থাপক' },
  { afterDays: 14, role: 'org_admin', roleLabelBn: 'প্রধান কার্যালয়' },
];

export interface EscalationDecision {
  daysOverdue: number;
  tier: EscalationTier | null;
  roleLabelBn: string | null;
}

/** Which escalation tier applies to a task that is N days overdue. */
export function escalationFor(daysOverdue: number, tiers: EscalationTier[] = ESCALATION_TIERS): EscalationDecision {
  const sorted = [...tiers].sort((a, b) => a.afterDays - b.afterDays);
  const tier = sorted.filter((t) => daysOverdue >= t.afterDays).at(-1) ?? null;
  return { daysOverdue, tier, roleLabelBn: tier?.roleLabelBn ?? null };
}

export interface EscalatedTask {
  task: WorkTask;
  daysOverdue: number;
  decision: EscalationDecision;
}

/** Tasks that are open, past due, and their current escalation tier. */
export function escalateOpenTasks(
  tasks: readonly Pick<WorkTask, 'id' | 'dueDate' | 'status'>[],
  todayIso = new Date().toISOString().slice(0, 10),
): EscalatedTask[] {
  const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`).getTime();
  const today = day(todayIso);
  const out: EscalatedTask[] = [];
  for (const t of tasks) {
    if (t.status === 'done' || t.status === 'verified') continue;
    const overdueDays = Math.floor((today - day(t.dueDate)) / 86_400_000);
    if (overdueDays <= 0) continue;
    out.push({ task: t as WorkTask, daysOverdue: overdueDays, decision: escalationFor(overdueDays) });
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/** Findings past their response deadline that must escalate to the auditor's boss. */
export function escalateFindings(
  findings: readonly { id: string; severity: FindingSeverity; status: FindingStatus; deadline: string | null }[],
  todayIso = new Date().toISOString().slice(0, 10),
): { id: string; daysOverdue: number }[] {
  const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`).getTime();
  const today = day(todayIso);
  return findings
    .filter((f) => f.status !== 'closed' && f.deadline && day(f.deadline) < today)
    .map((f) => ({ id: f.id, daysOverdue: Math.floor((today - day(f.deadline as string)) / 86_400_000) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

/* ── 9) Calendar, Kanban, digest ─────────────────────────────────────────── */

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  taskIds: string[];
  auditDates: string[];
  supervisionCount: number;
}

/** Bucket tasks/audits/supervisions into a month grid. */
export function buildCalendar(
  tasks: readonly Pick<WorkTask, 'id' | 'dueDate'>[],
  audits: readonly { id: string; plannedDate: string }[],
  submissions: readonly { id: string; submittedAt: string }[],
  month: string, // YYYY-MM
): CalendarDay[] {
  const days: CalendarDay[] = [];
  const [yStr, mStr] = month.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= last; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    days.push({
      date,
      taskIds: tasks.filter((t) => t.dueDate === date).map((t) => t.id),
      auditDates: audits.filter((a) => a.plannedDate === date).map((a) => a.id),
      supervisionCount: submissions.filter((s) => s.submittedAt.slice(0, 10) === date).length,
    });
  }
  return days;
}

export const KANBAN_COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done', 'verified'];

export interface KanbanColumn {
  status: TaskStatus;
  labelBn: string;
  tasks: WorkTask[];
}

export function buildKanban(tasks: readonly WorkTask[]): KanbanColumn[] {
  return KANBAN_COLUMNS.map((status) => ({
    status,
    labelBn:
      status === 'todo'
        ? 'করণীয়'
        : status === 'in_progress'
          ? 'চলমান'
          : status === 'blocked'
            ? 'আটকে আছে'
            : status === 'done'
              ? 'সম্পন্ন'
              : 'যাচাইকৃত',
    tasks: tasks.filter((t) => t.status === status),
  }));
}

/** Priority weight for the digest ordering (urgent first). */
const PRIORITY_WEIGHT: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export interface DailyDigest {
  role: string;
  date: string;
  overdue: { id: string; title: string; daysOverdue: number; escalateToBn: string | null }[];
  dueToday: { id: string; title: string; priority: TaskPriority }[];
  meetingsDue: { id: string; title: string }[];
  auditsToday: { id: string; title: string; branchName: string }[];
  findingsEscalated: { id: string; title: string; daysOverdue: number }[];
  supervisionSubmitted: number;
  summaryBn: string;
}

/** Build the per-role daily digest (rendered to text for SMS/print later). */
export function buildDailyDigest(
  role: string,
  date: string,
  input: {
    tasks: readonly WorkTask[];
    audits: readonly { id: string; title: string; branchName: string; plannedDate: string }[];
    submissionsToday: number;
    findings: readonly { id: string; title: string; severity?: FindingSeverity; status: FindingStatus; deadline: string | null }[];
  },
): DailyDigest {
  const overdueRows = escalateOpenTasks(input.tasks, date).slice(0, 20);
  const dueToday = input.tasks
    .filter((t) => t.dueDate === date && t.status !== 'done' && t.status !== 'verified')
    .sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority])
    .slice(0, 20);
  const meetings = input.tasks.filter((t) => t.type === 'meeting_due' && t.dueDate === date && t.status !== 'done' && t.status !== 'verified');
  const auditsToday = input.audits.filter((a) => a.plannedDate === date);
  const findingsEsc = escalateFindings(
    input.findings.map((f) => ({ id: f.id, severity: f.severity ?? 'medium', status: f.status, deadline: f.deadline })),
    date,
  ).slice(0, 10);
  return {
    role,
    date,
    overdue: overdueRows.map((r) => ({ id: r.task.id, title: r.task.title, daysOverdue: r.daysOverdue, escalateToBn: r.decision.roleLabelBn })),
    dueToday: dueToday.map((t) => ({ id: t.id, title: t.title, priority: t.priority })),
    meetingsDue: meetings.map((t) => ({ id: t.id, title: t.title })),
    auditsToday: auditsToday.map((a) => ({ id: a.id, title: a.title, branchName: a.branchName })),
    findingsEscalated: findingsEsc.map((f) => ({ id: f.id, title: input.findings.find((x) => x.id === f.id)?.title ?? f.id, daysOverdue: f.daysOverdue })),
    supervisionSubmitted: input.submissionsToday,
    summaryBn:
      `আজ ${date}: বকেয়া কাজ ${overdueRows.length}টি, আজকের কাজ ${dueToday.length}টি, সভা ${meetings.length}টি, অডিট ${auditsToday.length}টি।`,
  };
}

/* ── shared utils ──────────────────────────────────────────────────────────── */

function cryptoRandomId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Re-export for the routes' money typing convenience. */
export type { TaskStatus };
export { moneySchema };
