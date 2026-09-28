/**
 * ── Work distribution demo store ─────────────────────────────────────────────
 * In-memory tasks, delegations and the monthly target cascade on top of the
 * HR staff list. Preview/test only — the Supabase path uses migration 0036
 * with the same shapes and trigger-enforced rules (status transitions,
 * auto-key dedupe, split-within-parent).
 *
 * Achievement actuals are stored per owner/period here; the Supabase path
 * computes them from the live member/loan/savings/collection tables.
 */
import { randomUUID } from 'node:crypto';
import {
  buildAutoTask,
  canDelegateTask,
  canTransitionTask,
  canVerifyTask,
  num,
  splitWithinParent,
  type AutoTaskGenerateBody,
  type TaskComment,
  type TaskDelegation,
  type TargetMetrics,
  type WorkTarget,
  type WorkTask,
  type WorkTaskCreateInput,
} from '@samity/shared';

export class WorkDemoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const BRANCH_MYMENSINGH = '00000000-0000-4000-8000-0000000000b2';
/** HR demo staff ids reused as assignees. */
const STAFF_F1 = '00000000-0000-4000-8000-0000000000f1';
const STAFF_F2 = '00000000-0000-4000-8000-0000000000f2';
const STAFF_F3 = '00000000-0000-4000-8000-0000000000f3';

export interface WorkDemoData {
  orgId: string;
  tasks: WorkTask[];
  delegations: TaskDelegation[];
  targets: WorkTarget[];
  /** Live achievement actuals keyed `scope|ownerId|YYYY-MM`. */
  actuals: Record<string, TargetMetrics>;
}

const globalRef = globalThis as unknown as { __workDemoData?: WorkDemoData };

const todayStr = () => new Date().toISOString().slice(0, 10);
const periodStr = () => new Date().toISOString().slice(0, 7);

function addDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function seedStore(): WorkDemoData {
  const now = new Date().toISOString();
  const period = periodStr();

  const seedTask = (
    partial: Partial<WorkTask> & Pick<WorkTask, 'id' | 'type' | 'title' | 'assigneeId' | 'assigneeName' | 'assignerId' | 'assignerName' | 'dueDate' | 'status'>,
  ): WorkTask => ({
    orgId: ORG_ID,
    branchId: BRANCH_DHAKA,
    description: '',
    priority: 'normal',
    link: { kind: 'other', id: null, label: '' },
    comments: [],
    attachments: [],
    autoKey: null,
    completedAt: null,
    verifiedAt: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  });

  const tasks: WorkTask[] = [
    seedTask({
      id: '00000000-0000-4000-8000-00000000t1',
      type: 'overdue_followup',
      title: 'বকেয়া কিস্তি ফলোআপ · রহিমা বেগম',
      description: 'বকেয়া কিস্তি ফলোআপ — রহিমা বেগম (২ কিস্তি বাকি)',
      assigneeId: STAFF_F1,
      assigneeName: 'কমল হোসেন',
      assignerId: STAFF_F3,
      assignerName: 'আব্দুল করিম',
      dueDate: addDays(-1),
      priority: 'urgent',
      status: 'in_progress',
      link: { kind: 'member', id: '00000000-0000-4000-8000-0000000000m1', label: 'রহিমা বেগম' },
      autoKey: 'overdue_followup:00000000-0000-4000-8000-0000000000m1',
    }),
    seedTask({
      id: '00000000-0000-4000-8000-00000000t2',
      type: 'utilization_visit',
      title: 'ঋণ ব্যবহার পরিদর্শন · L-0001',
      assigneeId: STAFF_F1,
      assigneeName: 'কমল হোসেন',
      assignerId: STAFF_F3,
      assignerName: 'আব্দুল করিম',
      dueDate: addDays(3),
      status: 'todo',
      link: { kind: 'loan', id: '00000000-0000-4000-8000-0000000000l1', label: 'L-0001' },
      autoKey: 'utilization_visit:00000000-0000-4000-8000-0000000000l1',
    }),
    seedTask({
      id: '00000000-0000-4000-8000-00000000t3',
      type: 'cash_count',
      title: 'নগদ গণনা ও মিলিয়ন · ঢাকা শাখা',
      assigneeId: STAFF_F2,
      assigneeName: 'নুসরাত জাহান',
      assignerId: STAFF_F3,
      assignerName: 'আব্দুল করিম',
      dueDate: addDays(1),
      priority: 'high',
      status: 'todo',
      link: { kind: 'branch', id: BRANCH_DHAKA, label: 'ঢাকা শাখা' },
      autoKey: 'cash_count:00000000-0000-4000-8000-0000000000b1',
    }),
    seedTask({
      id: '00000000-0000-4000-8000-00000000t4',
      type: 'manual',
      title: 'শাখা স্টাফ মিটিংয়ের মিনিট জমা দিন',
      assigneeId: STAFF_F2,
      assigneeName: 'নুসরাত জাহান',
      assignerId: STAFF_F3,
      assignerName: 'আব্দুল করিম',
      dueDate: addDays(5),
      status: 'done',
      completedAt: now,
      link: { kind: 'branch', id: BRANCH_DHAKA, label: 'ঢাকা শাখা' },
    }),
  ];

  const areaTarget: WorkTarget = {
    id: '00000000-0000-4000-8000-00000000a001',
    orgId: ORG_ID,
    scope: 'area',
    ownerBranchId: null,
    ownerStaffId: null,
    ownerName: 'এরিয়া কার্যালয় (ঢাকা)',
    parentId: null,
    period,
    metrics: { newMembers: 50, disbursement: '500000.00', collection: '450000.00', savings: '300000.00', parLimit: 5 },
    createdBy: 'seed',
    createdAt: now,
    updatedAt: now,
  };
  const branchTarget: WorkTarget = {
    id: '00000000-0000-4000-8000-00000000b001',
    orgId: ORG_ID,
    scope: 'branch',
    ownerBranchId: BRANCH_DHAKA,
    ownerStaffId: null,
    ownerName: 'ঢাকা শাখা',
    parentId: areaTarget.id,
    period,
    metrics: { newMembers: 25, disbursement: '250000.00', collection: '220000.00', savings: '150000.00', parLimit: 5 },
    createdBy: 'seed',
    createdAt: now,
    updatedAt: now,
  };

  return {
    orgId: ORG_ID,
    tasks,
    delegations: [],
    targets: [areaTarget, branchTarget],
    actuals: {
      [`area|-|${period}`]: { newMembers: 34, disbursement: '380000.00', collection: '410000.00', savings: '210000.00', parLimit: 4.2 },
      [`branch|${BRANCH_DHAKA}|${period}`]: { newMembers: 18, disbursement: '190000.00', collection: '205000.00', savings: '120000.00', parLimit: 4.6 },
      [`officer|${STAFF_F1}|${period}`]: { newMembers: 9, disbursement: '95000.00', collection: '98000.00', savings: '52000.00', parLimit: 5.1 },
      [`officer|${STAFF_F2}|${period}`]: { newMembers: 5, disbursement: '60000.00', collection: '72000.00', savings: '40000.00', parLimit: 3.8 },
    },
  };
}

export function workDemoStore(): WorkDemoData {
  globalRef.__workDemoData ??= seedStore();
  return globalRef.__workDemoData;
}

export function resetWorkDemoStore(): void {
  globalRef.__workDemoData = undefined;
}

/** ── Tasks ─────────────────────────────────────────────────────────────── */

