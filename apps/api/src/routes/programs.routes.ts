/**
 * ── Programs & projects demo router ──────────────────────────────────────────
 * Project register (donor/grant/budget/fund code), logframe with indicator
 * values + evidence, beneficiaries/enrollments/services, activity planner and
 * training batches with attendance, test scores and certificates.
 * Mirrors migration 0044 for the demo path.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  activitySchema,
  beneficiarySchema,
  caseFileSchema,
  enrollmentSchema,
  fieldVisitSchema,
  fundingSourceSchema,
  indicatorValueSchema,
  logframeEntrySchema,
  projectExpenseSchema,
  projectSchema,
  serviceRecordSchema,
  testScoreSchema,
  trainingAttendanceSchema,
  trainingBatchSchema,
  buildDonorReportHtml,
  type CaseStatus,
  type ProjectAction,
} from '@samity/shared';
import {
  ProgramsError,
  addExpense,
  addFundingSource,
  addIndicatorValue,
  addLogframeEntry,
  addVisit,
  budgetAlerts,
  caseAccessLog,
  caseStats,
  createActivity,
  createBatch,
  createBeneficiary,
  createCase,
  createProject,
  decideActivity,
  decideCase,
  decideProject,
  donorUtilizationRows,
  enrollBeneficiary,
  generateDonorReport,
  getCaseDetail,
  getDonorReport,
  getFundingSource,
  getVisit,
  issueCertificate,
  listActivities,
  listAttendance,
  listBatches,
  listBeneficiaries,
  listCases,
  listCertificates,
  listDonorReports,
  listEnrollments,
  listExpenses,
  listFundingSources,
  listIndicatorValues,
  listLogframe,
  listProjects,
  listScores,
  listServices,
  listVisits,
  markAttendance,
  programsStore,
  projectBudgetStatus,
  recordService,
  resetProgramsStore,
  setTestScore,
  statsForBatch,
  type Viewer,
} from '../lib/programs-store.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

function pgError(err: unknown): never {
  if (err instanceof ProgramsError) throw new AppError(err.status, err.code as never, err.message);
  throw err as Error;
}

/** Admin-ish gate for the register/logframe/batch manage actions. */
const projAction = z.enum(['activate', 'suspend', 'resume', 'close']);

/** The demo viewer identity for case management / access logs. */
function viewerOf(req: RequestWithAuth): Viewer {
  return {
    userId: req.auth?.userId ?? 'unknown',
    userName: req.auth?.email ?? 'unknown',
    role: req.auth?.role ?? 'member',
  };
}

const caseAction = z.enum(['open', 'in_progress', 'referred', 'closed']);

export const programsRouter = Router();
programsRouter.use(requireAuth);

/* ── 1) Project register ──────────────────────────────────────────────────── */

