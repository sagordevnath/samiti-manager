/**
 * ── HR demo router ───────────────────────────────────────────────────────────
 * Staff master (encrypted NID/bank), recruitment lite, attendance (GPS+selfie
 * for field / terminal for office), leave with balances, holiday calendar,
 * transfer & promotion orders. Mirrors migration 0032 for the demo path.
 */
import { Router } from 'express';
import {
  applicantCreateSchema,
  applicantStatusSchema,
  educationSchema,
  fieldCheckInSchema,
  holidaySchema as hrHolidayInputSchema,
  interviewScoreSchema,
  leaveRequestSchema,
  movementCreateSchema,
  officeCheckInSchema,
  staffCreateSchema,
  staffUpdateSchema,
  vacancyCreateSchema,
  vacancyDecisionSchema,
  type Applicant,
} from '@samity/shared';
import {
  HrDemoError,
  addHrEducation,
  addHrHoliday,
  addHrInterviewScore,
  applyHrMovement,
  checkInField,
  checkInOffice,
  confirmHrStaff,
  createHrApplicant,
  createHrMovement,
  createHrStaff,
  createHrVacancy,
  decideHrLeave,
  decideHrMovement,
  decideHrVacancy,
  getHrStaff,
  hrDemoStore,
  hrLeaveBalance,
  hrMovementOrderText,
  listHrApplicants,
  listHrAttendance,
  listHrHolidays,
  listHrLeave,
  listHrMovements,
  listHrStaff,
  listHrVacancies,
  offerHrApplicant,
  requestHrLeave,
  resetHrDemoStore,
  setHrApplicantStatus,
  updateHrStaff,
} from '../lib/hr-store.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';

function hrError(err: unknown): never {
  if (err instanceof HrDemoError) throw new AppError(err.status, err.code as never, err.message);
  throw err as Error;
}

const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const todayStr = () => new Date().toISOString().slice(0, 10);

export const hrDemoRouter = Router();
hrDemoRouter.use(requireAuth);

// ── 1) Staff master ─────────────────────────────────────────────────────────
hrDemoRouter.get(
  '/staff',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({
      items: listHrStaff(hrDemoStore(), {
        branchId: (req.query['branchId'] as string | undefined) ?? undefined,
        status: (req.query['status'] as string | undefined) ?? undefined,
        q: (req.query['q'] as string | undefined) ?? undefined,
      }),
    });
  }),
);

hrDemoRouter.get(
  '/staff/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.json(getHrStaff(hrDemoStore(), req.params['id'] as string));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.post(
  '/staff',
  requirePermission('org:manage'),
  validate(staffCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.status(201).json(createHrStaff(hrDemoStore(), req.body, req.auth!.orgId ?? '00000000-0000-4000-8000-0000000000aa'));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.patch(
  '/staff/:id',
  requirePermission('org:manage'),
  validate(staffUpdateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.json(updateHrStaff(hrDemoStore(), req.params['id'] as string, req.body));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.post(
  '/staff/:id/confirm',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.json(confirmHrStaff(hrDemoStore(), req.params['id'] as string, req.auth!.userId));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.post(
  '/staff/:id/education',
  requirePermission('org:manage'),
  validate(educationSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(addHrEducation(hrDemoStore(), req.params['id'] as string, req.body));
    } catch (err) {
      hrError(err);
    }
  }),
);

// ── 2) Recruitment lite ─────────────────────────────────────────────────────
hrDemoRouter.get(
  '/vacancies',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listHrVacancies(hrDemoStore()) });
  }),
);

hrDemoRouter.post(
  '/vacancies',
  requirePermission('branch:manage'),
  validate(vacancyCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.status(201).json(createHrVacancy(hrDemoStore(), req.body, req.auth!.userId));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.post(
  '/vacancies/:id/decision',
  requirePermission('org:manage'),
  validate(vacancyDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { decision: 'approve' | 'reject'; note?: string };
      res.json(decideHrVacancy(hrDemoStore(), req.params['id'] as string, body.decision, req.auth!.userId, body.note));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.get(
  '/applicants',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listHrApplicants(hrDemoStore(), (req.query['vacancyId'] as string | undefined) ?? undefined) });
  }),
);

