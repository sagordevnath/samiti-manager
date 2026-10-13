/**
 * ── Work live router (Supabase) ──────────────────────────────────────────────
 * Mirrors work.demo.routes.ts against the real tables (migration 0036):
 * task engine with comments and status flow, auto tasks with dedupe,
 * delegation/reassignment, target cascade with achievement, supervision
 * forms, internal audit (plans/sampling/findings), inbox, escalations, digest.
 */
import { Router } from 'express';
import {
  auditPlanCreateSchema,
  auditSampleSchema,
  autoTaskGenerateSchema,
  findingCreateSchema,
  findingFollowUpSchema,
  findingRespondSchema,
  supervisionSubmitSchema,
  taskCommentSchema,
  taskCreateSchema,
  taskReassignSchema,
  taskUpdateSchema,
  targetUpsertSchema,
  buildAutoTask,
  buildDailyDigest,
  DEFAULT_CHECKLISTS,
  type TaskStatus,
  type TaskType,
  type TaskPriority,
  type WorkTask,
} from '@samity/shared';
import { Conflict, NotFound } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { orgOf, scopeOrg, scopeToOrg } from '../lib/tenant.js';

export const workRouter = Router();
workRouter.use(requireAuth);

const todayStr = () => new Date().toISOString().slice(0, 10);

/** DB row → WorkTask wire shape (comments come from the jsonb column). */
function taskWire(row: Record<string, unknown>): WorkTask {
  return {
    id: String(row['id']),
    orgId: String(row['org_id']),
    branchId: (row['branch_id'] as string) ?? null,
    type: row['type'] as TaskType,
    title: String(row['title']),
    description: String(row['description'] ?? ''),
    assigneeId: String(row['assignee_id']),
    assigneeName: String(row['assignee_name'] ?? ''),
    assignerId: String(row['assigner_id']),
    assignerName: String(row['assigner_name'] ?? ''),
    dueDate: String(row['due_date']),
    priority: row['priority'] as TaskPriority,
    link: {
      kind: (row['link_kind'] as WorkTask['link']['kind']) ?? 'other',
      id: (row['link_id'] as string) ?? null,
      label: String(row['link_label'] ?? ''),
    },
    status: row['status'] as TaskStatus,
    comments: (row['comments'] as WorkTask['comments']) ?? [],
    attachments: (row['attachments'] as string[]) ?? [],
    autoKey: (row['auto_key'] as string) ?? null,
    completedAt: (row['completed_at'] as string) ?? null,
    verifiedAt: (row['verified_at'] as string) ?? null,
    createdAt: String(row['created_at']),
    updatedAt: String(row['updated_at']),
  };
}

// ── Tasks ────────────────────────────────────────────────────────────────────
workRouter.get(
  '/tasks',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin.from('work_tasks').select('*').is('deleted_at', null).order('due_date');
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const assigneeId = (req.query['assigneeId'] as string) || (req.query['mine'] === '1' ? req.auth!.userId : undefined);
    if (assigneeId) query = query.eq('assignee_id', assigneeId);
    const branchId = req.query['branchId'];
    if (typeof branchId === 'string' && branchId) query = query.eq('branch_id', branchId);
    const status = req.query['status'];
    if (typeof status === 'string' && status) query = query.eq('status', status);
    const type = req.query['type'];
    if (typeof type === 'string' && type) query = query.eq('type', type);
    if (req.query['overdue'] === '1') query = query.lt('due_date', todayStr()).not('status', 'in', '(done,verified)');
    const { data, error } = await query.limit(500);
    if (error) throw error;
    res.json({ items: (data ?? []).map((t) => taskWire(t as Record<string, unknown>)) });
  }),
);

workRouter.get(
  '/tasks/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('work_tasks')
      .select('*')
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('Task not found');
    res.json(taskWire(data as Record<string, unknown>));
  }),
);

