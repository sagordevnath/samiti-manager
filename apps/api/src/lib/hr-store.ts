/**
 * ── HR demo store ────────────────────────────────────────────────────────────
 * In-memory dataset mirroring the 0032 tables. Preview/test only — the
 * Supabase path uses the real tables with the same shapes. NID and bank
 * account are encrypted with the member-crypto helper and only masked values
 * leave the store.
 */
import { randomUUID } from 'node:crypto';
import {
  DESIGNATION_LABELS_BN,
  LEAVE_ENTITLEMENTS,
  daysBetweenInclusive,
  deriveAttendanceStatus,
  isFieldStaff,
  probationEndDateFor,
  type Applicant,
  type AttendanceEntry,
  type Designation,
  type HrHoliday,
  type LeaveRequest,
  type Staff,
  type StaffEducation,
  type StaffGrade,
  type StaffMovement,
  type StaffPosting,
  type StaffStatus,
  type Vacancy,
  type VacancyCreateInput,
  type StaffCreateInput,
  type LeaveRequestInput,
  type MovementCreateInput,
} from '@samity/shared';
import { encryptIdNumber } from './member-crypto.js';

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const BRANCH_MYMENSINGH = '00000000-0000-4000-8000-0000000000b2';

/** Masked bank display: last 4 digits after dots. */
function maskBankTail(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return `····${digits.slice(-4)}`;
}

export class HrDemoError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface HrDemoData {
  orgId: string;
  staff: Staff[];
  postings: StaffPosting[];
  education: StaffEducation[];
  vacancies: Vacancy[];
  applicants: Applicant[];
  attendance: AttendanceEntry[];
  leaveRequests: LeaveRequest[];
  holidays: HrHoliday[];
  movements: StaffMovement[];
  /** Branch reference points for the field check-in radius check. */
  branchPoints: Record<string, { lat: number; lng: number }>;
  counters: { employee: number; transferOrder: number; promotionOrder: number };
}

const globalRef = globalThis as unknown as { __hrDemoData?: HrDemoData };

const todayStr = () => new Date().toISOString().slice(0, 10);

