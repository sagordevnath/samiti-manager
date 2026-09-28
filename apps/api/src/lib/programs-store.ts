/**
 * ── Programs & projects demo store ───────────────────────────────────────────
 * In-memory project register, logframe, beneficiaries, services, activities
 * and training batches. Preview/test only — the Supabase path uses migration
 * 0044 with the same shapes and trigger-enforced state machines.
 */
import { randomUUID } from 'node:crypto';
import {
  CASE_FLOW,
  canManageCases,
  canTransitionCase,
  maskCase,
  nextCaseNo,
  nextFundingCode,
  type BudgetMonitor,
  budgetMonitor,
  buildDonorReport,
  burnRate,
  type BurnRateStatus,
  type CaseAccessLogRow,
  type CaseFile,
  type CaseFileBody,
  type CaseStatus,
  type DonorReport,
  donorUtilization,
  type DonorUtilizationRow,
  type ExpenseRecord,
  type FieldVisit,
  type FieldVisitBody,
  type FundingSource,
  type FundingSourceBody,
  type MaskedCase,
  overdueFollowUps,
  type RepaymentInstallment,
  repaymentSchedule,
  type RepaymentSummary,
  repaymentSummary,
  type VisitChecklistRow,
  visitScore,
  PROJECT_ACTION_TO_STATUS,
  activitiesInRange,
  batchStats,
  canTransitionProject,
  nextBeneficiaryCode,
  nextBatchCode,
  nextCertificateNo,
  type ActivityBody,
  type ActivityRecord,
  type ActivityStatus,
  type BeneficiaryBody,
  type BeneficiaryRecord,
  type BeneficiaryEnrollment,
  type BatchStats,
  type EnrollmentBody,
  type IndicatorValue,
  type IndicatorValueBody,
  type LogframeEntry,
  type LogframeEntryBody,
  type LogframeLevel,
  type ProjectAction,
  type ProjectBody,
  type ProjectExpenseBody,
  type ProjectRecord,
  type ProjectStatus,
  type ServiceKind,
  type ServiceRecord,
  type ServiceRecordBody,
  type TrainingAttendanceBody,
  type AttendanceRow,
  type TestScoreRow,
  type TrainingBatch,
  type TrainingBatchBody,
  type TestScoreBody,
  type Certificate,
  type TrainingAttendanceBody as AttendanceBody,
} from '@samity/shared';

const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';

export class ProgramsError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function err(status: number, code: string, message: string): never {
  throw new ProgramsError(status, code, message);
}

export interface ProgramsDemoData {
  orgId: string;
  projects: ProjectRecord[];
  projectSeq: number;
  logframe: LogframeEntry[];
  indicatorValues: IndicatorValue[];
  beneficiaries: BeneficiaryRecord[];
  beneficiarySeq: number;
  enrollments: BeneficiaryEnrollment[];
  services: ServiceRecord[];
  activities: ActivityRecord[];
  batches: TrainingBatch[];
  batchSeq: number;
  attendance: AttendanceRow[];
  scores: TestScoreRow[];
  certificates: Certificate[];
  certificateSeq: number;
  /* ── Reqs 5–9 ── */
  expenses: ExpenseRecord[];
  visits: FieldVisit[];
  donorReports: StoredDonorReport[];
  cases: CaseFile[];
  caseSeq: number;
  caseAccessLog: CaseAccessLogRow[];
  fundingSources: FundingSource[];
  fundingSeq: number;
}

const globalRef = globalThis as unknown as { __programsDemoData?: ProgramsDemoData };

function seedStore(): ProgramsDemoData {
  return {
    orgId: ORG_ID,
    projects: [],
    projectSeq: 0,
    logframe: [],
    indicatorValues: [],
    beneficiaries: [],
    beneficiarySeq: 0,
    enrollments: [],
    services: [],
    activities: [],
    batches: [],
    batchSeq: 0,
    attendance: [],
    scores: [],
    certificates: [],
    certificateSeq: 0,
    expenses: [],
    visits: [],
    donorReports: [],
    cases: [],
    caseSeq: 0,
    caseAccessLog: [],
    fundingSources: [],
    fundingSeq: 0,
  };
}

export function programsStore(): ProgramsDemoData {
  globalRef.__programsDemoData ??= seedStore();
  return globalRef.__programsDemoData;
}

export function resetProgramsStore(): void {
  delete globalRef.__programsDemoData;
}

/* ── 1) Projects ──────────────────────────────────────────────────────────── */

export interface ProjectRow extends ProjectRecord {
  budgetTotal: string;
}