workRouter.post(
  '/tasks',
  requirePermission('member:write'),
  validate(taskCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as {
      branchId?: string | null;
      type: TaskType;
      title: string;
      description?: string;
      assigneeId: string;
      assigneeName?: string;
      dueDate: string;
      priority?: TaskPriority;
      link?: { kind?: string; id?: string | null; label?: string };
      attachments?: string[];
    };
    const { data: assignee } = await supabaseAdmin
      .from('hr_staff')
      .select('name')
      .eq('id', body.assigneeId)
      .maybeSingle();
    const { data: task, error } = await supabaseAdmin
      .from('work_tasks')
      .insert({
        org_id: orgOf(req),
        branch_id: body.branchId ?? null,
        type: body.type,
        title: body.title,
        description: body.description ?? '',
        assignee_id: body.assigneeId,
        assignee_name: body.assigneeName ?? assignee?.name ?? '',
        assigner_id: req.auth!.userId,
        assigner_name: req.auth!.email.split('@')[0] ?? 'user',
        due_date: body.dueDate,
        priority: body.priority ?? 'normal',
        link_kind: body.link?.kind ?? 'other',
        link_id: body.link?.id ?? null,
        link_label: body.link?.label ?? '',
        status: 'todo',
        comments: [],
        attachments: body.attachments ?? [],
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(taskWire(task as Record<string, unknown>));
  }),
);

workRouter.patch(
  '/tasks/:id',
  requirePermission('member:read'),
  validate(taskUpdateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { status?: TaskStatus; dueDate?: string; priority?: TaskPriority; description?: string };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status) {
      patch['status'] = body.status;
      if (body.status === 'done') patch['completed_at'] = new Date().toISOString();
      if (body.status === 'verified') patch['verified_at'] = new Date().toISOString();
    }
    if (body.dueDate) patch['due_date'] = body.dueDate;
    if (body.priority) patch['priority'] = body.priority;
    if (body.description) patch['description'] = body.description;
    let query = supabaseAdmin
      .from('work_tasks')
      .update(patch)
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null);
    query = scopeToOrg(query, req);
    const { data, error } = await query.select('*').single();
    if (error || !data) throw NotFound('Task not found');
    res.json(taskWire(data as Record<string, unknown>));
  }),
);

workRouter.post(
  '/tasks/:id/comments',
  requirePermission('member:read'),
  validate(taskCommentSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { text: string };
    const { data: task } = await scopeToOrg(supabaseAdmin.from('work_tasks').select('comments'), req)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (!task) throw NotFound('Task not found');
    const comment = {
      id: crypto.randomUUID(),
      authorId: req.auth!.userId,
      authorName: req.auth!.email.split('@')[0] ?? 'user',
      text: body.text,
      createdAt: new Date().toISOString(),
    };
    const { data: updated, error } = await scopeToOrg(
      supabaseAdmin.from('work_tasks').update({ comments: [...((task.comments as WorkTask['comments']) ?? []), comment] }),
      req,
    )
      .eq('id', req.params['id'] as string)
      .select('comments')
      .single();
    if (error) throw error;
    res.status(201).json({ ...comment, total: (updated?.comments as unknown[]).length });
  }),
);