function buildStore(): HrDemoData {
  const now = new Date().toISOString();
  const staffSeed: Staff[] = [
    {
      id: '00000000-0000-4000-8000-0000000000f1',
      orgId: ORG_ID,
      employeeCode: 'EMP-DHK-0001',
      name: 'Kamal Hossain',
      nameBn: 'কমল হোসেন',
      designation: 'field_officer',
      grade: 'G2',
      branchId: BRANCH_DHAKA,
      joiningDate: '2025-09-23',
      probationEndDate: '2026-09-22',
      confirmationDate: null,
      status: 'probation',
      mobile: '01712345678',
      email: 'kamal@samity.test',
      nidEnc: null,
      nidMasked: '4567',
      bankAccountEnc: null,
      bankName: 'Sonali Bank',
      bankMasked: '····1234',
      monthlyGross: '16500.00',
      emergencyContactName: 'Rahima Begum',
      emergencyContactPhone: '01812345678',
      documents: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '00000000-0000-4000-8000-0000000000f2',
      orgId: ORG_ID,
      employeeCode: 'EMP-DHK-0002',
      name: 'Nusrat Jahan',
      nameBn: 'নুসরাত জাহান',
      designation: 'accountant',
      grade: 'G3',
      branchId: BRANCH_DHAKA,
      joiningDate: '2024-03-01',
      probationEndDate: '2025-02-28',
      confirmationDate: '2025-03-01',
      status: 'confirmed',
      mobile: '01912345678',
      email: 'nusrat@samity.test',
      nidEnc: null,
      nidMasked: '9012',
      bankAccountEnc: null,
      bankName: 'DBBL',
      bankMasked: '····8877',
      monthlyGross: '28000.00',
      emergencyContactName: null,
      emergencyContactPhone: null,
      documents: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '00000000-0000-4000-8000-0000000000f3',
      orgId: ORG_ID,
      employeeCode: 'EMP-MYM-0001',
      name: 'Abdul Karim',
      nameBn: 'আব্দুল করিম',
      designation: 'branch_manager',
      grade: 'G4',
      branchId: BRANCH_MYMENSINGH,
      joiningDate: '2020-06-15',
      probationEndDate: '2021-06-14',
      confirmationDate: '2021-06-15',
      status: 'confirmed',
      mobile: '01612345678',
      email: 'karim@samity.test',
      nidEnc: null,
      nidMasked: '3344',
      bankAccountEnc: null,
      bankName: 'Sonali Bank',
      bankMasked: '····5566',
      monthlyGross: '42000.00',
      emergencyContactName: null,
      emergencyContactPhone: null,
      documents: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
  return {
    orgId: ORG_ID,
    staff: staffSeed,
    postings: staffSeed.map((s) => ({
      id: randomUUID(),
      staffId: s.id,
      branchId: s.branchId,
      branchName: s.branchId === BRANCH_DHAKA ? 'Dhaka Branch' : 'Mymensingh Sadar',
      designation: s.designation,
      effectiveFrom: s.joiningDate,
      effectiveTo: null,
      note: 'Initial posting',
    })),
    education: [
      { id: randomUUID(), staffId: staffSeed[0]!.id, level: 'Bachelor', institution: 'National University', passingYear: 2023, result: '2nd class' },
    ],
    vacancies: [
      {
        id: '00000000-0000-4000-8000-0000000000a1',
        orgId: ORG_ID,
        branchId: BRANCH_DHAKA,
        branchName: 'Dhaka Branch',
        designation: 'field_officer',
        headcount: 2,
        reason: 'Branch expansion — 4 new samities',
        status: 'approved',
        requestedBy: 'bm-dhaka',
        decidedBy: 'director-ops',
        decidedAt: now,
        note: null,
        createdAt: now,
      },
    ],
    applicants: [
      {
        id: '00000000-0000-4000-8000-0000000000b1',
        vacancyId: '00000000-0000-4000-8000-0000000000a1',
        name: 'Rahima Begum',
        mobile: '01711223344',
        educationLevel: 'HSC',
        experienceYears: 2,
        status: 'shortlisted',
        interviewScores: [],
        offeredSalary: null,
        createdAt: now,
      },
      {
        id: '00000000-0000-4000-8000-0000000000b2',
        vacancyId: '00000000-0000-4000-8000-0000000000a1',
        name: 'Sultana Akter',
        mobile: '01722334455',
        educationLevel: 'Bachelor',
        experienceYears: 0,
        status: 'applied',
        interviewScores: [],
        offeredSalary: null,
        createdAt: now,
      },
    ],
    attendance: [],
    leaveRequests: [],
    holidays: [
      { id: randomUUID(), date: '2026-12-25', name: 'Christmas Day', nameBn: 'বড়দিন' },
      { id: randomUUID(), date: '2026-12-16', name: 'Victory Day', nameBn: 'বিজয় দিবস' },
    ],
    movements: [],
    branchPoints: {
      [BRANCH_DHAKA]: { lat: 23.8103, lng: 90.4125 },
      [BRANCH_MYMENSINGH]: { lat: 24.7471, lng: 90.4203 },
    },
    counters: { employee: 3, transferOrder: 0, promotionOrder: 0 },
  };
}

export function hrDemoStore(): HrDemoData {
  globalRef.__hrDemoData ??= buildStore();
  return globalRef.__hrDemoData;
}

export function resetHrDemoStore(): void {
  globalRef.__hrDemoData = buildStore();
}

// ── 1) Staff master ─────────────────────────────────────────────────────────
/** Public view of a staff row: ciphertext fields stripped, masks kept. */
function publicStaff(s: Staff): Staff {
  return { ...s, nidEnc: null, bankAccountEnc: null };
}

export function listHrStaff(store: HrDemoData, filters: { branchId?: string; status?: string; q?: string } = {}): Staff[] {
  let rows = store.staff;
  if (filters.branchId) rows = rows.filter((s) => s.branchId === filters.branchId);
  if (filters.status) rows = rows.filter((s) => s.status === filters.status);
  if (filters.q) {
    const q = filters.q.toLowerCase();
    rows = rows.filter((s) => s.name.toLowerCase().includes(q) || s.employeeCode.toLowerCase().includes(q) || s.mobile.includes(q));
  }
  return [...rows].sort((a, b) => a.employeeCode.localeCompare(b.employeeCode)).map(publicStaff);
}

export function getHrStaff(store: HrDemoData, id: string) {
  const s = store.staff.find((x) => x.id === id);
  if (!s) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');
  return {
    ...publicStaff(s),
    postings: store.postings.filter((p) => p.staffId === id).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)),
    education: store.education.filter((e) => e.staffId === id),
  };
}

