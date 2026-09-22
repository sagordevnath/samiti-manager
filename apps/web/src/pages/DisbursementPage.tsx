import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  CalendarClock,
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  Printer,
  ScrollText,
  Smartphone,
  Undo2,
  Wallet,
} from 'lucide-react';
import type { DisbursementCheck, DisbursementMode } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const CHECK_LABELS: Record<DisbursementCheck, string> = {
  savings_deposit_paid: 'প্রথম সঞ্চয় কিস্তি জমা',
  insurance_premium_collected: 'বীমা প্রিমিয়াম আদায়',
  fees_paid: 'প্রক্রিয়াকরণ ফি পরিশোধিত',
  member_present: 'সদস্য উপস্থিত',
  guarantor_signature: 'গ্যারান্টরের স্বাক্ষর',
  cash_available: 'শাখায় নগদ সীমার মধ্যে',
};

const MODE_OPTIONS: Array<{ value: DisbursementMode; label: string; icon: typeof Banknote }> = [
  { value: 'cash_branch', label: 'নগদ (শাখা)', icon: Banknote },
  { value: 'cash_center', label: 'নগদ (কেন্দ্র)', icon: Wallet },
  { value: 'bank_transfer', label: 'ব্যাংক ট্রান্সফার', icon: Banknote },
  { value: 'bkash', label: 'বিকাশ', icon: Smartphone },
  { value: 'nagad', label: 'নগদ (মোবাইল)', icon: Smartphone },
];

const CASH_MODES: DisbursementMode[] = ['cash_branch', 'cash_center'];
const MFS_MODES: DisbursementMode[] = ['bkash', 'nagad'];

type DisbursementStatus = 'pending' | 'prepared' | 'completed' | 'cancelled';

const STATUS_BADGE: Record<DisbursementStatus, { label: string; className: string }> = {
  pending: { label: 'অপেক্ষমাণ', className: 'bg-muted text-muted-foreground' },
  prepared: { label: 'প্রস্তুত', className: 'bg-amber-100 text-amber-700' },
  completed: { label: 'বিতরণ সম্পন্ন', className: 'bg-teal-600 text-white' },
  cancelled: { label: 'বাতিল', className: 'bg-red-100 text-red-700' },
};

interface QueueItem {
  applicationId: string;
  applicationNumber: string;
  branchName: string;
  samityId: string | null;
  samityName: string | null;
  memberName: string;
  memberCode: string;
  productName: string | null;
  amount: string;
  plannedDate: string | null;
  mode: DisbursementMode | null;
  status: DisbursementStatus;
  checksDone: number;
  checksTotal: number;
  ready: boolean;
  loanNumber: string | null;
}

interface DisbursementRecordResponse {
  disbursement: {
    id: string;
    checks: Record<DisbursementCheck, { done: boolean; note: string | null }>;
    plannedDate: string | null;
    mode: DisbursementMode;
    status: DisbursementStatus;
    note: string | null;
    disbursementDate: string;
    loanNumber: string | null;
    voucherNumber: string | null;
    cashReceivedByName: string | null;
    mfsReference: string | null;
    bankReference: string | null;
    actualUserOfFunds: string | null;
    cancelReason: string | null;
    cancelledAt: string | null;
  };
  checkLabels: Record<DisbursementCheck, string>;
}

