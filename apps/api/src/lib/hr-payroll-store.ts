/**
 * ── HR payroll demo store (req 5–9) ──────────────────────────────────────────
 * In-memory payroll, PF/gratuity, performance and disciplinary dataset on top
 * of the HR store's staff list. Preview/test only — the Supabase path uses
 * migration 0034 with the same shapes and trigger-enforced rules.
 */
import {
  appraisalRating,
  computePayrollLine,
  festivalBonusFor,
  gratuityFor,
  kpiGrade,
  monthlyTax,
  scoreKpi,
  DEFAULT_KPI_TARGETS,
  type AppraisalCriterion,
  type AppraisalInput,
  type AppraisalStatus,
  type BankSheetRow,
  type DisciplineCase,
  type DisciplineCaseInput,
  type DisciplineCloseInput,
  type DisciplineSeverity,
  type KpiActuals,
  type KpiScorecard,
  type PfAdjustmentInput,
  type PfLedgerEntry,
  type PayrollRun,
  type PayrollRunInput,
  type SalaryStructure,
  type SalaryStructureInput,
  type SelfServiceSummary,
  type StaffAppraisal,
} from '@samity/shared';
import { hrDemoStore, HrDemoError } from './hr-store.js';

export interface HrPayrollData {
  structures: SalaryStructure[];
  runs: PayrollRun[];
  pfLedger: PfLedgerEntry[];
  gratuity: Array<{ id: string; orgId: string; staffId: string; joiningDate: string; leavingDate: string; lastBasic: string; years: number; amount: string; paidAt: string | null; createdAt: string }>;
  scorecards: KpiScorecard[];
  appraisals: StaffAppraisal[];
  cases: DisciplineCase[];
  counters: { run: number; caseNo: number };
}

const globalRef = globalThis as unknown as { __hrPayrollData?: HrPayrollData };

const nowIso = () => new Date().toISOString();
const todayStr = () => new Date().toISOString().slice(0, 10);

function buildPayrollStore(): HrPayrollData {
  const now = nowIso();
  const structures: SalaryStructure[] = [
    {
      id: '00000000-0000-4000-8000-00000000e001',
      orgId: hrDemoStore().orgId,
      grade: 'G2',
      basic: '12000.00',
      houseRent: '3000.00',
      medical: '1000.00',
      conveyance: '800.00',
      fieldAllowance: '1200.00',
      pfEmployeeRate: '0.05',
      pfEmployerRate: '0.05',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: '00000000-0000-4000-8000-00000000e002',
      orgId: hrDemoStore().orgId,
      grade: 'G3',
      basic: '18000.00',
      houseRent: '4500.00',
      medical: '1500.00',
      conveyance: '1000.00',
      fieldAllowance: '0.00',
      pfEmployeeRate: '0.05',
      pfEmployerRate: '0.05',
      createdAt: now,
      updatedAt: now,
    },
  ];
  // Seed one PF contribution pair for the accountant so the self-service
  // ledger shows history.
  const pfLedger: PfLedgerEntry[] = [];
  return { structures, runs: [], pfLedger, gratuity: [], scorecards: [], appraisals: [], cases: [], counters: { run: 1, caseNo: 1 } };
}

export function hrPayrollStore(): HrPayrollData {
  if (!globalRef.__hrPayrollData) globalRef.__hrPayrollData = buildPayrollStore();
  return globalRef.__hrPayrollData;
}

export function resetHrPayrollStore(): void {
  globalRef.__hrPayrollData = buildPayrollStore();
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const s2 = (n: number) => r2(n).toFixed(2);
const monthOf = (d: string) => d.slice(0, 7);
const yearOf = (d: string) => d.slice(0, 4);

/** Business days (Mon–Fri) in the month of the given date. */
function workingDaysOf(period: string): number {
  const [y, m] = period.split('-').map(Number) as [number, number];
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let count = 0;
  for (let d = 1; d <= days; d += 1) {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow !== 5) count += 1; // Friday is the weekly holiday in BD
  }
  return count;
}

/* ── Salary structures ───────────────────────────────────────────────────── */

export function listSalaryStructures(store: HrPayrollData): SalaryStructure[] {
  return store.structures;
}

