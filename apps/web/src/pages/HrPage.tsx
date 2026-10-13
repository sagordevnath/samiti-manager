/**
 * ── HR page ──────────────────────────────────────────────────────────────────
 * Staff master (encrypted NID/bank shown masked), recruitment lite pipeline,
 * attendance day sheet with GPS/selfie check-in, leave balances and holiday
 * calendar, and the transfer/promotion workflow with printable orders.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CalendarCheck, ClipboardList, Gauge, Pencil, Plus, Printer, ShieldAlert, Trash2, UserCog, Users } from 'lucide-react';
import type {
  Applicant,
  AttendanceEntry,
  DisciplineCase,
  HrHoliday,
  KpiScorecard,
  LeaveRequest,
  PayrollRun,
  Staff,
  StaffAppraisal,
  StaffMovement,
  Vacancy,
} from '@samity/shared';
import { LEAVE_LABELS_BN, type LeaveType } from '@samity/shared';
import {
  DESIGNATIONS,
  DESIGNATION_LABELS_BN,
  STAFF_GRADES,
  applicantCreateSchema,
  applicantUpdateSchema,
  staffCreateSchema,
  staffUpdateSchema,
  vacancyCreateSchema,
  vacancyUpdateSchema,
  type ApplicantCreateInput,
  type StaffCreateInput,
  type VacancyCreateInput,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';
import { useCan } from '@/lib/permissions';
import { useMoneyFormatter } from '@/lib/digits';

const TABS = ['staff', 'recruitment', 'attendance', 'movements', 'payroll', 'performance'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  staff: 'কর্মচারী',
  recruitment: 'নিয়োগ',
  attendance: 'হাজিরা ও ছুটি',
  movements: 'বদলি ও পদোন্নতি',
  payroll: 'পেরোল ও পিএফ',
  performance: 'পারফরম্যান্স ও শৃঙ্খলা',
};

const STATUS_BN: Record<string, string> = {
  probation: 'প্রবেশনারি',
  confirmed: 'স্থায়ী',
  suspended: 'সাসপেন্ডেড',
  resigned: 'পদত্যাগ',
  terminated: 'বরখাস্ত',
  retired: 'অবসর',
  applied: 'আবেদন',
  shortlisted: 'সংক্ষিপ্ত তালিকা',
  interviewed: 'ভাইভা',
  offered: 'অফার',
  joined: 'যোগদান',
  rejected: 'বাতিল',
  requested: 'অনুরোধ',
  approved: 'অনুমোদিত',
  closed: 'বন্ধ',
  present: 'উপস্থিত',
  late: 'বিলম্ব',
  absent: 'অনুপস্থিত',
  leave: 'ছুটিতে',
  pending: 'অপেক্ষমান',
  proposed: 'প্রস্তাবিত',
  effective: 'কার্যকর',
  transfer: 'বদলি',
  promotion: 'পদোন্নতি',
  casual: LEAVE_LABELS_BN.casual,
  sick: LEAVE_LABELS_BN.sick,
  annual: LEAVE_LABELS_BN.annual,
  maternity: LEAVE_LABELS_BN.maternity,
};

const DESIG_BN: Record<string, string> = {
  field_officer: 'ফিল্ড অফিসার',
  senior_field_officer: 'সিনিয়র ফিল্ড অফিসার',
  account_officer: 'একাউন্ট অফিসার',
  branch_manager: 'শাখা ম্যানেজার',
  accountant: 'হিসাবরক্ষক',
};

const FIELD_OFFICER = '00000000-0000-4000-8000-0000000000f1';
const ACCOUNTANT = '00000000-0000-4000-8000-0000000000f2';
const TODAY = () => new Date().toISOString().slice(0, 10);

type BranchLite = { id: string; name: string; name_bn: string | null; code: string };

/** Blank create forms — reset targets after a successful POST. */
const EMPTY_STAFF: StaffCreateInput = {
  name: '',
  nameBn: '',
  designation: 'field_officer',
  grade: 'G1',
  branchId: null,
  joiningDate: '',
  mobile: '',
  monthlyGross: '15000.00',
};
const EMPTY_VACANCY: VacancyCreateInput = { branchId: '', designation: 'field_officer', headcount: 1, reason: '' };
const EMPTY_APPLICANT: ApplicantCreateInput = { vacancyId: '', name: '', mobile: '', educationLevel: '', experienceYears: 0 };

/** In-flight edit of an existing row; `null` means no edit card is open. */
type StaffEditState = {
  id: string;
  code: string;
  form: {
    name: string;
    nameBn: string;
    designation: StaffCreateInput['designation'];
    grade: StaffCreateInput['grade'];
    branchId: string;
    joiningDate: string;
    mobile: string;
    monthlyGross: string;
    /** Blank means "leave the stored value alone" — never wipe a mask by accident. */
    nid: string;
    bankAccount: string;
    bankName: string;
  };
};
type VacancyEditState = { id: string; form: VacancyCreateInput };
type ApplicantEditState = { id: string; form: Omit<ApplicantCreateInput, 'vacancyId'> };

const issueText = (issues: Array<{ path: Array<string | number>; message: string }>) =>
  issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · ');

