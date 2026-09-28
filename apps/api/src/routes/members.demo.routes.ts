/**
 * ── Member demo router ────────────────────────────────────────────────────────
 * Admission wizard (create → stage gates → member number → passbook), duplicate
 * screening, org-configurable eligibility rules, status flow with reason codes,
 * transfers with approval, Member 360, notes, and Excel/CSV bulk import with a
 * per-row error report. Serves demo/test mode; the Supabase path uses
 * migrations 0005/0006 with the same shapes.
 */
import { Router } from 'express';
import {
  admissionCreateSchema,
  admissionStageActionSchema,
  duplicateCheckQuerySchema,
  eligibilityRulesSchema,
  memberBulkImportSchema,
  memberDraftPatchSchema,
  memberNoteSchema,
  memberSearchQuerySchema,
  memberStatusChangeSchema,
  memberTransferSchema,
  transferDecisionSchema,
  type MemberLifecycle,
} from '@samity/shared';
import {
  addMemberNote,
  advanceAdmission,
  bulkImportMembers,
  changeMemberStatus,
  checkDuplicates,
  completeTransfer,
  createAdmission,
  decideTransfer,
  duplicateCheck,
  getAdmission,
  getEligibilityRules,
  getMember360,
  getMemberProfile,
  listAdmissions,
  listMembers,
  listStatusHistory,
  listTransfers,
  memberDemoStore,
  MemberDemoError,
  patchAdmissionDraft,
  proposeTransfer,
  updateEligibilityRules,
} from '../lib/member-store.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

function memberError(err: unknown): never {
  if (err instanceof MemberDemoError) throw new AppError(err.status, err.code as never, err.message);
  throw err as Error;
}

function actor(req: RequestWithAuth): { id: string; role: string; permissions: readonly string[] } {
  return { id: req.auth!.userId, role: req.auth!.role, permissions: req.auth!.permissions };
}

export const membersDemoRouter = Router();
membersDemoRouter.use(requireAuth);

// ── Duplicate screening (req 4) ──────────────────────────────────────────────
membersDemoRouter.get(
  '/duplicate-check',
  requirePermission('member:write'),
  validate(duplicateCheckQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const store = memberDemoStore();
    const q = req.query as unknown as { idNumber?: string; mobile?: string; fullName?: string; workingAreaId?: string; branchId?: string };
    const result = duplicateCheck(store, {
      fullName: q.fullName,
      mobile: q.mobile,
      idNumber: q.idNumber,
      workingAreaId: q.workingAreaId,
      branchId: q.branchId,
    });
    res.json(result);
  }),
);

// ── Req 5: eligibility rules (org-configurable) ──────────────────────────────
membersDemoRouter.get(
  '/eligibility-rules',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ rules: getEligibilityRules(memberDemoStore()) });
  }),
);

membersDemoRouter.put(
  '/eligibility-rules',
  requirePermission('branch:manage'),
  validate(eligibilityRulesSchema.partial()),
  asyncHandler(async (req, res) => {
    res.json({ rules: updateEligibilityRules(memberDemoStore(), req.body) });
  }),
);

// ── Admissions wizard (req 1) ────────────────────────────────────────────────
membersDemoRouter.get(
  '/admissions',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const stage = (req.query['stage'] as string | undefined) ?? undefined;
    const branchId = (req.query['branchId'] as string | undefined) ?? undefined;
    res.json({ items: listAdmissions(memberDemoStore(), { stage: stage as never, branchId }) });
  }),
);

membersDemoRouter.post(
  '/admissions',
  requirePermission('member:write'),
  validate(admissionCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { branchId: string; draft: never };
      const { admission, duplicates } = createAdmission(memberDemoStore(), body, actor(req));
      res.status(201).json({ admission, duplicates });
    } catch (err) {
      memberError(err);
    }
  }),
);

membersDemoRouter.get(
  '/admissions/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(getAdmission(memberDemoStore(), req.params['id'] as string));
    } catch (err) {
      memberError(err);
    }
  }),
);

membersDemoRouter.patch(
  '/admissions/:id/draft',
  requirePermission('member:write'),
  validate(memberDraftPatchSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(patchAdmissionDraft(memberDemoStore(), req.params['id'] as string, req.body));
    } catch (err) {
      memberError(err);
    }
  }),
);