interface ScheduleResponse {
  rows: Array<{
    seq: number;
    dueDate: string;
    originalDueDate: string;
    shifted: boolean;
    shiftReason: string | null;
    principal: string;
    interest: string;
    total: string;
    balanceAfter: string;
  }>;
  shiftedCount: number;
  stored: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

export function DisbursementPage() {
  const fmt = useMoneyFormatter();
  const queryClient = useQueryClient();

  const queue = useQuery({
    queryKey: ['disbursement-queue'],
    queryFn: () => api.get<{ items: QueueItem[] }>('/loans/disbursements/queue'),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const record = useQuery({
    queryKey: ['disbursement-record', selectedId],
    enabled: selectedId !== null,
    queryFn: () => api.get<DisbursementRecordResponse>(`/loans/disbursements/${selectedId}`),
  });

  const schedule = useQuery({
    queryKey: ['disbursement-schedule', selectedId],
    enabled: selectedId !== null,
    queryFn: () => api.get<ScheduleResponse>(`/loans/disbursements/${selectedId}/schedule`),
  });

  // ── Step 1 (prepare) state ──
  const [mode, setMode] = useState<DisbursementMode>('cash_branch');
  const [plannedDate, setPlannedDate] = useState('');
  const [disbursementDate, setDisbursementDate] = useState(today);

  // ── Step 2 (authorize) state ──
  const [cashReceivedByName, setCashReceivedByName] = useState('');
  const [mfsReference, setMfsReference] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [actualUserOfFunds, setActualUserOfFunds] = useState('');
  const [actualUserRelation, setActualUserRelation] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const invalidateAll = (id: string | null) => {
    void queryClient.invalidateQueries({ queryKey: ['disbursement-record', id] });
    void queryClient.invalidateQueries({ queryKey: ['disbursement-schedule', id] });
    void queryClient.invalidateQueries({ queryKey: ['disbursement-queue'] });
    void queryClient.invalidateQueries({ queryKey: ['loans-applications'] });
  };

  const grouped = useMemo(() => {
    const items = queue.data?.items ?? [];
    const map = new Map<string, QueueItem[]>();
    for (const item of items) {
      const key = `${item.samityName ?? 'সমিতি নির্ধারিত নয়'} · ${item.plannedDate ?? 'তারিখ নির্ধারিত নয়'}`;
      const bucket = map.get(key) ?? [];
      bucket.push(item);
      map.set(key, bucket);
    }
    return [...map.entries()];
  }, [queue.data]);

  const prepare = useMutation({
    mutationFn: (body: {
      mode?: DisbursementMode;
      plannedDate?: string;
      checkItems: Array<{ check: DisbursementCheck; done: boolean; note?: string }>;
    }) => api.patch(`/loans/disbursements/${selectedId}`, body),
    onSuccess: () => {
      setError(null);
      invalidateAll(selectedId);
    },
    onError: (e) => setError((e as Error).message),
  });

  const authorize = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post(`/loans/disbursements/${selectedId}/authorize`, body),
    onSuccess: () => {
      setError(null);
      invalidateAll(selectedId);
    },
    onError: (e) => setError((e as Error).message),
  });

  const cancel = useMutation({
    mutationFn: (body: { reason: string }) =>
      api.post(`/loans/disbursements/${selectedId}/cancel`, body),
    onSuccess: () => {
      setError(null);
      setCancelReason('');
      invalidateAll(selectedId);
    },
    onError: (e) => setError((e as Error).message),
  });

  if (queue.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }

  const rec = record.data?.disbursement;
  const checks = rec?.checks ?? null;
  const allDone = checks ? Object.values(checks).every((c) => c.done) : false;
  const status: DisbursementStatus = rec?.status ?? 'pending';
  const prepared = status === 'prepared';
  const disbursed = status === 'completed';
  const cancelled = status === 'cancelled';
  const canEdit = !disbursed && !cancelled;

  const toggleCheck = (key: DisbursementCheck, done: boolean) => {
    if (!selectedId) return;
    // Prepare merges per-key: concurrent toggles never clobber each other.
    prepare.mutate({ checkItems: [{ check: key, done }] });
  };

  const savePrepare = () => {
    if (!selectedId) return;
    const body = {
      mode,
      checkItems: checks ? Object.entries(checks).map(([check, c]) => ({ check, done: c.done })) : [],
    } as {
      mode: DisbursementMode;
      checkItems: Array<{ check: DisbursementCheck; done: boolean }>;
      plannedDate?: string;
    };
    if (plannedDate) body.plannedDate = plannedDate;
    prepare.mutate(body);
  };

  const submitAuthorize = () => {
    if (!selectedId) return;
    const body: Record<string, unknown> = { disbursementDate };
    if (CASH_MODES.includes(mode)) body['cashReceivedByName'] = cashReceivedByName;
    if (mode === 'bkash' || mode === 'nagad') body['mfsReference'] = mfsReference;
    if (mode === 'bank_transfer') body['bankReference'] = bankReference;
    if (actualUserOfFunds) body['actualUserOfFunds'] = actualUserOfFunds;
    if (actualUserRelation) body['actualUserRelation'] = actualUserRelation;
    authorize.mutate(body);
  };

  const activeMode = rec?.mode ?? mode;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">ঋণ বিতরণ (Disbursement)</h1>
        <p className="text-sm text-muted-foreground">
          হিসাবরক্ষক প্রস্তুত করেন → শাখা ব্যবস্থাপক অনুমোদন করেন (দুই-ধাপ নিয়ন্ত্রণ)
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* ── Queue grouped by samity and planned date ─────────────────────── */}
      {grouped.map(([group, items]) => (
        <Card key={group}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-teal-600" /> {group}
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{items.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {items.map((item) => {
              const badge = STATUS_BADGE[item.status];
              return (
                <button
                  key={item.applicationId}
                  type="button"
                  onClick={() => setSelectedId(item.applicationId)}
                  className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                    selectedId === item.applicationId ? 'border-teal-500 bg-teal-50/50' : ''
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {item.memberName} <span className="text-muted-foreground">({item.memberCode})</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.applicationNumber} · {item.productName}
                        {item.loanNumber && ` · ${item.loanNumber}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{fmt(item.amount)}</p>
                      <p className="text-xs text-muted-foreground">
                        যাচাই {item.checksDone}/{item.checksTotal}
                        {item.ready && !disbursed && <span className="ml-1 text-teal-600">✓ প্রস্তুত</span>}
                      </p>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      ))}
      {grouped.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">বর্তমানে বিতরণের অপেক্ষায় কোনো ঋণ নেই।</CardContent>
        </Card>
      )}

      {/* ── Checklist + two-step execution ───────────────────────────────── */}
      {selectedId && record.data && (
        <Card className="border-teal-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">পূর্ব-শর্ত যাচাই (Pre-disbursement checks)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step indicator */}
            <div className="flex items-center gap-2 text-xs">
              {[
                { key: 'pending', label: '১. প্রস্তুতি (হিসাবরক্ষক)' },
                { key: 'prepared', label: '২. অনুমোদন (শাখা ব্যবস্থাপক)' },
                { key: 'completed', label: '৩. বিতরণ সম্পন্ন' },
              ].map((step, i) => {
                const order = ['pending', 'prepared', 'completed'];
                const active = !cancelled && order.indexOf(status) >= i;
                return (
                  <span
                    key={step.key}
                    className={`rounded-full px-2.5 py-1 ${active ? 'bg-teal-600 text-white' : 'bg-muted text-muted-foreground'}`}
                  >
                    {step.label}
                  </span>
                );
              })}
            </div>

            <div className="space-y-2">
              {(Object.keys(CHECK_LABELS) as DisbursementCheck[]).map((key) => {
                const done = checks?.[key]?.done ?? false;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => toggleCheck(key, !done)}
                    className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm ${
                      done ? 'border-teal-200 bg-teal-50/60' : 'hover:bg-accent'
                    }`}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4 text-teal-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                    {CHECK_LABELS[key]}
                  </button>
                );
              })}
            </div>

            {canEdit && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>বিতরণের মাধ্যম</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setMode(value)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                          mode === value ? 'border-teal-500 bg-teal-50 text-teal-700' : 'text-muted-foreground'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" /> {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>পরিকল্পিত তারিখ</Label>
                  <Input type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>বিতরণের তারিখ (অনুমোদনে)</Label>
                  <Input type="date" value={disbursementDate} onChange={(e) => setDisbursementDate(e.target.value)} />
                </div>
              </div>
            )}

            {/* Step 2 evidence — shown once prepared */}
            {prepared && (
              <div className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50/40 p-3 sm:grid-cols-2">
                <p className="text-xs font-medium text-amber-700 sm:col-span-2">
                  ধাপ ২ — অনুমোদনের জন্য প্রমাণাদি (শাখা ব্যবস্থাপক)
                </p>
                {CASH_MODES.includes(activeMode) && (
                  <div className="space-y-1.5">
                    <Label>নগদ গ্রহণকারীর নাম *</Label>
                    <Input value={cashReceivedByName} onChange={(e) => setCashReceivedByName(e.target.value)} placeholder="সদস্য / মাঠ কর্মী" />
                  </div>
                )}
                {MFS_MODES.includes(activeMode) && (
                  <div className="space-y-1.5">
                    <Label>TrxID / রেফারেন্স *</Label>
                    <Input value={mfsReference} onChange={(e) => setMfsReference(e.target.value)} placeholder="যেমন 9X7ABC1234" />
                  </div>
                )}
                {activeMode === 'bank_transfer' && (
                  <div className="space-y-1.5">
                    <Label>ব্যাংক রেফারেন্স *</Label>
                    <Input value={bankReference} onChange={(e) => setBankReference(e.target.value)} />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>প্রকৃত ব্যবহারকারী (নারী ঋণে)</Label>
                  <Input value={actualUserOfFunds} onChange={(e) => setActualUserOfFunds(e.target.value)} placeholder="টাকার প্রকৃত ব্যবহারকারী" />
                </div>
                {actualUserOfFunds && (
                  <div className="space-y-1.5">
                    <Label>সম্পর্ক</Label>
                    <Input value={actualUserRelation} onChange={(e) => setActualUserRelation(e.target.value)} placeholder="স্বামী / পুত্র…" />
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {canEdit && (
                <Button variant="outline" onClick={savePrepare} disabled={prepare.isPending}>
                  {prepare.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  প্রস্তুত করুন (হিসাবরক্ষক)
                </Button>
              )}
              {prepared && (
                <Button onClick={submitAuthorize} disabled={!allDone || authorize.isPending}>
                  {authorize.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  অনুমোদন ও বিতরণ (শাখা ব্যবস্থাপক)
                </Button>
              )}
              {disbursed && (
                <span className="inline-flex items-center rounded-full bg-teal-600 px-3 py-1 text-xs font-medium text-white">
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  বিতরণ সম্পন্ন — {rec?.loanNumber}
                </span>
              )}
              {cancelled && (
                <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                  বাতিল — {rec?.cancelReason}
                </span>
              )}
              <Link
                to={`/loans/${selectedId}`}
                className="inline-flex items-center rounded-md border px-3 py-2 text-sm hover:bg-accent"
              >
                আবেদন বিস্তারিত
              </Link>
            </div>
            {canEdit && !allDone && (
              <p className="text-xs text-muted-foreground">সব শর্ত সম্পন্ন না হলে অনুমোদন করা যাবে না।</p>
            )}

            {/* Artifacts + same-day rollback */}
            {disbursed && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
                <Link
                  to={`/loans/disbursements/${selectedId}/voucher`}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <Printer className="h-3.5 w-3.5" /> ভাউচার ({rec?.voucherNumber})
                </Link>
                <Link
                  to={`/loans/disbursements/${selectedId}/agreement`}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-accent"
                >
                  <ScrollText className="h-3.5 w-3.5" /> ঋণ চুক্তিপত্র
                </Link>
                <div className="ml-auto flex items-center gap-1.5">
                  <Input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="বাতিলের কারণ (একই দিনে)"
                    className="w-56"
                  />
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={cancelReason.trim().length < 10 || cancel.isPending}
                    onClick={() => cancel.mutate({ reason: cancelReason })}
                  >
                    {cancel.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Undo2 className="mr-1 h-3.5 w-3.5" />}
                    বাতিল
                  </Button>
                </div>
              </div>
            )}

            {/* ── Stored schedule (generated at disbursement) ─────────────── */}
            {schedule.data && schedule.data.rows.length > 0 && (
              <div className="rounded-lg border">
                <div className="border-b px-3 py-2 text-sm font-medium">
                  পরিশোধ সূচি ({schedule.data.rows.length} কিস্তি
                  {schedule.data.shiftedCount > 0 && ` · ${schedule.data.shiftedCount}টি ছুটির কারণে সরানো`})
                  {!schedule.data.stored && ' · প্রাকদর্শন'}
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="px-3 py-1.5">#</th>
                        <th className="px-3 py-1.5">তারিখ</th>
                        <th className="px-3 py-1.5 text-right">মূল</th>
                        <th className="px-3 py-1.5 text-right">সুদ</th>
                        <th className="px-3 py-1.5 text-right">মোট</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.data.rows.map((row) => (
                        <tr key={row.seq} className="border-b last:border-0">
                          <td className="px-3 py-1.5">{row.seq}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {row.dueDate}
                            {row.shifted && (
                              <span className="ml-1 text-xs text-amber-600" title={`${row.originalDueDate}: ${row.shiftReason ?? ''}`}>
                                ⇦ {row.originalDueDate}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right">{fmt(row.principal)}</td>
                          <td className="px-3 py-1.5 text-right">{fmt(row.interest)}</td>
                          <td className="px-3 py-1.5 text-right font-medium">{fmt(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Voucher/agreement are API-rendered HTML pages; keep route hint */}
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <FileText className="h-3.5 w-3.5" />
        ভাউচার ও চুক্তিপত্র বিতরণের পর প্রিন্টযোগ্য আকারে পাওয়া যায়।
      </p>
    </div>
  );
}
