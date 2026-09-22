import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  CheckCircle2,
  CloudOff,
  HandCoins,
  Loader2,
  Printer,
  RefreshCw,
  Wallet,
  WifiOff,
} from 'lucide-react';
import type { CollectionSheet, CollectionSheetRow } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';
import {
  cacheSheet,
  listOutbox,
  queueEntry,
  readCachedSheet,
  syncOutbox,
  type OutboxEntry,
} from '@/lib/offline';
import { useAuthStore } from '@/stores/auth';

const BRANCH_DHAKA = '00000000-0000-4000-8000-0000000000b1';
const today = () => new Date().toISOString().slice(0, 10);
const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Live allocation preview mirroring the server's engine (overdue_first). */
function previewAllocation(row: CollectionSheetRow, pool: number) {
  let remaining = pool;
  const overdueApplied: Array<{ seq: number; amount: number }> = [];
  for (const o of row.loan?.overdue ?? []) {
    const amount = Math.min(num(o.amount), remaining);
    if (amount > 0) overdueApplied.push({ seq: o.seq, amount });
    remaining -= amount;
  }
  let currentApplied = 0;
  if (row.loan?.current) {
    currentApplied = Math.min(num(row.loan.current.amount), remaining);
    remaining -= currentApplied;
  }
  const savingsApplied = Math.min(num(row.savingsDue?.amount ?? '0'), Math.max(remaining, 0));
  remaining -= savingsApplied;
  const advanceApplied = Math.max(remaining, 0);
  return { overdueApplied, currentApplied, savingsApplied, advanceApplied };
}

