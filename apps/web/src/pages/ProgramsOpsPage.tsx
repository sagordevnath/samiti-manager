/**
 * ── Programs operations page (reqs 5–9) ──────────────────────────────────────
 * Tab 1 বাজেট: expenses vs budget lines, 80% alerts, burn rate, donor rollup.
 * Tab 2 পরিদর্শন: field monitoring visits with checklists, photos, follow-ups.
 * Tab 3 দাতা প্রতিবেদন: quarterly generator + Word/PDF export link.
 * Tab 4 কেস: sensitive case management — masked for staff without clearance,
 *   access-log viewer (case-worker only).
 * Tab 5 তহবিল: grants and PKSF/bank borrowing tracker with repayment schedule.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Banknote, ClipboardCheck, FileText, ShieldAlert } from 'lucide-react';
import type { CaseStatus, CaseType, FundingKind, ProgramSector } from '@samity/shared';
import { CASE_SEVERITY_LABELS_BN, CASE_STATUS_LABELS_BN, CASE_TYPE_LABELS_BN, FUNDING_KIND_LABELS_BN } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const TABS = ['budget', 'visits', 'reports', 'cases', 'funding'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  budget: 'বাজেট ও ব্যয়',
  visits: 'মাঠ পরিদর্শন',
  reports: 'দাতা প্রতিবেদন',
  cases: 'সংবেদনশীল কেস',
  funding: 'তহবিল ও ঋণ',
};

const ALERT_TONE: Record<'ok' | 'warning' | 'critical', string> = {
  ok: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  critical: 'bg-red-100 text-red-700',
};

const CASE_STATUS_TONE: Record<CaseStatus, string> = {
  open: 'bg-amber-100 text-amber-800',
  in_progress: 'bg-teal-100 text-teal-800',
  referred: 'bg-sky-100 text-sky-800',
  closed: 'bg-muted text-muted-foreground',
};

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-2 py-1.5 text-xs font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-2 py-1.5 ${right ? 'text-right tabular-nums' : ''} ${className ?? ''}`}>{children}</td>;
}
function Pill({ label, tone }: { label: string; tone: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs ${tone}`}>{label}</span>;
}

interface ProjectLite {
  id: string;
  code: string;
  nameBn: string;
  donor: string;
  budgetTotal: string;
  status: string;
}

interface LineStatus {
  lineItem: string;
  budgeted: string;
  spent: string;
  remaining: string;
  utilizationPct: number;
  alert: 'ok' | 'warning' | 'critical';
}
interface BudgetStatus {
  monitor: {
    lines: LineStatus[];
    budgetTotal: string;
    spentTotal: string;
    remainingTotal: string;
    utilizationPct: number;
    alert: 'ok' | 'warning' | 'critical';
    unbudgetedSpent: string;
  };
  burn: { burnPct: number; expectedPct: number; variancePct: number; status: string; spent: string };
}
interface AlertRow {
  projectId: string;
  projectCode: string;
  lineItem: string;
  donor: string;
  budgeted: string;
  spent: string;
  utilizationPct: number;
  alert: 'warning' | 'critical';
}
interface DonorRow {
  donor: string;
  projects: number;
  budgetTotal: string;
  spentTotal: string;
  utilizationPct: number;
  alert: 'ok' | 'warning' | 'critical';
  projectCodes: string[];
}
interface ExpenseRow {
  id: string;
  projectId: string;
  expenseDate: string;
  budgetLine: string;
  amount: string;
  voucherNo: string;
  recordedBy: string;
}
interface VisitRow {
  id: string;
  projectId: string;
  visitDate: string;
  officerName: string;
  village: string;
  beneficiariesMet: number;
  checklist: { item: string; passed: boolean; note: string }[];
  photos: { id: string; labelBn: string; path: string }[];
  findings: string;
  followUps: { action: string; owner: string; dueDate: string; done: boolean }[];
  scorePct: number;
  overdueFollowUps: number;
}
interface StoredReport {
  id: string;
  projectId: string;
  periodStart: string;
  periodEnd: string;
  generatedBy: string;
  report: {
    projectCode: string;
    indicators: { indicatorCode: string | null; statement: string; achieved: string; target: string; progressPct: number; evidenceCount: number }[];
    financialSummary: { budgetTotal: string; spentCumulative: string; spentPeriod: string; utilizationPct: number };
    delivery: { services: number; activitiesDone: number; beneficiariesEnrolled: number; visits: number; visitScorePct: number };
  };
}
interface CaseRow {
  id: string;
  caseNo: string;
  type: CaseType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: CaseStatus;
  beneficiaryName: string | null;
  restrictedDetails: string | null;
  openedAt: string;
  closedAt: string | null;
}
interface FundingRow {
  id: string;
  code: string;
  sourceName: string;
  kind: FundingKind;
  principal: string;
  interestRatePct: string;
  tenureMonths: number;
  repaymentStart: string;
  summary: { installmentCount: number; totalInterest: string; totalPayable: string; monthlyEmi: string | null };
}
interface FundingDetail extends FundingRow {
  schedule: { installmentNo: number; dueDate: string; principal: string; interest: string; total: string; balance: string }[];
}

const TODAY = () => new Date().toISOString().slice(0, 10);

export function ProgramsOpsPage() {
  const money = useMoneyFormatter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('budget');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['pops'] });
  const act = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    fn()
      .catch((e: Error) => setError(e.message))
      .finally(() => setTimeout(() => setBusy(false), 400));
  };

  const projects = useQuery({ queryKey: ['pops', 'projects'], queryFn: () => api.get<{ items: ProjectLite[] }>('/programs/projects') });
  const expenses = useQuery({ queryKey: ['pops', 'expenses'], queryFn: () => api.get<{ items: ExpenseRow[] }>('/programs/expenses') });
  const alerts = useQuery({ queryKey: ['pops', 'alerts'], queryFn: () => api.get<{ items: AlertRow[] }>('/programs/budget/alerts') });
  const donorRows = useQuery({ queryKey: ['pops', 'donorRows'], queryFn: () => api.get<{ items: DonorRow[] }>('/programs/budget/donor-utilization') });
  const visits = useQuery({ queryKey: ['pops', 'visits'], queryFn: () => api.get<{ items: VisitRow[] }>('/programs/visits') });
  const reports = useQuery({ queryKey: ['pops', 'reports'], queryFn: () => api.get<{ items: StoredReport[] }>('/programs/donor-reports') });
  const cases = useQuery({ queryKey: ['pops', 'cases'], queryFn: () => api.get<{ items: CaseRow[]; restrictedUnlocked: boolean }>('/programs/cases') });
  const funding = useQuery({ queryKey: ['pops', 'funding'], queryFn: () => api.get<{ items: FundingRow[] }>('/programs/funding') });

  const [budgetProjectId, setBudgetProjectId] = useState('');
  const budgetStatus = useQuery({
    queryKey: ['pops', 'budgetStatus', budgetProjectId],
    enabled: !!budgetProjectId,
    queryFn: () => api.get<BudgetStatus>(`/programs/projects/${budgetProjectId}/budget-status`),
  });

  const [caseDetailId, setCaseDetailId] = useState('');
  const caseDetail = useQuery({
    queryKey: ['pops', 'case', caseDetailId],
    enabled: !!caseDetailId,
    queryFn: () => api.get<{ case: CaseRow; restrictedUnlocked: boolean }>(`/programs/cases/${caseDetailId}`),
  });
  const accessLog = useQuery({
    queryKey: ['pops', 'caseLog', caseDetailId],
    enabled: !!caseDetailId && !!caseDetail.data?.restrictedUnlocked,
    queryFn: () => api.get<{ items: { id: string; userName: string; action: string; at: string }[] }>(`/programs/cases/${caseDetailId}/access-log`),
  });

  const [fundingDetailId, setFundingDetailId] = useState('');
  const fundingDetail = useQuery({
    queryKey: ['pops', 'funding', fundingDetailId],
    enabled: !!fundingDetailId,
    queryFn: () => api.get<FundingDetail>(`/programs/funding/${fundingDetailId}`),
  });

  const loading = [projects, expenses, alerts, donorRows, visits, reports, cases, funding].some((q) => q.isPending);
  const projectOf = (id: string) => projects.data?.items.find((p) => p.id === id);
  const firstProjectId = projects.data?.items[0]?.id ?? '';

  /* ── Mutations ── */
  const addExpense = useMutation({
    mutationFn: () =>
      api.post('/programs/expenses', {
        projectId: budgetProjectId || firstProjectId,
        expenseDate: TODAY(),
        budgetLine: 'প্রশিক্ষণ ব্যয়',
        amount: '50000',
        voucherNo: `JV-${Date.now().toString().slice(-4)}`,
        description: 'ডেমো ব্যয় ভুক্তি',
      }),
    onSuccess: invalidate,
  });
  const addVisit = useMutation({
    mutationFn: () =>
      api.post('/programs/visits', {
        projectId: firstProjectId,
        visitDate: TODAY(),
        officerId: 'off-1',
        officerName: 'রফিক ইসলাম',
        village: 'গাজীপুর',
        beneficiariesMet: 16,
        checklist: [
          { item: 'সভা নিয়মিত হচ্ছে', passed: true, note: '' },
          { item: 'কিট সঠিকভাবে বিতরণ', passed: true, note: '' },
          { item: 'ঝুঁকিপূর্ণ শিশু শনাক্তকরণ', passed: false, note: 'অনুসরণ প্রয়োজন' },
          { item: 'নথি হালনাগাদ', passed: true, note: '' },
        ],
        photos: [{ id: `ph-${Date.now()}`, labelBn: 'সভার ছবি', path: 'photos/demo.jpg' }],
        findings: 'সামগ্রিক অগ্রগতি ভালো',
        followUps: [{ action: 'ঝুঁকি তালিকা হালনাগাদ', owner: 'ম্যানেজার', dueDate: '2026-10-15', done: false }],
      }),
    onSuccess: invalidate,
  });
  const [reportPeriod, setReportPeriod] = useState({ start: '2026-04-01', end: '2026-06-30' });
  const generateReport = useMutation({
    mutationFn: () => api.post('/programs/donor-reports', { projectId: firstProjectId, periodStart: reportPeriod.start, periodEnd: reportPeriod.end }),
    onSuccess: invalidate,
  });
  const openCase = useMutation({
    mutationFn: () =>
      api.post('/programs/cases', {
        type: 'child_protection',
        severity: 'high',
        beneficiaryId: null,
        beneficiaryName: 'সংবেদনশীল উপকারভোগী',
        restrictedDetails: 'গোপনীয় বিবরণ — শুধু কেস ওয়ার্কার পড়বেন',
        consentGiven: true,
        assignedWorkerId: 'worker-1',
        assignedWorkerName: 'কেস ওয়ার্কার',
      }),
    onSuccess: invalidate,
  });
  const decideCase = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.post(`/programs/cases/${id}/decision`, { status }),
    onSuccess: invalidate,
  });
  const [fundingForm, setFundingForm] = useState({ sourceName: 'PKSF ঋণ লাইন', kind: 'pksf' as FundingKind, principal: '1200000', rate: '6', months: '24' });
  const addFunding = useMutation({
    mutationFn: () =>
      api.post('/programs/funding', {
        sourceName: fundingForm.sourceName,
        kind: fundingForm.kind,
        principal: fundingForm.principal,
        interestRatePct: fundingForm.rate,
        tenureMonths: Number(fundingForm.months) || 12,
        disbursementDate: TODAY(),
        repaymentStart: '2026-12-01',
        purposeProjectId: null,
        lenderContact: '',
      }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">প্রোগ্রাম ব্যবস্থাপনা (বাজেট · দাতা · কেস · তহবিল)</h1>
        <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
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

      {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ── Tab 1: budget monitoring ── */}
          {tab === 'budget' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> বাজেট নিরীক্ষা (৮০% সতর্কতা)</span>
                    <div className="flex items-end gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="bs-project">প্রকল্প</Label>
                        <select
                          id="bs-project"
                          className="h-9 w-56 rounded-md border bg-background px-2 text-sm"
                          value={budgetProjectId}
                          onChange={(e) => setBudgetProjectId(e.target.value)}
                        >
                          <option value="">— নির্বাচন করুন —</option>
                          {(projects.data?.items ?? []).map((p) => (
                            <option key={p.id} value={p.id}>{p.code} — {p.nameBn}</option>
                          ))}
                        </select>
                      </div>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => addExpense.mutateAsync())}>
                        +৫০,০০০ ব্যয় (প্রশিক্ষণ)
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {budgetStatus.data ? (
                    <div className="space-y-3">
                      <div className="grid gap-2 text-sm sm:grid-cols-4">
                        <div className="rounded border p-2">বাজেট: <b className="tabular-nums">{money(budgetStatus.data.monitor.budgetTotal)}</b></div>
                        <div className="rounded border p-2">ব্যয়: <b className="tabular-nums">{money(budgetStatus.data.monitor.spentTotal)}</b></div>
                        <div className="rounded border p-2">অবশিষ্ট: <b className="tabular-nums">{money(budgetStatus.data.monitor.remainingTotal)}</b></div>
                        <div className="rounded border p-2">
                          ব্যবহার:{' '}
                          <Pill label={`${budgetStatus.data.monitor.utilizationPct}%`} tone={ALERT_TONE[budgetStatus.data.monitor.alert]} />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        বার্ন রেট: ব্যয় {budgetStatus.data.burn.burnPct}% বনাম সময় অতিবাহিত {budgetStatus.data.burn.expectedPct}% —{' '}
                        {budgetStatus.data.burn.status === 'overspent' ? 'বাজেটের আগে ব্যয় (ঝুঁকি)' : budgetStatus.data.burn.status === 'underspent' ? 'ব্যয় পিছিয়ে' : 'ছন্দে'}
                        {Number(budgetStatus.data.monitor.unbudgetedSpent) > 0 && ` · বাজেট-বহির্ভূত ব্যয়: ${money(budgetStatus.data.monitor.unbudgetedSpent)}`}
                      </p>
                      <table className="w-full text-sm">
                        <thead className="border-b text-muted-foreground">
                          <tr><Th>বাজেট লাইন</Th><Th right>বাজেট</Th><Th right>ব্যয়</Th><Th right>অবশিষ্ট</Th><Th right>ব্যবহার</Th><Th>সতর্কতা</Th></tr>
                        </thead>
                        <tbody>
                          {budgetStatus.data.monitor.lines.map((l) => (
                            <tr key={l.lineItem} className="border-b last:border-0">
                              <Td>{l.lineItem}</Td>
                              <Td right>{money(l.budgeted)}</Td>
                              <Td right>{money(l.spent)}</Td>
                              <Td right>{money(l.remaining)}</Td>
                              <Td right>{l.utilizationPct}%</Td>
                              <Td><Pill label={l.alert === 'ok' ? 'ঠিক আছে' : l.alert === 'warning' ? '৮০% সতর্কতা' : 'সংকট'} tone={ALERT_TONE[l.alert]} /></Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">বিস্তারিত দেখতে প্রকল্প নির্বাচন করুন।</p>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">সতর্কতা তালিকা (≥৮০% লাইন)</CardTitle></CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b text-muted-foreground">
                        <tr><Th>প্রকল্প</Th><Th>লাইন</Th><Th>দাতা</Th><Th right>ব্যবহার</Th><Th>স্তর</Th></tr>
                      </thead>
                      <tbody>
                        {(alerts.data?.items ?? []).map((a, i) => (
                          <tr key={`${a.projectId}-${a.lineItem}-${i}`} className="border-b last:border-0">
                            <Td className="text-xs">{a.projectCode}</Td>
                            <Td>{a.lineItem}</Td>
                            <Td className="text-xs">{a.donor}</Td>
                            <Td right>{a.utilizationPct}%</Td>
                            <Td><Pill label={a.alert === 'critical' ? 'সংকট' : 'সতর্কতা'} tone={ALERT_TONE[a.alert]} /></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(alerts.data?.items ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">কোনো সতর্কতা নেই।</p>}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">দাতা-ভিত্তিক তহবিল ব্যবহার</CardTitle></CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b text-muted-foreground">
                        <tr><Th>দাতা</Th><Th right>প্রকল্প</Th><Th right>বাজেট</Th><Th right>ব্যয়</Th><Th right>ব্যবহার</Th></tr>
                      </thead>
                      <tbody>
                        {(donorRows.data?.items ?? []).map((d) => (
                          <tr key={d.donor} className="border-b last:border-0">
                            <Td>{d.donor}</Td>
                            <Td right>{d.projects}</Td>
                            <Td right>{money(d.budgetTotal)}</Td>
                            <Td right>{money(d.spentTotal)}</Td>
                            <Td right><Pill label={`${d.utilizationPct}%`} tone={ALERT_TONE[d.alert]} /></Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {(donorRows.data?.items ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">তথ্য নেই।</p>}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">ব্যয় ভুক্তি ({expenses.data?.items.length ?? 0})</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr><Th>তারিখ</Th><Th>প্রকল্প</Th><Th>লাইন</Th><Th right>পরিমাণ</Th><Th>ভাউচার</Th></tr>
                    </thead>
                    <tbody>
                      {(expenses.data?.items ?? []).map((e) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <Td className="whitespace-nowrap text-xs">{e.expenseDate}</Td>
                          <Td className="text-xs">{projectOf(e.projectId)?.code ?? '—'}</Td>
                          <Td>{e.budgetLine}</Td>
                          <Td right>{money(e.amount)}</Td>
                          <Td className="font-mono text-xs">{e.voucherNo || '—'}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(expenses.data?.items ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">কোনো ব্যয় ভুক্তি নেই।</p>}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Tab 2: field visits ── */}
          {tab === 'visits' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>মাঠ পরিদর্শন (চেকলিস্ট · ছবি · অনুসরণ)</span>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => addVisit.mutateAsync())}>নমুনা পরিদর্শন যোগ</Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(visits.data?.items ?? []).map((v) => (
                    <div key={v.id} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-medium">
                          {v.visitDate} · {projectOf(v.projectId)?.code ?? '—'} · {v.village || '—'} · {v.officerName}
                        </div>
                        <div className="flex items-center gap-2">
                          <Pill label={`স্কোর ${v.scorePct}%`} tone={v.scorePct >= 80 ? ALERT_TONE.ok : v.scorePct >= 50 ? ALERT_TONE.warning : ALERT_TONE.critical} />
                          {v.overdueFollowUps > 0 && <Pill label={`${v.overdueFollowUps} বকেয়া অনুসরণ`} tone={ALERT_TONE.critical} />}
                          <Pill label={`${v.checklist.filter((c) => c.passed).length}/${v.checklist.length} পাস`} tone={ALERT_TONE.ok} />
                        </div>
                      </div>
                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                        <div>
                          <p className="font-semibold">চেকলিস্ট</p>
                          <ul className="mt-1 space-y-0.5">
                            {v.checklist.map((c, i) => (
                              <li key={i}>{c.passed ? '✅' : '❌'} {c.item}{c.note ? ` — ${c.note}` : ''}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="font-semibold">ছবি ({v.photos.length})</p>
                          <ul className="mt-1 space-y-0.5">
                            {v.photos.map((p) => (
                              <li key={p.id}>📷 {p.labelBn} <span className="font-mono text-muted-foreground">{p.path}</span></li>
                            ))}
                          </ul>
                          <p className="mt-2 font-semibold">অনুসরণ</p>
                          <ul className="mt-1 space-y-0.5">
                            {v.followUps.map((f, i) => (
                              <li key={i}>{f.done ? '✔' : '⏳'} {f.action} — {f.owner} (due {f.dueDate})</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      {v.findings && <p className="mt-2 rounded bg-muted/50 p-2 text-xs">মন্তব্য: {v.findings}</p>}
                    </div>
                  ))}
                  {(visits.data?.items ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">কোনো পরিদর্শন নেই।</p>}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Tab 3: donor reports ── */}
          {tab === 'reports' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> প্রান্তিক দাতা প্রতিবেদন</span>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="rp-start">শুরু</Label>
                        <Input id="rp-start" type="date" value={reportPeriod.start} onChange={(e) => setReportPeriod((f) => ({ ...f, start: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="rp-end">শেষ</Label>
                        <Input id="rp-end" type="date" value={reportPeriod.end} onChange={(e) => setReportPeriod((f) => ({ ...f, end: e.target.value }))} />
                      </div>
                      <Button size="sm" disabled={busy} onClick={() => act(() => generateReport.mutateAsync())}>প্রতিবেদন তৈরি</Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">প্রথম প্রকল্পের জন্য তৈরি হয়। সূচক তালিকা + আর্থিক টেবিল + বিবরণী সহ Word/PDF এক্সপোর্ট লিংক পাওয়া যায়।</p>
                  {(reports.data?.items ?? []).map((r) => (
                    <div key={r.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium">
                          {r.report.projectCode} · {r.periodStart} → {r.periodEnd}
                        </div>
                        <a
                          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                          href={`/api/v1/programs/donor-reports/${r.id}/export`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          📄 Word / PDF
                        </a>
                      </div>
                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-4">
                        <div className="rounded border p-2">বাজেট: {money(r.report.financialSummary.budgetTotal)}</div>
                        <div className="rounded border p-2">ব্যয়: {money(r.report.financialSummary.spentCumulative)}</div>
                        <div className="rounded border p-2">ব্যবহার: {r.report.financialSummary.utilizationPct}%</div>
                        <div className="rounded border p-2">সেবা {r.report.delivery.services} · কার্যক্রম {r.report.delivery.activitiesDone} · পরিদর্শন {r.report.delivery.visits}</div>
                      </div>
                      {r.report.indicators.length > 0 && (
                        <table className="mt-2 w-full text-xs">
                          <thead className="border-b text-muted-foreground">
                            <tr><Th>সূচক</Th><Th>বিবরণ</Th><Th right>লক্ষ্য</Th><Th right>অর্জিত</Th><Th right>অগ্রগতি</Th></tr>
                          </thead>
                          <tbody>
                            {r.report.indicators.map((ind, i) => (
                              <tr key={i}>
                                <Td className="font-mono">{ind.indicatorCode ?? '—'}</Td>
                                <Td>{ind.statement}</Td>
                                <Td right>{ind.target}</Td>
                                <Td right>{ind.achieved}</Td>
                                <Td right>{ind.progressPct}%</Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                  {(reports.data?.items ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">কোনো প্রতিবেদন নেই — উপরে তৈরি করুন।</p>}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Tab 4: sensitive cases ── */}
          {tab === 'cases' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> সংবেদনশীল কেস ব্যবস্থাপনা</span>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => openCase.mutateAsync())}>নমুনা কেস খুলুন</Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    গোপনীয়তা: কেস-ওয়ার্কার ও প্রশাসন ছাড়া কেউ নাম বা বিবরণ দেখতে পারেন না (মাস্কড সারি)। প্রতিটি প্রবেশ লগ হয়; লগ কেউ মুছতে পারে না।
                    কেস-তথ্য দাতা প্রতিবেদনে কখনো যায় না।
                  </p>
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr><Th>কেস নং</Th><Th>ধরন</Th><Th>তীব্রতা</Th><Th>অবস্থা</Th><Th>উপকারভোগী</Th><Th>খোলা</Th><Th>কর্ম</Th></tr>
                    </thead>
                    <tbody>
                      {(cases.data?.items ?? []).map((c) => (
                        <tr key={c.id} className="border-b last:border-0">
                          <Td><span className="font-mono text-xs">{c.caseNo}</span></Td>
                          <Td>{CASE_TYPE_LABELS_BN[c.type]}</Td>
                          <Td>{CASE_SEVERITY_LABELS_BN[c.severity]}</Td>
                          <Td><Pill label={CASE_STATUS_LABELS_BN[c.status]} tone={CASE_STATUS_TONE[c.status]} /></Td>
                          <Td>{c.beneficiaryName ?? <span className="text-xs italic text-muted-foreground">মাস্কড</span>}</Td>
                          <Td className="text-xs">{c.openedAt}</Td>
                          <Td>
                            <div className="flex flex-wrap gap-1">
                              <Button size="sm" variant="outline" onClick={() => { setCaseDetailId(c.id); }}>খুলুন</Button>
                              {c.status !== 'closed' && (
                                <>
                                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideCase.mutateAsync({ id: c.id, status: 'in_progress' }))}>চলমান</Button>
                                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideCase.mutateAsync({ id: c.id, status: 'closed' }))}>বন্ধ</Button>
                                </>
                              )}
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(cases.data?.items ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">কোনো কেস নেই।</p>}
                </CardContent>
              </Card>

              {caseDetail.data && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                      <span>{caseDetail.data.case.caseNo} — {CASE_TYPE_LABELS_BN[caseDetail.data.case.type]}</span>
                      <Pill
                        label={caseDetail.data.restrictedUnlocked ? 'কেস-ওয়ার্কার প্রবেশাধিকার' : 'মাস্কড (প্রবেশাধিকার নেই)'}
                        tone={caseDetail.data.restrictedUnlocked ? ALERT_TONE.warning : ALERT_TONE.ok}
                      />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded border p-2">উপকারভোগী: {caseDetail.data.case.beneficiaryName ?? '— মাস্কড —'}</div>
                      <div className="rounded border p-2">অবস্থা: {CASE_STATUS_LABELS_BN[caseDetail.data.case.status]}</div>
                    </div>
                    <div className="rounded border p-2">
                      {caseDetail.data.case.restrictedDetails ?? (
                        <span className="text-xs italic text-muted-foreground">বিবরণ মাস্কড — আপনার প্রবেশাধিকার নেই। এই দেখাও লগ হয়েছে।</span>
                      )}
                    </div>
                    {caseDetail.data.restrictedUnlocked && accessLog.data && (
                      <div>
                        <p className="text-xs font-semibold">অ্যাক্সেস লগ ({accessLog.data.items.length})</p>
                        <table className="mt-1 w-full text-xs">
                          <thead className="border-b text-muted-foreground">
                            <tr><Th>ব্যবহারকারী</Th><Th>কার্য</Th><Th>সময়</Th></tr>
                          </thead>
                          <tbody>
                            {accessLog.data.items.map((l) => (
                              <tr key={l.id}>
                                <Td>{l.userName}</Td>
                                <Td>{l.action}</Td>
                                <Td className="text-xs">{new Date(l.at).toLocaleString('bn-BD')}</Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ── Tab 5: funding tracker ── */}
          {tab === 'funding' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2"><Banknote className="h-4 w-4" /> অনুদান ও PKSF/ব্যাংক ঋণ ট্র্যাকার</span>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => addFunding.mutateAsync())}>নমুনা তহবিল যোগ</Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="space-y-1">
                      <Label htmlFor="fd-name">উৎস</Label>
                      <Input id="fd-name" value={fundingForm.sourceName} onChange={(e) => setFundingForm((f) => ({ ...f, sourceName: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="fd-kind">ধরন</Label>
                      <select id="fd-kind" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={fundingForm.kind} onChange={(e) => setFundingForm((f) => ({ ...f, kind: e.target.value as FundingKind }))}>
                        {(Object.keys(FUNDING_KIND_LABELS_BN) as FundingKind[]).map((k) => (
                          <option key={k} value={k}>{FUNDING_KIND_LABELS_BN[k]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="fd-principal">মূলধন (৳)</Label>
                      <Input id="fd-principal" type="number" min="0" value={fundingForm.principal} onChange={(e) => setFundingForm((f) => ({ ...f, principal: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="fd-rate">সুদ (%)</Label>
                      <Input id="fd-rate" type="number" min="0" step="0.01" value={fundingForm.rate} onChange={(e) => setFundingForm((f) => ({ ...f, rate: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="fd-months">মেয়াদ (মাস)</Label>
                      <Input id="fd-months" type="number" min="1" value={fundingForm.months} onChange={(e) => setFundingForm((f) => ({ ...f, months: e.target.value }))} />
                    </div>
                  </div>
                  <Button disabled={busy} onClick={() => act(() => addFunding.mutateAsync())}>তহবিল যোগ করুন</Button>

                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr><Th>কোড</Th><Th>উৎস</Th><Th>ধরন</Th><Th right>মূলধন</Th><Th right>সুদ</Th><Th right>কিস্তি</Th><Th right>মোট পরিশোধ</Th><Th>সময়সূচি</Th></tr>
                    </thead>
                    <tbody>
                      {(funding.data?.items ?? []).map((f) => (
                        <tr key={f.id} className="border-b last:border-0">
                          <Td><span className="font-mono text-xs">{f.code}</span></Td>
                          <Td>{f.sourceName}</Td>
                          <Td className="text-xs">{FUNDING_KIND_LABELS_BN[f.kind]}</Td>
                          <Td right>{money(f.principal)}</Td>
                          <Td right>{f.interestRatePct}%</Td>
                          <Td right>{f.summary.installmentCount}</Td>
                          <Td right>{money(f.summary.totalPayable)}</Td>
                          <Td><Button size="sm" variant="outline" onClick={() => setFundingDetailId(f.id)}>খুলুন</Button></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(funding.data?.items ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">কোনো তহবিল উৎস নেই।</p>}
                </CardContent>
              </Card>

              {fundingDetail.data && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">
                      পরিশোধ সময়সূচি — {fundingDetail.data.code} {fundingDetail.data.sourceName} ({FUNDING_KIND_LABELS_BN[fundingDetail.data.kind]})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <p className="mb-2 text-xs text-muted-foreground">
                      মাসিক কিস্তি: <b className="tabular-nums">{money(fundingDetail.data.summary.monthlyEmi ?? '0')}</b> · মোট সুদ:{' '}
                      <b className="tabular-nums">{money(fundingDetail.data.summary.totalInterest)}</b>
                    </p>
                    <table className="w-full text-sm">
                      <thead className="border-b text-muted-foreground">
                        <tr><Th right>কিস্তি</Th><Th>নির্ধারিত</Th><Th right>মূল</Th><Th right>সুদ</Th><Th right>মোট</Th><Th right>ব্যালান্স</Th></tr>
                      </thead>
                      <tbody>
                        {fundingDetail.data.schedule.map((r) => (
                          <tr key={r.installmentNo} className="border-b last:border-0">
                            <Td right>{r.installmentNo}</Td>
                            <Td className="whitespace-nowrap text-xs">{r.dueDate}</Td>
                            <Td right>{money(r.principal)}</Td>
                            <Td right>{money(r.interest)}</Td>
                            <Td right>{money(r.total)}</Td>
                            <Td right>{money(r.balance)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