// ── Auto tasks (dedupe on auto_key) ──────────────────────────────────────────
workRouter.post(
  '/tasks/auto',
  requirePermission('member:write'),
  validate(autoTaskGenerateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as {
      source: Parameters<typeof buildAutoTask>[0]['source'];
      linkId: string;
      linkLabel: string;
      branchId?: string | null;
      assigneeId: string;
      assigneeName?: string;
      eventDate?: string;
      note?: string;
    };
    const { data: assignee } = await supabaseAdmin.from('hr_staff').select('name').eq('id', body.assigneeId).maybeSingle();
    const build = buildAutoTask(
      { ...body, assigneeName: body.assigneeName ?? assignee?.name ?? '' },
      orgOf(req),
      { id: '00000000-0000-4000-8000-0000000000aa', name: 'সিস্টেম / System' },
    );
    const i = build.input;
    const { data, error } = await supabaseAdmin
      .from('work_tasks')
      .upsert(
        {
          org_id: orgOf(req),
          branch_id: i.branchId,
          type: i.type,
          title: i.title,
          description: i.description,
          assignee_id: i.assigneeId,
          assignee_name: i.assigneeName,
          assigner_id: i.assignerId,
          assigner_name: i.assignerName,
          due_date: i.dueDate,
          priority: i.priority,
          link_kind: i.link?.kind ?? 'other',
          link_id: i.link?.id ?? null,
          link_label: i.link?.label ?? '',
          status: 'todo',
          comments: [],
          attachments: [],
          auto_key: build.autoKey,
        },
        { onConflict: 'org_id, auto_key' },
      )
      .select('*');
    if (error) {
      if (String(error.message).includes('duplicate key')) throw Conflict('An open task for this event already exists');
      throw error;
    }
    res.status(201).json(taskWire((data?.[0] ?? {}) as Record<string, unknown>));
  }),
);

// ── Delegation & reassignment ────────────────────────────────────────────────
workRouter.post(
  '/tasks/:id/reassign',
  requirePermission('member:write'),
  validate(taskReassignSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { toStaffId: string; toStaffName?: string; reason: 'leave' | 'transfer' | 'workload' | 'other'; note?: string };
    const { data: task } = await scopeToOrg(supabaseAdmin.from('work_tasks').select('assignee_id, status'), req)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (!task) throw NotFound('Task not found');
    if (task.status === 'done' || task.status === 'verified') throw Conflict('Completed tasks cannot be delegated');
    const { data: toStaff } = await supabaseAdmin.from('hr_staff').select('name').eq('id', body.toStaffId).maybeSingle();
    await scopeToOrg(
      supabaseAdmin
        .from('work_tasks')
        .update({ assignee_id: body.toStaffId, assignee_name: body.toStaffName ?? toStaff?.name ?? '', updated_at: new Date().toISOString() }),
      req,
    ).eq('id', req.params['id'] as string);
    await supabaseAdmin.from('task_delegations').insert({
      org_id: orgOf(req),
      task_id: req.params['id'] as string,
      from_staff_id: task.assignee_id,
      to_staff_id: body.toStaffId,
      reason: body.reason,
      note: body.note ?? '',
      created_by: req.auth!.userId,
    });
    const { data: updated } = await supabaseAdmin.from('work_tasks').select('*').eq('id', req.params['id'] as string).maybeSingle();
    res.json(taskWire((updated ?? {}) as Record<string, unknown>));
  }),
);

workRouter.post(
  '/reassign-bulk',
  requirePermission('member:write'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { fromStaffId: string; toStaffId: string; toStaffName?: string; reason: 'leave' | 'transfer' | 'workload' | 'other'; note?: string };
    const { data: openTasks } = await scopeToOrg(supabaseAdmin.from('work_tasks').select('id'), req)
      .eq('assignee_id', body.fromStaffId)
      .not('status', 'in', '(done,verified)')
      .is('deleted_at', null);
    const ids = (openTasks ?? []).map((t) => t.id);
    if (ids.length > 0) {
      const { data: toStaff } = await supabaseAdmin.from('hr_staff').select('name').eq('id', body.toStaffId).maybeSingle();
      await scopeToOrg(
        supabaseAdmin
          .from('work_tasks')
          .update({ assignee_id: body.toStaffId, assignee_name: body.toStaffName ?? toStaff?.name ?? '' }),
        req,
      ).in('id', ids);
      await supabaseAdmin.from('task_delegations').insert({
        org_id: orgOf(req),
        task_id: null,
        from_staff_id: body.fromStaffId,
        to_staff_id: body.toStaffId,
        reason: body.reason,
        note: body.note ?? '',
        created_by: req.auth!.userId,
      });
    }
    res.json({ moved: ids.length });
  }),
);