export function createProject(store: ProgramsDemoData, body: ProjectBody): ProjectRow {
  if (store.projects.some((p) => p.code === body.code)) {
    err(409, 'CONFLICT', `প্রকল্প কোড ${body.code} আছে / Project code already exists`);
  }
  if (body.endDate <= body.startDate) {
    err(422, 'VALIDATION_ERROR', 'শেষ তারিখ শুরুর পরে হতে হবে / End date must be after start date');
  }
  store.projectSeq += 1;
  const now = new Date().toISOString();
  const project: ProjectRecord = {
    id: randomUUID(),
    orgId: store.orgId,
    code: body.code,
    nameBn: body.nameBn,
    nameEn: body.nameEn,
    donor: body.donor,
    grantAgreementNo: body.grantAgreementNo,
    fundCode: body.fundCode,
    sector: body.sector,
    startDate: body.startDate,
    endDate: body.endDate,
    targetAreas: body.targetAreas,
    targetBeneficiaries: body.targetBeneficiaries,
    managerName: body.managerName,
    budget: body.budget,
    status: 'proposed',
    createdAt: now,
    updatedAt: now,
  };
  store.projects.push(project);
  return withBudgetTotal(project);
}

function withBudgetTotal(p: ProjectRecord): ProjectRow {
  return {
    ...p,
    budgetTotal: p.budget.reduce((s, b) => s + Number(b.amount), 0).toFixed(2),
  };
}

export function listProjects(store: ProgramsDemoData, filter: { sector?: string; status?: string; donor?: string } = {}): ProjectRow[] {
  let rows = [...store.projects].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (filter.sector) rows = rows.filter((p) => p.sector === filter.sector);
  if (filter.status) rows = rows.filter((p) => p.status === filter.status);
  if (filter.donor) rows = rows.filter((p) => p.donor.toLowerCase().includes(filter.donor!.toLowerCase()));
  return rows.map(withBudgetTotal);
}

export function getProject(store: ProgramsDemoData, id: string): ProjectRecord {
  const p = store.projects.find((x) => x.id === id);
  if (!p) err(404, 'NOT_FOUND', 'প্রকল্প পাওয়া যায়নি / Project not found');
  return p as ProjectRecord;
}

export function decideProject(store: ProgramsDemoData, id: string, action: ProjectAction): ProjectRecord {
  const p = getProject(store, id);
  const to = PROJECT_ACTION_TO_STATUS[action];
  if (!canTransitionProject(p.status, to)) {
    err(409, 'CONFLICT', `অবৈধ প্রকল্প অবস্থান্তর ${p.status} → ${to} / Invalid project transition`);
  }
  p.status = to;
  p.updatedAt = new Date().toISOString();
  return p;
}

/** Fund-code link for Module 10: the tag budget/expenses post under. */
export function projectFundTag(store: ProgramsDemoData, id: string): { fundCode: string; project: string } {
  const p = getProject(store, id);
  return { fundCode: p.fundCode, project: p.nameEn };
}

/* ── 2) Logframe ──────────────────────────────────────────────────────────── */

export function addLogframeEntry(store: ProgramsDemoData, projectId: string, body: LogframeEntryBody): LogframeEntry {
  const project = getProject(store, projectId);
  const entry: LogframeEntry = {
    id: randomUUID(),
    orgId: store.orgId,
    projectId: project.id,
    level: body.level,
    statement: body.statement,
    parentLabel: body.parentLabel,
    indicatorCode: body.indicatorCode,
    baseline: body.baseline,
    targetValue: body.targetValue,
    unit: body.unit,
    meansOfVerification: body.meansOfVerification,
    createdAt: new Date().toISOString(),
  };
  store.logframe.push(entry);
  return entry;
}

export function listLogframe(store: ProgramsDemoData, projectId: string): LogframeEntry[] {
  getProject(store, projectId);
  return store.logframe.filter((e) => e.projectId === projectId);
}

export function getLogframeEntry(store: ProgramsDemoData, entryId: string): LogframeEntry {
  const e = store.logframe.find((x) => x.id === entryId);
  if (!e) err(404, 'NOT_FOUND', 'লগফ্রেম ভুক্তি পাওয়া যায়নি / Logframe entry not found');
  return e as LogframeEntry;
}

export function addIndicatorValue(store: ProgramsDemoData, body: IndicatorValueBody): IndicatorValue {
  const entry = getLogframeEntry(store, body.entryId);
  if (entry.level !== 'indicator') {
    err(422, 'VALIDATION_ERROR', 'শুধু সূচক স্তরে মাপ যোগ হয় / Values attach to indicator-level entries only');
  }
  if (body.periodEnd < body.periodStart) {
    err(422, 'VALIDATION_ERROR', 'পর্বের তারিখ ভুল / Invalid period');
  }
  const value: IndicatorValue = {
    id: randomUUID(),
    orgId: store.orgId,
    entryId: entry.id,
    periodStart: body.periodStart,
    periodEnd: body.periodEnd,
    value: Number(body.value).toFixed(2),
    evidence: body.evidence,
    note: body.note,
    enteredAt: new Date().toISOString(),
  };
  store.indicatorValues.push(value);
  return value;
}