hrDemoRouter.post(
  '/applicants',
  requirePermission('branch:manage'),
  validate(applicantCreateSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(createHrApplicant(hrDemoStore(), req.body));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.patch(
  '/applicants/:id/status',
  requirePermission('branch:manage'),
  validate(applicantStatusSchema),
  asyncHandler(async (req, res) => {
    try {
      const body = req.body as { status: Applicant['status']; offeredSalary?: string | null };
      res.json(setHrApplicantStatus(hrDemoStore(), req.params['id'] as string, body.status, body.offeredSalary));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.post(
  '/applicants/:id/interview',
  requirePermission('branch:manage'),
  validate(interviewScoreSchema),
  asyncHandler(async (req, res) => {
    try {
      res.json(addHrInterviewScore(hrDemoStore(), req.params['id'] as string, req.body));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.post(
  '/applicants/:id/offer',
  requirePermission('org:manage'),
  asyncHandler(async (req, res) => {
    try {
      const body = req.body as { offeredSalary?: string };
      res.json(offerHrApplicant(hrDemoStore(), req.params['id'] as string, body.offeredSalary ?? '16500.00'));
    } catch (err) {
      hrError(err);
    }
  }),
);

// ── 3) Attendance & leave ───────────────────────────────────────────────────
hrDemoRouter.get(
  '/attendance',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({
      items: listHrAttendance(
        hrDemoStore(),
        (req.query['date'] as string) ?? todayStr(),
        (req.query['branchId'] as string | undefined) ?? undefined,
      ),
    });
  }),
);

hrDemoRouter.post(
  '/attendance/field-check-in',
  requirePermission('member:read'),
  validate(fieldCheckInSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      // Officer tokens map to the seeded field officer; admins may target any
      // staff member explicitly (staffId survives as a query param).
      const staffId =
        req.auth!.role === 'account_officer'
          ? '00000000-0000-4000-8000-0000000000f1'
          : (req.query['staffId'] as string | undefined) ?? '00000000-0000-4000-8000-0000000000f1';
      res.status(201).json(checkInField(hrDemoStore(), staffId, req.body, req.auth!.userId));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.post(
  '/attendance/office-check-in',
  requirePermission('member:read'),
  validate(officeCheckInSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const staffId = (req.query['staffId'] as string | undefined) ?? '00000000-0000-4000-8000-0000000000f2';
      res.status(201).json(checkInOffice(hrDemoStore(), staffId, req.body));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.get(
  '/leave',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listHrLeave(hrDemoStore(), (req.query['staffId'] as string | undefined) ?? undefined) });
  }),
);

hrDemoRouter.post(
  '/leave',
  requirePermission('member:read'),
  validate(leaveRequestSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(requestHrLeave(hrDemoStore(), req.body));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.post(
  '/leave/:id/decision',
  requirePermission('member:approve'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { decision: 'approve' | 'reject' };
      res.json(decideHrLeave(hrDemoStore(), req.params['id'] as string, body.decision, req.auth!.userId));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.get(
  '/leave-balances/:staffId',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json(hrLeaveBalance(hrDemoStore(), req.params['staffId'] as string, todayStr().slice(0, 4)));
  }),
);

hrDemoRouter.get(
  '/holidays',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listHrHolidays(hrDemoStore()) });
  }),
);

hrDemoRouter.post(
  '/holidays',
  requirePermission('org:manage'),
  validate(hrHolidayInputSchema),
  asyncHandler(async (req, res) => {
    try {
      res.status(201).json(addHrHoliday(hrDemoStore(), req.body));
    } catch (err) {
      hrError(err);
    }
  }),
);

// ── 4) Transfer & promotion ─────────────────────────────────────────────────
hrDemoRouter.get(
  '/movements',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listHrMovements(hrDemoStore()) });
  }),
);

hrDemoRouter.post(
  '/movements',
  requirePermission('org:manage'),
  validate(movementCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.status(201).json(createHrMovement(hrDemoStore(), req.body, req.auth!.userId));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.post(
  '/movements/:id/decision',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      const body = req.body as { decision: 'approve' | 'reject' };
      res.json(decideHrMovement(hrDemoStore(), req.params['id'] as string, body.decision, req.auth!.userId));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.post(
  '/movements/:id/apply',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    try {
      res.json(applyHrMovement(hrDemoStore(), req.params['id'] as string, req.auth!.userId));
    } catch (err) {
      hrError(err);
    }
  }),
);

hrDemoRouter.get(
  '/movements/:id/order',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    try {
      res.type('text/plain; charset=utf-8').send(hrMovementOrderText(hrDemoStore(), req.params['id'] as string));
    } catch (err) {
      hrError(err);
    }
  }),
);

/** Test/preview convenience. */
hrDemoRouter.post('/__reset', (_req, res) => {
  resetHrDemoStore();
  res.json({ ok: true });
});

void BRANCH_DHAKA;

/* ═══════════════════════════════════════════════════════════════════════
   Payroll, PF, performance & discipline (req 5–9) — migration 0034 path.
   ═══════════════════════════════════════════════════════════════════════ */
import {
  appraisalSchema,
  disciplineCaseSchema,
  disciplineCloseSchema,
  kpiActualsSchema,
  pfAdjustmentSchema,
  payrollRunSchema,
  salaryStructureSchema,
  payslipText,
  COMPONENT_LABELS_BN,
  type PayrollLine,
  type PayrollStatus,
} from '@samity/shared';
import {
  addPfEntry,
  bankSheetFor,
  closeDisciplineCase,
  createAppraisal,
  createDisciplineCase,
  createPayrollRun,
  decidePayrollRun,
  getPayrollRun,
  hrPayrollStore,
  listAppraisals,
  listDisciplineCases,
  listKpiScorecards,
  listPayrollRuns,
  listPfLedger,
  listSalaryStructures,
  payslipFor,
  resetHrPayrollStore,
  reviewAppraisal,
  selfServiceSummary,
  settleGratuity,
  upsertKpiScorecard,
  upsertSalaryStructure,
} from '../lib/hr-payroll-store.js';

const P = hrPayrollStore;

/** Role guard: HR/Director-level = super_admin/org_admin. */
function requireHrDirector(req: RequestWithAuth): void {
  if (!['super_admin', 'org_admin'].includes(req.auth!.role)) {
    throw new AppError(403, 'FORBIDDEN', 'শুধু এইচআর ও পরিচালক দেখতে পারেন / HR and Director only');
  }
}

// ── 5) Salary structures ───────────────────────────────────────────────────
hrDemoRouter.get(
  '/payroll/structures',
  requirePermission('member:read'),
  asyncHandler(async (_req, res) => {
    res.json({ items: listSalaryStructures(P()) });
  }),
);

hrDemoRouter.put(
  '/payroll/structures',
  requirePermission('org:manage'),
  validate(salaryStructureSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const structure = upsertSalaryStructure(P(), req.body, req.auth!.orgId ?? hrDemoStore().orgId);
    res.status(201).json(structure);
  }),
);