workRouter.get(
  '/delegations',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('task_delegations').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(200);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((d) => ({
        id: d.id,
        taskId: d.task_id ?? null,
        fromStaffId: d.from_staff_id,
        toStaffId: d.to_staff_id,
        reason: d.reason,
        note: d.note ?? '',
        createdAt: d.created_at,
      })),
    });
  }),
);

// ── Targets & achievement ────────────────────────────────────────────────────
workRouter.get(
  '/targets',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const period = (req.query['period'] as string) ?? new Date().toISOString().slice(0, 7);
    let query = supabaseAdmin.from('work_targets').select('*').eq('period', period).is('deleted_at', null);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const scope = req.query['scope'];
    if (typeof scope === 'string' && scope) query = query.eq('scope', scope);
    const { data: targets, error } = await query;
    if (error) throw error;

    // Live actuals per branch: members joined this month, disbursed loans and
    // savings balances. Collections are NOT attributed here, so the `collection`
    // metric reports 0 on the live path (tracked in docs/backlog.md).
    const [newMembersRes, disbursedRes, savingsRes] = await Promise.all([
      supabaseAdmin.from('members').select('branch_id, count').eq('org_id', orgOf(req)).gte('join_date', `${period}-01`).limit(1000),
      supabaseAdmin.from('loan_applications').select('branch_id, requested_amount').eq('status', 'disbursed'),
      supabaseAdmin.from('savings_accounts').select('branch_id, balance'),
    ]);
    const actualByBranch = new Map<string, { newMembers: number; disbursement: number; collection: number; savings: number }>();
    const bump = (branchId: string | null, fn: (a: { newMembers: number; disbursement: number; collection: number; savings: number }) => void) => {
      if (!branchId) return;
      const a = actualByBranch.get(branchId) ?? { newMembers: 0, disbursement: 0, collection: 0, savings: 0 };
      fn(a);
      actualByBranch.set(branchId, a);
    };
    for (const m of newMembersRes.data ?? []) bump(m.branch_id, (a) => (a.newMembers += 1));
    for (const l of disbursedRes.data ?? []) bump(l.branch_id, (a) => (a.disbursement += Number(l.requested_amount)));
    for (const s of savingsRes.data ?? []) bump(s.branch_id, (a) => (a.savings += Number(s.balance)));

    const items = (targets ?? []).map((t) => {
      const ownerId = t.scope === 'branch' ? t.owner_branch_id : t.owner_staff_id;
      const actualRow = actualByBranch.get(ownerId) ?? { newMembers: 0, disbursement: 0, collection: 0, savings: 0 };
      const metrics = t.metrics as Record<string, number | string>;
      const actual = {
        newMembers: actualRow.newMembers,
        disbursement: actualRow.disbursement.toFixed(2),
        collection: actualRow.collection.toFixed(2),
        savings: actualRow.savings.toFixed(2),
        parLimit: 0,
      };
      void metrics;
      return {
        target: {
          id: t.id,
          orgId: t.org_id,
          scope: t.scope,
          ownerBranchId: t.owner_branch_id ?? null,
          ownerStaffId: t.owner_staff_id ?? null,
          ownerName: t.owner_name,
          parentId: t.parent_id ?? null,
          period: t.period,
          metrics: t.metrics,
          createdBy: t.created_by,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        },
        actual,
      };
    });
    res.json({ period, items });
  }),
);