membersDemoRouter.post(
  '/admissions/:id/stage',
  requirePermission('member:write'),
  validate(admissionStageActionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.json(advanceAdmission(memberDemoStore(), req.params['id'] as string, req.body, actor(req)));
    } catch (err) {
      memberError(err);
    }
  }),
);

// ── Member list (req 9: search by number/name/NID/mobile) ────────────────────
membersDemoRouter.get(
  '/',
  requirePermission('member:read'),
  validate(memberSearchQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as { page: number; pageSize: number; q?: string; branchId?: string; status?: MemberLifecycle };
    res.json(listMembers(memberDemoStore(), q));
  }),
);

// ── Req 9: bulk import with per-row error report ─────────────────────────────
membersDemoRouter.post(
  '/bulk-import',
  requirePermission('member:write'),
  validate(memberBulkImportSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.status(201).json(bulkImportMembers(memberDemoStore(), req.body, actor(req)));
    } catch (err) {
      memberError(err);
    }
  }),
);

// ── Req 7: transfers (propose → approve/reject → complete) ───────────────────
membersDemoRouter.get(
  '/transfers',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const memberId = (req.query['memberId'] as string | undefined) ?? undefined;
    const stage = (req.query['stage'] as never) ?? undefined;
    res.json({ items: listTransfers(memberDemoStore(), { memberId, stage }) });
  }),
);

membersDemoRouter.post(
  '/:id/transfers',
  requirePermission('member:write'),
  validate(memberTransferSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.status(201).json(proposeTransfer(memberDemoStore(), req.params['id'] as string, req.body, actor(req)));
    } catch (err) {
      memberError(err);
    }
  }),
);

membersDemoRouter.post(
  '/transfers/:transferId/decision',
  requirePermission('member:approve'),
  validate(transferDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const d = req.body as { decision: 'approve' | 'reject'; note?: string };
      res.json(decideTransfer(memberDemoStore(), req.params['transferId'] as string, d.decision, actor(req), d.note));
    } catch (err) {
      memberError(err);
    }
  }),
);

membersDemoRouter.post(
  '/transfers/:transferId/complete',
  requirePermission('member:approve'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.json(completeTransfer(memberDemoStore(), req.params['transferId'] as string, actor(req)));
    } catch (err) {
      memberError(err);
    }
  }),
);

// ── Req 6: status flow with reason codes and dates ───────────────────────────
membersDemoRouter.get(
  '/:id/status-history',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json({ items: listStatusHistory(memberDemoStore(), req.params['id'] as string) });
    } catch (err) {
      memberError(err);
    }
  }),
);

membersDemoRouter.post(
  '/:id/status',
  requirePermission('member:approve'),
  validate(memberStatusChangeSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.json(changeMemberStatus(memberDemoStore(), req.params['id'] as string, req.body, actor(req)));
    } catch (err) {
      memberError(err);
    }
  }),
);

// ── Req 8: Member 360 + notes ────────────────────────────────────────────────
membersDemoRouter.get(
  '/:id/360',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      const store = memberDemoStore();
      const id = req.params['id'] as string;
      // Cross-module demo data: the in-memory stores of the other modules are
      // not joined here; the demo context seeds representative lines so the
      // 360 view is testable end-to-end. The Supabase path queries the real
      // savings_accounts/loans/attendance/insurance tables.
      const demo = (globalThis as unknown as { __memberDemo360?: Record<string, never> }).__memberDemo360 ?? {};
      const ctx = (demo[id] ?? {}) as {
        savings?: { id: string; product: string; balance: string }[];
        loans?: never[];
        attendance?: never[];
        insurance?: never[];
      };
      res.json(
        getMember360(store, id, {
          savings: ctx.savings ?? [],
          loans: ctx.loans ?? [],
          attendance: ctx.attendance ?? [],
          insurance: ctx.insurance ?? [],
        }),
      );
    } catch (err) {
      memberError(err);
    }
  }),
);

membersDemoRouter.post(
  '/:id/notes',
  requirePermission('member:write'),
  validate(memberNoteSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const a = actor(req);
      const note = addMemberNote(memberDemoStore(), req.params['id'] as string, (req.body as { note: string }).note, a.id);
      res.status(201).json(note);
    } catch (err) {
      memberError(err);
    }
  }),
);

// ── Member profile (masked identity, signed doc URLs) ────────────────────────
membersDemoRouter.get(
  '/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(getMemberProfile(memberDemoStore(), req.params['id'] as string));
    } catch (err) {
      memberError(err);
    }
  }),
);