// ── 5) Payroll runs ────────────────────────────────────────────────────────
hrDemoRouter.get(
  '/payroll/runs',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    res.json({ items: listPayrollRuns(P(), req.auth!.orgId ?? hrDemoStore().orgId) });
  }),
);

hrDemoRouter.get(
  '/payroll/runs/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json(getPayrollRun(P(), req.params['id'] as string));
  }),
);

hrDemoRouter.post(
  '/payroll/runs',
  requirePermission('org:manage'),
  validate(payrollRunSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    res.status(201).json(createPayrollRun(P(), req.body, req.auth!.orgId ?? hrDemoStore().orgId));
  }),
);

hrDemoRouter.post(
  '/payroll/runs/:id/decision',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const action = (req.body as { action?: string }).action === 'pay' ? 'pay' : 'approve';
    res.json(decidePayrollRun(P(), req.params['id'] as string, action, req.auth!.userId));
  }),
);

hrDemoRouter.get(
  '/payroll/runs/:id/payslip/:staffId',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const { run, lineIndex } = payslipFor(P(), req.params['id'] as string, req.params['staffId'] as string);
    const line = run.lines[lineIndex] as PayrollLine;
    res.json({ line, text: payslipText(line, run.period, 'সমিতি ম্যানেজার') });
  }),
);

hrDemoRouter.get(
  '/payroll/runs/:id/bank-sheet',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: bankSheetFor(P(), req.params['id'] as string) });
  }),
);

// ── 6) PF ledger + gratuity ────────────────────────────────────────────────
hrDemoRouter.get(
  '/pf',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listPfLedger(P(), (req.query['staffId'] as string) || undefined) });
  }),
);

hrDemoRouter.post(
  '/pf',
  requirePermission('org:manage'),
  validate(pfAdjustmentSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    res.status(201).json(addPfEntry(P(), req.body, req.auth!.orgId ?? hrDemoStore().orgId));
  }),
);