export function listIndicatorValues(store: ProgramsDemoData, entryId?: string): IndicatorValue[] {
  return entryId ? store.indicatorValues.filter((v) => v.entryId === entryId) : [...store.indicatorValues];
}

/* ── 3) Beneficiaries, enrollments, services ──────────────────────────────── */

export function createBeneficiary(store: ProgramsDemoData, body: BeneficiaryBody): BeneficiaryRecord {
  store.beneficiarySeq += 1;
  const record: BeneficiaryRecord = {
    id: randomUUID(),
    orgId: store.orgId,
    code: nextBeneficiaryCode(store.beneficiarySeq),
    memberId: body.memberId,
    nameBn: body.nameBn,
    guardianBn: body.guardianBn,
    phone: body.phone,
    age: body.age,
    gender: body.gender,
    village: body.village,
    createdAt: new Date().toISOString(),
  };
  store.beneficiaries.push(record);
  return record;
}

export function listBeneficiaries(store: ProgramsDemoData, filter: { projectId?: string; village?: string } = {}): BeneficiaryRecord[] {
  let rows = [...store.beneficiaries].sort((a, b) => a.code.localeCompare(b.code));
  if (filter.village) rows = rows.filter((b) => b.village.includes(filter.village!));
  if (filter.projectId) {
    const ids = new Set(store.enrollments.filter((e) => e.projectId === filter.projectId).map((e) => e.beneficiaryId));
    rows = rows.filter((b) => ids.has(b.id));
  }
  return rows;
}

export function getBeneficiary(store: ProgramsDemoData, id: string): BeneficiaryRecord {
  const b = store.beneficiaries.find((x) => x.id === id);
  if (!b) err(404, 'NOT_FOUND', 'উপকারভোগী পাওয়া যায়নি / Beneficiary not found');
  return b as BeneficiaryRecord;
}

export function enrollBeneficiary(store: ProgramsDemoData, body: EnrollmentBody): BeneficiaryEnrollment {
  getBeneficiary(store, body.beneficiaryId);
  getProject(store, body.projectId);
  if (store.enrollments.some((e) => e.beneficiaryId === body.beneficiaryId && e.projectId === body.projectId)) {
    err(409, 'CONFLICT', 'ইতিমধ্যে ভর্তি / Already enrolled in this project');
  }
  const enrollment: BeneficiaryEnrollment = {
    id: randomUUID(),
    orgId: store.orgId,
    beneficiaryId: body.beneficiaryId,
    projectId: body.projectId,
    enrolledAt: body.enrolledAt,
    note: body.note,
  };
  store.enrollments.push(enrollment);
  return enrollment;
}

export function listEnrollments(store: ProgramsDemoData, filter: { beneficiaryId?: string; projectId?: string } = {}): BeneficiaryEnrollment[] {
  let rows = [...store.enrollments];
  if (filter.beneficiaryId) rows = rows.filter((e) => e.beneficiaryId === filter.beneficiaryId);
  if (filter.projectId) rows = rows.filter((e) => e.projectId === filter.projectId);
  return rows;
}

export function recordService(store: ProgramsDemoData, body: ServiceRecordBody): ServiceRecord {
  getProject(store, body.projectId);
  getBeneficiary(store, body.beneficiaryId);
  const record: ServiceRecord = {
    id: randomUUID(),
    orgId: store.orgId,
    projectId: body.projectId,
    beneficiaryId: body.beneficiaryId,
    kind: body.kind,
    serviceDate: body.serviceDate,
    details: body.details,
    createdAt: new Date().toISOString(),
  };
  store.services.push(record);
  return record;
}

export function listServices(store: ProgramsDemoData, filter: { projectId?: string; beneficiaryId?: string; kind?: string } = {}): ServiceRecord[] {
  let rows = [...store.services].sort((a, b) => b.serviceDate.localeCompare(a.serviceDate));
  if (filter.projectId) rows = rows.filter((s) => s.projectId === filter.projectId);
  if (filter.beneficiaryId) rows = rows.filter((s) => s.beneficiaryId === filter.beneficiaryId);
  if (filter.kind) rows = rows.filter((s) => s.kind === filter.kind);
  return rows;
}