workRouter.put(
  '/targets',
  requirePermission('branch:manage'),
  validate(targetUpsertSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as {
      scope: 'area' | 'branch' | 'officer';
      ownerBranchId?: string | null;
      ownerStaffId?: string | null;
      ownerName: string;
      parentId?: string | null;
      period: string;
      metrics: Record<string, unknown>;
    };
    const { data, error } = await supabaseAdmin
      .from('work_targets')
      .upsert(
        {
          org_id: orgOf(req),
          scope: body.scope,
          owner_branch_id: body.ownerBranchId ?? null,
          owner_staff_id: body.ownerStaffId ?? null,
          owner_name: body.ownerName,
          parent_id: body.parentId ?? null,
          period: body.period,
          metrics: body.metrics,
          created_by: req.auth!.userId,
        },
        { onConflict: 'org_id, scope, period' },
      )
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ok: true });
  }),
);

// ── 5) Supervision forms ─────────────────────────────────────────────────────
workRouter.get(
  '/supervision',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('supervision_submissions').select('*').is('deleted_at', null).order('submitted_at', { ascending: false }).limit(200);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const branchId = req.query['branchId'];
    if (typeof branchId === 'string' && branchId) query = query.eq('branch_id', branchId);
    const formType = req.query['formType'];
    if (typeof formType === 'string' && formType) query = query.eq('form_type', formType);
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((s) => ({
        id: s.id,
        orgId: s.org_id,
        branchId: s.branch_id,
        formType: s.form_type,
        linkId: s.link_id ?? null,
        linkLabel: s.link_label ?? '',
        submittedBy: s.submitted_by,
        submittedByName: s.submitted_name ?? '',
        submittedAt: s.submitted_at,
        lat: s.lat != null ? Number(s.lat) : null,
        lng: s.lng != null ? Number(s.lng) : null,
        distanceMeters: s.distance_meters != null ? Number(s.distance_meters) : null,
        photos: (s.photos as string[]) ?? [],
        items: (s.items as unknown[]) ?? [],
        exceptions: s.exceptions ?? 0,
        note: s.note ?? '',
      })),
    });
  }),
);

workRouter.post(
  '/supervision',
  requirePermission('member:write'),
  validate(supervisionSubmitSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as {
      branchId: string;
      formType: string;
      linkId?: string | null;
      linkLabel?: string;
      lat?: number | null;
      lng?: number | null;
      distanceMeters?: number | null;
      photos?: string[];
      answers?: Record<string, 'yes' | 'no' | 'na'>;
      note?: string;
    };
    const template = DEFAULT_CHECKLISTS[body.formType as keyof typeof DEFAULT_CHECKLISTS] ?? [];
    const items = template.map((q) => ({ ...q, answer: body.answers?.[q.id] ?? null, note: '' }));
    const exceptions = items.filter((i) => i.answer === 'no').length;
    const { data, error } = await supabaseAdmin
      .from('supervision_submissions')
      .insert({
        org_id: orgOf(req),
        branch_id: body.branchId,
        form_type: body.formType,
        link_id: body.linkId ?? null,
        link_label: body.linkLabel ?? '',
        submitted_by: req.auth!.userId,
        submitted_name: req.auth!.email.split('@')[0] ?? 'user',
        submitted_at: new Date().toISOString(),
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        distance_meters: body.distanceMeters ?? null,
        photos: body.photos ?? [],
        items,
        exceptions,
        note: body.note ?? '',
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, exceptions, ok: true });
  }),
);

// ── 6) Internal audit ────────────────────────────────────────────────────────
workRouter.get(
  '/audits',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('audit_plans').select('*').is('deleted_at', null).order('planned_date', { ascending: false });
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const branchId = req.query['branchId'];
    if (typeof branchId === 'string' && branchId) query = query.eq('branch_id', branchId);
    const status = req.query['status'];
    if (typeof status === 'string' && status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((a) => ({
        id: a.id,
        orgId: a.org_id,
        branchId: a.branch_id,
        branchName: a.branch_name,
        title: a.title,
        plannedDate: a.planned_date,
        leadAuditorId: a.lead_auditor_id,
        leadAuditorName: a.lead_auditor_name ?? '',
        status: a.status,
        loanSample: (a.loan_sample as string[]) ?? [],
        memberSample: (a.member_sample as string[]) ?? [],
        sampleSize: a.sample_size ?? 0,
        createdBy: a.created_by,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      })),
    });
  }),
);