export function createHrStaff(store: HrDemoData, input: StaffCreateInput, orgId: string): Staff {
  store.counters.employee += 1;
  const branchPrefix = input.branchId === BRANCH_MYMENSINGH ? 'MYM' : 'DHK';
  const joining = input.joiningDate;
  const staff: Staff = {
    id: randomUUID(),
    orgId,
    employeeCode: `EMP-${branchPrefix}-${String(store.counters.employee).padStart(4, '0')}`,
    name: input.name,
    nameBn: input.nameBn,
    designation: input.designation,
    grade: input.grade,
    branchId: input.branchId ?? null,
    joiningDate: joining,
    probationEndDate: probationEndDateFor(joining),
    confirmationDate: null,
    status: 'probation',
    mobile: input.mobile,
    email: input.email ?? null,
    nidEnc: input.nid ? encryptIdNumber(input.nid, orgId) : null,
    nidMasked: input.nid ? maskIdNumber4(input.nid) : null,
    bankAccountEnc: input.bankAccount ? encryptIdNumber(input.bankAccount, orgId) : null,
    bankName: input.bankName ?? null,
    bankMasked: input.bankAccount ? maskBankTail(input.bankAccount) : null,
    monthlyGross: input.monthlyGross,
    emergencyContactName: input.emergencyContactName ?? null,
    emergencyContactPhone: input.emergencyContactPhone ?? null,
    documents: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  store.staff.push(staff);
  store.postings.push({
    id: randomUUID(),
    staffId: staff.id,
    branchId: staff.branchId,
    branchName: staff.branchId === BRANCH_MYMENSINGH ? 'Mymensingh Sadar' : 'Dhaka Branch',
    designation: staff.designation,
    effectiveFrom: staff.joiningDate,
    effectiveTo: null,
    note: 'Initial posting',
  });
  return publicStaff(staff);
}

export function updateHrStaff(store: HrDemoData, id: string, patch: Partial<StaffCreateInput> & { status?: StaffStatus; confirmationDate?: string | null }): Staff {
  const s = store.staff.find((x) => x.id === id);
  if (!s) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');
  if (patch.name !== undefined) s.name = patch.name;
  if (patch.nameBn !== undefined) s.nameBn = patch.nameBn;
  if (patch.designation !== undefined) s.designation = patch.designation;
  if (patch.grade !== undefined) s.grade = patch.grade;
  if (patch.mobile !== undefined) s.mobile = patch.mobile;
  if (patch.email !== undefined) s.email = patch.email ?? null;
  if (patch.monthlyGross !== undefined) s.monthlyGross = patch.monthlyGross;
  if (patch.status !== undefined) s.status = patch.status;
  if (patch.confirmationDate !== undefined) s.confirmationDate = patch.confirmationDate ?? null;
  if (patch.nid !== undefined) {
    s.nidEnc = patch.nid ? encryptIdNumber(patch.nid, s.orgId) : null;
    s.nidMasked = patch.nid ? maskIdNumber4(patch.nid) : null;
  }
  if (patch.bankAccount !== undefined) {
    s.bankAccountEnc = patch.bankAccount ? encryptIdNumber(patch.bankAccount, s.orgId) : null;
    s.bankMasked = patch.bankAccount ? maskBankTail(patch.bankAccount) : null;
  }
  s.updatedAt = new Date().toISOString();
  return s;
}

export function confirmHrStaff(store: HrDemoData, id: string, userId: string): Staff {
  const s = store.staff.find((x) => x.id === id);
  if (!s) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');
  if (s.status !== 'probation') throw new HrDemoError(409, 'CONFLICT', `Staff is ${s.status}, not on probation`);
  s.status = 'confirmed';
  s.confirmationDate = todayStr();
  s.updatedAt = new Date().toISOString();
  void userId;
  return s;
}

export function addHrEducation(store: HrDemoData, staffId: string, input: { level: string; institution: string; passingYear: number; result: string }): StaffEducation {
  const s = store.staff.find((x) => x.id === staffId);
  if (!s) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');
  const row: StaffEducation = { id: randomUUID(), staffId, ...input };
  store.education.push(row);
  return row;
}

// ── 2) Recruitment lite ─────────────────────────────────────────────────────
export function listHrVacancies(store: HrDemoData): Vacancy[] {
  return [...store.vacancies].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createHrVacancy(store: HrDemoData, input: VacancyCreateInput, userId: string): Vacancy {
  const vacancy: Vacancy = {
    id: randomUUID(),
    orgId: store.orgId,
    branchId: input.branchId,
    branchName: input.branchId === BRANCH_MYMENSINGH ? 'Mymensingh Sadar' : 'Dhaka Branch',
    designation: input.designation,
    headcount: input.headcount,
    reason: input.reason,
    status: 'requested',
    requestedBy: userId,
    decidedBy: null,
    decidedAt: null,
    note: null,
    createdAt: new Date().toISOString(),
  };
  store.vacancies.push(vacancy);
  return vacancy;
}

export function decideHrVacancy(store: HrDemoData, id: string, decision: 'approve' | 'reject', userId: string, note?: string): Vacancy {
  const v = store.vacancies.find((x) => x.id === id);
  if (!v) throw new HrDemoError(404, 'NOT_FOUND', 'Vacancy not found');
  if (v.status !== 'requested') throw new HrDemoError(409, 'CONFLICT', `Vacancy already ${v.status}`);
  v.status = decision === 'approve' ? 'approved' : 'rejected';
  v.decidedBy = userId;
  v.decidedAt = new Date().toISOString();
  v.note = note ?? null;
  return v;
}

export function listHrApplicants(store: HrDemoData, vacancyId?: string): Applicant[] {
  return store.applicants.filter((a) => !vacancyId || a.vacancyId === vacancyId);
}

export function createHrApplicant(store: HrDemoData, input: { vacancyId: string; name: string; mobile: string; educationLevel: string; experienceYears: number }): Applicant {
  const v = store.vacancies.find((x) => x.id === input.vacancyId);
  if (!v) throw new HrDemoError(404, 'NOT_FOUND', 'Vacancy not found');
  if (v.status !== 'approved') throw new HrDemoError(409, 'CONFLICT', 'Vacancy is not open for applicants');
  const applicant: Applicant = {
    id: randomUUID(),
    vacancyId: input.vacancyId,
    name: input.name,
    mobile: input.mobile,
    educationLevel: input.educationLevel,
    experienceYears: input.experienceYears,
    status: 'applied',
    interviewScores: [],
    offeredSalary: null,
    createdAt: new Date().toISOString(),
  };
  store.applicants.push(applicant);
  return applicant;
}

export function setHrApplicantStatus(store: HrDemoData, id: string, status: Applicant['status'], offeredSalary?: string | null): Applicant {
  const a = store.applicants.find((x) => x.id === id);
  if (!a) throw new HrDemoError(404, 'NOT_FOUND', 'Applicant not found');
  a.status = status;
  if (offeredSalary !== undefined) a.offeredSalary = offeredSalary ?? null;
  return a;
}

export function addHrInterviewScore(store: HrDemoData, id: string, score: { panelist: string; score: number; note?: string | null }): Applicant {
  const a = store.applicants.find((x) => x.id === id);
  if (!a) throw new HrDemoError(404, 'NOT_FOUND', 'Applicant not found');
  a.interviewScores.push({ panelist: score.panelist, score: score.score, note: score.note ?? null });
  if (a.status === 'shortlisted' || a.status === 'applied') a.status = 'interviewed';
  return a;
}

export function offerHrApplicant(store: HrDemoData, id: string, offeredSalary: string): Applicant {
  const a = store.applicants.find((x) => x.id === id);
  if (!a) throw new HrDemoError(404, 'NOT_FOUND', 'Applicant not found');
  if (a.interviewScores.length === 0) throw new HrDemoError(409, 'CONFLICT', 'At least one interview score is required before an offer');
  a.status = 'offered';
  a.offeredSalary = offeredSalary;
  return a;
}

// ── 3) Attendance & leave ───────────────────────────────────────────────────
export function listHrAttendance(store: HrDemoData, workDate: string, branchId?: string): Array<AttendanceEntry & { staffName: string }> {
  return store.attendance
    .filter((a) => a.workDate === workDate)
    .filter((a) => {
      if (!branchId) return true;
      const s = store.staff.find((x) => x.id === a.staffId);
      return s?.branchId === branchId;
    })
    .map((a) => ({ ...a, staffName: store.staff.find((s) => s.id === a.staffId)?.name ?? a.staffId }));
}

export function checkInField(store: HrDemoData, staffId: string, input: { workDate: string; lat: number; lng: number; selfiePath: string }, userId: string): AttendanceEntry {
  const s = store.staff.find((x) => x.id === staffId);
  if (!s) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');
  if (!isFieldStaff(s)) throw new HrDemoError(409, 'CONFLICT', 'This staff member is not a field worker — use office check-in');
  if (store.attendance.some((a) => a.staffId === staffId && a.workDate === input.workDate)) {
    throw new HrDemoError(409, 'CONFLICT', 'Already checked in for this date');
  }
  const branchPoint = s.branchId ? store.branchPoints[s.branchId] : undefined;
  const derived = deriveAttendanceStatus({
    mode: 'field',
    checkInAt: new Date().toISOString(),
    branchPoint: branchPoint ?? null,
    checkInPoint: { lat: input.lat, lng: input.lng },
  });
  const entry: AttendanceEntry = {
    id: randomUUID(),
    staffId,
    workDate: input.workDate,
    status: derived.status,
    checkInAt: new Date().toISOString(),
    checkInLat: input.lat,
    checkInLng: input.lng,
    selfiePath: input.selfiePath,
    distanceMeters: derived.distanceMeters,
    mode: 'field',
    note: derived.outOfRange ? `Out of range (${derived.distanceMeters}m)` : null,
  };
  store.attendance.push(entry);
  void userId;
  return entry;
}

export function checkInOffice(store: HrDemoData, staffId: string, input: { workDate: string }): AttendanceEntry {
  const s = store.staff.find((x) => x.id === staffId);
  if (!s) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');
  if (isFieldStaff(s)) throw new HrDemoError(409, 'CONFLICT', 'Field staff must use GPS check-in');
  if (store.attendance.some((a) => a.staffId === staffId && a.workDate === input.workDate)) {
    throw new HrDemoError(409, 'CONFLICT', 'Already checked in for this date');
  }
  const entry: AttendanceEntry = {
    id: randomUUID(),
    staffId,
    workDate: input.workDate,
    status: deriveAttendanceStatus({ mode: 'office', checkInAt: new Date().toISOString() }).status,
    checkInAt: new Date().toISOString(),
    checkInLat: null,
    checkInLng: null,
    selfiePath: null,
    distanceMeters: null,
    mode: 'office',
    note: null,
  };
  store.attendance.push(entry);
  return entry;
}

export function listHrLeave(store: HrDemoData, staffId?: string): LeaveRequest[] {
  return store.leaveRequests.filter((l) => !staffId || l.staffId === staffId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function requestHrLeave(store: HrDemoData, input: LeaveRequestInput): LeaveRequest {
  const s = store.staff.find((x) => x.id === input.staffId);
  if (!s) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');
  const days = daysBetweenInclusive(input.startDate, input.endDate);
  const holidaysBetween = store.holidays.filter(
    (h) => h.date >= input.startDate && h.date <= input.endDate && h.date !== input.startDate,
  ).length;
  const approvedDaysTaken = store.leaveRequests
    .filter((l) => l.staffId === input.staffId && l.leaveType === input.leaveType && l.status === 'approved' && l.startDate.startsWith(todayStr().slice(0, 4)))
    .reduce((sum, l) => sum + l.days, 0);
  const chargeable = days - holidaysBetween;
  if (chargeable > LEAVE_ENTITLEMENTS[input.leaveType] - approvedDaysTaken) {
    throw new HrDemoError(
      422,
      'LEAVE_BALANCE_EXCEEDED',
      `Insufficient ${input.leaveType} balance: ${approvedDaysTaken}/${LEAVE_ENTITLEMENTS[input.leaveType]} taken, ${chargeable} requested`,
    );
  }
  const req: LeaveRequest = {
    id: randomUUID(),
    staffId: input.staffId,
    leaveType: input.leaveType,
    startDate: input.startDate,
    endDate: input.endDate,
    days,
    reason: input.reason,
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date().toISOString(),
  };
  store.leaveRequests.push(req);
  return req;
}

export function decideHrLeave(store: HrDemoData, id: string, decision: 'approve' | 'reject', userId: string): LeaveRequest {
  const l = store.leaveRequests.find((x) => x.id === id);
  if (!l) throw new HrDemoError(404, 'NOT_FOUND', 'Leave request not found');
  if (l.status !== 'pending') throw new HrDemoError(409, 'CONFLICT', `Leave already ${l.status}`);
  l.status = decision === 'approve' ? 'approved' : 'rejected';
  l.decidedBy = userId;
  l.decidedAt = new Date().toISOString();
  if (l.status === 'approved') {
    // Mark attendance rows as leave for the covered dates that exist.
    for (let d = l.startDate; d <= l.endDate; d = nextDay(d)) {
      const entry = store.attendance.find((a) => a.staffId === l.staffId && a.workDate === d);
      if (entry) entry.status = 'leave';
    }
  }
  return l;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function listHrHolidays(store: HrDemoData): HrHoliday[] {
  return [...store.holidays].sort((a, b) => a.date.localeCompare(b.date));
}

export function addHrHoliday(store: HrDemoData, input: { date: string; name: string; nameBn: string }): HrHoliday {
  if (store.holidays.some((h) => h.date === input.date)) {
    throw new HrDemoError(409, 'CONFLICT', 'Holiday already exists for that date');
  }
  const row: HrHoliday = { id: randomUUID(), ...input };
  store.holidays.push(row);
  return row;
}

export function hrLeaveBalance(store: HrDemoData, staffId: string, year: string) {
  const result: Record<string, { entitlement: number; taken: number; remaining: number }> = {};
  for (const type of Object.keys(LEAVE_ENTITLEMENTS) as Array<keyof typeof LEAVE_ENTITLEMENTS>) {
    const taken = store.leaveRequests
      .filter((l) => l.staffId === staffId && l.leaveType === type && l.status === 'approved' && l.startDate.startsWith(year))
      .reduce((sum, l) => sum + l.days, 0);
    result[type] = {
      entitlement: LEAVE_ENTITLEMENTS[type],
      taken,
      remaining: LEAVE_ENTITLEMENTS[type] - taken,
    };
  }
  return result;
}

// ── 4) Transfer & promotion ─────────────────────────────────────────────────
export function listHrMovements(store: HrDemoData): StaffMovement[] {
  return [...store.movements].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createHrMovement(store: HrDemoData, input: MovementCreateInput, userId: string): StaffMovement {
  const s = store.staff.find((x) => x.id === input.staffId);
  if (!s) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');
  if (s.status !== 'confirmed') throw new HrDemoError(409, 'CONFLICT', 'Only confirmed staff can be transferred or promoted');
  if (input.kind === 'transfer' && !input.toBranchId) {
    throw new HrDemoError(400, 'VALIDATION_ERROR', 'Transfers require a destination branch');
  }
  if (input.kind === 'promotion' && input.toBranchId && input.toBranchId !== s.branchId) {
    throw new HrDemoError(400, 'VALIDATION_ERROR', 'Promotions keep the branch — use transfer for branch changes');
  }
  const fromBranchName = s.branchId === BRANCH_MYMENSINGH ? 'Mymensingh Sadar' : s.branchId === BRANCH_DHAKA ? 'Dhaka Branch' : 'Head Office';
  const toBranchName = input.toBranchId === BRANCH_MYMENSINGH ? 'Mymensingh Sadar' : input.toBranchId === BRANCH_DHAKA ? 'Dhaka Branch' : 'Head Office';
  const movement: StaffMovement = {
    id: randomUUID(),
    kind: input.kind,
    staffId: s.id,
    staffName: s.name,
    fromBranchId: s.branchId,
    fromBranchName,
    fromDesignation: s.designation,
    toBranchId: input.toBranchId ?? null,
    toBranchName,
    toDesignation: input.toDesignation,
    toGrade: input.toGrade ?? null,
    newMonthlyGross: input.newMonthlyGross ?? null,
    effectiveDate: input.effectiveDate,
    reason: input.reason,
    status: 'proposed',
    proposedBy: userId,
    approvedBy: null,
    approvedAt: null,
    orderNumber: null,
    createdAt: new Date().toISOString(),
  };
  store.movements.push(movement);
  return movement;
}

export function decideHrMovement(store: HrDemoData, id: string, decision: 'approve' | 'reject', userId: string): StaffMovement {
  const m = store.movements.find((x) => x.id === id);
  if (!m) throw new HrDemoError(404, 'NOT_FOUND', 'Movement not found');
  if (m.status !== 'proposed') throw new HrDemoError(409, 'CONFLICT', `Movement already ${m.status}`);
  if (decision === 'reject') {
    m.status = 'rejected';
    return m;
  }
  m.status = 'approved';
  m.approvedBy = userId;
  m.approvedAt = new Date().toISOString();
  if (m.kind === 'transfer') {
    store.counters.transferOrder += 1;
    m.orderNumber = `TRF-${new Date().getFullYear()}-${String(store.counters.transferOrder).padStart(4, '0')}`;
  } else {
    store.counters.promotionOrder += 1;
    m.orderNumber = `PRM-${new Date().getFullYear()}-${String(store.counters.promotionOrder).padStart(4, '0')}`;
  }
  return m;
}

/** Apply an approved movement: updates staff + posting history. */
export function applyHrMovement(store: HrDemoData, id: string, userId: string): StaffMovement {
  const m = store.movements.find((x) => x.id === id);
  if (!m) throw new HrDemoError(404, 'NOT_FOUND', 'Movement not found');
  if (m.status !== 'approved') throw new HrDemoError(409, 'CONFLICT', 'Movement must be approved before it becomes effective');
  const s = store.staff.find((x) => x.id === m.staffId);
  if (!s) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');

  // Close the current posting.
  const current = store.postings.find((p) => p.staffId === s.id && p.effectiveTo === null);
  if (current) current.effectiveTo = m.effectiveDate;

  if (m.kind === 'transfer') s.branchId = m.toBranchId;
  s.designation = m.toDesignation;
  if (m.toGrade) s.grade = m.toGrade;
  if (m.newMonthlyGross) s.monthlyGross = m.newMonthlyGross;
  s.updatedAt = new Date().toISOString();

  store.postings.push({
    id: randomUUID(),
    staffId: s.id,
    branchId: s.branchId,
    branchName: m.toBranchName,
    designation: m.toDesignation,
    effectiveFrom: m.effectiveDate,
    effectiveTo: null,
    note: m.kind === 'transfer' ? 'Transfer' : 'Promotion',
  });

  m.status = 'effective';
  void userId;
  return m;
}

export function hrMovementOrderText(store: HrDemoData, id: string): string {
  const m = store.movements.find((x) => x.id === id);
  if (!m) throw new HrDemoError(404, 'NOT_FOUND', 'Movement not found');
  if (m.status !== 'approved' && m.status !== 'effective') {
    throw new HrDemoError(409, 'CONFLICT', 'Order is generated after approval');
  }
  const bn = (d: Designation) => DESIGNATION_LABELS_BN[d];
  const heading = m.kind === 'transfer' ? 'আদেশ: কর্মস্থল পরিবর্তন (বদলি) / ORDER: Transfer' : 'আদেশ: পদোন্নতি / ORDER: Promotion';
  const bodyBn =
    m.kind === 'transfer'
      ? `${m.staffName} (${bn(m.fromDesignation)}, ${m.fromBranchName}) কে ${m.toBranchName}-এ ${bn(m.toDesignation)} হিসেবে বদলি করা হলো। কার্যকর: ${m.effectiveDate}।`
      : `${m.staffName} কে ${bn(m.fromDesignation)} (${m.fromBranchName}) থেকে ${bn(m.toDesignation)} (${m.toBranchName}) পদে পদোন্নতি দেওয়া হলো। কার্যকর: ${m.effectiveDate}।`;
  const bodyEn =
    m.kind === 'transfer'
      ? `${m.staffName} (${m.fromDesignation}, ${m.fromBranchName}) is transferred to ${m.toBranchName} as ${m.toDesignation}. Effective: ${m.effectiveDate}.`
      : `${m.staffName} is promoted from ${m.fromDesignation} (${m.fromBranchName}) to ${m.toDesignation} (${m.toBranchName}). Effective: ${m.effectiveDate}.`;
  return [heading, `আদেশ নং / Order No: ${m.orderNumber ?? '—'}`, '', bodyBn, '', bodyEn, '', 'Samity Manager'].join('\n');
}

export type { StaffGrade, StaffStatus };

/** Last-4 mask for display. */
function maskIdNumber4(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.slice(-4);
}
