import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileStack, HandCoins, Loader2, Package, Plus, RefreshCw, Wallet } from 'lucide-react';
import type { LoanApplicationStatus } from '@samity/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

interface ApplicationRow {
  id: string;
  applicationNumber: string;
  memberId: string;
  memberCode?: string | null;
  memberName?: string | null;
  productId: string;
  productName?: string | null;
  productNameBn?: string | null;
  requestedAmount: string;
  purpose: string;
  status: LoanApplicationStatus;
  termMonths?: number | null;
  createdAt?: string | null;
}

interface PipelineBucket {
  status: LoanApplicationStatus;
  count: number;
  totalAmount: string;
}

const STATUS_BN: Record<LoanApplicationStatus, string> = {
  draft: 'খসড়া',
  submitted: 'জমা দেওয়া হয়েছে',
  officer_review: 'অফিসার পর্যালোচনা',
  bm_review: 'শাখা ব্যবস্থাপক পর্যালোচনা',
  am_review: 'এরিয়া ব্যবস্থাপক পর্যালোচনা',
  approved: 'অনুমোদিত',
  rejected: 'প্রত্যাখ্যাত',
  disbursed: 'বিতরণকৃত',
  closed: 'বন্ধ',
  written_off: 'অপুনরুদ্ধারযোগ্য',
};

const STATUS_STYLE: Record<LoanApplicationStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-sky-50 text-sky-700',
  officer_review: 'bg-indigo-50 text-indigo-700',
  bm_review: 'bg-amber-50 text-amber-700',
  am_review: 'bg-purple-50 text-purple-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  disbursed: 'bg-teal-50 text-teal-700',
  closed: 'bg-muted text-muted-foreground',
  written_off: 'bg-rose-100 text-rose-800',
};

/** Lifecycle order for the pipeline strip (only non-empty buckets render). */
const PIPELINE_ORDER: LoanApplicationStatus[] = [
  'draft',
  'submitted',
  'officer_review',
  'bm_review',
  'am_review',
  'approved',
  'disbursed',
  'rejected',
  'closed',
  'written_off',
];

export function LoansPage() {
  const fmt = useMoneyFormatter();
  const [status, setStatus] = useState<'' | LoanApplicationStatus>('');
  const [q, setQ] = useState('');

  const query = useQuery({
    queryKey: ['loans-applications'],
    queryFn: () =>
      api.get<{ items: ApplicationRow[]; pipeline?: PipelineBucket[] }>('/loans/applications'),
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);

  // The API returns buckets; recompute locally if the shape is ever missing so
  // the page can never crash on a partial payload.
  const pipeline = useMemo<PipelineBucket[]>(() => {
    if (query.data?.pipeline) return query.data.pipeline;
    const buckets = new Map<string, { count: number; total: number }>();
    for (const a of items) {
      const b = buckets.get(a.status) ?? { count: 0, total: 0 };
      b.count += 1;
      b.total += Number(a.requestedAmount);
      buckets.set(a.status, b);
    }
    return [...buckets.entries()].map(([s, b]) => ({ status: s as LoanApplicationStatus, count: b.count, totalAmount: b.total.toFixed(2) }));
  }, [query.data, items]);

  const orderedPipeline = useMemo(
    () => [...pipeline].sort((a, b) => PIPELINE_ORDER.indexOf(a.status) - PIPELINE_ORDER.indexOf(b.status)),
    [pipeline],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((a) => {
      if (status && a.status !== status) return false;
      if (!needle) return true;
      return (
        (a.applicationNumber ?? '').toLowerCase().includes(needle) ||
        (a.memberName ?? '').toLowerCase().includes(needle) ||
        (a.memberCode ?? '').toLowerCase().includes(needle) ||
        (a.purpose ?? '').toLowerCase().includes(needle)
      );
    });
  }, [items, status, q]);

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 p-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…
      </div>
    );
  }
  if (query.isError) {
    return <p className="p-8 text-sm text-red-600">{(query.error as Error).message}</p>;
  }

  const totalRequested = items.reduce((sum, a) => sum + Number(a.requestedAmount ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-700">Loans</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <HandCoins className="h-6 w-6 text-teal-700" /> ঋণের আবেদন
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            মোট {items.length}টি আবেদন · {fmt(String(totalRequested))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/loans/products"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Package className="h-4 w-4" /> পণ্য
          </Link>
          <Link
            to="/loans/disbursements"
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            <Wallet className="h-4 w-4" /> বিতরণ
          </Link>
          <Link
            to="/loans/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" /> নতুন আবেদন
          </Link>
        </div>
      </div>

      {/* Pipeline buckets — clicking one filters the table below. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {orderedPipeline.map((bucket) => {
          const active = status === bucket.status;
          return (
            <button
              key={bucket.status}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(active ? '' : bucket.status)}
              className={`rounded-[var(--radius)] border text-left transition-all ${
                active ? 'border-primary ring-2 ring-primary/30' : 'hover:border-primary/30'
              }`}
            >
              <Card className="border-0 bg-transparent shadow-none">
                <CardContent className="px-4 py-3">
                  <p className="text-xs text-muted-foreground">{STATUS_BN[bucket.status] ?? bucket.status}</p>
                  <p className="mt-1 text-xl font-bold">{bucket.count}</p>
                  <p className="text-xs text-muted-foreground">{fmt(bucket.totalAmount)}</p>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
          <CardTitle className="text-lg">সকল আবেদন</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="আবেদন নম্বর / সদস্য / উদ্দেশ্য"
              className="h-9 w-56"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as '' | LoanApplicationStatus)}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            >
              <option value="">সব অবস্থা</option>
              {orderedPipeline.map((b) => (
                <option key={b.status} value={b.status}>
                  {STATUS_BN[b.status] ?? b.status}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void query.refetch()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-2.5 text-sm text-muted-foreground hover:bg-muted"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} /> রিফ্রেশ
            </button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3">নম্বর</th>
                <th className="py-2 pr-3">সদস্য</th>
                <th className="py-2 pr-3">পণ্য</th>
                <th className="py-2 pr-3 text-right">টাকা</th>
                <th className="py-2 pr-3">মেয়াদ</th>
                <th className="py-2 pr-3">উদ্দেশ্য</th>
                <th className="py-2 pr-3">অবস্থা</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-muted/50">
                  <td className="py-2 pr-3">
                    <Link to={`/loans/${a.id}`} className="font-medium text-teal-700 hover:underline">
                      {a.applicationNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    {a.memberName ?? <span className="text-muted-foreground">{a.memberId?.slice(0, 8)}</span>}
                    {a.memberCode && <span className="ml-1 font-mono text-xs text-muted-foreground">{a.memberCode}</span>}
                  </td>
                  <td className="py-2 pr-3 text-xs">{a.productNameBn ?? a.productName ?? '—'}</td>
                  <td className="py-2 pr-3 text-right font-medium">{fmt(a.requestedAmount)}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{a.termMonths ? `${a.termMonths} মাস` : '—'}</td>
                  <td className="max-w-xs truncate py-2 pr-3 text-muted-foreground">{a.purpose}</td>
                  <td className="py-2 pr-3">
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[a.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {STATUS_BN[a.status] ?? a.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    <FileStack className="mx-auto mb-2 h-5 w-5" />
                    কোনো আবেদন নেই
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
