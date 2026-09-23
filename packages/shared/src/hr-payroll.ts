/**
 * ── HR Payroll, Provident Fund, Performance & Discipline (req 5–9) ───────────
 * 5) Salary structure (basic, house rent, medical, conveyance, field
 *    allowance), deductions (PF, tax, loan advance), monthly payroll run with
 *    preview → approval → payslips → bank sheet, festival bonus rules.
 * 6) Provident-fund and gratuity ledger with employee+employer contributions.
 * 7) Monthly KPI scorecard per field officer and yearly appraisal.
 * 8) Disciplinary case log + warning letters (HR/Director access only).
 * 9) Self-service read models (payslips, leave balance, documents).
 *
 * Money is transmitted as string; numeric(14,2) in DB. All engines are pure
 * so the API (authoritative), the DB triggers (defense in depth) and the web
 * UI (live preview) share one implementation.
 */
import { z } from 'zod';
import { moneySchema, uuidSchema } from './schemas.js';

/* ── 5) Salary structure ─────────────────────────────────────────────────── */

export const SALARY_COMPONENT_KEYS = [
  'basic',
  'house_rent',
  'medical',
  'conveyance',
  'field_allowance',
] as const;
export type SalaryComponentKey = (typeof SALARY_COMPONENT_KEYS)[number];

export const COMPONENT_LABELS_BN: Record<SalaryComponentKey, string> = {
  basic: 'মূল বেতন',
  house_rent: 'বাড়ি ভাড়া',
  medical: 'চিকিৎসা',
  conveyance: 'যাতায়াত',
  field_allowance: 'ফিল্ড ভাতা',
};

export const SALARY_STRUCTURE_FIELDS = [
  'basic',
  'house_rent',
  'medical',
  'conveyance',
  'field_allowance',
] as const;

export interface SalaryStructure {
  id: string;
  orgId: string;
  /** Grade this structure applies to (G1–G6); unique per org+grade. */
  grade: string;
  basic: string;
  houseRent: string;
  medical: string;
  conveyance: string;
  fieldAllowance: string;
  /** 0–15, e.g. '0.05' = 5% employee contribution. */
  pfEmployeeRate: string;
  pfEmployerRate: string;
  createdAt: string;
  updatedAt: string;
}

const pctSchema = z
  .string()
  .regex(/^0(\.\d{1,4})?$|^1(\.0{1,4})?$/, 'হার ০ থেকে ১ এর মধ্যে / Rate must be between 0 and 1');

export const salaryStructureSchema = z.object({
  grade: z.string().trim().min(2).max(8),
  basic: moneySchema,
  houseRent: moneySchema,
  medical: moneySchema,
  conveyance: moneySchema,
  fieldAllowance: moneySchema,
  pfEmployeeRate: pctSchema.default('0.05'),
  pfEmployerRate: pctSchema.default('0.05'),
});
export type SalaryStructureInput = z.infer<typeof salaryStructureSchema>;

/** Gross from a structure. */
export function grossOf(s: Pick<SalaryStructure, 'basic' | 'houseRent' | 'medical' | 'conveyance' | 'fieldAllowance'>): number {
  return (
    Number(s.basic) + Number(s.houseRent) + Number(s.medical) + Number(s.conveyance) + Number(s.fieldAllowance)
  );
}

export const DEDUCTION_KEYS = ['pf_employee', 'tax', 'loan_advance', 'other'] as const;
export type DeductionKey = (typeof DEDUCTION_KEYS)[number];

/* ── 5) Payroll run ──────────────────────────────────────────────────────── */

export const PAYROLL_STATUSES = ['draft', 'approved', 'paid'] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

export const PAYROLL_STATUS_LABELS_BN: Record<PayrollStatus, string> = {
  draft: 'খসড়া',
  approved: 'অনুমোদিত',
  paid: 'পরিশোধিত',
};

export interface PayrollLine {
  id: string;
  payrollId: string;
  staffId: string;
  staffCode: string;
  staffName: string;
  branchId: string | null;
  components: Record<SalaryComponentKey, string>;
  gross: string;
  deductions: Partial<Record<DeductionKey, string>>;
  totalDeduction: string;
  net: string;
  workingDays: number;
  presentDays: number;
  /** Present/working ratio that prorated the salary (1 for full month). */
  attendanceRatio: string;
}

