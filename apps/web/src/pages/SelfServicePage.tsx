/**
 * ── Staff self-service (HR req 9) ────────────────────────────────────────────
 * Mobile-first page where a staff member sees their own payslips, leave
 * balance, PF balance and documents. RLS on the API restricts staff to their
 * own record; admins may pass ?staffId=.
 */
import { useQuery } from '@tanstack/react-query';
import { Banknote, CalendarDays, FileText, Wallet } from 'lucide-react';
import type { SelfServiceSummary } from '@samity/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const PAY_STATUS_BN: Record<string, string> = { draft: 'খসড়া', approved: 'অনুমোদিত', paid: 'পরিশোধিত' };
const LEAVE_BN: Record<string, string> = { casual: 'ক্যাজুয়াল', sick: 'অসুস্থতার ছুটি', annual: 'বার্ষিক', maternity: 'মাতৃত্ব' };

export function SelfServicePage() {
  const money = useMoneyFormatter();
  const s = useQuery({
    queryKey: ['self-service'],
    queryFn: () => api.get<SelfServiceSummary>('/hr/self-service'),
  });

  if (s.isPending) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
      </div>
    );
  }
  if (s.isError || !s.data) {
    return <p className="py-10 text-center text-sm text-muted-foreground">তথ্য পাওয়া যায়নি।</p>;
  }
  const d = s.data;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">স্ব-সেবা</h1>
        <p className="text-sm text-muted-foreground">
          {d.staffName} · {d.staffCode} · {PAY_STATUS_BN[d.status] ? '' : ''}{d.status === 'confirmed' ? 'স্থায়ী' : d.status === 'probation' ? 'প্রবেশনারি' : d.status}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Wallet className="h-4 w-4 text-teal-700" />
            <CardTitle className="text-base">প্রভিডেন্ট ফান্ড</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-teal-700">{money(d.pfBalance)}</p>
            <p className="text-xs text-muted-foreground">জমা + প্রতিষ্ঠানের অংশ</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <CalendarDays className="h-4 w-4 text-teal-700" />
            <CardTitle className="text-base">ছুটির ব্যালেন্স</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {Object.entries(d.leaveBalance).map(([type, b]) => (
              <div key={type} className="flex items-center justify-between text-sm">
                <span>{LEAVE_BN[type] ?? type}</span>
                <span className="tabular-nums text-muted-foreground">
                  বাকি <b className="text-foreground">{b.remaining}</b>/{b.entitlement}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <FileText className="h-4 w-4 text-teal-700" />
          <CardTitle className="text-base">বেতন স্লিপ</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {d.payslips.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">এখনো কোনো বেতন স্লিপ নেই।</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left text-xs font-semibold">মাস</th>
                  <th className="px-2 py-1.5 text-right text-xs font-semibold">মোট</th>
                  <th className="px-2 py-1.5 text-right text-xs font-semibold">কর্তন</th>
                  <th className="px-2 py-1.5 text-right text-xs font-semibold">নিট</th>
                  <th className="px-2 py-1.5 text-left text-xs font-semibold">অবস্থা</th>
                </tr>
              </thead>
              <tbody>
                {d.payslips.map((p) => (
                  <tr key={p.period} className="border-b last:border-0">
                    <td className="px-2 py-1.5">{p.period}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{money(p.gross)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{money(p.totalDeduction)}</td>
                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{money(p.net)}</td>
                    <td className="px-2 py-1.5 text-xs">{PAY_STATUS_BN[p.status] ?? p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-2">
          <Banknote className="h-4 w-4 text-teal-700" />
          <CardTitle className="text-base">ডকুমেন্ট</CardTitle>
        </CardHeader>
        <CardContent>
          {d.documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">কোনো ডকুমেন্ট নেই।</p>
          ) : (
            <ul className="list-inside list-disc text-sm">
              {d.documents.map((doc) => (
                <li key={doc}>{doc}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
