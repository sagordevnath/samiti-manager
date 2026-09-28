/**
 * ── MIS operations page (reqs 5–10) ──────────────────────────────────────────
 * Tab 1 সুরক্ষা: client-protection indicators (complaints, resolution time,
 *   overlap, repayment stress) with a Recharts bar chart by category.
 * Tab 2 রিপোর্ট বিল্ডার: dataset/filter/group-by/metric/chart-type ad-hoc
 *   reports; save, share by role, run saved reports.
 * Tab 3 এক্সপোর্ট: CSV / Excel (Bangla-safe) / print-PDF links for the 11
 *   standard reports, plus the scheduled SMTP delivery form.
 * Tab 4 ফ্রিজ ও গতি: month-end freeze (soft/hard) and the materialized-view
 *   catalogue with refresh times and documented indexes.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ShieldAlert, SlidersHorizontal, Printer, Snowflake } from 'lucide-react';
import type { StandardReportKind } from '@samity/shared';
import { STANDARD_REPORT_LABELS_BN, STANDARD_REPORTS } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

const TABS = ['protection', 'builder', 'exports', 'freeze'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = {
  protection: 'সুরক্ষা সূচক',
  builder: 'রিপোর্ট বিল্ডার',
  exports: 'এক্সপোর্ট ও শিডিউল',
  freeze: 'ফ্রিজ ও গতি',
};

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-2 py-1.5 text-xs font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, className, colSpan }: { children?: React.ReactNode; right?: boolean; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-2 py-1.5 ${right ? 'text-right tabular-nums' : ''} ${className ?? ''}`}>{children}</td>;
}

/* ── shared shapes ────────────────────────────────────────────────────────── */

interface ProtectionT {
  complaintsTotal: number;
  complaintsOpen: number;
  resolutionDaysAvg: number;
  resolutionDaysMedian: number;
  slaCompliancePct: number;
  overlapCases: number;
  repaymentStressCases: number;
  byCategory: { category: string; count: number; open: number }[];
  byBranch: { branchName: string; count: number; open: number; escalated: number }[];
}
interface BuilderRowT {
  group: string;
  count: number;
  metric: number;
}
interface RunResultT {
  chartType: string;
  scanned: number;
  rows: BuilderRowT[];
}
interface SavedReportT {
  id: string;
  name: string;
  dataset: string;
  filters: { field: string; op: string; value: string }[];
  groupBy: string;
  metric: string;
  metricField: string | null;
  chartType: string;
  sharedWithRoles: string[];
  createdAt: string;
}
interface ScheduleT {
  id: string;
  name: string;
  kind: 'saved_report' | 'standard_report';
  reportId: string;
  format: string;
  frequency: string;
  runOn: number;
  recipients: string[];
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: 'ok' | 'error' | null;
  lastError: string | null;
}
interface FreezeT {
  id: string;
  month: string;
  status: string;
  frozenBy: string;
  frozenAt: string;
  note: string;
}
interface MatviewT {
  name: string;
  labelBn: string;
  descriptionBn: string;
  rows: number;
  refreshMode: string;
}
interface IndexDocT {
  table: string;
  index: string;
  columns: string;
  purposeBn: string;
}

/* ── Tab 1: client protection ─────────────────────────────────────────────── */

const CAT_LABELS: Record<string, string> = {
  product_transparency: 'পণ্যের স্বচ্ছতা',
  overcharging: 'অতিরিক্ত চার্জ',
  staff_behaviour: 'কর্মীর আচরণ',
  coercive_collection: 'জোরপূর্বক আদায়',
  privacy: 'গোপনীয়তা',
  delay: 'অযৌক্তিক বিলম্ব',
  other: 'অন্যান্য',
};

