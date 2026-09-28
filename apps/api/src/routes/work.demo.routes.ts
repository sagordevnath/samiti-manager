/**
 * ── Work demo router ─────────────────────────────────────────────────────────
 * Task engine (list/create/transition/comment), auto-task generation from
 * other modules, delegation + bulk reassignment, and the target cascade with
 * achievement. Mirrors migration 0036 for the demo path.
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
  type TaskDelegation,
  type WorkTask,
} from '@samity/shared';
import {
  WorkDemoError,
  addWorkTaskComment,
  bulkReassignWorkTasks,
  createWorkTask,
  delegateWorkTask,
  generateAutoTask,
  getWorkTask,
  listWorkDelegations,
  listWorkTargets,
  listWorkTasks,
  updateWorkTask,
  upsertWorkTarget,
  workActuals,
  workDemoStore,
} from '../lib/work-store.js';
import {
  buildInbox,
  createAudit,
  createFinding,
  dailyDigest,
  followUpFinding,
  listAudits,
  listEscalations,
  listFindings,
  listSupervisions,
  respondFinding,
  runEscalationSweep,
  sampleForAudit,
  setAuditStatus,
  submitSupervision,
  workAuditStore,
} from '../lib/work-audit-store.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

function workError(err: unknown): never {
  if (err instanceof WorkDemoError) throw new AppError(err.status, err.code as never, err.message);
  throw err as Error;
}

/** The demo auth user: kamal (field officer) by default; admin via header override used by tests/preview. */
function actor(req: RequestWithAuth): { id: string; name: string; isAdmin: boolean; role: string } {
  const role = req.auth!.role;
  const id = req.auth!.userId;
  const isAdmin = role === 'super_admin' || role === 'org_admin';
  const name = req.auth!.email.split('@')[0] ?? 'user';
  return { id, name, isAdmin, role };
}

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const STAFF_F3 = '00000000-0000-4000-8000-0000000000f3'; // seeded BM as assigner for auto tasks
const STAFF_F1 = '00000000-0000-4000-8000-0000000000f1';
const STAFF_F2 = '00000000-0000-4000-8000-0000000000f2';

const STAFF_NAMES: Record<string, string> = {
  [STAFF_F1]: 'কমল হোসেন',
  [STAFF_F2]: 'নুসরাত জাহান',
  [STAFF_F3]: 'আব্দুল করিম',
};

/** Resolve a staff picker body → assignee identity. */
function staffRef(body: { assigneeId?: string; assigneeName?: string; toStaffId?: string; toStaffName?: string; assignee?: string }): { id: string; name: string } {
  const id = body.assignee ?? body.assigneeId ?? body.toStaffId;
  if (!id) throw new AppError(400, 'VALIDATION_ERROR', 'দায়িত্বপ্রাপ্ত নির্বাচন করুন / Assignee required');
  const known = STAFF_NAMES[id];
  const name = body.assigneeName ?? body.toStaffName ?? known;
  if (!name) throw new AppError(400, 'VALIDATION_ERROR', 'নাম প্রয়োজন / Name required');
  return { id, name };
}

export const workDemoRouter = Router();
workDemoRouter.use(requireAuth);

// small schema fragment used below
import { z } from 'zod';
const require_ids = z.object({ fromStaffId: z.string().uuid(), toStaffId: z.string().uuid() });

// ── Tasks ───────────────────────────────────────────────────────────────────
workDemoRouter.get(
  '/tasks',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const store = workDemoStore();
    const me = actor(req);
    const items = listWorkTasks(store, {
      assigneeId: (req.query['assigneeId'] as string | undefined) ?? (req.query['mine'] === '1' ? me.id : undefined),
      branchId: (req.query['branchId'] as string | undefined) ?? undefined,
      status: (req.query['status'] as string | undefined) ?? undefined,
      type: (req.query['type'] as string | undefined) ?? undefined,
      overdueOnly: req.query['overdue'] === '1',
    });
    res.json({ items });
  }),
);

workDemoRouter.get(
  '/tasks/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(getWorkTask(workDemoStore(), req.params['id'] as string));
    } catch (err) {
      workError(err);
    }
  }),
);