const createErrText = (e: unknown) =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'সংযোগ ব্যর্থ / Request failed';

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-2 py-1.5 text-xs font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-2 py-1.5 ${right ? 'text-right tabular-nums' : ''} ${className ?? ''}`}>{children}</td>;
}
function Pill({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'green' | 'amber' | 'red' }) {
  const style =
    tone === 'green' ? 'bg-emerald-100 text-emerald-800' : tone === 'amber' ? 'bg-amber-100 text-amber-800' : tone === 'red' ? 'bg-red-100 text-red-700' : 'bg-muted text-muted-foreground';
  return <span className={`rounded px-1.5 py-0.5 text-xs ${style}`}>{label}</span>;
}

export function HrPage() {
  const money = useMoneyFormatter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('staff');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const canManageOrg = useCan()('org:manage');
  const canManageBranch = useCan()('branch:manage');
  const [createErr, setCreateErr] = useState('');
  const [createOk, setCreateOk] = useState('');
  const [staffForm, setStaffForm] = useState<StaffCreateInput>({ ...EMPTY_STAFF, joiningDate: TODAY() });
  const [vacancyForm, setVacancyForm] = useState<VacancyCreateInput>(EMPTY_VACANCY);
  const [applicantForm, setApplicantForm] = useState<ApplicantCreateInput>(EMPTY_APPLICANT);
  const [staffEdit, setStaffEdit] = useState<StaffEditState | null>(null);
  const [vacancyEdit, setVacancyEdit] = useState<VacancyEditState | null>(null);
  const [applicantEdit, setApplicantEdit] = useState<ApplicantEditState | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['hr'] });
  const act = (fn: () => Promise<unknown>) => {
    setBusy(true);
    fn()
      .catch(() => undefined)
      .finally(() => setTimeout(() => setBusy(false), 400));
  };

  const staff = useQuery({
    queryKey: ['hr', 'staff', search],
    queryFn: () => api.get<{ items: Staff[] }>(`/hr/staff${search ? `?q=${encodeURIComponent(search)}` : ''}`),
  });
  const branches = useQuery({
    queryKey: ['hr', 'branches'],
    queryFn: () => api.get<{ items: BranchLite[] }>('/org/branches'),
  });
  const vacancies = useQuery({
    queryKey: ['hr', 'vacancies'],
    queryFn: () => api.get<{ items: Vacancy[] }>('/hr/vacancies'),
  });
  const applicants = useQuery({
    queryKey: ['hr', 'applicants'],
    queryFn: () => api.get<{ items: Applicant[] }>('/hr/applicants'),
  });
  const attendance = useQuery({
    queryKey: ['hr', 'attendance'],
    queryFn: () => api.get<{ items: Array<AttendanceEntry & { staffName: string }> }>(`/hr/attendance?date=${TODAY()}`),
  });
  const leave = useQuery({
    queryKey: ['hr', 'leave'],
    queryFn: () => api.get<{ items: LeaveRequest[] }>('/hr/leave'),
  });
  const holidays = useQuery({
    queryKey: ['hr', 'holidays'],
    queryFn: () => api.get<{ items: HrHoliday[] }>('/hr/holidays'),
  });
  const movements = useQuery({
    queryKey: ['hr', 'movements'],
    queryFn: () => api.get<{ items: StaffMovement[] }>('/hr/movements'),
  });
  const leaveBalances = useQuery({
    queryKey: ['hr', 'balances', ACCOUNTANT],
    queryFn: () => api.get<Record<string, { entitlement: number; taken: number; remaining: number }>>(`/hr/leave-balances/${ACCOUNTANT}`),
  });

  const loading = [staff, vacancies, applicants, attendance, leave, holidays, movements].some((q) => q.isPending);

  // ── Mutations ──
  const confirmStaff = useMutation({ mutationFn: (id: string) => api.post(`/hr/staff/${id}/confirm`), onSuccess: invalidate });
  const decideVacancy = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => api.post(`/hr/vacancies/${id}/decision`, { decision }),
    onSuccess: invalidate,
  });
  const addScore = useMutation({
    mutationFn: (id: string) => api.post(`/hr/applicants/${id}/interview`, { panelist: 'Web panel', score: 7 }),
    onSuccess: invalidate,
  });
  const offer = useMutation({
    mutationFn: (id: string) => api.post(`/hr/applicants/${id}/offer`, { offeredSalary: '16500.00' }),
    onSuccess: invalidate,
  });
  const fieldCheckIn = useMutation({
    mutationFn: () => api.post(`/hr/attendance/field-check-in?staffId=${FIELD_OFFICER}`, { workDate: TODAY(), lat: 23.8113, lng: 90.413, selfiePath: `selfies/${TODAY()}-f1.jpg` }),
    onSuccess: invalidate,
  });
  const officeCheckIn = useMutation({
    mutationFn: () => api.post(`/hr/attendance/office-check-in?staffId=${ACCOUNTANT}`, { workDate: TODAY() }),
    onSuccess: invalidate,
  });
  const requestLeave = useMutation({
    mutationFn: () =>
      api.post('/hr/leave', { staffId: ACCOUNTANT, leaveType: 'casual', startDate: TODAY(), endDate: TODAY(), reason: 'ব্যক্তিগত কাজ' }),
    onSuccess: invalidate,
  });
  const decideLeave = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => api.post(`/hr/leave/${id}/decision`, { decision }),
    onSuccess: invalidate,
  });
  const createMovement = useMutation({
    mutationFn: (kind: 'transfer' | 'promotion') =>
      kind === 'transfer'
        ? api.post('/hr/movements', { kind, staffId: FIELD_OFFICER, toBranchId: '00000000-0000-4000-8000-0000000000b2', toDesignation: 'field_officer', effectiveDate: TODAY(), reason: 'ডেমো বদলি' })
        : api.post('/hr/movements', { kind, staffId: FIELD_OFFICER, toDesignation: 'senior_field_officer', toGrade: 'G3', newMonthlyGross: '19000.00', effectiveDate: TODAY(), reason: 'ডেমো পদোন্নতি' }),
    onSuccess: invalidate,
  });
  const decideMovement = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) => api.post(`/hr/movements/${id}/decision`, { decision }),
    onSuccess: invalidate,
  });
  const applyMovement = useMutation({ mutationFn: (id: string) => api.post(`/hr/movements/${id}/apply`), onSuccess: invalidate });

  // ── Payroll / performance queries (req 5–8) ──
  const payrollRuns = useQuery({
    queryKey: ['hr', 'payroll-runs'],
    queryFn: () => api.get<{ items: PayrollRun[] }>('/hr/payroll/runs'),
  });
  const pfLedger = useQuery({
    queryKey: ['hr', 'pf'],
    queryFn: () => api.get<{ items: Array<{ id: string; staffId: string; type: string; employeeAmount: string; employerAmount: string; balanceAfter: string; period: string | null; note: string | null }> }>('/hr/pf'),
  });
  const kpis = useQuery({
    queryKey: ['hr', 'kpi'],
    queryFn: () => api.get<{ items: KpiScorecard[] }>('/hr/performance/kpi'),
  });
  const appraisals = useQuery({
    queryKey: ['hr', 'appraisals'],
    queryFn: () => api.get<{ items: StaffAppraisal[] }>('/hr/performance/appraisals'),
  });
  const discipline = useQuery({
    queryKey: ['hr', 'discipline'],
    queryFn: () => api.get<{ items: DisciplineCase[] }>('/hr/discipline'),
  });

  const createPayroll = useMutation({
    mutationFn: () => api.post('/hr/payroll/runs', { period: TODAY().slice(0, 7) }),
    onSuccess: invalidate,
  });
  const decidePayroll = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'approve' | 'pay' }) => api.post(`/hr/payroll/runs/${id}/decision`, { action }),
    onSuccess: invalidate,
  });
  const createKpi = useMutation({
    mutationFn: () => api.put(`/hr/performance/kpi/${FIELD_OFFICER}/${TODAY().slice(0, 7)}`, { collection_rate: 1.0, par: 0.02, new_members: 9, meeting_attendance: 0.95 }),
    onSuccess: invalidate,
  });
  const createAppraisal = useMutation({
    mutationFn: () => api.post('/hr/performance/appraisals', { staffId: FIELD_OFFICER, year: TODAY().slice(0, 4), scores: { job_knowledge: 8, discipline: 9, teamwork: 7, client_service: 8, target_achievement: 8 }, comments: 'ডেমো মূল্যায়ন' }),
    onSuccess: invalidate,
  });
  const createCase = useMutation({
    mutationFn: () => api.post('/hr/discipline', { staffId: FIELD_OFFICER, severity: 'written_warning', incidentDate: TODAY(), description: 'ডেমো অভিযোগ: ধারাবাহিক সভা মিস' }),
    onSuccess: invalidate,
  });
  const closeCase = useMutation({
    mutationFn: ({ id, outcome }: { id: string; outcome: string }) => api.post(`/hr/discipline/${id}/close`, { explanation: 'ব্যাখ্যা গৃহীত', outcome }),
    onSuccess: invalidate,
  });

  // ── Create paths (staff, vacancy, applicant) ──
  const createStaff = useMutation({
    mutationFn: (values: StaffCreateInput) => api.post('/hr/staff', values),
    onSuccess: (_r, values) => {
      setCreateErr('');
      setCreateOk(`কর্মচারী যোগ হয়েছে: ${values.nameBn} (${values.name})`);
      setStaffForm({ ...EMPTY_STAFF, joiningDate: TODAY() });
      void invalidate();
    },
    onError: (e) => {
      setCreateOk('');
      setCreateErr(createErrText(e));
    },
  });
  const createVacancy = useMutation({
    mutationFn: (values: VacancyCreateInput) => api.post('/hr/vacancies', values),
    onSuccess: (_r, values) => {
      setCreateErr('');
      setCreateOk(`শূন্যপদ অনুরোধ তৈরি হয়েছে: ${DESIGNATION_LABELS_BN[values.designation] ?? values.designation} × ${values.headcount}`);
      setVacancyForm(EMPTY_VACANCY);
      void invalidate();
    },
    onError: (e) => {
      setCreateOk('');
      setCreateErr(createErrText(e));
    },
  });
  const createApplicant = useMutation({
    mutationFn: (values: ApplicantCreateInput) => api.post('/hr/applicants', values),
    onSuccess: (_r, values) => {
      setCreateErr('');
      setCreateOk(`আবেদনকারী যোগ হয়েছে: ${values.name}`);
      setApplicantForm(EMPTY_APPLICANT);
      void invalidate();
    },
    onError: (e) => {
      setCreateOk('');
      setCreateErr(createErrText(e));
    },
  });

  // ── Edit / remove paths — correcting records created by mistake ──
  const saveStaff = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, unknown> }) => api.patch(`/hr/staff/${id}`, values),
    onSuccess: (_r, { id }) => {
      setCreateErr('');
      setCreateOk(`কর্মচারী হালনাগাদ হয়েছে (${staffEdit?.code ?? id.slice(0, 8)})`);
      setStaffEdit(null);
      void invalidate();
    },
    onError: (e) => {
      setCreateOk('');
      setCreateErr(createErrText(e));
    },
  });
  const saveVacancy = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, unknown> }) => api.patch(`/hr/vacancies/${id}`, values),
    onSuccess: () => {
      setCreateErr('');
      setCreateOk('শূন্যপদ হালনাগাদ হয়েছে');
      setVacancyEdit(null);
      void invalidate();
    },
    onError: (e) => {
      setCreateOk('');
      setCreateErr(createErrText(e));
    },
  });
  const saveApplicant = useMutation({
    mutationFn: ({ id, values }: { id: string; values: Record<string, unknown> }) => api.patch(`/hr/applicants/${id}`, values),
    onSuccess: () => {
      setCreateErr('');
      setCreateOk('আবেদনকারীর তথ্য হালনাগাদ হয়েছে');
      setApplicantEdit(null);
      void invalidate();
    },
    onError: (e) => {
      setCreateOk('');
      setCreateErr(createErrText(e));
    },
  });
  const removeStaff = useMutation({
    mutationFn: (id: string) => api.delete(`/hr/staff/${id}`),
    onSuccess: () => {
      setCreateErr('');
      setCreateOk('কর্মচারী তালিকা থেকে মুছে ফেলা হয়েছে');
      void invalidate();
    },
    onError: (e) => {
      setCreateOk('');
      setCreateErr(createErrText(e));
    },
  });
  const removeVacancy = useMutation({
    mutationFn: (id: string) => api.delete(`/hr/vacancies/${id}`),
    onSuccess: () => {
      setCreateErr('');
      setCreateOk('শূন্যপদ প্রত্যাহার করা হয়েছে');
      void invalidate();
    },
    onError: (e) => {
      setCreateOk('');
      setCreateErr(createErrText(e));
    },
  });
  const removeApplicant = useMutation({
    mutationFn: (id: string) => api.delete(`/hr/applicants/${id}`),
    onSuccess: () => {
      setCreateErr('');
      setCreateOk('আবেদনকারী মুছে ফেলা হয়েছে');
      void invalidate();
    },
    onError: (e) => {
      setCreateOk('');
      setCreateErr(createErrText(e));
    },
  });

  const openStaffEdit = (s: Staff) =>
    setStaffEdit({
      id: s.id,
      code: s.employeeCode,
      form: {
        name: s.name,
        nameBn: s.nameBn,
        designation: s.designation,
        grade: s.grade,
        branchId: s.branchId ?? '',
        joiningDate: s.joiningDate,
        mobile: s.mobile,
        monthlyGross: s.monthlyGross,
        nid: '',
        bankAccount: '',
        bankName: s.bankName ?? '',
      },
    });
  const openVacancyEdit = (v: Vacancy) =>
    setVacancyEdit({
      id: v.id,
      form: { branchId: v.branchId, designation: v.designation, headcount: v.headcount, reason: v.reason },
    });
  const openApplicantEdit = (a: Applicant) =>
    setApplicantEdit({
      id: a.id,
      form: { name: a.name, mobile: a.mobile, educationLevel: a.educationLevel, experienceYears: a.experienceYears },
    });

  const submitStaff = () => {
    setCreateErr('');
    setCreateOk('');
    const parsed = staffCreateSchema.safeParse(staffForm);
    if (!parsed.success) {
      setCreateErr(issueText(parsed.error.issues));
      return;
    }
    createStaff.mutate(parsed.data);
  };
  const submitStaffEdit = () => {
    if (!staffEdit) return;
    setCreateErr('');
    setCreateOk('');
    const f = staffEdit.form;
    // A blank NID/bank box means "unchanged": the API only re-encrypts when a
    // new plaintext value is sent, so omitting it preserves the stored one.
    const parsed = staffUpdateSchema.safeParse({
      name: f.name,
      nameBn: f.nameBn,
      designation: f.designation,
      grade: f.grade,
      branchId: f.branchId || null,
      joiningDate: f.joiningDate,
      mobile: f.mobile,
      monthlyGross: f.monthlyGross,
      bankName: f.bankName || null,
      ...(f.nid ? { nid: f.nid } : {}),
      ...(f.bankAccount ? { bankAccount: f.bankAccount } : {}),
    });
    if (!parsed.success) {
      setCreateErr(issueText(parsed.error.issues));
      return;
    }
    saveStaff.mutate({ id: staffEdit.id, values: parsed.data as Record<string, unknown> });
  };
  const submitVacancyEdit = () => {
    if (!vacancyEdit) return;
    setCreateErr('');
    setCreateOk('');
    const parsed = vacancyUpdateSchema.safeParse(vacancyEdit.form);
    if (!parsed.success) {
      setCreateErr(issueText(parsed.error.issues));
      return;
    }
    saveVacancy.mutate({ id: vacancyEdit.id, values: parsed.data as Record<string, unknown> });
  };
  const submitApplicantEdit = () => {
    if (!applicantEdit) return;
    setCreateErr('');
    setCreateOk('');
    const parsed = applicantUpdateSchema.safeParse(applicantEdit.form);
    if (!parsed.success) {
      setCreateErr(issueText(parsed.error.issues));
      return;
    }
    saveApplicant.mutate({ id: applicantEdit.id, values: parsed.data as Record<string, unknown> });
  };
  const submitVacancy = () => {
    setCreateErr('');
    setCreateOk('');
    const parsed = vacancyCreateSchema.safeParse(vacancyForm);
    if (!parsed.success) {
      setCreateErr(issueText(parsed.error.issues));
      return;
    }
    createVacancy.mutate(parsed.data);
  };
  const submitApplicant = () => {
    setCreateErr('');
    setCreateOk('');
    const parsed = applicantCreateSchema.safeParse(applicantForm);
    if (!parsed.success) {
      setCreateErr(issueText(parsed.error.issues));
      return;
    }
    createApplicant.mutate(parsed.data);
  };

  const branchOptions = branches.data?.items ?? [];
  const createBanners = (
    <>
      {createErr ? (
        <div className="rounded-[var(--radius)] border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{createErr}</div>
      ) : null}
      {createOk ? (
        <div className="rounded-[var(--radius)] border border-teal-600/30 bg-teal-600/10 px-3 py-2 text-xs text-teal-800 dark:text-teal-200">{createOk}</div>
      ) : null}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">মানব সম্পদ</h1>
        <Users className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="page-tabs flex flex-wrap gap-1 rounded-lg border bg-card/90 p-1 backdrop-blur-md">
        {TABS.map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          >
            {TAB_LABELS[k]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ── Staff master ── */}
          {tab === 'staff' && (
            <>
              {createBanners}
              {canManageOrg && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Plus className="h-4 w-4" /> নতুন কর্মচারী
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="s-namebn">নাম (বাংলা)</Label>
                        <Input id="s-namebn" value={staffForm.nameBn} onChange={(e) => setStaffForm({ ...staffForm, nameBn: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="s-name">নাম (English)</Label>
                        <Input id="s-name" value={staffForm.name} onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="s-desig">পদ</Label>
                        <select
                          id="s-desig"
                          className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                          value={staffForm.designation}
                          onChange={(e) => setStaffForm({ ...staffForm, designation: e.target.value as StaffCreateInput['designation'] })}
                        >
                          {DESIGNATIONS.map((d) => (
                            <option key={d} value={d}>
                              {DESIGNATION_LABELS_BN[d] ?? d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="s-grade">গ্রেড</Label>
                        <select
                          id="s-grade"
                          className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                          value={staffForm.grade}
                          onChange={(e) => setStaffForm({ ...staffForm, grade: e.target.value as StaffCreateInput['grade'] })}
                        >
                          {STAFF_GRADES.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="s-branch">শাখা</Label>
                        <select
                          id="s-branch"
                          className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                          value={staffForm.branchId ?? ''}
                          onChange={(e) => setStaffForm({ ...staffForm, branchId: e.target.value || null })}
                        >
                          <option value="">— প্রধান কার্যালয় —</option>
                          {branchOptions.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name_bn ?? b.name} ({b.code})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="s-join">যোগদানের তারিখ</Label>
                        <Input id="s-join" type="date" value={staffForm.joiningDate} onChange={(e) => setStaffForm({ ...staffForm, joiningDate: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="s-mobile">মোবাইল</Label>
                        <Input id="s-mobile" placeholder="01XXXXXXXXX" value={staffForm.mobile} onChange={(e) => setStaffForm({ ...staffForm, mobile: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="s-gross">মাসিক গ্রস বেতন</Label>
                        <Input id="s-gross" value={staffForm.monthlyGross} onChange={(e) => setStaffForm({ ...staffForm, monthlyGross: e.target.value })} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <Button size="sm" disabled={createStaff.isPending} onClick={submitStaff}>
                        {createStaff.isPending ? 'সংরক্ষণ হচ্ছে…' : 'কর্মচারী যোগ করুন'}
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      NID/ব্যাংক হিসাব পরে সম্পাদনায় যোগ করা যাবে; নতুন কর্মচারী প্রবেশনারি হিসেবে যোগ হয়।
                    </p>
                  </CardContent>
                </Card>
              )}
              {staffEdit && canManageOrg && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Pencil className="h-4 w-4" /> কর্মচারী সম্পাদনা — <span className="font-mono text-sm">{staffEdit.code}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="e-namebn">নাম (বাংলা)</Label>
                        <Input id="e-namebn" value={staffEdit.form.nameBn} onChange={(e) => setStaffEdit({ ...staffEdit, form: { ...staffEdit.form, nameBn: e.target.value } })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="e-name">নাম (English)</Label>
                        <Input id="e-name" value={staffEdit.form.name} onChange={(e) => setStaffEdit({ ...staffEdit, form: { ...staffEdit.form, name: e.target.value } })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="e-desig">পদ</Label>
                        <select
                          id="e-desig"
                          className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                          value={staffEdit.form.designation}
                          onChange={(e) => setStaffEdit({ ...staffEdit, form: { ...staffEdit.form, designation: e.target.value as StaffCreateInput['designation'] } })}
                        >
                          {DESIGNATIONS.map((d) => (
                            <option key={d} value={d}>
                              {DESIGNATION_LABELS_BN[d] ?? d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="e-grade">গ্রেড</Label>
                        <select
                          id="e-grade"
                          className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                          value={staffEdit.form.grade}
                          onChange={(e) => setStaffEdit({ ...staffEdit, form: { ...staffEdit.form, grade: e.target.value as StaffCreateInput['grade'] } })}
                        >
                          {STAFF_GRADES.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="e-branch">শাখা</Label>
                        <select
                          id="e-branch"
                          className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                          value={staffEdit.form.branchId}
                          onChange={(e) => setStaffEdit({ ...staffEdit, form: { ...staffEdit.form, branchId: e.target.value } })}
                        >
                          <option value="">— প্রধান কার্যালয় —</option>
                          {branchOptions.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name_bn ?? b.name} ({b.code})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="e-join">যোগদানের তারিখ</Label>
                        <Input id="e-join" type="date" value={staffEdit.form.joiningDate} onChange={(e) => setStaffEdit({ ...staffEdit, form: { ...staffEdit.form, joiningDate: e.target.value } })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="e-mobile">মোবাইল</Label>
                        <Input id="e-mobile" value={staffEdit.form.mobile} onChange={(e) => setStaffEdit({ ...staffEdit, form: { ...staffEdit.form, mobile: e.target.value } })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="e-gross">মাসিক গ্রস বেতন</Label>
                        <Input id="e-gross" value={staffEdit.form.monthlyGross} onChange={(e) => setStaffEdit({ ...staffEdit, form: { ...staffEdit.form, monthlyGross: e.target.value } })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="e-nid">নতুন NID (খালি = অপরিবর্তিত)</Label>
                        <Input id="e-nid" value={staffEdit.form.nid} onChange={(e) => setStaffEdit({ ...staffEdit, form: { ...staffEdit.form, nid: e.target.value } })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="e-bank">নতুন ব্যাংক হিসাব (খালি = অপরিবর্তিত)</Label>
                        <Input id="e-bank" value={staffEdit.form.bankAccount} onChange={(e) => setStaffEdit({ ...staffEdit, form: { ...staffEdit.form, bankAccount: e.target.value } })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="e-bankname">ব্যাংকের নাম</Label>
                        <Input id="e-bankname" value={staffEdit.form.bankName} onChange={(e) => setStaffEdit({ ...staffEdit, form: { ...staffEdit.form, bankName: e.target.value } })} />
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" disabled={saveStaff.isPending} onClick={submitStaffEdit}>
                        {saveStaff.isPending ? 'সংরক্ষণ হচ্ছে…' : 'পরিবর্তন সংরক্ষণ করুন'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setStaffEdit(null)}>
                        বাতিল
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      NID/ব্যাংক নতুন করে দিলে সেটি AES-256-GCM এ এনক্রিপ্ট হবে; খালি রাখলে আগের মান অপরিবর্তিত থাকে।
                    </p>
                  </CardContent>
                </Card>
              )}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <UserCog className="h-4 w-4" /> কর্মচারী তালিকা
                  </span>
                  <Input placeholder="নাম / কোড / মোবাইল" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      <Th>কোড</Th>
                      <Th>নাম</Th>
                      <Th>পদ</Th>
                      <Th>গ্রেড</Th>
                      <Th>যোগদান</Th>
                      <Th>NID</Th>
                      <Th>ব্যাংক</Th>
                      <Th right>বেতন</Th>
                      <Th>অবস্থা</Th>
                      <Th>কর্ম</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(staff.data?.items ?? []).map((s) => (
                      <tr key={s.id} className="border-b last:border-0">
                        <Td><span className="font-mono text-xs">{s.employeeCode}</span></Td>
                        <Td>
                          <div>{s.nameBn}</div>
                          <div className="text-xs text-muted-foreground">{s.name}</div>
                        </Td>
                        <Td>{DESIG_BN[s.designation] ?? s.designation}</Td>
                        <Td>{s.grade}</Td>
                        <Td>{s.joiningDate}</Td>
                        <Td>••••{s.nidMasked}</Td>
                        <Td>{s.bankMasked ?? '—'}</Td>
                        <Td right>{money(s.monthlyGross)}</Td>
                        <Td>
                          <Pill label={STATUS_BN[s.status] ?? s.status} tone={s.status === 'confirmed' ? 'green' : s.status === 'probation' ? 'amber' : 'muted'} />
                        </Td>
                        <Td>
                          <div className="flex flex-wrap justify-end gap-1">
                            {s.status === 'probation' && (
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => confirmStaff.mutateAsync(s.id))}>
                                স্থায়ী করুন
                              </Button>
                            )}
                            {canManageOrg && (
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => openStaffEdit(s)}>
                                <Pencil className="mr-1 h-3.5 w-3.5" /> সম্পাদনা
                              </Button>
                            )}
                            {canManageOrg && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive"
                                disabled={busy}
                                onClick={() => {
                                  if (window.confirm(`${s.employeeCode} — ${s.nameBn} তালিকা থেকে মুছে ফেলবেন? / Remove this staff record?`)) {
                                    act(() => removeStaff.mutateAsync(s.id));
                                  }
                                }}
                              >
                                <Trash2 className="mr-1 h-3.5 w-3.5" /> মুছুন
                              </Button>
                            )}
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted-foreground">
                  NID ও ব্যাংক হিসাব AES-256-GCM এ এনক্রিপ্টেড — শুধু শেষ ৪ সংখ্যা দেখানো হয়।
                </p>
              </CardContent>
            </Card>
            </>
          )}

          {/* ── Recruitment ── */}
          {tab === 'recruitment' && (
            <div className="space-y-4">
              {createBanners}
              {canManageBranch && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Plus className="h-4 w-4" /> নতুন শূন্যপদ
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="v-branch">শাখা</Label>
                        <select
                          id="v-branch"
                          className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                          value={vacancyForm.branchId}
                          onChange={(e) => setVacancyForm({ ...vacancyForm, branchId: e.target.value })}
                        >
                          <option value="">— শাখা বাছুন —</option>
                          {branchOptions.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name_bn ?? b.name} ({b.code})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="v-desig">পদ</Label>
                        <select
                          id="v-desig"
                          className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                          value={vacancyForm.designation}
                          onChange={(e) => setVacancyForm({ ...vacancyForm, designation: e.target.value as VacancyCreateInput['designation'] })}
                        >
                          {DESIGNATIONS.map((d) => (
                            <option key={d} value={d}>
                              {DESIGNATION_LABELS_BN[d] ?? d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="v-head">সংখ্যা</Label>
                        <Input
                          id="v-head"
                          type="number"
                          min={1}
                          max={20}
                          value={vacancyForm.headcount}
                          onChange={(e) => setVacancyForm({ ...vacancyForm, headcount: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="v-reason">কারণ</Label>
                        <Input id="v-reason" placeholder="নতুন পদ / পদত্যাগ" value={vacancyForm.reason} onChange={(e) => setVacancyForm({ ...vacancyForm, reason: e.target.value })} />
                      </div>
                    </div>
                    <div className="mt-3">
                      <Button size="sm" disabled={createVacancy.isPending} onClick={submitVacancy}>
                        {createVacancy.isPending ? 'সংরক্ষণ হচ্ছে…' : 'শূন্যপদ অনুরোধ করুন'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              {canManageBranch && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Plus className="h-4 w-4" /> নতুন আবেদনকারী
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-5">
                      <div className="space-y-1.5">
                        <Label htmlFor="a-vac">শূন্যপদ</Label>
                        <select
                          id="a-vac"
                          className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                          value={applicantForm.vacancyId}
                          onChange={(e) => setApplicantForm({ ...applicantForm, vacancyId: e.target.value })}
                        >
                          <option value="">— শূন্যপদ বাছুন —</option>
                          {(vacancies.data?.items ?? []).map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.branchName} · {DESIGNATION_LABELS_BN[v.designation] ?? v.designation}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="a-name">নাম</Label>
                        <Input id="a-name" value={applicantForm.name} onChange={(e) => setApplicantForm({ ...applicantForm, name: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="a-mobile">মোবাইল</Label>
                        <Input id="a-mobile" placeholder="01XXXXXXXXX" value={applicantForm.mobile} onChange={(e) => setApplicantForm({ ...applicantForm, mobile: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="a-edu">শিক্ষা</Label>
                        <Input id="a-edu" placeholder="স্নাতক / HSC" value={applicantForm.educationLevel} onChange={(e) => setApplicantForm({ ...applicantForm, educationLevel: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="a-exp">অভিজ্ঞতা (বছর)</Label>
                        <Input
                          id="a-exp"
                          type="number"
                          min={0}
                          max={40}
                          value={applicantForm.experienceYears}
                          onChange={(e) => setApplicantForm({ ...applicantForm, experienceYears: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <Button size="sm" variant="outline" disabled={createApplicant.isPending} onClick={submitApplicant}>
                        {createApplicant.isPending ? 'সংরক্ষণ হচ্ছে…' : 'আবেদনকারী যোগ করুন'}
                      </Button>
                    </div>
                    {(vacancies.data?.items ?? []).length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">আগে একটি শূন্যপদ অনুরোধ করুন — আবেদনকারী তার অধীনে যোগ হয়।</p>
                    ) : null}
                  </CardContent>
                </Card>
              )}
              {vacancyEdit && canManageBranch && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Pencil className="h-4 w-4" /> শূন্যপদ সম্পাদনা
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="ev-branch">শাখা</Label>
                        <select
                          id="ev-branch"
                          className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                          value={vacancyEdit.form.branchId}
                          onChange={(e) => setVacancyEdit({ ...vacancyEdit, form: { ...vacancyEdit.form, branchId: e.target.value } })}
                        >
                          <option value="">— শাখা বাছুন —</option>
                          {branchOptions.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name_bn ?? b.name} ({b.code})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ev-desig">পদ</Label>
                        <select
                          id="ev-desig"
                          className="h-11 w-full rounded-[var(--radius)] border border-input bg-background/60 px-3 text-sm"
                          value={vacancyEdit.form.designation}
                          onChange={(e) => setVacancyEdit({ ...vacancyEdit, form: { ...vacancyEdit.form, designation: e.target.value as VacancyCreateInput['designation'] } })}
                        >
                          {DESIGNATIONS.map((d) => (
                            <option key={d} value={d}>
                              {DESIGNATION_LABELS_BN[d] ?? d}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ev-head">সংখ্যা</Label>
                        <Input
                          id="ev-head"
                          type="number"
                          min={1}
                          max={20}
                          value={vacancyEdit.form.headcount}
                          onChange={(e) => setVacancyEdit({ ...vacancyEdit, form: { ...vacancyEdit.form, headcount: Number(e.target.value) } })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ev-reason">কারণ</Label>
                        <Input id="ev-reason" value={vacancyEdit.form.reason} onChange={(e) => setVacancyEdit({ ...vacancyEdit, form: { ...vacancyEdit.form, reason: e.target.value } })} />
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" disabled={saveVacancy.isPending} onClick={submitVacancyEdit}>
                        {saveVacancy.isPending ? 'সংরক্ষণ হচ্ছে…' : 'পরিবর্তন সংরক্ষণ করুন'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setVacancyEdit(null)}>
                        বাতিল
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ClipboardList className="h-4 w-4" /> শূন্যপদ
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>শাখা</Th>
                        <Th>পদ</Th>
                        <Th right>সংখ্যা</Th>
                        <Th>কারণ</Th>
                        <Th>অবস্থা</Th>
                        <Th>কর্ম</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(vacancies.data?.items ?? []).map((v) => (
                        <tr key={v.id} className="border-b last:border-0">
                          <Td>{v.branchName}</Td>
                          <Td>{DESIG_BN[v.designation] ?? v.designation}</Td>
                          <Td right>{v.headcount}</Td>
                          <Td>{v.reason}</Td>
                          <Td>
                            <Pill label={STATUS_BN[v.status] ?? v.status} tone={v.status === 'approved' ? 'green' : v.status === 'requested' ? 'amber' : 'red'} />
                          </Td>
                          <Td>
                            <div className="flex flex-wrap justify-end gap-1">
                              {v.status === 'requested' && (
                                <>
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideVacancy.mutateAsync({ id: v.id, decision: 'approve' }))}>
                                    অনুমোদন
                                  </Button>
                                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideVacancy.mutateAsync({ id: v.id, decision: 'reject' }))}>
                                    বাতিল
                                  </Button>
                                </>
                              )}
                              {canManageBranch && (v.status === 'requested' || v.status === 'approved') && (
                                <Button size="sm" variant="ghost" disabled={busy} onClick={() => openVacancyEdit(v)}>
                                  <Pencil className="mr-1 h-3.5 w-3.5" /> সম্পাদনা
                                </Button>
                              )}
                              {canManageBranch && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  disabled={busy}
                                  onClick={() => {
                                    if (window.confirm(`"${v.reason}" শূন্যপদটি প্রত্যাহার করবেন? / Withdraw this vacancy?`)) {
                                      act(() => removeVacancy.mutateAsync(v.id));
                                    }
                                  }}
                                >
                                  <Trash2 className="mr-1 h-3.5 w-3.5" /> মুছুন
                                </Button>
                              )}
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
              {applicantEdit && canManageBranch && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Pencil className="h-4 w-4" /> আবেদনকারী সম্পাদনা
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 sm:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="ea-name">নাম</Label>
                        <Input id="ea-name" value={applicantEdit.form.name} onChange={(e) => setApplicantEdit({ ...applicantEdit, form: { ...applicantEdit.form, name: e.target.value } })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ea-mobile">মোবাইল</Label>
                        <Input id="ea-mobile" value={applicantEdit.form.mobile} onChange={(e) => setApplicantEdit({ ...applicantEdit, form: { ...applicantEdit.form, mobile: e.target.value } })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ea-edu">শিক্ষা</Label>
                        <Input id="ea-edu" value={applicantEdit.form.educationLevel} onChange={(e) => setApplicantEdit({ ...applicantEdit, form: { ...applicantEdit.form, educationLevel: e.target.value } })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ea-exp">অভিজ্ঞতা (বছর)</Label>
                        <Input
                          id="ea-exp"
                          type="number"
                          min={0}
                          max={40}
                          value={applicantEdit.form.experienceYears}
                          onChange={(e) => setApplicantEdit({ ...applicantEdit, form: { ...applicantEdit.form, experienceYears: Number(e.target.value) } })}
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" disabled={saveApplicant.isPending} onClick={submitApplicantEdit}>
                        {saveApplicant.isPending ? 'সংরক্ষণ হচ্ছে…' : 'পরিবর্তন সংরক্ষণ করুন'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setApplicantEdit(null)}>
                        বাতিল
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">আবেদনকারী ও ভাইভা</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>নাম</Th>
                        <Th>শিক্ষা</Th>
                        <Th right>অভিজ্ঞতা</Th>
                        <Th>ভাইভা স্কোর</Th>
                        <Th>অবস্থা</Th>
                        <Th right>অফার</Th>
                        <Th>কর্ম</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(applicants.data?.items ?? []).map((a) => {
                        const mean = a.interviewScores.length
                          ? (a.interviewScores.reduce((s, r) => s + r.score, 0) / a.interviewScores.length).toFixed(1)
                          : null;
                        return (
                          <tr key={a.id} className="border-b last:border-0">
                            <Td>{a.name}</Td>
                            <Td>{a.educationLevel}</Td>
                            <Td right>{a.experienceYears} বছর</Td>
                            <Td>{mean ?? '—'} {a.interviewScores.length > 0 && <span className="text-xs text-muted-foreground">({a.interviewScores.length})</span>}</Td>
                            <Td>
                              <Pill label={STATUS_BN[a.status] ?? a.status} tone={a.status === 'offered' ? 'green' : a.status === 'rejected' ? 'red' : 'amber'} />
                            </Td>
                            <Td right>{a.offeredSalary ? money(a.offeredSalary) : '—'}</Td>
                            <Td>
                              {a.interviewScores.length < 2 && a.status !== 'offered' && (
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => addScore.mutateAsync(a.id))}>
                                  স্কোর +১
                                </Button>
                              )}
                              {a.interviewScores.length >= 1 && a.status !== 'offered' && (
                                <Button size="sm" disabled={busy} onClick={() => act(() => offer.mutateAsync(a.id))}>
                                  অফার
                                </Button>
                              )}
                              {a.status === 'offered' && (
                                <Link to="/hr" className="text-xs text-teal-700 underline" onClick={() => window.dispatchEvent(new CustomEvent('hr:print-offer', { detail: a.id }))}>
                                  অফার পত্র
                                </Link>
                              )}
                              {canManageBranch && a.status !== 'joined' && (
                                <Button size="sm" variant="ghost" disabled={busy} onClick={() => openApplicantEdit(a)}>
                                  <Pencil className="mr-1 h-3.5 w-3.5" /> সম্পাদনা
                                </Button>
                              )}
                              {canManageBranch && a.status !== 'joined' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  disabled={busy}
                                  onClick={() => {
                                    if (window.confirm(`${a.name} — আবেদনকারী মুছে ফেলবেন? / Delete this applicant?`)) {
                                      act(() => removeApplicant.mutateAsync(a.id));
                                    }
                                  }}
                                >
                                  <Trash2 className="mr-1 h-3.5 w-3.5" /> মুছুন
                                </Button>
                              )}
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted-foreground">ভাইভা স্কোর ০–১০; গড় স্কোর চূড়ান্ত। অফারের আগে অন্তত একটি স্কোর আবশ্যক।</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Attendance & leave ── */}
          {tab === 'attendance' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4" /> আজকের হাজিরা ({TODAY()})
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => fieldCheckIn.mutateAsync())}>
                        ফিল্ড চেক-ইন (GPS + সেলফি)
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => officeCheckIn.mutateAsync())}>
                        অফিস চেক-ইন
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>কর্মচারী</Th>
                        <Th>মোড</Th>
                        <Th>অবস্থা</Th>
                        <Th right>দূরত্ব</Th>
                        <Th>সময়</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(attendance.data?.items ?? []).map((a) => (
                        <tr key={a.id} className="border-b last:border-0">
                          <Td>{a.staffName}</Td>
                          <Td>{a.mode === 'field' ? 'ফিল্ড' : 'অফিস'}</Td>
                          <Td>
                            <Pill label={STATUS_BN[a.status] ?? a.status} tone={a.status === 'present' ? 'green' : a.status === 'late' ? 'amber' : 'red'} />
                          </Td>
                          <Td right>{a.distanceMeters != null ? `${a.distanceMeters} মি` : '—'}</Td>
                          <Td>{a.checkInAt ? new Date(a.checkInAt).toLocaleTimeString('bn-BD') : '—'}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(attendance.data?.items ?? []).length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">আজ কেউ চেক-ইন করেনি।</p>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      <span>ছুটির আবেদন</span>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => requestLeave.mutateAsync())}>
                        ডেমো আবেদন (আজ, সাধারণ)
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b text-muted-foreground">
                        <tr>
                          <Th>ধরন</Th>
                          <Th>তারিখ</Th>
                          <Th right>দিন</Th>
                          <Th>অবস্থা</Th>
                          <Th>কর্ম</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {(leave.data?.items ?? []).map((l) => (
                          <tr key={l.id} className="border-b last:border-0">
                            <Td>{STATUS_BN[l.leaveType] ?? l.leaveType}</Td>
                            <Td>{l.startDate} → {l.endDate}</Td>
                            <Td right>{l.days}</Td>
                            <Td>
                              <Pill label={STATUS_BN[l.status] ?? l.status} tone={l.status === 'approved' ? 'green' : l.status === 'rejected' ? 'red' : 'amber'} />
                            </Td>
                            <Td>
                              {l.status === 'pending' && (
                                <>
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideLeave.mutateAsync({ id: l.id, decision: 'approve' }))}>
                                    অনুমোদন
                                  </Button>{' '}
                                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideLeave.mutateAsync({ id: l.id, decision: 'reject' }))}>
                                    বাতিল
                                  </Button>
                                </>
                              )}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(leave.data?.items ?? []).length === 0 && <p className="py-2 text-sm text-muted-foreground">কোনো আবেদন নেই।</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">ছুটির ব্যালেন্স (একাউন্ট্যান্ট)</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {leaveBalances.data &&
                      (Object.entries(leaveBalances.data) as Array<[LeaveType, { entitlement: number; taken: number; remaining: number }]>).map(([type, b]) => (
                        <div key={type} className="flex items-center justify-between rounded border p-2 text-sm">
                          <span>{STATUS_BN[type] ?? type}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {b.taken}/{b.entitlement} · বাকি <span className="font-semibold text-foreground">{b.remaining}</span>
                          </span>
                        </div>
                      ))}
                    <div className="pt-2">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">ছুটির ক্যালেন্ডার</p>
                      {(holidays.data?.items ?? []).map((h) => (
                        <p key={h.id} className="text-sm">
                          {h.date} — {h.nameBn}
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ── Movements ── */}
          {tab === 'movements' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span>বদলি ও পদোন্নতি</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => createMovement.mutateAsync('transfer'))}>
                      ডেমো বদলি
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => createMovement.mutateAsync('promotion'))}>
                      ডেমো পদোন্নতি
                    </Button>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      <Th>ধরন</Th>
                      <Th>কর্মচারী</Th>
                      <Th>পথ</Th>
                      <Th>কার্যকর</Th>
                      <Th>আদেশ নং</Th>
                      <Th>অবস্থা</Th>
                      <Th>কর্ম</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(movements.data?.items ?? []).map((m) => (
                      <tr key={m.id} className="border-b last:border-0">
                        <Td>
                          <Pill label={STATUS_BN[m.kind] ?? m.kind} tone={m.kind === 'promotion' ? 'green' : 'amber'} />
                        </Td>
                        <Td>{m.staffName}</Td>
                        <Td>
                          {m.fromBranchName} → {m.toBranchName}
                          <div className="text-xs text-muted-foreground">
                            {DESIG_BN[m.fromDesignation] ?? m.fromDesignation} → {DESIG_BN[m.toDesignation] ?? m.toDesignation}
                          </div>
                        </Td>
                        <Td>{m.effectiveDate}</Td>
                        <Td><span className="font-mono text-xs">{m.orderNumber ?? '—'}</span></Td>
                        <Td>
                          <Pill label={STATUS_BN[m.status] ?? m.status} tone={m.status === 'effective' ? 'green' : m.status === 'proposed' ? 'amber' : 'red'} />
                        </Td>
                        <Td>
                          {m.status === 'proposed' && (
                            <>
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideMovement.mutateAsync({ id: m.id, decision: 'approve' }))}>
                                অনুমোদন
                              </Button>{' '}
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideMovement.mutateAsync({ id: m.id, decision: 'reject' }))}>
                                বাতিল
                              </Button>
                            </>
                          )}
                          {m.status === 'approved' && (
                            <Button size="sm" disabled={busy} onClick={() => act(() => applyMovement.mutateAsync(m.id))}>
                              কার্যকর করুন
                            </Button>
                          )}
                          {(m.status === 'approved' || m.status === 'effective') && (
                            <a href={`/api/v1/hr/movements/${m.id}/order`} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-xs text-teal-700 underline">
                              <Printer className="mr-0.5 h-3 w-3" /> আদেশ
                            </a>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(movements.data?.items ?? []).length === 0 && (
                  <p className="py-3 text-sm text-muted-foreground">কোনো বদলি/পদোন্নতি নেই — ডেমো বাটন ব্যবহার করুন।</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Payroll & PF (req 5–6) ── */}
          {tab === 'payroll' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>মাসিক পেরোল</span>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => createPayroll.mutateAsync())}>
                      {TODAY().slice(0, 7)} রান তৈরি করুন
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {(payrollRuns.data?.items ?? []).map((run) => (
                    <div key={run.id} className="mb-3 rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold">{run.period}</span>{' '}
                          <Pill label={run.status === 'draft' ? 'খসড়া' : run.status === 'approved' ? 'অনুমোদিত' : 'পরিশোধিত'} tone={run.status === 'draft' ? 'amber' : run.status === 'approved' ? 'green' : 'muted'} />
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <span>মোট: <b className="tabular-nums">{money(run.totalGross)}</b></span>
                          <span>কর্তন: <b className="tabular-nums">{money(run.totalDeduction)}</b></span>
                          <span>নিট: <b className="tabular-nums text-teal-700">{money(run.totalNet)}</b></span>
                        </div>
                        <div className="flex gap-2">
                          {run.status === 'draft' && (
                            <Button size="sm" disabled={busy} onClick={() => act(() => decidePayroll.mutateAsync({ id: run.id, action: 'approve' }))}>
                              অনুমোদন
                            </Button>
                          )}
                          {run.status === 'approved' && (
                            <Button size="sm" disabled={busy} onClick={() => act(() => decidePayroll.mutateAsync({ id: run.id, action: 'pay' }))}>
                              পরিশোধ
                            </Button>
                          )}
                        </div>
                      </div>
                      <table className="mt-2 w-full text-xs">
                        <thead className="border-b text-muted-foreground">
                          <tr>
                            <Th>কোড</Th><Th>নাম</Th><Th right>মোট</Th><Th right>পিএফ</Th><Th right>কর</Th><Th right>নিট</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.lines.map((l) => (
                            <tr key={l.staffId} className="border-b last:border-0">
                              <Td className="font-mono">{l.staffCode}</Td>
                              <Td>{l.staffName}</Td>
                              <Td right>{money(l.gross)}</Td>
                              <Td right>{money(l.deductions.pf_employee ?? '0')}</Td>
                              <Td right>{money(l.deductions.tax ?? '0')}</Td>
                              <Td right className="font-semibold">{money(l.net)}</Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  {(payrollRuns.data?.items ?? []).length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">কোনো পেরোল রান নেই — উপরের বাটনে এই মাসের রান তৈরি করুন।</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><Banknote className="h-4 w-4" /> প্রভিডেন্ট ফান্ড খতিয়ান</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr><Th>মাস</Th><Th>কর্মচারী</Th><Th>ধরন</Th><Th right>নিজস্ব</Th><Th right>প্রতিষ্ঠান</Th><Th right>ব্যালেন্স</Th></tr>
                    </thead>
                    <tbody>
                      {(pfLedger.data?.items ?? []).map((e) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <Td>{e.period ?? '—'}</Td>
                          <Td>{(staff.data?.items ?? []).find((s) => s.id === e.staffId)?.nameBn ?? e.staffId.slice(-4)}</Td>
                          <Td>{e.type === 'contribution' ? 'চাঁদা' : e.type === 'interest' ? 'সুদ' : e.type === 'withdrawal' ? 'উত্তোলন' : 'হস্তান্তর'}</Td>
                          <Td right>{money(e.employeeAmount)}</Td>
                          <Td right>{money(e.employerAmount)}</Td>
                          <Td right className="font-semibold">{money(e.balanceAfter)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(pfLedger.data?.items ?? []).length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">পিএফ লেনদেন নেই — পেরোল পরিশোধ করলে চাঁদা স্বয়ংক্রিয়ভাবে জমা হবে।</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Performance & discipline (req 7–8) ── */}
          {tab === 'performance' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2"><Gauge className="h-4 w-4" /> মাসিক কেপিআই স্কোরকার্ড</span>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => createKpi.mutateAsync())}>ডেমো কেপিআই</Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr><Th>মাস</Th><Th>কর্মচারী</Th><Th right>আদায়</Th><Th right>পিএআর</Th><Th right>নতুন সদস্য</Th><Th right>উপস্থিতি</Th><Th right>স্কোর</Th><Th>গ্রেড</Th></tr>
                    </thead>
                    <tbody>
                      {(kpis.data?.items ?? []).map((k) => (
                        <tr key={k.id} className="border-b last:border-0">
                          <Td>{k.period}</Td>
                          <Td>{k.staffName}</Td>
                          <Td right>{(k.actuals.collection_rate * 100).toFixed(1)}%</Td>
                          <Td right>{(k.actuals.par * 100).toFixed(1)}%</Td>
                          <Td right>{k.actuals.new_members}</Td>
                          <Td right>{(k.actuals.meeting_attendance * 100).toFixed(0)}%</Td>
                          <Td right className="font-semibold">{k.totalScore}</Td>
                          <Td><Pill label={k.grade} tone={k.grade === 'A' ? 'green' : k.grade === 'B' ? 'amber' : 'red'} /></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(kpis.data?.items ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">কোনো কেপিআই নেই।</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>বার্ষিক মূল্যায়ন</span>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => createAppraisal.mutateAsync())}>ডেমো মূল্যায়ন</Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {(appraisals.data?.items ?? []).map((a) => (
                    <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
                      <span>{a.year} — {a.staffName}</span>
                      <span className="tabular-nums">রেটিং <b>{a.rating}</b>/100</span>
                      <Pill label={a.status === 'submitted' ? 'জমা দেওয়া' : a.status === 'reviewed' ? 'রিভিউ সম্পন্ন' : 'খসড়া'} tone={a.status === 'reviewed' ? 'green' : 'amber'} />
                    </div>
                  ))}
                  {(appraisals.data?.items ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">কোনো মূল্যায়ন নেই।</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> শৃঙ্খলা মামলা (এইচআর ও পরিচালক)</span>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => createCase.mutateAsync())}>ডেমো মামলা</Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {(discipline.data?.items ?? []).map((c) => (
                    <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 text-sm last:border-0">
                      <span>{c.staffName} — {c.incidentDate}</span>
                      <Pill
                        label={c.severity === 'written_warning' ? 'লিখিত সতর্কতা' : c.severity === 'verbal_warning' ? 'মৌখিক সতর্কতা' : c.severity === 'show_cause' ? 'কারণ দর্শানো' : c.severity === 'suspension' ? 'বরখাস্ত' : 'অপসারণ'}
                        tone={c.severity === 'termination' ? 'red' : 'amber'}
                      />
                      <Pill label={c.status === 'open' ? 'চলমান' : 'বন্ধ'} tone={c.status === 'open' ? 'amber' : 'muted'} />
                      {c.status === 'open' && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => closeCase.mutateAsync({ id: c.id, outcome: 'সতর্ক করা হলো' }))}>
                          বন্ধ করুন
                        </Button>
                      )}
                    </div>
                  ))}
                  {(discipline.data?.items ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">কোনো শৃঙ্খলা মামলা নেই।</p>}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
