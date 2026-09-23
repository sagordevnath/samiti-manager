/**
 * ── Accounting page ──────────────────────────────────────────────────────────
 * Double-entry back office: chart of accounts, vouchers (draft → checked →
 * approved), event-to-journal auto-postings, daily cash book with day-end
 * closing (BM + Accountant signatures), bank reconciliation, petty cash.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BookLock, CheckCheck, ClipboardCheck, Coins, Landmark, Loader2, Plus, Send, Wallet } from 'lucide-react';
import type {
  AccountType,
  BalanceSheetReport,
  BankReconciliation,
  BudgetVsActualReport,
  CashBookDay,
  EventJournalMapping,
  FundRequisition,
  FundStatementReport,
  GlAccount,
  IncomeExpenditureReport,
  JournalEvent,
  PeriodClose,
  PettyCashBalance,
  ReceiptsPaymentsReport,
  TrialBalanceRow,
  Voucher,
  VoucherStatus,
  VoucherType,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const TABS = ['accounts', 'vouchers', 'postings', 'cashbook', 'bank', 'petty', 'funds', 'reports', 'period'] as const;
type Tab = (typeof TABS)[number];

const TYPE_BN: Record<AccountType, string> = {
  asset: 'সম্পদ',
  liability: 'দায়',
  fund: 'তহবিল',
  income: 'আয়',
  expense: 'ব্যয়',
};

const VOUCHER_TYPE_BN: Record<VoucherType, string> = {
  cash_receipt: 'নগদ প্রাপ্তি',
  cash_payment: 'নগদ পরিশোধ',
  bank_payment: 'ব্যাংক পেমেন্ট',
  journal: 'জাবেদা',
  contra: 'কন্ট্রা',
};

const VOUCHER_STATUS_STYLE: Record<VoucherStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  checked: 'bg-amber-100 text-amber-800',
  approved: 'bg-emerald-100 text-emerald-800',
};

const EVENT_BN: Record<JournalEvent, string> = {
  savings_deposit: 'সঞ্চয় জমা',
  savings_withdrawal: 'সঞ্চয় উত্তোলন',
  loan_disbursement: 'ঋণ বিতরণ',
  loan_collection: 'কিস্তি আদায়',
  fee_collected: 'ফি আদায়',
  insurance_premium: 'বীমা প্রিমিয়াম',
  salary_payment: 'বেতন',
  loan_writeoff: 'ঋণ লেখা',
  provision_posted: 'সঞ্চিতি',
};

const BRANCHES = [
  { id: '00000000-0000-4000-8000-0000000000b1', name: 'Dhaka Branch' },
  { id: '00000000-0000-4000-8000-0000000000b2', name: 'Mymensingh Sadar' },
];
const BRANCH_NAME: Record<string, string> = Object.fromEntries(BRANCHES.map((b) => [b.id, b.name]));
const TODAY = () => new Date().toISOString().slice(0, 10);

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-2 py-1.5 text-xs font-semibold ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-2 py-1.5 ${right ? 'text-right tabular-nums' : ''} ${className ?? ''}`}>{children}</td>;
}

export function AccountingPage() {
  const { t } = useTranslation();
  const money = useMoneyFormatter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('accounts');
  const [branchId, setBranchId] = useState(BRANCHES[0]!.id);
  const [busy, setBusy] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['accounting'] });

  // ── Data ──
  const accounts = useQuery({
    queryKey: ['accounting', 'accounts', branchId],
    queryFn: () => api.get<{ items: GlAccount[] }>('/accounting/accounts'),
  });
  const requisitions = useQuery({
    queryKey: ['accounting', 'requisitions'],
    queryFn: () => api.get<{ items: FundRequisition[] }>('/accounting/requisitions'),
  });
  const periodCloses = useQuery({
    queryKey: ['accounting', 'periods'],
    queryFn: () => api.get<{ items: PeriodClose[] }>('/accounting/period-closes'),
  });
  const monthStart = `${TODAY().slice(0, 7)}-01`;
  const [reportPeriod, setReportPeriod] = useState({ start: monthStart, end: TODAY() });
  const [fundName, setFundName] = useState('General Fund');
  const receiptsPayments = useQuery({
    queryKey: ['accounting', 'rp', reportPeriod.start, reportPeriod.end],
    queryFn: () =>
      api.get<ReceiptsPaymentsReport>(`/accounting/reports/receipts-payments?start=${reportPeriod.start}&end=${reportPeriod.end}`),
  });
  const incomeExpenditure = useQuery({
    queryKey: ['accounting', 'ie', reportPeriod.start, reportPeriod.end],
    queryFn: () =>
      api.get<IncomeExpenditureReport>(`/accounting/reports/income-expenditure?start=${reportPeriod.start}&end=${reportPeriod.end}`),
  });
  const balanceSheet = useQuery({
    queryKey: ['accounting', 'bs', reportPeriod.end],
    queryFn: () => api.get<BalanceSheetReport>(`/accounting/reports/balance-sheet?asOf=${reportPeriod.end}`),
  });
  const budgetVsActual = useQuery({
    queryKey: ['accounting', 'bva', reportPeriod.start, reportPeriod.end],
    queryFn: () => api.get<BudgetVsActualReport>(`/accounting/reports/budget-vs-actual?start=${reportPeriod.start}&end=${reportPeriod.end}`),
  });
  const fundStatement = useQuery({
    queryKey: ['accounting', 'fund', fundName, reportPeriod.start, reportPeriod.end],
    queryFn: () =>
      api.get<FundStatementReport>(`/accounting/reports/fund-statement?fund=${encodeURIComponent(fundName)}&start=${reportPeriod.start}&end=${reportPeriod.end}`),
  });
  const trialBalance = useQuery({
    queryKey: ['accounting', 'trial-balance', branchId],
    queryFn: () => api.get<{ items: TrialBalanceRow[] }>(`/accounting/trial-balance?branchId=${branchId}`),
  });
  const vouchers = useQuery({
    queryKey: ['accounting', 'vouchers', branchId],
    queryFn: () => api.get<{ items: Voucher[] }>('/accounting/vouchers'),
  });
  const mappings = useQuery({
    queryKey: ['accounting', 'mappings'],
    queryFn: () => api.get<{ items: EventJournalMapping[] }>('/accounting/event-mappings'),
  });
  const postings = useQuery({
    queryKey: ['accounting', 'postings'],
    queryFn: () => api.get<{ items: Voucher[] }>('/accounting/postings'),
  });
  const cashBook = useQuery({
    queryKey: ['accounting', 'cashbook', branchId],
    queryFn: () => api.get<CashBookDay>(`/accounting/cash-book?branchId=${branchId}&date=${TODAY()}`),
  });
  const bankRecs = useQuery({
    queryKey: ['accounting', 'bank', branchId],
    queryFn: () => api.get<{ items: BankReconciliation[] }>('/accounting/bank-reconciliations'),
  });
  const petty = useQuery({
    queryKey: ['accounting', 'petty', branchId],
    queryFn: () => api.get<PettyCashBalance>(`/accounting/petty-cash?branchId=${branchId}`),
  });

  const loading = [accounts, trialBalance, vouchers, mappings, postings, cashBook, bankRecs, petty].some((q) => q.isPending);

  // ── Actions ──
  const checkVoucher = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/vouchers/${id}/check`, { note: 'checked from web' }),
    onSuccess: invalidate,
  });
  const approveVoucher = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/vouchers/${id}/approve`, { note: 'approved from web' }),
    onSuccess: invalidate,
  });
  const runPost = useMutation({
    mutationFn: (event: JournalEvent) =>
      api.post('/accounting/postings', { event, amount: '500.00', branchId, refId: `web-${Date.now()}` }),
    onSuccess: invalidate,
  });
  const countCash = useMutation({
    mutationFn: () => api.post('/accounting/cash-book/count', { countedCash: '5000.00', note: 'web count' }),
    onSuccess: invalidate,
  });
  const closeDay = useMutation({
    mutationFn: () =>
      api.post('/accounting/cash-book/close', {
        countedCash: '5000.00',
        managerSignName: 'Branch Manager',
        accountantSignName: 'Accountant',
      }),
    onSuccess: invalidate,
  });
  const clearLine = useMutation({
    mutationFn: (rec: BankReconciliation) => {
      const line = rec.statementLines.find((l) => !l.cleared);
      if (!line) return Promise.reject(new Error('no uncleared line'));
      return api.post(`/accounting/bank-reconciliations/${rec.id}/lines/${line.id}/clear`, {});
    },
    onSuccess: invalidate,
  });
  const topUp = useMutation({
    mutationFn: () => api.post('/accounting/petty-cash/top-up', { branchId, amount: '1000.00', note: 'web top-up' }),
    onSuccess: invalidate,
  });
  const spend = useMutation({
    mutationFn: () =>
      api.post('/accounting/petty-cash/spend', { branchId, amount: '200.00', expenseCode: '6100', spentOn: 'Web demo expense' }),
    onSuccess: invalidate,
  });
  const decideRequisition = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) =>
      api.post(`/accounting/requisitions/${id}/decision`, { decision }),
    onSuccess: invalidate,
  });
  const disburseRequisition = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/requisitions/${id}/disburse`),
    onSuccess: invalidate,
  });
  const receiveRequisition = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/requisitions/${id}/receive`),
    onSuccess: invalidate,
  });
  const createRequisition = useMutation({
    mutationFn: () =>
      api.post('/accounting/requisitions', {
        kind: 'branch_to_ho',
        fromNodeId: branchId,
        toNodeId: '00000000-0000-4000-8000-0000000000a0',
        amount: '2500.00',
        purpose: 'Demo: weekly cash sweep',
        settlementCode: '1010',
      }),
    onSuccess: invalidate,
  });
  const closePeriod = useMutation({
    mutationFn: () =>
      api.post('/accounting/period-closes', { kind: 'monthly', periodStart: monthStart, periodEnd: TODAY() }),
    onSuccess: invalidate,
  });
  const reopenPeriod = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/period-closes/${id}/reopen`, { note: 'Reopened from web (Director Finance)' }),
    onSuccess: invalidate,
  });

  const act = (fn: () => Promise<unknown>) => {
    setBusy(true);
    fn()
      .catch(() => undefined)
      .finally(() => setTimeout(() => setBusy(false), 400));
  };

  const tb = trialBalance.data?.items ?? [];
  const tbDebit = tb.reduce((s, r) => s + Number(r.totalDebit), 0);
  const tbCredit = tb.reduce((s, r) => s + Number(r.totalCredit), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('accounting.title', 'হিসাবরক্ষণ')}</h1>
        <div className="flex items-center gap-2">
          <select
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {BRANCHES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1">
        {TABS.map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}
          >
            {t(`accounting.tab.${k}`, k)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* ── Chart of accounts ── */}
          {tab === 'accounts' && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Landmark className="h-4 w-4" /> {t('accounting.coa', 'হিসাবের তালিকা')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>কোড</Th>
                        <Th>নাম</Th>
                        <Th>ধরন</Th>
                        <Th>ক্যাটাগরি</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(accounts.data?.items ?? []).map((a) => (
                        <tr key={a.id} className={`border-b last:border-0 ${a.isActive ? '' : 'opacity-40'}`}>
                          <Td>{a.code}</Td>
                          <Td>
                            <div>{a.nameBn}</div>
                            <div className="text-xs text-muted-foreground">{a.name}</div>
                          </Td>
                          <Td>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{TYPE_BN[a.type]}</span>
                          </Td>
                          <Td>{a.category}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">রেওয়ামিল (Trial balance)</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>কোড</Th>
                        <Th right>ডেবিট</Th>
                        <Th right>ক্রেডিট</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {tb.map((r) => (
                        <tr key={r.code} className="border-b last:border-0">
                          <Td>{r.code}</Td>
                          <Td right>{Number(r.totalDebit) !== 0 ? money(r.totalDebit) : '—'}</Td>
                          <Td right>{Number(r.totalCredit) !== 0 ? money(r.totalCredit) : '—'}</Td>
                        </tr>
                      ))}
                      <tr className="font-semibold">
                        <Td>মোট</Td>
                        <Td right>{money(tbDebit.toFixed(2))}</Td>
                        <Td right>{money(tbCredit.toFixed(2))}</Td>
                      </tr>
                    </tbody>
                  </table>
                  <p className={`mt-2 text-xs font-medium ${Math.abs(tbDebit - tbCredit) < 0.005 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {Math.abs(tbDebit - tbCredit) < 0.005 ? '✓ ভারসাম্যপূর্ণ' : `পার্থক্য: ${money(Math.abs(tbDebit - tbCredit).toFixed(2))}`}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Vouchers ── */}
          {tab === 'vouchers' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardCheck className="h-4 w-4" /> ভাউচার
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      <Th>নম্বর</Th>
                      <Th>ধরন</Th>
                      <Th>তারিখ</Th>
                      <Th>শাখা</Th>
                      <Th>স্ট্যাটাস</Th>
                      <Th right>পরিমাণ</Th>
                      <Th>কর্ম</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(vouchers.data?.items ?? []).slice(0, 30).map((v) => {
                      const amount = v.lines.reduce((s, l) => s + Number(l.debit), 0).toFixed(2);
                      return (
                        <tr key={v.id} className="border-b last:border-0">
                          <Td>
                            <div className="font-mono text-xs">{v.voucherNumber}</div>
                            {v.autoSource && <div className="text-[10px] text-muted-foreground">অটো: {EVENT_BN[v.autoSource as JournalEvent] ?? v.autoSource}</div>}
                          </Td>
                          <Td>{VOUCHER_TYPE_BN[v.voucherType]}</Td>
                          <Td>{v.voucherDate}</Td>
                          <Td>{v.branchName}</Td>
                          <Td>
                            <span className={`rounded px-1.5 py-0.5 text-xs ${VOUCHER_STATUS_STYLE[v.status]}`}>{v.status}</span>
                          </Td>
                          <Td right>{money(amount)}</Td>
                          <Td>
                            {v.status === 'draft' && (
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => checkVoucher.mutateAsync(v.id))}>
                                <CheckCheck className="mr-1 h-3 w-3" /> চেক
                              </Button>
                            )}
                            {v.status === 'checked' && (
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => approveVoucher.mutateAsync(v.id))}>
                                <Send className="mr-1 h-3 w-3" /> অনুমোদন
                              </Button>
                            )}
                            {v.status === 'approved' && (
                              <Link to={`/accounting/vouchers/${v.id}/print`} className="text-xs text-teal-700 underline">
                                প্রিন্ট
                              </Link>
                            )}
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* ── Event mappings / auto postings ── */}
          {tab === 'postings' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">ইভেন্ট → জাবেদা ম্যাপ</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr>
                        <Th>ইভেন্ট</Th>
                        <Th>সেটেলমেন্ট</Th>
                        <Th>কাউন্টার</Th>
                        <Th>সক্রিয়</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(mappings.data?.items ?? []).map((m) => (
                        <tr key={m.id} className="border-b last:border-0">
                          <Td>{EVENT_BN[m.event]}</Td>
                          <Td>
                            <span className="font-mono text-xs">{m.settlementCode}</span>
                          </Td>
                          <Td>
                            <span className="font-mono text-xs">{m.counterCode}</span>
                          </Td>
                          <Td>{m.isActive ? '✓' : '—'}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">অটো পোস্টিং (ডেমো)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    একটি মডিউল ইভেন্ট বেছে নিয়ে ৳500 পোস্ট করুন — ম্যাপ অনুযায়ী স্বয়ংক্রিয় ভাউচার তৈরি হবে।
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(EVENT_BN) as JournalEvent[]).map((ev) => (
                      <Button key={ev} size="sm" variant="outline" disabled={busy} onClick={() => act(() => runPost.mutateAsync(ev))}>
                        <Plus className="mr-1 h-3 w-3" /> {EVENT_BN[ev]}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">মোট অটো পোস্টিং: {postings.data?.items.length ?? 0}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* ── Cash book ── */}
          {tab === 'cashbook' && cashBook.data && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between gap-2 text-base">
                  <span className="flex items-center gap-2">
                    <BookLock className="h-4 w-4" /> দৈনিক নগদ বই — {TODAY()}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs ${cashBook.data.status === 'closed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {cashBook.data.status === 'closed' ? 'বন্ধ (লক)' : 'খোলা'}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">প্রারম্ভিক</p>
                    <p className="font-semibold">{money(cashBook.data.openingBalance)}</p>
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">আয়</p>
                    <p className="font-semibold text-emerald-700">{money(cashBook.data.totalCashIn)}</p>
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">ব্যয়</p>
                    <p className="font-semibold text-red-700">{money(cashBook.data.totalCashOut)}</p>
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">প্রত্যাশিত সমাপনী</p>
                    <p className="font-semibold">{money(cashBook.data.expectedClosing)}</p>
                  </div>
                </div>
                {cashBook.data.difference && (
                  <p className={`text-sm font-medium ${cashBook.data.differenceKind === 'exact' ? 'text-emerald-600' : cashBook.data.differenceKind === 'shortage' ? 'text-red-600' : 'text-amber-600'}`}>
                    গণনা: {money(cashBook.data.countedCash ?? '0')} · পার্থক্য: {money(cashBook.data.difference)} ({cashBook.data.differenceKind})
                  </p>
                )}
                {cashBook.data.status === 'closed' && (
                  <p className="text-xs text-muted-foreground">
                    স্বাক্ষর: {cashBook.data.managerSignName} (BM) · {cashBook.data.accountantSignName} (AC)
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy || cashBook.data.status === 'closed'} onClick={() => act(() => countCash.mutateAsync())}>
                    <Coins className="mr-1 h-3 w-3" /> নগদ গণনা (৳5,000)
                  </Button>
                  <Button size="sm" disabled={busy || cashBook.data.status === 'closed'} onClick={() => act(() => closeDay.mutateAsync())}>
                    <BookLock className="mr-1 h-3 w-3" /> দিবা সমাপনী
                  </Button>
                </div>
                <table className="w-full text-sm">
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      <Th>ভাউচার</Th>
                      <Th>বিবরণ</Th>
                      <Th right>আয়</Th>
                      <Th right>ব্যয়</Th>
                    </tr>
                  </thead>
                  <tbody>                      {cashBook.data.lines.map((l, i) => (
                        <tr key={`${l.voucherNumber}-${i}`} className="border-b last:border-0">
                          <Td>
                            <span className="font-mono text-xs">{l.voucherNumber}</span>
                          </Td>
                          <Td>{l.memo}</Td>
                        <Td right>{Number(l.cashIn) !== 0 ? money(l.cashIn) : '—'}</Td>
                        <Td right>{Number(l.cashOut) !== 0 ? money(l.cashOut) : '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* ── Bank reconciliation ── */}
          {tab === 'bank' && (
            <div className="space-y-4">
              {(bankRecs.data?.items ?? []).map((rec) => (
                <Card key={rec.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                      <span>
                        ব্যাংক রিকনসিলিয়েশন — <span className="font-mono text-xs">{rec.bankCode}</span> {rec.periodStart} → {rec.periodEnd}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-xs ${rec.status === 'cleared' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{rec.status}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      <div className="rounded-lg border p-2">
                        <p className="text-xs text-muted-foreground">বইয়ের ব্যালেন্স</p>
                        <p className="font-semibold">{money(rec.bookBalance)}</p>
                      </div>
                      <div className="rounded-lg border p-2">
                        <p className="text-xs text-muted-foreground">স্টেটমেন্ট</p>
                        <p className="font-semibold">{money(rec.statementBalance)}</p>
                      </div>
                      <div className="rounded-lg border p-2">
                        <p className="text-xs text-muted-foreground">অমীমাংসিত</p>
                        <p className="font-semibold">{money(rec.unclearedTotal)}</p>
                      </div>
                      <div className="rounded-lg border p-2">
                        <p className="text-xs text-muted-foreground">ক্লিয়ারড</p>
                        <p className="font-semibold">
                          {rec.clearedCount}/{rec.statementLines.length}
                        </p>
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="border-b text-muted-foreground">
                        <tr>
                          <Th>তারিখ</Th>
                          <Th>বিবরণ</Th>
                          <Th right>পরিমাণ</Th>
                          <Th>স্ট্যাটাস</Th>
                          <Th>কর্ম</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {rec.statementLines.map((l) => (
                          <tr key={l.id} className={`border-b last:border-0 ${l.cleared ? 'opacity-50' : ''}`}>
                            <Td>{l.valueDate}</Td>
                            <Td>{l.narration}</Td>
                            <Td right>{money((Number(l.amount) < 0 ? '' : '') + l.amount.replace('-', ''))}</Td>
                            <Td>{l.cleared ? '✓ cleared' : 'pending'}</Td>
                            <Td>
                              {!l.cleared && (
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => clearLine.mutateAsync(rec))}>
                                  ক্লিয়ার
                                </Button>
                              )}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* ── Petty cash ── */}
          {tab === 'petty' && petty.data && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4" /> পেটি ক্যাশ — {petty.data.branchName}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">ব্যালেন্স</p>
                    <p className="font-semibold">{money(petty.data.balance)}</p>
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">সীমা</p>
                    <p className="font-semibold">{money(petty.data.limit)}</p>
                  </div>
                  <div className="rounded-lg border p-2">
                    <p className="text-xs text-muted-foreground">অবস্থা</p>
                    <p className={`font-semibold ${petty.data.withinLimit ? 'text-emerald-600' : 'text-red-600'}`}>
                      {petty.data.withinLimit ? 'সীমার মধ্যে' : 'সীমা ছাড়িয়েছে'}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => topUp.mutateAsync())}>
                    <Plus className="mr-1 h-3 w-3" /> ৳1,000 রিপ্লিনিশ
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => spend.mutateAsync())}>
                    ৳200 ব্যয় (6100)
                  </Button>
                </div>
                <table className="w-full text-sm">
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      <Th>সময়</Th>
                      <Th>ধরন</Th>
                      <Th right>পরিমাণ</Th>
                      <Th>বিবরণ</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...petty.data.movements].reverse().slice(0, 12).map((m) => (
                      <tr key={m.id} className="border-b last:border-0">
                        <Td>{new Date(m.at).toLocaleTimeString('bn-BD')}</Td>
                        <Td>{m.kind === 'top_up' ? 'রিপ্লিনিশ' : 'ব্যয়'}</Td>
                        <Td right className={m.kind === 'top_up' ? 'text-emerald-700' : 'text-red-700'}>
                          {m.kind === 'top_up' ? '+' : '−'}
                          {money(m.amount)}
                        </Td>
                        <Td>{m.spentOn ?? m.note ?? '—'}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* ── Funds: requisitions & inter-branch transfers ── */}
          {tab === 'funds' && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                  <span>তহবিল চাহিদাপত্র ও আন্তঃশাখা স্থানান্তর</span>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => createRequisition.mutateAsync())}>
                    <Plus className="mr-1 h-3 w-3" /> ডেমো চাহিদাপত্র (৳2,500)
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      <Th>পথ</Th>
                      <Th right>পরিমাণ</Th>
                      <Th>উদ্দেশ্য</Th>
                      <Th>অবস্থা</Th>
                      <Th>ভাউচার</Th>
                      <Th>কর্ম</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(requisitions.data?.items ?? []).map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <Td>{r.fromNodeName} → {r.toNodeName}</Td>
                        <Td right>{money(r.amount)}</Td>
                        <Td>{r.purpose}</Td>
                        <Td>
                          <span className={`rounded px-1.5 py-0.5 text-xs ${r.status === 'received' || r.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : r.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>
                            {r.status}
                          </span>
                        </Td>
                        <Td>
                          <span className="font-mono text-xs">{r.outVoucherNumber ?? '—'}</span>
                        </Td>
                        <Td>
                          {r.status === 'requested' && (
                            <>
                              <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => decideRequisition.mutateAsync({ id: r.id, decision: 'approve' }))}>
                                অনুমোদন
                              </Button>{' '}
                              <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => decideRequisition.mutateAsync({ id: r.id, decision: 'reject' }))}>
                                বাতিল
                              </Button>
                            </>
                          )}
                          {r.status === 'approved' && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => disburseRequisition.mutateAsync(r.id))}>
                              প্রেরণ
                            </Button>
                          )}
                          {r.status === 'disbursed' && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => receiveRequisition.mutateAsync(r.id))}>
                              গ্রহণ
                            </Button>
                          )}
                          {(r.status === 'received' || r.status === 'rejected') && <span className="text-xs text-muted-foreground">✓</span>}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* ── Reports ── */}
          {tab === 'reports' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <Label htmlFor="rp-start">শুরু</Label>
                  <Input id="rp-start" type="date" value={reportPeriod.start} onChange={(e) => setReportPeriod((p) => ({ ...p, start: e.target.value }))} className="w-40" />
                </div>
                <div>
                  <Label htmlFor="rp-end">শেষ</Label>
                  <Input id="rp-end" type="date" value={reportPeriod.end} onChange={(e) => setReportPeriod((p) => ({ ...p, end: e.target.value }))} className="w-40" />
                </div>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">প্রাপ্তি ও পরিশোধ (নগদ ভিত্তি)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="mb-2 grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded border p-2"><p className="text-xs text-muted-foreground">প্রারম্ভিক</p><p className="font-semibold">{money(receiptsPayments.data?.openingCash ?? '0')}</p></div>
                      <div className="rounded border p-2"><p className="text-xs text-muted-foreground">মোট প্রাপ্তি</p><p className="font-semibold text-emerald-700">{money(receiptsPayments.data?.totalIn ?? '0')}</p></div>
                      <div className="rounded border p-2"><p className="text-xs text-muted-foreground">সমাপনী নগদ</p><p className="font-semibold">{money(receiptsPayments.data?.closingCash ?? '0')}</p></div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">আয় ও ব্যয়</CardTitle></CardHeader>
                  <CardContent>
                    <div className="mb-2 grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded border p-2"><p className="text-xs text-muted-foreground">মোট আয়</p><p className="font-semibold text-emerald-700">{money(incomeExpenditure.data?.totalIncome ?? '0')}</p></div>
                      <div className="rounded border p-2"><p className="text-xs text-muted-foreground">মোট ব্যয়</p><p className="font-semibold text-red-700">{money(incomeExpenditure.data?.totalExpenditure ?? '0')}</p></div>
                      <div className="rounded border p-2"><p className="text-xs text-muted-foreground">উদ্বৃত্ত</p><p className="font-semibold">{money(incomeExpenditure.data?.surplus ?? '0')}</p></div>
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {(incomeExpenditure.data?.income ?? []).map((r) => (
                          <tr key={r.code}><Td>{r.nameBn}</Td><Td right className="text-emerald-700">{money(r.amount)}</Td></tr>
                        ))}
                        {(incomeExpenditure.data?.expenditure ?? []).map((r) => (
                          <tr key={r.code}><Td>{r.nameBn}</Td><Td right className="text-red-700">({money(r.amount)})</Td></tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">ব্যালেন্স শিট ({reportPeriod.end})</CardTitle></CardHeader>
                  <CardContent>
                    <p className={`mb-2 text-sm font-medium ${balanceSheet.data?.balanced ? 'text-emerald-600' : 'text-red-600'}`}>
                      {balanceSheet.data?.balanced ? '✓ সম্পদ = দায় + তহবিল' : 'ভারসাম্য নেই'}
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="rounded border p-2"><p className="text-xs text-muted-foreground">সম্পদ</p><p className="font-semibold">{money(balanceSheet.data?.totalAssets ?? '0')}</p></div>
                      <div className="rounded border p-2"><p className="text-xs text-muted-foreground">দায়</p><p className="font-semibold">{money(balanceSheet.data?.totalLiabilities ?? '0')}</p></div>
                      <div className="rounded border p-2"><p className="text-xs text-muted-foreground">তহবিল</p><p className="font-semibold">{money(balanceSheet.data?.totalFunds ?? '0')}</p></div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-base">বাজেট বনাম প্রকৃত</CardTitle></CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b text-muted-foreground">
                        <tr><Th>খাত</Th><Th right>বাজেট</Th><Th right>প্রকৃত</Th><Th right>ব্যবধান</Th></tr>
                      </thead>
                      <tbody>
                        {(budgetVsActual.data?.lines ?? []).map((l) => (
                          <tr key={l.accountCode} className="border-b last:border-0">
                            <Td>{l.accountNameBn}</Td>
                            <Td right>{money(l.budgeted)}</Td>
                            <Td right>{money(l.actual)}</Td>
                            <Td right className={Number(l.variance) < 0 ? 'text-red-600' : 'text-emerald-600'}>{money(l.variance)}</Td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* ── Fund statement ── */}
          {tab === 'period' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>পিরিয়ড ক্লোজ (মাসিক / বার্ষিক)</span>
                    <Button size="sm" disabled={busy} onClick={() => act(() => closePeriod.mutateAsync())}>
                      <BookLock className="mr-1 h-3 w-3" /> এই মাস বন্ধ করুন
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr><Th>ধরন</Th><Th>পিরিয়ড</Th><Th>ভাউচার</Th><Th>ভারসাম্য</Th><Th>কর্ম</Th></tr>
                    </thead>
                    <tbody>
                      {(periodCloses.data?.items ?? []).map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <Td>{p.kind === 'monthly' ? 'মাসিক' : 'বার্ষিক'}</Td>
                          <Td>{p.periodStart} → {p.periodEnd}</Td>
                          <Td>{p.snapshot.voucherCount}</Td>
                          <Td>{p.snapshot.balanced ? '✓' : '—'}</Td>
                          <Td>
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => reopenPeriod.mutateAsync(p.id))}>
                              পুনরায় খুলুন
                            </Button>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(periodCloses.data?.items ?? []).length === 0 && (
                    <p className="py-3 text-sm text-muted-foreground">কোনো বন্ধ পিরিয়ড নেই — বন্ধ করলে ওই তারিখের নতুন ভাউচার ব্লক হবে।</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">তহবিল-ভিত্তিক বিবরণী</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-end gap-2">
                    <div>
                      <Label htmlFor="fund-name">তহবিল/প্রকল্প</Label>
                      <Input id="fund-name" value={fundName} onChange={(e) => setFundName(e.target.value)} className="w-56" />
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="border-b text-muted-foreground">
                      <tr><Th>ভাউচার</Th><Th>বিবরণ</Th><Th right>ডেবিট</Th><Th right>ক্রেডিট</Th><Th right>জমা</Th></tr>
                    </thead>
                    <tbody>
                      {(fundStatement.data?.lines ?? []).map((l, i) => (
                        <tr key={`${l.voucherNumber}-${i}`} className="border-b last:border-0">
                          <Td><span className="font-mono text-xs">{l.voucherNumber}</span></Td>
                          <Td>{l.memo}</Td>
                          <Td right>{Number(l.debit) !== 0 ? money(l.debit) : '—'}</Td>
                          <Td right>{Number(l.credit) !== 0 ? money(l.credit) : '—'}</Td>
                          <Td right>{money(l.balance)}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(fundStatement.data?.lines ?? []).length === 0 && (
                    <p className="text-sm text-muted-foreground">এই তহবিলে চিহ্নিত লাইন নেই — ভাউচারে fund/project দিয়ে চিহ্নিত করুন।</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