hrDemoRouter.post(
  '/pf/gratuity',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { staffId, leavingDate } = req.body as { staffId: string; leavingDate: string };
    res.status(201).json(settleGratuity(P(), staffId, leavingDate, req.auth!.orgId ?? hrDemoStore().orgId));
  }),
);

// ── 7) KPI + appraisal ─────────────────────────────────────────────────────
hrDemoRouter.get(
  '/performance/kpi',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listKpiScorecards(P(), (req.query['staffId'] as string) || undefined) });
  }),
);

hrDemoRouter.put(
  '/performance/kpi/:staffId/:period',
  requirePermission('branch:manage'),
  validate(kpiActualsSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const card = upsertKpiScorecard(
      P(),
      req.params['staffId'] as string,
      req.params['period'] as string,
      req.body,
      req.auth!.orgId ?? hrDemoStore().orgId,
    );
    res.status(201).json(card);
  }),
);

hrDemoRouter.get(
  '/performance/appraisals',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    res.json({ items: listAppraisals(P(), (req.query['staffId'] as string) || undefined) });
  }),
);

hrDemoRouter.post(
  '/performance/appraisals',
  requirePermission('branch:manage'),
  validate(appraisalSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    res.status(201).json(createAppraisal(P(), req.body, req.auth!.orgId ?? hrDemoStore().orgId));
  }),
);

hrDemoRouter.post(
  '/performance/appraisals/:id/review',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { note } = req.body as { note?: string };
    res.json(reviewAppraisal(P(), req.params['id'] as string, req.auth!.userId, note ?? 'রিভিউ সম্পন্ন')); 
  }),
);

// ── 8) Disciplinary (HR/Director only) ─────────────────────────────────────
hrDemoRouter.get(
  '/discipline',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    requireHrDirector(req);
    res.json({ items: listDisciplineCases(P()) });
  }),
);

hrDemoRouter.post(
  '/discipline',
  requirePermission('member:read'),
  validate(disciplineCaseSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    requireHrDirector(req);
    res.status(201).json(createDisciplineCase(P(), req.body, req.auth!.userId, req.auth!.orgId ?? hrDemoStore().orgId));
  }),
);

hrDemoRouter.post(
  '/discipline/:id/close',
  requirePermission('member:read'),
  validate(disciplineCloseSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    requireHrDirector(req);
    res.json(closeDisciplineCase(P(), req.params['id'] as string, req.body, req.auth!.userId));
  }),
);

hrDemoRouter.get(
  '/discipline/:id/letter',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    requireHrDirector(req);
    const c = listDisciplineCases(P()).find((x) => x.id === req.params['id']);
    if (!c) throw new AppError(404, 'NOT_FOUND', 'Case not found');
    const { renderWarningLetterBn, renderWarningLetterEn } = await import('@samity/shared');
    res.json({ bn: renderWarningLetterBn(c, 'সমিতি ম্যানেজার'), en: renderWarningLetterEn(c, 'Samity Manager') });
  }),
);

// ── 9) Self-service ────────────────────────────────────────────────────────
hrDemoRouter.get(
  '/self-service',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    // ?staffId= for admins; staff without org:manage can only see their own
    // mapped record (demo maps the officer token to the seeded field officer).
    let staffId = (req.query['staffId'] as string) || '';
    if (!staffId) {
      staffId = req.auth!.role === 'account_officer' ? '00000000-0000-4000-8000-0000000000f1' : '00000000-0000-4000-8000-0000000000f2';
    } else if (!['super_admin', 'org_admin'].includes(req.auth!.role)) {
      const allowed = req.auth!.role === 'account_officer' ? '00000000-0000-4000-8000-0000000000f1' : '00000000-0000-4000-8000-0000000000f2';
      if (staffId !== allowed) throw new AppError(403, 'FORBIDDEN', 'শুধু নিজের তথ্য / Own data only');
    }
    res.json(selfServiceSummary(P(), staffId));
  }),
);

/** Test/preview convenience for the payroll stores. */
hrDemoRouter.post('/payroll/__reset', (_req, res) => {
  resetHrPayrollStore();
  res.json({ ok: true });
});

/** Convert store-level HrDemoErrors from the payroll routes into AppErrors. */
hrDemoRouter.use((err: unknown, _req: unknown, _res: unknown, next: (e?: unknown) => void) => {
  if (err instanceof HrDemoError) {
    next(new AppError(err.status, err.code as never, err.message));
    return;
  }
  next(err);
});

void COMPONENT_LABELS_BN;
void payslipText;
