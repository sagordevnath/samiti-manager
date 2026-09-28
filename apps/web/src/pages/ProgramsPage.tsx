/**
 * ── Programs & projects page (NGO development sector) ────────────────────────
 * Tab 1 প্রকল্প: register with donor, grant agreement, budget, restricted fund
 *   code (Module 10 link) and the proposed → active → closed lifecycle.
 * Tab 2 লগফ্রেম: goal/objective/output/indicator tree with periodic indicator
 *   values and evidence uploads.
 * Tab 3 উপকারভোগী: registry linked to members, multi-project enrollment,
 *   service delivery records.
 * Tab 4 কার্যক্রম: activity planner with calendar slice and completion.
 * Tab 5 প্রশিক্ষণ: batches with trainers, attendance, pre/post tests and
 *   certificates (print page per certificate).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Award, CalendarDays, ClipboardList, Sprout, Target, Users } from 'lucide-react';
import type { ActivityStatus, ProjectStatus, ServiceKind } from '@samity/shared';
import {
  ACTIVITY_STATUS_LABELS_BN,
  GENDER_LABELS_BN,
  PROJECT_STATUS_LABELS_BN,
  SECTOR_LABELS_BN,
  SERVICE_LABELS_BN,
  type ProgramSector,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const TABS = ['projects', 'logframe', 'beneficiaries', 'activities', 'training'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  projects: 'প্রকল্প রেজিস্টার',
  logframe: 'লগফ্রেম',
  beneficiaries: 'উপকারভোগী',
  activities: 'কার্যক্রম ক্যালেন্ডার',
  training: 'প্রশিক্ষণ ব্যাচ',
};

const MEMBER_A = '00000000-0000-4000-8000-0000000001a1';

const STATUS_TONE: Record<string, 'muted' | 'green' | 'amber' | 'red'> = {
  proposed: 'muted',
  active: 'green',
  suspended: 'amber',
  closed: 'muted',
  planned: 'amber',
  done: 'green',
  cancelled: 'red',
};

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-2 py-1.5 text-xs font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-2 py-1.5 ${right ? 'text-right tabular-nums' : ''} ${className ?? ''}`}>{children}</td>;
}
function Pill({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'green' | 'amber' | 'red' }) {
  const style =
    tone === 'green'
      ? 'bg-emerald-100 text-emerald-800'
      : tone === 'amber'
        ? 'bg-amber-100 text-amber-800'
        : tone === 'red'
          ? 'bg-red-100 text-red-700'
          : 'bg-muted text-muted-foreground';
  return <span className={`rounded px-1.5 py-0.5 text-xs ${style}`}>{label}</span>;
}

interface ProjectRow {
  id: string;
  code: string;
  nameBn: string;
  nameEn: string;
  donor: string;
  grantAgreementNo: string;
  fundCode: string;
  sector: ProgramSector;
  startDate: string;
  endDate: string;
  targetAreas: string[];
  targetBeneficiaries: number;
  managerName: string;
  budget: { lineItem: string; amount: string; note: string }[];
  budgetTotal: string;
  status: ProjectStatus;
}

interface LogframeEntry {
  id: string;
  level: 'goal' | 'objective' | 'output' | 'indicator';
  statement: string;
  parentLabel: string | null;
  indicatorCode: string | null;
  baseline: string;
  targetValue: string;
  unit: string | null;
  meansOfVerification: string;
}

interface IndicatorValue {
  id: string;
  entryId: string;
  periodStart: string;
  periodEnd: string;
  value: string;
  evidence: { id: string; labelBn: string; path: string }[];
}

interface BeneficiaryRow {
  id: string;
  code: string;
  memberId: string | null;
  nameBn: string;
  guardianBn: string;
  phone: string;
  age: number;
  gender: 'male' | 'female' | 'other';
  village: string;
}

interface EnrollmentRow {
  id: string;
  beneficiaryId: string;
  projectId: string;
  enrolledAt: string;
}

interface ServiceRow {
  id: string;
  projectId: string;
  beneficiaryId: string;
  kind: ServiceKind;
  serviceDate: string;
  details: string;
}

interface ActivityRow {
  id: string;
  projectId: string;
  titleBn: string;
  kind: ServiceKind;
  plannedDate: string;
  venue: string;
  targetParticipants: number;
  status: ActivityStatus;
}

interface BatchRow {
  id: string;
  projectId: string;
  code: string;
  titleBn: string;
  trainerName: string;
  trainerOrgBn: string;
  startDate: string;
  endDate: string;
  hours: number;
  sessions: number;
}

interface BatchDetail {
  batch: BatchRow;
  attendance: { beneficiaryId: string; sessionNo: number; present: boolean }[];
  scores: { beneficiaryId: string; pre: number; post: number }[];
  stats: { attendees: number; avgAttendancePct: number; avgPre: number; avgPost: number; avgGainPct: number; certificates: number };
}

interface CertificateRow {
  id: string;
  certNo: string;
  batchId: string;
  beneficiaryId: string;
}

const TODAY = () => new Date().toISOString().slice(0, 10);

export function ProgramsPage() {
  const money = useMoneyFormatter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('projects');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['pg'] });
  const act = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    fn()
      .catch((e: Error) => setError(e.message))
      .finally(() => setTimeout(() => setBusy(false), 400));
  };

  const projects = useQuery({ queryKey: ['pg', 'projects'], queryFn: () => api.get<{ items: ProjectRow[] }>('/programs/projects') });
  const [logframeProject, setLogframeProject] = useState('');
  const logframe = useQuery({
    queryKey: ['pg', 'logframe', logframeProject],
    enabled: !!logframeProject,
    queryFn: () => api.get<{ entries: LogframeEntry[]; values: IndicatorValue[] }>(`/programs/projects/${logframeProject}/logframe`),
  });
  const beneficiaries = useQuery({ queryKey: ['pg', 'beneficiaries'], queryFn: () => api.get<{ items: BeneficiaryRow[] }>('/programs/beneficiaries') });
  const enrollments = useQuery({ queryKey: ['pg', 'enrollments'], queryFn: () => api.get<{ items: EnrollmentRow[] }>('/programs/enrollments') });
  const services = useQuery({ queryKey: ['pg', 'services'], queryFn: () => api.get<{ items: ServiceRow[] }>('/programs/services') });
  const [calStart, setCalStart] = useState(TODAY());
  const [calEnd, setCalEnd] = useState('2026-12-31');
  const activities = useQuery({
    queryKey: ['pg', 'activities', calStart, calEnd],
    queryFn: () => api.get<{ items: ActivityRow[] }>(`/programs/activities?start=${calStart}&end=${calEnd}`),
  });
  const batches = useQuery({ queryKey: ['pg', 'batches'], queryFn: () => api.get<{ items: BatchRow[] }>('/programs/batches') });
  const certificates = useQuery({ queryKey: ['pg', 'certificates'], queryFn: () => api.get<{ items: CertificateRow[] }>('/programs/certificates') });
  const [batchDetailId, setBatchDetailId] = useState('');
  const batchDetail = useQuery({
    queryKey: ['pg', 'batch', batchDetailId],
    enabled: !!batchDetailId,
    queryFn: () => api.get<BatchDetail>(`/programs/batches/${batchDetailId}`),
  });

  const loading = [projects, beneficiaries, enrollments, services, activities, batches, certificates].some((q) => q.isPending);

  /* ── Mutations ── */
  const [projForm, setProjForm] = useState({
    code: 'PRJ-2026-001',
    nameBn: 'শিক্ষা সহায়তা প্রকল্প',
    nameEn: 'Education Support Project',
    donor: 'BRAC Foundation',
    grantAgreementNo: 'GA-2026-88',
    fundCode: 'RF-EDU-01',
    sector: 'education' as ProgramSector,
    startDate: '2026-01-01',
    endDate: '2026-12-31',
    targetAreas: 'গাজীপুর, মিরকাদিম',
    targetBeneficiaries: '500',
    managerName: 'নাসরিন সুলতানা',
    budgetItem: 'প্রশিক্ষণ ব্যয়',
    budgetAmount: '500000',
  });
  const createProject = useMutation({
    mutationFn: () =>
      api.post('/programs/projects', {
        code: projForm.code,
        nameBn: projForm.nameBn,
        nameEn: projForm.nameEn,
        donor: projForm.donor,
        grantAgreementNo: projForm.grantAgreementNo,
        fundCode: projForm.fundCode,
        sector: projForm.sector,
        startDate: projForm.startDate,
        endDate: projForm.endDate,
        targetAreas: projForm.targetAreas.split(',').map((s) => s.trim()).filter(Boolean),
        targetBeneficiaries: Number(projForm.targetBeneficiaries) || 0,
        managerName: projForm.managerName,
        budget: [{ lineItem: projForm.budgetItem || 'সাধারণ ব্যয়', amount: String(Number(projForm.budgetAmount) || 0), note: '' }],
      }),
    onSuccess: invalidate,
  });
  const decideProject = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => api.post(`/programs/projects/${id}/decision`, { action }),
    onSuccess: invalidate,
  });

  const addLogframe = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/programs/projects/${logframeProject}/logframe`, body),
    onSuccess: invalidate,
  });
  const addIndicatorValue = useMutation({
    mutationFn: ({ entryId, value }: { entryId: string; value: string }) =>
      api.post('/programs/indicator-values', {
        entryId,
        periodStart: TODAY(),
        periodEnd: TODAY(),
        value,
        evidence: [{ id: `ev-${Date.now()}`, labelBn: 'মাঠ প্রতিবেদন', path: `evidence/${entryId}.pdf` }],
      }),
    onSuccess: invalidate,
  });

  const [benForm, setBenForm] = useState({ nameBn: 'রহিমা বেগম', guardianBn: 'মৃত আব্দুল করিম', phone: '01712345678', age: '32', gender: 'female', village: 'গাজীপুর', linked: true });
  const createBeneficiary = useMutation({
    mutationFn: () =>
      api.post('/programs/beneficiaries', {
        memberId: benForm.linked ? MEMBER_A : null,
        nameBn: benForm.nameBn,
        guardianBn: benForm.guardianBn,
        phone: benForm.phone,
        age: Number(benForm.age) || 0,
        gender: benForm.gender,
        village: benForm.village,
      }),
    onSuccess: invalidate,
  });
  const enroll = useMutation({
    mutationFn: ({ beneficiaryId, projectId }: { beneficiaryId: string; projectId: string }) =>
      api.post('/programs/enrollments', { beneficiaryId, projectId, enrolledAt: TODAY(), note: 'ডেমো ভর্তি' }),
    onSuccess: invalidate,
  });
  const logService = useMutation({
    mutationFn: ({ beneficiaryId, kind }: { beneficiaryId: string; kind: ServiceKind }) =>
      api.post('/programs/services', {
        projectId: projects.data?.items[0]?.id ?? '',
        beneficiaryId,
        kind,
        serviceDate: TODAY(),
        details: 'ডেমো সেবা ভুক্তি',
      }),
    onSuccess: invalidate,
  });

  const addActivity = useMutation({
    mutationFn: () =>
      api.post('/programs/activities', {
        projectId: projects.data?.items[0]?.id ?? '',
        titleBn: 'স্বাস্থ্য ক্যাম্প',
        kind: 'health_camp',
        plannedDate: TODAY(),
        venue: 'গাজীপুর স্কুল মাঠ',
        targetParticipants: 80,
      }),
    onSuccess: invalidate,
  });
  const decideActivity = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.post(`/programs/activities/${id}/decision`, { status }),
    onSuccess: invalidate,
  });

  const createBatch = useMutation({
    mutationFn: () =>
      api.post('/programs/batches', {
        projectId: projects.data?.items[0]?.id ?? '',
        titleBn: 'হাঁস-মুরগি পালন প্রশিক্ষণ',
        trainerName: 'ড. আক্তার হোসেন',
        trainerOrgBn: 'প্রাণিসম্পদ অধিদপ্তর',
        startDate: TODAY(),
        endDate: TODAY(),
        hours: 24,
        sessions: 3,
      }),
    onSuccess: invalidate,
  });
  const markAttendance = useMutation({
    mutationFn: ({ batchId, beneficiaryId, sessionNo, present }: { batchId: string; beneficiaryId: string; sessionNo: number; present: boolean }) =>
      api.put(`/programs/batches/${batchId}/attendance`, { beneficiaryId, sessionNo, present }),
    onSuccess: invalidate,
  });
  const setScore = useMutation({
    mutationFn: ({ batchId, beneficiaryId, pre, post }: { batchId: string; beneficiaryId: string; pre: number; post: number }) =>
      api.put(`/programs/batches/${batchId}/scores`, { beneficiaryId, pre, post }),
    onSuccess: invalidate,
  });
  const issueCert = useMutation({
    mutationFn: ({ batchId, beneficiaryId }: { batchId: string; beneficiaryId: string }) =>
      api.post(`/programs/batches/${batchId}/certificates`, { beneficiaryId }),
    onSuccess: invalidate,
  });

  const projectOf = (id: string) => projects.data?.items.find((p) => p.id === id);
  const benOf = (id: string) => beneficiaries.data?.items.find((b) => b.id === id);
  const activeProject = projects.data?.items.find((p) => p.status === 'active') ?? projects.data?.items[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">প্রোগ্রাম ও প্রকল্প (উন্নয়ন কার্যক্রম)</h1>
        <Sprout className="h-5 w-5 text-muted-foreground" />
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
          {/* ── Tab 1: project register ── */}
          {tab === 'projects' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">নতুন প্রকল্প (দাতা · অনুদান চুক্তি · বাজেট · রেস্ট্রিক্টেড ফান্ড কোড)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label htmlFor="pj-code">কোড</Label>
                      <Input id="pj-code" value={projForm.code} onChange={(e) => setProjForm((f) => ({ ...f, code: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pj-name">নাম (বাংলা)</Label>
                      <Input id="pj-name" value={projForm.nameBn} onChange={(e) => setProjForm((f) => ({ ...f, nameBn: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pj-nameEn">নাম (English)</Label>
                      <Input id="pj-nameEn" value={projForm.nameEn} onChange={(e) => setProjForm((f) => ({ ...f, nameEn: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pj-sector">খাত</Label>
                      <select
                        id="pj-sector"
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={projForm.sector}
                        onChange={(e) => setProjForm((f) => ({ ...f, sector: e.target.value as ProgramSector }))}
                      >
                        {(Object.keys(SECTOR_LABELS_BN) as ProgramSector[]).map((s) => (
                          <option key={s} value={s}>{SECTOR_LABELS_BN[s]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pj-donor">দাতা</Label>
                      <Input id="pj-donor" value={projForm.donor} onChange={(e) => setProjForm((f) => ({ ...f, donor: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pj-grant">অনুদান চুক্তি নং</Label>
                      <Input id="pj-grant" value={projForm.grantAgreementNo} onChange={(e) => setProjForm((f) => ({ ...f, grantAgreementNo: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pj-fund">ফান্ড কোড (মডিউল ১০)</Label>
                      <Input id="pj-fund" value={projForm.fundCode} onChange={(e) => setProjForm((f) => ({ ...f, fundCode: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pj-manager">প্রকল্প ব্যবস্থাপক</Label>
                      <Input id="pj-manager" value={projForm.managerName} onChange={(e) => setProjForm((f) => ({ ...f, managerName: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pj-start">শুরু</Label>
                      <Input id="pj-start" type="date" value={projForm.startDate} onChange={(e) => setProjForm((f) => ({ ...f, startDate: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pj-end">শেষ</Label>
                      <Input id="pj-end" type="date" value={projForm.endDate} onChange={(e) => setProjForm((f) => ({ ...f, endDate: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pj-areas">লক্ষ্য এলাকা (কমা দিয়ে)</Label>
                      <Input id="pj-areas" value={projForm.targetAreas} onChange={(e) => setProjForm((f) => ({ ...f, targetAreas: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pj-target">লক্ষ্য উপকারভোগী</Label>
                      <Input id="pj-target" type="number" min="0" value={projForm.targetBeneficiaries} onChange={(e) => setProjForm((f) => ({ ...f, targetBeneficiaries: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pj-bi">বাজেট লাইন</Label>
                      <Input id="pj-bi" value={projForm.budgetItem} onChange={(e) => setProjForm((f) => ({ ...f, budgetItem: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pj-ba">বাজেট (৳)</Label>
                      <Input id="pj-ba" type="number" min="0" value={projForm.budgetAmount} onChange={(e) => setProjForm((f) => ({ ...f, budgetAmount: e.target.value }))} />
                    </div>
                  </div>
                  <Button disabled={busy} onClick={() => act(() => createProject.mutateAsync())}>প্রকল্প তৈরি করুন</Button>
                </CardContent>
              </Card>

              {(projects.data?.items ?? []).map((p) => (
                <Card key={p.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                      <span className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" /> {p.code} — {p.nameBn}
                        <Pill label={PROJECT_STATUS_LABELS_BN[p.status]} tone={STATUS_TONE[p.status]} />
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {p.status === 'proposed' && (
                          <Button size="sm" disabled={busy} onClick={() => act(() => decideProject.mutateAsync({ id: p.id, action: 'activate' }))}>চালু করুন</Button>
                        )}
                        {p.status === 'active' && (
                          <>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideProject.mutateAsync({ id: p.id, action: 'suspend' }))}>স্থগিত</Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideProject.mutateAsync({ id: p.id, action: 'close' }))}>বন্ধ করুন</Button>
                          </>
                        )}
                        {p.status === 'suspended' && (
                          <Button size="sm" disabled={busy} onClick={() => act(() => decideProject.mutateAsync({ id: p.id, action: 'resume' }))}>পুনরায় চালু</Button>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded border p-2">দাতা: <b>{p.donor}</b></div>
                      <div className="rounded border p-2">চুক্তি: <span className="font-mono text-xs">{p.grantAgreementNo}</span></div>
                      <div className="rounded border p-2">খাত: {SECTOR_LABELS_BN[p.sector]}</div>
                      <div className="rounded border p-2">ফান্ড কোড: <span className="font-mono text-xs text-teal-700">{p.fundCode}</span></div>
                      <div className="rounded border p-2">মেয়াদ: {p.startDate} → {p.endDate}</div>
                      <div className="rounded border p-2">এলাকা: {p.targetAreas.join(', ')}</div>
                      <div className="rounded border p-2">লক্ষ্য: {p.targetBeneficiaries} জন</div>
                      <div className="rounded border p-2">বাজেট: <b className="tabular-nums">{money(p.budgetTotal)}</b> ({p.budget.map((b) => b.lineItem).join(', ')})</div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      ব্যবস্থাপক: {p.managerName} · ফান্ড কোড দিয়ে মডিউল ১০-এ তহবিল বিবরণী (journal lines tagged {p.fundCode}) দেখা যায়।
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* ── Tab 2: logframe ── */}
          {tab === 'logframe' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">লগফ্রেম (লক্ষ্য · উদ্দেশ্য · আউটপুট · সূচক)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="lf-project">প্রকল্প</Label>
                      <select
                        id="lf-project"
                        className="h-9 w-64 rounded-md border bg-background px-2 text-sm"
                        value={logframeProject}
                        onChange={(e) => setLogframeProject(e.target.value)}
                      >
                        <option value="">— নির্বাচন করুন —</option>
                        {(projects.data?.items ?? []).map((p) => (
                          <option key={p.id} value={p.id}>{p.code} — {p.nameBn}</option>
                        ))}
                      </select>
                    </div>
                    {logframeProject && (
                      <>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => addLogframe.mutateAsync({ level: 'output', statement: '৩০০ জন প্রশিক্ষণ সম্পন্ন', parentLabel: 'OBJ-1', meansOfVerification: 'ব্যাচ রেকর্ড' }))}>
                          আউটপুট যোগ
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => addLogframe.mutateAsync({ level: 'indicator', statement: 'প্রশিক্ষণপ্রাপ্ত উপকারভোগী', indicatorCode: 'IND-1', baseline: '0', targetValue: '300', unit: 'জন', meansOfVerification: 'উপস্থিতি তালিকা' }))}>
                          সূচক যোগ (লক্ষ্য ৩০০)
                        </Button>
                      </>
                    )}
                  </div>

                  {logframe.data && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b text-muted-foreground">
                          <tr>
                            <Th>স্তর</Th>
                            <Th>বিবরণ</Th>
                            <Th right>বেসলাইন</Th>
                            <Th right>লক্ষ্য</Th>
                            <Th right>অর্জিত</Th>
                            <Th right>অগ্রগতি</Th>
                            <Th>প্রমাণ (MoV)</Th>
                            <Th>মাপ যোগ</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {logframe.data.entries.map((e) => {
                            const vals = logframe.data!.values.filter((v) => v.entryId === e.id);
                            const achieved = vals.reduce((s, v) => s + Number(v.value), 0);
                            const target = Number(e.targetValue) || 0;
                            const pct = target > 0 ? Math.min(100, (achieved / target) * 100) : 0;
                            return (
                              <tr key={e.id} className="border-b last:border-0 align-top">
                                <Td><Pill label={e.level === 'indicator' ? 'সূচক' : e.level === 'output' ? 'আউটপুট' : e.level === 'objective' ? 'উদ্দেশ্য' : 'লক্ষ্য'} tone={e.level === 'indicator' ? 'amber' : 'muted'} /></Td>
                                <Td>
                                  {e.statement}
                                  {e.indicatorCode && <div className="font-mono text-xs text-muted-foreground">{e.indicatorCode}</div>}
                                </Td>
                                <Td right>{e.baseline}</Td>
                                <Td right>{e.targetValue}{e.unit ? ` ${e.unit}` : ''}</Td>
                                <Td right>{vals.length ? achieved.toFixed(0) : '—'}</Td>
                                <Td right>
                                  {e.level === 'indicator' && target > 0 ? (
                                    <span className={pct >= 100 ? 'font-semibold text-emerald-700' : ''}>{pct.toFixed(0)}%</span>
                                  ) : '—'}
                                </Td>
                                <Td className="text-xs">
                                  {e.meansOfVerification}
                                  {vals.some((v) => v.evidence.length > 0) && <div className="text-teal-700">📎 {vals.reduce((s, v) => s + v.evidence.length, 0)} প্রমাণ</div>}
                                </Td>
                                <Td>
                                  {e.level === 'indicator' && (
                                    <div className="flex gap-1">
                                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => addIndicatorValue.mutateAsync({ entryId: e.id, value: '120' }))}>+১২০</Button>
                                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => addIndicatorValue.mutateAsync({ entryId: e.id, value: '60' }))}>+৬০</Button>
                                    </div>
                                  )}
                                </Td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {logframe.data.entries.length === 0 && <p className="py-3 text-sm text-muted-foreground">লগফ্রেম খালি — উপরের বাটনে যোগ করুন।</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Tab 3: beneficiaries & services ── */}
          {tab === 'beneficiaries' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">উপকারভোগী নিবন্ধন (সদস্য যুক্ত করা যায়)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <div className="space-y-1">
                      <Label htmlFor="bn-name">নাম</Label>
                      <Input id="bn-name" value={benForm.nameBn} onChange={(e) => setBenForm((f) => ({ ...f, nameBn: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="bn-guardian">অভিভাবক</Label>
                      <Input id="bn-guardian" value={benForm.guardianBn} onChange={(e) => setBenForm((f) => ({ ...f, guardianBn: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="bn-phone">মোবাইল</Label>
                      <Input id="bn-phone" value={benForm.phone} onChange={(e) => setBenForm((f) => ({ ...f, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="bn-age">বয়স</Label>
                      <Input id="bn-age" type="number" min="0" value={benForm.age} onChange={(e) => setBenForm((f) => ({ ...f, age: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="bn-village">গ্রাম</Label>
                      <Input id="bn-village" value={benForm.village} onChange={(e) => setBenForm((f) => ({ ...f, village: e.target.value }))} />
                    </div>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={benForm.linked} onChange={(e) => setBenForm((f) => ({ ...f, linked: e.target.checked }))} /> সদস্য লিংক
                      </label>
                    </div>
                  </div>
                  <Button disabled={busy} onClick={() => act(() => createBeneficiary.mutateAsync())}>নিবন্ধন করুন</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2"><Users className="h-4 w-4" /> তালিকা ({beneficiaries.data?.items.length ?? 0})</span>
                    {activeProject && (
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => enroll.mutateAsync({ beneficiaryId: beneficiaries.data!.items[0]!.id, projectId: activeProject.id }))}>
                        প্রথমজনকে {activeProject.code}-এ ভর্তি করুন
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>কোড</Th>
                        <Th>নাম</Th>
                        <Th>অভিভাবক</Th>
                        <Th right>বয়স</Th>
                        <Th>লিঙ্গ</Th>
                        <Th>গ্রাম</Th>
                        <Th>সদস্য?</Th>
                        <Th>ভর্তি প্রকল্প</Th>
                        <Th>সেবা</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(beneficiaries.data?.items ?? []).map((b) => {
                        const enrolled = (enrollments.data?.items ?? []).filter((e) => e.beneficiaryId === b.id);
                        const served = (services.data?.items ?? []).filter((s) => s.beneficiaryId === b.id);
                        return (
                          <tr key={b.id} className="border-b last:border-0">
                            <Td><span className="font-mono text-xs">{b.code}</span></Td>
                            <Td>{b.nameBn}</Td>
                            <Td className="text-xs">{b.guardianBn || '—'}</Td>
                            <Td right>{b.age}</Td>
                            <Td>{GENDER_LABELS_BN[b.gender]}</Td>
                            <Td className="text-xs">{b.village}</Td>
                            <Td>{b.memberId ? <Pill label="সদস্য" tone="green" /> : <span className="text-xs text-muted-foreground">—</span>}</Td>
                            <Td className="text-xs">{enrolled.map((e) => projectOf(e.projectId)?.code ?? '?').join(', ') || '—'}</Td>
                            <Td>
                              <div className="flex flex-wrap gap-1">
                                {served.length > 0 && <Pill label={`${served.length} সেবা`} tone="green" />}
                                {(['training', 'health_camp', 'kit_distribution'] as ServiceKind[]).map((k) => (
                                  <Button key={k} size="sm" variant="ghost" disabled={busy} onClick={() => act(() => logService.mutateAsync({ beneficiaryId: b.id, kind: k }))}>
                                    +{SERVICE_LABELS_BN[k]}
                                  </Button>
                                ))}
                              </div>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(beneficiaries.data?.items ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">কোনো উপকারভোগী নেই।</p>}
                  <p className="mt-2 text-xs text-muted-foreground">
                    সেবা ধরন: {Object.values(SERVICE_LABELS_BN).join(' · ')} — প্রতিটি ভুক্তি প্রকল্প ও তারিখসহ সংরক্ষিত হয়।
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Tab 4: activity calendar ── */}
          {tab === 'activities' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> ক্যালেন্ডার স্লাইস</span>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => addActivity.mutateAsync())}>নমুনা কার্যক্রম যোগ</Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="cal-start">শুরু</Label>
                      <Input id="cal-start" type="date" value={calStart} onChange={(e) => setCalStart(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cal-end">শেষ</Label>
                      <Input id="cal-end" type="date" value={calEnd} onChange={(e) => setCalEnd(e.target.value)} />
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>তারিখ</Th>
                        <Th>কার্যক্রম</Th>
                        <Th>ধরন</Th>
                        <Th>স্থান</Th>
                        <Th right>লক্ষ্য</Th>
                        <Th>প্রকল্প</Th>
                        <Th>অবস্থা</Th>
                        <Th>কর্ম</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(activities.data?.items ?? []).map((a) => (
                        <tr key={a.id} className="border-b last:border-0">
                          <Td className="whitespace-nowrap text-xs">{a.plannedDate}</Td>
                          <Td>{a.titleBn}</Td>
                          <Td>{SERVICE_LABELS_BN[a.kind]}</Td>
                          <Td className="text-xs">{a.venue || '—'}</Td>
                          <Td right>{a.targetParticipants}</Td>
                          <Td className="text-xs">{projectOf(a.projectId)?.code ?? '—'}</Td>
                          <Td><Pill label={ACTIVITY_STATUS_LABELS_BN[a.status]} tone={STATUS_TONE[a.status]} /></Td>
                          <Td>
                            {a.status === 'planned' && (
                              <div className="flex gap-1">
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideActivity.mutateAsync({ id: a.id, status: 'done' }))}>সম্পন্ন</Button>
                                <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideActivity.mutateAsync({ id: a.id, status: 'cancelled' }))}>বাতিল</Button>
                              </div>
                            )}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(activities.data?.items ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">এই সময়ে কোনো কার্যক্রম নেই।</p>}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Tab 5: training batches ── */}
          {tab === 'training' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2"><Award className="h-4 w-4" /> প্রশিক্ষণ ব্যাচ</span>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => createBatch.mutateAsync())}>নমুনা ব্যাচ তৈরি</Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>কোড</Th>
                        <Th>বিষয়</Th>
                        <Th>প্রশিক্ষক</Th>
                        <Th>প্রকল্প</Th>
                        <Th right>ঘণ্টা</Th>
                        <Th right>সেশন</Th>
                        <Th>মেয়াদ</Th>
                        <Th>কর্ম</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(batches.data?.items ?? []).map((b) => (
                        <tr key={b.id} className="border-b last:border-0">
                          <Td><span className="font-mono text-xs">{b.code}</span></Td>
                          <Td>{b.titleBn}</Td>
                          <Td className="text-xs">{b.trainerName}{b.trainerOrgBn ? ` · ${b.trainerOrgBn}` : ''}</Td>
                          <Td className="text-xs">{projectOf(b.projectId)?.code ?? '—'}</Td>
                          <Td right>{b.hours}</Td>
                          <Td right>{b.sessions}</Td>
                          <Td className="text-xs">{b.startDate} → {b.endDate}</Td>
                          <Td><Button size="sm" variant="outline" onClick={() => setBatchDetailId(b.id)}>খুলুন</Button></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(batches.data?.items ?? []).length === 0 && <p className="py-3 text-sm text-muted-foreground">কোনো ব্যাচ নেই।</p>}
                </CardContent>
              </Card>

              {batchDetail.data && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                      <span className="flex items-center gap-2"><Target className="h-4 w-4" /> {batchDetail.data.batch.code} — {batchDetail.data.batch.titleBn}</span>
                      <Pill
                        label={`উপস্থিতি ${batchDetail.data.stats.avgAttendancePct}% · প্রি ${batchDetail.data.stats.avgPre} → পোস্ট ${batchDetail.data.stats.avgPost} (+${batchDetail.data.stats.avgGainPct}%) · সার্টিফিকেট ${batchDetail.data.stats.certificates}`}
                        tone="amber"
                      />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {(beneficiaries.data?.items ?? []).map((b) => (
                        <span key={b.id} className="flex items-center gap-1 rounded border px-2 py-1">
                          {b.nameBn}
                          <button className="text-teal-700 underline" disabled={busy} onClick={() => act(() => markAttendance.mutateAsync({ batchId: batchDetailId, beneficiaryId: b.id, sessionNo: 1, present: true }))}>
                            সেশন-১ উপস্থিত
                          </button>
                          <button className="text-teal-700 underline" disabled={busy} onClick={() => act(() => markAttendance.mutateAsync({ batchId: batchDetailId, beneficiaryId: b.id, sessionNo: 2, present: true }))}>
                            সেশন-২
                          </button>
                          <button className="text-teal-700 underline" disabled={busy} onClick={() => act(() => setScore.mutateAsync({ batchId: batchDetailId, beneficiaryId: b.id, pre: 45, post: 78 }))}>
                            নম্বর ৪৫→৭৮
                          </button>
                          <button className="font-medium text-emerald-700 underline" disabled={busy} onClick={() => act(() => issueCert.mutateAsync({ batchId: batchDetailId, beneficiaryId: b.id }))}>
                            সার্টিফিকেট
                          </button>
                        </span>
                      ))}
                    </div>
                    <table className="w-full text-sm">
                      <thead className="border-b text-muted-foreground">
                        <tr>
                          <Th>উপকারভোগী</Th>
                          <Th right>উপস্থিতি</Th>
                          <Th right>প্রি</Th>
                          <Th right>পোস্ট</Th>
                          <Th>সার্টিফিকেট</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {(beneficiaries.data?.items ?? []).map((b) => {
                          const marks = batchDetail.data!.attendance.filter((a) => a.beneficiaryId === b.id);
                          const present = marks.filter((a) => a.present).length;
                          const score = batchDetail.data!.scores.find((s) => s.beneficiaryId === b.id);
                          const cert = (certificates.data?.items ?? []).find((c) => c.beneficiaryId === b.id && c.batchId === batchDetailId);
                          return (
                            <tr key={b.id} className="border-b last:border-0">
                              <Td>{b.nameBn} <span className="font-mono text-xs text-muted-foreground">{b.code}</span></Td>
                              <Td right>{marks.length ? `${present}/${marks.length}` : '—'}</Td>
                              <Td right>{score?.pre ?? '—'}</Td>
                              <Td right>{score?.post ?? '—'}</Td>
                              <Td>
                                {cert ? (
                                  <Link className="text-xs font-medium text-teal-700 underline" to={`/programs/certificates/${cert.id}/print`}>
                                    {cert.certNo} — প্রিন্ট
                                  </Link>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <p className="text-xs text-muted-foreground">
                      সার্টিফিকেটের শর্ত: ন্যূনতম ৬০% উপস্থিতি এবং পোস্ট-টেস্টে ৪০+ নম্বর; একজনে একটিই সার্টিফিকেট।
                    </p>
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