/* ── 4) Activities & training batches ─────────────────────────────────────── */

export function createActivity(store: ProgramsDemoData, body: ActivityBody): ActivityRecord {
  getProject(store, body.projectId);
  const activity: ActivityRecord = {
    id: randomUUID(),
    orgId: store.orgId,
    projectId: body.projectId,
    titleBn: body.titleBn,
    kind: body.kind,
    plannedDate: body.plannedDate,
    venue: body.venue,
    targetParticipants: body.targetParticipants,
    status: 'planned',
    note: body.note,
    createdAt: new Date().toISOString(),
  };
  store.activities.push(activity);
  return activity;
}

export function listActivities(store: ProgramsDemoData, filter: { projectId?: string; start?: string; end?: string; status?: string } = {}): ActivityRecord[] {
  let rows = [...store.activities];
  if (filter.projectId) rows = rows.filter((a) => a.projectId === filter.projectId);
  if (filter.status) rows = rows.filter((a) => a.status === filter.status);
  if (filter.start && filter.end) rows = activitiesInRange(rows, filter.start, filter.end);
  return rows.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
}

export function getActivity(store: ProgramsDemoData, id: string): ActivityRecord {
  const a = store.activities.find((x) => x.id === id);
  if (!a) err(404, 'NOT_FOUND', 'কার্যক্রম পাওয়া যায়নি / Activity not found');
  return a as ActivityRecord;
}

export function decideActivity(store: ProgramsDemoData, id: string, status: Exclude<ActivityStatus, 'planned'>): ActivityRecord {
  const a = getActivity(store, id);
  if (a.status !== 'planned') err(409, 'CONFLICT', 'শুধু পরিকল্পিত কার্যক্রম পরিবর্তন হয় / Only planned activities change');
  a.status = status;
  return a;
}

export function createBatch(store: ProgramsDemoData, body: TrainingBatchBody): TrainingBatch {
  getProject(store, body.projectId);
  if (body.endDate < body.startDate) err(422, 'VALIDATION_ERROR', 'শেষ তারিখ ভুল / End date before start');
  store.batchSeq += 1;
  const batch: TrainingBatch = {
    id: randomUUID(),
    orgId: store.orgId,
    projectId: body.projectId,
    code: nextBatchCode(store.batchSeq),
    titleBn: body.titleBn,
    trainerName: body.trainerName,
    trainerOrgBn: body.trainerOrgBn,
    startDate: body.startDate,
    endDate: body.endDate,
    hours: body.hours,
    sessions: body.sessions,
    createdAt: new Date().toISOString(),
  };
  store.batches.push(batch);
  return batch;
}

export function listBatches(store: ProgramsDemoData, filter: { projectId?: string } = {}): TrainingBatch[] {
  let rows = [...store.batches].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (filter.projectId) rows = rows.filter((b) => b.projectId === filter.projectId);
  return rows;
}

export function getBatch(store: ProgramsDemoData, id: string): TrainingBatch {
  const b = store.batches.find((x) => x.id === id);
  if (!b) err(404, 'NOT_FOUND', 'ব্যাচ পাওয়া যায়নি / Batch not found');
  return b as TrainingBatch;
}

export function markAttendance(store: ProgramsDemoData, body: TrainingAttendanceBody): AttendanceRow {
  getBatch(store, body.batchId);
  getBeneficiary(store, body.beneficiaryId);
  if (body.sessionNo > getBatch(store, body.batchId).sessions) {
    err(422, 'VALIDATION_ERROR', 'সেশন নম্বর ব্যাচের সেশন সংখ্যার বেশি / Session beyond batch plan');
  }
  const existing = store.attendance.find(
    (a) => a.batchId === body.batchId && a.beneficiaryId === body.beneficiaryId && a.sessionNo === body.sessionNo,
  );
  if (existing) {
    existing.present = body.present;
    return existing;
  }
  const row: AttendanceRow = {
    batchId: body.batchId,
    beneficiaryId: body.beneficiaryId,
    sessionNo: body.sessionNo,
    present: body.present,
  };
  store.attendance.push(row);
  return row;
}

export function listAttendance(store: ProgramsDemoData, batchId: string): AttendanceRow[] {
  return store.attendance.filter((a) => a.batchId === batchId);
}

export function setTestScore(store: ProgramsDemoData, body: TestScoreBody): TestScoreRow {
  getBatch(store, body.batchId);
  getBeneficiary(store, body.beneficiaryId);
  const existing = store.scores.find((s) => s.batchId === body.batchId && s.beneficiaryId === body.beneficiaryId);
  if (existing) {
    existing.pre = body.pre;
    existing.post = body.post;
    return existing;
  }
  const row: TestScoreRow = { batchId: body.batchId, beneficiaryId: body.beneficiaryId, pre: body.pre, post: body.post };
  store.scores.push(row);
  return row;
}

