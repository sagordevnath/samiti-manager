/**
 * ── Human Resources (field-heavy NGO-MFI workforce) ──────────────────────────
 * 1) Staff master with encrypted NID/bank, posting history, education.
 * 2) Recruitment lite: vacancy → approval → applicants → interviews → offer
 *    letter (Bangla + English template).
 * 3) Attendance: GPS + selfie check-in for field staff, branch attendance for
 *    office staff, leave types with balances, holiday calendar.
 * 4) Transfer & promotion workflow with bilingual order templates.
 *
 * Dates are ISO strings; NID and bank account never leave the API in
 * plaintext — routes see masked values and store ciphertext. Pure helpers
 * (probation due, leave balances, attendance status) are shared by the API,
 * DB triggers and the web UI.
 */

import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';
import { distanceMeters } from './collection-settlement.js';

// ── 1) Staff master ──────────────────────────────────────────────────────────
export const STAFF_STATUSES = ['probation', 'confirmed', 'suspended', 'resigned', 'terminated', 'retired'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

export const STAFF_STATUS_LABELS_BN: Record<StaffStatus, string> = {
  probation: 'প্রবেশনারি',
  confirmed: 'স্থায়ী',
  suspended: 'সাসপেন্ডেড',
  resigned: 'পদত্যাগ',
  terminated: 'বরখাস্ত',
  retired: 'অবসর',
};

export const DESIGNATIONS = [
  'field_officer',
  'senior_field_officer',
  'account_officer',
  'branch_manager',
  'area_manager',
  'accountant',
  'zonе_manager',
  'director_operations',
  'director_finance',
  'ceo',
] as const;
export type Designation = (typeof DESIGNATIONS)[number];

export const DESIGNATION_LABELS_BN: Record<Designation, string> = {
  field_officer: 'ফিল্ড অফিসার',
  senior_field_officer: 'সিনিয়র ফিল্ড অফিসার',
  account_officer: 'একাউন্ট অফিসার',
  branch_manager: 'শাখা ম্যানেজার',
  area_manager: 'এরিয়া ম্যানেজার',
  accountant: 'হিসাবরক্ষক',
  'zonе_manager': 'জোন ম্যানেজার',
  director_operations: 'পরিচালক (অপারেশনস)',
  director_finance: 'পরিচালক (ফাইন্যান্স)',
  ceo: 'প্রধান নির্বাহী',
};

export const STAFF_GRADES = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const;
export type StaffGrade = (typeof STAFF_GRADES)[number];

/** Field vs office posting — drives the attendance mode. */
export const FIELD_DESIGNATIONS: readonly string[] = ['field_officer', 'senior_field_officer'];

export interface Staff {
  id: string;
  orgId: string;
  employeeCode: string; // e.g. EMP-DHK-0142
  name: string;
  nameBn: string;
  designation: Designation;
  grade: StaffGrade;
  branchId: string | null;
  joiningDate: string;
  probationEndDate: string | null;
  confirmationDate: string | null;
  status: StaffStatus;
  mobile: string;
  email: string | null;
  /** Ciphertext (v1.iv.tag.ct) — never sent to clients. */
  nidEnc: string | null;
  /** Last 4 digits for display. */
  nidMasked: string | null;
  /** Ciphertext. */
  bankAccountEnc: string | null;
  bankName: string | null;
  bankMasked: string | null;
  monthlyGross: string;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  documents: Array<{ name: string; path: string; sizeBytes: number }>;
  createdAt: string;
  updatedAt: string;
}

export interface StaffPosting {
  id: string;
  staffId: string;
  branchId: string | null;
  branchName: string;
  designation: Designation;
  effectiveFrom: string;
  /** Set by a transfer/promotion order. */
  effectiveTo: string | null;
  note: string | null;
}

export interface StaffEducation {
  id: string;
  staffId: string;
  level: string; // SSC / HSC / Bachelor / Master
  institution: string;
  passingYear: number;
  result: string;
}

export const staffBaseSchema = z.object({
  name: z.string().trim().min(3).max(120),
  nameBn: z.string().trim().min(2).max(120),
  designation: z.enum(DESIGNATIONS),
  grade: z.enum(STAFF_GRADES),
  branchId: uuidSchema.nullish(),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mobile: z.string().trim().regex(/^01\d{9}$/, '01XXXXXXXXX'),
  email: z.string().trim().email().nullish(),
  /** Plaintext at intake; API encrypts + masks before persisting. */
  nid: z.string().trim().regex(/^\d{10}$|^\d{13}$|^\d{17}$/).nullish(),
  bankAccount: z.string().trim().min(6).max(30).nullish(),
  bankName: z.string().trim().max(80).nullish(),
  monthlyGross: moneySchema,
  emergencyContactName: z.string().trim().max(120).nullish(),
  emergencyContactPhone: z.string().trim().max(20).nullish(),
});

export const staffCreateSchema = staffBaseSchema;
export type StaffCreateInput = z.infer<typeof staffCreateSchema>;

export const staffUpdateSchema = staffBaseSchema.partial().extend({
  status: z.enum(STAFF_STATUSES).optional(),
  confirmationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

export const educationSchema = z.object({
  level: z.string().trim().min(2).max(40),
  institution: z.string().trim().min(2).max(120),
  passingYear: z.number().int().min(1980).max(2100),
  result: z.string().trim().min(1).max(20),
});
export type EducationInput = z.infer<typeof educationSchema>;

export const postingSchema = z.object({
  branchId: uuidSchema.nullish(),
  designation: z.enum(DESIGNATIONS),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(300).nullish(),
});

/** Whether the staff member is a field (mobile check-in) worker. */
export function isFieldStaff(s: Pick<Staff, 'designation'>): boolean {
  return FIELD_DESIGNATIONS.includes(s.designation);
}

/** 12-month probation ending date (null when joining is unparseable). */
export function probationEndDateFor(joiningDate: string): string | null {
  const d = new Date(`${joiningDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCMonth(d.getUTCMonth() + 12);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Due/overdue probation decision for the HR worklist. */
export function probationDue(
  s: Pick<Staff, 'status' | 'probationEndDate'>,
  today: string,
): 'due' | 'overdue' | null {
  if (s.status !== 'probation' || !s.probationEndDate) return null;
  if (today === s.probationEndDate) return 'due';
  return today > s.probationEndDate ? 'overdue' : null;
}

// ── 2) Recruitment lite ──────────────────────────────────────────────────────
export const VACANCY_STATUSES = ['requested', 'approved', 'rejected', 'closed'] as const;
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];

export interface Vacancy {
  id: string;
  orgId: string;
  branchId: string;
  branchName: string;
  designation: Designation;
  headcount: number;
  reason: string;
  status: VacancyStatus;
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
}

export const vacancyCreateSchema = z.object({
  branchId: uuidSchema,
  designation: z.enum(DESIGNATIONS),
  headcount: z.number().int().min(1).max(20),
  reason: z.string().trim().min(3).max(300),
});
export type VacancyCreateInput = z.infer<typeof vacancyCreateSchema>;

export const vacancyDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(300).optional(),
});

export const APPLICANT_STATUSES = ['applied', 'shortlisted', 'interviewed', 'offered', 'joined', 'rejected'] as const;
export type ApplicantStatus = (typeof APPLICANT_STATUSES)[number];

export interface Applicant {
  id: string;
  vacancyId: string;
  name: string;
  mobile: string;
  educationLevel: string;
  experienceYears: number;
  status: ApplicantStatus;
  /** 0–10 per interview; the mean is the final score. */
  interviewScores: Array<{ panelist: string; score: number; note: string | null }>;
  offeredSalary: string | null;
  createdAt: string;
}

export const applicantCreateSchema = z.object({
  vacancyId: uuidSchema,
  name: z.string().trim().min(3).max(120),
  mobile: z.string().trim().regex(/^01\d{9}$/),
  educationLevel: z.string().trim().min(2).max(40),
  experienceYears: z.number().int().min(0).max(40),
});

export const applicantStatusSchema = z.object({
  status: z.enum(APPLICANT_STATUSES),
  offeredSalary: moneySchema.nullish(),
});

export const interviewScoreSchema = z.object({
  panelist: z.string().trim().min(2).max(80),
  score: z.number().min(0).max(10),
  note: z.string().trim().max(300).nullish(),
});

/** Mean interview score; null until at least one score exists. */
export function applicantFinalScore(a: Pick<Applicant, 'interviewScores'>): number | null {
  if (a.interviewScores.length === 0) return null;
  const total = a.interviewScores.reduce((s, r) => s + r.score, 0);
  return Math.round((total / a.interviewScores.length) * 100) / 100;
}

export interface OfferLetterData {
  orgName: string;
  candidateName: string;
  designationBn: string;
  designationEn: string;
  branchName: string;
  joiningDate: string;
  monthlyGross: string;
  probationMonths: number;
  issuedOn: string;
}

/** Bangla offer letter (requirement 2). */
export function renderOfferLetterBn(d: OfferLetterData): string {
  return [
    `বিষয়: নিয়োগ পত্র।`,
    ``,
    `প্রিয় ${d.candidateName},`,
    ``,
    `আপনাকে ${d.orgName}-এর ${d.branchName}-এ ${d.designationBn} পদে নিয়োগ দেওয়া হচ্ছে।`,
    `যোগদানের তারিখ: ${d.joiningDate}।`,
    `মাসিক মোট বেতন: ৳${d.monthlyGross}।`,
    `প্রাথমিকভাবে ${d.probationMonths} মাসের প্রবেশনারি মেয়াদ পূর্ণ হলে আপনাকে স্থায়ী করা হবে।`,
    ``,
    `আপনি সংস্থার সকল নীতিমালা মেনে চলার অঙ্গীকার করবেন।`,
    ``,
    `শুভেচ্ছান্তে,`,
    `${d.orgName}`,
    `ইস্যু: ${d.issuedOn}`,
  ].join('\n');
}

/** English counterpart. */
export function renderOfferLetterEn(d: OfferLetterData): string {
  return [
    `Subject: Offer of Employment.`,
    ``,
    `Dear ${d.candidateName},`,
    ``,
    `You are offered the position of ${d.designationEn} at ${d.branchName}, ${d.orgName}.`,
    `Joining date: ${d.joiningDate}.`,
    `Monthly gross salary: BDT ${d.monthlyGross}.`,
    `You will serve a probation period of ${d.probationMonths} months, subject to confirmation.`,
    ``,
    `You are expected to abide by all organizational policies.`,
    ``,
    `Sincerely,`,
    `${d.orgName}`,
    `Issued: ${d.issuedOn}`,
  ].join('\n');
}

/** Combined bilingual letter for print. */
export function renderOfferLetter(d: OfferLetterData): string {
  return `${renderOfferLetterBn(d)}\n\n${'—'.repeat(40)}\n\n${renderOfferLetterEn(d)}`;
}

// ── 3) Attendance & leave ────────────────────────────────────────────────────
export const ATTENDANCE_STATUSES = ['present', 'late', 'absent', 'leave', 'holiday'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS_BN: Record<AttendanceStatus, string> = {
  present: 'উপস্থিত',
  late: 'বিলম্ব',
  absent: 'অনুপস্থিত',
  leave: 'ছুটিতে',
  holiday: 'ছুটির দিন',
};

export const LEAVE_TYPES = ['casual', 'sick', 'annual', 'maternity'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_LABELS_BN: Record<LeaveType, string> = {
  casual: 'সাধারণ ছুটি',
  sick: 'অসুস্থতা ছুটি',
  annual: 'বার্ষিক ছুটি',
  maternity: 'মাতৃত্বকালীন ছুটি',
};

/** Annual entitlement in days per leave type. */
export const LEAVE_ENTITLEMENTS: Record<LeaveType, number> = {
  casual: 10,
  sick: 14,
  annual: 20,
  maternity: 180,
};

export interface AttendanceEntry {
  id: string;
  staffId: string;
  workDate: string;
  status: AttendanceStatus;
  /** Field check-in (GPS + selfie reference). */
  checkInAt: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  selfiePath: string | null;
  /** Meters from the assigned branch/meeting point. */
  distanceMeters: number | null;
  /** Office staff: branch terminal check-in. */
  mode: 'field' | 'office';
  note: string | null;
}

export const fieldCheckInSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  /** Selfie object path in Supabase Storage (private bucket). */
  selfiePath: z.string().trim().min(3).max(400),
});

export const officeCheckInSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Shift rule: check-in after this many minutes is 'late'. */
export const LATE_AFTER_MINUTES = 10;
/** Field staff must be within this radius of the branch point. */
export const FIELD_CHECKIN_RADIUS_METERS = 2000;

/**
 * Derive attendance status from a check-in time vs the 09:00 shift and the
 * branch GPS point (field staff).
 */
export function deriveAttendanceStatus(input: {
  mode: 'field' | 'office';
  checkInAt: string;
  branchPoint?: { lat: number; lng: number } | null;
  checkInPoint?: { lat: number; lng: number } | null;
  radiusMeters?: number;
}): { status: 'present' | 'late'; distanceMeters: number | null; outOfRange: boolean } {
  const t = new Date(input.checkInAt);
  const late = t.getUTCHours() * 60 + t.getUTCMinutes() > 9 * 60 + LATE_AFTER_MINUTES;
  let distance: number | null = null;
  let outOfRange = false;
  if (input.mode === 'field' && input.branchPoint && input.checkInPoint) {
    distance = Math.round(distanceMeters(input.branchPoint, input.checkInPoint));
    outOfRange = distance > (input.radiusMeters ?? FIELD_CHECKIN_RADIUS_METERS);
  }
  return { status: late ? 'late' : 'present', distanceMeters: distance, outOfRange };
}

export interface LeaveRequest {
  id: string;
  staffId: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export const leaveRequestSchema = z
  .object({
    staffId: uuidSchema,
    leaveType: z.enum(LEAVE_TYPES),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().min(3).max(300),
  })
  .refine((r) => r.endDate >= r.startDate, 'endDate must be on or after startDate');
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

/** Inclusive day count between two ISO dates. */
export function daysBetweenInclusive(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.floor((b - a) / 86_400_000) + 1;
}

export const hrHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(2).max(80),
  nameBn: z.string().trim().min(2).max(80),
});
export type HrHolidayInput = z.infer<typeof hrHolidaySchema>;

export interface HrHoliday {
  id: string;
  date: string;
  name: string;
  nameBn: string;
}

/** Leave balance: entitlement − approved days taken in the calendar year. */
export function leaveBalance(
  leaveType: LeaveType,
  approvedDaysTaken: number,
): { entitlement: number; taken: number; remaining: number } {
  const entitlement = LEAVE_ENTITLEMENTS[leaveType];
  return { entitlement, taken: approvedDaysTaken, remaining: Math.max(0, entitlement - approvedDaysTaken) };
}

/** Can the request be granted without exceeding the balance? */
export function canGrantLeave(input: {
  leaveType: LeaveType;
  days: number;
  approvedDaysTaken: number;
  holidaysBetween: number;
}): boolean {
  const { remaining } = leaveBalance(input.leaveType, input.approvedDaysTaken);
  const chargeable = input.days - input.holidaysBetween;
  return chargeable <= remaining;
}

// ── 4) Transfer & promotion workflow ────────────────────────────────────────
export const MOVEMENT_KINDS = ['transfer', 'promotion'] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const MOVEMENT_STATUSES = ['proposed', 'approved', 'rejected', 'effective'] as const;
export type MovementStatus = (typeof MOVEMENT_STATUSES)[number];

export interface StaffMovement {
  id: string;
  kind: MovementKind;
  staffId: string;
  staffName: string;
  fromBranchId: string | null;
  fromBranchName: string;
  fromDesignation: Designation;
  toBranchId: string | null;
  toBranchName: string;
  toDesignation: Designation;
  /** New grade for promotions. */
  toGrade: StaffGrade | null;
  /** Salary delta for promotions. */
  newMonthlyGross: string | null;
  effectiveDate: string;
  reason: string;
  status: MovementStatus;
  proposedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  /** Order number once approved: TRF-2026-0007 / PRM-2026-0004. */
  orderNumber: string | null;
  createdAt: string;
}

export const movementCreateSchema = z.object({
  kind: z.enum(MOVEMENT_KINDS),
  staffId: uuidSchema,
  toBranchId: uuidSchema.nullish(),
  toDesignation: z.enum(DESIGNATIONS),
  toGrade: z.enum(STAFF_GRADES).nullish(),
  newMonthlyGross: moneySchema.nullish(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(3).max(300),
});
export type MovementCreateInput = z.infer<typeof movementCreateSchema>;

/** Bilingual movement order (requirement 4). */
export function renderMovementOrder(
  m: Pick<StaffMovement, 'kind' | 'staffName' | 'fromBranchName' | 'toBranchName' | 'fromDesignation' | 'toDesignation' | 'effectiveDate' | 'orderNumber'> & {
    orgName: string;
    fromDesignationBn: string;
    toDesignationBn: string;
  },
): string {
  const heading =
    m.kind === 'transfer'
      ? `আদেশ: কর্মস্থল পরিবর্তন (বদলি) / ORDER: Transfer`
      : `আদেশ: পদোন্নতি / ORDER: Promotion`;
  const bodyBn =
    m.kind === 'transfer'
      ? `${m.staffName} (${m.fromDesignationBn}, ${m.fromBranchName}) কে ${m.toBranchName}-এ ${m.toDesignationBn} হিসেবে বদলি করা হলো। কার্যকর: ${m.effectiveDate}।`
      : `${m.staffName} কে ${m.fromDesignationBn} (${m.fromBranchName}) থেকে ${m.toDesignationBn} (${m.toBranchName}) পদে পদোন্নতি দেওয়া হলো। কার্যকর: ${m.effectiveDate}।`;
  const bodyEn =
    m.kind === 'transfer'
      ? `${m.staffName} (${m.fromDesignation}, ${m.fromBranchName}) is transferred to ${m.toBranchName} as ${m.toDesignation}. Effective: ${m.effectiveDate}.`
      : `${m.staffName} is promoted from ${m.fromDesignation} (${m.fromBranchName}) to ${m.toDesignation} (${m.toBranchName}). Effective: ${m.effectiveDate}.`;
  return [heading, `আদেশ নং / Order No: ${m.orderNumber ?? '—'}`, ``, bodyBn, ``, bodyEn, ``, m.orgName].join('\n');
}
