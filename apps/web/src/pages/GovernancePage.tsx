/**
 * ── Cooperative governance page (req 5–8) ────────────────────────────────────
 * Tab 1 লভ্যাংশ: annual surplus → statutory reserve → AGM-approved pool split
 *   by period-weighted shares, posted to the GL and paid into savings or cash;
 *   printable dividend list.
 * Tab 2 সাধারণ সভা: AGM notice with agenda, attendance/quorum, resolutions
 *   (ordinary + special 2/3), executive committee election and Bangla minutes.
 * Tab 3 নিষ্পত্তি: member exit settlement — savings/share/dividend/welfare
 *   balances minus dues, final voucher journal on settle.
 * Tab 4 রিপোর্ট: claim ratio, premium vs payout, fund balances, dividend
 *   status and the governance journal trail.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, Coins, FileBarChart2, Gavel, Printer, Vote } from 'lucide-react';
import type { AgmStatus, DividendDistributionStatus, ExitStatus } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const TABS = ['dividend', 'agm', 'exit', 'reports'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  dividend: 'লভ্যাংশ ও উদ্বৃত্ত',
  agm: 'সাধারণ সভা',
  exit: 'নিষ্পত্তি',
  reports: 'রিপোর্ট',
};

const MEMBER_A = '00000000-0000-4000-8000-0000000001a1';
const MEMBER_B = '00000000-0000-4000-8000-0000000001a2';
const MEMBER_C = '00000000-0000-4000-8000-0000000001a3';

const MEMBERS = [
  { id: MEMBER_A, name: 'রহিমা বেগম' },
  { id: MEMBER_B, name: 'সালমা খাতুন' },
  { id: MEMBER_C, name: 'কমল হোসেন' },
];
const memberName = (id: string) => MEMBERS.find((m) => m.id === id)?.name ?? id;

const DIV_STATUS_BN: Record<DividendDistributionStatus, string> = {
  computed: 'গণনা সম্পন্ন',
  agm_approved: 'সভায় অনুমোদিত',
  posted: 'পোস্ট হয়েছে',
  paid: 'পরিশোধিত',
};

const AGM_STATUS_BN: Record<AgmStatus, string> = {
  draft: 'খসড়া',
  notice_issued: 'নোটিশ জারি',
  held: 'সভা অনুষ্ঠিত',
  minutes_approved: 'কার্যবিবরণী অনুমোদিত',
};

const EXIT_STATUS_BN: Record<ExitStatus, string> = {
  requested: 'আবেদন জমা',
  computed: 'গণনা সম্পন্ন',
  approved: 'অনুমোদিত',
  settled: 'নিষ্পত্তি সম্পন্ন',
  rejected: 'বাতিল',
};

const STATUS_TONE: Record<string, 'muted' | 'green' | 'amber' | 'red'> = {
  computed: 'amber',
  agm_approved: 'amber',
  posted: 'amber',
  paid: 'green',
  draft: 'muted',
  notice_issued: 'amber',
  held: 'amber',
  minutes_approved: 'green',
  requested: 'muted',
  approved: 'green',
  settled: 'green',
  rejected: 'red',
};

const FUND_BN: Record<string, string> = {
  member_welfare: 'সদস্য কল্যাণ',
  staff_benevolent: 'কর্মী সদয়',
  insurance: 'বীমা',
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

interface DividendRow {
  fiscalYear: string;
  surplus: string;
  reservePct: number;
  ratePct: number;
  status: DividendDistributionStatus;
  distribution: {
    pool: string;
    reserveAmount: string;
    ratePct: number;
    totalWeighted: number;
    perMember: { memberId: string; memberName: string; shares: number; monthsHeld: number; weightedShares: number; weightPct: number; amount: string }[];
  };
  journal?: { memo: string; lines: { accountCode: string; accountName: string; debit: string; credit: string }[] };
  payments: { memberId: string; amount: string; destination: 'savings' | 'cash'; paidAt: string }[];
}

interface AgmRow {
  id: string;
  fiscalYear: string;
  meetingDate: string;
  venue: string;
  noticeDate: string | null;
  noticeDays: number;
  agenda: { id: string; item: string; title: string }[];
  attendance: { memberId: string; memberName: string; present: boolean }[];
  quorumRequired: number;
  resolutions: { id: string; title: string; kind: string; result: string; inFavor: number; against: number }[];
  elections: { id: string; postBn: string; winnerName: string | null; candidates: { name: string; votes: number }[] }[];
  minutesBn: string;
  status: AgmStatus;
}

interface ExitRow {
  id: string;
  exitNo: string;
  memberId: string;
  memberName: string;
  requestDate: string;
  lines: { labelBn: string; amount: string }[];
  netPayable: string;
  status: ExitStatus;
  decisionNote: string;
  settledAt: string | null;
}

interface Reports {
  claimRatio: { pct: number; incidents: string; premiums: string };
  premiumVsPayout: { period: string; premiums: string; payouts: string; net: string; ratioPct: number }[];
  funds: { fund: string; labelBn: string; balance: string }[];
  dividendStatus: { fiscalYear: string; status: DividendDistributionStatus; pool: string; reserve: string; paidCount: number; total: number }[];
}

interface Journal {
  id: string;
  memo: string;
  lines: { accountCode: string; accountName: string; debit: string; credit: string }[];
  at: string;
}

export function GovernancePage() {
  const money = useMoneyFormatter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('dividend');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['cg'] });
  const act = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    fn()
      .catch((e: Error) => setError(e.message))
      .finally(() => setTimeout(() => setBusy(false), 400));
  };

  const dividends = useQuery({
    queryKey: ['cg', 'dividends'],
    queryFn: () => api.get<{ items: DividendRow[] }>('/coop/dividend'),
  });
  const agms = useQuery({
    queryKey: ['cg', 'agms'],
    queryFn: () => api.get<{ items: AgmRow[] }>('/coop/agm'),
  });
  const exits = useQuery({
    queryKey: ['cg', 'exits'],
    queryFn: () => api.get<{ items: ExitRow[] }>('/coop/exits'),
  });
  const reports = useQuery({
    queryKey: ['cg', 'reports'],
    queryFn: () => api.get<Reports>('/coop/reports'),
  });
  const journals = useQuery({
    queryKey: ['cg', 'journals'],
    queryFn: () => api.get<{ items: Journal[] }>('/coop/journals'),
  });

  const loading = [dividends, agms, exits, reports, journals].some((q) => q.isPending);

  /* ── Dividend mutations ── */
  const [divForm, setDivForm] = useState({
    fiscalYear: '2025-26',
    surplus: '150000',
    reservePct: '25',
    ratePct: '8',
    sharesA: '100',
    monthsA: '12',
    sharesB: '100',
    monthsB: '6',
    sharesC: '200',
    monthsC: '12',
  });
  const computeDividend = useMutation({
    mutationFn: () =>
      api.post('/coop/dividend/compute', {
        fiscalYear: divForm.fiscalYear,
        surplus: String(Number(divForm.surplus) || 0),
        reservePct: Number(divForm.reservePct) || 0,
        ratePct: Number(divForm.ratePct) || 0,
        holders: [
          { memberId: MEMBER_A, memberName: memberName(MEMBER_A), shares: Number(divForm.sharesA) || 0, monthsHeld: Number(divForm.monthsA) || 0 },
          { memberId: MEMBER_B, memberName: memberName(MEMBER_B), shares: Number(divForm.sharesB) || 0, monthsHeld: Number(divForm.monthsB) || 0 },
          { memberId: MEMBER_C, memberName: memberName(MEMBER_C), shares: Number(divForm.sharesC) || 0, monthsHeld: Number(divForm.monthsC) || 0 },
        ],
      }),
    onSuccess: invalidate,
  });
  const decideDividend = useMutation({
    mutationFn: ({ fy, body }: { fy: string; body: Record<string, unknown> }) => api.post(`/coop/dividend/${fy}/decision`, body),
    onSuccess: invalidate,
  });

  /* ── AGM mutations ── */
  const [agmForm, setAgmForm] = useState({ fiscalYear: '2025-26', meetingDate: '2026-09-30', venue: 'সমিতি কার্যালয়, ঢাকা', noticeDays: '14', quorumRequired: '2' });
  const createAgm = useMutation({
    mutationFn: () =>
      api.post('/coop/agm', {
        fiscalYear: agmForm.fiscalYear,
        meetingDate: agmForm.meetingDate,
        venue: agmForm.venue,
        noticeDays: Number(agmForm.noticeDays) || 14,
        quorumRequired: Number(agmForm.quorumRequired) || 10,
        agenda: [
          { item: '1', title: 'বার্ষিক প্রতিবেদন ও হিসাব গ্রহণ', note: '' },
          { item: '2', title: 'লভ্যাংশ হার অনুমোদন', note: '' },
          { item: '3', title: 'নির্বাচন কমিশন গঠন ও নির্বাচন', note: '' },
        ],
      }),
    onSuccess: invalidate,
  });
  const agmAction = useMutation({
    mutationFn: ({ id, path, body }: { id: string; path: string; body?: Record<string, unknown> }) =>
      path === 'attendance' ? api.put(`/coop/agm/${id}/attendance`, body ?? {}) : api.post(`/coop/agm/${id}/${path}`, body ?? {}),
    onSuccess: invalidate,
  });

  /* ── Exit mutations ── */
  const [exitForm, setExitForm] = useState({ memberId: MEMBER_A, savings: '12000', share: '5000', dividend: '1000', welfare: '1500', dues: '4500' });
  const requestExit = useMutation({
    mutationFn: () =>
      api.post('/coop/exits', {
        memberId: exitForm.memberId,
        memberName: memberName(exitForm.memberId),
        requestDate: new Date().toISOString().slice(0, 10),
        savingsBalance: String(Number(exitForm.savings) || 0),
        shareValue: String(Number(exitForm.share) || 0),
        dividendDue: String(Number(exitForm.dividend) || 0),
        welfareBalance: String(Number(exitForm.welfare) || 0),
        duesOutstanding: String(Number(exitForm.dues) || 0),
        note: 'সদস্যের আবেদন (ডেমো)',
      }),
    onSuccess: invalidate,
  });
  const decideExit = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => api.post(`/coop/exits/${id}/decision`, { action, note: 'ডেমো সিদ্ধান্ত' }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">সমবায় শাসন — লভ্যাংশ, সভা ও নিষ্পত্তি</h1>
        <Gavel className="h-5 w-5 text-muted-foreground" />
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
          {/* ── Tab 1: dividend & surplus ── */}
          {tab === 'dividend' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">নতুন বণ্টন গণনা (আইনত সঞ্চিত তহবিল + পরিমেয় গড় শেয়ার)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label htmlFor="cd-fy">অর্থবছর</Label>
                      <Input id="cd-fy" placeholder="2025-26" value={divForm.fiscalYear} onChange={(e) => setDivForm((f) => ({ ...f, fiscalYear: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cd-surplus">বার্ষিক উদ্বৃত্ত (৳)</Label>
                      <Input id="cd-surplus" type="number" min="0" value={divForm.surplus} onChange={(e) => setDivForm((f) => ({ ...f, surplus: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cd-reserve">আইনত রিজার্ভ %</Label>
                      <Input id="cd-reserve" type="number" min="0" max="100" value={divForm.reservePct} onChange={(e) => setDivForm((f) => ({ ...f, reservePct: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="cd-rate">সভায় অনুমোদিত হার %</Label>
                      <Input id="cd-rate" type="number" min="0" max="100" value={divForm.ratePct} onChange={(e) => setDivForm((f) => ({ ...f, ratePct: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {MEMBERS.map((m, i) => {
                      const sharesKey = (['sharesA', 'sharesB', 'sharesC'] as const)[i]!;
                      const monthsKey = (['monthsA', 'monthsB', 'monthsC'] as const)[i]!;
                      return (
                        <div key={m.id} className="rounded border p-2">
                          <p className="text-sm font-medium">{m.name}</p>
                          <div className="mt-1 flex gap-2">
                            <div className="flex-1 space-y-0.5">
                              <Label htmlFor={`cd-${sharesKey}`} className="text-xs">শেয়ার</Label>
                              <Input id={`cd-${sharesKey}`} type="number" min="0" className="h-8" value={divForm[sharesKey]} onChange={(e) => setDivForm((f) => ({ ...f, [sharesKey]: e.target.value }))} />
                            </div>
                            <div className="flex-1 space-y-0.5">
                              <Label htmlFor={`cd-${monthsKey}`} className="text-xs">মাস ধরে</Label>
                              <Input id={`cd-${monthsKey}`} type="number" min="0" max="12" className="h-8" value={divForm[monthsKey]} onChange={(e) => setDivForm((f) => ({ ...f, [monthsKey]: e.target.value }))} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button disabled={busy} onClick={() => act(() => computeDividend.mutateAsync())}>গণনা করুন</Button>
                  <p className="text-xs text-muted-foreground">
                    উদ্বৃত্ত থেকে আইনত সঞ্চিত তহবিল (ডিফল্ট ২৫%) বাদ দিয়ে বাকি পুল সদস্যদের মাস-ভিত্তিক গড় শেয়ার (শেয়ার × মাস ÷ ১২) অনুপাতে বণ্টন হয়।
                  </p>
                </CardContent>
              </Card>

              {(dividends.data?.items ?? []).map((d) => {
                const paid = new Set(d.payments.map((p) => p.memberId));
                return (
                  <Card key={d.fiscalYear}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                        <span className="flex items-center gap-2">
                          <Coins className="h-4 w-4" /> অর্থবছর {d.fiscalYear} — পুল {money(d.distribution.pool)} · রিজার্ভ {money(d.distribution.reserveAmount)}
                        </span>
                        <div className="flex items-center gap-2">
                          <Pill label={DIV_STATUS_BN[d.status]} tone={STATUS_TONE[d.status]} />
                          {d.status === 'computed' && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideDividend.mutateAsync({ fy: d.fiscalYear, body: { action: 'agm_approve' } }))}>
                              সভায় অনুমোদন
                            </Button>
                          )}
                          {d.status === 'agm_approved' && (
                            <Button size="sm" disabled={busy} onClick={() => act(() => decideDividend.mutateAsync({ fy: d.fiscalYear, body: { action: 'post' } }))}>
                              জাবেদা পোস্ট
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => window.print()}>
                            <Printer className="h-3.5 w-3.5" /> প্রিন্ট
                          </Button>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="border-b text-muted-foreground">
                          <tr>
                            <Th>সদস্য</Th>
                            <Th right>শেয়ার</Th>
                            <Th right>মাস</Th>
                            <Th right>গড় শেয়ার</Th>
                            <Th right>ভাগ %</Th>
                            <Th right>লভ্যাংশ</Th>
                            <Th>পরিশোধ</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.distribution.perMember.map((m) => (
                            <tr key={m.memberId} className="border-b last:border-0">
                              <Td>{m.memberName}</Td>
                              <Td right>{m.shares}</Td>
                              <Td right>{m.monthsHeld}</Td>
                              <Td right>{m.weightedShares}</Td>
                              <Td right>{m.weightPct}%</Td>
                              <Td right className="font-semibold">{money(m.amount)}</Td>
                              <Td>
                                {paid.has(m.memberId) ? (
                                  <Pill
                                    label={d.payments.find((p) => p.memberId === m.memberId)!.destination === 'savings' ? 'সঞ্চয়ে জমা' : 'নগদ'}
                                    tone="green"
                                  />
                                ) : d.status === 'posted' || d.status === 'paid' ? (
                                  <div className="flex gap-1">
                                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideDividend.mutateAsync({ fy: d.fiscalYear, body: { action: 'pay', memberId: m.memberId, destination: 'savings' } }))}>
                                      সঞ্চয়ে
                                    </Button>
                                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideDividend.mutateAsync({ fy: d.fiscalYear, body: { action: 'pay', memberId: m.memberId, destination: 'cash' } }))}>
                                      নগদ
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {d.journal && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {d.journal.memo}: {d.journal.lines.map((l) => (l.debit !== '0.00' ? `Dr ${l.accountCode} ${money(l.debit)}` : `Cr ${l.accountCode} ${money(l.credit)}`)).join(' | ')}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {(dividends.data?.items ?? []).length === 0 && (
                <p className="rounded border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">কোনো বণ্টন নেই — উপরের ফরম থেকে গণনা করুন।</p>
              )}
            </div>
          )}

          {/* ── Tab 2: AGM ── */}
          {tab === 'agm' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">নতুন সাধারণ সভা (নোটিশসহ তৈরি হয়)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="space-y-1">
                      <Label htmlFor="ag-fy">অর্থবছর</Label>
                      <Input id="ag-fy" placeholder="2025-26" value={agmForm.fiscalYear} onChange={(e) => setAgmForm((f) => ({ ...f, fiscalYear: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ag-date">সভার তারিখ</Label>
                      <Input id="ag-date" type="date" value={agmForm.meetingDate} onChange={(e) => setAgmForm((f) => ({ ...f, meetingDate: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ag-venue">স্থান</Label>
                      <Input id="ag-venue" value={agmForm.venue} onChange={(e) => setAgmForm((f) => ({ ...f, venue: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ag-notice">নোটিশ (দিন)</Label>
                      <Input id="ag-notice" type="number" min="7" max="60" value={agmForm.noticeDays} onChange={(e) => setAgmForm((f) => ({ ...f, noticeDays: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ag-quorum">কোরাম</Label>
                      <Input id="ag-quorum" type="number" min="1" value={agmForm.quorumRequired} onChange={(e) => setAgmForm((f) => ({ ...f, quorumRequired: e.target.value }))} />
                    </div>
                  </div>
                  <Button disabled={busy} onClick={() => act(() => createAgm.mutateAsync())}>সভা তৈরি করুন</Button>
                </CardContent>
              </Card>

              {(agms.data?.items ?? []).map((a) => {
                const presentCount = a.attendance.filter((x) => x.present).length;
                return (
                  <Card key={a.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                        <span className="flex items-center gap-2">
                          <CalendarCheck2 className="h-4 w-4" /> {a.fiscalYear} — {a.meetingDate} · {a.venue}
                        </span>
                        <div className="flex items-center gap-2">
                          <Pill label={AGM_STATUS_BN[a.status]} tone={STATUS_TONE[a.status]} />
                          {a.status === 'draft' && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => agmAction.mutateAsync({ id: a.id, path: 'decision', body: { action: 'issue_notice' } }))}>
                              নোটিশ জারি
                            </Button>
                          )}
                          {a.status === 'notice_issued' && (
                            <Button size="sm" disabled={busy} onClick={() => act(() => agmAction.mutateAsync({ id: a.id, path: 'decision', body: { action: 'hold' } }))}>
                              সভা শুরু (কোরাম {presentCount}/{a.quorumRequired})
                            </Button>
                          )}
                          {a.status === 'held' && (
                            <Button size="sm" disabled={busy} onClick={() => act(() => agmAction.mutateAsync({ id: a.id, path: 'decision', body: { action: 'approve_minutes' } }))}>
                              কার্যবিবরণী অনুমোদন
                            </Button>
                          )}
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {a.status === 'draft' && (
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => agmAction.mutateAsync({ id: a.id, path: 'attendance', body: { attendees: MEMBERS.map((m, i) => ({ memberId: m.id, memberName: m.name, shares: [100, 100, 200][i], present: i !== 1, proxyFor: null })) } }))}>
                            উপস্থিতি লিখুন (নমুনা)
                          </Button>
                        )}
                        {a.status === 'notice_issued' && (
                          <>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => agmAction.mutateAsync({ id: a.id, path: 'resolutions', body: { agendaItem: '1', title: 'বার্ষিক প্রতিবেদন গ্রহণ', kind: 'ordinary', inFavor: 2, against: 1 } }))}>
                              প্রস্তাব যোগ (সাধারণ)
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => agmAction.mutateAsync({ id: a.id, path: 'resolutions', body: { agendaItem: '2', title: 'লভ্যাংশ হার ৮% অনুমোদন', kind: 'special', inFavor: 2, against: 1 } }))}>
                              প্রস্তাব যোগ (বিশেষ)
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => agmAction.mutateAsync({ id: a.id, path: 'elections', body: { postBn: 'সভাপতি', method: 'secret_ballot', candidates: [{ name: 'কমল হোসেন', votes: 12 }, { name: 'রহিমা বেগম', votes: 9 }] } }))}>
                              নির্বাচন ফলাফল যোগ
                            </Button>
                          </>
                        )}
                      </div>

                      <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded border p-2 text-sm">
                          <p className="mb-1 font-medium">প্রস্তাবাবলি</p>
                          {a.resolutions.length === 0 && <p className="text-xs text-muted-foreground">(কোনো প্রস্তাব নেই)</p>}
                          {a.resolutions.map((r) => (
                            <p key={r.id} className="text-xs">
                              • {r.title} — <Pill label={r.result === 'passed' ? 'গৃহীত' : r.result === 'failed' ? 'বাতিল' : r.result} tone={r.result === 'passed' ? 'green' : r.result === 'failed' ? 'red' : 'muted'} /> {r.kind === 'special' ? '(বিশেষ ২/৩)' : ''} পক্ষে {r.inFavor} / বিপক্ষে {r.against}
                            </p>
                          ))}
                          <p className="mb-1 mt-2 font-medium">নির্বাচন</p>
                          {a.elections.length === 0 && <p className="text-xs text-muted-foreground">(এবার নির্বাচন হয়নি)</p>}
                          {a.elections.map((e) => (
                            <p key={e.id} className="flex items-center gap-1 text-xs">
                              <Vote className="h-3 w-3" /> {e.postBn}: <b>{e.winnerName ?? 'ভোট সমান'}</b>
                            </p>
                          ))}
                        </div>
                        <div className="rounded border bg-muted/30 p-2">
                          <p className="mb-1 text-sm font-medium">{a.status === 'minutes_approved' ? 'কার্যবিবরণী' : 'নোটিশ'} (বাংলা)</p>
                          <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-xs leading-relaxed">{a.minutesBn || '(খসড়া)'}</pre>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {(agms.data?.items ?? []).length === 0 && (
                <p className="rounded border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">কোনো সভা নেই — উপরের ফরম থেকে তৈরি করুন।</p>
              )}
            </div>
          )}

          {/* ── Tab 3: exit settlement ── */}
          {tab === 'exit' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">সদস্য অব্যাহতি নিষ্পত্তির আবেদন</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <div className="space-y-1">
                      <Label htmlFor="ex-member">সদস্য</Label>
                      <select
                        id="ex-member"
                        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={exitForm.memberId}
                        onChange={(e) => setExitForm((f) => ({ ...f, memberId: e.target.value }))}
                      >
                        {MEMBERS.map((m) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                    {(
                      [
                        ['savings', 'সঞ্চয়'],
                        ['share', 'শেয়ার'],
                        ['dividend', 'লভ্যাংশ'],
                        ['welfare', 'কল্যাণ'],
                        ['dues', 'বকেয়া'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key} className="space-y-1">
                        <Label htmlFor={`ex-${key}`}>{label} (৳)</Label>
                        <Input id={`ex-${key}`} type="number" min="0" value={exitForm[key]} onChange={(e) => setExitForm((f) => ({ ...f, [key]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                  <Button disabled={busy} onClick={() => act(() => requestExit.mutateAsync())}>আবেদন জমা দিন</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">নিষ্পত্তি তালিকা</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>ভাউচার নং</Th>
                        <Th>সদস্য</Th>
                        <Th right>প্রাপ্য</Th>
                        <Th>বিশদ</Th>
                        <Th>অবস্থা</Th>
                        <Th>কর্ম</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(exits.data?.items ?? []).map((x) => (
                        <tr key={x.id} className="border-b last:border-0 align-top">
                          <Td><span className="font-mono text-xs">{x.exitNo}</span></Td>
                          <Td>{x.memberName}</Td>
                          <Td right className="font-semibold">{money(x.netPayable)}</Td>
                          <Td>
                            <div className="text-xs text-muted-foreground">
                              {x.lines.map((l) => `${l.labelBn}: ${money(l.amount)}`).join(' · ')}
                            </div>
                          </Td>
                          <Td>
                            <Pill label={EXIT_STATUS_BN[x.status]} tone={STATUS_TONE[x.status]} />
                            {x.decisionNote && <div className="max-w-32 text-xs text-muted-foreground">{x.decisionNote}</div>}
                          </Td>
                          <Td>
                            <div className="flex flex-col gap-1">
                              {x.status === 'requested' && (
                                <>
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideExit.mutateAsync({ id: x.id, action: 'compute' }))}>গণনা</Button>
                                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideExit.mutateAsync({ id: x.id, action: 'reject' }))}>বাতিল</Button>
                                </>
                              )}
                              {x.status === 'computed' && (
                                <>
                                  <Button size="sm" disabled={busy} onClick={() => act(() => decideExit.mutateAsync({ id: x.id, action: 'approve' }))}>অনুমোদন</Button>
                                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideExit.mutateAsync({ id: x.id, action: 'reject' }))}>বাতিল</Button>
                                </>
                              )}
                              {x.status === 'approved' && (
                                <Button size="sm" disabled={busy} onClick={() => act(() => decideExit.mutateAsync({ id: x.id, action: 'settle' }))}>চূড়ান্ত নিষ্পত্তি</Button>
                              )}
                            </div>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(exits.data?.items ?? []).length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">কোনো আবেদন নেই — উপরের ফরম ব্যবহার করুন।</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Tab 4: reports ── */}
          {tab === 'reports' && reports.data && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="flex items-center gap-2 text-sm font-medium"><FileBarChart2 className="h-4 w-4" /> দাবি অনুপাত (claim ratio)</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-lg font-bold tabular-nums text-teal-700">{reports.data.claimRatio.pct}%</p>
                    <p className="text-xs text-muted-foreground">প্রিমিয়াম {money(reports.data.claimRatio.premiums)} · দাবি {money(reports.data.claimRatio.incidents)}</p>
                  </CardContent>
                </Card>
                {reports.data.funds.map((f) => (
                  <Card key={f.fund}>
                    <CardHeader className="pb-1"><CardTitle className="text-sm font-medium">{f.labelBn || FUND_BN[f.fund]} তহবিল</CardTitle></CardHeader>
                    <CardContent>
                      <p className="text-lg font-bold tabular-nums text-teal-700">{money(f.balance)}</p>
                      <p className="text-xs text-muted-foreground">প্রাপ্তি − পরিশোধ</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">প্রিমিয়াম বনাম পরিশোধ</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>বছর</Th>
                        <Th right>প্রিমিয়াম</Th>
                        <Th right>পরিশোধ</Th>
                        <Th right>নিট</Th>
                        <Th right>অনুপাত</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.data.premiumVsPayout.map((r) => (
                        <tr key={r.period} className="border-b last:border-0">
                          <Td>{r.period}</Td>
                          <Td right>{money(r.premiums)}</Td>
                          <Td right>{money(r.payouts)}</Td>
                          <Td right>{money(r.net)}</Td>
                          <Td right>{r.ratioPct}%</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {reports.data.premiumVsPayout.length === 0 && <p className="py-3 text-sm text-muted-foreground">কোনো ভুক্তি নেই।</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">লভ্যাংশ অবস্থা</CardTitle></CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>অর্থবছর</Th>
                        <Th>অবস্থা</Th>
                        <Th right>পুল</Th>
                        <Th right>রিজার্ভ</Th>
                        <Th right>পরিশোধ</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.data.dividendStatus.map((d) => (
                        <tr key={d.fiscalYear} className="border-b last:border-0">
                          <Td>{d.fiscalYear}</Td>
                          <Td><Pill label={DIV_STATUS_BN[d.status]} tone={STATUS_TONE[d.status]} /></Td>
                          <Td right>{money(d.pool)}</Td>
                          <Td right>{money(d.reserve)}</Td>
                          <Td right>{d.paidCount}/{d.total}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {reports.data.dividendStatus.length === 0 && <p className="py-3 text-sm text-muted-foreground">কোনো বণ্টন নেই।</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">শাসন জাবেদা (লভ্যাংশ ও নিষ্পত্তি)</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(journals.data?.items ?? []).map((j) => (
                    <div key={j.id} className="rounded border p-2 text-xs">
                      <p className="font-medium">{j.memo} <span className="text-muted-foreground">· {new Date(j.at).toLocaleString('bn-BD')}</span></p>
                      <p className="mt-1 text-muted-foreground">
                        {j.lines.map((l) => (l.debit !== '0.00' ? `Dr ${l.accountCode} ${l.accountName} ${money(l.debit)}` : `Cr ${l.accountCode} ${l.accountName} ${money(l.credit)}`)).join('  |  ')}
                      </p>
                    </div>
                  ))}
                  {(journals.data?.items ?? []).length === 0 && <p className="text-sm text-muted-foreground">কোনো জাবেদা নেই — পোস্ট বা নিষ্পত্তি করলে এখানে দেখা যাবে।</p>}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