workDemoRouter.post(
  '/tasks',
  requirePermission('member:write'),
  validate(taskCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const me = actor(req);
      const assignee = staffRef(req.body);
      const task = createWorkTask(workDemoStore(), {
        orgId: ORG_ID,
        branchId: (req.body['branchId'] as string | undefined) ?? null,
        type: req.body['type'],
        title: req.body['title'],
        description: req.body['description'],
        assigneeId: assignee.id,
        assigneeName: assignee.name,
        assignerId: me.id,
        assignerName: me.name,
        dueDate: req.body['dueDate'],
        priority: req.body['priority'],
        link: req.body['link'],
        attachments: req.body['attachments'],
      });
      res.status(201).json(task);
    } catch (err) {
      workError(err);
    }
  }),
);

workDemoRouter.patch(
  '/tasks/:id',
  requirePermission('member:read'),
  validate(taskUpdateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const me = actor(req);
      const task = updateWorkTask(workDemoStore(), req.params['id'] as string, req.body, { id: me.id, isAdmin: me.isAdmin });
      res.json(task);
    } catch (err) {
      workError(err);
    }
  }),
);

workDemoRouter.post(
  '/tasks/:id/comments',
  requirePermission('member:read'),
  validate(taskCommentSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const me = actor(req);
      const task = addWorkTaskComment(workDemoStore(), req.params['id'] as string, { id: me.id, name: me.name }, req.body['text']);
      res.status(201).json(task);
    } catch (err) {
      workError(err);
    }
  }),
);

// ── Auto-generated tasks (Module 12 hook) ───────────────────────────────────
workDemoRouter.post(
  '/tasks/auto',
  requirePermission('member:write'),
  validate(autoTaskGenerateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const assignee = staffRef(req.body);
      const task = generateAutoTask(
        workDemoStore(),
        { ...req.body, assigneeId: assignee.id, assigneeName: assignee.name },
        { id: STAFF_F3, name: 'আব্দুল করিম (সিস্টেম)' },
      );
      res.status(201).json(task);
    } catch (err) {
      workError(err);
    }
  }),
);

// ── Delegation & reassignment ───────────────────────────────────────────────
workDemoRouter.post(
  '/tasks/:id/reassign',
  requirePermission('member:write'),
  validate(taskReassignSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const to = staffRef(req.body);
      const task = delegateWorkTask(
        workDemoStore(),
        req.params['id'] as string,
        to,
        req.body['reason'] as TaskDelegation['reason'],
        (req.body['note'] as string | undefined) ?? '',
        { id: actor(req).id },
      );
      res.json(task);
    } catch (err) {
      workError(err);
    }
  }),
);

workDemoRouter.post(
  '/reassign-bulk',
  requirePermission('member:write'),
  validate(taskReassignSchema.omit({ toStaffId: true, toStaffName: true }).and(require_ids)),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const toId = req.body['toStaffId'] as string;
      const to = { id: toId, name: STAFF_NAMES[toId] ?? (req.body['toStaffName'] as string | undefined) ?? 'কর্মী' };
      const moved = bulkReassignWorkTasks(
        workDemoStore(),
        req.body['fromStaffId'] as string,
        to,
        req.body['reason'] as TaskDelegation['reason'],
        (req.body['note'] as string | undefined) ?? '',
      );
      res.json({ moved });
    } catch (err) {
      workError(err);
    }
  }),
);

workDemoRouter.get(
  '/delegations',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listWorkDelegations(workDemoStore()) });
  }),
);

// ── Targets & achievement ───────────────────────────────────────────────────
workDemoRouter.get(
  '/targets',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = workDemoStore();
    const period = (req.query['period'] as string | undefined) ?? new Date().toISOString().slice(0, 7);
    const scope = (req.query['scope'] as string | undefined) ?? undefined;
    const targets = listWorkTargets(store, { period, scope });
    const withAchievement = targets.map((t) => {
      const ownerId = t.scope === 'officer' ? t.ownerStaffId : t.scope === 'branch' ? t.ownerBranchId : null;
      return {
        target: t,
        actual: workActuals(store, t.scope, ownerId, t.period),
      };
    });
    res.json({ period, items: withAchievement });
  }),
);

workDemoRouter.put(
  '/targets',
  requirePermission('branch:manage'),
  validate(targetUpsertSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const me = actor(req);
      const target = upsertWorkTarget(
        workDemoStore(),
        {
          scope: req.body['scope'],
          ownerBranchId: req.body['ownerBranchId'] ?? null,
          ownerStaffId: req.body['ownerStaffId'] ?? null,
          ownerName: req.body['ownerName'],
          parentId: req.body['parentId'] ?? null,
          period: req.body['period'],
          metrics: req.body['metrics'],
        },
        me.id,
      );
      res.status(existing_ok(req) ? 200 : 201).json(target);
    } catch (err) {
      workError(err);
    }
  }),
);