export function listWorkTasks(
  store: WorkDemoData,
  filter: { assigneeId?: string; branchId?: string; status?: string; type?: string; overdueOnly?: boolean } = {},
): WorkTask[] {
  const today = todayStr();
  let rows = [...store.tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (filter.assigneeId) rows = rows.filter((t) => t.assigneeId === filter.assigneeId);
  if (filter.branchId) rows = rows.filter((t) => t.branchId === filter.branchId);
  if (filter.status) rows = rows.filter((t) => t.status === filter.status);
  if (filter.type) rows = rows.filter((t) => t.type === filter.type);
  if (filter.overdueOnly) rows = rows.filter((t) => t.status !== 'done' && t.status !== 'verified' && t.dueDate < today);
  return rows;
}

export function getWorkTask(store: WorkDemoData, id: string): WorkTask {
  const t = store.tasks.find((x) => x.id === id);
  if (!t) throw new WorkDemoError(404, 'NOT_FOUND', 'Task not found');
  return t;
}

export function createWorkTask(store: WorkDemoData, input: WorkTaskCreateInput): WorkTask {
  const now = new Date().toISOString();
  const task: WorkTask = {
    id: randomUUID(),
    orgId: input.orgId,
    branchId: input.branchId ?? null,
    type: input.type,
    title: input.title,
    description: input.description ?? '',
    assigneeId: input.assigneeId,
    assigneeName: input.assigneeName,
    assignerId: input.assignerId,
    assignerName: input.assignerName,
    dueDate: input.dueDate,
    priority: input.priority ?? 'normal',
    link: { kind: input.link?.kind ?? 'other', id: input.link?.id ?? null, label: input.link?.label ?? '' },
    status: 'todo',
    comments: [],
    attachments: input.attachments ?? [],
    autoKey: input.autoKey ?? null,
    completedAt: null,
    verifiedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  if (task.autoKey) {
    const dup = store.tasks.find((t) => t.autoKey === task.autoKey && t.status !== 'done' && t.status !== 'verified');
    if (dup) throw new WorkDemoError(409, 'CONFLICT', 'এই ইভেন্টের জন্য খোলা কাজ আগেই আছে / An open task already exists for this event');
  }
  store.tasks.push(task);
  return task;
}

/** Auto-generated task from another module (dedupe by source+link). */
export function generateAutoTask(store: WorkDemoData, body: AutoTaskGenerateBody, assigner: { id: string; name: string }): WorkTask {
  const built = buildAutoTask(
    {
      source: body.source,
      linkId: body.linkId,
      linkLabel: body.linkLabel,
      branchId: body.branchId ?? null,
      assigneeId: body.assigneeId,
      assigneeName: body.assigneeName ?? 'কর্মী',
      eventDate: body.eventDate,
      note: body.note,
    },
    store.orgId,
    assigner,
  );
  return createWorkTask(store, built.input);
}

export function updateWorkTask(store: WorkDemoData, id: string, patch: { status?: WorkTask['status']; dueDate?: string; priority?: WorkTask['priority']; description?: string }, actor: { id: string; isAdmin: boolean }): WorkTask {
  const t = getWorkTask(store, id);
  if (patch.status && patch.status !== t.status) {
    if (!canTransitionTask(t.status, patch.status)) {
      throw new WorkDemoError(409, 'CONFLICT', `অবৈধ স্থানান্তর ${t.status} → ${patch.status} / Invalid status transition`);
    }
    if (patch.status === 'verified' && !canVerifyTask(t, actor.id, actor.isAdmin)) {
      throw new WorkDemoError(403, 'FORBIDDEN', 'শুধু প্রদানকারী বা অ্যাডমিন যাচাই করতে পারেন / Only the assigner or an admin can verify');
    }
    if (patch.status === 'done') t.completedAt = new Date().toISOString();
    if (patch.status === 'verified') t.verifiedAt = new Date().toISOString();
    if (patch.status === 'in_progress') {
      t.completedAt = null;
      t.verifiedAt = null;
    }
    t.status = patch.status;
  }
  if (patch.dueDate) t.dueDate = patch.dueDate;
  if (patch.priority) t.priority = patch.priority;
  if (patch.description !== undefined) t.description = patch.description;
  t.updatedAt = new Date().toISOString();
  return t;
}

export function addWorkTaskComment(store: WorkDemoData, id: string, author: { id: string; name: string }, text: string): WorkTask {
  const t = getWorkTask(store, id);
  const comment: TaskComment = {
    id: randomUUID(),
    authorId: author.id,
    authorName: author.name,
    text,
    createdAt: new Date().toISOString(),
  };
  t.comments.push(comment);
  t.updatedAt = new Date().toISOString();
  return t;
}

/** ── Delegation / reassignment ─────────────────────────────────────────── */

export function delegateWorkTask(store: WorkDemoData, id: string, to: { id: string; name: string }, reason: TaskDelegation['reason'], note: string, actor: { id: string }): WorkTask {
  const t = getWorkTask(store, id);
  if (!canDelegateTask(t)) {
    throw new WorkDemoError(409, 'CONFLICT', 'সম্পন্ন/যাচাইকৃত কাজ বদলানো যায় না / Completed tasks cannot be reassigned');
  }
  if (t.assigneeId === to.id) {
    throw new WorkDemoError(409, 'CONFLICT', 'বর্তমান দায়িত্বপ্রাপ্ত ব্যক্তিই রয়ে গেছেন / Assignee unchanged');
  }
  const fromId = t.assigneeId;
  t.assigneeId = to.id;
  t.assigneeName = to.name;
  t.updatedAt = new Date().toISOString();
  store.delegations.push({
    id: randomUUID(),
    taskId: t.id,
    fromStaffId: fromId,
    toStaffId: to.id,
    reason,
    note,
    createdAt: new Date().toISOString(),
  });
  void actor;
  return t;
}

/** Bulk: move every open task of `fromStaffId` to `to` (leave/transfer). */
export function bulkReassignWorkTasks(store: WorkDemoData, fromStaffId: string, to: { id: string; name: string }, reason: TaskDelegation['reason'], note: string): number {
  const open = store.tasks.filter((t) => t.assigneeId === fromStaffId && canDelegateTask(t));
  const now = new Date().toISOString();
  for (const t of open) {
    t.assigneeId = to.id;
    t.assigneeName = to.name;
    t.updatedAt = now;
    store.delegations.push({
      id: randomUUID(),
      taskId: t.id,
      fromStaffId,
      toStaffId: to.id,
      reason,
      note,
      createdAt: now,
    });
  }
  return open.length;
}

export function listWorkDelegations(store: WorkDemoData): TaskDelegation[] {
  return [...store.delegations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** ── Targets & achievement ─────────────────────────────────────────────── */

const actualKey = (scope: WorkTarget['scope'], ownerId: string | null, period: string) =>
  `${scope}|${ownerId ?? '-'}|${period}`;

export function listWorkTargets(store: WorkDemoData, filter: { period?: string; scope?: string } = {}): WorkTarget[] {
  let rows = [...store.targets].sort((a, b) => a.period.localeCompare(b.period) || a.scope.localeCompare(b.scope));
  if (filter.period) rows = rows.filter((t) => t.period === filter.period);
  if (filter.scope) rows = rows.filter((t) => t.scope === filter.scope);
  return rows;
}

export function upsertWorkTarget(store: WorkDemoData, input: {
  scope: WorkTarget['scope'];
  ownerBranchId?: string | null;
  ownerStaffId?: string | null;
  ownerName: string;
  parentId?: string | null;
  period: string;
  metrics: TargetMetrics;
}, createdBy: string): WorkTarget {
  const ownerId = input.ownerBranchId ?? input.ownerStaffId ?? null;
  const existing = store.targets.find(
    (t) => t.scope === input.scope && (t.ownerBranchId ?? null) === (input.ownerBranchId ?? null) && (t.ownerStaffId ?? null) === (input.ownerStaffId ?? null) && t.period === input.period,
  );
  if (existing) {
    // Officer splits are validated against the parent with siblings included.
    if (existing.scope === 'officer' && existing.parentId) {
      const parent = store.targets.find((t) => t.id === existing.parentId);
      if (!parent) throw new WorkDemoError(404, 'NOT_FOUND', 'Parent branch target not found');
      const siblings = store.targets.filter((t) => t.parentId === existing.parentId && t.id !== existing.id && t.scope === 'officer');
      const sum = siblings.reduce(
        (acc, s) => ({
          newMembers: acc.newMembers + s.metrics.newMembers,
          disbursement: String(num(acc.disbursement) + num(s.metrics.disbursement)),
          collection: String(num(acc.collection) + num(s.metrics.collection)),
          savings: String(num(acc.savings) + num(s.metrics.savings)),
          parLimit: 0,
        }),
        { newMembers: 0, disbursement: '0', collection: '0', savings: '0', parLimit: 0 },
      );
      if (!splitWithinParent(input.metrics, parent.metrics, sum)) {
        throw new WorkDemoError(422, 'VALIDATION_ERROR', 'অফিসারদের লক্ষ্যমাত্রার যোগফল শাখার লক্ষ্যমাত্রা ছাড়িয়ে যায় / Officer splits exceed the branch target');
      }
    }
    existing.metrics = input.metrics;
    existing.ownerName = input.ownerName;
    existing.parentId = input.parentId ?? existing.parentId;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  if (input.scope === 'officer' && input.parentId) {
    const parent = store.targets.find((t) => t.id === input.parentId && t.scope === 'branch');
    if (!parent) throw new WorkDemoError(404, 'NOT_FOUND', 'Parent branch target not found');
    const siblings = store.targets.filter((t) => t.parentId === input.parentId && t.scope === 'officer');
    const sum = siblings.reduce(
      (acc, s) => ({
        newMembers: acc.newMembers + s.metrics.newMembers,
        disbursement: String(num(acc.disbursement) + num(s.metrics.disbursement)),
        collection: String(num(acc.collection) + num(s.metrics.collection)),
        savings: String(num(acc.savings) + num(s.metrics.savings)),
        parLimit: 0,
      }),
      { newMembers: 0, disbursement: '0', collection: '0', savings: '0', parLimit: 0 },
    );
    if (!splitWithinParent(input.metrics, parent.metrics, sum)) {
      throw new WorkDemoError(422, 'VALIDATION_ERROR', 'অফিসারদের লক্ষ্যমাত্রার যোগফল শাখার লক্ষ্যমাত্রা ছাড়িয়ে যায় / Officer splits exceed the branch target');
    }
  }

  const target: WorkTarget = {
    id: randomUUID(),
    orgId: store.orgId,
    scope: input.scope,
    ownerBranchId: input.ownerBranchId ?? null,
    ownerStaffId: input.ownerStaffId ?? null,
    ownerName: input.ownerName,
    parentId: input.parentId ?? null,
    period: input.period,
    metrics: input.metrics,
    createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.targets.push(target);
  return target;
}

/** Stored actuals (the Supabase path computes these live). */
export function workActuals(store: WorkDemoData, scope: WorkTarget['scope'], ownerId: string | null, period: string): TargetMetrics {
  return (
    store.actuals[actualKey(scope, ownerId, period)] ?? {
      newMembers: 0,
      disbursement: '0.00',
      collection: '0.00',
      savings: '0.00',
      parLimit: 0,
    }
  );
}

/** Testing/admin helper: set actuals like a nightly aggregation would. */
export function setWorkActuals(store: WorkDemoData, scope: WorkTarget['scope'], ownerId: string | null, period: string, metrics: TargetMetrics): void {
  store.actuals[actualKey(scope, ownerId, period)] = metrics;
}