export function listScores(store: ProgramsDemoData, batchId: string): TestScoreRow[] {
  return store.scores.filter((s) => s.batchId === batchId);
}

export function statsForBatch(store: ProgramsDemoData, batchId: string): BatchStats {
  const batch = getBatch(store, batchId);
  return batchStats({
    batch: { id: batch.id, sessions: batch.sessions },
    attendance: listAttendance(store, batchId),
    scores: listScores(store, batchId),
    certificates: store.certificates,
  });
}

export function issueCertificate(store: ProgramsDemoData, batchId: string, beneficiaryId: string): Certificate {
  const batch = getBatch(store, batchId);
  getBeneficiary(store, beneficiaryId);

  // Mirrors the DB trigger: attendance ≥ 60% of the batch's sessions and post ≥ 40.
  const marks = store.attendance.filter((a) => a.batchId === batchId && a.beneficiaryId === beneficiaryId);
  const present = marks.filter((a) => a.present).length;
  if (marks.length === 0 || present < Math.ceil(marks.length * 0.6) || present < Math.ceil(batch.sessions * 0.6)) {
    err(422, 'VALIDATION_ERROR', 'সার্টিফিকেটে ন্যূনতম ৬০% উপস্থিতি আবশ্যক / Certificate requires ≥ 60% attendance');
  }
  const score = store.scores.find((s) => s.batchId === batchId && s.beneficiaryId === beneficiaryId);
  if (!score || score.post < 40) {
    err(422, 'VALIDATION_ERROR', 'পোস্ট-টেস্টে ন্যূনতম ৪০ নম্বর আবশ্যক / Post-test score ≥ 40 required');
  }
  if (store.certificates.some((c) => c.batchId === batchId && c.beneficiaryId === beneficiaryId)) {
    err(409, 'CONFLICT', 'সার্টিফিকেট ইতিমধ্যে ইস্যু / Certificate already issued');
  }

  store.certificateSeq += 1;
  const cert: Certificate = {
    id: randomUUID(),
    orgId: store.orgId,
    certNo: nextCertificateNo(store.certificateSeq),
    batchId,
    beneficiaryId,
    issuedAt: new Date().toISOString(),
  };
  store.certificates.push(cert);
  return cert;
}

export function listCertificates(store: ProgramsDemoData, filter: { batchId?: string } = {}): Certificate[] {
  let rows = [...store.certificates];
  if (filter.batchId) rows = rows.filter((c) => c.batchId === filter.batchId);
  return rows;
}

/* ── 5) Budget monitoring ─────────────────────────────────────────── */

export function addExpense(store: ProgramsDemoData, body: ProjectExpenseBody, recordedBy: string): ExpenseRecord {
  getProject(store, body.projectId);
  const row: ExpenseRecord = {
    id: randomUUID(),
    orgId: store.orgId,
    projectId: body.projectId,
    expenseDate: body.expenseDate,
    budgetLine: body.budgetLine,
    amount: Number(body.amount).toFixed(2),
    voucherNo: body.voucherNo,
    description: body.description,
    recordedBy,
    createdAt: new Date().toISOString(),
  };
  store.expenses.push(row);
  return row;
}

export function listExpenses(store: ProgramsDemoData, filter: { projectId?: string; start?: string; end?: string } = {}): ExpenseRecord[] {
  let rows = [...store.expenses].sort((a, b) => a.expenseDate.localeCompare(b.expenseDate));
  if (filter.projectId) rows = rows.filter((e) => e.projectId === filter.projectId);
  if (filter.start) rows = rows.filter((e) => e.expenseDate >= filter.start!);
  if (filter.end) rows = rows.filter((e) => e.expenseDate <= filter.end!);
  return rows;
}

export interface ProjectBudgetStatus {
  monitor: BudgetMonitor;
  burn: BurnRateStatus;
  donorRow: DonorUtilizationRow | null;
}

export function projectBudgetStatus(store: ProgramsDemoData, projectId: string, asOf: string): ProjectBudgetStatus {
  const project = getProject(store, projectId);
  const expenses = listExpenses(store, { projectId });
  return {
    monitor: budgetMonitor(project, expenses),
    burn: burnRate(project, expenses, asOf),
    donorRow: donorUtilization(store.projects, store.expenses).find((d) => d.projectCodes.includes(project.code)) ?? null,
  };
}

export function donorUtilizationRows(store: ProgramsDemoData): DonorUtilizationRow[] {
  return donorUtilization(store.projects, store.expenses);
}