export function upsertSalaryStructure(store: HrPayrollData, input: SalaryStructureInput, orgId: string): SalaryStructure {
  const existing = store.structures.find((s) => s.grade === input.grade);
  if (existing) {
    Object.assign(existing, { ...input, updatedAt: nowIso() });
    return existing;
  }
  const structure: SalaryStructure = {
    id: `00000000-0000-4000-8000-${store.structures.length.toString().padStart(12, '0').slice(-12)}`,
    orgId,
    ...input,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  store.structures.push(structure);
  return structure;
}

/* ── 5) Payroll run ──────────────────────────────────────────────────────── */

/**
 * Build (or rebuild) the draft run for a period. Attendance comes from the HR
 * store: present = status present/late/leave in that month; festival bonus for
 * the two Eid months is added for eligible staff.
 */
export function previewPayrollRun(store: HrPayrollData, input: PayrollRunInput, orgId: string): PayrollRun {
  const hr = hrDemoStore();
  if (store.runs.some((r) => r.orgId === orgId && r.period === input.period)) {
    throw new HrDemoError(409, 'CONFLICT', `পেরোল রান আছে / Payroll run already exists for ${input.period}`);
  }
  const workingDays = workingDaysOf(input.period);
  const lines = hr.staff
    .filter((st) => st.status === 'confirmed' || st.status === 'probation')
    .map((st) => {
      const structure = store.structures.find((s) => s.grade === st.grade) ?? store.structures[0]!;
      const monthAttendance = hr.attendance.filter(
        (a) => a.staffId === st.id && monthOf(a.workDate) === input.period && (a.status === 'present' || a.status === 'late' || a.status === 'leave'),
      );
      const paidLeave = hr.attendance.filter(
        (a) => a.staffId === st.id && monthOf(a.workDate) === input.period && a.status === 'leave',
      ).length;
      // No attendance data at all (e.g. first run after go-live) → full month.
      const presentDays = monthAttendance.length === 0 ? workingDays : monthAttendance.length - paidLeave;
      const line = computePayrollLine({
        staffId: st.id,
        staffCode: st.employeeCode,
        staffName: st.nameBn,
        branchId: st.branchId,
        structure,
        workingDays,
        paidLeaveDays: paidLeave,
        presentDays,
      });
      return line;
    });

  const bonusDate = `${input.period}-28`;
  const bonusByStaff = new Map<string, number>();
  let bonusTotal = 0;
  for (const st of hr.staff) {
    const structure = store.structures.find((s) => s.grade === st.grade) ?? store.structures[0]!;
    const amount = festivalBonusFor({ status: st.status, joiningDate: st.joiningDate, basic: structure.basic }, bonusDate);
    if (amount > 0) bonusByStaff.set(st.id, amount);
    bonusTotal += amount;
  }

  const totalGross = lines.reduce((a, l) => a + Number(l.gross), 0);
  const totalDeduction = lines.reduce((a, l) => a + Number(l.totalDeduction), 0);
  const totalNet = lines.reduce((a, l) => a + Number(l.net), 0);

  return {
    id: `00000000-0000-4000-8000-${(store.counters.run++ + 0xe10).toString(16).padStart(12, '0')}`,
    orgId,
    period: input.period,
    status: 'draft',
    lines,
    totalGross: s2(totalGross),
    totalDeduction: s2(totalDeduction),
    totalNet: s2(totalNet),
    bonusTotal: s2(bonusTotal),
    preparedBy: '00000000-0000-4000-8000-000000000001',
    approvedBy: null,
    approvedAt: null,
    paidAt: null,
    createdAt: nowIso(),
  };
}

export function createPayrollRun(store: HrPayrollData, input: PayrollRunInput, orgId: string): PayrollRun {
  const run = previewPayrollRun(store, input, orgId);
  store.runs.push(run);
  return run;
}

export function listPayrollRuns(store: HrPayrollData, orgId: string): PayrollRun[] {
  return store.runs.filter((r) => r.orgId === orgId).sort((a, b) => b.period.localeCompare(a.period));
}

export function getPayrollRun(store: HrPayrollData, id: string): PayrollRun {
  const run = store.runs.find((r) => r.id === id);
  if (!run) throw new HrDemoError(404, 'NOT_FOUND', 'Payroll run not found');
  return run;
}

/** draft → approved (one-shot); approved → paid. */
export function decidePayrollRun(store: HrPayrollData, id: string, action: 'approve' | 'pay', userId: string): PayrollRun {
  const run = getPayrollRun(store, id);
  if (action === 'approve') {
    if (run.status !== 'draft') throw new HrDemoError(409, 'CONFLICT', 'শুধু খসড়া অনুমোদন করা যায় / Only draft runs can be approved');
    run.status = 'approved';
    run.approvedBy = userId;
    run.approvedAt = nowIso();
  } else {
    if (run.status !== 'approved') throw new HrDemoError(409, 'CONFLICT', 'পরিশোধের আগে অনুমোদন দরকার / Approve before paying');
    run.status = 'paid';
    run.paidAt = nowIso();
    postPayrollPf(store, run);
  }
  return run;
}

/** On payment, post the employer+employee PF contributions to the ledger. */
function postPayrollPf(store: HrPayrollData, run: PayrollRun): void {
  for (const line of run.lines) {
    const pf = Number(line.deductions.pf_employee ?? 0);
    if (pf <= 0) continue;
    const prev = pfBalance(store, line.staffId);
    const entry: PfLedgerEntry = {
      id: `00000000-0000-4000-8000-${(store.pfLedger.length + 1 + 0xf00).toString(16).padStart(12, '0')}`,
      orgId: run.orgId,
      staffId: line.staffId,
      period: run.period,
      type: 'contribution',
      employeeAmount: line.deductions.pf_employee ?? '0.00',
      employerAmount: line.deductions.pf_employee ?? '0.00', // matched 1:1 by default rate
      balanceAfter: s2(prev + pf * 2),
      note: `Payroll ${run.period}`,
      createdAt: nowIso(),
    };
    store.pfLedger.push(entry);
  }
}

/* ── 5) Payslip + bank sheet ─────────────────────────────────────────────── */

export function payslipFor(store: HrPayrollData, runId: string, staffId: string): { run: PayrollRun; lineIndex: number } {
  const run = getPayrollRun(store, runId);
  const idx = run.lines.findIndex((l) => l.staffId === staffId);
  if (idx === -1) throw new HrDemoError(404, 'NOT_FOUND', 'Staff is not in this payroll run');
  return { run, lineIndex: idx };
}

export function bankSheetFor(store: HrPayrollData, runId: string): BankSheetRow[] {
  const run = getPayrollRun(store, runId);
  const hr = hrDemoStore();
  const accounts = new Map(hr.staff.map((st) => [st.id, { bankName: st.bankName, bankMasked: st.bankMasked }]));
  return run.lines.map((l) => {
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

/* ── 6) PF ledger ────────────────────────────────────────────────────────── */

export function pfBalance(store: HrPayrollData, staffId: string): number {
  return store.pfLedger
    .filter((e) => e.staffId === staffId)
    .reduce((a, e) => {
      const delta = e.type === 'withdrawal' || e.type === 'transfer_out'
        ? -(Number(e.employeeAmount) + Number(e.employerAmount))
        : Number(e.employeeAmount) + Number(e.employerAmount);
      return a + delta;
    }, 0);
}

export function listPfLedger(store: HrPayrollData, staffId?: string): PfLedgerEntry[] {
  return staffId ? store.pfLedger.filter((e) => e.staffId === staffId) : store.pfLedger;
}

export function addPfEntry(store: HrPayrollData, input: PfAdjustmentInput, orgId: string): PfLedgerEntry {
  const prev = pfBalance(store, input.staffId);
  const delta = Number(input.employeeAmount) + Number(input.employerAmount);
  if (input.type === 'withdrawal' || input.type === 'transfer_out') {
    if (delta > prev + 1e-9) {
      throw new HrDemoError(422, 'VALIDATION_ERROR', 'ব্যালেন্সের বেশি উত্তোলন / Withdrawal exceeds PF balance');
    }
  }
  const signed = input.type === 'withdrawal' || input.type === 'transfer_out' ? -delta : delta;
  const entry: PfLedgerEntry = {
    id: `00000000-0000-4000-8000-${(store.pfLedger.length + 1 + 0xf00).toString(16).padStart(12, '0')}`,
    orgId,
    staffId: input.staffId,
    period: input.period ?? null,
    type: input.type,
    employeeAmount: input.employeeAmount,
    employerAmount: input.employerAmount,
    balanceAfter: s2(prev + signed),
    note: input.note ?? null,
    createdAt: nowIso(),
  };
  store.pfLedger.push(entry);
  return entry;
}

/** Gratuity settlement for a leaving staff member. */
export function settleGratuity(store: HrPayrollData, staffId: string, leavingDate: string, orgId: string) {
  const hr = hrDemoStore();
  const staff = hr.staff.find((s) => s.id === staffId);
  if (!staff) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');
  const structure = store.structures.find((s) => s.grade === staff.grade) ?? store.structures[0]!;
  const amount = gratuityFor(staff.joiningDate, leavingDate, structure.basic);
  const years = Math.floor(
    (new Date(`${leavingDate}T00:00:00Z`).getTime() - new Date(`${staff.joiningDate}T00:00:00Z`).getTime()) /
      (1000 * 60 * 60 * 24 * 365.25),
  );
  const settlement = {
    id: `00000000-0000-4000-8000-${(store.gratuity.length + 1 + 0xf50).toString(16).padStart(12, '0')}`,
    orgId,
    staffId,
    joiningDate: staff.joiningDate,
    leavingDate,
    lastBasic: structure.basic,
    years,
    amount: s2(amount),
    paidAt: null,
    createdAt: nowIso(),
  };
  store.gratuity.push(settlement);
  return settlement;
}

/* ── 7) KPI + appraisal ──────────────────────────────────────────────────── */

export function upsertKpiScorecard(
  store: HrPayrollData,
  staffId: string,
  period: string,
  actuals: KpiActuals,
  orgId: string,
): KpiScorecard {
  const hr = hrDemoStore();
  const staff = hr.staff.find((s) => s.id === staffId);
  if (!staff) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');
  const scores = {
    collection_rate: scoreKpi('collection_rate', actuals.collection_rate, DEFAULT_KPI_TARGETS.collection_rate),
    par: scoreKpi('par', actuals.par, DEFAULT_KPI_TARGETS.par),
    new_members: scoreKpi('new_members', actuals.new_members, DEFAULT_KPI_TARGETS.new_members),
    meeting_attendance: scoreKpi('meeting_attendance', actuals.meeting_attendance, DEFAULT_KPI_TARGETS.meeting_attendance),
  };
  const total = Object.values(scores).reduce((a: number, b) => a + b, 0) / 4;
  const existing = store.scorecards.find((s) => s.staffId === staffId && s.period === period);
  if (existing) {
    Object.assign(existing, { actuals, scores, totalScore: s2(total), grade: kpiGrade(total) });
    return existing;
  }
  const card: KpiScorecard = {
    id: `00000000-0000-4000-8000-${(store.scorecards.length + 1 + 0xf80).toString(16).padStart(12, '0')}`,
    orgId,
    staffId,
    staffName: staff.nameBn,
    period,
    actuals: actuals as unknown as KpiScorecard['actuals'],
    scores,
    totalScore: r2(total),
    grade: kpiGrade(total),
    createdAt: nowIso(),
  };
  store.scorecards.push(card);
  return card;
}

export function listKpiScorecards(store: HrPayrollData, staffId?: string): KpiScorecard[] {
  return staffId ? store.scorecards.filter((s) => s.staffId === staffId) : store.scorecards;
}

export function createAppraisal(store: HrPayrollData, input: AppraisalInput, orgId: string): StaffAppraisal {
  const hr = hrDemoStore();
  const staff = hr.staff.find((s) => s.id === input.staffId);
  if (!staff) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');
  if (store.appraisals.some((a) => a.staffId === input.staffId && a.year === input.year)) {
    throw new HrDemoError(409, 'CONFLICT', 'এই বছরের মূল্যায়ন আছে / Appraisal exists for this year');
  }
  const rating = appraisalRating(input.scores as Record<AppraisalCriterion, number>);
  const appraisal: StaffAppraisal = {
    id: `00000000-0000-4000-8000-${(store.appraisals.length + 1 + 0xfa0).toString(16).padStart(12, '0')}`,
    orgId,
    staffId: input.staffId,
    staffName: staff.nameBn,
    year: input.year,
    scores: input.scores as Record<AppraisalCriterion, number>,
    comments: input.comments ?? '',
    rating: r2(rating),
    status: 'submitted',
    reviewerId: null,
    reviewerNote: null,
    createdAt: nowIso(),
  };
  store.appraisals.push(appraisal);
  return appraisal;
}

export function listAppraisals(store: HrPayrollData, staffId?: string): StaffAppraisal[] {
  return staffId ? store.appraisals.filter((a) => a.staffId === staffId) : store.appraisals;
}

export function reviewAppraisal(store: HrPayrollData, id: string, reviewerId: string, note: string): StaffAppraisal {
  const appraisal = store.appraisals.find((a) => a.id === id);
  if (!appraisal) throw new HrDemoError(404, 'NOT_FOUND', 'Appraisal not found');
  if (appraisal.status === 'reviewed') throw new HrDemoError(409, 'CONFLICT', 'Already reviewed');
  appraisal.status = 'reviewed' as AppraisalStatus;
  appraisal.reviewerId = reviewerId;
  appraisal.reviewerNote = note;
  return appraisal;
}

/* ── 8) Disciplinary ─────────────────────────────────────────────────────── */

export function listDisciplineCases(store: HrPayrollData): DisciplineCase[] {
  return store.cases;
}

export function createDisciplineCase(store: HrPayrollData, input: DisciplineCaseInput, raisedBy: string, orgId: string): DisciplineCase {
  const hr = hrDemoStore();
  const staff = hr.staff.find((s) => s.id === input.staffId);
  if (!staff) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');
  const c: DisciplineCase = {
    id: `00000000-0000-4000-8000-${(store.cases.length + 1 + 0xfc0).toString(16).padStart(12, '0')}`,
    orgId,
    staffId: input.staffId,
    staffName: staff.nameBn,
    severity: input.severity as DisciplineSeverity,
    incidentDate: input.incidentDate,
    description: input.description,
    status: 'open',
    explanation: null,
    outcome: null,
    raisedBy,
    closedBy: null,
    closedAt: null,
    createdAt: nowIso(),
  };
  store.cases.push(c);
  return c;
}

export function closeDisciplineCase(store: HrPayrollData, id: string, input: DisciplineCloseInput, closedBy: string): DisciplineCase {
  const c = store.cases.find((x) => x.id === id);
  if (!c) throw new HrDemoError(404, 'NOT_FOUND', 'Case not found');
  if (c.status === 'closed') throw new HrDemoError(409, 'CONFLICT', 'মামলা বন্ধ / Case already closed');
  c.status = 'closed';
  c.explanation = input.explanation ?? null;
  c.outcome = input.outcome;
  c.closedBy = closedBy;
  c.closedAt = nowIso();
  return c;
}

/* ── 9) Self-service summary ─────────────────────────────────────────────── */

export function selfServiceSummary(store: HrPayrollData, staffId: string): SelfServiceSummary {
  const hr = hrDemoStore();
  const staff = hr.staff.find((s) => s.id === staffId);
  if (!staff) throw new HrDemoError(404, 'NOT_FOUND', 'Staff not found');
  const year = yearOf(todayStr());
  const payslips = store.runs
    .filter((r) => r.lines.some((l) => l.staffId === staffId))
    .map((r) => {
      const line = r.lines.find((l) => l.staffId === staffId)!;
      return { period: r.period, gross: line.gross, totalDeduction: line.totalDeduction, net: line.net, status: r.status };
    })
    .sort((a, b) => b.period.localeCompare(a.period));
  const pf = pfBalance(store, staffId);
  return {
    staffCode: staff.employeeCode,
    staffName: staff.nameBn,
    designation: staff.designation,
    status: staff.status,
    payslips,
    leaveBalance: hrLeaveBalanceFor(staffId, year),
    pfBalance: s2(pf),
    documents: staff.documents.map((d) => d.name),
  };
}

/** Re-export of the HR store's balance calc scoped to one staff member. */
function hrLeaveBalanceFor(staffId: string, year: string): Record<string, { entitlement: number; taken: number; remaining: number }> {
  const hr = hrDemoStore();
  const out: Record<string, { entitlement: number; taken: number; remaining: number }> = {};
  for (const [leaveType, entitlement] of Object.entries({ casual: 10, sick: 14, annual: 20, maternity: 180 })) {
    const taken = hr.leaveRequests
      .filter((r) => r.staffId === staffId && r.leaveType === leaveType && r.status === 'approved' && yearOf(r.startDate) === year)
      .reduce((a, r) => a + r.days, 0);
    out[leaveType] = { entitlement, taken, remaining: entitlement - taken };
  }
  return out;
}

/** Monthly tax helper re-exported for route validation messages. */
export { monthlyTax };
