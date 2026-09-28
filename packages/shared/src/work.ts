/**
 * ── Work Distribution, Supervision & Internal Audit ─────────────────────────
 * 1) Task engine: typed tasks with linked records, status flow, comments,
 *    attachments. 2) Auto-generated tasks from other modules (overdue
 *    follow-up, utilization visit, meeting due, KYC pending, report
 *    submission, cash count). 3) Monthly targets cascaded Area → Branch →
 *    Officer with live achievement bars. 4) Delegation / reassignment when
 *    staff are on leave or transferred.
 *
 * Money is transmitted as string; numeric(14,2) in DB. All rule helpers are
 * pure so the API (authoritative), the DB triggers (defense in depth) and
 * the web UI (live feedback) share one implementation.
 */

import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';

/** ── 1) Task engine ─────────────────────────────────────────────────────── */

export const TASK_TYPES = [
  'overdue_followup',
  'utilization_visit',
  'meeting_due',
  'kyc_pending',
  'report_submission',
  'cash_count',
  'manual',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABELS_BN: Record<TaskType, string> = {
  overdue_followup: 'বকেয়া ফলোআপ',
  utilization_visit: 'ঋণ ব্যবহার পরিদর্শন',
  meeting_due: 'সভা আহ্বান',
  kyc_pending: 'কেওয়াইসি বাকি',
  report_submission: 'রিপোর্ট জমা',
  cash_count: 'নগদ গণনা',
  manual: 'সাধারণ কাজ',
};

export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITIES_BN: Record<TaskPriority, string> = {
  low: 'কম',
  normal: 'সাধারণ',
  high: 'উচ্চ',
  urgent: 'জরুরি',
};

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'verified'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUSES_BN: Record<TaskStatus, string> = {
  todo: 'করণীয়',
  in_progress: 'চলমান',
  blocked: 'বাধাগ্রস্ত',
  done: 'সম্পন্ন',
  verified: 'যাচাইকৃত',
};

/** Allowed status transitions. `verified` is terminal. */
const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  todo: ['in_progress', 'blocked'],
  in_progress: ['done', 'blocked'],
  blocked: ['in_progress'],
  done: ['verified', 'in_progress'], // verified by assigner/supervisor; reopen allowed
  verified: [],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return TASK_TRANSITIONS[from].includes(to);
}

export function taskTransitionsFrom(from: TaskStatus): readonly TaskStatus[] {
  return TASK_TRANSITIONS[from];
}

/** Only the assigner (or an admin) may verify; assignee may reopen. */
export function canVerifyTask(task: { assignerId: string }, actorId: string, actorIsAdmin: boolean): boolean {
  return actorIsAdmin || task.assignerId === actorId;
}

/** Linked record: which domain object this task is about. */
export interface TaskLink {
  kind: 'member' | 'loan' | 'samity' | 'branch' | 'other';
  id: string | null;
  label: string;
}

export interface TaskComment {
  id: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: string; // ISO
}

