import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, HandCoins, Loader2, XCircle } from 'lucide-react';
import type { CashHandover, CashSummary } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const today = () => new Date().toISOString().slice(0, 10);

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft: { label: 'খসড়া', className: 'bg-muted text-muted-foreground' },
  submitted: { label: 'জমা দেওয়া হয়েছে', className: 'bg-amber-100 text-amber-700' },
  confirmed: { label: 'নিশ্চিত', className: 'bg-teal-600 text-white' },
  rejected: { label: 'প্রত্যাখ্যাত', className: 'bg-red-100 text-red-700' },
};

const DIFF_LABEL: Record<string, string> = {
  none: 'হিসাব মিলেছে',
  shortage: 'ঘাটতি',
  excess: 'উদ্বৃত্ত',
};

export function CashHandoverPage() {
  const fmt = useMoneyFormatter();
  const qc = useQueryClient();
  const [handoverDate, setHandoverDate] = useState(today);
  const [counted, setCounted] = useState('');
  const [error, setError] = useState<string | null>(null);

  const summary = useQuery({
    queryKey: ['cash-summary', handoverDate],
    queryFn: () => api.get<CashSummary>(`/collection/cash-summary?date=${handoverDate}`),
  });

  const handovers = useQuery({
    queryKey: ['cash-handovers'],
    queryFn: () => api.get<{ items: CashHandover[] }>('/collection/handovers'),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['cash-summary'] });
    void qc.invalidateQueries({ queryKey: ['cash-handovers'] });
  };

  const openHandover = useMutation({
    mutationFn: () => api.post<CashHandover>('/collection/handovers', { handoverDate }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e) => setError((e as Error).message),
  });

  const submit = useMutation({
    mutationFn: (v: { id: string; countedAmount: string }) =>
      api.post<CashHandover>(`/collection/handovers/${v.id}/submit`, { countedAmount: v.countedAmount }),
    onSuccess: () => {
      setError(null);
      setCounted('');
      invalidate();
    },
    onError: (e) => setError((e as Error).message),
  });

  const confirm = useMutation({
    mutationFn: (v: { id: string; decision: 'confirm' | 'reject' }) =>
      api.post<CashHandover>(`/collection/handovers/${v.id}/confirm`, v.decision === 'confirm' ? {} : v),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (e) => setError((e as Error).message),
  });

  const s = summary.data;
  const activeHandover = s?.lastHandover && ['draft', 'submitted'].includes(s.lastHandover.status) ? s.lastHandover : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <HandCoins className="h-5 w-5 text-teal-600" /> নগদ হস্তান্তর
        </h1>
        <p className="text-xs text-muted-foreground">
          দৈনিক হাতে-নগদ → শাখায় জমা → হিসাবরক্ষকের নিশ্চিতকরণ (ঘাটতি/উদ্বৃত্ত লিপিবদ্ধ)
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Date picker */}
      <div className="flex items-center gap-2">
        <Label className="text-xs">তারিখ</Label>
        <Input type="date" value={handoverDate} onChange={(e) => setHandoverDate(e.target.value)} className="w-40" />
      </div>

      {/* Cash tally */}
      {s && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border p-3">
            <p className="text-[10px] text-muted-foreground">আজকের আদায়</p>
            <p className="text-base font-bold">{fmt(s.collectedToday)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-[10px] text-muted-foreground">হস্তান্তরিত</p>
            <p className="text-base font-bold">{fmt(s.handedOver)}</p>
          </div>
          <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3">
            <p className="text-[10px] text-muted-foreground">হাতে নগদ</p>
            <p className="text-base font-bold text-teal-700">{fmt(s.cashInHand)}</p>
          </div>
        </div>
      )}

      {/* Officer flow */}
      {s && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">কর্মকর্তার পদক্ষেপ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!activeHandover && (
              <Button onClick={() => openHandover.mutate()} disabled={openHandover.isPending}>
                {openHandover.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                হস্তান্তর শুরু করুন (প্রত্যাশিত: {fmt(s.collectedToday)})
              </Button>
            )}
            {activeHandover?.status === 'draft' && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label>গণনাকৃত নগদ (৳)</Label>
                  <Input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" />
                </div>
                <p className="text-xs text-muted-foreground">
                  প্রত্যাশিত {fmt(activeHandover.expectedAmount)} — {num(counted) < num(activeHandover.expectedAmount) ? 'ঘাটতি হবে' : num(counted) > num(activeHandover.expectedAmount) ? 'উদ্বৃত্ত হবে' : 'হিসাব মিলবে'}
                </p>
                <Button
                  onClick={() => submit.mutate({ id: activeHandover.id, countedAmount: counted })}
                  disabled={num(counted) <= 0 || submit.isPending}
                >
                  {submit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  শাখায় জমা দিন
                </Button>
              </div>
            )}
            {activeHandover?.status === 'submitted' && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
                হিসাবরক্ষকের নিশ্চিতকরণের অপেক্ষায়… (প্রত্যাশিত {fmt(activeHandover.expectedAmount)}, গণনাকৃত {fmt(activeHandover.countedAmount ?? '0')})
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">হস্তান্তরের ইতিহাস</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(handovers.data?.items ?? []).map((h) => {
            const st = STATUS_LABEL[h.status] ?? STATUS_LABEL['draft']!;
            return (
              <div key={h.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{h.handoverDate} · {h.officerName}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.className}`}>{st.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <span>প্রত্যাশিত: <strong>{fmt(h.expectedAmount)}</strong></span>
                  <span>গণনাকৃত: <strong>{fmt(h.countedAmount ?? '0.00')}</strong></span>
                  <span>
                    পার্থক্য:{' '}
                    <strong className={h.differenceKind === 'shortage' ? 'text-red-600' : h.differenceKind === 'excess' ? 'text-amber-600' : 'text-teal-600'}>
                      {fmt(h.difference)} ({DIFF_LABEL[h.differenceKind]})
                    </strong>
                  </span>
                </div>
                {h.accountantNote && <p className="text-xs text-muted-foreground">নোট: {h.accountantNote}</p>}
                {h.status === 'submitted' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => confirm.mutate({ id: h.id, decision: 'confirm' })} disabled={confirm.isPending}>
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> নিশ্চিত করুন
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => confirm.mutate({ id: h.id, decision: 'reject' })} disabled={confirm.isPending}>
                      <XCircle className="mr-1 h-3.5 w-3.5" /> প্রত্যাখ্যান
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
          {(handovers.data?.items ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">এখনো কোনো হস্তান্তর নেই।</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
