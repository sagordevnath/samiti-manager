/**
 * ── Insurance, Member Welfare & Dividend page ────────────────────────────────
 * Tab 1 ক্রেডিট লাইফ: policies issued at disbursement (premium % of loan,
 *   nominee) and the death-claim ladder BM → AM → HO with required documents,
 *   then payout or loan waiver.
 * Tab 2 মাইক্রো বীমা: cattle / crop / health products, enrollments with
 *   subject refs and claim assessment with photos.
 * Tab 3 কল্যাণ তহবিল: contribution rules + caps, grant / interest-free loan
 *   requests with the BM/AM approval matrix and disbursement.
 * Tab 4 লেজার: fund balances, pending counts, ledger entries, contribution.
 * Tab 5 লভ্যাংশ: cooperative surplus split by share holding.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartHandshake, Landmark, ShieldCheck, Stethoscope, TrendingUp } from 'lucide-react';
import type {
  CreditLifePolicy,
  InsuranceClaim,
  MicroEnrollment,
  MicroInsuranceProduct,
  WelfareFundRules,
  WelfareRequest,
} from '@samity/shared';
import {
  CLAIM_STATUS_LABELS_BN,
  DEATH_CLAIM_REQUIRED_DOCS,
  MICRO_CLAIM_CAUSES,
  MICRO_INSURANCE_LABELS_BN,
  WELFARE_REQUEST_LABELS_BN,
  missingDeathDocs,
  welfareNextLevel,
  type ClaimStatus,
  type MicroInsuranceKind,
  type WelfareRequestKind,
  type WelfareRequestStatus,
  type WelfareRequestType,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const TABS = ['creditLife', 'micro', 'welfare', 'ledger', 'dividend'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  creditLife: 'ক্রেডিট লাইফ ও দাবি',
  micro: 'মাইক্রো বীমা',
  welfare: 'কল্যাণ তহবিল',
  ledger: 'তহবিল লেজার',
  dividend: 'লভ্যাংশ',
};

const MEMBER_A = '00000000-0000-4000-8000-0000000001a1';
const MEMBER_B = '00000000-0000-4000-8000-0000000001a2';
const MEMBER_C = '00000000-0000-4000-8000-0000000001a3';
const POLICY_C001 = '00000000-0000-4000-8000-00000000c001';
const PRODUCT_CATTLE = '00000000-0000-4000-8000-00000000d001';

const MEMBER_NAMES: Record<string, string> = {
  [MEMBER_A]: 'রহিমা বেগম',
  [MEMBER_B]: 'সালমা খাতুন',
  [MEMBER_C]: 'কমল হোসেন',
};

const STATUS_TONE: Record<string, 'muted' | 'green' | 'amber' | 'red'> = {
  // claims
  submitted: 'amber',
  bm_review: 'amber',
  am_review: 'amber',
  ho_review: 'amber',
  approved: 'green',
  paid: 'green',
  rejected: 'red',
  // policies / enrollments
  active: 'green',
  claimed: 'muted',
  expired: 'muted',
  // welfare
  disbursed: 'green',
};

const FUND_BN: Record<string, string> = {
  member_welfare: 'সদস্য কল্যাণ',
  staff_benevolent: 'কর্মী সদয়',
  insurance: 'বীমা',
  member: 'সদস্য',
  staff: 'কর্মী',
};

const LEDGER_TYPE_BN: Record<string, string> = {
  contribution: 'চাঁদা',
  premium: 'প্রিমিয়াম',
  grant: 'অনুদান প্রদান',
  loan_disbursed: 'ঋণ প্রদান',
  claim_paid: 'দাবি পরিশোধ',
  claim_waiver: 'ঋণ মাফ',
  loan_repaid: 'ঋণ পরিশোধ',
  adjustment: 'সমন্বয়',
};

const TYPE_BN: Record<WelfareRequestType, string> = {
  grant: 'অনুদান',
  interest_free_loan: 'বিনামূল্যে ঋণ',
};

const CAUSE_BN: Record<string, string> = {
  natural: 'স্বাভাবিক',
  accident: 'দুর্ঘটনা',
  illness: 'অসুস্থতা',
  other: 'অন্যান্য',
  death: 'মৃত্যু',
  theft: 'চুরি',
  injury: 'আঘাত',
  flood: 'বন্যা',
  drought: 'খরা',
  pest: 'পোকা',
  storm: 'ঝড়',
  hospitalization: 'হাসপাতালে ভর্তি',
  surgery: 'অপারেশন',
  critical_illness: 'মারাত্মক রোগ',
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

type DividendResult = { pool: string; reserve: string; perHolder: { memberId: string; memberName: string; shares: number; amount: string }[] };

const TODAY = () => new Date().toISOString().slice(0, 10);

export function WelfarePage() {
  const money = useMoneyFormatter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('creditLife');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['iw'] });
  const act = (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    fn()
      .catch((e: Error) => setError(e.message))
      .finally(() => setTimeout(() => setBusy(false), 400));
  };

  const policies = useQuery({
    queryKey: ['iw', 'policies'],
    queryFn: () => api.get<{ items: CreditLifePolicy[] }>('/insurance/policies'),
  });
  const claims = useQuery({
    queryKey: ['iw', 'claims'],
    queryFn: () => api.get<{ items: InsuranceClaim[] }>('/insurance/claims'),
  });
  const products = useQuery({
    queryKey: ['iw', 'products'],
    queryFn: () => api.get<{ items: MicroInsuranceProduct[] }>('/insurance/micro/products'),
  });
  const enrollments = useQuery({
    queryKey: ['iw', 'enrollments'],
    queryFn: () => api.get<{ items: MicroEnrollment[] }>('/insurance/micro/enrollments'),
  });
  const rules = useQuery({
    queryKey: ['iw', 'rules'],
    queryFn: () => api.get<WelfareFundRules>('/insurance/welfare/rules'),
  });
  const requests = useQuery({
    queryKey: ['iw', 'requests'],
    queryFn: () => api.get<{ items: WelfareRequest[] }>('/insurance/welfare/requests'),
  });
  const ledger = useQuery({
    queryKey: ['iw', 'ledger'],
    queryFn: () =>
      api.get<{
        items: { id: string; fund: string; entryType: string; amount: string; memo: string; at: string }[];
        balances: { member: string; staff: string; insurance: string };
      }>('/insurance/welfare/ledger'),
  });
  const summary = useQuery({
    queryKey: ['iw', 'summary'],
    queryFn: () =>
      api.get<{ memberBalance: string; staffBalance: string; insuranceBalance: string; pendingMember: number; pendingStaff: number }>(
        '/insurance/welfare/summary',
      ),
  });

  const loading = [policies, claims, products, enrollments, rules, requests, ledger, summary].some((q) => q.isPending);

  /* ── Mutations ── */
  const issuePolicy = useMutation({
    mutationFn: () =>
      api.post('/insurance/policies', {
        applicationId: crypto.randomUUID(),
        loanNumber: `LO-DHK-${Math.floor(1000 + Math.random() * 9000)}`,
        memberId: MEMBER_C,
        memberName: MEMBER_NAMES[MEMBER_C],
        principal: '120000.00',
        termMonths: 12,
        nomineeName: 'নুরুল ইসলাম',
        nomineeRelation: 'son',
        nomineePhone: '01812345678',
      }),
    onSuccess: invalidate,
  });
  const submitDeathClaim = useMutation({
    mutationFn: () =>
      api.post('/insurance/claims', {
        policyId: POLICY_C001,
        kind: 'death',
        eventDate: TODAY(),
        cause: 'natural',
        documents: DEATH_CLAIM_REQUIRED_DOCS.map((d) => ({ id: d.id, labelBn: d.labelBn, path: `docs/${d.id}.pdf` })),
        assessmentNote: 'স্বামীর মাধ্যমে জানানো হয়েছে; সকল নথি যাচাই সম্পন্ন।',
        claimedAmount: '180000.00',
      }),
    onSuccess: invalidate,
  });
  const decideClaim = useMutation({
    mutationFn: ({ id, action, approvedAmount }: { id: string; action: string; approvedAmount?: string }) =>
      api.post(`/insurance/claims/${id}/decision`, { action, note: 'ডেমো সিদ্ধান্ত', ...(approvedAmount ? { approvedAmount } : {}) }),
    onSuccess: invalidate,
  });
  const enroll = useMutation({
    mutationFn: () =>
      api.post('/insurance/micro/enrollments', {
        productId: PRODUCT_CATTLE,
        memberId: MEMBER_C,
        memberName: MEMBER_NAMES[MEMBER_C],
        units: 1,
        subjectRef: 'গরু #২০৩',
        startDate: TODAY(),
      }),
    onSuccess: invalidate,
  });
  const submitMicroClaim = useMutation({
    mutationFn: (enrollment: MicroEnrollment) =>
      api.post('/insurance/micro/claims', {
        enrollmentId: enrollment.id,
        cause: MICRO_CLAIM_CAUSES[enrollment.kind as MicroInsuranceKind][0],
        eventDate: TODAY(),
        assessmentNote: 'মাঠ পরিদর্শনে মূল্যায়ন করা হয়েছে।',
        photos: [`photos/${enrollment.kind}-assess-1.jpg`, `photos/${enrollment.kind}-assess-2.jpg`],
        claimedAmount: enrollment.coverageLimit,
      }),
    onSuccess: invalidate,
  });
  const submitWelfare = useMutation({
    mutationFn: ({ kind, type, amount }: { kind: WelfareRequestKind; type: WelfareRequestType; amount: string }) =>
      api.post('/insurance/welfare/requests', {
        fund: 'member',
        requesterId: kind === 'funeral' ? MEMBER_B : MEMBER_A,
        requesterName: kind === 'funeral' ? MEMBER_NAMES[MEMBER_B] : MEMBER_NAMES[MEMBER_A],
        kind,
        type,
        amount,
        reason: kind === 'funeral' ? 'পরিবারের প্রধানের মৃত্যুতে অন্ত্যেষ্টিক্রিয়া ব্যয়' : kind === 'flood' ? 'বন্যায় ঘরবাড়ি ক্ষতিগ্রস্ত' : 'জরুরি চিকিৎসা ব্যয়',
        photos: kind === 'flood' ? ['photos/flood-home.jpg'] : [],
      }),
    onSuccess: invalidate,
  });
  const decideWelfare = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      api.post(`/insurance/welfare/requests/${id}/decision`, { action, note: 'ডেমো সিদ্ধান্ত' }),
    onSuccess: invalidate,
  });
  const contribute = useMutation({
    mutationFn: () => api.post('/insurance/welfare/contribution', { fund: 'member_welfare', amount: '500.00', memo: 'মাসিক চাঁদা জমা (ডেমো)' }),
    onSuccess: invalidate,
  });
  const [divForm, setDivForm] = useState({ surplus: '150000', payoutPct: '70', sharesA: '12', sharesB: '8', sharesC: '5' });
  const [divResult, setDivResult] = useState<DividendResult | null>(null);
  const computeDividend = useMutation({
    mutationFn: () => {
      const holders = [
        { memberId: MEMBER_A, memberName: MEMBER_NAMES[MEMBER_A], shares: Number(divForm.sharesA) || 0 },
        { memberId: MEMBER_B, memberName: MEMBER_NAMES[MEMBER_B], shares: Number(divForm.sharesB) || 0 },
        { memberId: MEMBER_C, memberName: MEMBER_NAMES[MEMBER_C], shares: Number(divForm.sharesC) || 0 },
      ];
      return api.post<DividendResult>('/insurance/dividend/compute', {
        surplus: String(Number(divForm.surplus) || 0),
        payoutPct: Number(divForm.payoutPct) || 0,
        totalShares: holders.reduce((s, h) => s + h.shares, 0),
        holders,
      });
    },
    onSuccess: (data) => setDivResult(data ?? null),
  });

  /* ── Derived ── */
  const ruleValues = rules.data?.rules;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">বীমা, কল্যাণ তহবিল ও লভ্যাংশ</h1>
        <HeartHandshake className="h-5 w-5 text-muted-foreground" />
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
          {/* ── Tab 1: credit life policies + claim ladder ── */}
          {tab === 'creditLife' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" /> ক্রেডিট লাইফ পলিসি (ঋণ বিতরণে ইস্যু)
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => issuePolicy.mutateAsync())}>
                        নমুনা পলিসি ইস্যু (কমল হোসেন)
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => submitDeathClaim.mutateAsync())}>
                        মৃত্যু দাবি দাখিল (রহিমা বেগম)
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>ঋণ নং</Th>
                        <Th>সদস্য</Th>
                        <Th right>মূলধন</Th>
                        <Th right>প্রিমিয়াম</Th>
                        <Th right>কভারেজ</Th>
                        <Th>নমিনি</Th>
                        <Th>মেয়াদ</Th>
                        <Th>অবস্থা</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(policies.data?.items ?? []).map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <Td><span className="font-mono text-xs">{p.loanNumber}</span></Td>
                          <Td>{p.memberName}</Td>
                          <Td right>{money(p.principal)}</Td>
                          <Td right>{money(p.premiumAmount)} <span className="text-xs text-muted-foreground">({p.premiumRatePct}%)</span></Td>
                          <Td right>{money(p.coverageAmount)}</Td>
                          <Td>
                            {p.nomineeName}
                            <div className="text-xs text-muted-foreground">{p.nomineeRelation}{p.nomineePhone ? ` · ${p.nomineePhone}` : ''}</div>
                          </Td>
                          <Td className="text-xs">{p.startDate} → {p.endDate}</Td>
                          <Td><Pill label={p.status === 'active' ? 'সক্রিয়' : p.status === 'claimed' ? 'দাবি হয়েছে' : 'শেষ'} tone={STATUS_TONE[p.status]} /></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs text-muted-foreground">
                    প্রিমিয়াম = মূলধনের ১% (ন্যূনতম ১০০৳), বিতরণের সময় আদায় হয় — Dr নগদ / Cr বীমা আয় (৪২২০)।
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">দাবি পর্যালোচনা (শাখা → এরিয়া → প্রধান কার্যালয়)</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>দাবি নং</Th>
                        <Th>ধরন</Th>
                        <Th>সদস্য</Th>
                        <Th>ঘটনা</Th>
                        <Th>কারণ</Th>
                        <Th right>দাবি</Th>
                        <Th right>অনুমোদিত</Th>
                        <Th>নথি/ছবি</Th>
                        <Th>অবস্থা</Th>
                        <Th>কর্ম</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(claims.data?.items ?? []).map((c) => {
                        const missing = missingDeathDocs(c);
                        return (
                          <tr key={c.id} className="border-b last:border-0 align-top">
                            <Td><span className="font-mono text-xs">{c.claimNo}</span></Td>
                            <Td>
                              {c.kind === 'death' ? 'মৃত্যু' : MICRO_INSURANCE_LABELS_BN[c.kind as MicroInsuranceKind] ?? c.kind}
                              <div className="text-xs text-muted-foreground">{c.settlementMode === 'waiver' ? 'ঋণ মাফ' : c.settlementMode === 'payout' ? 'নগদ পরিশোধ' : ''}</div>
                            </Td>
                            <Td>{c.memberName}</Td>
                            <Td className="text-xs">{c.eventDate}</Td>
                            <Td className="text-xs">{CAUSE_BN[c.cause] ?? (c.cause || '—')}</Td>
                            <Td right>{money(c.claimedAmount)}</Td>
                            <Td right>{c.approvedAmount ? money(c.approvedAmount) : '—'}</Td>
                            <Td>
                              {missing.length > 0 ? (
                                <span className="text-xs text-red-600">অনুপস্থিত: {missing.join(', ')}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {c.documents.length ? `${c.documents.length} টি ✓` : '—'}
                                </span>
                              )}
                            </Td>
                            <Td><Pill label={CLAIM_STATUS_LABELS_BN[c.status as ClaimStatus] ?? c.status} tone={STATUS_TONE[c.status]} /></Td>
                            <Td>
                              <div className="flex flex-col gap-1">
                                {c.status === 'submitted' && (
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideClaim.mutateAsync({ id: c.id, action: 'advance' }))}>
                                    শাখা পর্যালোচনায়
                                  </Button>
                                )}
                                {c.status === 'bm_review' && (
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideClaim.mutateAsync({ id: c.id, action: 'advance' }))}>
                                    এরিয়ায় পাঠান
                                  </Button>
                                )}
                                {c.status === 'am_review' && (
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideClaim.mutateAsync({ id: c.id, action: 'advance' }))}>
                                    প্রধান কার্যালয়ে
                                  </Button>
                                )}
                                {c.status === 'ho_review' && (
                                  <>
                                    <Button size="sm" disabled={busy} onClick={() => act(() => decideClaim.mutateAsync({ id: c.id, action: 'approve' }))}>
                                      অনুমোদন
                                    </Button>
                                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideClaim.mutateAsync({ id: c.id, action: 'reject' }))}>
                                      বাতিল
                                    </Button>
                                  </>
                                )}
                                {c.status === 'approved' && (
                                  <>
                                    <Button size="sm" disabled={busy} onClick={() => act(() => decideClaim.mutateAsync({ id: c.id, action: 'pay' }))}>
                                      নগদ পরিশোধ
                                    </Button>
                                    {c.kind === 'death' && (
                                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideClaim.mutateAsync({ id: c.id, action: 'settle_waiver' }))}>
                                        ঋণ মাফ
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(claims.data?.items ?? []).length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">কোনো দাবি নেই — উপরের বাটন দিয়ে দাবি দাখিল করুন।</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    মৃত্যু দাবিতে শাখা পর্যালোচনা ছাড়ার আগে {DEATH_CLAIM_REQUIRED_DOCS.map((d) => d.labelBn).join(' · ')} আবশ্যক। পরিশোধে Dr ৫৩০০ দাবি ব্যয় / Cr ১০১০ নগদ (বা Cr ১২০০ ঋণ পোর্টফোলিও, মাফে)।
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Tab 2: micro insurance ── */}
          {tab === 'micro' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Stethoscope className="h-4 w-4" /> পণ্য (গবাদি পশু · ফসল · স্বাস্থ্য)
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>পণ্য</Th>
                        <Th>ধরন</Th>
                        <Th right>বার্ষিক প্রিমিয়াম</Th>
                        <Th right>কভারেজ সীমা</Th>
                        <Th right>ইউনিট</Th>
                        <Th>অবস্থা</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(products.data?.items ?? []).map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <Td>{p.nameBn}</Td>
                          <Td>{MICRO_INSURANCE_LABELS_BN[p.kind]}</Td>
                          <Td right>{money(p.annualPremium)}</Td>
                          <Td right>{money(p.coverageLimit)}</Td>
                          <Td right>{p.units}</Td>
                          <Td><Pill label={p.active ? 'সক্রিয়' : 'নিষ্ক্রিয়'} tone={p.active ? 'green' : 'muted'} /></Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>ভর্তি ও দাবি (মূল্যায়ন ফরম + ছবি)</span>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => enroll.mutateAsync())}>
                      নমুনা ভর্তি (কমল হোসেন, গরু)
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>সদস্য</Th>
                        <Th>ধরন</Th>
                        <Th>বিষয়</Th>
                        <Th right>ইউনিট</Th>
                        <Th right>প্রিমিয়াম</Th>
                        <Th right>কভারেজ</Th>
                        <Th>মেয়াদ</Th>
                        <Th>অবস্থা</Th>
                        <Th>কর্ম</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(enrollments.data?.items ?? []).map((e) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <Td>{e.memberName}</Td>
                          <Td>{MICRO_INSURANCE_LABELS_BN[e.kind]}</Td>
                          <Td className="text-xs">{e.subjectRef || '—'}</Td>
                          <Td right>{e.units}</Td>
                          <Td right>{money(e.annualPremium)}</Td>
                          <Td right>{money(e.coverageLimit)}</Td>
                          <Td className="text-xs">{e.startDate} → {e.endDate}</Td>
                          <Td><Pill label={e.status === 'active' ? 'সক্রিয়' : e.status === 'claimed' ? 'দাবি হয়েছে' : 'শেষ'} tone={STATUS_TONE[e.status]} /></Td>
                          <Td>
                            {e.status === 'active' && (
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => submitMicroClaim.mutateAsync(e))}>
                                দাবি দাখিল ({CAUSE_BN[MICRO_CLAIM_CAUSES[e.kind as MicroInsuranceKind][0] ?? '']})
                              </Button>
                            )}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(enrollments.data?.items ?? []).length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">কোনো ভর্তি নেই — ডেমো বাটন ব্যবহার করুন।</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    দাবি জমা হলে ছবি ছাড়া গ্রহণ করা হয় না; কভারেজ = ইউনিট-ভিত্তিক সীমা, দাবির পরিমাণ ছাড়িয়ে যায় না। দাবিগুলো "ক্রেডিট লাইফ ও দাবি" ট্যাবের তালিকায় একই পর্যালোচনা ধাপে যায়।
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Tab 3: member welfare fund ── */}
          {tab === 'welfare' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">নিয়ম ও অনুমোদন ম্যাট্রিক্স</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border p-2">সদস্য মাসিক চাঁদা: <b className="tabular-nums">{money(rules.data?.monthlyContribution ?? '0')}</b></div>
                    <div className="rounded border p-2">কর্মী মাসিক চাঁদা: <b className="tabular-nums">{money(rules.data?.staffContribution ?? '0')}</b></div>
                    <div className="rounded border p-2">অনুদান সীমা: <b className="tabular-nums">{money(String(ruleValues?.grantCapBdt ?? 0))}</b></div>
                    <div className="rounded border p-2">বিনামূল্যে ঋণ সীমা: <b className="tabular-nums">{money(String(ruleValues?.loanCapBdt ?? 0))}</b> · {ruleValues?.loanTermMonths ?? 0} মাস</div>
                    <div className="rounded border p-2">শাখা ব্যবস্থাপক অনুমোদন ≤ <b className="tabular-nums">{money(String(ruleValues?.bmApprovalUpToBdt ?? 0))}</b></div>
                    <div className="rounded border p-2">এরিয়া ব্যবস্থাপক অনুমোদন ≤ <b className="tabular-nums">{money(String(ruleValues?.amApprovalUpToBdt ?? 0))}</b></div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>আবেদন (অনুদান / বিনামূল্যে ঋণ)</span>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => submitWelfare.mutateAsync({ kind: 'illness', type: 'grant', amount: '2500.00' }))}>
                        নমুনা অনুদান (অসুস্থতা ২৫০০৳)
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => submitWelfare.mutateAsync({ kind: 'flood', type: 'interest_free_loan', amount: '10000.00' }))}>
                        নমুনা ঋণ (বন্যা ১০,০০০৳)
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>আবেদন নং</Th>
                        <Th>তহবিল</Th>
                        <Th>আবেদনকারী</Th>
                        <Th>কারণ</Th>
                        <Th>ধরন</Th>
                        <Th right>পরিমাণ</Th>
                        <Th>পরবর্তী অনুমোদন</Th>
                        <Th>অবস্থা</Th>
                        <Th>কর্ম</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(requests.data?.items ?? []).map((r) => {
                        const gate = welfareNextLevel(r.status as WelfareRequestStatus, r.amount, ruleValues);
                        const canApprove = r.status !== 'submitted' && r.status !== 'rejected' && r.status !== 'disbursed' && gate.next === 'approved';
                        return (
                          <tr key={r.id} className="border-b last:border-0 align-top">
                            <Td><span className="font-mono text-xs">{r.requestId}</span></Td>
                            <Td>{FUND_BN[r.fund] ?? r.fund}</Td>
                            <Td>{r.requesterName}</Td>
                            <Td>
                              {WELFARE_REQUEST_LABELS_BN[r.kind as WelfareRequestKind] ?? r.kind}
                              <div className="max-w-40 text-xs text-muted-foreground">{r.reason}</div>
                              {r.photos.length > 0 && <div className="text-xs text-teal-700">📷 {r.photos.length} ছবি</div>}
                            </Td>
                            <Td>{TYPE_BN[r.type]}</Td>
                            <Td right className="font-semibold">{money(r.amount)}</Td>
                            <Td className="text-xs">{r.status === 'submitted' || r.status === 'bm_review' || r.status === 'am_review' ? gate.approverBn : '—'}</Td>
                            <Td><Pill label={r.status === 'disbursed' ? 'বিতরণ সম্পন্ন' : CLAIM_STATUS_LABELS_BN[r.status as ClaimStatus] ?? r.status} tone={STATUS_TONE[r.status]} /></Td>
                            <Td>
                              <div className="flex flex-col gap-1">
                                {r.status === 'submitted' && (
                                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideWelfare.mutateAsync({ id: r.id, action: 'advance' }))}>
                                    শাখা পর্যালোচনায়
                                  </Button>
                                )}
                                {(r.status === 'bm_review' || r.status === 'am_review') && (
                                  <>
                                    {canApprove ? (
                                      <Button size="sm" disabled={busy} onClick={() => act(() => decideWelfare.mutateAsync({ id: r.id, action: 'approve' }))}>
                                        অনুমোদন ({gate.approverBn})
                                      </Button>
                                    ) : (
                                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideWelfare.mutateAsync({ id: r.id, action: 'advance' }))}>
                                        পরবর্তী ধাপে ({gate.approverBn})
                                      </Button>
                                    )}
                                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideWelfare.mutateAsync({ id: r.id, action: 'reject' }))}>
                                      বাতিল
                                    </Button>
                                  </>
                                )}
                                {r.status === 'approved' && (
                                  <Button size="sm" disabled={busy} onClick={() => act(() => decideWelfare.mutateAsync({ id: r.id, action: 'disburse' }))}>
                                    বিতরণ করুন
                                  </Button>
                                )}
                              </div>
                            </Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(requests.data?.items ?? []).length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">কোনো আবেদন নেই — ডেমো বাটন ব্যবহার করুন।</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    অনুমোদন ম্যাট্রিক্স: শাখা ব্যবস্থাপক ≤ {money(String(ruleValues?.bmApprovalUpToBdt ?? 0))}, এরিয়া ব্যবস্থাপক ≤ {money(String(ruleValues?.amApprovalUpToBdt ?? 0))}, এর বেশি হলে প্রধান কার্যালয়। বিতরণে তহবিল লেজারে খতিয়ান ভুক্তি হয়।
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Tab 4: fund ledger & summary ── */}
          {tab === 'ledger' && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="flex items-center gap-2 text-sm font-medium"><HeartHandshake className="h-4 w-4" /> সদস্য কল্যাণ তহবিল</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-lg font-bold tabular-nums text-teal-700">{money(summary.data?.memberBalance ?? '0')}</p>
                    <p className="text-xs text-muted-foreground">অপেক্ষমাণ আবেদন: {summary.data?.pendingMember ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="flex items-center gap-2 text-sm font-medium"><Landmark className="h-4 w-4" /> কর্মী সদয় তহবিল</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-lg font-bold tabular-nums text-teal-700">{money(summary.data?.staffBalance ?? '0')}</p>
                    <p className="text-xs text-muted-foreground">অপেক্ষমাণ আবেদন: {summary.data?.pendingStaff ?? 0}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1"><CardTitle className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" /> বীমা তহবিল (প্রিমিয়াম)</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-lg font-bold tabular-nums text-teal-700">{money(summary.data?.insuranceBalance ?? '0')}</p>
                    <p className="text-xs text-muted-foreground">প্রিমিয়াম আদায় − দাবি পরিশোধ</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>খতিয়ান</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => contribute.mutateAsync())}>
                        নমুনা চাঁদা জমা (সদস্য ৫০০৳)
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>সময়</Th>
                        <Th>তহবিল</Th>
                        <Th>ভুক্তি</Th>
                        <Th right>পরিমাণ</Th>
                        <Th>মন্তব্য</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ledger.data?.items ?? []).map((l) => (
                        <tr key={l.id} className="border-b last:border-0">
                          <Td className="whitespace-nowrap text-xs">{new Date(l.at).toLocaleString('bn-BD')}</Td>
                          <Td>{FUND_BN[l.fund] ?? l.fund}</Td>
                          <Td>{LEDGER_TYPE_BN[l.entryType] ?? l.entryType}</Td>
                          <Td right className="font-semibold">{money(l.amount)}</Td>
                          <Td className="text-xs text-muted-foreground">{l.memo}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Tab 5: dividend ── */}
          {tab === 'dividend' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4" /> লভ্যাংশ বণ্টন (উদ্বৃত্তপূর্ণ শেয়ার অনুপাতে)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="space-y-1">
                    <Label htmlFor="div-surplus">বার্ষিক উদ্বৃত্ত (৳)</Label>
                    <Input id="div-surplus" type="number" min="0" value={divForm.surplus} onChange={(e) => setDivForm((f) => ({ ...f, surplus: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="div-payout">বণ্টনযোগ্য %</Label>
                    <Input id="div-payout" type="number" min="0" max="100" value={divForm.payoutPct} onChange={(e) => setDivForm((f) => ({ ...f, payoutPct: e.target.value }))} />
                  </div>
                  {(['sharesA', 'sharesB', 'sharesC'] as const).map((k, i) => (
                    <div key={k} className="space-y-1">
                      <Label htmlFor={`div-${k}`}>{MEMBER_NAMES[(i === 0 ? MEMBER_A : i === 1 ? MEMBER_B : MEMBER_C)]} — শেয়ার</Label>
                      <Input id={`div-${k}`} type="number" min="0" value={divForm[k]} onChange={(e) => setDivForm((f) => ({ ...f, [k]: e.target.value }))} />
                    </div>
                  ))}
                </div>
                <Button disabled={busy} onClick={() => act(() => computeDividend.mutateAsync())}>লভ্যাংশ গণনা করুন</Button>

                {divResult && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-3 rounded border bg-muted/30 p-3 text-sm">
                      <span>বণ্টন পুল: <b className="tabular-nums">{money(divResult.pool)}</b></span>
                      <span>সংরক্ষিত (রিজার্ভ): <b className="tabular-nums">{money(divResult.reserve)}</b></span>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="border-b text-muted-foreground">
                        <tr>
                          <Th>সদস্য</Th>
                          <Th right>শেয়ার</Th>
                          <Th right>লভ্যাংশ</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {divResult.perHolder.map((h) => (
                          <tr key={h.memberId} className="border-b last:border-0">
                            <Td>{h.memberName}</Td>
                            <Td right>{h.shares}</Td>
                            <Td right className="font-semibold">{money(h.amount)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  লভ্যাংশ = উদ্বৃত্ত × বণ্টন% পুল, প্রতি সদস্যের অংশ = পুল × (সদস্যের শেয়ার ÷ মোট শেয়ার)। বাকি অংশ সংরক্ষিত তহবিলে যায়।
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