/** Org-wide budget alerts: every project line at/above 80%. */
export interface BudgetAlertRow {
  projectId: string;
  projectCode: string;
  projectNameBn: string;
  donor: string;
  lineItem: string;
  budgeted: string;
  spent: string;
  utilizationPct: number;
  alert: 'warning' | 'critical';
}

export function budgetAlerts(store: ProgramsDemoData): BudgetAlertRow[] {
  const rows: BudgetAlertRow[] = [];
  for (const p of store.projects) {
    const monitor = budgetMonitor(p, listExpenses(store, { projectId: p.id }));
    for (const line of monitor.lines) {
      if (line.alert === 'ok') continue;
      rows.push({
        projectId: p.id,
        projectCode: p.code,
        projectNameBn: p.nameBn,
        donor: p.donor,
        lineItem: line.lineItem,
        budgeted: line.budgeted,
        spent: line.spent,
        utilizationPct: line.utilizationPct,
        alert: line.alert,
      });
    }
  }
  return rows.sort((a, b) => b.utilizationPct - a.utilizationPct);
}

/* ── 6) Field monitoring visits ───────────────────────────────────── */

export function addVisit(store: ProgramsDemoData, body: FieldVisitBody): FieldVisit {
  getProject(store, body.projectId);
  const visit: FieldVisit = {
    id: randomUUID(),
    orgId: store.orgId,
    projectId: body.projectId,
    visitDate: body.visitDate,
    officerId: body.officerId,
    officerName: body.officerName,
    village: body.village,
    beneficiariesMet: body.beneficiariesMet,
    checklist: body.checklist,
    photos: body.photos,
    findings: body.findings,
    followUps: body.followUps,
    createdAt: new Date().toISOString(),
  };
  store.visits.push(visit);
  return visit;
}

export function listVisits(store: ProgramsDemoData, filter: { projectId?: string; officerId?: string; start?: string; end?: string } = {}): (FieldVisit & { scorePct: number; overdueFollowUps: number })[] {
  let rows = [...store.visits].sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  if (filter.projectId) rows = rows.filter((v) => v.projectId === filter.projectId);
  if (filter.officerId) rows = rows.filter((v) => v.officerId === filter.officerId);
  if (filter.start) rows = rows.filter((v) => v.visitDate >= filter.start!);
  if (filter.end) rows = rows.filter((v) => v.visitDate <= filter.end!);
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((v) => ({
    ...v,
    scorePct: visitScore(v.checklist),
    overdueFollowUps: overdueFollowUps(v, today).length,
  }));
}

export function getVisit(store: ProgramsDemoData, id: string): FieldVisit {
  const v = store.visits.find((x) => x.id === id);
  if (!v) err(404, 'NOT_FOUND', 'পরিদর্শন পাওয়া যায়নি / Visit not found');
  return v as FieldVisit;
}

/* ── 7) Donor reports ─────────────────────────────────────────────── */

export interface StoredDonorReport {
  id: string;
  orgId: string;
  projectId: string;
  periodStart: string;
  periodEnd: string;
  report: DonorReport;
  generatedBy: string;
  generatedAt: string;
}

export function generateDonorReport(store: ProgramsDemoData, projectId: string, periodStart: string, periodEnd: string, generatedBy: string): StoredDonorReport {
  const project = getProject(store, projectId);
  if (periodEnd < periodStart) {
    err(422, 'VALIDATION_ERROR', 'পর্বের তারিখ ভুল / Invalid reporting period');
  }
  const existing = store.donorReports.find((r) => r.projectId === projectId && r.periodStart === periodStart && r.periodEnd === periodEnd);
  if (existing) {
    err(409, 'CONFLICT', `এই প্রান্তিকের প্রতিবেদন আছে (${existing.id}) / Report already generated for this period`);
  }
  const report = buildDonorReport({
    project,
    logframe: store.logframe.filter((e) => e.projectId === projectId),
    indicatorValues: store.indicatorValues,
    expenses: listExpenses(store, { projectId }),
    servicesCount: store.services.filter((s) => s.projectId === projectId).length,
    activitiesDone: store.activities.filter((a) => a.projectId === projectId && a.status === 'done').length,
    beneficiariesEnrolled: store.enrollments.filter((e) => e.projectId === projectId).length,
    visits: store.visits,
    periodStart,
    periodEnd,
  });
  const stored: StoredDonorReport = {
    id: randomUUID(),
    orgId: store.orgId,
    projectId,
    periodStart,
    periodEnd,
    report,
    generatedBy,
    generatedAt: new Date().toISOString(),
  };
  store.donorReports.push(stored);
  return stored;
}