workRouter.post(
  '/audits',
  requirePermission('branch:manage'),
  validate(auditPlanCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { branchId: string; branchName: string; title: string; plannedDate: string; leadAuditorId: string; leadAuditorName?: string; sampleSize?: number };
    const { data, error } = await supabaseAdmin
      .from('audit_plans')
      .insert({
        org_id: orgOf(req),
        branch_id: body.branchId,
        branch_name: body.branchName,
        title: body.title,
        planned_date: body.plannedDate,
        lead_auditor_id: body.leadAuditorId,
        lead_auditor_name: body.leadAuditorName ?? null,
        status: 'planned',
        sample_size: body.sampleSize ?? 10,
        created_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ok: true });
  }),
);

workRouter.post(
  '/audits/:id/sample',
  requirePermission('branch:manage'),
  validate(auditSampleSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as { sampleSize?: number; loanPool?: string[]; memberPool?: string[] };
    const auditId = req.params['id'] as string;
    const n = body.sampleSize ?? 10;
    const pick = (pool: string[]): string[] => [...pool].sort(() => Math.random() - 0.5).slice(0, n);
    let loanSample: string[] = [];
    let memberSample: string[] = [];
    if (body.loanPool) loanSample = pick(body.loanPool);
    else {
      const { data: loans } = await supabaseAdmin.from('loan_applications').select('id').limit(500);
      loanSample = pick((loans ?? []).map((l) => l.id));
    }
    if (body.memberPool) memberSample = pick(body.memberPool);
    else {
      const { data: members } = await supabaseAdmin.from('members').select('id').limit(500);
      memberSample = pick((members ?? []).map((m) => m.id));
    }
    await scopeToOrg(
      supabaseAdmin.from('audit_plans').update({ loan_sample: loanSample, member_sample: memberSample, sample_size: n, updated_at: new Date().toISOString() }),
      req,
    ).eq('id', auditId);
    res.json({ loanSample, memberSample });
  }),
);

workRouter.post(
  '/audits/:id/status',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    const status = (req.body as { status: string }).status;
    const { error } = await scopeToOrg(
      supabaseAdmin.from('audit_plans').update({ status, updated_at: new Date().toISOString() }),
      req,
    ).eq('id', req.params['id'] as string);
    if (error) throw error;
    res.json({ ok: true, status });
  }),
);

workRouter.get(
  '/findings',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('audit_findings').select('*').is('deleted_at', null).order('created_at', { ascending: false });
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const auditId = req.query['auditId'];
    if (typeof auditId === 'string' && auditId) query = query.eq('audit_id', auditId);
    const status = req.query['status'];
    if (typeof status === 'string' && status) query = query.eq('status', status);
    const severity = req.query['severity'];
    if (typeof severity === 'string' && severity) query = query.eq('severity', severity);
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((f) => ({
        id: f.id,
        orgId: f.org_id,
        auditId: f.audit_id,
        ref: f.ref ?? '',
        title: f.title,
        detail: f.detail ?? '',
        severity: f.severity,
        status: f.status,
        response: f.response ?? '',
        respondedAt: f.responded_at ?? null,
        deadline: f.deadline ?? null,
        followUps: (f.follow_ups as unknown[]) ?? [],
        closedAt: f.closed_at ?? null,
        createdBy: f.created_by,
        createdAt: f.created_at,
        updatedAt: f.updated_at,
      })),
    });
  }),
);

workRouter.post(
  '/findings',
  requirePermission('branch:manage'),
  validate(findingCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { auditId: string; ref?: string; title: string; detail?: string; severity: string };
    const { data, error } = await supabaseAdmin
      .from('audit_findings')
      .insert({
        org_id: orgOf(req),
        audit_id: body.auditId,
        ref: body.ref ?? '',
        title: body.title,
        detail: body.detail ?? '',
        severity: body.severity,
        status: 'open',
        follow_ups: [],
        created_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ok: true });
  }),
);

