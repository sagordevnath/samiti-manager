/**
 * ── Programs & projects (NGO development sector) ─────────────────────────────
 * Project register (donor, grant agreement, budget by line item, restricted
 * fund code → Module 10), logframe with indicator progress and evidence,
 * beneficiary registry linked to members, service delivery, activity planner
 * and training batches with attendance, pre/post tests and certificates.
 *
 * Money is string numeric(14,2). All helpers are pure so the API, DB triggers
 * and the web UI share one implementation.
 */

import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';
import { toBanglaDigits } from './format.js';

/* ── Sectors ──────────────────────────────────────────────────────────────── */

export const PROGRAM_SECTORS = [
  'education',
  'health',
  'skills_training',
  'agriculture',
  'wash',
  'child_protection',
  'awareness',
] as const;
export type ProgramSector = (typeof PROGRAM_SECTORS)[number];

export const SECTOR_LABELS_BN: Record<ProgramSector, string> = {
  education: 'শিক্ষা',
  health: 'স্বাস্থ্য',
  skills_training: 'দক্ষতা উন্নয়ন',
  agriculture: 'কৃষি',
  wash: 'পানি ও স্যানিটেশন',
  child_protection: 'শিশু সুরক্ষা',
  awareness: 'সচেতনতা প্রচার',
};

/* ── 1) Project register ──────────────────────────────────────────────────── */

export type ProjectStatus = 'proposed' | 'active' | 'suspended' | 'closed';

export const PROJECT_FLOW: Record<ProjectStatus, ProjectStatus[]> = {
  proposed: ['active', 'closed'],
  active: ['suspended', 'closed'],
  suspended: ['active', 'closed'],
  closed: [],
};

export function canTransitionProject(from: ProjectStatus, to: ProjectStatus): boolean {
  return PROJECT_FLOW[from].includes(to);
}

export const PROJECT_STATUS_LABELS_BN: Record<ProjectStatus, string> = {
  proposed: 'প্রস্তাবিত',
  active: 'চলমান',
  suspended: 'স্থগিত',
  closed: 'বন্ধ',
};

export interface ProjectBudgetLine {
  lineItem: string;
  amount: string;
  note: string;
}