export function CollectionSheetPage() {
  const fmt = useMoneyFormatter();
  const user = useAuthStore((s) => s.user);
  const [branchId, setBranchId] = useState(BRANCH_DHAKA);
  const [meetingDate, setMeetingDate] = useState(today);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [paidInputs, setPaidInputs] = useState<Record<string, { loan: string; savings: string; extra: string }>>({});
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [savingMember, setSavingMember] = useState<string | null>(null);

  const refreshOutbox = useCallback(() => {
    void listOutbox().then(setOutbox);
  }, []);

  useEffect(() => {
    refreshOutbox();
    const on = () => {
      setOnline(true);
      void syncOutbox().then((r) => {
        if (r.posted || r.duplicates || r.failed) {
          setSyncMsg(`সিঙ্ক: ${r.posted} নতুন, ${r.duplicates} ডুপ্লিকেট, ${r.failed} বাকি`);
          refreshOutbox();
        }
      });
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [refreshOutbox]);

  // Serve from cache first, then refresh from the network when online.
  const sheet = useQuery({
    queryKey: ['collection-sheet', branchId, meetingDate],
    queryFn: async () => {
      const cached = await readCachedSheet(branchId, meetingDate);
      try {
        const fresh = await api.get<CollectionSheet>(
          `/collection/sheet?branchId=${branchId}&meetingDate=${meetingDate}`,
        );
        await cacheSheet(branchId, meetingDate, fresh);
        return fresh;
      } catch {
        if (cached) return cached;
        throw new Error('অফলাইন — আজকের শিট ক্যাশে নেই');
      }
    },
    networkMode: 'offlineFirst',
    retry: false,
  });

  const queuedByMember = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of outbox.filter((e) => e.meetingDate === meetingDate && e.status === 'queued')) {
      m.set(e.memberId, (m.get(e.memberId) ?? 0) + num(e.loanPaid) + num(e.savingsPaid) + num(e.extraPaid));
    }
    return m;
  }, [outbox, meetingDate]);

  const setPaid = (memberId: string, field: 'loan' | 'savings' | 'extra', value: string) => {
    setPaidInputs((prev) => ({
      ...prev,
      [memberId]: { loan: '', savings: '', extra: '', ...prev[memberId], [field]: value },
    }));
  };

  const capture = async (row: CollectionSheetRow) => {
    const input = paidInputs[row.memberId] ?? { loan: '', savings: '', extra: '' };
    const loan = num(input.loan), savings = num(input.savings), extra = num(input.extra);
    if (loan + savings + extra <= 0) return;
    const entry: OutboxEntry = {
      idempotencyKey: crypto.randomUUID(),
      memberId: row.memberId,
      meetingDate,
      loanPaid: loan.toFixed(2),
      savingsPaid: savings.toFixed(2),
      extraPaid: extra.toFixed(2),
      capturedAt: new Date().toISOString(),
      status: 'queued',
      memberName: row.memberName,
    };
    await queueEntry(entry);
    setPaidInputs((prev) => ({ ...prev, [row.memberId]: { loan: '', savings: '', extra: '' } }));
    refreshOutbox();
    if (navigator.onLine) {
      const r = await syncOutbox();
      if (r.posted || r.duplicates || r.failed) setSyncMsg(`সিঙ্ক: ${r.posted} নতুন, ${r.duplicates} ডুপ্লিকেট, ${r.failed} বাকি`);
      refreshOutbox();
    } else {
      setSyncMsg('অফলাইন — এন্ট্রি সারিতে জমা হয়েছে, ইন্টারনেট এলে সিঙ্ক হবে');
    }
  };

  const manualSync = async () => {
    setSyncMsg('সিঙ্ক হচ্ছে…');
    const r = await syncOutbox();
    setSyncMsg(`সিঙ্ক: ${r.posted} নতুন, ${r.duplicates} ডুপ্লিকেট, ${r.failed} বাকি`);
    refreshOutbox();
    void sheet.refetch();
  };

  const queuedCount = outbox.filter((e) => e.status === 'queued').length;
  const rows = sheet.data?.rows ?? [];

  if (sheet.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Header — sticky, compact for low-end phones */}
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-bold sm:text-2xl">
          <HandCoins className="h-5 w-5 text-teal-600" /> আদায় শিট
        </h1>
        <p className="text-xs text-muted-foreground">
          {user ? `${user.email} · ` : ''}{sheet.data?.branchName ?? ''} · {meetingDate}
        </p>
      </div>

      {/* Offline banner + controls */}
      <div className="flex flex-wrap items-center gap-2">
        {!online && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
            <WifiOff className="h-3.5 w-3.5" /> অফলাইন — ক্যাশ থেকে দেখানো হচ্ছে
          </span>
        )}
        {queuedCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
            <CloudOff className="h-3.5 w-3.5" /> সারিতে {queuedCount}টি এন্ট্রি
          </span>
        )}
        <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} className="ml-auto w-40" />
        <Button size="sm" variant="outline" onClick={manualSync} disabled={!online}>
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> সিঙ্ক
        </Button>
      </div>
      {syncMsg && <p className="rounded-md bg-muted px-3 py-2 text-xs">{syncMsg}</p>}

      {/* Totals strip */}
      {sheet.data && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border p-2">
            <p className="text-[10px] text-muted-foreground">সদস্য</p>
            <p className="text-base font-bold">{sheet.data.totals.members}</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-[10px] text-muted-foreground">মোট দাবি</p>
            <p className="text-base font-bold">{fmt(sheet.data.totals.due)}</p>
          </div>
          <div className="rounded-lg border p-2">
            <p className="text-[10px] text-muted-foreground">আজ আদায়</p>
            <p className="text-base font-bold text-teal-700">{fmt(sheet.data.totals.collected)}</p>
          </div>
        </div>
      )}

      {/* Member rows — one card per member, thumb-reachable inputs */}
      {rows.map((row) => {
        const input = paidInputs[row.memberId] ?? { loan: '', savings: '', extra: '' };
        const pool = num(input.loan) + num(input.savings) + num(input.extra);
        const alloc = previewAllocation(row, pool);
        const queuedAmt = queuedByMember.get(row.memberId) ?? 0;
        const done = row.totalDue === '0.00' && num(row.loan?.current?.amount ?? '0') === 0;
        return (
          <Card key={row.memberId} className={done ? 'border-teal-200 bg-teal-50/40' : ''}>
            <CardHeader className="pb-1">
              <CardTitle className="flex flex-wrap items-center justify-between gap-1 text-sm">
                <span>
                  {row.memberName} <span className="text-xs text-muted-foreground">({row.memberCode})</span>
                </span>
                {queuedAmt > 0 && (
                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">
                    সারিতে {fmt(queuedAmt.toFixed(2))}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Dues summary */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
                <span>কিস্তি: <strong className="text-foreground">{row.loan ? fmt(row.loan.current?.amount ?? '0.00') : '—'}</strong></span>
                <span>বকেয়া: <strong className={row.loan?.overdue.length ? 'text-red-600' : 'text-foreground'}>
                  {fmt((row.loan?.overdue ?? []).reduce((s, o) => s + num(o.amount), 0).toFixed(2))}
                </strong></span>
                <span>সঞ্চয়: <strong className="text-foreground">{row.savingsDue ? fmt(row.savingsDue.amount) : '—'}</strong></span>
                <span>অগ্রিম: <strong className="text-foreground">{fmt(row.advanceBalance)}</strong></span>
              </div>
              <p className="text-sm font-semibold">
                মোট আদায়যোগ্য: <span className="text-teal-700">{fmt(row.totalDue)}</span>
              </p>

              {/* Overdue detail */}
              {(row.loan?.overdue ?? []).length > 0 && (
                <p className="text-[11px] text-red-600">
                  {row.loan!.overdue.map((o) => `কিস্তি ${o.seq} (${o.dueDate}, ${o.daysOverdue} দিন) — ${fmt(o.amount)}`).join(' · ')}
                </p>
              )}

              {/* Inputs */}
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[10px]">কিস্তি</Label>
                  <Input inputMode="decimal" value={input.loan} onChange={(e) => setPaid(row.memberId, 'loan', e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">সঞ্চয়</Label>
                  <Input inputMode="decimal" value={input.savings} onChange={(e) => setPaid(row.memberId, 'savings', e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[10px]">অতিরিক্ত</Label>
                  <Input inputMode="decimal" value={input.extra} onChange={(e) => setPaid(row.memberId, 'extra', e.target.value)} placeholder="0" />
                </div>
              </div>

              {/* Live allocation preview */}
              {pool > 0 && (
                <p className="rounded bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
                  বণ্টন: বকেয়া {alloc.overdueApplied.reduce((s, o) => s + o.amount, 0).toFixed(2)} · কিস্তি {alloc.currentApplied.toFixed(2)} · সঞ্চয় {alloc.savingsApplied.toFixed(2)} · অগ্রিম {alloc.advanceApplied.toFixed(2)}
                </p>
              )}

              <div className="flex items-center gap-2">
                <Button size="sm" disabled={pool <= 0 || savingMember === row.memberId} onClick={() => { setSavingMember(row.memberId); void capture(row).finally(() => setSavingMember(null)); }}>
                  {savingMember === row.memberId ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wallet className="mr-1 h-3.5 w-3.5" />}
                  জমা করুন
                </Button>
                {done && <span className="inline-flex items-center text-xs text-teal-600"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> সম্পন্ন</span>}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {rows.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {sheet.isError ? (sheet.error as Error).message : 'এই শাখায় আদায়যোগ্য সদস্য নেই।'}
          </CardContent>
        </Card>
      )}

      {/* Outbox (queued + recent posted receipts) */}
      {outbox.length > 0 && (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" /> আউটবক্স ({outbox.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {outbox.slice(-8).reverse().map((e) => (
              <div key={e.idempotencyKey} className="flex flex-wrap items-center justify-between gap-1 rounded border px-2 py-1.5 text-xs">
                <span>
                  {e.memberName ?? e.memberId.slice(0, 8)} · {fmt((num(e.loanPaid) + num(e.savingsPaid) + num(e.extraPaid)).toFixed(2))}
                </span>
                <span className="flex items-center gap-2">
                  {e.receiptNo && <span className="font-mono text-[10px]">{e.receiptNo}</span>}
                  {e.status === 'queued' && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800">অপেক্ষমাণ</span>}
                  {e.status === 'posted' && <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800">পোস্ট হয়েছে</span>}
                  {e.status === 'failed' && <span className="text-red-600" title={e.error}>ব্যর্থ</span>}
                </span>
              </div>
            ))}
            <p className="pt-1 text-[10px] text-muted-foreground">
              আইডেম্পোটেন্ট কী ব্যবহার হয় — একই এন্ট্রি দুইবার পোস্ট হয় না।
            </p>
          </CardContent>
        </Card>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Printer className="h-3.5 w-3.5" /> রসিদ আউটবক্সে পোস্ট হওয়ার পর প্রিন্ট/শেয়ার করা যায়।
      </p>
    </div>
  );
}