workRouter.post(
  '/findings/:id/respond',
  requirePermission('member:write'),
  validate(findingRespondSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as { response: string; deadline?: string | null };
    const { error } = await scopeToOrg(
      supabaseAdmin
        .from('audit_findings')
        .update({ response: body.response, responded_at: new Date().toISOString(), deadline: body.deadline ?? null, status: 'responded' }),
      req,
    ).eq('id', req.params['id'] as string);
    if (error) throw error;
    res.json({ ok: true });
  }),
);

workRouter.post(
  '/findings/:id/followup',
  requirePermission('branch:manage'),
  validate(findingFollowUpSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { note: string; close?: boolean };
    const { data: f } = await scopeToOrg(supabaseAdmin.from('audit_findings').select('follow_ups'), req)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (!f) throw NotFound('Finding not found');
    const followUp = { id: crypto.randomUUID(), at: new Date().toISOString(), note: body.note, byName: req.auth!.email.split('@')[0] ?? 'auditor' };
    const patch: Record<string, unknown> = { follow_ups: [...((f.follow_ups as unknown[]) ?? []), followUp] };
    if (body.close) {
      patch['status'] = 'closed';
      patch['closed_at'] = new Date().toISOString();
    } else {
      patch['status'] = 'in_followup';
    }
    await scopeToOrg(supabaseAdmin.from('audit_findings').update(patch), req).eq('id', req.params['id'] as string);
    res.json({ ok: true });
  }),
);

// ── 7) Approval inbox (live sources) ─────────────────────────────────────────
workRouter.get(
  '/inbox',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const [appsRes, leavesRes, openingsRes] = await Promise.all([
      supabaseAdmin.from('loan_applications').select('id, application_number, requested_amount, created_at').eq('status', 'submitted').limit(50),
      supabaseAdmin.from('hr_leave_requests').select('id, created_at, hr_staff(name)').eq('status', 'pending').limit(50),
      supabaseAdmin.from('branch_openings').select('id, proposed_at, branches(name)').eq('stage', 'proposed').is('deleted_at', null).limit(50),
    ]);
    const items = [
      ...(appsRes.data ?? []).map((a) => ({
        kind: 'loan_application',
        kindLabelBn: 'ঋণের আবেদন',
        refId: a.id,
        title: a.application_number,
        subtitle: `৳${Number(a.requested_amount).toLocaleString()}`,
        linkTo: `/loans/${a.id}`,
        requestedAt: a.created_at,
        requesterName: '',
        amount: String(a.requested_amount),
        waitingDays: Math.floor((Date.now() - Date.parse(a.created_at)) / 86_400_000),
        escalated: false,
      })),
      ...(leavesRes.data ?? []).map((l) => ({
        kind: 'leave_request',
        kindLabelBn: 'ছুটির আবেদন',
        refId: l.id,
        title: (l.hr_staff as { name?: string } | null)?.name ?? 'কর্মী',
        subtitle: '',
        linkTo: '/hr',
        requestedAt: l.created_at,
        requesterName: '',
        amount: null,
        waitingDays: Math.floor((Date.now() - Date.parse(l.created_at)) / 86_400_000),
        escalated: false,
      })),
      ...(openingsRes.data ?? []).map((o) => ({
        kind: 'branch_opening',
        kindLabelBn: 'শাখা খোলা',
        refId: o.id,
        title: (o.branches as { name?: string } | null)?.name ?? 'শাখা',
        subtitle: '',
        linkTo: '/branches',
        requestedAt: o.proposed_at,
        requesterName: '',
        amount: null,
        waitingDays: Math.floor((Date.now() - Date.parse(o.proposed_at)) / 86_400_000),
        escalated: false,
      })),
    ].sort((a, b) => b.waitingDays - a.waitingDays);
    void appsRes.error;
    void leavesRes.error;
    void openingsRes.error;
    res.json({ items });
  }),
);

