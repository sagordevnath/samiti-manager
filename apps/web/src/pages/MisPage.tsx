/**
 * ── Reports, MIS & compliance page ───────────────────────────────────────────
 * Tab 1 ড্যাশবোর্ড: role-based dashboards (field officer → board) with a demo
 *   role switcher; each role sees its own KPIs.
 * Tab 2 রিপোর্ট: the 11 standard reports rendered as tables with totals.
 * Tab 3 অনুপাত: the six financial ratios with benchmarks.
 * Tab 4 নিয়ন্ত্রক: template designer (formula rows), return generation,
 *   submission and the verification-against-circular flag.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, FileSpreadsheet, Landmark, Percent } from 'lucide-react';
import type { StandardReportKind } from '@samity/shared';
import { STANDARD_REPORT_LABELS_BN, STANDARD_REPORTS, DASHBOARD_ROLE_LABELS_BN, type DashboardRole } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const TABS = ['dashboard', 'reports', 'ratios', 'regulatory'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'ড্যাশবোর্ড',
  reports: 'স্ট্যান্ডার্ড রিপোর্ট',
  ratios: 'আর্থিক অনুপাত',
  regulatory: 'নিয়ন্ত্রক রিটার্ন',
};

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-2 py-1.5 text-xs font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-2 py-1.5 ${right ? 'text-right tabular-nums' : ''} ${className ?? ''}`}>{children}</td>;
}
function Pill({ label, tone = 'bg-muted text-muted-foreground' }: { label: string; tone?: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs ${tone}`}>{label}</span>;
}

interface KpiCardT {
  key: string;
  labelBn: string;
  value: string;
  hintBn?: string;
  tone?: string;
}
interface DashT {
  role: string;
  date: string;
  // head office
  portfolio?: { outstanding: string; activeLoans: number; borrowers: number; avgLoanSize: string; disbursementYtd: string; collectionYtd: string };
  growth?: { memberGrowthPct: number; portfolioGrowthPct: number; savingsGrowthPct: number };
  ratios?: Record<string, { formatted: string }>;
  savings?: { totalSavings: string; membersWithSavings: number };
  branchesRanked?: { rank: number; branchName: string; members: number; outstanding: string; collectionEffPct: number; par30Pct: number; score: number }[];
  // area/zone
  areaName?: string;
  zoneName?: string;
  totals?: { members: number; outstanding: string; par30Pct: number; avgEfficiencyPct: number };
  branches?: { rank: number; branchName: string; members: number; outstanding: string; collectionEffPct: number; par30Pct: number; score: number }[];
  // branch
  branchName?: string;
  collection?: { dueThisMonth: string; collectedThisMonth: string; efficiencyPct: number; onTimeRate: number };
  par?: { outstandingTotal: string; atRisk: string; par1: number; par30: number; par90: number; loansTotal: number; loansAtRisk: number } | null;
  cash?: { opening: string; collections: string; disbursements: string; closing: string; handoverPending: boolean };
  officers?: { officerName: string; dueAmount: string; collectedAmount: string; efficiencyPct: number }[];
  // officer
  officerName?: string;
  todaySheet?: { samityName: string; meetingDate: string; dueInstallments: number; collectedInstallments: number; dueAmount: string; collectedAmount: string; savingsDue: string; savingsCollected: string }[];
  /** Officer day summary, or the board's KPI card list. */
  summary?: { dueAmount: string; collectedAmount: string; collectionPct: number; membersDue: number } | KpiCardT[];
  targets?: { metric: string; labelBn: string; target: number; actual: number; achievementPct: number }[];
  overdueClients?: { memberName: string; overdueAmount: string; daysPastDue: number }[];
  // board
  headline?: string;
}

interface ReportT {
  meta: { kind: string; titleBn: string; titleEn: string; periodStart: string | null; periodEnd: string; rowCount: number };
  columns: { key: string; labelBn: string; type: string }[];
  rows: Record<string, string | number>[];
  totals: Record<string, string | number>;
}