export function listDonorReports(store: ProgramsDemoData, filter: { projectId?: string } = {}): StoredDonorReport[] {
  let rows = [...store.donorReports].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  if (filter.projectId) rows = rows.filter((r) => r.projectId === filter.projectId);
  return rows;
}

export function getDonorReport(store: ProgramsDemoData, id: string): StoredDonorReport {
  const r = store.donorReports.find((x) => x.id === id);
  if (!r) err(404, 'NOT_FOUND', 'প্রতিবেদন পাওয়া যায়নি / Report not found');
  return r as StoredDonorReport;
}

/* ── 8) Sensitive case management ─────────────────────────────────── */

export interface Viewer {
  userId: string;
  userName: string;
  role: string;
}

export function createCase(store: ProgramsDemoData, body: CaseFileBody, viewer: Viewer): CaseFile {
  if (!canManageCases(viewer.role, null, viewer.userId)) {
    err(403, 'FORBIDDEN', 'শুধু কেস ওয়ার্কার কেস খুলতে পারেন / Only case workers open cases');
  }
  store.caseSeq += 1;
  const now = new Date().toISOString();
  const record: CaseFile = {
    id: randomUUID(),
    orgId: store.orgId,
    caseNo: nextCaseNo(store.caseSeq),
    type: body.type,
    severity: body.severity,
    status: 'open',
    beneficiaryId: body.beneficiaryId,
    beneficiaryName: body.beneficiaryName,
    restrictedDetails: body.restrictedDetails,
    consentGiven: body.consentGiven,
    openedAt: now.slice(0, 10),
    assignedWorkerId: body.assignedWorkerId,
    assignedWorkerName: body.assignedWorkerName,
    closedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  store.cases.push(record);
  logCaseAccess(store, record.id, viewer, 'create');
  return record;
}

function logCaseAccess(store: ProgramsDemoData, caseId: string, viewer: Viewer, action: CaseAccessLogRow['action']): void {
  store.caseAccessLog.push({
    id: randomUUID(),
    orgId: store.orgId,
    caseId,
    userId: viewer.userId,
    userName: viewer.userName,
    action,
    at: new Date().toISOString(),
  });
}

export function listCases(store: ProgramsDemoData, viewer: Viewer, filter: { status?: string; type?: string } = {}): (CaseFile | MaskedCase)[] {
  let rows = [...store.cases].sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  if (filter.status) rows = rows.filter((c) => c.status === filter.status);
  if (filter.type) rows = rows.filter((c) => c.type === filter.type);
  // Row-level clearance mirrors the RLS: case workers see everything, the
  // assigned worker sees their own cases, everyone else gets masked rows.
  for (const c of rows) logCaseAccess(store, c.id, viewer, 'view');
  return rows.map((c) => (canManageCases(viewer.role, c.assignedWorkerId, viewer.userId) ? c : maskCase(c)));
}

export interface CaseDetail {
  case: CaseFile | MaskedCase;
  restrictedUnlocked: boolean;
}

export function getCaseDetail(store: ProgramsDemoData, id: string, viewer: Viewer): CaseDetail {
  const record = store.cases.find((c) => c.id === id);
  if (!record) err(404, 'NOT_FOUND', 'কেস পাওয়া যায়নি / Case not found');
  const cleared = canManageCases(viewer.role, record.assignedWorkerId, viewer.userId);
  logCaseAccess(store, id, viewer, cleared ? 'view_restricted' : 'view');
  return { case: cleared ? record : maskCase(record), restrictedUnlocked: cleared };
}

export function decideCase(store: ProgramsDemoData, id: string, to: CaseStatus, viewer: Viewer): CaseFile {
  const record = store.cases.find((c) => c.id === id);
  if (!record) err(404, 'NOT_FOUND', 'কেস পাওয়া যায়নি / Case not found');
  if (!canManageCases(viewer.role, record.assignedWorkerId, viewer.userId)) {
    err(403, 'FORBIDDEN', 'শুধু কেস ওয়ার্কার কেস পরিবর্তন করতে পারেন / Only case workers update cases');
  }
  if (!canTransitionCase(record.status, to)) {
    err(409, 'CONFLICT', `অবৈধ কেস অবস্থান্তর ${record.status} → ${to} / Invalid case transition`);
  }
  record.status = to;
  if (to === 'closed') record.closedAt = new Date().toISOString();
  record.updatedAt = new Date().toISOString();
  logCaseAccess(store, id, viewer, to === 'closed' ? 'close' : 'update');
  return record;
}

export function caseAccessLog(store: ProgramsDemoData, id: string, viewer: Viewer): CaseAccessLogRow[] {
  const record = store.cases.find((c) => c.id === id);
  if (!record) err(404, 'NOT_FOUND', 'কেস পাওয়া যায়নি / Case not found');
  if (!canManageCases(viewer.role, record.assignedWorkerId, viewer.userId)) {
    err(403, 'FORBIDDEN', 'অ্যাক্সেস লগ শুধু কেস ওয়ার্কার দেখেন / Access log is case-worker only');
  }
  return store.caseAccessLog.filter((l) => l.caseId === id).sort((a, b) => b.at.localeCompare(a.at));
}

/** Case stats for dashboards — counts only, no identity, no details. */
export function caseStats(store: ProgramsDemoData): { total: number; open: number; inProgress: number; referred: number; closed: number; byType: Record<string, number> } {
  const byType: Record<string, number> = {};
  for (const c of store.cases) byType[c.type] = (byType[c.type] ?? 0) + 1;
  return {
    total: store.cases.length,
    open: store.cases.filter((c) => c.status === 'open').length,
    inProgress: store.cases.filter((c) => c.status === 'in_progress').length,
    referred: store.cases.filter((c) => c.status === 'referred').length,
    closed: store.cases.filter((c) => c.status === 'closed').length,
    byType,
  };
}

/** Case transitions helper for route validation. */
export const CASE_TRANSITIONS: Record<Exclude<CaseStatus, 'closed'>, CaseStatus[]> = {
  open: CASE_FLOW.open,
  in_progress: CASE_FLOW.in_progress,
  referred: CASE_FLOW.referred,
};

/* ── 9) Grants & borrowing tracker ────────────────────────────────── */

export function addFundingSource(store: ProgramsDemoData, body: FundingSourceBody): FundingSource & { schedule: RepaymentInstallment[]; summary: RepaymentSummary } {
  if (body.repaymentStart < body.disbursementDate) {
    err(422, 'VALIDATION_ERROR', 'পরিশোধ শুরু চেক ইস্যুর পরে হতে হবে / Repayment must start after disbursement');
  }
  store.fundingSeq += 1;
  const source: FundingSource = {
    id: randomUUID(),
    orgId: store.orgId,
    code: nextFundingCode(store.fundingSeq),
    sourceName: body.sourceName,
    kind: body.kind,
    principal: Number(body.principal).toFixed(2),
    interestRatePct: Number(body.interestRatePct).toFixed(2),
    tenureMonths: body.tenureMonths,
    disbursementDate: body.disbursementDate,
    repaymentStart: body.repaymentStart,
    purposeProjectId: body.purposeProjectId,
    lenderContact: body.lenderContact,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  if (body.purposeProjectId) getProject(store, body.purposeProjectId);
  const method = body.kind === 'grant' || body.kind === 'internal_fund' ? 'flat' : 'declining';
  const schedule = repaymentSchedule({
    principal: source.principal,
    interestRatePct: source.interestRatePct,
    tenureMonths: source.tenureMonths,
    repaymentStart: source.repaymentStart,
    method,
  });
  store.fundingSources.push(source);
  return { ...source, schedule, summary: repaymentSummary(schedule) };
}

export function listFundingSources(store: ProgramsDemoData, filter: { kind?: string; status?: string } = {}): (FundingSource & { summary: RepaymentSummary })[] {
  let rows = [...store.fundingSources].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (filter.kind) rows = rows.filter((f) => f.kind === filter.kind);
  if (filter.status) rows = rows.filter((f) => f.status === filter.status);
  return rows.map((f) => ({
    ...f,
    summary: repaymentSummary(
      repaymentSchedule({
        principal: f.principal,
        interestRatePct: f.interestRatePct,
        tenureMonths: f.tenureMonths,
        repaymentStart: f.repaymentStart,
        method: f.kind === 'grant' || f.kind === 'internal_fund' ? 'flat' : 'declining',
      }),
    ),
  }));
}

export function getFundingSource(store: ProgramsDemoData, id: string): FundingSource & { schedule: RepaymentInstallment[]; summary: RepaymentSummary } {
  const f = store.fundingSources.find((x) => x.id === id);
  if (!f) err(404, 'NOT_FOUND', 'তহবিল উৎস পাওয়া যায়নি / Funding source not found');
  const method = f.kind === 'grant' || f.kind === 'internal_fund' ? 'flat' : 'declining';
  const schedule = repaymentSchedule({
    principal: f.principal,
    interestRatePct: f.interestRatePct,
    tenureMonths: f.tenureMonths,
    repaymentStart: f.repaymentStart,
    method,
  });
  return { ...(f as FundingSource), schedule, summary: repaymentSummary(schedule) };
}

export type { VisitChecklistRow };
