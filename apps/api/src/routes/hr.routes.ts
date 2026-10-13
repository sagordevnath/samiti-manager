/**
 * ── HR live router (Supabase) ────────────────────────────────────────────────
 * Mirrors hr.demo.routes.ts against the real tables (migrations 0032/0034):
 * staff master with encrypted NID/bank, recruitment lite, attendance, leave,
 * holidays, movements, payroll, PF, performance, discipline, self-service.
 */
import { Router } from 'express';
import {
  applicantCreateSchema,
  applicantStatusSchema,
  applicantUpdateSchema,
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
  vacancyUpdateSchema,
  EDITABLE_VACANCY_STATUSES,
  type VacancyStatus,
  appraisalSchema,
  disciplineCaseSchema,
  disciplineCloseSchema,
  kpiActualsSchema,
  pfAdjustmentSchema,
  payrollRunSchema,
  salaryStructureSchema,
} from '@samity/shared';
import { Conflict, NotFound } from '../lib/errors.js';
import { encryptIdNumber } from '../lib/member-crypto.js';
import { requireAuth, requirePermission, type RequestWithAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/error.js';
import { validate } from '../middleware/validate.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { orgOf, scopeOrg, scopeToOrg } from '../lib/tenant.js';

export const hrRouter = Router();
hrRouter.use(requireAuth);

const todayStr = () => new Date().toISOString().slice(0, 10);

/** Row → camelCase Staff wire shape (ciphertexts never leave the API). */
function staffWire(row: Record<string, unknown>) {
  return {
    id: row['id'],
    orgId: row['org_id'],
    employeeCode: row['employee_code'],
    name: row['name'],
    nameBn: row['name_bn'] ?? row['name'],
    designation: row['designation'],
    grade: row['grade'],
    branchId: row['branch_id'] ?? null,
    joiningDate: row['joining_date'],
    probationEndDate: row['probation_end_date'] ?? null,
    confirmationDate: row['confirmation_date'] ?? null,
    status: row['status'],
    mobile: row['mobile'] ?? '',
    email: row['email'] ?? null,
    nidEnc: null,
    nidMasked: row['nid_masked'] ?? null,
    bankAccountEnc: null,
    bankName: row['bank_name'] ?? null,
    bankMasked: row['bank_masked'] ?? null,
    monthlyGross: String(row['monthly_gross'] ?? '0'),
    emergencyContactName: row['emergency_contact_name'] ?? null,
    emergencyContactPhone: row['emergency_contact_phone'] ?? null,
    documents: (row['documents'] as unknown[]) ?? [],
    createdAt: row['created_at'],
    updatedAt: row['updated_at'],
  };
}

// ── 1) Staff master ──────────────────────────────────────────────────────────
hrRouter.get(
  '/staff',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('hr_staff').select('*').is('deleted_at', null).order('employee_code');
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const branchId = req.query['branchId'];
    if (typeof branchId === 'string' && branchId) query = query.eq('branch_id', branchId);
    const status = req.query['status'];
    if (typeof status === 'string' && status) query = query.eq('status', status);
    const q = req.query['q'];
    if (typeof q === 'string' && q.trim()) {
      const needle = q.trim().replace(/[,()%\\]/g, '');
      if (needle) query = query.or(`name.ilike.%${needle}%,employee_code.ilike.%${needle}%,mobile.ilike.%${needle}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: (data ?? []).map((s) => staffWire(s as Record<string, unknown>)) });
  }),
);

hrRouter.get(
  '/staff/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('hr_staff')
      .select('*')
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('Staff not found');
    res.json(staffWire(data as Record<string, unknown>));
  }),
);

hrRouter.post(
  '/staff',
  requirePermission('org:manage'),
  validate(staffCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as {
      name: string;
      nameBn: string;
      designation: string;
      grade: string;
      branchId?: string | null;
      joiningDate: string;
      mobile: string;
      email?: string | null;
      nid?: string | null;
      bankAccount?: string | null;
      bankName?: string | null;
      monthlyGross: string;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
    };
    const { count } = await supabaseAdmin.from('hr_staff').select('id', { count: 'exact', head: true }).eq('org_id', orgOf(req));
    const code = `EMP-${String((count ?? 0) + 1).padStart(4, '0')}`;
    const { data, error } = await supabaseAdmin
      .from('hr_staff')
      .insert({
        org_id: orgOf(req),
        employee_code: code,
        name: body.name,
        name_bn: body.nameBn,
        designation: body.designation,
        grade: body.grade,
        branch_id: body.branchId ?? null,
        joining_date: body.joiningDate,
        probation_end_date: null,
        status: 'probation',
        mobile: body.mobile,
        email: body.email ?? null,
        nid_enc: body.nid ? encryptIdNumber(body.nid, orgOf(req)) : null,
        nid_masked: body.nid ? body.nid.slice(-4) : null,
        bank_account_enc: body.bankAccount ? encryptIdNumber(body.bankAccount, orgOf(req)) : null,
        bank_name: body.bankName ?? null,
        bank_masked: body.bankAccount ? body.bankAccount.slice(-4) : null,
        monthly_gross: body.monthlyGross,
        emergency_contact_name: body.emergencyContactName ?? null,
        emergency_contact_phone: body.emergencyContactPhone ?? null,
        created_by: req.auth!.userId,
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(staffWire(data as Record<string, unknown>));
  }),
);

hrRouter.patch(
  '/staff/:id',
  requirePermission('org:manage'),
  validate(staffUpdateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const map: Record<string, string> = {
      name: 'name',
      nameBn: 'name_bn',
      designation: 'designation',
      grade: 'grade',
      branchId: 'branch_id',
      joiningDate: 'joining_date',
      status: 'status',
      mobile: 'mobile',
      email: 'email',
      bankName: 'bank_name',
      monthlyGross: 'monthly_gross',
      emergencyContactName: 'emergency_contact_name',
      emergencyContactPhone: 'emergency_contact_phone',
      confirmationDate: 'confirmation_date',
    };
    for (const [wire, col] of Object.entries(map)) {
      if (body[wire] !== undefined) patch[col] = body[wire];
    }
    if (body['nid']) {
      patch['nid_enc'] = encryptIdNumber(String(body['nid']), orgOf(req));
      patch['nid_masked'] = String(body['nid']).slice(-4);
    }
    if (body['bankAccount']) {
      patch['bank_account_enc'] = encryptIdNumber(String(body['bankAccount']), orgOf(req));
      patch['bank_masked'] = String(body['bankAccount']).slice(-4);
    }
    let query = supabaseAdmin
      .from('hr_staff')
      .update(patch)
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null);
    query = scopeToOrg(query, req);
    const { data, error } = await query.select('*').single();
    if (error || !data) throw NotFound('Staff not found');
    res.json(staffWire(data as Record<string, unknown>));
  }),
);

/**
 * Remove a staff row that was created by mistake.
 *
 * This is always a SOFT delete. `hr_attendance`, `hr_leave_requests`,
 * `hr_payroll_items` and the posting/movement tables all hold NO ACTION
 * references to `hr_staff` (migration 0032/0034), so a hard delete would fail
 * the moment the person has any history — and payroll history has to survive
 * an employee leaving anyway. Setting `deleted_at` hides the row from every
 * list, detail and picker while the ledger keeps pointing at it.
 */
hrRouter.delete(
  '/staff/:id',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin
      .from('hr_staff')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null);
    query = scopeToOrg(query, req);
    const { data, error } = await query.select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw NotFound('Staff not found');
    res.status(204).end();
  }),
);

hrRouter.post(
  '/staff/:id/confirm',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin
      .from('hr_staff')
      .update({ status: 'confirmed', confirmation_date: todayStr(), updated_at: new Date().toISOString() })
      .eq('id', req.params['id'] as string)
      .eq('status', 'probation')
      .is('deleted_at', null);
    query = scopeToOrg(query, req);
    const { data, error } = await query.select('*').single();
    if (error || !data) throw NotFound('Staff not found or not on probation');
    res.json(staffWire(data as Record<string, unknown>));
  }),
);

hrRouter.post(
  '/staff/:id/education',
  requirePermission('org:manage'),
  validate(educationSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { level: string; institution: string; passingYear: number; result: string };
    const { data, error } = await supabaseAdmin
      .from('hr_staff_education')
      .insert({
        org_id: orgOf(req),
        staff_id: req.params['id'] as string,
        level: body.level,
        institution: body.institution,
        passing_year: body.passingYear,
        result: body.result,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ...body });
  }),
);

// ── 2) Recruitment lite ──────────────────────────────────────────────────────
hrRouter.get(
  '/vacancies',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('hr_vacancies').select('*, branches(name)').is('deleted_at', null).order('created_at', { ascending: false });
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((v) => ({
        id: v.id,
        orgId: v.org_id,
        branchId: v.branch_id,
        branchName: v.branches?.name ?? '',
        designation: v.designation,
        headcount: v.headcount,
        reason: v.reason,
        status: v.status,
        requestedBy: v.requested_by,
        decidedBy: v.decided_by ?? null,
        decidedAt: v.decided_at ?? null,
        note: v.note ?? null,
        createdAt: v.created_at,
      })),
    });
  }),
);

hrRouter.post(
  '/vacancies',
  requirePermission('branch:manage'),
  validate(vacancyCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { branchId: string; designation: string; headcount: number; reason: string };
    const { data, error } = await supabaseAdmin
      .from('hr_vacancies')
      .insert({
        org_id: orgOf(req),
        branch_id: body.branchId,
        designation: body.designation,
        headcount: body.headcount,
        reason: body.reason,
        status: 'requested',
        requested_by: req.auth!.userId,
        created_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ok: true });
  }),
);

/**
 * Correct a mistyped vacancy request (wrong headcount or reason). Only a
 * request that has not been rejected/closed can be corrected — once it is
 * dead, delete it and raise a fresh one so the decision audit stays honest.
 */
hrRouter.patch(
  '/vacancies/:id',
  requirePermission('branch:manage'),
  validate(vacancyUpdateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { branchId?: string; designation?: string; headcount?: number; reason?: string };
    let lookup = supabaseAdmin
      .from('hr_vacancies')
      .select('id, status')
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null);
    lookup = scopeToOrg(lookup, req);
    const { data: existing, error: findErr } = await lookup.maybeSingle();
    if (findErr) throw findErr;
    if (!existing) throw NotFound('Vacancy not found');
    if (!EDITABLE_VACANCY_STATUSES.includes(existing.status as VacancyStatus)) {
      throw Conflict('বাতিল/বন্ধ শূন্যপদ সম্পাদনা করা যায় না / A rejected or closed vacancy cannot be edited');
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.branchId !== undefined) patch['branch_id'] = body.branchId;
    if (body.designation !== undefined) patch['designation'] = body.designation;
    if (body.headcount !== undefined) patch['headcount'] = body.headcount;
    if (body.reason !== undefined) patch['reason'] = body.reason;
    const { error } = await scopeToOrg(supabaseAdmin.from('hr_vacancies').update(patch), req).eq('id', req.params['id'] as string);
    if (error) throw error;
    res.json({ ok: true });
  }),
);

/**
 * Withdraw a vacancy request made in error (soft delete — the decision audit
 * on `hr_vacancies` is append-only, so the row stays).
 *
 * Order is load-bearing: `hr_applicants.vacancy_id` is a NO ACTION foreign key
 * (migration 0032), so the dependency count is checked BEFORE the row is
 * marked deleted and a vacancy that still has candidates answers 409 instead
 * of vanishing from under the recruitment pipeline.
 */
hrRouter.delete(
  '/vacancies/:id',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let lookup = supabaseAdmin
      .from('hr_vacancies')
      .select('id')
      .eq('id', req.params['id'] as string)
      .is('deleted_at', null);
    lookup = scopeToOrg(lookup, req);
    const { data: existing, error: findErr } = await lookup.maybeSingle();
    if (findErr) throw findErr;
    if (!existing) throw NotFound('Vacancy not found');

    const { count, error: countErr } = await supabaseAdmin
      .from('hr_applicants')
      .select('id', { count: 'exact', head: true })
      .eq('vacancy_id', req.params['id'] as string);
    if (countErr) throw countErr;
    if ((count ?? 0) > 0) {
      throw Conflict(
        `এই শূন্যপদে ${count} জন আবেদনকারী আছে — আগে তাদের মুছুন / ${count} applicant(s) still reference this vacancy — remove them first`,
      );
    }

    const { error } = await scopeToOrg(
      supabaseAdmin.from('hr_vacancies').update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
      req,
    ).eq('id', req.params['id'] as string);
    if (error) throw error;
    res.status(204).end();
  }),
);

hrRouter.post(
  '/vacancies/:id/decision',
  requirePermission('org:manage'),
  validate(vacancyDecisionSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { decision: 'approve' | 'reject'; note?: string };
    let query = supabaseAdmin
      .from('hr_vacancies')
      .update({
        status: body.decision === 'approve' ? 'approved' : 'rejected',
        decided_by: req.auth!.userId,
        decided_at: new Date().toISOString(),
        note: body.note ?? null,
      })
      .eq('id', req.params['id'] as string)
      .eq('status', 'requested');
    query = scopeToOrg(query, req);
    const { data, error } = await query.select('id').maybeSingle();
    if (error || !data) throw NotFound('Vacancy not found or already decided');
    res.json({ ok: true });
  }),
);

hrRouter.get(
  '/applicants',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('hr_applicants').select('*').order('created_at', { ascending: false });
    const vacancyId = req.query['vacancyId'];
    if (typeof vacancyId === 'string' && vacancyId) query = query.eq('vacancy_id', vacancyId);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((a) => ({
        id: a.id,
        vacancyId: a.vacancy_id,
        name: a.name,
        mobile: a.mobile,
        educationLevel: a.education_level,
        experienceYears: a.experience_years,
        status: a.status,
        interviewScores: a.interview_scores ?? [],
        offeredSalary: a.offered_salary != null ? String(a.offered_salary) : null,
        createdAt: a.created_at,
      })),
    });
  }),
);

hrRouter.post(
  '/applicants',
  requirePermission('branch:manage'),
  validate(applicantCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { vacancyId: string; name: string; mobile: string; educationLevel: string; experienceYears: number };
    const { data, error } = await supabaseAdmin
      .from('hr_applicants')
      .insert({
        org_id: orgOf(req),
        vacancy_id: body.vacancyId,
        name: body.name,
        mobile: body.mobile,
        education_level: body.educationLevel,
        experience_years: body.experienceYears,
        status: 'applied',
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ok: true });
  }),
);

hrRouter.patch(
  '/applicants/:id/status',
  requirePermission('branch:manage'),
  validate(applicantStatusSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as { status: string; offeredSalary?: string | null };
    const patch: Record<string, unknown> = { status: body.status, updated_at: new Date().toISOString() };
    if (body.offeredSalary !== undefined) patch['offered_salary'] = body.offeredSalary;
    // The row is read back: a zero-row update means the applicant is unknown or
    // belongs to another organization, which must 404 rather than answer `ok`.
    const { data: updated, error } = await scopeToOrg(supabaseAdmin.from('hr_applicants').update(patch), req)
      .eq('id', req.params['id'] as string)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!updated) throw NotFound('Applicant not found');
    res.json({ ok: true });
  }),
);

/**
 * Correct an applicant's own details before the panel scores them. Interview
 * scores, status and the offer are workflow state with their own endpoints, so
 * they are not editable here. A candidate who already joined has become staff
 * and their application is history — correct the staff record instead.
 */
hrRouter.patch(
  '/applicants/:id',
  requirePermission('branch:manage'),
  validate(applicantUpdateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { name?: string; mobile?: string; educationLevel?: string; experienceYears?: number };
    let lookup = supabaseAdmin.from('hr_applicants').select('id, status').eq('id', req.params['id'] as string);
    lookup = scopeToOrg(lookup, req);
    const { data: existing, error: findErr } = await lookup.maybeSingle();
    if (findErr) throw findErr;
    if (!existing) throw NotFound('Applicant not found');
    if (existing.status === 'joined') {
      throw Conflict('যোগদানকারী আবেদনকারী সম্পাদনাযোগ্য নয় — কর্মচারী রেকর্ড সম্পাদনা করুন / A joined applicant becomes staff — edit the staff record instead');
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) patch['name'] = body.name;
    if (body.mobile !== undefined) patch['mobile'] = body.mobile;
    if (body.educationLevel !== undefined) patch['education_level'] = body.educationLevel;
    if (body.experienceYears !== undefined) patch['experience_years'] = body.experienceYears;
    const { error } = await scopeToOrg(supabaseAdmin.from('hr_applicants').update(patch), req).eq('id', req.params['id'] as string);
    if (error) throw error;
    res.json({ ok: true });
  }),
);

/**
 * Remove an applicant added by mistake. `hr_applicants` has no `deleted_at`
 * and nothing references it, so this is a real delete — but a `joined`
 * candidate is a person who is now on the payroll, so their application record
 * is refused instead.
 */
hrRouter.delete(
  '/applicants/:id',
  requirePermission('branch:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let lookup = supabaseAdmin.from('hr_applicants').select('id, status').eq('id', req.params['id'] as string);
    lookup = scopeToOrg(lookup, req);
    const { data: existing, error: findErr } = await lookup.maybeSingle();
    if (findErr) throw findErr;
    if (!existing) throw NotFound('Applicant not found');
    if (existing.status === 'joined') {
      throw Conflict('যোগদানকারী আবেদনকারী মুছে ফেলা যায় না — কর্মচারী রেকর্ড হিসেবে থাকবে / A joined applicant is staff and cannot be removed');
    }

    const { error } = await scopeToOrg(supabaseAdmin.from('hr_applicants').delete(), req).eq('id', req.params['id'] as string);
    if (error) throw error;
    res.status(204).end();
  }),
);

hrRouter.post(
  '/applicants/:id/interview',
  requirePermission('branch:manage'),
  validate(interviewScoreSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as { panelist: string; score: number; note?: string | null };
    const { data: current } = await scopeToOrg(
      supabaseAdmin.from('hr_applicants').select('interview_scores'),
      req,
    )
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (!current) throw NotFound('Applicant not found');
    const scores = [...((current.interview_scores as unknown[]) ?? []), body];
    const { data: updated, error } = await scopeToOrg(
      supabaseAdmin.from('hr_applicants').update({ interview_scores: scores, status: 'interviewed', updated_at: new Date().toISOString() }),
      req,
    )
      .eq('id', req.params['id'] as string)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!updated) throw NotFound('Applicant not found');
    res.json({ ok: true });
  }),
);

hrRouter.post(
  '/applicants/:id/offer',
  requirePermission('org:manage'),
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { offeredSalary?: string };
    const { data: updated, error } = await scopeToOrg(
      supabaseAdmin
        .from('hr_applicants')
        .update({ status: 'offered', offered_salary: body.offeredSalary ?? '16500.00', updated_at: new Date().toISOString() }),
      req,
    )
      .eq('id', req.params['id'] as string)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!updated) throw NotFound('Applicant not found');
    res.json({ ok: true });
  }),
);

// ── 3) Attendance & leave ────────────────────────────────────────────────────
hrRouter.get(
  '/attendance',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const date = (req.query['date'] as string) ?? todayStr();
    let query = supabaseAdmin
      .from('hr_attendance')
      .select('*, hr_staff(name, employee_code)')
      .eq('work_date', date);
    const branchId = req.query['branchId'];
    if (typeof branchId === 'string' && branchId) query = query.eq('hr_staff.branch_id', branchId);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((a) => ({
        id: a.id,
        staffId: a.staff_id,
        staffName: a.hr_staff?.name ?? '',
        staffCode: a.hr_staff?.employee_code ?? '',
        workDate: a.work_date,
        status: a.status,
        checkInAt: a.check_in_at ?? null,
        checkInLat: a.check_in_lat != null ? Number(a.check_in_lat) : null,
        checkInLng: a.check_in_lng != null ? Number(a.check_in_lng) : null,
        selfiePath: a.selfie_path ?? null,
        distanceMeters: a.distance_meters != null ? Number(a.distance_meters) : null,
        mode: a.mode,
        note: a.note ?? null,
      })),
    });
  }),
);

hrRouter.post(
  '/attendance/field-check-in',
  requirePermission('member:read'),
  validate(fieldCheckInSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { workDate: string; lat: number; lng: number; selfiePath: string };
    const staffId = (req.query['staffId'] as string) || req.auth!.userId;
    const checkInAt = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('hr_attendance')
      .upsert(
        {
          org_id: orgOf(req),
          staff_id: staffId,
          work_date: body.workDate,
          status: new Date(checkInAt).getUTCHours() > 9 ? 'late' : 'present',
          check_in_at: checkInAt,
          check_in_lat: String(body.lat),
          check_in_lng: String(body.lng),
          selfie_path: body.selfiePath,
          mode: 'field',
        },
        { onConflict: 'org_id, staff_id, work_date' },
      )
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ok: true });
  }),
);

hrRouter.post(
  '/attendance/office-check-in',
  requirePermission('member:read'),
  validate(officeCheckInSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { workDate: string };
    const staffId = (req.query['staffId'] as string) || req.auth!.userId;
    const checkInAt = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('hr_attendance')
      .upsert(
        {
          org_id: orgOf(req),
          staff_id: staffId,
          work_date: body.workDate,
          status: new Date(checkInAt).getUTCHours() > 9 ? 'late' : 'present',
          check_in_at: checkInAt,
          mode: 'office',
        },
        { onConflict: 'org_id, staff_id, work_date' },
      )
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ok: true });
  }),
);

hrRouter.get(
  '/leave',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('hr_leave_requests').select('*, hr_staff(name)').order('created_at', { ascending: false });
    const staffId = req.query['staffId'];
    if (typeof staffId === 'string' && staffId) query = query.eq('staff_id', staffId);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((l) => ({
        id: l.id,
        staffId: l.staff_id,
        staffName: l.hr_staff?.name ?? '',
        leaveType: l.leave_type,
        startDate: l.start_date,
        endDate: l.end_date,
        days: l.days,
        reason: l.reason,
        status: l.status,
        decidedBy: l.decided_by ?? null,
        decidedAt: l.decided_at ?? null,
        createdAt: l.created_at,
      })),
    });
  }),
);

hrRouter.post(
  '/leave',
  requirePermission('member:read'),
  validate(leaveRequestSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { staffId: string; leaveType: string; startDate: string; endDate: string; reason: string };
    const days = Math.floor((Date.parse(body.endDate) - Date.parse(body.startDate)) / 86_400_000) + 1;
    const { data, error } = await supabaseAdmin
      .from('hr_leave_requests')
      .insert({
        org_id: orgOf(req),
        staff_id: body.staffId,
        leave_type: body.leaveType,
        start_date: body.startDate,
        end_date: body.endDate,
        days,
        reason: body.reason,
        status: 'pending',
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ok: true });
  }),
);

hrRouter.post(
  '/leave/:id/decision',
  requirePermission('member:approve'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { decision: 'approve' | 'reject' };
    let query = supabaseAdmin
      .from('hr_leave_requests')
      .update({
        status: body.decision === 'approve' ? 'approved' : 'rejected',
        decided_by: req.auth!.userId,
        decided_at: new Date().toISOString(),
      })
      .eq('id', req.params['id'] as string)
      .eq('status', 'pending');
    query = scopeToOrg(query, req);
    const { data, error } = await query.select('id').maybeSingle();
    if (error || !data) throw NotFound('Leave request not found or already decided');
    res.json({ ok: true });
  }),
);

hrRouter.get(
  '/leave-balances/:staffId',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const staffId = req.params['staffId'] as string;
    const year = todayStr().slice(0, 4);
    const { data } = await supabaseAdmin
      .from('hr_leave_requests')
      .select('leave_type, days')
      .eq('staff_id', staffId)
      .eq('status', 'approved')
      .gte('start_date', `${year}-01-01`)
      .lte('start_date', `${year}-12-31`);
    const entitlements: Record<string, number> = { casual: 10, sick: 14, annual: 20, maternity: 180 };
    const taken: Record<string, number> = {};
    for (const r of data ?? []) taken[r.leave_type] = (taken[r.leave_type] ?? 0) + r.days;
    const balances: Record<string, { entitlement: number; taken: number; remaining: number }> = {};
    for (const [type, ent] of Object.entries(entitlements)) {
      const t = taken[type] ?? 0;
      balances[type] = { entitlement: ent, taken: t, remaining: Math.max(0, ent - t) };
    }
    res.json(balances);
  }),
);

hrRouter.get(
  '/holidays',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('hr_holidays').select('*').order('date');
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({ items: (data ?? []).map((h) => ({ id: h.id, date: h.date, name: h.name, nameBn: h.name_bn ?? h.name })) });
  }),
);

hrRouter.post(
  '/holidays',
  requirePermission('org:manage'),
  validate(hrHolidayInputSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { date: string; name: string; nameBn: string };
    const { data, error } = await supabaseAdmin
      .from('hr_holidays')
      .upsert({ org_id: orgOf(req), date: body.date, name: body.name, name_bn: body.nameBn }, { onConflict: 'org_id, date' })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ...body });
  }),
);

// ── 4) Transfer & promotion ──────────────────────────────────────────────────
hrRouter.get(
  '/movements',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin
      .from('hr_movements')
      .select('*, hr_staff(name), from_branch:branches!hr_movements_from_branch_id_fkey(name), to_branch:branches!hr_movements_to_branch_id_fkey(name)')
      .order('created_at', { ascending: false });
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((m) => ({
        id: m.id,
        kind: m.kind,
        staffId: m.staff_id,
        staffName: m.hr_staff?.name ?? '',
        fromBranchId: m.from_branch_id ?? null,
        fromBranchName: m.from_branch?.name ?? '',
        fromDesignation: m.from_designation,
        toBranchId: m.to_branch_id ?? null,
        toBranchName: m.to_branch?.name ?? '',
        toDesignation: m.to_designation,
        toGrade: m.to_grade ?? null,
        newMonthlyGross: m.new_monthly_gross != null ? String(m.new_monthly_gross) : null,
        effectiveDate: m.effective_date,
        reason: m.reason,
        status: m.status,
        proposedBy: m.proposed_by,
        approvedBy: m.approved_by ?? null,
        approvedAt: m.approved_at ?? null,
        orderNumber: m.order_number ?? null,
        createdAt: m.created_at,
      })),
    });
  }),
);

hrRouter.post(
  '/movements',
  requirePermission('org:manage'),
  validate(movementCreateSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as {
      kind: string;
      staffId: string;
      toBranchId?: string | null;
      toDesignation: string;
      toGrade?: string | null;
      newMonthlyGross?: string | null;
      effectiveDate: string;
      reason: string;
    };
    // Client-addressed staff lookup: without the tenant predicate a movement
    // could be raised against another organization's staff row.
    const { data: staff } = await scopeToOrg(
      supabaseAdmin.from('hr_staff').select('branch_id, designation'),
      req as RequestWithAuth,
    )
      .eq('id', body.staffId)
      .maybeSingle();
    if (!staff) throw NotFound('Staff not found');
    const { data, error } = await supabaseAdmin
      .from('hr_movements')
      .insert({
        org_id: orgOf(req),
        kind: body.kind,
        staff_id: body.staffId,
        from_branch_id: staff.branch_id ?? null,
        from_designation: staff.designation,
        to_branch_id: body.toBranchId ?? null,
        to_designation: body.toDesignation,
        to_grade: body.toGrade ?? null,
        new_monthly_gross: body.newMonthlyGross ?? null,
        effective_date: body.effectiveDate,
        reason: body.reason,
        status: 'proposed',
        proposed_by: req.auth!.userId,
        created_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ok: true });
  }),
);

hrRouter.post(
  '/movements/:id/decision',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { decision: 'approve' | 'reject' };
    let query = supabaseAdmin
      .from('hr_movements')
      .update({
        status: body.decision === 'approve' ? 'approved' : 'rejected',
        approved_by: req.auth!.userId,
        approved_at: new Date().toISOString(),
      })
      .eq('id', req.params['id'] as string)
      .eq('status', 'proposed');
    query = scopeToOrg(query, req);
    const { data, error } = await query.select('id, kind').maybeSingle();
    if (error || !data) throw NotFound('Movement not found or already decided');
    // Assign an order number on approval. The sequence count and the write both
    // stay inside the caller's tenant.
    if (body.decision === 'approve') {
      let countQuery = supabaseAdmin.from('hr_movements').select('id', { count: 'exact', head: true }).eq('kind', data.kind);
      countQuery = scopeToOrg(countQuery, req);
      const { count } = await countQuery;
      const prefix = data.kind === 'transfer' ? 'TRF' : 'PRM';
      await scopeToOrg(
        supabaseAdmin
          .from('hr_movements')
          .update({ order_number: `${prefix}-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, '0')}` }),
        req,
      ).eq('id', data.id);
    }
    res.json({ ok: true });
  }),
);

hrRouter.post(
  '/movements/:id/apply',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { data: mv } = await scopeToOrg(supabaseAdmin.from('hr_movements').select('*'), req)
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (!mv) throw NotFound('Movement not found');
    if (mv.status !== 'approved') throw Conflict('Movement must be approved before applying');
    const patch: Record<string, unknown> = {
      branch_id: mv.to_branch_id,
      designation: mv.to_designation,
      updated_at: new Date().toISOString(),
    };
    if (mv.to_grade) patch['grade'] = mv.to_grade;
    if (mv.new_monthly_gross != null) patch['monthly_gross'] = mv.new_monthly_gross;
    await scopeToOrg(supabaseAdmin.from('hr_staff').update(patch), req).eq('id', mv.staff_id);
    await scopeToOrg(supabaseAdmin.from('hr_movements').update({ status: 'effective' }), req).eq('id', mv.id);
    res.json({ ok: true });
  }),
);

hrRouter.get(
  '/movements/:id/order',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const { data: mv } = await supabaseAdmin
      .from('hr_movements')
      .select('*, hr_staff(name), from_branch:branches!hr_movements_from_branch_id_fkey(name), to_branch:branches!hr_movements_to_branch_id_fkey(name)')
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (!mv) throw NotFound('Movement not found');
    const heading = mv.kind === 'transfer' ? 'আদেশ: কর্মস্থল পরিবর্তন (বদলি) / ORDER: Transfer' : 'আদেশ: পদোন্নতি / ORDER: Promotion';
    const body = [
      heading,
      `আদেশ নং / Order No: ${mv.order_number ?? '—'}`,
      '',
      `কর্মী: ${mv.hr_staff?.name ?? mv.staff_id}`,
      `পুর্ব: ${mv.from_designation} (${mv.from_branch?.name ?? '—'}) → নতুন: ${mv.to_designation} (${mv.to_branch?.name ?? '—'})`,
      `কার্যকর: ${mv.effective_date}`,
      `কারণ: ${mv.reason}`,
    ];
    res.type('text/plain; charset=utf-8').send(body.join('\n'));
  }),
);

// ── 5) Payroll ───────────────────────────────────────────────────────────────
hrRouter.get(
  '/payroll/structures',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('salary_structures').select('*').is('deleted_at', null).order('grade');
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((s) => ({
        id: s.id,
        orgId: s.org_id,
        grade: s.grade,
        basic: String(s.basic),
        houseRent: String(s.house_rent),
        medical: String(s.medical),
        conveyance: String(s.conveyance),
        fieldAllowance: String(s.field_allowance),
        pfEmployeeRate: String(s.pf_employee_rate),
        pfEmployerRate: String(s.pf_employer_rate),
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })),
    });
  }),
);

hrRouter.put(
  '/payroll/structures',
  requirePermission('org:manage'),
  validate(salaryStructureSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as {
      grade: string;
      basic: string;
      houseRent: string;
      medical: string;
      conveyance: string;
      fieldAllowance: string;
      pfEmployeeRate: string;
      pfEmployerRate: string;
    };
    const { data, error } = await supabaseAdmin
      .from('salary_structures')
      .upsert(
        {
          org_id: orgOf(req),
          grade: body.grade,
          basic: body.basic,
          house_rent: body.houseRent,
          medical: body.medical,
          conveyance: body.conveyance,
          field_allowance: body.fieldAllowance,
          pf_employee_rate: body.pfEmployeeRate,
          pf_employer_rate: body.pfEmployerRate,
          created_by: req.auth!.userId,
        },
        { onConflict: 'org_id, grade' },
      )
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ...body });
  }),
);

/** Compute a month's payroll lines from structures + staff. */
async function buildPayrollLines(orgId: string, _period: string) {
  const [staffRes, structuresRes] = await Promise.all([
    supabaseAdmin.from('hr_staff').select('*').eq('org_id', orgId).is('deleted_at', null).in('status', ['probation', 'confirmed']),
    supabaseAdmin.from('salary_structures').select('*').eq('org_id', orgId).is('deleted_at', null),
  ]);
  if (staffRes.error) throw staffRes.error;
  if (structuresRes.error) throw structuresRes.error;
  const byGrade = new Map((structuresRes.data ?? []).map((s) => [s.grade, s]));
  const lines = (staffRes.data ?? [])
    .filter((s) => byGrade.has(s.grade))
    .map((s) => {
      const st = byGrade.get(s.grade)!;
      const gross = Number(st.basic) + Number(st.house_rent) + Number(st.medical) + Number(st.conveyance) + Number(st.field_allowance);
      const pf = Number(st.pf_employee_rate) * Number(st.basic);
      const net = gross - pf;
      return {
        org_id: orgId,
        staff_id: s.id,
        components: {
          basic: Number(st.basic).toFixed(2),
          house_rent: Number(st.house_rent).toFixed(2),
          medical: Number(st.medical).toFixed(2),
          conveyance: Number(st.conveyance).toFixed(2),
          field_allowance: Number(st.field_allowance).toFixed(2),
        },
        deductions: { pf_employee: pf.toFixed(2), tax: '0.00', loan_advance: '0.00', other: '0.00' },
        net: net.toFixed(2),
        bonus: '0.00',
        working_days: 26,
        present_days: 26,
        attendance_ratio: '1.00',
        // denormalized for the wire
        staffCode: s.employee_code,
        staffName: s.name,
        branchId: s.branch_id,
        gross: gross.toFixed(2),
        totalDeduction: pf.toFixed(2),
      };
    });
  return lines;
}

hrRouter.get(
  '/payroll/runs',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let query = supabaseAdmin
      .from('payroll_runs')
      .select('*, payroll_lines(*, hr_staff(name, employee_code))')
      .is('deleted_at', null)
      .order('period', { ascending: false });
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((r) => ({
        id: r.id,
        orgId: r.org_id,
        period: r.period,
        status: r.status,
        lines: (r.payroll_lines ?? []).map((l: Record<string, unknown>) => ({
          id: l['id'],
          payrollId: l['payroll_id'],
          staffId: l['staff_id'],
          staffCode: (l['hr_staff'] as { employee_code?: string } | null)?.employee_code ?? '',
          staffName: (l['hr_staff'] as { name?: string } | null)?.name ?? '',
          branchId: null,
          components: l['components'],
          gross: String(l['components'] ? Object.values(l['components'] as Record<string, string>).reduce((s, v) => s + Number(v), 0) : 0),
          deductions: l['deductions'],
          totalDeduction: String(Object.values((l['deductions'] as Record<string, string>) ?? {}).reduce((s, v) => s + Number(v), 0).toFixed(2)),
          net: String(l['net']),
          workingDays: l['working_days'],
          presentDays: l['present_days'],
          attendanceRatio: String(l['attendance_ratio'] ?? '1.00'),
        })),
        totalGross: String(r.total_gross),
        totalDeduction: String(r.total_deduction),
        totalNet: String(r.total_net),
        bonusTotal: String(r.bonus_total ?? '0'),
        preparedBy: r.prepared_by,
        approvedBy: r.approved_by ?? null,
        approvedAt: r.approved_at ?? null,
        paidAt: r.paid_at ?? null,
        createdAt: r.created_at,
      })),
    });
  }),
);

hrRouter.get(
  '/payroll/runs/:id',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const { data: run, error } = await supabaseAdmin
      .from('payroll_runs')
      .select('*, payroll_lines(*, hr_staff(name, employee_code))')
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (error) throw error;
    if (!run) throw NotFound('Payroll run not found');
    res.json({
      id: run.id,
      period: run.period,
      status: run.status,
      totalGross: String(run.total_gross),
      totalDeduction: String(run.total_deduction),
      totalNet: String(run.total_net),
      lines: (run.payroll_lines ?? []).map((l: Record<string, unknown>) => ({
        id: l['id'],
        staffId: l['staff_id'],
        staffCode: (l['hr_staff'] as { employee_code?: string } | null)?.employee_code ?? '',
        staffName: (l['hr_staff'] as { name?: string } | null)?.name ?? '',
        components: l['components'],
        deductions: l['deductions'],
        net: String(l['net']),
      })),
    });
  }),
);

hrRouter.post(
  '/payroll/runs',
  requirePermission('org:manage'),
  validate(payrollRunSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { period: string };
    const orgId = orgOf(req);
    const { data: existing } = await supabaseAdmin
      .from('payroll_runs')
      .select('id')
      .eq('org_id', orgId)
      .eq('period', body.period)
      .maybeSingle();
    if (existing) throw Conflict(`Payroll for ${body.period} already exists`);

    const lines = await buildPayrollLines(orgId, body.period);
    const totalGross = lines.reduce((s, l) => s + Number(l.gross), 0);
    const totalDeduction = lines.reduce((s, l) => s + Number(l.totalDeduction), 0);
    const totalNet = lines.reduce((s, l) => s + Number(l.net), 0);

    const { data: run, error } = await supabaseAdmin
      .from('payroll_runs')
      .insert({
        org_id: orgId,
        period: body.period,
        status: 'draft',
        total_gross: totalGross.toFixed(2),
        total_deduction: totalDeduction.toFixed(2),
        total_net: totalNet.toFixed(2),
        bonus_total: '0.00',
        prepared_by: req.auth!.userId,
        created_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    if (lines.length > 0) {
      await supabaseAdmin.from('payroll_lines').insert(lines.map((l) => ({ ...l, payroll_id: run.id })));
    }
    res.status(201).json({ id: run.id, period: body.period, lines: lines.length, ok: true });
  }),
);

hrRouter.post(
  '/payroll/runs/:id/decision',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const action = (req.body as { action?: string }).action === 'pay' ? 'pay' : 'approve';
    const patch =
      action === 'pay'
        ? { status: 'paid', paid_at: new Date().toISOString() }
        : { status: 'approved', approved_by: req.auth!.userId, approved_at: new Date().toISOString() };
    let query = supabaseAdmin.from('payroll_runs').update(patch).eq('id', req.params['id'] as string);
    query = scopeToOrg(query, req);
    const { data, error } = await query.select('id, status').maybeSingle();
    if (error || !data) throw NotFound('Payroll run not found');
    res.json({ ok: true, status: data.status });
  }),
);

hrRouter.get(
  '/payroll/runs/:id/payslip/:staffId',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const { data: line } = await supabaseAdmin
      .from('payroll_lines')
      .select('*, payroll_runs(period), hr_staff(name, employee_code)')
      .eq('payroll_id', req.params['id'] as string)
      .eq('staff_id', req.params['staffId'] as string)
      .maybeSingle();
    if (!line) throw NotFound('Payslip line not found');
    const components = (line.components ?? {}) as Record<string, string>;
    const deductions = (line.deductions ?? {}) as Record<string, string>;
    const gross = Object.values(components).reduce((s, v) => s + Number(v), 0);
    const totalDeduction = Object.values(deductions).reduce((s, v) => s + Number(v), 0);
    const text = [
      `বেতন স্লিপ / Payslip — ${(line.payroll_runs as { period: string }).period}`,
      `কর্মী: ${(line.hr_staff as { name?: string } | null)?.name ?? ''} (${(line.hr_staff as { employee_code?: string } | null)?.employee_code ?? ''})`,
      ...Object.entries(components).map(([k, v]) => `${k}: ${v}`),
      `মোট / Gross: ${gross.toFixed(2)}`,
      ...Object.entries(deductions).map(([k, v]) => `${k}: ${v}`),
      `নিট বেতন / Net Pay: ${Number(line.net).toFixed(2)}`,
      '— Samity Manager',
    ].join('\n');
    res.json({ line: { ...line, gross: gross.toFixed(2), totalDeduction: totalDeduction.toFixed(2) }, text });
  }),
);

hrRouter.get(
  '/payroll/runs/:id/bank-sheet',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    const { data: lines, error } = await supabaseAdmin
      .from('payroll_lines')
      .select('net, hr_staff(name, employee_code, bank_name, bank_masked)')
      .eq('payroll_id', req.params['id'] as string);
    if (error) throw error;
    res.json({
      items: (lines ?? []).map((l) => ({
        staffCode: (l.hr_staff as { employee_code?: string } | null)?.employee_code ?? '',
        staffName: (l.hr_staff as { name?: string } | null)?.name ?? '',
        bankName: (l.hr_staff as { bank_name?: string } | null)?.bank_name ?? null,
        accountMasked: (l.hr_staff as { bank_masked?: string } | null)?.bank_masked ?? null,
        net: String(l.net),
      })),
    });
  }),
);

// ── 6) PF ledger + gratuity ──────────────────────────────────────────────────
hrRouter.get(
  '/pf',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('pf_ledger').select('*').order('created_at', { ascending: false }).limit(200);
    const staffId = req.query['staffId'];
    if (typeof staffId === 'string' && staffId) query = query.eq('staff_id', staffId);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((p) => ({
        id: p.id,
        staffId: p.staff_id,
        type: p.type,
        employeeAmount: String(p.employee_amount),
        employerAmount: String(p.employer_amount),
        balanceAfter: String(p.balance_after),
        period: p.period ?? null,
        note: p.note ?? null,
        createdAt: p.created_at,
      })),
    });
  }),
);

hrRouter.post(
  '/pf',
  requirePermission('org:manage'),
  validate(pfAdjustmentSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { staffId: string; type: string; period?: string | null; employeeAmount: string; employerAmount: string; note?: string | null };
    const { data: prior } = await supabaseAdmin
      .from('pf_ledger')
      .select('balance_after')
      .eq('staff_id', body.staffId)
      .order('created_at', { ascending: false })
      .limit(1);
    const priorBalance = prior?.[0] ? Number(prior[0].balance_after) : 0;
    const delta = body.type === 'withdrawal' || body.type === 'transfer_out' ? -1 : 1;
    const after = priorBalance + delta * (Number(body.employeeAmount) + Number(body.employerAmount));
    const { data, error } = await supabaseAdmin
      .from('pf_ledger')
      .insert({
        org_id: orgOf(req),
        staff_id: body.staffId,
        period: body.period ?? null,
        type: body.type,
        employee_amount: body.employeeAmount,
        employer_amount: body.employerAmount,
        balance_after: after.toFixed(2),
        note: body.note ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, balanceAfter: after.toFixed(2) });
  }),
);

hrRouter.post(
  '/pf/gratuity',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const { staffId, leavingDate } = req.body as { staffId: string; leavingDate: string };
    const { data: staff } = await supabaseAdmin
      .from('hr_staff')
      .select('joining_date, monthly_gross, grade, name, employee_code')
      .eq('id', staffId)
      .maybeSingle();
    if (!staff) throw NotFound('Staff not found');
    const years = Math.floor((Date.parse(leavingDate) - Date.parse(staff.joining_date)) / (365.25 * 86_400_000));
    const amount = years >= 1 ? (Number(staff.monthly_gross) * 15 * years) / 30 : 0;
    const { data, error } = await supabaseAdmin
      .from('gratuity_settlements')
      .insert({
        org_id: orgOf(req),
        staff_id: staffId,
        joining_date: staff.joining_date,
        leaving_date: leavingDate,
        last_basic: staff.monthly_gross,
        years,
        amount: amount.toFixed(2),
        created_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, years, amount: amount.toFixed(2) });
  }),
);

// ── 7) KPI + appraisal ───────────────────────────────────────────────────────
hrRouter.get(
  '/performance/kpi',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('kpi_scorecards').select('*, hr_staff(name)').order('period', { ascending: false });
    const staffId = req.query['staffId'];
    if (typeof staffId === 'string' && staffId) query = query.eq('staff_id', staffId);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((k) => ({
        id: k.id,
        orgId: k.org_id,
        staffId: k.staff_id,
        staffName: k.hr_staff?.name ?? '',
        period: k.period,
        actuals: k.actuals,
        scores: k.scores ?? {},
        totalScore: Number(k.total_score ?? 0),
        grade: k.grade,
        createdAt: k.created_at,
      })),
    });
  }),
);

hrRouter.put(
  '/performance/kpi/:staffId/:period',
  requirePermission('branch:manage'),
  validate(kpiActualsSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as Record<string, number>;
    // Score against the shared default targets.
    const targets: Record<string, number> = { collection_rate: 0.98, par: 0.05, new_members: 8, meeting_attendance: 0.9 };
    const scores: Record<string, number> = {};
    for (const key of Object.keys(targets)) {
      const actual = Number(body[key] ?? 0);
      const target = targets[key]!;
      scores[key] =
        key === 'par'
          ? Math.max(0, Math.min(100, target > 0 ? ((target - actual) / target) * 100 : 0))
          : Math.max(0, Math.min(100, target > 0 ? (actual / target) * 100 : 0));
    }
    const values = Object.values(scores);
    const total = values.reduce((s, v) => s + v, 0) / values.length;
    const grade = total >= 85 ? 'A' : total >= 70 ? 'B' : total >= 55 ? 'C' : 'D';
    const { data, error } = await supabaseAdmin
      .from('kpi_scorecards')
      .upsert(
        {
          org_id: orgOf(req),
          staff_id: req.params['staffId'] as string,
          period: req.params['period'] as string,
          actuals: body,
          scores,
          total_score: total.toFixed(2),
          grade,
          created_by: req.auth!.userId,
        },
        { onConflict: 'org_id, staff_id, period' },
      )
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, totalScore: Number(total.toFixed(2)), grade });
  }),
);

hrRouter.get(
  '/performance/appraisals',
  requirePermission('member:read'),
  asyncHandler(async (req, res) => {
    let query = supabaseAdmin.from('staff_appraisals').select('*, hr_staff(name)').order('year', { ascending: false });
    const staffId = req.query['staffId'];
    if (typeof staffId === 'string' && staffId) query = query.eq('staff_id', staffId);
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((a) => ({
        id: a.id,
        orgId: a.org_id,
        staffId: a.staff_id,
        staffName: a.hr_staff?.name ?? '',
        year: String(a.year),
        scores: a.scores,
        comments: a.comments ?? '',
        rating: Number(a.rating ?? 0),
        status: a.status,
        reviewerId: a.reviewer_id ?? null,
        reviewerNote: a.reviewer_note ?? null,
        createdAt: a.created_at,
      })),
    });
  }),
);

hrRouter.post(
  '/performance/appraisals',
  requirePermission('branch:manage'),
  validate(appraisalSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = req.body as { staffId: string; year: string; scores: Record<string, number>; comments: string };
    const rating = (Object.values(body.scores).reduce((s, v) => s + v, 0) / Object.keys(body.scores).length) * 10;
    const { data, error } = await supabaseAdmin
      .from('staff_appraisals')
      .insert({
        org_id: orgOf(req),
        staff_id: body.staffId,
        year: Number(body.year),
        scores: body.scores,
        comments: body.comments,
        rating: rating.toFixed(2),
        status: 'draft',
        created_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, rating: Number(rating.toFixed(2)) });
  }),
);

hrRouter.post(
  '/performance/appraisals/:id/review',
  requirePermission('org:manage'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    const body = (req.body ?? {}) as { note?: string };
    let query = supabaseAdmin
      .from('staff_appraisals')
      .update({ status: 'reviewed', reviewer_id: req.auth!.userId, reviewer_note: body.note ?? 'রিভিউ সম্পন্ন' })
      .eq('id', req.params['id'] as string);
    query = scopeToOrg(query, req);
    const { data, error } = await query.select('id').maybeSingle();
    if (error || !data) throw NotFound('Appraisal not found');
    res.json({ ok: true });
  }),
);

// ── 8) Disciplinary (HR/Director only) ───────────────────────────────────────
function requireHrDirector(req: RequestWithAuth): void {
  if (!['super_admin', 'org_admin'].includes(req.auth!.role)) {
    throw Object.assign(new Error('শুধু এইচআর ও পরিচালক দেখতে পারেন / HR and Director only'), { statusCode: 403 });
  }
}

hrRouter.get(
  '/discipline',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    requireHrDirector(req);
    let query = supabaseAdmin.from('disciplinary_cases').select('*, hr_staff(name)').is('deleted_at', null).order('created_at', { ascending: false });
    if (scopeOrg(req)) query = query.eq('org_id', orgOf(req));
    const { data, error } = await query;
    if (error) throw error;
    res.json({
      items: (data ?? []).map((c) => ({
        id: c.id,
        orgId: c.org_id,
        staffId: c.staff_id,
        staffName: c.hr_staff?.name ?? '',
        severity: c.severity,
        incidentDate: c.incident_date,
        description: c.description,
        status: c.status,
        explanation: c.explanation ?? null,
        outcome: c.outcome ?? null,
        raisedBy: c.raised_by,
        closedBy: c.closed_by ?? null,
        closedAt: c.closed_at ?? null,
        createdAt: c.created_at,
      })),
    });
  }),
);

hrRouter.post(
  '/discipline',
  requirePermission('member:read'),
  validate(disciplineCaseSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    requireHrDirector(req);
    const body = req.body as { staffId: string; severity: string; incidentDate: string; description: string };
    const { data, error } = await supabaseAdmin
      .from('disciplinary_cases')
      .insert({
        org_id: orgOf(req),
        staff_id: body.staffId,
        severity: body.severity,
        incident_date: body.incidentDate,
        description: body.description,
        status: 'open',
        raised_by: req.auth!.userId,
      })
      .select('id')
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, ok: true });
  }),
);

hrRouter.post(
  '/discipline/:id/close',
  requirePermission('member:read'),
  validate(disciplineCloseSchema),
  asyncHandler(async (req: RequestWithAuth, res) => {
    requireHrDirector(req);
    const body = req.body as { explanation?: string | null; outcome: string };
    let query = supabaseAdmin
      .from('disciplinary_cases')
      .update({
        status: 'closed',
        explanation: body.explanation ?? null,
        outcome: body.outcome,
        closed_by: req.auth!.userId,
        closed_at: new Date().toISOString(),
      })
      .eq('id', req.params['id'] as string);
    query = scopeToOrg(query, req);
    const { data, error } = await query.select('id').maybeSingle();
    if (error || !data) throw NotFound('Case not found');
    res.json({ ok: true });
  }),
);

hrRouter.get(
  '/discipline/:id/letter',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    requireHrDirector(req);
    const { data: c } = await supabaseAdmin
      .from('disciplinary_cases')
      .select('*, hr_staff(name)')
      .eq('id', req.params['id'] as string)
      .maybeSingle();
    if (!c) throw NotFound('Case not found');
    const sevBn: Record<string, string> = {
      verbal_warning: 'মৌখিক সতর্কতা',
      written_warning: 'লিখিত সতর্কতা',
      show_cause: 'কারণ দর্শানো',
      suspension: 'সাময়িক বরখাস্ত',
      termination: 'চাকরি থেকে অপসারণ',
    };
    const name = (c.hr_staff as { name?: string } | null)?.name ?? '';
    res.json({
      bn: ['সতর্কতা পত্র', `বিষয়: ${sevBn[c.severity] ?? c.severity}`, `তারিখ: ${c.incident_date}`, '', `জনাব ${name},`, c.description, '', '— ব্যবস্থাপনা, Samity Manager'].join('\n'),
      en: ['WARNING LETTER', `Subject: ${c.severity.replaceAll('_', ' ')}`, `Date: ${c.incident_date}`, '', `Dear ${name},`, c.description, '', '— Management, Samity Manager'].join('\n'),
    });
  }),
);

// ── 9) Self-service ──────────────────────────────────────────────────────────
hrRouter.get(
  '/self-service',
  requirePermission('member:read'),
  asyncHandler(async (req: RequestWithAuth, res) => {
    let staffId = (req.query['staffId'] as string) || req.auth!.userId;
    if (scopeOrg(req) && !['super_admin', 'org_admin'].includes(req.auth!.role) && staffId !== req.auth!.userId) {
      staffId = req.auth!.userId;
    }
    const { data: staff } = await supabaseAdmin
      .from('hr_staff')
      .select('*')
      .eq('id', staffId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!staff) throw NotFound('Staff record not found for this user');
    const { data: payslipRows } = await supabaseAdmin
      .from('payroll_lines')
      .select('net, components, deductions, payroll_runs(period, status)')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })
      .limit(12);
    const { data: pfRows } = await supabaseAdmin
      .from('pf_ledger')
      .select('balance_after')
      .eq('staff_id', staffId)
      .order('created_at', { ascending: false })
      .limit(1);
    res.json({
      staffCode: staff.employee_code,
      staffName: staff.name,
      designation: staff.designation,
      status: staff.status,
      payslips: (payslipRows ?? []).map((p) => {
        const comps = Object.values((p.components ?? {}) as Record<string, string>).reduce((s, v) => s + Number(v), 0);
        const deds = Object.values((p.deductions ?? {}) as Record<string, string>).reduce((s, v) => s + Number(v), 0);
        return {
          period: (p.payroll_runs as unknown as { period: string }[] | null)?.[0]?.period ?? '',
          gross: comps.toFixed(2),
          totalDeduction: deds.toFixed(2),
          net: String(p.net),
          status: (p.payroll_runs as unknown as { status: string }[] | null)?.[0]?.status ?? 'draft',
        };
      }),
      leaveBalance: {},
      pfBalance: pfRows?.[0] ? String(pfRows[0].balance_after) : '0.00',
      documents: [],
    });
  }),
);