interface RatioT {
  key: string;
  labelBn: string;
  value: number;
  formatted: string;
  benchmark?: number;
  unit: string;
}

interface TemplateT {
  id: string;
  name: string;
  regulator: 'MRA' | 'PKSF' | 'OTHER';
  circularRef: string;
  needsVerification: boolean;
  rows: { code: string; labelBn: string; formula: string; kind: string; unit: string; bold: boolean }[];
}
interface ReturnT {
  id: string;
  templateName: string;
  regulator: string;
  circularRef: string;
  needsVerification: boolean;
  periodStart: string;
  periodEnd: string;
  rows: { code: string; labelBn: string; kind: string; unit: string; value: string | null; bold: boolean }[];
  missingValues: string[];
  submittedAt: string | null;
}

const DEMO_ROLES: DashboardRole[] = ['field_officer', 'branch_manager', 'area_zone', 'head_office', 'board'];
const ROLE_QUERY: Partial<Record<DashboardRole, string>> = {
  field_officer: 'account_officer',
  branch_manager: 'branch_manager',
  area_zone: 'area_manager',
  head_office: 'super_admin',
  board: 'member',
};

export function MisPage() {
  const money = useMoneyFormatter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const act = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    fn()
      .catch((e: Error) => setError(e.message))
      .finally(() => setTimeout(() => setBusy(false), 400));
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ['mis'] });

  const [dashRole, setDashRole] = useState<DashboardRole>('head_office');
  const dashboard = useQuery({
    queryKey: ['mis', 'dash', dashRole],
    queryFn: () => api.get<DashT>(`/mis/dashboard?role=${ROLE_QUERY[dashRole] ?? 'super_admin'}`),
  });

  const [reportKind, setReportKind] = useState<StandardReportKind>('outstanding_loans');
  const [reportPeriod, setReportPeriod] = useState({ start: '2026-09-01', end: '2026-09-30' });
  const report = useQuery({
    queryKey: ['mis', 'report', reportKind, reportPeriod.start, reportPeriod.end],
    queryFn: () => {
      const p = new URLSearchParams();
      if (reportPeriod.start) p.set('start', reportPeriod.start);
      if (reportPeriod.end) p.set('end', reportPeriod.end);
      return api.get<ReportT>(`/mis/reports/${reportKind}?${p.toString()}`);
    },
  });

  const ratios = useQuery({ queryKey: ['mis', 'ratios'], queryFn: () => api.get<{ items: RatioT[] }>('/mis/ratios') });

  const templates = useQuery({ queryKey: ['mis', 'templates'], queryFn: () => api.get<{ items: TemplateT[] }>('/mis/templates') });
  const returns = useQuery({ queryKey: ['mis', 'returns'], queryFn: () => api.get<{ items: ReturnT[] }>('/mis/returns') });
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [returnPeriod, setReturnPeriod] = useState({ start: '2026-07-01', end: '2026-09-30' });

  const generateReturn = useMutation({
    mutationFn: () => api.post<{ id: string }>('/mis/returns', { templateId: selectedTemplate, periodStart: returnPeriod.start, periodEnd: returnPeriod.end }),
    onSuccess: invalidate,
  });
  const submitReturn = useMutation({
    mutationFn: (id: string) => api.post(`/mis/returns/${id}/submit`),
    onSuccess: invalidate,
  });
  const verifyTemplate = useMutation({
    mutationFn: (id: string) => api.post(`/mis/templates/${id}/verify`),
    onSuccess: invalidate,
  });
  const createTemplate = useMutation({
    mutationFn: () =>
      api.post('/mis/templates', {
        name: 'কাস্টম রিটার্ন (ডিজাইনার)',
        regulator: 'OTHER',
        section: '',
        circularRef: 'internal — verify before filing',
        needsVerification: true,
        rows: [
          { code: 'S1', labelBn: 'বকেয়া ঋণ (মূল)', formula: '=outstanding', kind: 'value', unit: 'bdt', bold: true },
          { code: 'S2', labelBn: 'মোট সঞ্চয়', formula: '=total_savings', kind: 'value', unit: 'bdt', bold: false },
          { code: 'S3', labelBn: 'ঋণগ্রহীতা', formula: '=borrowers', kind: 'value', unit: 'count', bold: false },
          { code: 'S4', labelBn: 'শাখা প্রতি বকেয়া', formula: '=outstanding/branches', kind: 'value', unit: 'bdt', bold: false },
        ],
      }),
    onSuccess: invalidate,
  });

  const loading = [dashboard, ratios, templates, returns].some((q) => q.isPending);

  const cellValue = (row: Record<string, string | number>, key: string, type: string) => {
    const v = row[key];
    if (v === undefined || v === null) return '—';
    if (type === 'money') return money(String(v));
    return String(v);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">রিপোর্ট, এমআইএস ও কমপ্লায়েন্স</h1>
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
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
          {/* ── Tab 1: dashboards ── */}
          {tab === 'dashboard' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">ভূমিকা ভিত্তিক ড্যাশবোর্ড (ডেমো সুইচ)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {DEMO_ROLES.map((r) => (
                      <button
                        key={r}
                        onClick={() => setDashRole(r)}
                        className={`rounded-md px-3 py-1.5 text-sm ${dashRole === r ? 'bg-teal-50 font-medium text-teal-800' : 'text-muted-foreground hover:bg-muted'}`}
                      >
                        {DASHBOARD_ROLE_LABELS_BN[r]}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {dashboard.data?.role === 'head_office' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                      { label: 'বকেয়া ঋণ', value: money(dashboard.data.portfolio?.outstanding ?? '0') },
                      { label: 'ঋণগ্রহীতা', value: String(dashboard.data.portfolio?.borrowers ?? 0) },
                      { label: 'গড় ঋণ', value: money(dashboard.data.portfolio?.avgLoanSize ?? '0') },
                      { label: 'মোট সঞ্চয়', value: money(dashboard.data.savings?.totalSavings ?? '0') },
                    ].map((k) => (
                      <Card key={k.label}>
                        <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{k.label}</CardTitle></CardHeader>
                        <CardContent><p className="text-xl font-bold tabular-nums">{k.value}</p></CardContent>
                      </Card>
                    ))}
                  </div>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">প্রবৃদ্ধি (বার্ষিক)</CardTitle></CardHeader>
                    <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
                      <div className="rounded border p-2">সদস্য: {dashboard.data.growth?.memberGrowthPct ?? 0}%</div>
                      <div className="rounded border p-2">পোর্টফোলিও: {dashboard.data.growth?.portfolioGrowthPct ?? 0}%</div>
                      <div className="rounded border p-2">সঞ্চয়: {dashboard.data.growth?.savingsGrowthPct ?? 0}%</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">শাখা র‍্যাংকিং</CardTitle></CardHeader>
                    <CardContent className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b text-muted-foreground">
                          <tr><Th>র‍্যাংক</Th><Th>শাখা</Th><Th right>সদস্য</Th><Th right>বকেয়া</Th><Th right>দক্ষতা</Th><Th right>PAR-৩০</Th><Th right>স্কোর</Th></tr>
                        </thead>
                        <tbody>
                          {(dashboard.data.branchesRanked ?? []).map((b) => (
                            <tr key={b.branchName} className="border-b last:border-0">
                              <Td className="font-semibold">{b.rank}</Td>
                              <Td>{b.branchName}</Td>
                              <Td right>{b.members}</Td>
                              <Td right>{money(b.outstanding)}</Td>
                              <Td right>{b.collectionEffPct}%</Td>
                              <Td right><Pill label={`${b.par30Pct}%`} tone={b.par30Pct < 5 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'} /></Td>
                              <Td right className="font-medium">{b.score}</Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </div>
              )}

              {dashboard.data?.role === 'area_zone' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">{dashboard.data.areaName} · {dashboard.data.zoneName}</p>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">শাখা তুলনা (এলাকা/জোন)</CardTitle></CardHeader>
                    <CardContent className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b text-muted-foreground">
                          <tr><Th>র‍্যাংক</Th><Th>শাখা</Th><Th right>সদস্য</Th><Th right>বকেয়া</Th><Th right>দক্ষতা</Th><Th right>PAR-৩০</Th></tr>
                        </thead>
                        <tbody>
                          {(dashboard.data.branches ?? []).map((b) => (
                            <tr key={b.branchName} className="border-b last:border-0">
                              <Td className="font-semibold">{b.rank}</Td>
                              <Td>{b.branchName}</Td>
                              <Td right>{b.members}</Td>
                              <Td right>{money(b.outstanding)}</Td>
                              <Td right>{b.collectionEffPct}%</Td>
                              <Td right>{b.par30Pct}%</Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="mt-2 text-xs text-muted-foreground">
                        মোট সদস্য {dashboard.data.totals?.members} · PAR-৩০ {dashboard.data.totals?.par30Pct}% · গড় দক্ষতা {dashboard.data.totals?.avgEfficiencyPct}%
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {dashboard.data?.role === 'branch_manager' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">{dashboard.data.branchName} · {dashboard.data.date}</p>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                      { label: 'চলতি মাসের প্রাপ্য', value: money(dashboard.data.collection?.dueThisMonth ?? '0') },
                      { label: 'আদায়', value: money(dashboard.data.collection?.collectedThisMonth ?? '0') },
                      { label: 'দক্ষতা', value: `${dashboard.data.collection?.efficiencyPct ?? 0}%` },
                      { label: 'সময়মতো পরিশোধ', value: `${dashboard.data.collection?.onTimeRate ?? 0}%` },
                    ].map((k) => (
                      <Card key={k.label}>
                        <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{k.label}</CardTitle></CardHeader>
                        <CardContent><p className="text-xl font-bold tabular-nums">{k.value}</p></CardContent>
                      </Card>
                    ))}
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-base">PAR (ঝুঁকিপূর্ণ ঋণ)</CardTitle></CardHeader>
                      <CardContent className="space-y-1 text-sm">
                        <div className="flex justify-between"><span>বকেয়া মোট</span><b className="tabular-nums">{money(dashboard.data.par?.outstandingTotal ?? '0')}</b></div>
                        <div className="flex justify-between"><span>ঝুঁকিপূর্ণ</span><b className="tabular-nums">{money(dashboard.data.par?.atRisk ?? '0')}</b></div>
                        <div className="flex justify-between"><span>PAR-১</span><b>{((dashboard.data.par?.par1 ?? 0) * 100).toFixed(2)}%</b></div>
                        <div className="flex justify-between"><span>PAR-৩০</span><b>{((dashboard.data.par?.par30 ?? 0) * 100).toFixed(2)}%</b></div>
                        <div className="flex justify-between"><span>ঋণ / ঝুঁকিপূর্ণ ঋণ</span><b>{dashboard.data.par?.loansTotal ?? 0} / {dashboard.data.par?.loansAtRisk ?? 0}</b></div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-base">নগদ অবস্থা</CardTitle></CardHeader>
                      <CardContent className="space-y-1 text-sm">
                        <div className="flex justify-between"><span>শুরুর জের</span><b className="tabular-nums">{money(dashboard.data.cash?.opening ?? '0')}</b></div>
                        <div className="flex justify-between"><span>আদায়</span><b className="tabular-nums">{money(dashboard.data.cash?.collections ?? '0')}</b></div>
                        <div className="flex justify-between"><span>বিতরণ</span><b className="tabular-nums">{money(dashboard.data.cash?.disbursements ?? '0')}</b></div>
                        <div className="flex justify-between border-t pt-1"><span>সমাপনী জের</span><b className="tabular-nums">{money(dashboard.data.cash?.closing ?? '0')}</b></div>
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">কর্মীর পারফরম্যান্স</CardTitle></CardHeader>
                    <CardContent className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b text-muted-foreground">
                          <tr><Th>কর্মী</Th><Th right>প্রাপ্য</Th><Th right>আদায়</Th><Th right>দক্ষতা</Th></tr>
                        </thead>
                        <tbody>
                          {(dashboard.data.officers ?? []).map((o) => (
                            <tr key={o.officerName} className="border-b last:border-0">
                              <Td>{o.officerName}</Td>
                              <Td right>{money(o.dueAmount)}</Td>
                              <Td right>{money(o.collectedAmount)}</Td>
                              <Td right><Pill label={`${o.efficiencyPct}%`} tone={o.efficiencyPct >= 90 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'} /></Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </div>
              )}

              {dashboard.data?.role === 'field_officer' && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">{dashboard.data.officerName} · আজ {dashboard.data.date}</p>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                      { label: 'আজকের প্রাপ্য', value: money(('dueAmount' in (dashboard.data.summary ?? {}) ? (dashboard.data.summary as { dueAmount: string }).dueAmount : '0') || '0') },
                      { label: 'আজ আদায়', value: money(('collectedAmount' in (dashboard.data.summary ?? {}) ? (dashboard.data.summary as { collectedAmount: string }).collectedAmount : '0') || '0') },
                      { label: 'আদায়ের হার', value: `${'collectionPct' in (dashboard.data.summary ?? {}) ? (dashboard.data.summary as { collectionPct: number }).collectionPct : 0}%` },
                      { label: 'কিস্তি', value: String('membersDue' in (dashboard.data.summary ?? {}) ? (dashboard.data.summary as { membersDue: number }).membersDue : 0) },
                    ].map((k) => (
                      <Card key={k.label}>
                        <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{k.label}</CardTitle></CardHeader>
                        <CardContent><p className="text-xl font-bold tabular-nums">{k.value}</p></CardContent>
                      </Card>
                    ))}
                  </div>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">আজকের শিট</CardTitle></CardHeader>
                    <CardContent className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b text-muted-foreground">
                          <tr><Th>সমিতি</Th><Th right>কিস্তি</Th><Th right>প্রাপ্য</Th><Th right>আদায়</Th><Th right>সঞ্চয় আদায়</Th></tr>
                        </thead>
                        <tbody>
                          {(dashboard.data.todaySheet ?? []).map((r) => (
                            <tr key={r.samityName} className="border-b last:border-0">
                              <Td>{r.samityName}</Td>
                              <Td right>{r.collectedInstallments}/{r.dueInstallments}</Td>
                              <Td right>{money(r.dueAmount)}</Td>
                              <Td right>{money(r.collectedAmount)}</Td>
                              <Td right>{money(r.savingsCollected)}</Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-base">লক্ষ্য বনাম অর্জন</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                      {(dashboard.data.targets ?? []).map((t) => (
                        <div key={t.metric} className="text-sm">
                          <div className="flex justify-between">
                            <span>{t.labelBn}</span>
                            <span className="tabular-nums">{t.actual} / {t.target} ({t.achievementPct.toFixed(0)}%)</span>
                          </div>
                          <div className="h-2 rounded bg-muted">
                            <div className="h-2 rounded bg-teal-600" style={{ width: `${Math.min(100, t.achievementPct)}%` }} />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  {(dashboard.data.overdueClients ?? []).length > 0 && (
                    <Card>
                      <CardHeader className="pb-2"><CardTitle className="text-base">বকেয়া গ্রাহক</CardTitle></CardHeader>
                      <CardContent className="space-y-1 text-sm">
                        {dashboard.data.overdueClients!.map((c) => (
                          <div key={c.memberName} className="flex justify-between">
                            <span>{c.memberName}</span>
                            <span className="tabular-nums">{money(c.overdueAmount)} · {c.daysPastDue} দিন</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {dashboard.data?.role === 'board' && (
                <div className="space-y-4">
                  <p className="rounded-md border bg-teal-50 px-3 py-2 text-sm text-teal-900">{dashboard.data.headline}</p>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                    {((dashboard.data.summary ?? []) as KpiCardT[]).map((k) => (
                      <Card key={k.key}>
                        <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">{k.labelBn}</CardTitle></CardHeader>
                        <CardContent>
                          <p className="text-xl font-bold tabular-nums">{k.value}</p>
                          {k.hintBn && <p className="text-xs text-muted-foreground">{k.hintBn}</p>}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">বোর্ড ভিউ: শুধু সারসংক্ষেপ — কোনো গ্রাহক-স্তরের তথ্য নয়।</p>
                </div>
              )}
            </div>
          )}

          {/* ── Tab 2: standard reports ── */}
          {tab === 'reports' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" /> স্ট্যান্ডার্ড রিপোর্ট</span>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="mis-rep">রিপোর্ট</Label>
                      <select id="mis-rep" className="h-9 w-56 rounded-md border bg-background px-2 text-sm" value={reportKind} onChange={(e) => setReportKind(e.target.value as StandardReportKind)}>
                        {STANDARD_REPORTS.map((k) => (
                          <option key={k} value={k}>{STANDARD_REPORT_LABELS_BN[k]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="mis-start">শুরু</Label>
                      <Input id="mis-start" type="date" value={reportPeriod.start} onChange={(e) => setReportPeriod((f) => ({ ...f, start: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="mis-end">শেষ</Label>
                      <Input id="mis-end" type="date" value={reportPeriod.end} onChange={(e) => setReportPeriod((f) => ({ ...f, end: e.target.value }))} />
                    </div>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {report.data && (
                  <>
                    <p className="text-sm font-medium">{report.data.meta.titleBn} <span className="text-xs text-muted-foreground">({report.data.meta.rowCount} সারি)</span></p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b text-muted-foreground">
                          <tr>{report.data.columns.map((c) => <Th key={c.key} right={c.type === 'money' || c.type === 'number' || c.type === 'pct'}>{c.labelBn}</Th>)}</tr>
                        </thead>
                        <tbody>
                          {report.data.rows.map((row, i) => (
                            <tr key={i} className="border-b last:border-0">
                              {report.data!.columns.map((c) => (
                                <Td key={c.key} right={c.type === 'money' || c.type === 'number' || c.type === 'pct'}>{cellValue(row, c.key, c.type)}</Td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                        {Object.keys(report.data.totals).length > 0 && (
                          <tfoot>
                            <tr className="border-t-2 bg-muted/40 font-semibold">
                              {report.data.columns.map((c, i) => (
                                <Td key={c.key} right={c.type === 'money' || c.type === 'number' || c.type === 'pct'}>
                                  {i === 0 ? 'মোট' : report.data!.totals[c.key] !== undefined ? cellValue(report.data!.totals, c.key, c.type) : ''}
                                </Td>
                              ))}
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Tab 3: ratios ── */}
          {tab === 'ratios' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base"><Percent className="h-4 w-4" /> আর্থিক অনুপাত</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(ratios.data?.items ?? []).map((r) => {
                    const good = r.key === 'oss' ? r.value >= 1.2 : r.key === 'write_off_ratio' || r.key === 'cost_per_borrower' ? r.value <= (r.benchmark ?? 0) : true;
                    return (
                      <div key={r.key} className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">{r.labelBn}</p>
                        <p className={`mt-1 text-2xl font-bold tabular-nums ${good ? 'text-emerald-700' : 'text-amber-700'}`}>{r.formatted}</p>
                        {r.benchmark !== undefined && <p className="text-xs text-muted-foreground">বেঞ্চমার্ক: {r.unit === 'ratio' ? (r.benchmark * 100).toFixed(0) + '%' : r.unit === 'bdt' ? money(String(r.benchmark)) : `${r.benchmark}`}</p>}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground">
                সূত্র: OSS = পরিচালন আয় ÷ (পরিচালন ব্যয় + আর্থিক ব্যয়) · ইউটি = সুদ-ফি ÷ গড় পোর্টফোলিও · ঋণগ্রহীতা প্রতি ব্যয় = মোট ব্যয় ÷ ঋণগ্রহীতা।
              </p>
            </div>
          )}

          {/* ── Tab 4: regulatory returns ── */}
          {tab === 'regulatory' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2"><Landmark className="h-4 w-4" /> রিটার্ন জেনারেটর (এমআরএ / পিকেএসএফ)</span>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="mis-tpl">টেমপ্লেট</Label>
                        <select id="mis-tpl" className="h-9 w-64 rounded-md border bg-background px-2 text-sm" value={selectedTemplate} onChange={(e) => setSelectedTemplate(e.target.value)}>
                          <option value="">— নির্বাচন করুন —</option>
                          {(templates.data?.items ?? []).map((t) => (
                            <option key={t.id} value={t.id}>{t.name} ({t.regulator})</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="mis-rs">শুরু</Label>
                        <Input id="mis-rs" type="date" value={returnPeriod.start} onChange={(e) => setReturnPeriod((f) => ({ ...f, start: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="mis-re">শেষ</Label>
                        <Input id="mis-re" type="date" value={returnPeriod.end} onChange={(e) => setReturnPeriod((f) => ({ ...f, end: e.target.value }))} />
                      </div>
                      <Button size="sm" disabled={busy || !selectedTemplate} onClick={() => act(() => generateReturn.mutateAsync())}>রিটার্ন তৈরি</Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => createTemplate.mutateAsync())}>+ কাস্টম টেমপ্লেট</Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {(templates.data?.items ?? []).map((t) => (
                      <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
                        <div>
                          <b>{t.name}</b> <Pill label={t.regulator} tone={t.regulator === 'MRA' ? 'bg-teal-100 text-teal-800' : 'bg-sky-100 text-sky-800'} />
                          {t.needsVerification && <Pill label="⚠ যাচাই প্রয়োজন" tone="bg-amber-100 text-amber-800" />}
                          <div className="text-xs text-muted-foreground">{t.circularRef}</div>
                        </div>
                        <div className="flex gap-1">
                          {t.needsVerification && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => verifyTemplate.mutateAsync(t.id))}>যাচাই সম্পন্ন</Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    টেমপ্লেট ডিজাইনার: প্রতিটি সারির সূত্র নাম-ধারী মানের উপর মূল্যায়ন হয় (যেমন =outstanding, =total_savings/borrowers)। নতুন সার্কুলার = নতুন টেমপ্লেট — কোড পরিবর্তন ছাড়াই।
                  </p>
                </CardContent>
              </Card>

              {(returns.data?.items ?? []).map((r) => (
                <Card key={r.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                      <span>{r.regulator} · {r.templateName} · {r.periodStart} → {r.periodEnd}</span>
                      <div className="flex items-center gap-2">
                        {r.needsVerification && <Pill label="⚠ সার্কুলার যাচাই" tone="bg-amber-100 text-amber-800" />}
                        {r.submittedAt ? <Pill label="দাখিলকৃত" tone="bg-emerald-100 text-emerald-800" /> : (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => submitReturn.mutateAsync(r.id))}>দাখিল করুন</Button>
                        )}
                        <a className="rounded-md border px-2 py-1 text-xs hover:bg-muted" href={`/api/v1/mis/returns/${r.id}/export`} target="_blank" rel="noreferrer">এক্সপোর্ট</a>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {r.rows.map((row) => (
                          <tr key={row.code} className="border-b last:border-0">
                            <Td className={row.kind === 'section' ? 'font-semibold' : row.bold ? 'font-semibold' : ''}>
                              {row.kind === 'section' ? `■ ${row.labelBn}` : row.labelBn}
                            </Td>
                            <Td right className={row.bold ? 'font-semibold' : ''}>{row.value ?? (row.kind === 'value' ? '—' : '')}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {r.missingValues.length > 0 && (
                      <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">অনুপস্থিত মান: {r.missingValues.join(', ')}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
