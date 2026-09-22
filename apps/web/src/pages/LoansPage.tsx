import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { LoanApplicationStatus } from '@samity/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

interface ApplicationRow {
  id: string;
  applicationNumber: string;
  memberId: string;
  productId: string;
  requestedAmount: string;
  purpose: string;
  status: LoanApplicationStatus;
  memberName?: string;
  memberCode?: string;
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
};

export function LoansPage() {
  const fmt = useMoneyFormatter();
  const query = useQuery({
    queryKey: ['loans-applications'],
    queryFn: () =>
      api.get<{ items: ApplicationRow[]; pipeline: Array<{ status: LoanApplicationStatus; count: number; totalAmount: string }> }>(
        '/loans/applications',
      ),
  });

  if (query.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }
  if (query.isError) {
    return <p className="p-8 text-sm text-red-600">{(query.error as Error).message}</p>;
  }

  const { items, pipeline } = query.data!;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-700">Loans</p>
          <h1 className="text-2xl font-bold">ঋণের আবেদন</h1>
        </div>
        <Link
          to="/loans/new"
          className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
        >
          + নতুন আবেদন
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {pipeline.map((bucket) => (
          <Card key={bucket.status} className="py-3">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">{STATUS_BN[bucket.status]}</p>
              <p className="mt-1 text-xl font-bold">{bucket.count}</p>
              <p className="text-xs text-muted-foreground">{fmt(bucket.totalAmount)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">সকল আবেদন</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">নম্বর</th>
                <th className="py-2">সদস্য</th>
                <th className="py-2 text-right">টাকা</th>
                <th className="py-2">উদ্দেশ্য</th>
                <th className="py-2">অবস্থা</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-2">
                    <Link to={`/loans/${a.id}`} className="font-medium text-teal-700 hover:underline">
                      {a.applicationNumber}
                    </Link>
                  </td>
                  <td className="py-2">
                    {a.memberName ?? a.memberId.slice(0, 8)}
                    <span className="ml-1 text-xs text-muted-foreground">{a.memberCode}</span>
                  </td>
                  <td className="py-2 text-right font-medium">{fmt(a.requestedAmount)}</td>
                  <td className="py-2 max-w-xs truncate text-muted-foreground">{a.purpose}</td>
                  <td className="py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[a.status]}`}>
                      {STATUS_BN[a.status]}
                    </span>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">কোনো আবেদন নেই</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