export interface WorkTask {
  id: string;
  orgId: string;
  branchId: string | null;
  type: TaskType;
  title: string;
  description: string;
  assigneeId: string; // staff/user id
  assigneeName: string;
  assignerId: string;
  assignerName: string;
  dueDate: string; // YYYY-MM-DD
  priority: TaskPriority;
  link: TaskLink;
  status: TaskStatus;
  comments: TaskComment[];
  attachments: string[]; // storage paths
  autoKey: string | null; // dedupe key for auto-generated tasks
  completedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkTaskCreateInput {
  orgId: string;
  branchId?: string | null;
  type: TaskType;
  title: string;
  description?: string;
  assigneeId: string;
  assigneeName: string;
  assignerId: string;
  assignerName: string;
  dueDate: string;
  priority?: TaskPriority;
  link?: Partial<TaskLink>;
  attachments?: string[];
  autoKey?: string | null;
}

/** Is this task overdue (past due and not verified/done)? */
export function isTaskOverdue(task: Pick<WorkTask, 'dueDate' | 'status'>, today = new Date().toISOString().slice(0, 10)): boolean {
  return task.status !== 'verified' && task.status !== 'done' && task.dueDate < today;
}

const linkSchema = z.object({
  kind: z.enum(['member', 'loan', 'samity', 'branch', 'other']).default('other'),
  id: uuidSchema.nullish(),
  label: z.string().trim().max(160).default(''),
});

export const taskCreateSchema = z.object({
  branchId: uuidSchema.nullish(),
  type: z.enum(TASK_TYPES),
  title: z.string().trim().min(3, 'শিরোনাম কমপক্ষে ৩ অক্ষর / Title must be at least 3 characters').max(160),
  description: z.string().trim().max(2000).optional(),
  assigneeId: uuidSchema,
  assigneeName: z.string().trim().min(2).max(120).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'তারিখ ফরম্যাট YYYY-MM-DD / Date must be YYYY-MM-DD'),
  priority: z.enum(TASK_PRIORITIES).default('normal'),
  link: linkSchema.optional(),
  attachments: z.array(z.string().trim().min(1)).max(10).optional(),
});
export type WorkTaskCreateBody = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z
  .object({
    status: z.enum(TASK_STATUSES).optional(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    description: z.string().trim().max(2000).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'হালনাগাদ করার কিছু নেই / Nothing to update' });
export type WorkTaskUpdateBody = z.infer<typeof taskUpdateSchema>;

export const taskCommentSchema = z.object({
  text: z.string().trim().min(1, 'মন্তব্য লিখুন / Comment required').max(1000),
});
export type TaskCommentBody = z.infer<typeof taskCommentSchema>;

/** Assignee change (delegation / reassignment) body. */
export const taskReassignSchema = z.object({
  toStaffId: uuidSchema,
  toStaffName: z.string().trim().min(2).max(120).optional(),
  reason: z.enum(['leave', 'transfer', 'workload', 'other']).default('workload'),
  note: z.string().trim().max(500).optional(),
});
export type TaskReassignBody = z.infer<typeof taskReassignSchema>;

/** ── 2) Auto-generated tasks ────────────────────────────────────────────── */

export const AUTO_TASK_SOURCES = [
  'overdue_followup',
  'utilization_visit',
  'meeting_due',
  'kyc_pending',
  'report_submission',
  'cash_count',
] as const;
export type AutoTaskSource = (typeof AUTO_TASK_SOURCES)[number];

export interface AutoTaskDef {
  type: TaskType;
  titleBn: string;
  priority: TaskPriority;
  /** Days from the event date until due. */
  dueInDays: number;
  linkKind: TaskLink['kind'];
}

export const AUTO_TASK_DEFS: Record<AutoTaskSource, AutoTaskDef> = {
  overdue_followup: { type: 'overdue_followup', titleBn: 'বকেয়া কিস্তি ফলোআপ', priority: 'urgent', dueInDays: 1, linkKind: 'member' },
  utilization_visit: { type: 'utilization_visit', titleBn: 'ঋণ ব্যবহার পরিদর্শন', priority: 'normal', dueInDays: 3, linkKind: 'loan' },
  meeting_due: { type: 'meeting_due', titleBn: 'সমিতির সভা আহ্বান', priority: 'normal', dueInDays: 2, linkKind: 'samity' },
  kyc_pending: { type: 'kyc_pending', titleBn: 'কেওয়াইসি সম্পূর্ণ করুন', priority: 'high', dueInDays: 7, linkKind: 'member' },
  report_submission: { type: 'report_submission', titleBn: 'মাসিক রিপোর্ট জমা', priority: 'high', dueInDays: 5, linkKind: 'branch' },
  cash_count: { type: 'cash_count', titleBn: 'নগদ গণনা ও মিলিয়ন', priority: 'high', dueInDays: 1, linkKind: 'branch' },
};

export interface AutoTaskPayload {
  source: AutoTaskSource;
  /** Linked record id (member/loan/samity/branch). */
  linkId: string;
  /** Display label, e.g. member name or samity name. */
  linkLabel: string;
  branchId?: string | null;
  assigneeId: string;
  assigneeName: string;
  /** Event date; due date is computed from it. Defaults to today. */
  eventDate?: string;
  /** Extra description context. */
  note?: string;
}

export interface AutoTaskBuild {
  input: WorkTaskCreateInput;
  /** Dedupe key so the same event never spawns duplicate open tasks. */
  autoKey: string;
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Pure factory: module event → task create input with dedupe key. */
export function buildAutoTask(payload: AutoTaskPayload, orgId: string, assigner: { id: string; name: string }): AutoTaskBuild {
  const def = AUTO_TASK_DEFS[payload.source];
  const eventDate = payload.eventDate ?? new Date().toISOString().slice(0, 10);
  const autoKey = `${payload.source}:${payload.linkId}`;
  const description = payload.note ? `${def.titleBn} — ${payload.linkLabel} (${payload.note})` : `${def.titleBn} — ${payload.linkLabel}`;
  return {
    autoKey,
    input: {
      orgId,
      branchId: payload.branchId ?? null,
      type: def.type,
      title: `${def.titleBn} · ${payload.linkLabel}`,
      description,
      assigneeId: payload.assigneeId,
      assigneeName: payload.assigneeName,
      assignerId: assigner.id,
      assignerName: assigner.name,
      dueDate: addDays(eventDate, def.dueInDays),
      priority: def.priority,
      link: { kind: def.linkKind, id: payload.linkId, label: payload.linkLabel },
      autoKey,
    },
  };
}

export const autoTaskGenerateSchema = z.object({
  source: z.enum(AUTO_TASK_SOURCES),
  linkId: uuidSchema,
  linkLabel: z.string().trim().min(1).max(160),
  branchId: uuidSchema.nullish(),
  assigneeId: uuidSchema,
  assigneeName: z.string().trim().min(2).max(120).optional(),
  eventDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  note: z.string().trim().max(300).optional(),
});
export type AutoTaskGenerateBody = z.infer<typeof autoTaskGenerateSchema>;

/** ── 3) Targets: Area → Branch → Officer cascade ───────────────────────── */

export const TARGET_METRICS = ['newMembers', 'disbursement', 'collection', 'savings', 'parLimit'] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];

export const TARGET_METRIC_LABELS_BN: Record<TargetMetric, string> = {
  newMembers: 'নতুন সদস্য',
  disbursement: 'ঋণ বিতরণ',
  collection: 'আদায়',
  savings: 'সঞ্চয়',
  parLimit: 'PAR সীমা (%)',
};

/** Money metrics as strings; counts as integers; PAR limit as percent (number, 1 decimal). */
export interface TargetMetrics {
  newMembers: number;
  disbursement: string;
  collection: string;
  savings: string;
  parLimit: number;
}

export interface WorkTarget {
  id: string;
  orgId: string;
  /** 'area' targets are set by the Area Manager; 'branch' targets assigned to a branch; 'officer' split by the Branch Manager. */
  scope: 'area' | 'branch' | 'officer';
  /** For branch scope: the branch. For officer scope: the officer's staff id. */
  ownerBranchId: string | null;
  ownerStaffId: string | null;
  ownerName: string;
  /** Parent target (branch → area, officer → branch). */
  parentId: string | null;
  period: string; // YYYY-MM
  metrics: TargetMetrics;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export function num(money: string): number {
  return Number.parseFloat(money || '0');
}

/** Per-metric achievement; PAR is inverse (actual ≤ limit is good). */
export function metricAchievement(metric: TargetMetric, target: TargetMetrics, actual: TargetMetrics): number {
  const t = metric === 'parLimit' ? target.parLimit : metric === 'newMembers' ? target.newMembers : num(target[metric]);
  const a = metric === 'parLimit' ? actual.parLimit : metric === 'newMembers' ? actual.newMembers : num(actual[metric]);
  if (metric === 'parLimit') {
    if (a <= 0) return 100;
    return Math.min(100, Math.round((t / a) * 100));
  }
  if (t <= 0) return a > 0 ? 100 : 0;
  return Math.min(150, Math.round((a / t) * 100));
}

export interface AchievementRow {
  metric: TargetMetric;
  labelBn: string;
  target: string;
  actual: string;
  pct: number;
}

export function targetAchievement(target: TargetMetrics, actual: TargetMetrics): AchievementRow[] {
  return TARGET_METRICS.map((m) => {
    const t = m === 'parLimit' ? target.parLimit : m === 'newMembers' ? target.newMembers : num(target[m]);
    const a = m === 'parLimit' ? actual.parLimit : m === 'newMembers' ? actual.newMembers : num(actual[m]);
    return {
      metric: m,
      labelBn: TARGET_METRIC_LABELS_BN[m],
      target: m === 'newMembers' ? String(t) : m === 'parLimit' ? `${t}%` : t.toFixed(2),
      actual: m === 'newMembers' ? String(a) : m === 'parLimit' ? `${a}%` : a.toFixed(2),
      pct: metricAchievement(m, target, actual),
    };
  });
}

/** Guard: officer splits must not exceed the parent branch target. */
export function splitWithinParent(child: TargetMetrics, parent: TargetMetrics, siblingsSum: TargetMetrics): boolean {
  for (const m of TARGET_METRICS) {
    if (m === 'parLimit') continue; // PAR limit is a ceiling, not additive
    if (m === 'newMembers') {
      if (siblingsSum.newMembers + child.newMembers > parent.newMembers) return false;
      continue;
    }
    if (num(siblingsSum[m]) + num(child[m]) > num(parent[m]) + 1e-9) return false;
  }
  return true;
}

export const targetMetricsSchema = z.object({
  newMembers: z.coerce.number().int().min(0).max(10000).default(0),
  disbursement: moneySchema.optional().default('0'),
  collection: moneySchema.optional().default('0'),
  savings: moneySchema.optional().default('0'),
  parLimit: z.coerce.number().min(0).max(100).default(0),
});
export type TargetMetricsInput = z.infer<typeof targetMetricsSchema>;

export const targetUpsertSchema = z.object({
  scope: z.enum(['area', 'branch', 'officer']),
  ownerBranchId: uuidSchema.nullish(),
  ownerStaffId: uuidSchema.nullish(),
  ownerName: z.string().trim().min(2).max(120),
  parentId: uuidSchema.nullish(),
  period: z.string().regex(/^\d{4}-\d{2}$/, 'পিরিয়ড ফরম্যাট YYYY-MM / Period must be YYYY-MM'),
  metrics: targetMetricsSchema,
});
export type TargetUpsertBody = z.infer<typeof targetUpsertSchema>;

/** ── 4) Delegation & reassignment ───────────────────────────────────────── */

export const DELEGATION_REASONS = ['leave', 'transfer', 'workload', 'other'] as const;
export type DelegationReason = (typeof DELEGATION_REASONS)[number];

export const DELEGATION_REASONS_BN: Record<DelegationReason, string> = {
  leave: 'ছুটি',
  transfer: 'বদলি',
  workload: 'কর্মভার',
  other: 'অন্যান্য',
};

export interface TaskDelegation {
  id: string;
  taskId: string | null; // null = bulk reassignment
  fromStaffId: string;
  toStaffId: string;
  reason: DelegationReason;
  note: string;
  createdAt: string;
}

/** A task must still be open to delegate it. */
export function canDelegateTask(task: Pick<WorkTask, 'status'>): boolean {
  return task.status === 'todo' || task.status === 'in_progress' || task.status === 'blocked';
}

/** Bulk reassignment: all open tasks from → to (used on leave/transfer). */
export function reassignOpenTasks<T extends { assigneeId: string; status: TaskStatus }>(tasks: T[], fromStaffId: string): T[] {
  return tasks.filter((t) => t.assigneeId === fromStaffId && t.status !== 'done' && t.status !== 'verified');
}
