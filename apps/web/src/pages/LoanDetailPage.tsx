import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CheckCircle2, Circle, FileText, Loader2 } from 'lucide-react';
import type { LoanCycleSummary, LoanSchedule, LoanStage, LoanTimelineEntry, UtilizationReport } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

interface StepRow {
  id: string;
  stage: LoanStage;
  action: string;
  actorRole: string;
  note: string | null;
  createdAt: string;
}

interface ApplicationDetail {
  id: string;
  applicationNumber: string;
  requestedAmount: string;
  purpose: string;
  status: string;
  termMonths: number;
  decisionReason: string | null;
  memberName: string;
  memberCode: string;
  productName: string | null;
  steps: StepRow[];
  cycle: LoanCycleSummary | null;
  utilization: UtilizationReport | null;
}

const STAGE_BN: Record<LoanStage, string> = {
  member_request: 'সদস্যের আবেদন',
  officer_visit: 'অফিসার পরিদর্শন ও উদ্যোগ মূল্যায়ন',
  household_check: 'গার্হস্থ্য আয় ও শোধক্ষমতা যাচাই',
  guarantor: 'গ্যারান্টর',
  bm_review: 'শাখা ব্যবস্থাপকের পর্যালোচনা',
  am_review: 'এরিয়া ব্যবস্থাপকের অনুমোদন',
  decision: 'চূড়ান্ত সিদ্ধান্ত',
};

const OFFICER_STAGES: LoanStage[] = ['officer_visit', 'household_check', 'guarantor'];