// ── 8) Escalations ───────────────────────────────────────────────────────────
workRouter.post(
  '/escalations/sweep',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const today = todayStr();
    const { data: overdueTasks } = await supabaseAdmin
      .from('work_tasks')
      .select('id, due_date')
      .lt('due_date', today)
      .not('status', 'in', '(done,verified)')
      .is('deleted_at', null);
    const { data: overdueFindings } = await supabaseAdmin
      .from('audit_findings')
      .select('id, deadline')
      .not('status', 'eq', 'closed')
      .not('deadline', 'is', null)
      .lt('deadline', today)
      .is('deleted_at', null);
    let created = 0;
    for (const t of overdueTasks ?? []) {
      const days = Math.floor((Date.parse(today) - Date.parse(t.due_date)) / 86_400_000);
      const role = days >= 14 ? 'org_admin' : days >= 7 ? 'area_manager' : 'branch_manager';
      const { error } = await supabaseAdmin
        .from('work_escalations')
        .upsert(
          { org_id: orgOf(req), entity_type: 'task', entity_id: t.id, days_overdue: days, tier_role: role },
          { onConflict: 'org_id, entity_type, entity_id' },
        );
      if (!error) created += 1;
    }
    for (const f of overdueFindings ?? []) {
      const days = Math.floor((Date.parse(today) - Date.parse(f.deadline as string)) / 86_400_000);
      const { error } = await supabaseAdmin
        .from('work_escalations')
        .upsert(
          { org_id: orgOf(req), entity_type: 'finding', entity_id: f.id, days_overdue: days, tier_role: 'org_admin' },
          { onConflict: 'org_id, entity_type, entity_id' },
        );
      if (!error) created += 1;
    }
    res.json({ created });
  }),
);

workRouter.get(
  '/escalations',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('work_escalations').select('*').is('deleted_at', null).order('days_overdue', { ascending: false });
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const entityType = req.query['entityType'];
    if (typeof entityType === 'string' && entityType) query = query.eq('entity_type', entityType);
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((e) => ({
        id: e.id,
        entityType: e.entity_type,
        entityId: e.entity_id,
        daysOverdue: e.days_overdue,
        tierRole: e.tier_role,
        escalatedAt: e.escalated_at,
      })),
    });
  }),
);

// ── 9) Digest ────────────────────────────────────────────────────────────────
workRouter.get(
  '/digest',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const date = (req.query['date'] as string) ?? todayStr();
    const role = (req.query['role'] as string) ?? req.auth!.role;
    const [tasksRes, auditsRes, submissionsRes, findingsRes] = await Promise.all([
      supabaseAdmin.from('work_tasks').select('*').is('deleted_at', null).limit(500),
      supabaseAdmin.from('audit_plans').select('id, title, branch_name, planned_date').is('deleted_at', null),
      supabaseAdmin.from('supervision_submissions').select('submitted_at').gte('submitted_at', `${date}T00:00:00Z`).lt('submitted_at', `${date}T23:59:59Z`),
      supabaseAdmin.from('audit_findings').select('id, title, deadline, status').not('status', 'eq', 'closed').is('deleted_at', null),
    ]);
    const tasks = (tasksRes.data ?? []).map((t) => taskWire(t as Record<string, unknown>));
    const digest = buildDailyDigest(
      role,
      date,
      {
        tasks,
        audits: (auditsRes.data ?? []).map((a) => ({ id: a.id, title: a.title, branchName: a.branch_name, plannedDate: a.planned_date })),
        submissionsToday: (submissionsRes.data ?? []).length,
        findings: (findingsRes.data ?? []).map((f) => ({ id: f.id, title: f.title, status: f.status as never, deadline: f.deadline })),
      },
    );
    res.json(digest);
  }),
);