function ProtectionTab() {
  const q = useQuery({
    queryKey: ['mis-ops', 'protection'],
    queryFn: () => api.get<ProtectionT>('/mis-ops/protection'),
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>;
  const d = q.data;
  if (!d) return null;

  const kpis = [
    { label: 'মোট অভিযোগ', value: String(d.complaintsTotal) },
    { label: 'অমীমাংসিত', value: String(d.complaintsOpen) },
    { label: 'মধ্যম সমাধানকাল (দিন)', value: String(d.resolutionDaysMedian) },
    { label: 'SLA পালন', value: `${d.slaCompliancePct}%` },
    { label: 'ওভারল্যাপ কেস', value: String(d.overlapCases) },
    { label: 'পরিশোধ-চাপ কেস', value: String(d.repaymentStressCases) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className="text-2xl font-bold tabular-nums">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="h-4 w-4" /> বিভাগ অনুযায়ী অভিযোগ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={d.byCategory.map((c) => ({ ...c, label: CAT_LABELS[c.category] ?? c.category }))}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip />
                <Bar dataKey="count" name="মোট" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="open" name="চলমান" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">শাখা-ভিত্তিক অভিযোগ ও উর্ধ্বতন</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <Th>শাখা</Th>
                <Th right>মোট</Th>
                <Th right>চলমান</Th>
                <Th right>উর্ধ্বতনে প্রেরিত</Th>
              </tr>
            </thead>
            <tbody>
              {d.byBranch.map((b) => (
                <tr key={b.branchName} className="border-b last:border-0">
                  <Td>{b.branchName}</Td>
                  <Td right>{b.count}</Td>
                  <Td right>{b.open}</Td>
                  <Td right>{b.escalated}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Tab 2: ad-hoc report builder ─────────────────────────────────────────── */

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'সুপার অ্যাডমিন',
  org_admin: 'সংস্থা অ্যাডমিন',
  area_manager: 'এলাকা ব্যবস্থাপক',
  branch_manager: 'শাখা ব্যবস্থাপক',
  accountant: 'হিসাবরক্ষক',
  account_officer: 'ফিল্ড অফিসার',
};

function BuilderTab() {
  const qc = useQueryClient();
  const [form, setForm] = useState<Omit<SavedReportT, 'id' | 'createdAt'>>({
    name: 'শাখা-ভিত্তিক বকেয়া',
    dataset: 'loans',
    filters: [],
    groupBy: 'branchName',
    metric: 'sum',
    metricField: 'outstanding',
    chartType: 'bar',
    sharedWithRoles: [],
  });
  const [running, setRunning] = useState<RunResultT | null>(null);
  const runMut = useMutation({
    mutationFn: (body: typeof form) => api.post<RunResultT>('/mis-ops/builder/run', body),
    onSuccess: (data) => setRunning(data),
  });
  const saveMut = useMutation({
    mutationFn: (body: typeof form) => api.post<SavedReportT>('/mis-ops/builder/saved', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mis-ops', 'builder-saved'] }),
  });
  const savedQ = useQuery({
    queryKey: ['mis-ops', 'builder-saved'],
    queryFn: () => api.get<{ items: SavedReportT[] }>('/mis-ops/builder/saved'),
  });
  const runSavedMut = useMutation({
    mutationFn: (id: string) => api.post<RunResultT>(`/mis-ops/builder/saved/${id}/run`),
    onSuccess: (data) => setRunning(data),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.delete<void>(`/mis-ops/builder/saved/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mis-ops', 'builder-saved'] }),
  });

  const rows = running?.rows ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <SlidersHorizontal className="h-4 w-4" /> অ্যাড-হক রিপোর্ট তৈরি
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>নাম</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>ডেটাসেট</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.dataset}
                onChange={(e) => setForm({ ...form, dataset: e.target.value })}
              >
                <option value="loans">ঋণ (loans)</option>
                <option value="savings">সঞ্চয় (savings)</option>
                <option value="members">সদস্য (members)</option>
                <option value="disbursements">ঋণ বিতরণ (disbursements)</option>
                <option value="repayments">আদায় (repayments)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>গ্রুপ-বাই</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.groupBy}
                onChange={(e) => setForm({ ...form, groupBy: e.target.value })}
              >
                <option value="branchName">শাখা</option>
                <option value="productName">পণ্য</option>
                <option value="status">অবস্থা</option>
                <option value="sector">খাত</option>
                <option value="officerName">কর্মকর্তা</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>মেট্রিক</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.metric}
                onChange={(e) => setForm({ ...form, metric: e.target.value })}
              >
                <option value="count">গণনা</option>
                <option value="sum">যোগফল</option>
                <option value="avg">গড়</option>
              </select>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1">
              <Label>মেট্রিক ক্ষেত্র</Label>
              <Input
                placeholder="যেমন outstanding"
                value={form.metricField ?? ''}
                onChange={(e) => setForm({ ...form, metricField: e.target.value || null })}
              />
            </div>
            <div className="space-y-1">
              <Label>চার্ট</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form.chartType}
                onChange={(e) => setForm({ ...form, chartType: e.target.value })}
              >
                <option value="bar">বার</option>
                <option value="line">লাইন</option>
                <option value="pie">পাই</option>
                <option value="table">টেবিল</option>
              </select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>ফিল্টার (Enter চাপুন)</Label>
              <Input
                placeholder="যেমন branchName=ধানমন্ডি"
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const raw = e.currentTarget.value.trim();
                  const m = /^([^=]+)=([^=]+)$/.exec(raw);
                  if (!m) return;
                  setForm({ ...form, filters: [...form.filters, { field: m[1]!.trim(), op: 'eq', value: m[2]!.trim() }] });
                  e.currentTarget.value = '';
                }}
              />
              {form.filters.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {form.filters.map((f, i) => (
                    <button
                      key={`${f.field}=${f.value}`}
                      type="button"
                      onClick={() => setForm({ ...form, filters: form.filters.filter((_, j) => j !== i) })}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs hover:bg-accent"
                    >
                      {f.field}={f.value} ✕
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => runMut.mutate(form)} disabled={runMut.isPending}>
              চালান
            </Button>
            <Button size="sm" variant="outline" onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending}>
              সংরক্ষণ করুন
            </Button>
            <div className="flex flex-wrap items-center gap-1">
              <Label className="text-xs">ভূমিকা-ভিত্তিক শেয়ার:</Label>
              {Object.keys(ROLE_LABELS).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() =>
                    setForm({
                      ...form,
                      sharedWithRoles: form.sharedWithRoles.includes(r)
                        ? form.sharedWithRoles.filter((x) => x !== r)
                        : [...form.sharedWithRoles, r],
                    })
                  }
                  className={`rounded px-1.5 py-0.5 text-xs ${
                    form.sharedWithRoles.includes(r) ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {ROLE_LABELS[r]}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {running && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              ফলাফল — স্ক্যান করা হয়েছে {running.scanned} সারি
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.length > 0 && form.chartType !== 'table' && (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="key" fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Bar dataKey="metric" name="মান" fill={form.chartType === 'pie' ? '#7c3aed' : '#2563eb'} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <Th>{form.groupBy ? 'গ্রুপ' : 'সারি'}</Th>
                    <Th right>গণনা</Th>
                    <Th right>মান</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.group} className="border-b last:border-0">
                      <Td>{r.group}</Td>
                      <Td right>{r.count}</Td>
                      <Td right>{r.metric.toLocaleString('bn-BD')}</Td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <Td colSpan={3}>— কোনো সারি নেই —</Td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">সংরক্ষিত রিপোর্ট</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <Th>নাম</Th>
                <Th>ডেটাসেট</Th>
                <Th>শেয়ার</Th>
                <Th right>অ্যাকশন</Th>
              </tr>
            </thead>
            <tbody>
              {(savedQ.data?.items ?? []).map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <Td>{s.name}</Td>
                  <Td>{s.dataset}</Td>
                  <Td>{s.sharedWithRoles.map((r) => ROLE_LABELS[r] ?? r).join(', ') || '—'}</Td>
                  <Td right>
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => runSavedMut.mutate(s.id)}>
                        চালান
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => delMut.mutate(s.id)}>
                        মুছুন
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
              {(savedQ.data?.items ?? []).length === 0 && (
                <tr>
                  <Td colSpan={4}>— কোনো সংরক্ষিত রিপোর্ট নেই —</Td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Tab 3: exports + scheduled delivery ──────────────────────────────────── */

function ExportsTab() {
  const qc = useQueryClient();
  const [stdKind, setStdKind] = useState<StandardReportKind>('outstanding_loans');
  const [schedName, setSchedName] = useState('সাপ্তাহিক বকেয়া মেইল');
  const [schedFreq, setSchedFreq] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [schedRunOn, setSchedRunOn] = useState(1);
  const [schedTime, setSchedTime] = useState('08:00');
  const [schedTo, setSchedTo] = useState('branch@ngo.org.bd');

  const schedList = useQuery({
    queryKey: ['mis-ops', 'schedules'],
    queryFn: () => api.get<{ items: ScheduleT[]; smtpConfigured: boolean }>('/mis-ops/schedules'),
  });
  const schedSave = useMutation({
    mutationFn: () =>
      api.post<ScheduleT>('/mis-ops/schedules', {
        name: schedName,
        kind: 'standard_report',
        reportId: stdKind,
        format: 'csv',
        frequency: schedFreq,
        runOn: schedRunOn,
        recipients: [schedTo],
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mis-ops', 'schedules'] }),
  });
  const schedRun = useMutation({
    mutationFn: (id: string) => api.post<unknown>(`/mis-ops/schedules/${id}/run`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mis-ops', 'schedules'] }),
  });

  const exportHref = (format: string) => `${API_URL}/mis-ops/export/standard/${stdKind}/${format}`;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Printer className="h-4 w-4" /> এক্সপোর্ট সেন্টার
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label>স্ট্যান্ডার্ড রিপোর্ট</Label>
              <select
                className="h-9 w-56 rounded-md border bg-background px-2 text-sm"
                value={stdKind}
                onChange={(e) => setStdKind(e.target.value as StandardReportKind)}
              >
                {STANDARD_REPORTS.map((k) => (
                  <option key={k} value={k}>
                    {STANDARD_REPORT_LABELS_BN[k]}
                  </option>
                ))}
              </select>
            </div>
            {[
              { fmt: 'csv', label: 'CSV' },
              { fmt: 'excel', label: 'Excel' },
              { fmt: 'pdf', label: 'PDF (প্রিন্ট)' },
            ].map((b) => (
              <a
                key={b.fmt}
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                href={exportHref(b.fmt)}
                target="_blank"
                rel="noreferrer"
              >
                {b.label}
              </a>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            CSV ডাউনলোডে UTF-8 BOM আছে — এক্সেলে বাংলা সরাসরি পড়া যায়; Excel ফরম্যাটটি XML ওয়ার্কবুক; PDF হলো বাংলা ফন্টসহ প্রিন্ট-ভিউ।
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">শিডিউল করা মেইল ডেলিভারি (SMTP)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!schedList.data?.smtpConfigured && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              SMTP কনফিগার করা নেই — ফ্রি SMTP (যেমন Gmail অ্যাপ-পাসওয়ার্ড) ব্যবহারে SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS সেট করুন। চালালে ত্রুটি শিডিউলেই সংরক্ষিত হবে।
            </p>
          )}
          <div className="grid gap-3 md:grid-cols-5">
            <div className="space-y-1 md:col-span-2">
              <Label>শিডিউলের নাম</Label>
              <Input value={schedName} onChange={(e) => setSchedName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>ঘনত্ব</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={schedFreq}
                onChange={(e) => setSchedFreq(e.target.value as typeof schedFreq)}
              >
                <option value="daily">দৈনিক</option>
                <option value="weekly">সাপ্তাহিক</option>
                <option value="monthly">মাসিক</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>সময়</Label>
              <Input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>দিন (সাপ্তাহিক ১–৭, মাসিক ১–২৮)</Label>
              <Input
                type="number"
                min={1}
                max={28}
                value={schedRunOn}
                onChange={(e) => setSchedRunOn(Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
            <div className="space-y-1">
              <Label>প্রাপক ইমেইল</Label>
              <Input value={schedTo} onChange={(e) => setSchedTo(e.target.value)} />
            </div>
          </div>
          <Button size="sm" onClick={() => schedSave.mutate()} disabled={schedSave.isPending}>
            শিডিউল যোগ করুন
          </Button>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <Th>নাম</Th>
                <Th>রিপোর্ট</Th>
                <Th>ঘনত্ব</Th>
                <Th>প্রাপক</Th>
                <Th>সর্বশেষ ফলাফল</Th>
                <Th right>অ্যাকশন</Th>
              </tr>
            </thead>
            <tbody>
              {(schedList.data?.items ?? []).map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <Td>{s.name}</Td>
                  <Td>{s.kind === 'standard_report' ? s.reportId : 'সংরক্ষিত রিপোর্ট'}</Td>
                  <Td>{s.frequency} · দিন {s.runOn}</Td>
                  <Td>{s.recipients.join(', ')}</Td>
                  <Td>
                    {s.lastStatus ? (
                      <span className={s.lastStatus === 'ok' ? 'text-green-600' : 'text-amber-600'} title={s.lastError ?? undefined}>
                        {s.lastStatus === 'ok' ? 'সফল' : 'ত্রুটি'}
                      </span>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td right>
                    <Button size="sm" variant="outline" onClick={() => schedRun.mutate(s.id)}>
                      এখন চালান
                    </Button>
                  </Td>
                </tr>
              ))}
              {(schedList.data?.items ?? []).length === 0 && (
                <tr>
                  <Td colSpan={6}>— কোনো শিডিউল নেই —</Td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── Tab 4: freeze + matviews ─────────────────────────────────────────────── */

function FreezeTab() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const list = useQuery({
    queryKey: ['mis-ops', 'freeze'],
    queryFn: () => api.get<{ items: FreezeT[] }>('/mis-ops/freeze'),
  });
  const freezeMut = useMutation({
    mutationFn: () => api.post<FreezeT>('/mis-ops/freeze', { month }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mis-ops', 'freeze'] }),
  });
  const unfreezeMut = useMutation({
    mutationFn: (m: string) => api.delete<void>(`/mis-ops/freeze/${m}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mis-ops', 'freeze'] }),
  });

  const mat = useQuery({
    queryKey: ['mis-ops', 'matviews'],
    queryFn: () =>
      api.get<{ views: MatviewT[]; refreshSql: string; lastRefreshAt: string | null; indexes: IndexDocT[] }>('/mis-ops/matviews'),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Snowflake className="h-4 w-4" /> মাসিক ডেটা ফ্রিজ
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label>মাস</Label>
              <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <Button size="sm" onClick={() => freezeMut.mutate()} disabled={freezeMut.isPending}>
              ফ্রিজ করুন
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <Th>মাস</Th>
                <Th>অবস্থা</Th>
                <Th>ফ্রিজকারী</Th>
                <Th>সময়</Th>
                <Th right>অ্যাকশন</Th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.items ?? []).map((f) => (
                <tr key={f.id} className="border-b last:border-0">
                  <Td>{f.month}</Td>
                  <Td>
                    <span className={f.status === 'hard' ? 'text-red-600' : 'text-amber-600'}>
                      {f.status === 'hard' ? 'কঠোর' : 'নরম'}
                    </span>
                  </Td>
                  <Td>{f.frozenBy}</Td>
                  <Td>{f.frozenAt}</Td>
                  <Td right>
                    <Button size="sm" variant="ghost" onClick={() => unfreezeMut.mutate(f.month)}>
                      খুলুন
                    </Button>
                  </Td>
                </tr>
              ))}
              {(list.data?.items ?? []).length === 0 && (
                <tr>
                  <Td colSpan={5}>— কোনো ফ্রিজ নেই —</Td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            নরম ফ্রিজে সংশোধন সম্ভব কিন্তু সতর্কতা দেখানো হয়; কঠোর ফ্রিজে বদল সম্পূর্ণ বন্ধ। প্রতিটি বদল অডিট লগে লেখা হয়।
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">ম্যাটেরিয়ালাইজড ভিউ ও ইনডেক্স</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <Th>ভিউ</Th>
                <Th>নাম</Th>
                <Th>উদ্দেশ্য</Th>
                <Th right>সারি</Th>
                <Th>রিফ্রেশ</Th>
              </tr>
            </thead>
            <tbody>
              {(mat.data?.views ?? []).map((m) => (
                <tr key={m.name} className="border-b last:border-0">
                  <Td className="font-mono text-xs">{m.name}</Td>
                  <Td>{m.labelBn}</Td>
                  <Td>{m.descriptionBn}</Td>
                  <Td right>{m.rows}</Td>
                  <Td>{m.refreshMode}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="font-mono text-xs text-muted-foreground">{mat.data?.refreshSql}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <Th>টেবিল</Th>
                <Th>ইনডেক্স</Th>
                <Th>কলাম</Th>
                <Th>উদ্দেশ্য</Th>
              </tr>
            </thead>
            <tbody>
              {(mat.data?.indexes ?? []).map((ix) => (
                <tr key={ix.index} className="border-b last:border-0">
                  <Td className="font-mono text-xs">{ix.table}</Td>
                  <Td className="font-mono text-xs">{ix.index}</Td>
                  <Td className="font-mono text-xs">{ix.columns}</Td>
                  <Td>{ix.purposeBn}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            প্রতি রাতে pg_cron / ব্যাকএন্ড ক্রন দিয়ে REFRESH MATERIALIZED VIEW CONCURRENTLY চালানো হয়; ইনডেক্সগুলো 0050 মাইগ্রেশনে ডকুমেন্ট করা।
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */

const TAB_ICONS = { protection: ShieldAlert, builder: SlidersHorizontal, exports: Printer, freeze: Snowflake } as const;

export default function MisOpsPage() {
  const [tab, setTab] = useState<Tab>('protection');
  const Icon = TAB_ICONS[tab];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">রিপোর্ট অপারেশন ও কমপ্লায়েন্স</h1>
      </header>

      <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {TABS.map((k) => {
          const I = TAB_ICONS[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
            >
              <I className="h-4 w-4" /> {TAB_LABELS[k]}
            </button>
          );
        })}
      </nav>

      {tab === 'protection' && <ProtectionTab />}
      {tab === 'builder' && <BuilderTab />}
      {tab === 'exports' && <ExportsTab />}
      {tab === 'freeze' && <FreezeTab />}
    </div>
  );
}