function existing_ok(_req: RequestWithAuth): boolean {
  return false; // demo upsert always answers 201 for simplicity
}


// ── 5) Supervision forms (mobile: photos + GPS) ─────────────────────────────
workDemoRouter.get(
  '/supervision',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = workAuditStore();
    res.json({
      items: listSupervisions(store, {
        branchId: (req.query['branchId'] as string | undefined) ?? undefined,
        formType: (req.query['formType'] as string | undefined) ?? undefined,
        since: (req.query['since'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

workDemoRouter.post(
  '/supervision',
  requirePermission('member:write'),
  validate(supervisionSubmitSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const me = actor(req);
      const submission = submitSupervision(workAuditStore(), req.body, { id: me.id, name: me.name });
      res.status(201).json(submission);
    } catch (err) {
      workError(err);
    }
  }),
);

// ── 6) Internal audit: plans, sampling, findings ───────────────────────────
workDemoRouter.get(
  '/audits',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = workAuditStore();
    res.json({ items: listAudits(store, { branchId: (req.query['branchId'] as string | undefined) ?? undefined, status: (req.query['status'] as string | undefined) ?? undefined }) });
  }),
);

workDemoRouter.post(
  '/audits',
  requirePermission('branch:manage'),
  validate(auditPlanCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const me = actor(req);
      res.status(201).json(createAudit(workAuditStore(), req.body, { id: me.id }));
    } catch (err) {
      workError(err);
    }
  }),
);

workDemoRouter.post(
  '/audits/:id/sample',
  requirePermission('branch:manage'),
  validate(auditSampleSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(sampleForAudit(workAuditStore(), req.params['id'] as string, req.body));
    } catch (err) {
      workError(err);
    }
  }),
);

workDemoRouter.post(
  '/audits/:id/status',
  requirePermission('branch:manage'),
  asyncHandler(async (req, res) => {
    try {
      res.json(setAuditStatus(workAuditStore(), req.params['id'] as string, req.body['status']));
    } catch (err) {
      workError(err);
    }
  }),
);

workDemoRouter.get(
  '/findings',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = workAuditStore();
    res.json({
      items: listFindings(store, {
        auditId: (req.query['auditId'] as string | undefined) ?? undefined,
        status: (req.query['status'] as string | undefined) ?? undefined,
        severity: (req.query['severity'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

workDemoRouter.post(
  '/findings',
  requirePermission('branch:manage'),
  validate(findingCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const me = actor(req);
      res.status(201).json(createFinding(workAuditStore(), req.body, { id: me.id }));
    } catch (err) {
      workError(err);
    }
  }),
);

workDemoRouter.post(
  '/findings/:id/respond',
  requirePermission('member:write'),
  validate(findingRespondSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(respondFinding(workAuditStore(), req.params['id'] as string, req.body));
    } catch (err) {
      workError(err);
    }
  }),
);

workDemoRouter.post(
  '/findings/:id/followup',
  requirePermission('branch:manage'),
  validate(findingFollowUpSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const me = actor(req);
      res.json(followUpFinding(workAuditStore(), req.params['id'] as string, req.body, { name: me.name }));
    } catch (err) {
      workError(err);
    }
  }),
);

// ── 7) Approval inbox ───────────────────────────────────────────────────────
workDemoRouter.get(
  '/inbox',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: buildInbox() });
  }),
);

// ── 8) Escalations ──────────────────────────────────────────────────────────
workDemoRouter.post(
  '/escalations/sweep',
  requirePermission('branch:manage'),
  asyncHandler(async (_req, res) => {
    res.json({ created: runEscalationSweep(workAuditStore()) });
  }),
);

workDemoRouter.get(
  '/escalations',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listEscalations(workAuditStore(), (req.query['entityType'] as string | undefined) ?? undefined) });
  }),
);

// ── 9) Digest ───────────────────────────────────────────────────────────────
workDemoRouter.get(
  '/digest',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const store = workAuditStore();
    const role = (req.query['role'] as string | undefined) ?? actor(req).role;
    const date = (req.query['date'] as string | undefined) ?? undefined;
    res.json(dailyDigest(store, role, date));
  }),
);


/** Shape exported for tests that want to assert on task JSON. */
export type { WorkTask };
