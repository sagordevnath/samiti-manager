/**
 * ── Delinquency Recovery page (requirements 5–9) ─────────────────────────────
 * Root-cause tagging, recovery actions (waiver, savings adjustment, legal
 * notice, write-off chain), provision proposals, early-warning panel,
 * heatmap (branch × bucket) and PAR trend charts (Recharts).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  FileWarning,
  HeartPulse,
  Loader2,
  RefreshCw,
  Scale,
  Stethoscope,
} from 'lucide-react';
import type {
  EarlyWarningSignal,
  HeatmapResponse,
  ProvisionProposal,
  RootCause,
  RootCauseTag,
  TrendResponse,
  WriteOffProposal,
} from '@samity/shared';
import { ROOT_CAUSE_LABELS_BN, ROOT_CAUSES } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const BUCKET_BN: Record<string, string> = {
  regular: 'নিয়মিত',
  d1_30: '১–৩০ দিন',
  d31_90: '৩১–৯০ দিন',
  d91_180: '৯১–১৮০ দিন',
  d180_plus: '১৮০+ দিন',
};

const KIND_BN: Record<string, string> = {
  member_missed_two: 'টানা দুই কিস্তি বকেয়া',
  samity_attendance_falling: 'কেন্দ্রের উপস্থিতি কমছে',
  officer_par_rising: 'অফিসারের PAR বাড়ছে',
};

/** Small inline status pill (no Badge component in this UI kit). */
function Pill({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className ?? ''}`}>
      {children}
    </span>
  );
}

const SEVERITY_STYLE: Record<string, string> = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-rose-100 text-rose-800',
};

const WOFF_STATUS_BN: Record<string, string> = {
  pending: 'অপেক্ষমাণ',
  recommended: 'সুপারিশকৃত',
  approved: 'অনুমোদিত',
  rejected: 'প্রত্যাখ্যাত',
};

/** Cell color from value share of the heatmap max (green → red). */
function heatColor(value: number, max: number): string {
  if (max <= 0) return 'bg-emerald-50';
  const t = value / max;
  if (t <= 0.001) return 'bg-emerald-50';
  if (t < 0.25) return 'bg-amber-100';
  if (t < 0.5) return 'bg-orange-200';
  if (t < 0.75) return 'bg-rose-300';
  return 'bg-rose-500 text-white';
}

export function RecoveryPage() {
  const { t: _t } = useTranslation();
  void _t;
  const money = useMoneyFormatter();
  const qc = useQueryClient();
  const [tagLoanId, setTagLoanId] = useState('');
  const [tagCause, setTagCause] = useState<RootCause>('business_failure');
  const [woLoanId, setWoLoanId] = useState('');
  const [woReason, setWoReason] = useState('');
  const [recoveryAmount, setRecoveryAmount] = useState('');

  // ── Read models ────────────────────────────────────────────────────────────
  const heatmap = useQuery({
    queryKey: ['recovery', 'heatmap'],
    queryFn: () => api.get<HeatmapResponse>('/delinquency/heatmap'),
  });
  const trends = useQuery({
    queryKey: ['recovery', 'trends'],
    queryFn: () => api.get<TrendResponse>('/delinquency/trends'),
  });
  const warnings = useQuery({
    queryKey: ['recovery', 'early-warning'],
    queryFn: () => api.get<{ items: EarlyWarningSignal[] }>('/delinquency/early-warning'),
  });
  const writeOffs = useQuery({
    queryKey: ['recovery', 'write-offs'],
    queryFn: () => api.get<{ items: WriteOffProposal[] }>('/delinquency/write-off-proposals'),
  });
  const provisions = useQuery({
    queryKey: ['recovery', 'provisions'],
    queryFn: () => api.get<{ items: ProvisionProposal[] }>('/delinquency/provision-proposals'),
  });
  const causes = useQuery({
    queryKey: ['recovery', 'root-causes'],
    queryFn: () => api.get<{ items: RootCauseTag[] }>('/delinquency/root-causes'),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['recovery'] });

  // ── Actions ────────────────────────────────────────────────────────────────
  const scan = useMutation({
    mutationFn: () => api.post('/delinquency/early-warning/scan', {}),
    onSuccess: invalidate,
  });
  const ack = useMutation({
    mutationFn: (id: string) => api.post(`/delinquency/early-warning/${id}/acknowledge`, {}),
    onSuccess: invalidate,
  });
  const tagCauseMutation = useMutation({
    mutationFn: () =>
      api.post('/delinquency/root-causes', { loanId: tagLoanId.trim(), cause: tagCause }),
    onSuccess: () => {
      setTagLoanId('');
      invalidate();
    },
  });
  const proposeWriteOff = useMutation({
    mutationFn: () =>
      api.post('/delinquency/write-off-proposals', {
        loanId: woLoanId.trim(),
        reason: woReason,
      }),
    onSuccess: () => {
      setWoLoanId('');
      setWoReason('');
      invalidate();
    },
  });
  const recommendWriteOff = useMutation({
    mutationFn: (id: string) =>
      api.post(`/delinquency/write-off-proposals/${id}/decision`, { decision: 'recommended' }),
    onSuccess: invalidate,
  });
  const approveWriteOff = useMutation({
    mutationFn: (id: string) =>
      api.post(`/delinquency/write-off-proposals/${id}/decision`, { decision: 'approved' }),
    onSuccess: invalidate,
  });
  const recoverWrittenOff = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: string }) =>
      api.post(`/delinquency/write-off-proposals/${id}/recoveries`, { amount }),
    onSuccess: () => {
      setRecoveryAmount('');
      invalidate();
    },
  });
  const proposeProvision = useMutation({
    mutationFn: () => api.post('/delinquency/provision-proposals', {}),
    onSuccess: invalidate,
  });
  const postProvision = useMutation({
    mutationFn: (id: string) => api.post(`/delinquency/provision-proposals/${id}/post`, {}),
    onSuccess: invalidate,
  });

  const loading =
    heatmap.isLoading || trends.isLoading || warnings.isLoading || writeOffs.isLoading || provisions.isLoading;
  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> লোড হচ্ছে…
      </div>
    );
  }

  const hm = heatmap.data;
  const branches = [...new Set((hm?.cells ?? []).map((c) => c.branchId))];
  const branchName = (id: string) => hm?.cells.find((c) => c.branchId === id)?.branchName ?? id.slice(0, 8);
  const cellFor = (branchId: string, bucket: string) =>
    hm?.cells.find((c) => c.branchId === branchId && c.bucket === bucket);
  const trendData = (trends.data?.points ?? []).map((p) => ({
    date: p.runDate.slice(5),
    par1: Number((p.par1 * 100).toFixed(1)),
    par30: Number((p.par30 * 100).toFixed(1)),
    par90: Number((p.par90 * 100).toFixed(1)),
  }));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <HeartPulse className="h-6 w-6 text-rose-600" />
            উদ্ধার ও প্রাথমিক সতর্কতা
            <span className="text-sm font-normal text-muted-foreground">Recovery &amp; Early Warning</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => scan.mutate()} disabled={scan.isPending} size="sm" variant="outline">
            {scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
            সতর্কতা স্ক্যান
          </Button>
          <Button onClick={() => proposeProvision.mutate()} disabled={proposeProvision.isPending} size="sm">
            {proposeProvision.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
            সঞ্চিতি প্রস্তাব
          </Button>
        </div>
      </div>

      {/* ── 9) Heatmap: branch × bucket ─────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">ঝুঁকি হিটম্যাপ (শাখা × বাকেট)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">শাখা</th>
                {(hm?.buckets ?? []).map((b) => (
                  <th key={b} className="py-2 pr-3">
                    {BUCKET_BN[b] ?? b}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branches.map((bid) => (
                <tr key={bid} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-medium">{branchName(bid)}</td>
                  {(hm?.buckets ?? []).map((b) => {
                    const cell = cellFor(bid, b);
                    const v = cell ? Number(cell.value) : 0;
                    return (
                      <td key={b} className="py-2 pr-3">
                        <div
                          className={`rounded-md px-3 py-2 text-center font-medium ${heatColor(v, Number(hm?.max ?? 0))}`}
                          title={`${cell?.loans ?? 0} ঋণ`}
                        >
                          {v > 0 ? money(v.toFixed(2)) : '—'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── 9) PAR trend ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">PAR প্রবণতা (রান অনুযায়ী)</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length < 2 ? (
              <p className="text-sm text-muted-foreground">প্রবণতার জন্য অন্তত দুটি রাত্রিক রান প্রয়োজন।</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="date" fontSize={11} />
                  <YAxis fontSize={11} unit="%" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="par1" name="PAR১" stroke="#f59e0b" strokeWidth={2} />
                  <Line type="monotone" dataKey="par30" name="PAR৩০" stroke="#ef4444" strokeWidth={2} />
                  <Line type="monotone" dataKey="par90" name="PAR৯০" stroke="#7c3aed" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── 7) Provision proposals ──────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">ঋণ ক্ষতি সঞ্চিতি (প্রস্তাব → পোস্টিং)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(provisions.data?.items ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">কোনো প্রস্তাব নেই — উপরের বোতাম থেকে তৈরি করুন।</p>
            )}
            {(provisions.data?.items ?? []).map((p) => (
              <div key={p.id} className="rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">
                      {p.runDate} — মোট {money(p.provisionTotal)}
                      {Number(p.provisionExpense) > 0 && (
                        <span className="ml-2 text-xs text-amber-700">
                          (এক্সপেন্স {money(p.provisionExpense)})
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.byClass.map((c) => `${c.assetClass}: ${c.provisionPercent}%`).join(' · ')}
                    </div>
                  </div>
                  {p.status === 'pending_approval' ? (
                    <Button size="sm" onClick={() => postProvision.mutate(p.id)} disabled={postProvision.isPending}>
                      পোস্ট
                    </Button>
                  ) : (
                    <Pill className="bg-emerald-100 text-emerald-800">
                      <CheckCircle2 className="mr-1 h-3 w-3" /> পোস্টেড
                    </Pill>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ── 8) Early-warning panel ──────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Stethoscope className="h-4 w-4 text-amber-600" /> প্রাথমিক সতর্কতা
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(warnings.data?.items ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              কোনো সংকেত নেই। স্ক্যান চালালে টানা দুই কিস্তি বকেয়া, উপস্থিতি পতন ও PAR বৃদ্ধি ধরা পড়বে।
            </p>
          )}
          {(warnings.data?.items ?? []).map((w) => (
            <div
              key={w.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 ${
                w.acknowledged ? 'opacity-60' : ''
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Pill className={SEVERITY_STYLE[w.severity] ?? SEVERITY_STYLE['low']!}>
                    {w.severity === 'high' ? 'উচ্চ' : w.severity === 'medium' ? 'মধ্যম' : 'নিম্ন'}
                  </Pill>
                  <span className="text-sm font-semibold">{KIND_BN[w.kind] ?? w.kind}</span>
                  <span className="text-sm">— {w.refName}</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{w.detailBn}</div>
              </div>
              {!w.acknowledged && (
                <Button size="sm" variant="outline" onClick={() => ack.mutate(w.id)} disabled={ack.isPending}>
                  স্বীকৃতি
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── 5) Root-cause tagging ───────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">মূল কারণ ট্যাগিং</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                className="w-56"
                placeholder="ঋণ আবেদনের ID (uuid)"
                value={tagLoanId}
                onChange={(e) => setTagLoanId(e.target.value)}
              />
              <select
                className="rounded-md border bg-background px-2 text-sm"
                value={tagCause}
                onChange={(e) => setTagCause(e.target.value as RootCause)}
              >
                {ROOT_CAUSES.map((c) => (
                  <option key={c} value={c}>
                    {ROOT_CAUSE_LABELS_BN[c]}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                onClick={() => tagCauseMutation.mutate()}
                disabled={tagCauseMutation.isPending || tagLoanId.trim().length < 8}
              >
                ট্যাগ
              </Button>
            </div>
            {(causes.data?.items ?? []).slice(0, 6).map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span className="font-medium">{ROOT_CAUSE_LABELS_BN[c.cause]}</span>
                <span className="text-xs text-muted-foreground">{c.loanNumber ?? c.loanId.slice(0, 8)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* ── 6) Write-off chain ──────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <FileWarning className="h-4 w-4 text-rose-600" /> লেখা (Write-off) চেইন
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                className="w-56"
                placeholder="ঋণ আবেদনের ID (uuid)"
                value={woLoanId}
                onChange={(e) => setWoLoanId(e.target.value)}
              />
              <Input
                className="w-64"
                placeholder="কারণ (ন্যূনতম ১০ অক্ষর)"
                value={woReason}
                onChange={(e) => setWoReason(e.target.value)}
              />
              <Button
                size="sm"
                onClick={() => proposeWriteOff.mutate()}
                disabled={proposeWriteOff.isPending || woLoanId.trim().length < 8 || woReason.trim().length < 10}
              >
                প্রস্তাব
              </Button>
            </div>
            {(writeOffs.data?.items ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                AM সুপারিশ → পরিচালক অনুমোদন → পরবর্তী পুনরুদ্ধার।
              </p>
            )}
            {(writeOffs.data?.items ?? []).map((w) => (
              <div key={w.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">
                      {w.loanNumber ?? w.loanId.slice(0, 8)} — {w.memberName} · {money(w.outstandingAmount)}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{w.reason}</div>
                    {Number(w.recoveredAmount) > 0 && (
                      <div className="text-xs text-emerald-700">
                        পুনরুদ্ধার: {money(w.recoveredAmount)} ({w.recoveries.length} টি)
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Pill
                      className={
                        w.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-800'
                          : w.status === 'rejected'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                      }
                    >
                      {WOFF_STATUS_BN[w.status] ?? w.status}
                    </Pill>
                    {w.status === 'pending' && (
                      <Button size="sm" variant="outline" onClick={() => recommendWriteOff.mutate(w.id)}>
                        সুপারিশ
                      </Button>
                    )}
                    {w.status === 'recommended' && (
                      <Button size="sm" onClick={() => approveWriteOff.mutate(w.id)}>
                        অনুমোদন
                      </Button>
                    )}
                    {w.status === 'approved' && (
                      <div className="flex items-center gap-1">
                        <Input
                          className="w-24"
                          placeholder="৳"
                          value={recoveryAmount}
                          onChange={(e) => setRecoveryAmount(e.target.value)}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={recoveryAmount.trim().length === 0}
                          onClick={() => recoverWrittenOff.mutate({ id: w.id, amount: recoveryAmount.trim() })}
                        >
                          পুনরুদ্ধার
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
        আংশিক মওকুফ, সঞ্চয় সমন্বয় ও আইনি নোটিশ ঋণের বিস্তারিত পৃষ্ঠা (Delinquency) থেকে নিন।
        <RefreshCw className="ml-1 h-3 w-3" />
      </p>
    </div>
  );
}
