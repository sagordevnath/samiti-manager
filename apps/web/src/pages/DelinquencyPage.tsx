/**
 * ── Delinquency Management & Recovery page ───────────────────────────────────
 * Run summary cards (PAR1/30/90, provisioning), per-scope PAR rollups,
 * classification bucket table, escalating worklist with follow-up dialog,
 * and editable settings (buckets, provisioning %, escalation days).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Loader2, Phone, RefreshCw, Settings2, TrendingDown } from 'lucide-react';
import type {
  AssetClass,
  ClassifiedLoan,
  DelinquencySettings,
  FollowUpOutcome,
  FollowUpType,
  ParMetrics,
  WorklistItem,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const BUCKET_BN: Record<string, string> = {
  regular: 'নিয়মিত',
  d1_30: '১–৩০ দিন',
  d31_90: '৩১–৯০ দিন',
  d91_180: '৯১–১৮০ দিন',
  d180_plus: '১৮০+ দিন',
};

const CLASS_BN: Record<AssetClass, string> = {
  standard: 'মানসম্মত',
  substandard: 'অবনত',
  doubtful: 'সন্দেহজনক',
  bad: 'ক্ষতিগ্রস্ত',
};

const LEVEL_BN: Record<string, string> = {
  field_officer: 'ফিল্ড অফিসার',
  branch_manager: 'শাখা ব্যবস্থাপক',
  area_manager: 'এলাকা ব্যবস্থাপক',
};

const OUTCOME_BN: Record<FollowUpOutcome, string> = {
  promise_to_pay: 'পরিশোধের প্রতিশ্রুতি',
  partial_paid: 'আংশিক পরিশোধ',
  refused: 'অস্বীকৃতি',
  not_found: 'পাওয়া যায়নি',
  rescheduled: 'পুনঃনির্ধারিত',
  escalated: 'উর্ধ্বতনে প্রেরিত',
};

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

type Scope = 'org' | 'zone' | 'area' | 'branch' | 'samity' | 'officer';
const SCOPES: Scope[] = ['org', 'zone', 'area', 'branch', 'samity', 'officer'];
const SCOPE_BN: Record<Scope, string> = {
  org: 'সংস্থা',
  zone: 'অঞ্চল',
  area: 'এলাকা',
  branch: 'শাখা',
  samity: 'কেন্দ্র',
  officer: 'অফিসার',
};

export function DelinquencyPage() {
  const { t } = useTranslation();
  const money = useMoneyFormatter();
  const qc = useQueryClient();
  const [scope, setScope] = useState<Scope>('branch');
  const [followUpLoan, setFollowUpLoan] = useState<WorklistItem | null>(null);

  const runSummary = useQuery({
    queryKey: ['delinquency', 'run'],
    queryFn: () => api.get<{ run: { runDate: string; loansTotal: number; loansRisk: number; outstandingTotal: string; atRiskTotal: string; provisionTotal: string } }>('/delinquency/runs/latest'),
  });

  const par = useQuery({
    queryKey: ['delinquency', 'par', scope],
    queryFn: () => api.get<{ items: ParMetrics[] }>(`/delinquency/par?scope=${scope}`),
  });

  const loans = useQuery({
    queryKey: ['delinquency', 'loans'],
    queryFn: () => api.get<{ items: ClassifiedLoan[] }>('/delinquency/loans'),
  });

  const worklist = useQuery({
    queryKey: ['delinquency', 'worklist'],
    queryFn: () => api.get<{ items: WorklistItem[] }>('/delinquency/worklist'),
  });

  const settings = useQuery({
    queryKey: ['delinquency', 'settings'],
    queryFn: () => api.get<DelinquencySettings>('/delinquency/settings'),
  });

  const runNightly = useMutation({
    mutationFn: () => api.post('/delinquency/run', {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delinquency'] }),
  });

  if (runSummary.isLoading || par.isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> {t('common.loading')}
      </div>
    );
  }

  const run = runSummary.data?.run;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingDown className="h-6 w-6 text-rose-600" />
            অপরিশোধিত ঋণ ব্যবস্থাপনা
            <span className="text-sm font-normal text-muted-foreground">Delinquency &amp; Recovery</span>
          </h1>
          {run && (
            <p className="text-sm text-muted-foreground">
              সর্বশেষ রাত্রিক শ্রেণিবিন্যাস: {run.runDate} — {run.loansTotal} ঋণ, {run.loansRisk} ঝুঁকিপূর্ণ
            </p>
          )}
        </div>
        <Button onClick={() => runNightly.mutate()} disabled={runNightly.isPending} size="sm">
          {runNightly.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          রাত্রিক রান চালান
        </Button>
      </div>

      {/* Run summary cards */}
      {run && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">বকেয়া মূলধন</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">৳{money(run.outstandingTotal)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">ঝুঁকিপূর্ণ (PAR)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-rose-600">৳{money(run.atRiskTotal)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">সঞ্চিতি (Provision)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">৳{money(run.provisionTotal)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">ঝুঁকিপূর্ণ ঋণ</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {run.loansRisk}/{run.loansTotal}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* PAR by scope */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">ঝুঁকি মেট্রিক্স (PAR)</CardTitle>
          <div className="flex flex-wrap gap-1 pt-2">
            {SCOPES.map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  scope === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {SCOPE_BN[s]}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">নোড</th>
                <th className="py-2 pr-3">বকেয়া</th>
                <th className="py-2 pr-3">ঝুঁকি</th>
                <th className="py-2 pr-3">PAR১</th>
                <th className="py-2 pr-3">PAR৩০</th>
                <th className="py-2 pr-3">PAR৯০</th>
                <th className="py-2">সময়মতো পরিশোধ</th>
              </tr>
            </thead>
            <tbody>
              {(par.data?.items ?? []).map((m) => (
                <tr key={m.scopeId} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{m.scopeName}</td>
                  <td className="py-2 pr-3">৳{money(m.outstandingTotal)}</td>
                  <td className="py-2 pr-3 text-rose-600">৳{money(m.atRisk)}</td>
                  <td className="py-2 pr-3 font-medium">{pct(m.par1)}</td>
                  <td className="py-2 pr-3">{pct(m.par30)}</td>
                  <td className="py-2 pr-3">{pct(m.par90)}</td>
                  <td className="py-2">{pct(m.onTimeRepaymentRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Buckets */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">শ্রেণিবিন্যাস (বাকেট)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(
                (loans.data?.items ?? []).reduce<Record<string, { n: number; out: number }>>((acc, l) => {
                  const b = (acc[l.bucket] ??= { n: 0, out: 0 });
                  b.n += 1;
                  b.out += Number(l.outstanding);
                  return acc;
                }, {}),
              ).map(([bucket, v]) => (
                <div key={bucket} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                  <span className="text-sm font-medium">{BUCKET_BN[bucket] ?? bucket}</span>
                  <span className="text-sm text-muted-foreground">
                    {v.n} ঋণ · ৳{money(v.out.toFixed(2))}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Settings summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> নীতিমালা (সম্পাদনযোগ্য)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {settings.data && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">বাকেট সীমা (দিন)</span>
                  <span>
                    {settings.data.buckets.d1_30} / {settings.data.buckets.d31_90} / {settings.data.buckets.d91_180}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">সঞ্চিতি %</span>
                  <span>
                    {Object.entries(settings.data.provisioning)
                      .map(([k, v]) => `${CLASS_BN[k as AssetClass]} ${v}%`)
                      .join(' · ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">এস্কেলেশন</span>
                  <span>
                    BM {settings.data.escalateToBmDays} দিন · AM {settings.data.escalateToAmDays} দিন
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Worklist */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">অপরিশোধিত কার্যতালিকা</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(worklist.data?.items ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">কোনো বকেয়া কেস নেই / No open cases.</p>
          )}
          {(worklist.data?.items ?? []).map((item) => (
            <div key={item.loanId} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {item.memberName} <span className="text-xs text-muted-foreground">({item.memberCode})</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {item.loanNumber ?? item.loanId.slice(0, 8)} · {item.branchName} · অফিসার: {item.officerName ?? '—'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-bold text-rose-600">৳{money(item.overdueTotal)}</div>
                    <div className="text-xs text-muted-foreground">{item.daysPastDue} দিন বকেয়া</div>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                    {LEVEL_BN[item.assignedLevel]}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setFollowUpLoan(item)}>
                    <Phone className="h-3.5 w-3.5" /> ফলো-আপ
                  </Button>
                </div>
              </div>
              {item.followUpsCount > 0 && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {item.followUpsCount} ফলো-আপ · সর্বশেষ ফলাফল: {item.lastOutcome ? OUTCOME_BN[item.lastOutcome] : '—'}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {followUpLoan && (
        <FollowUpDialog
          item={followUpLoan}
          onClose={() => setFollowUpLoan(null)}
        />
      )}
    </div>
  );
}

/** Follow-up capture dialog: visit/call, promise-to-pay, next visit → task. */
function FollowUpDialog({ item, onClose }: { item: WorklistItem; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<FollowUpType>('visit');
  const [outcome, setOutcome] = useState<FollowUpOutcome>('promise_to_pay');
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseAmount, setPromiseAmount] = useState('');
  const [note, setNote] = useState('');
  const [nextVisitDate, setNextVisitDate] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/delinquency/follow-ups', {
        loanId: item.loanId,
        type,
        outcome,
        ...(outcome === 'promise_to_pay' && promiseDate ? { promiseDate, promiseAmount: promiseAmount || undefined } : {}),
        ...(nextVisitDate ? { nextVisitDate } : {}),
        ...(note ? { note } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delinquency'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6">
      <div className="w-full max-w-lg rounded-t-xl bg-white p-4 shadow-xl sm:rounded-xl">
        <h3 className="mb-1 text-lg font-semibold">ফলো-আপ রেকর্ড</h3>
        <p className="mb-3 text-sm text-muted-foreground">
          {item.memberName} · {item.loanNumber ?? ''} · ৳{(Number(item.overdueTotal)).toFixed(0)} বকেয়া
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              ধরন
              <select value={type} onChange={(e) => setType(e.target.value as FollowUpType)} className="mt-1 w-full rounded-md border px-2 py-2 text-sm">
                <option value="visit">সদস্য পরিদর্শন</option>
                <option value="phone_call">টেলিফোন কল</option>
                <option value="group_meeting">কেন্দ্র মিটিং</option>
                <option value="letter">চিঠি</option>
                <option value="legal_notice">আইনি নোটিশ</option>
              </select>
            </label>
            <label className="text-sm">
              ফলাফল
              <select value={outcome} onChange={(e) => setOutcome(e.target.value as FollowUpOutcome)} className="mt-1 w-full rounded-md border px-2 py-2 text-sm">
                {Object.entries(OUTCOME_BN).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {outcome === 'promise_to_pay' && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">
                প্রতিশ্রুত তারিখ
                <input type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-2 text-sm" />
              </label>
              <label className="text-sm">
                প্রতিশ্রুত অঙ্ক (৳)
                <input type="number" inputMode="decimal" value={promiseAmount} onChange={(e) => setPromiseAmount(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-2 text-sm" />
              </label>
            </div>
          )}

          <label className="block text-sm">
            পরবর্তী পরিদর্শন (রিমাইন্ডার তৈরি হবে)
            <div className="mt-1 flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <input type="date" value={nextVisitDate} onChange={(e) => setNextVisitDate(e.target.value)} className="flex-1 rounded-md border px-2 py-2 text-sm" />
            </div>
          </label>

          <label className="block text-sm">
            নোট
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full rounded-md border px-2 py-2 text-sm" />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            বাতিল
          </Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || (outcome === 'promise_to_pay' && !promiseDate)}>
            {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} সংরক্ষণ
          </Button>
        </div>
      </div>
    </div>
  );
}