export interface ProjectRecord {
  id: string;
  orgId: string;
  code: string; // PRJ-2026-001
  nameBn: string;
  nameEn: string;
  donor: string;
  grantAgreementNo: string;
  /** Restricted fund code — journal lines tagged with it feed Module 10 fund statements. */
  fundCode: string;
  sector: ProgramSector;
  startDate: string;
  endDate: string;
  targetAreas: string[];
  targetBeneficiaries: number;
  managerName: string;
  budget: ProjectBudgetLine[];
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export const projectSchema = z.object({
  code: z.string().trim().min(2).max(30),
  nameBn: z.string().trim().min(2).max(200),
  nameEn: z.string().trim().min(2).max(200),
  donor: z.string().trim().min(2).max(160),
  grantAgreementNo: z.string().trim().min(2).max(60),
  fundCode: z.string().trim().min(2).max(30),
  sector: z.enum(PROGRAM_SECTORS),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetAreas: z.array(z.string().trim().min(1).max(120)).min(1).max(50),
  targetBeneficiaries: z.coerce.number().int().min(0),
  managerName: z.string().trim().min(2).max(120),
  budget: z
    .array(
      z.object({
        lineItem: z.string().trim().min(2).max(160),
        amount: moneySchema,
        note: z.string().trim().max(300).default(''),
      }),
    )
    .min(1)
    .max(100),
});
export type ProjectBody = z.infer<typeof projectSchema>;

export function projectTotalBudget(budget: ProjectBudgetLine[]): string {
  return budget.reduce((s, b) => s + Number(b.amount), 0).toFixed(2);
}

/** The lifecycle action names accepted by the decision endpoint. */
export const PROJECT_ACTIONS = ['activate', 'suspend', 'resume', 'close'] as const;
export type ProjectAction = (typeof PROJECT_ACTIONS)[number];

export const PROJECT_ACTION_TO_STATUS: Record<ProjectAction, ProjectStatus> = {
  activate: 'active',
  suspend: 'suspended',
  resume: 'active',
  close: 'closed',
};

/* ── 2) Logframe ──────────────────────────────────────────────────────────── */

export type LogframeLevel = 'goal' | 'objective' | 'output' | 'indicator';

export const LOGFRAME_LEVELS_BN: Record<LogframeLevel, string> = {
  goal: 'লক্ষ্য',
  objective: 'উদ্দেশ্য',
  output: 'আউটপুট',
  indicator: 'সূচক',
};

export interface LogframeEntry {
  id: string;
  orgId: string;
  projectId: string;
  level: LogframeLevel;
  statement: string;
  parentLabel: string | null;
  indicatorCode: string | null;
  baseline: string;
  targetValue: string;
  unit: string | null;
  meansOfVerification: string;
  createdAt: string;
}

export const logframeEntrySchema = z.object({
  level: z.enum(['goal', 'objective', 'output', 'indicator']),
  statement: z.string().trim().min(3).max(500),
  parentLabel: z.string().trim().max(60).nullable().default(null),
  indicatorCode: z.string().trim().max(30).nullable().default(null),
  baseline: z.string().trim().max(60).default('0'),
  targetValue: z.string().trim().max(60).default('0'),
  unit: z.string().trim().max(30).nullable().default(null),
  meansOfVerification: z.string().trim().min(2).max(300),
});
export type LogframeEntryBody = z.infer<typeof logframeEntrySchema>;

/** A periodic indicator measurement with uploaded evidence. */
export interface IndicatorValue {
  id: string;
  orgId: string;
  entryId: string;
  periodStart: string;
  periodEnd: string;
  value: string;
  evidence: { id: string; labelBn: string; path: string }[];
  note: string;
  enteredAt: string;
}

export const indicatorValueSchema = z.object({
  entryId: uuidSchema,
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  value: z.string().regex(/^\d+(\.\d{1,2})?$/),
  evidence: z
    .array(z.object({ id: z.string().trim().min(1), labelBn: z.string().trim().min(1).max(120), path: z.string().trim().min(1).max(300) }))
    .max(20)
    .default([]),
  note: z.string().trim().max(500).default(''),
});
export type IndicatorValueBody = z.infer<typeof indicatorValueSchema>;

export interface IndicatorProgressRow {
  entryId: string;
  indicatorCode: string | null;
  statement: string;
  baseline: string;
  target: string;
  unit: string | null;
  achieved: string;
  progressPct: number;
  evidenceCount: number;
}

/**
 * Progress per indicator-level entry: cumulative achieved = Σ measured values
 * against the logframe target. Non-indicator rows are listed without progress.
 */
export function indicatorProgress(entries: LogframeEntry[], values: IndicatorValue[]): IndicatorProgressRow[] {
  return entries.map((e) => {
    const rows = values.filter((v) => v.entryId === e.id);
    const achieved = rows.reduce((s, v) => s + Number(v.value), 0);
    const target = Number(e.targetValue) || 0;
    return {
      entryId: e.id,
      indicatorCode: e.indicatorCode,
      statement: e.statement,
      baseline: e.baseline,
      target: e.targetValue,
      unit: e.unit,
      achieved: achieved.toFixed(2),
      progressPct: target > 0 ? Number((Math.min(100, (achieved / target) * 100)).toFixed(1)) : 0,
      evidenceCount: rows.reduce((s, v) => s + v.evidence.length, 0),
    };
  });
}

/* ── 3) Beneficiary registry & service delivery ───────────────────────────── */

export const beneficiarySchema = z.object({
  memberId: uuidSchema.nullable().default(null),
  nameBn: z.string().trim().min(2).max(120),
  guardianBn: z.string().trim().max(120).default(''),
  phone: z.string().trim().max(20).default(''),
  age: z.coerce.number().int().min(0).max(120).default(0),
  gender: z.enum(['male', 'female', 'other']).default('female'),
  village: z.string().trim().max(120).default(''),
});
export type BeneficiaryBody = z.infer<typeof beneficiarySchema>;

export interface BeneficiaryRecord {
  id: string;
  orgId: string;
  code: string; // BEN-0001
  memberId: string | null;
  nameBn: string;
  guardianBn: string;
  phone: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  village: string;
  createdAt: string;
}

export function nextBeneficiaryCode(seq: number): string {
  return `BEN-${String(seq).padStart(4, '0')}`;
}

export const GENDER_LABELS_BN: Record<BeneficiaryRecord['gender'], string> = {
  male: 'পুরুষ',
  female: 'মহিলা',
  other: 'অন্যান্য',
};

export interface BeneficiaryEnrollment {
  id: string;
  orgId: string;
  beneficiaryId: string;
  projectId: string;
  enrolledAt: string;
  note: string;
}

export const enrollmentSchema = z.object({
  beneficiaryId: uuidSchema,
  projectId: uuidSchema,
  enrolledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().trim().max(300).default(''),
});
export type EnrollmentBody = z.infer<typeof enrollmentSchema>;

export const SERVICE_KINDS = ['training', 'health_camp', 'school_enrollment', 'kit_distribution', 'awareness_session'] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const SERVICE_LABELS_BN: Record<ServiceKind, string> = {
  training: 'প্রশিক্ষণ',
  health_camp: 'স্বাস্থ্য ক্যাম্প',
  school_enrollment: 'স্কুল ভর্তি',
  kit_distribution: 'কিট বিতরণ',
  awareness_session: 'সচেতনতা সেশন',
};

export interface ServiceRecord {
  id: string;
  orgId: string;
  projectId: string;
  beneficiaryId: string;
  kind: ServiceKind;
  serviceDate: string;
  details: string;
  createdAt: string;
}

export const serviceRecordSchema = z.object({
  projectId: uuidSchema,
  beneficiaryId: uuidSchema,
  kind: z.enum(SERVICE_KINDS),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  details: z.string().trim().max(300).default(''),
});
export type ServiceRecordBody = z.infer<typeof serviceRecordSchema>;

/* ── 4) Activity planner & training batches ───────────────────────────────── */

export type ActivityStatus = 'planned' | 'done' | 'cancelled';

export const ACTIVITY_FLOW: Record<ActivityStatus, ActivityStatus[]> = {
  planned: ['done', 'cancelled'],
  done: [],
  cancelled: [],
};

export function canTransitionActivity(from: ActivityStatus, to: ActivityStatus): boolean {
  return ACTIVITY_FLOW[from].includes(to);
}

export const ACTIVITY_STATUS_LABELS_BN: Record<ActivityStatus, string> = {
  planned: 'পরিকল্পিত',
  done: 'সম্পন্ন',
  cancelled: 'বাতিল',
};

export interface ActivityRecord {
  id: string;
  orgId: string;
  projectId: string;
  titleBn: string;
  kind: ServiceKind;
  plannedDate: string;
  venue: string;
  targetParticipants: number;
  status: ActivityStatus;
  note: string;
  createdAt: string;
}

export const activitySchema = z.object({
  projectId: uuidSchema,
  titleBn: z.string().trim().min(2).max(200),
  kind: z.enum(SERVICE_KINDS).default('training'),
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  venue: z.string().trim().max(160).default(''),
  targetParticipants: z.coerce.number().int().min(0).default(0),
  note: z.string().trim().max(500).default(''),
});
export type ActivityBody = z.infer<typeof activitySchema>;

/** Calendar slice: activities with plannedDate inside [start, end]. */
export function activitiesInRange(activities: ActivityRecord[], start: string, end: string): ActivityRecord[] {
  return activities.filter((a) => a.plannedDate >= start && a.plannedDate <= end).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
}

export interface TrainingBatch {
  id: string;
  orgId: string;
  projectId: string;
  code: string; // TRN-2026-001
  titleBn: string;
  trainerName: string;
  trainerOrgBn: string;
  startDate: string;
  endDate: string;
  hours: number;
  sessions: number;
  createdAt: string;
}

export const trainingBatchSchema = z.object({
  projectId: uuidSchema,
  titleBn: z.string().trim().min(2).max(200),
  trainerName: z.string().trim().min(2).max(120),
  trainerOrgBn: z.string().trim().max(160).default(''),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: z.coerce.number().int().min(1).max(400).default(6),
  sessions: z.coerce.number().int().min(1).max(60).default(1),
});
export type TrainingBatchBody = z.infer<typeof trainingBatchSchema>;

export function nextBatchCode(seq: number): string {
  return `TRN-${new Date().getUTCFullYear()}-${String(seq).padStart(3, '0')}`;
}

export interface AttendanceRow {
  batchId: string;
  beneficiaryId: string;
  sessionNo: number;
  present: boolean;
}

export const trainingAttendanceSchema = z.object({
  batchId: uuidSchema,
  beneficiaryId: uuidSchema,
  sessionNo: z.coerce.number().int().min(1).max(60),
  present: z.boolean(),
});
export type TrainingAttendanceBody = z.infer<typeof trainingAttendanceSchema>;

export interface TestScoreRow {
  batchId: string;
  beneficiaryId: string;
  pre: number;
  post: number;
}

export const testScoreSchema = z.object({
  batchId: uuidSchema,
  beneficiaryId: uuidSchema,
  pre: z.coerce.number().min(0).max(100),
  post: z.coerce.number().min(0).max(100),
});
export type TestScoreBody = z.infer<typeof testScoreSchema>;

export interface BatchStats {
  attendees: number;
  avgAttendancePct: number;
  avgPre: number;
  avgPost: number;
  avgGainPct: number;
  certificates: number;
}

/**
 * Batch aggregate: average attendance (present marks ÷ possible marks),
 * average pre/post scores and the relative knowledge gain.
 */
export function batchStats(input: {
  batch: Pick<TrainingBatch, 'id' | 'sessions'>;
  attendance: AttendanceRow[];
  scores: TestScoreRow[];
  certificates: { batchId: string }[];
}): BatchStats {
  const { batch, attendance, scores, certificates } = input;
  const byBen = new Map<string, { present: number; marks: number }>();
  for (const a of attendance) {
    const row = byBen.get(a.beneficiaryId) ?? { present: 0, marks: 0 };
    row.marks += 1;
    if (a.present) row.present += 1;
    byBen.set(a.beneficiaryId, row);
  }
  const attendees = byBen.size;
  const possible = attendees * Math.max(1, batch.sessions);
  const presentTotal = [...byBen.values()].reduce((s, r) => s + r.present, 0);
  const avgPre = scores.length ? scores.reduce((s, r) => s + r.pre, 0) / scores.length : 0;
  const avgPost = scores.length ? scores.reduce((s, r) => s + r.post, 0) / scores.length : 0;
  const avgGainPct = avgPre > 0 ? ((avgPost - avgPre) / avgPre) * 100 : 0;
  return {
    attendees,
    avgAttendancePct: possible > 0 ? Number(((presentTotal / possible) * 100).toFixed(1)) : 0,
    avgPre: Number(avgPre.toFixed(1)),
    avgPost: Number(avgPost.toFixed(1)),
    avgGainPct: Number(avgGainPct.toFixed(1)),
    certificates: certificates.filter((c) => c.batchId === batch.id).length,
  };
}

export interface Certificate {
  id: string;
  orgId: string;
  certNo: string; // CERT-2026-0001
  batchId: string;
  beneficiaryId: string;
  issuedAt: string;
}

export function nextCertificateNo(seq: number): string {
  return `CERT-${new Date().getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
}

/** Bilingual certificate body used by the PDF print page. */
export function buildCertificateTextBn(input: {
  orgNameBn: string;
  orgNameEn: string;
  beneficiaryName: string;
  beneficiaryCode: string;
  batchTitle: string;
  project: string;
  trainerName: string;
  hours: number;
  startDate: string;
  endDate: string;
  certNo: string;
  issuedAt: string;
}): string {
  return [
    input.orgNameBn,
    `${input.orgNameEn}`,
    '',
    'প্রশিক্ষণ সম্পন্নের সার্টিফিকেট',
    `সার্টিফিকেট নং: ${input.certNo}`,
    '',
    `এই মাধ্যমে প্রত্যয়ন করা হচ্ছে যে, ${input.beneficiaryName} (${input.beneficiaryCode})`,
    `"${input.batchTitle}" শীর্ষক ${toBanglaDigits(String(input.hours))} ঘণ্টার প্রশিক্ষণ সফলতার সাথে সম্পন্ন করেছেন।`,
    `প্রকল্প: ${input.project}`,
    `প্রশিক্ষক: ${input.trainerName}`,
    `মেয়াদ: ${input.startDate} থেকে ${input.endDate}`,
    '',
    `ইস্যুর তারিখ: ${input.issuedAt}`,
  ].join('\n');
}
