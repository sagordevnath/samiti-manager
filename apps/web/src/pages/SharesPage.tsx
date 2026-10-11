import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

interface ShareAllotment {
  id: string;
  member_id: string;
  product_id: string;
  shares: number;
  face_value: string;
  paid_amount: string;
  paid_shares: number;
  reference: string | null;
  memberName?: string;
  productCode?: string | null;
}

interface DividendPreview {
  totalPaidShares: number;
  dividendPool: string;
  unclaimedReserve: string;
  perMember: Array<{ memberId: string; memberName: string; paidShares: number; amount: string }>;
}

interface ReconciliationResult {
  accountId: string;
  accountNumber: string;
  storedBalance: string;
  ledgerBalance: string;
  difference: string;
  status: 'ok' | 'mismatch';
}

const money = (v: string | number) => `৳${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

export function SharesPage() {
  const queryClient = useQueryClient();
  const fmt = useMoneyFormatter();
  const [productId, setProductId] = useState('');
  const [surplus, setSurplus] = useState('500000');
  const [payoutRate, setPayoutRate] = useState('40');
  const [meetingRef, setMeetingRef] = useState('AGM-2026-01');
  // Share purchase (allotment) form — the ledger was read-only before.
  const [allotMemberId, setAllotMemberId] = useState('');
  const [allotProductId, setAllotProductId] = useState('');
  const [allotShares, setAllotShares] = useState('10');
  const [allotPaid, setAllotPaid] = useState('100');
  const [allotRef, setAllotRef] = useState('');

  const products = useQuery({
    queryKey: ['savings-products'],
    queryFn: () => api.get<{ items: Array<{ id: string; code: string; name: string; product_type: string; face_value: string | null }> }>('/savings/products'),
  });
  const shareProducts = products.data?.items.filter((p) => p.product_type === 'share') ?? [];

  const shares = useQuery({
    queryKey: ['savings-shares'],
    queryFn: () => api.get<{ items: ShareAllotment[] }>('/savings/shares'),
  });
  const members = useQuery({
    queryKey: ['members', 'share-picker'],
    queryFn: () => api.get<{ items: Array<{ id: string; full_name: string; member_code: string | null }> }>('/members?page=1&pageSize=100'),
  });
  const dividends = useQuery({
    queryKey: ['savings-dividends'],
    queryFn: () => api.get<{ items: Array<{ id: string; product_id: string; financial_year: string; surplus: string; payout_rate: string; dividend_pool: string; retained: string; approved_by_meeting_ref: string; status: string }> }>('/savings/dividends'),
  });
  const reconRuns = useQuery({
    queryKey: ['savings-recon-runs'],
    queryFn: () => api.get<{ items: Array<{ id: string; run_at: string; checked: number; mismatches: number }> }>('/savings/reconciliation/runs'),
  });

  const preview = useQuery({
    queryKey: ['dividend-preview', productId, surplus, payoutRate],
    enabled: productId !== '',
    queryFn: () =>
      api.get<DividendPreview>(`/savings/dividends/preview?productId=${productId}&surplus=${surplus}&payoutRate=${payoutRate}`),
  });

  const declare = useMutation({
    mutationFn: () =>
      api.post('/savings/dividends', {
        productId,
        financialYear: '2025-26',
        surplus,
        payoutRate: Number(payoutRate),
        approvedByMeetingRef: meetingRef,
        approvedAt: new Date().toISOString(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['savings-dividends'] });
    },
  });

  const allot = useMutation({
    mutationFn: () =>
      api.post('/savings/shares', {
        memberId: allotMemberId,
        productId: allotProductId,
        shares: Number(allotShares),
        paidAmount: allotPaid,
        reference: allotRef.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['savings-shares'] });
      void queryClient.invalidateQueries({ queryKey: ['dividend-preview'] });
      setAllotRef('');
    },
  });

  const runRecon = useMutation({
    mutationFn: () => api.post<{ runAt: string; checked: number; mismatches: number; results: ReconciliationResult[] }>('/savings/reconciliation/run', {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['savings-recon-runs'] });
    },
  });

  if (products.isLoading || shares.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-700">Shares &amp; dividends</p>
        <h1 className="text-2xl font-bold">শেয়ার মূলধন ও লভ্যাংশ</h1>
      </div>

      {/* Record a share purchase — completes the ledger's create path. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">শেয়ার কেনা রেকর্ড করুন (Record share purchase)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {shareProducts.length === 0 ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              কোনো শেয়ার পণ্য নেই — সঞ্চয় পণ্য পাতায় প্রথমে <strong>share</strong> ধরনের পণ্য তৈরি করুন।
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-5">
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="text-muted-foreground">সদস্য</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={allotMemberId}
                  onChange={(e) => setAllotMemberId(e.target.value)}
                >
                  <option value="">— নির্বাচন —</option>
                  {(members.data?.items ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name} ({m.member_code ?? m.id.slice(0, 8)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">শেয়ার পণ্য</span>
                <select
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={allotProductId}
                  onChange={(e) => setAllotProductId(e.target.value)}
                >
                  <option value="">— নির্বাচন —</option>
                  {shareProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">শেয়ার সংখ্যা</span>
                <input
                  type="number"
                  min={1}
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={allotShares}
                  onChange={(e) => setAllotShares(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">পরিশোধিত টাকা</span>
                <input
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={allotPaid}
                  onChange={(e) => setAllotPaid(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm md:col-span-3">
                <span className="text-muted-foreground">রেফারেন্স (ঐচ্ছিক)</span>
                <input
                  className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={allotRef}
                  onChange={(e) => setAllotRef(e.target.value)}
                  placeholder="যেমন: রসিদ-১০২৪"
                />
              </label>
              <div className="flex items-end gap-3 md:col-span-2">
                <Button
                  disabled={!allotMemberId || !allotProductId || allot.isPending}
                  onClick={() => allot.mutate()}
                >
                  {allot.isPending && <Loader2 className="h-4 w-4 animate-spin" />} বরাদ্দ করুন
                </Button>
                {allot.isSuccess && <span className="text-sm text-teal-700">বরাদ্দ সংরক্ষিত হয়েছে।</span>}
                {allot.isError && <span className="text-sm text-red-600">{(allot.error as Error).message}</span>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">সদস্য শেয়ার খাতা (Member share ledger)</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">সদস্য</th>
                <th className="py-2">পণ্য</th>
                <th className="py-2 text-right">বরাদ্দ</th>
                <th className="py-2 text-right">পরিশোধিত</th>
                <th className="py-2 text-right">মুল্য</th>
                <th className="py-2">রেফারেন্স</th>
              </tr>
            </thead>
            <tbody>
              {(shares.data?.items ?? []).map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2 font-medium">{a.memberName ?? a.member_id.slice(0, 8)}</td>
                  <td className="py-2">{a.productCode}</td>
                  <td className="py-2 text-right">{a.shares}</td>
                  <td className="py-2 text-right">{a.paid_shares}</td>
                  <td className="py-2 text-right">{fmt(a.face_value)}</td>
                  <td className="py-2 text-muted-foreground">{a.reference ?? '—'}</td>
                </tr>
              ))}
              {(shares.data?.items ?? []).length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">কোনো শেয়ার বরাদ্দ নেই</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">বার্ষিক লভ্যাংশ হিসাব (Annual dividend)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>শেয়ার পণ্য</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">নির্বাচন করুন…</option>
                {shareProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>উদ্বৃত্পন (Surplus ৳)</Label>
              <Input type="number" value={surplus} onChange={(e) => setSurplus(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>প্রদান হার %</Label>
              <Input type="number" value={payoutRate} onChange={(e) => setPayoutRate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>সভার রেফারেন্স</Label>
              <Input value={meetingRef} onChange={(e) => setMeetingRef(e.target.value)} />
            </div>
          </div>

          {preview.data && (
            <div className="rounded-lg border bg-teal-50/50 p-3 text-sm">
              <div className="flex flex-wrap gap-4">
                <span>মোট পরিশোধিত শেয়ার: <strong>{preview.data.totalPaidShares}</strong></span>
                <span>লভ্যাংশ পুল: <strong>{money(preview.data.dividendPool)}</strong></span>
                <span>অদাবীকৃত সঞ্চিত: <strong>{money(preview.data.unclaimedReserve)}</strong></span>
              </div>
              <div className="mt-2 space-y-1">
                {preview.data.perMember.map((m) => (
                  <div key={m.memberId} className="flex justify-between text-xs">
                    <span>{m.memberName}</span>
                    <span>{m.paidShares} শেয়ার → {money(m.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            className="bg-teal-600 hover:bg-teal-700"
            disabled={!productId || declare.isPending}
            onClick={() => declare.mutate()}
          >
            {declare.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            সভার অনুমোদনে ঘোষণা করুন (Declare dividend)
          </Button>
          {declare.isError && (
            <p className="text-sm text-red-600">{(declare.error as Error).message}</p>
          )}

          {(dividends.data?.items ?? []).length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2">অর্থবছর</th>
                  <th className="py-2 text-right">উদ্বৃত্তপন</th>
                  <th className="py-2 text-right">হার</th>
                  <th className="py-2 text-right">পুল</th>
                  <th className="py-2">সভা</th>
                  <th className="py-2">অবস্থা</th>
                </tr>
              </thead>
              <tbody>
                {dividends.data!.items.map((d) => (
                  <tr key={d.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{d.financial_year}</td>
                    <td className="py-2 text-right">{money(d.surplus)}</td>
                    <td className="py-2 text-right">{d.payout_rate}%</td>
                    <td className="py-2 text-right">{money(d.dividend_pool)}</td>
                    <td className="py-2 text-muted-foreground">{d.approved_by_meeting_ref}</td>
                    <td className="py-2"><span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{d.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">ব্যালান্স সামঞ্জস্য (Balance integrity)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            disabled={runRecon.isPending}
            onClick={() => runRecon.mutate()}
          >
            {runRecon.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            পুনর্মিলন চালান (Run reconciliation)
          </Button>
          {runRecon.data && (
            <div className={`rounded-lg border p-3 text-sm ${runRecon.data.mismatches === 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <p className="font-medium">
                {runRecon.data.checked} হিসাব পরীক্ষিত · {runRecon.data.mismatches} অমিল
              </p>
              {runRecon.data.mismatches > 0 && (
                <ul className="mt-2 list-inside list-disc text-xs">
                  {runRecon.data.results.filter((r) => r.status === 'mismatch').map((r) => (
                    <li key={r.accountId}>{r.accountNumber}: stored {r.storedBalance} ≠ ledger {r.ledgerBalance}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {(reconRuns.data?.items ?? []).length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {reconRuns.data!.items.slice(0, 5).map((r) => (
                <li key={r.id}>{new Date(r.run_at).toLocaleString('en-GB')} — {r.checked} হিসাব, {r.mismatches} অমিল</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