export function LoanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const fmt = useMoneyFormatter();

  const app = useQuery({
    queryKey: ['loan-application', id],
    enabled: id !== undefined,
    queryFn: () => api.get<ApplicationDetail>(`/loans/applications/${id}`),
  });
  const schedule = useQuery({
    queryKey: ['loan-schedule', id],
    enabled: id !== undefined && ['approved', 'disbursed', 'closed'].includes(app.data?.status ?? ''),
    queryFn: () => api.get<LoanSchedule>(`/loans/applications/${id}/schedule`),
  });
  const timeline = useQuery({
    queryKey: ['loan-timeline', id],
    enabled: id !== undefined,
    queryFn: () => api.get<{ items: LoanTimelineEntry[]; applicationNumber: string; status: string }>(`/loans/applications/${id}/timeline`),
  });

  const [visitNote, setVisitNote] = useState('');
  const [hhIncome, setHhIncome] = useState('');
  const [hhDebt, setHhDebt] = useState('');
  const [gName, setGName] = useState('');
  const [gMobile, setGMobile] = useState('');
  const [gNid, setGNid] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [utCat, setUtCat] = useState('');
  const [utDesc, setUtDesc] = useState('');
  const [utAmount, setUtAmount] = useState('');
  const [utItems, setUtItems] = useState<Array<{ category: string; description: string; amount: string }>>([]);
  const [vNote, setVNote] = useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['loan-application', id] });
    void queryClient.invalidateQueries({ queryKey: ['loans-applications'] });
    void queryClient.invalidateQueries({ queryKey: ['loan-timeline', id] });
    void queryClient.invalidateQueries({ queryKey: ['loan-utilization', id] });
  };

  const step = useMutation({
    mutationFn: (body: { stage: LoanStage; note?: string; payload?: Record<string, unknown> }) =>
      api.post(`/loans/applications/${id}/steps`, body),
    onSuccess: () => { setError(null); invalidate(); },
    onError: (e) => setError((e as Error).message),
  });

  const decide = useMutation({
    mutationFn: (body: { decision: 'approve' | 'reject'; reason?: string }) =>
      api.post(`/loans/applications/${id}/decision`, body),
    onSuccess: () => { setError(null); invalidate(); },
    onError: (e) => setError((e as Error).message),
  });

  if (app.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }
  if (app.isError || !app.data) {
    return <p className="p-8 text-sm text-red-600">{(app.error as Error)?.message ?? 'পাওয়া যায়নি'}</p>;
  }

  const a = app.data;
  const doneStages = new Set(a.steps.filter((s) => s.action === 'done').map((s) => s.stage));
  const allStages: LoanStage[] = ['member_request', 'officer_visit', 'household_check', 'guarantor', 'bm_review', 'am_review'];
  const needsAm = Number(a.requestedAmount) > 100000; // matches default policy limit for display
  const visibleStages = allStages.filter((s) => (s === 'am_review' ? needsAm : true));
  const officerDone = OFFICER_STAGES.filter((s) => doneStages.has(s)).length;
  const nextOfficerStage = OFFICER_STAGES.find((s) => !doneStages.has(s)) ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/loans" className="text-sm text-muted-foreground hover:underline">← সকল আবেদন</Link>
        <h1 className="mt-1 text-2xl font-bold">{a.applicationNumber}</h1>
        <p className="text-sm text-muted-foreground">
          {a.memberName} ({a.memberCode}) · {a.productName} · {fmt(a.requestedAmount)} · {a.termMonths} মাস
        </p>
        <p className="mt-1 text-sm">{a.purpose}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Link
            to={`/loans/${a.id}/proposal`}
            className="inline-flex items-center gap-1.5 rounded-md border border-teal-300 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50"
          >
            <FileText className="h-4 w-4" /> ঋণের প্রস্তাব (প্রিন্ট/PDF)
          </Link>
          {a.status === 'approved' && (
            <Link
              to="/loans/disbursements"
              className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
            >
              <Banknote className="h-4 w-4" /> বিতরণের সারি (Disbursement)
            </Link>
          )}
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {a.status === 'rejected' && a.decisionReason && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">প্রত্যাখ্যানের কারণ: {a.decisionReason}</p>
      )}

      {/* ── Wizard checklist ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">আবেদনের ধাপসমূহ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {visibleStages.map((stage) => {
            const done = doneStages.has(stage) || (stage === 'member_request' && a.steps.length > 0);
            const stepRow = a.steps.find((s) => s.stage === stage);
            return (
              <div key={stage} className={`flex items-start gap-2 rounded-md border p-2.5 text-sm ${done ? 'border-emerald-200 bg-emerald-50' : 'bg-card'}`}>
                {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <div>
                  <p className="font-medium">{STAGE_BN[stage]}</p>
                  {stepRow?.note && <p className="text-xs text-muted-foreground">{stepRow.note}</p>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Loan cycle info (requirement 5) ──────────────────────────── */}
      {a.cycle && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">ঋণ চক্র (Loan cycle)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div><p className="text-xs text-muted-foreground">চক্র নম্বর</p><p className="font-semibold">{a.cycle.cycleNumber}</p></div>
              <div><p className="text-xs text-muted-foreground">সম্পন্ন চক্র</p><p className="font-semibold">{a.cycle.completedCycles}</p></div>
              <div><p className="text-xs text-muted-foreground">বর্তমান সীমা</p><p className="font-semibold">{fmt(a.cycle.currentCapBdt)}</p></div>
              <div><p className="text-xs text-muted-foreground">যথাসময়ে পরিশোধ</p><p className="font-semibold">{a.cycle.repaidOnTime}{a.cycle.everOverdue > 0 ? ` (${a.cycle.everOverdue} বিলম্ব)` : ''}</p></div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Loan cycle + governance snapshot ─────────────────────────────── */}
      {a.cycle && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">ঋণ-চক্র অবস্থা (Loan cycle)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">বর্তমান চক্র</p>
                <p className="text-lg font-bold">#{a.cycle.cycleNumber}</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">সম্পন্ন চক্র</p>
                <p className="text-lg font-bold">{a.cycle.completedCycles}</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">সর্বোচ্চ সীমা</p>
                <p className="text-lg font-bold">{fmt(a.cycle.currentCapBdt)}</p>
              </div>
              <div className="rounded-md border p-2.5">
                <p className="text-xs text-muted-foreground">সময়মতো / বিলম্ব</p>
                <p className="text-lg font-bold">{a.cycle.repaidOnTime} / {a.cycle.everOverdue}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Utilization plan (capture now, verify later) ─────────────────── */}
      {a.utilization && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">ঋণের ব্যবহার পরিকল্পনা (Utilization)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5">খাত</th>
                  <th className="py-1.5 text-right">পরিকল্পিত</th>
                  <th className="py-1.5 text-right">যাচাইকৃত</th>
                  <th className="py-1.5 text-right">ব্যবধান</th>
                </tr>
              </thead>
              <tbody>
                {a.utilization.items.map((item) => {
                  const verified = a.utilization!.verifiedAt !== null;
                  return (
                    <tr key={item.category} className="border-b last:border-0">
                      <td className="py-1.5 font-medium">{item.category}</td>
                      <td className="py-1.5 text-right">{fmt(item.plannedAmount)}</td>
                      <td className="py-1.5 text-right">{verified ? fmt(item.verifiedAmount) : '—'}</td>
                      <td className={`py-1.5 text-right ${Number(item.variance) < 0 ? 'text-red-600' : Number(item.variance) > 0 ? 'text-emerald-700' : ''}`}>
                        {verified ? fmt(item.variance) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {a.utilization.verifiedAt ? (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                যাচাই সম্পন্ন: {new Date(a.utilization.verifiedAt).toLocaleDateString('bn-BD')}
                {a.utilization.verifierNote ? ` — ${a.utilization.verifierNote}` : ''}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">মোট পরিকল্পিত: {fmt(a.utilization.plannedTotal)} — বিতরণের পর যাচাই হবে</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Officer phase forms ──────────────────────────────────────────── */}
      {['submitted', 'officer_review'].includes(a.status) && nextOfficerStage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">{STAGE_BN[nextOfficerStage]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {nextOfficerStage === 'officer_visit' && (
              <>
                <div className="space-y-1.5">
                  <Label>পরিদর্শনের নোট (উদ্যোগ মূল্যায়ন)</Label>
                  <Input value={visitNote} onChange={(e) => setVisitNote(e.target.value)} placeholder="দোকান পরিদর্শন করা হয়েছে…" />
                </div>
                <Button
                  className="bg-teal-600 hover:bg-teal-700"
                  disabled={visitNote.trim().length < 2 || step.isPending}
                  onClick={() => step.mutate({ stage: 'officer_visit', payload: { visitNote } })}
                >
                  সম্পন্ন করুন
                </Button>
              </>
            )}
            {nextOfficerStage === 'household_check' && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>মাসিক গার্হস্থ্য আয় (৳)</Label>
                    <Input type="number" value={hhIncome} onChange={(e) => setHhIncome(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>মাসিক ঋণ কিস্তি (৳)</Label>
                    <Input type="number" value={hhDebt} onChange={(e) => setHhDebt(e.target.value)} />
                  </div>
                </div>
                <Button
                  className="bg-teal-600 hover:bg-teal-700"
                  disabled={!hhIncome || !hhDebt || step.isPending}
                  onClick={() =>
                    step.mutate({
                      stage: 'household_check',
                      payload: { householdCheck: { monthlyIncomeBdt: hhIncome, monthlyDebtServiceBdt: hhDebt, otherMfiLoans: 0 } },
                    })
                  }
                >
                  সম্পন্ন করুন
                </Button>
              </>
            )}
            {nextOfficerStage === 'guarantor' && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>গ্যারান্টরের নাম</Label>
                    <Input value={gName} onChange={(e) => setGName(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>মোবাইল (01XXXXXXXXX)</Label>
                    <Input value={gMobile} onChange={(e) => setGMobile(e.target.value)} placeholder="01712345678" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>NID শেষ ৪ ডিজিট</Label>
                    <Input value={gNid} onChange={(e) => setGNid(e.target.value)} maxLength={4} />
                  </div>
                </div>
                <Button
                  className="bg-teal-600 hover:bg-teal-700"
                  disabled={gName.trim().length < 3 || !/^01[3-9]\d{8}$/.test(gMobile) || !/^\d{4}$/.test(gNid) || step.isPending}
                  onClick={() =>
                    step.mutate({
                      stage: 'guarantor',
                      payload: { guarantor: { name: gName, relation: 'other', mobile: gMobile, nidLast4: gNid, isMember: false, consentGiven: true } },
                    })
                  }
                >
                  গ্যারান্টর যোগ করুন
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Branch manager review ────────────────────────────────────────── */}
      {a.status === 'bm_review' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">শাখা ব্যবস্থাপকের পর্যালোচনা</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              অফিসার পর্যায় সম্পন্ন ({officerDone}/{OFFICER_STAGES.length})।
              {Number(a.requestedAmount) > 100000
                ? ' পরিমাণ সীমার ঊর্ধ্বে — অনুমোদন এরিয়া ব্যবস্থাপকের কাছে যাবে।'
                : ' সীমার মধ্যে — সরাসরি অনুমোদন করা যাবে।'}
            </p>
            <div className="flex gap-2">
              <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={decide.isPending} onClick={() => decide.mutate({ decision: 'approve' })}>
                অনুমোদন / এগিয়ে পাঠান
              </Button>
              <Button variant="outline" className="border-red-200 text-red-700" disabled={decide.isPending} onClick={() => decide.mutate({ decision: 'reject', reason: rejectReason || 'শাখা ব্যবস্থাপকের অনুমোদন নেই' })}>
                প্রত্যাখ্যান
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>প্রত্যাখ্যানের কারণ (ঐচ্ছিক)</Label>
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Area manager review ──────────────────────────────────────────── */}
      {a.status === 'am_review' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">এরিয়া ব্যবস্থাপকের অনুমোদন</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={decide.isPending} onClick={() => decide.mutate({ decision: 'approve' })}>
                চূড়ান্ত অনুমোদন
              </Button>
              <Button variant="outline" className="border-red-200 text-red-700" disabled={decide.isPending} onClick={() => decide.mutate({ decision: 'reject', reason: rejectReason || 'এরিয়া পর্যায়ে প্রত্যাখ্যাত' })}>
                প্রত্যাখ্যান
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label>প্রত্যাখ্যানের কারণ (ঐচ্ছিক)</Label>
              <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Schedule once approved ───────────────────────────────────────── */}
      {schedule.data && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">পরিশোধ সূচি</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              পদ্ধতি: {schedule.data.method === 'flat' ? 'ফ্ল্যাট' : 'declining balance'} · কিস্তি: {schedule.data.installmentCount} · মোট সুদ: {fmt(schedule.data.totalInterest)} · মোট পরিশোধযোগ্য: {fmt(schedule.data.totalPayable)}
            </p>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5">#</th>
                    <th className="py-1.5">তারিখ</th>
                    <th className="py-1.5 text-right">মূল</th>
                    <th className="py-1.5 text-right">সুদ</th>
                    <th className="py-1.5 text-right">মোট</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.data.installments.map((inst) => (
                    <tr key={inst.seq} className="border-b last:border-0">
                      <td className="py-1.5">{inst.seq}</td>
                      <td className="py-1.5 whitespace-nowrap">{inst.dueDate}</td>
                      <td className="py-1.5 text-right">{fmt(inst.principal)}</td>
                      <td className="py-1.5 text-right">{fmt(inst.interest)}</td>
                      <td className="py-1.5 text-right font-medium">{fmt(inst.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Status timeline (visible to all involved roles) ─────────────── */}
      {timeline.data && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">অবস্থার টাইমলাইন (Status timeline)</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-3 border-l-2 border-teal-100 pl-4">
              {timeline.data.items.map((entry) => (
                <li key={entry.id} className="relative">
                  <span
                    className={`absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-white ${
                      ['done', 'approved'].includes(entry.action) ? 'bg-teal-500' : entry.action === 'rejected' ? 'bg-red-500' : 'bg-muted-foreground'
                    }`}
                  />
                  <p className="text-sm font-medium">
                    {entry.stageBn}
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{entry.actorRole}</span>
                  </p>
                  {entry.note && <p className="text-xs text-muted-foreground">{entry.note}</p>}
                  <p className="text-xs text-muted-foreground">{new Date(entry.createdAt).toLocaleString('bn-BD')}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
