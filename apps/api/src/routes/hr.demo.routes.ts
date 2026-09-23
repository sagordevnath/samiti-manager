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