export interface PayrollRun {
  id: string;
  orgId: string;
  /** Month this run pays: YYYY-MM. One run per org+month. */
  period: string;
  status: PayrollStatus;
  lines: PayrollLine[];
  totalGross: string;
  totalDeduction: string;
  totalNet: string;
  /** Bonus lines included (Eid): staffId → amount, for the bank sheet. */
  bonusTotal: string;
  preparedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export const payrollRunSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, 'ফরম্যাট YYYY-MM / Format YYYY-MM'),
});
export type PayrollRunInput = z.infer<typeof payrollRunSchema>;

/** Simple progressive tax slab (monthly, BDT) — editable per org in real deploy. */
export const TAX_SLABS_MONTHLY: ReadonlyArray<{ upTo: number; rate: number }> = [
  { upTo: 25000, rate: 0 },
  { upTo: 40000, rate: 0.05 },
  { upTo: 60000, rate: 0.1 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.15 },
];

/** Monthly tax on taxable income (gross minus employee PF). */
export function monthlyTax(taxable: number): number {
  let remaining = Math.max(0, Math.round(taxable));
  let tax = 0;
  let previousCap = 0;
  for (const slab of TAX_SLABS_MONTHLY) {
    const span = Math.min(remaining, slab.upTo - previousCap);
    if (span <= 0) break;
    tax += span * slab.rate;
    remaining -= span;
    previousCap = slab.upTo;
  }
  return Math.round(tax * 100) / 100;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const s2 = (n: number) => r2(n).toFixed(2);

/**
 * Compute one payroll line from a salary structure and attendance.
 * Unpaid absence prorates: every component scales by attendanceRatio.
 * Deductions: employee PF (rate × prorated basic), progressive tax on
 * (gross − employee PF), optional loan advance.
 */
export function computePayrollLine(input: {
  staffId: string;
  staffCode: string;
  staffName: string;
  branchId: string | null;
  structure: Pick<SalaryStructure, 'basic' | 'houseRent' | 'medical' | 'conveyance' | 'fieldAllowance' | 'pfEmployeeRate'>;
  workingDays: number;
  paidLeaveDays?: number;
  presentDays: number;
  loanAdvance?: number;
}): PayrollLine {
  const paidLeave = input.paidLeaveDays ?? 0;
  const paidDays = Math.min(input.workingDays, input.presentDays + paidLeave);
  const ratio = input.workingDays > 0 ? Math.min(1, Math.max(0, paidDays / input.workingDays)) : 0;

  const c = {
    basic: s2(Number(input.structure.basic) * ratio),
    house_rent: s2(Number(input.structure.houseRent) * ratio),
    medical: s2(Number(input.structure.medical) * ratio),
    conveyance: s2(Number(input.structure.conveyance) * ratio),
    field_allowance: s2(Number(input.structure.fieldAllowance) * ratio),
  };
  const gross = r2(Object.values(c).reduce((a: number, b: string) => a + Number(b), 0));
  const pf = s2(r2(Number(input.structure.pfEmployeeRate) * Number(c.basic)));
  const tax = s2(monthlyTax(gross - Number(pf)));
  const advance = s2(Math.max(0, input.loanAdvance ?? 0));
  const other = '0.00';
  const totalDeduction = r2(Number(pf) + Number(tax) + Number(advance) + Number(other));

  return {
    id: '',
    payrollId: '',
    staffId: input.staffId,
    staffCode: input.staffCode,
    staffName: input.staffName,
    branchId: input.branchId,
    components: c,
    gross: s2(gross),
    deductions: { pf_employee: pf, tax, loan_advance: advance, other },
    totalDeduction: s2(totalDeduction),
    net: s2(gross - totalDeduction),
    workingDays: input.workingDays,
    presentDays: input.presentDays,
    attendanceRatio: ratio.toFixed(2),
  };
}

/** Festival bonus: one basic for each of the two Eids; only confirmed staff. */
export type FestivalBonus = 'eid_ul_fitr' | 'eid_ul_adha';

export function bonusRuleEligible(staffStatus: string): boolean {
  return staffStatus === 'confirmed';
}

/** Bonus amount = one month basic (or prorated if joined under 6 months ago). */
export function festivalBonusFor(staff: { status: string; joiningDate: string; basic: string }, onDate: string): number {
  if (!bonusRuleEligible(staff.status)) return 0;
  const joined = new Date(`${staff.joiningDate}T00:00:00Z`).getTime();
  const ref = new Date(`${onDate}T00:00:00Z`).getTime();
  const months = (ref - joined) / (1000 * 60 * 60 * 24 * 30.44);
  if (months >= 6) return Number(staff.basic);
  return r2(Number(staff.basic) * Math.max(0, months / 6));
}

/* ── 5) Payslip + bank sheet ─────────────────────────────────────────────── */

export function payslipText(line: PayrollLine, period: string, orgName: string): string {
  const bn = (k: SalaryComponentKey) => `${COMPONENT_LABELS_BN[k]}: ${line.components[k]}`;
  const d = line.deductions;
  return [
    `বেতন স্লিপ / Payslip — ${period}`,
    `${orgName}`,
    `কর্মচারী: ${line.staffName} (${line.staffCode})`,
    '',
    '— আয় / Earnings —',
    ...SALARY_COMPONENT_KEYS.map(bn),
    `মোট / Gross: ${line.gross}`,
    '',
    '— কর্তন / Deductions —',
    `প্রভিডেন্ট ফান্ড: ${d.pf_employee ?? '0.00'}`,
    `আয়কর: ${d.tax ?? '0.00'}`,
    `ঋণ অগ্রিম: ${d.loan_advance ?? '0.00'}`,
    `মোট কর্তন / Total: ${line.totalDeduction}`,
    '',
    `নিট বেতন / Net Pay: ${line.net}`,
    '— Samity Manager',
  ].join('\n');
}

export interface BankSheetRow {
  staffCode: string;
  staffName: string;
  bankName: string | null;
  accountMasked: string | null;
  net: string;
}

/** Bank transfer sheet: one row per staff with a bank account. */
export function bankSheet(lines: PayrollLine[], accounts: Map<string, { bankName: string | null; bankMasked: string | null }>): BankSheetRow[] {
  return lines.map((l) => {
    const acc = accounts.get(l.staffId);
    return {
      staffCode: l.staffCode,
      staffName: l.staffName,
      bankName: acc?.bankName ?? null,
      accountMasked: acc?.bankMasked ?? null,
      net: l.net,
    };
  });
}

/* ── 6) PF & gratuity ────────────────────────────────────────────────────── */

export const PF_TXN_TYPES = ['contribution', 'interest', 'withdrawal', 'transfer_out'] as const;
export type PfTxnType = (typeof PF_TXN_TYPES)[number];

export const PF_LABELS_BN: Record<PfTxnType, string> = {
  contribution: 'চাঁদা',
  interest: 'সুদ',
  withdrawal: 'উত্তোলন',
  transfer_out: 'হস্তান্তর',
};

export interface PfLedgerEntry {
  id: string;
  orgId: string;
  staffId: string;
  /** Which calendar month the contribution is for. */
  period: string | null;
  type: PfTxnType;
  /** Employee portion. */
  employeeAmount: string;
  /** Employer portion (contributions only). */
  employerAmount: string;
  /** Running balance after this entry (employee + employer + interest). */
  balanceAfter: string;
  note: string | null;
  createdAt: string;
}

export const pfAdjustmentSchema = z.object({
  staffId: uuidSchema,
  type: z.enum(PF_TXN_TYPES),
  period: z.string().regex(/^\d{4}-\d{2}$/).nullish(),
  employeeAmount: moneySchema.default('0.00'),
  employerAmount: moneySchema.default('0.00'),
  note: z.string().trim().max(300).nullish(),
});
export type PfAdjustmentInput = z.infer<typeof pfAdjustmentSchema>;

/** Gratuity: 15 days' last basic per completed year of service. */
export function gratuityFor(joiningDate: string, leavingDate: string, lastBasic: string): number {
  const start = new Date(`${joiningDate}T00:00:00Z`).getTime();
  const end = new Date(`${leavingDate}T00:00:00Z`).getTime();
  if (end < start) return 0;
  const years = Math.floor((end - start) / (1000 * 60 * 60 * 24 * 365.25));
  if (years < 1) return 0;
  return r2((Number(lastBasic) * 15 / 30) * years);
}

/* ── 7) Performance ──────────────────────────────────────────────────────── */

export const KPI_KEYS = ['collection_rate', 'par', 'new_members', 'meeting_attendance'] as const;
export type KpiKey = (typeof KPI_KEYS)[number];

export const KPI_LABELS_BN: Record<KpiKey, string> = {
  collection_rate: 'আদায়ের হার',
  par: 'ঝুঁকিপূর্ণ ঋণ',
  new_members: 'নতুন সদস্য',
  meeting_attendance: 'সভায় উপস্থিতি',
};

/** Per-KPI monthly targets; actuals are scored against these. */
export interface KpiTargets {
  collection_rate: number; // 0–1 target (e.g. 0.98)
  par: number; // max allowed PAR30 ratio (e.g. 0.05)
  new_members: number; // per month
  meeting_attendance: number; // 0–1
}

export const DEFAULT_KPI_TARGETS: KpiTargets = {
  collection_rate: 0.98,
  par: 0.05,
  new_members: 8,
  meeting_attendance: 0.9,
};

export interface KpiScorecard {
  id: string;
  orgId: string;
  staffId: string;
  staffName: string;
  /** Month: YYYY-MM. */
  period: string;
  /** Raw measured values. */
  actuals: Record<KpiKey, number>;
  /** 0–100 per KPI, capped; PAR is inverse (lower is better). */
  scores: Record<KpiKey, number>;
  /** Mean of the four scores. */
  totalScore: number;
  grade: 'A' | 'B' | 'C' | 'D';
  createdAt: string;
}

export const kpiActualsSchema = z.object({
  collection_rate: z.number().min(0).max(1.5),
  par: z.number().min(0).max(1),
  new_members: z.number().int().min(0).max(500),
  meeting_attendance: z.number().min(0).max(1),
});
export type KpiActuals = z.infer<typeof kpiActualsSchema>;

const clamp100 = (n: number) => Math.max(0, Math.min(100, Math.round(n * 100) / 100));

/** Score one KPI 0–100. PAR scores inversely (0 PAR = 100). */
export function scoreKpi(key: KpiKey, actual: number, target: number): number {
  switch (key) {
    case 'collection_rate':
    case 'meeting_attendance':
      return clamp100((actual / target) * 100);
    case 'par':
      return clamp100(target > 0 ? ((target - actual) / target) * 100 : 0);
    case 'new_members':
      return clamp100(target > 0 ? (actual / target) * 100 : 0);
  }
}

export function kpiGrade(total: number): KpiScorecard['grade'] {
  if (total >= 85) return 'A';
  if (total >= 70) return 'B';
  if (total >= 55) return 'C';
  return 'D';
}

/** Appraisal form + yearly rating. */
export const APPRAISAL_CRITERIA = [
  'job_knowledge',
  'discipline',
  'teamwork',
  'client_service',
  'target_achievement',
] as const;
export type AppraisalCriterion = (typeof APPRAISAL_CRITERIA)[number];

export const APPRAISAL_LABELS_BN: Record<AppraisalCriterion, string> = {
  job_knowledge: 'কাজের জ্ঞান',
  discipline: 'শৃঙ্খলা',
  teamwork: 'দলগত কাজ',
  client_service: 'গ্রাহক সেবা',
  target_achievement: 'টার্গেট অর্জন',
};

export const APPRAISAL_STATUSES = ['draft', 'submitted', 'reviewed'] as const;
export type AppraisalStatus = (typeof APPRAISAL_STATUSES)[number];

export interface StaffAppraisal {
  id: string;
  orgId: string;
  staffId: string;
  staffName: string;
  /** Year: YYYY. */
  year: string;
  /** 1–10 per criterion. */
  scores: Record<AppraisalCriterion, number>;
  comments: string;
  /** Weighted mean ×10 → 0–100. */
  rating: number;
  status: AppraisalStatus;
  reviewerId: string | null;
  reviewerNote: string | null;
  createdAt: string;
}

export const appraisalSchema = z.object({
  staffId: uuidSchema,
  year: z.string().regex(/^\d{4}$/),
  scores: z.object({
    job_knowledge: z.number().int().min(1).max(10),
    discipline: z.number().int().min(1).max(10),
    teamwork: z.number().int().min(1).max(10),
    client_service: z.number().int().min(1).max(10),
    target_achievement: z.number().int().min(1).max(10),
  }),
  comments: z.string().trim().max(1000).default(''),
});
export type AppraisalInput = z.infer<typeof appraisalSchema>;

export function appraisalRating(scores: Record<AppraisalCriterion, number>): number {
  const mean = APPRAISAL_CRITERIA.reduce((a, k) => a + scores[k], 0) / APPRAISAL_CRITERIA.length;
  return clamp100(mean * 10);
}

/* ── 8) Disciplinary ─────────────────────────────────────────────────────── */

export const DISCIPLINE_SEVERITIES = ['verbal_warning', 'written_warning', 'show_cause', 'suspension', 'termination'] as const;
export type DisciplineSeverity = (typeof DISCIPLINE_SEVERITIES)[number];

export const DISCIPLINE_LABELS_BN: Record<DisciplineSeverity, string> = {
  verbal_warning: 'মৌখিক সতর্কতা',
  written_warning: 'লিখিত সতর্কতা',
  show_cause: 'কারণ দর্শানো',
  suspension: 'সাময়িক বরখাস্ত',
  termination: 'চাকরি থেকে অপসারণ',
};

export const DISCIPLINE_CASE_STATUSES = ['open', 'explained', 'closed'] as const;
export type DisciplineCaseStatus = (typeof DISCIPLINE_CASE_STATUSES)[number];

export interface DisciplineCase {
  id: string;
  orgId: string;
  staffId: string;
  staffName: string;
  severity: DisciplineSeverity;
  incidentDate: string;
  description: string;
  status: DisciplineCaseStatus;
  /** Staff's written explanation when status = explained/closed. */
  explanation: string | null;
  outcome: string | null;
  raisedBy: string;
  closedBy: string | null;
  closedAt: string | null;
  createdAt: string;
}

export const disciplineCaseSchema = z.object({
  staffId: uuidSchema,
  severity: z.enum(DISCIPLINE_SEVERITIES),
  incidentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(5).max(2000),
});
export type DisciplineCaseInput = z.infer<typeof disciplineCaseSchema>;

export const disciplineCloseSchema = z.object({
  explanation: z.string().trim().max(2000).nullish(),
  outcome: z.string().trim().min(3).max(2000),
});
export type DisciplineCloseInput = z.infer<typeof disciplineCloseSchema>;

/** Warning letter (Bangla + English). */
export function renderWarningLetterBn(c: DisciplineCase, orgName: string): string {
  return [
    'সতর্কতা পত্র',
    `${orgName}`,
    `বিষয়: ${DISCIPLINE_LABELS_BN[c.severity]}`,
    `তারিখ: ${c.incidentDate}`,
    '',
    `জনাব ${c.staffName},`,
    `আপনার বিরুদ্ধে নিম্নোক্ত অভিযোগ প্রমাণিত হয়েছে: ${c.description}`,
    c.status === 'open'
      ? 'আপনাকে আগামী ৭ দিনের মধ্যে লিখিত ব্যাখ্যা দিতে বলা হচ্ছে।'
      : `ব্যাখ্যা গ্রহণ করা হয়েছে। সিদ্ধান্ত: ${c.outcome ?? '—'}`,
    '',
    '— ব্যবস্থাপনা, Samity Manager',
  ].join('\n');
}

export function renderWarningLetterEn(c: DisciplineCase, orgName: string): string {
  return [
    'WARNING LETTER',
    orgName,
    `Subject: ${c.severity.replaceAll('_', ' ')}`,
    `Date: ${c.incidentDate}`,
    '',
    `Dear ${c.staffName},`,
    `The following allegation has been substantiated: ${c.description}`,
    c.status === 'open'
      ? 'You are asked to provide a written explanation within 7 days.'
      : `Your explanation has been recorded. Outcome: ${c.outcome ?? '—'}`,
    '',
    '— Management, Samity Manager',
  ].join('\n');
}

/* ── 9) Self-service read model ──────────────────────────────────────────── */

export interface SelfServiceSummary {
  staffCode: string;
  staffName: string;
  designation: string;
  status: string;
  payslips: Array<{ period: string; gross: string; totalDeduction: string; net: string; status: PayrollStatus }>;
  leaveBalance: Record<string, { entitlement: number; taken: number; remaining: number }>;
  pfBalance: string;
  documents: string[];
}