programsRouter.get(
  '/projects',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = programsStore();
    res.json({
      items: listProjects(store, {
        sector: (req.query['sector'] as string | undefined) ?? undefined,
        status: (req.query['status'] as string | undefined) ?? undefined,
        donor: (req.query['donor'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

programsRouter.post(
  '/projects',
  requirePermission('branch:manage'),
  validate(projectSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(createProject(programsStore(), req.body));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.get(
  '/projects/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = programsStore();
    const p = listProjects(store).find((x) => x.id === req.params['id']);
    if (!p) throw new AppError(404, 'NOT_FOUND' as never, 'প্রকল্প পাওয়া যায়নি / Project not found');
    res.json(p);
  }),
);

programsRouter.post(
  '/projects/:id/decision',
  requirePermission('branch:manage'),
  validate(z.object({ action: projAction })),
  asyncHandler(async (req, res) => {
    try {
      res.json(decideProject(programsStore(), req.params['id'] as string, req.body.action as ProjectAction));
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── 2) Logframe ──────────────────────────────────────────────────────────── */

programsRouter.get(
  '/projects/:id/logframe',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = programsStore();
    const entries = listLogframe(store, req.params['id'] as string);
    const values = listIndicatorValues(store);
    res.json({ entries, values });
  }),
);

programsRouter.post(
  '/projects/:id/logframe',
  requirePermission('branch:manage'),
  validate(logframeEntrySchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(addLogframeEntry(programsStore(), req.params['id'] as string, req.body));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.post(
  '/indicator-values',
  requirePermission('member:write'),
  validate(indicatorValueSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(addIndicatorValue(programsStore(), req.body));
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── 3) Beneficiaries, enrollments, services ──────────────────────────────── */

programsRouter.get(
  '/beneficiaries',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = programsStore();
    res.json({
      items: listBeneficiaries(store, {
        projectId: (req.query['projectId'] as string | undefined) ?? undefined,
        village: (req.query['village'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

programsRouter.post(
  '/beneficiaries',
  requirePermission('member:write'),
  validate(beneficiarySchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(createBeneficiary(programsStore(), req.body));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.get(
  '/enrollments',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = programsStore();
    res.json({
      items: listEnrollments(store, {
        beneficiaryId: (req.query['beneficiaryId'] as string | undefined) ?? undefined,
        projectId: (req.query['projectId'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

programsRouter.post(
  '/enrollments',
  requirePermission('member:write'),
  validate(enrollmentSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(enrollBeneficiary(programsStore(), req.body));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.get(
  '/services',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = programsStore();
    res.json({
      items: listServices(store, {
        projectId: (req.query['projectId'] as string | undefined) ?? undefined,
        beneficiaryId: (req.query['beneficiaryId'] as string | undefined) ?? undefined,
        kind: (req.query['kind'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

programsRouter.post(
  '/services',
  requirePermission('member:write'),
  validate(serviceRecordSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(recordService(programsStore(), req.body));
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── 4) Activities & training batches ─────────────────────────────────────── */

programsRouter.get(
  '/activities',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = programsStore();
    res.json({
      items: listActivities(store, {
        projectId: (req.query['projectId'] as string | undefined) ?? undefined,
        start: (req.query['start'] as string | undefined) ?? undefined,
        end: (req.query['end'] as string | undefined) ?? undefined,
        status: (req.query['status'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

programsRouter.post(
  '/activities',
  requirePermission('member:write'),
  validate(activitySchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(createActivity(programsStore(), req.body));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.post(
  '/activities/:id/decision',
  requirePermission('member:write'),
  validate(z.object({ status: z.enum(['done', 'cancelled']) })),
  asyncHandler(async (req, res) => {
    try {
      res.json(decideActivity(programsStore(), req.params['id'] as string, req.body.status));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.get(
  '/batches',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = programsStore();
    res.json({
      items: listBatches(store, { projectId: (req.query['projectId'] as string | undefined) ?? undefined }),
    });
  }),
);

programsRouter.post(
  '/batches',
  requirePermission('branch:manage'),
  validate(trainingBatchSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(createBatch(programsStore(), req.body));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.get(
  '/batches/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = programsStore();
    const batch = store.batches.find((b) => b.id === req.params['id']);
    if (!batch) throw new AppError(404, 'NOT_FOUND' as never, 'ব্যাচ পাওয়া যায়নি / Batch not found');
    res.json({
      batch,
      attendance: listAttendance(store, batch.id),
      scores: listScores(store, batch.id),
      stats: statsForBatch(store, batch.id),
    });
  }),
);

programsRouter.put(
  '/batches/:id/attendance',
  requirePermission('member:write'),
  validate(trainingAttendanceSchema.omit({ batchId: true })),
  asyncHandler(async (req, res) => {
    try {
      res.json(markAttendance(programsStore(), { ...req.body, batchId: req.params['id'] as string }));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.put(
  '/batches/:id/scores',
  requirePermission('member:write'),
  validate(testScoreSchema.omit({ batchId: true })),
  asyncHandler(async (req, res) => {
    try {
      res.json(setTestScore(programsStore(), { ...req.body, batchId: req.params['id'] as string }));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.post(
  '/batches/:id/certificates',
  requirePermission('branch:manage'),
  validate(z.object({ beneficiaryId: z.string().uuid() })),
  asyncHandler(async (req, res) => {
    try {
      const store = programsStore();
      const cert = issueCertificate(store, req.params['id'] as string, req.body.beneficiaryId);
      const batch = store.batches.find((b) => b.id === req.params['id'])!;
      const ben = store.beneficiaries.find((b) => b.id === req.body.beneficiaryId)!;
      res.status(201).json({
        ...cert,
        batch,
        beneficiary: ben,
      });
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.get(
  '/certificates',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = programsStore();
    res.json({
      items: listCertificates(store, { batchId: (req.query['batchId'] as string | undefined) ?? undefined }),
      batches: store.batches,
      beneficiaries: store.beneficiaries,
    });
  }),
);

/* ── 5) Budget monitoring ─────────────────────────────────────────── */

programsRouter.get(
  '/expenses',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = programsStore();
    res.json({
      items: listExpenses(store, {
        projectId: (req.query['projectId'] as string | undefined) ?? undefined,
        start: (req.query['start'] as string | undefined) ?? undefined,
        end: (req.query['end'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

programsRouter.post(
  '/expenses',
  requirePermission('member:write'),
  validate(projectExpenseSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(addExpense(programsStore(), req.body, (req as RequestWithAuth).auth?.email ?? 'unknown'));
    } catch (err) {
      pgError(err);
    }
  }),
);
programsRouter.get(
  '/projects/:id/budget-status',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      const asOf = (req.query['asOf'] as string | undefined) ?? new Date().toISOString().slice(0, 10);
      res.json(projectBudgetStatus(programsStore(), req.params['id'] as string, asOf));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.get(
  '/budget/alerts',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: budgetAlerts(programsStore()) });
  }),
);

programsRouter.get(
  '/budget/donor-utilization',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: donorUtilizationRows(programsStore()) });
  }),
);

/* ── 6) Field monitoring visits ───────────────────────────────────── */

programsRouter.get(
  '/visits',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const store = programsStore();
    res.json({
      items: listVisits(store, {
        projectId: (req.query['projectId'] as string | undefined) ?? undefined,
        officerId: (req.query['officerId'] as string | undefined) ?? undefined,
        start: (req.query['start'] as string | undefined) ?? undefined,
        end: (req.query['end'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

programsRouter.post(
  '/visits',
  requirePermission('member:write'),
  validate(fieldVisitSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(addVisit(programsStore(), req.body));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.get(
  '/visits/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(getVisit(programsStore(), req.params['id'] as string));
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── 7) Donor reports ─────────────────────────────────────────────── */

programsRouter.get(
  '/donor-reports',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listDonorReports(programsStore(), { projectId: (req.query['projectId'] as string | undefined) ?? undefined }) });
  }),
);

programsRouter.post(
  '/donor-reports',
  requirePermission('branch:manage'),
  validate(
    z.object({
      projectId: z.string().uuid(),
      periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  ),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(generateDonorReport(programsStore(), req.body.projectId, req.body.periodStart, req.body.periodEnd, (req as RequestWithAuth).auth?.email ?? 'unknown'));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.get(
  '/donor-reports/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(getDonorReport(programsStore(), req.params['id'] as string));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.get(
  '/donor-reports/:id/export',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      const stored = getDonorReport(programsStore(), req.params['id'] as string);
      const html = buildDonorReportHtml(stored.report, 'স্যামিটি ম্যানেজার সমবায় সমিতি', 'Samity Manager Cooperative Society');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', `inline; filename="donor-report-${stored.report.projectCode}-${stored.periodStart}.html"`);
      res.send(html);
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── 8) Sensitive case management ─────────────────────────────────── */
// Case routes carry their own permission tier: only case workers (admins +
// area managers) and the assigned worker see full rows; everyone else gets
// masked rows and CANNOT read restricted fields or the access log. Case data
// is never exposed through any general report endpoint (see 7 above).

programsRouter.get(
  '/cases/stats',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json(caseStats(programsStore()));
  }),
);

programsRouter.get(
  '/cases',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      const rows = listCases(programsStore(), viewerOf(req), {
        status: (req.query['status'] as string | undefined) ?? undefined,
        type: (req.query['type'] as string | undefined) ?? undefined,
      });
      const first = rows[0];
      const restrictedUnlocked = first !== undefined && (first as { restrictedDetails: string | null }).restrictedDetails !== null;
      res.json({ items: rows, restrictedUnlocked });
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.post(
  '/cases',
  requirePermission('member:read'),
  validate(caseFileSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(createCase(programsStore(), req.body, viewerOf(req)));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.get(
  '/cases/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(getCaseDetail(programsStore(), req.params['id'] as string, viewerOf(req)));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.post(
  '/cases/:id/decision',
  requirePermission('member:read'),
  validate(z.object({ status: caseAction })),
  asyncHandler(async (req, res) => {
    try {
      res.json(decideCase(programsStore(), req.params['id'] as string, req.body.status as CaseStatus, viewerOf(req)));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.get(
  '/cases/:id/access-log',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json({ items: caseAccessLog(programsStore(), req.params['id'] as string, viewerOf(req)) });
    } catch (err) {
      pgError(err);
    }
  }),
);

/* ── 9) Grants & borrowing tracker ────────────────────────────────── */

programsRouter.get(
  '/funding',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({
      items: listFundingSources(programsStore(), {
        kind: (req.query['kind'] as string | undefined) ?? undefined,
        status: (req.query['status'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

programsRouter.post(
  '/funding',
  requirePermission('branch:manage'),
  validate(fundingSourceSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(addFundingSource(programsStore(), req.body));
    } catch (err) {
      pgError(err);
    }
  }),
);

programsRouter.get(
  '/funding/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(getFundingSource(programsStore(), req.params['id'] as string));
    } catch (err) {
      pgError(err);
    }
  }),
);

/** Test helper exported for isolation. */
export { resetProgramsStore };
