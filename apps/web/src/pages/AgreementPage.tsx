import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import type { LoanAgreementData } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const FREQ_BN: Record<string, string> = {
  daily: 'দৈনিক',
  weekly: 'সাপ্তাহিক',
  biweekly: 'পাক্ষিক',
  monthly: 'মাসিক',
};

const METHOD_BN: Record<string, string> = {
  declining_balance: 'ক্রমহ্রাসমান মূলধন (Declining)',
  flat: 'সমতল সুদ (Flat)',
};

export function AgreementPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const fmt = useMoneyFormatter();
  const agreement = useQuery({
    queryKey: ['loan-agreement', applicationId],
    enabled: !!applicationId,
    queryFn: () => api.get<LoanAgreementData>(`/loans/disbursements/${applicationId}/agreement`),
  });

  if (agreement.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }
  if (agreement.isError || !agreement.data) {
    return <div className="p-8 text-sm text-red-600">চুক্তিপত্র পাওয়া যায়নি — বিতরণ সম্পন্ন হয়েছে কি না নিশ্চিত করুন।</div>;
  }

  const a = agreement.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> ফিরে যান
        </Button>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" /> প্রিন্ট
        </Button>
      </div>

      <div className="mx-auto rounded-lg border bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        {/* Header */}
        <div className="border-b-2 border-teal-700 pb-3 text-center">
          <h1 className="text-xl font-bold text-teal-800">{a.orgName}</h1>
          <p className="mt-1 text-lg font-semibold">ঋণ চুক্তিপত্র · Loan Agreement</p>
          <p className="text-xs text-muted-foreground">চুক্তি নং {a.loanNumber} · তারিখ {a.agreementDate}</p>
        </div>

        {/* Parties */}
        <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">ধারক (Borrower)</p>
            <p><strong>{a.member.nameBn ?? a.member.name}</strong></p>
            {a.member.nameBn && <p className="text-xs text-muted-foreground">{a.member.name}</p>}
            <p className="text-xs">সদস্য নং: {a.member.code}</p>
            {a.member.address && <p className="text-xs">ঠিকানা: {a.member.address}</p>}
            {a.member.mobile && <p className="text-xs">মোবাইল: {a.member.mobile}</p>}
          </div>
          <div className="rounded-md border p-3">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">ঋণের বিবরণ (Loan terms)</p>
            <p>{a.product.nameBn ?? a.product.name}</p>
            <p className="text-xs">সুদের হার: {a.product.interestRate}% ({METHOD_BN[a.product.interestMethod] ?? a.product.interestMethod})</p>
            <p className="text-xs">কিস্তি: {FREQ_BN[a.product.installmentFrequency] ?? a.product.installmentFrequency}</p>
            <p className="text-xs">মেয়াদ: {a.termMonths} মাস</p>
          </div>
        </div>

        {/* Amount block */}
        <div className="mt-4 rounded-md border border-teal-200 bg-teal-50/50 p-3 text-sm">
          <p>
            <span className="text-muted-foreground">ঋণের অঙ্ক:</span>{' '}
            <strong className="text-lg">{fmt(a.amount)} টাকা</strong>
          </p>
          <p className="text-xs">
            মোট পরিশোধযোগ্য: {fmt(a.totalPayable)} টাকা (সুদ: {fmt(a.totalInterest)})
          </p>
          {a.purpose && <p className="mt-1 text-xs">উদ্দেশ্য: {a.purpose}</p>}
        </div>

        {/* Utilization plan */}
        {a.utilization.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-sm font-semibold">বিনিয়োগ পরিকল্পনা (Utilization plan)</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1">খাত</th>
                  <th className="py-1">বিবরণ</th>
                  <th className="py-1 text-right">অঙ্ক</th>
                </tr>
              </thead>
              <tbody>
                {a.utilization.map((u, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1">{u.category}</td>
                    <td className="py-1">{u.description}</td>
                    <td className="py-1 text-right">{fmt(u.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Guarantors */}
        {a.guarantors.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-sm font-semibold">জামিনদার (Guarantors)</p>
            <ul className="space-y-0.5 text-sm">
              {a.guarantors.map((g, i) => (
                <li key={i}>• {g.name} ({g.relation}) — মোবাইল: {g.mobile}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Repayment schedule */}
        <div className="mt-4">
          <p className="mb-1 text-sm font-semibold">পরিশোধ সূচি ({a.installments.length} কিস্তি)</p>
          <div className="max-h-80 overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-2 py-1.5">#</th>
                  <th className="px-2 py-1.5">তারিখ</th>
                  <th className="px-2 py-1.5 text-right">মূল</th>
                  <th className="px-2 py-1.5 text-right">সুদ</th>
                  <th className="px-2 py-1.5 text-right">মোট</th>
                </tr>
              </thead>
              <tbody>
                {a.installments.map((inst) => (
                  <tr key={inst.seq} className="border-b last:border-0">
                    <td className="px-2 py-1">{inst.seq}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{inst.dueDate}</td>
                    <td className="px-2 py-1 text-right">{fmt(inst.principal)}</td>
                    <td className="px-2 py-1 text-right">{fmt(inst.interest)}</td>
                    <td className="px-2 py-1 text-right font-medium">{fmt(inst.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Terms */}
        <div className="mt-4 space-y-1 rounded-md border p-3 text-xs leading-6 text-muted-foreground">
          <p>১. ধারক উপরোক্ত সূচি অনুযায়ী নির্ধারিত তারিখে কিস্তি পরিশোধে বাধ্য থাকবেন।</p>
          <p>২. কিস্তি বকেয়া হলে প্রতিষ্ঠানের নীতিমালা অনুযায়ী জরিমানা প্রযোজ্য হবে।</p>
          <p>৩. ঋণের অর্থ ঘোষিত উদ্দেশ্যে ব্যবহারের জন্য ধারক দায়বদ্ধ থাকবেন; ব্যবহার-পরিদর্শনে অংশ নিতে বাধ্য থাকবেন।</p>
          <p>৪. পরিষ্ঠানের সাধারণ নীতিমালা ও সমবায় আইন এই চুক্তির অংশ হিসেবে গণ্য হবে।</p>
        </div>

        {/* Signatures */}
        <div className="mt-10 grid grid-cols-3 gap-6 text-center text-xs text-muted-foreground print:mt-14">
          <div className="border-t pt-2">
            <p className="font-medium text-foreground">{a.member.nameBn ?? a.member.name}</p>
            <span className="text-[10px]">ধারকের স্বাক্ষর / Borrower</span>
          </div>
          <div className="border-t pt-2">
            <p className="font-medium text-foreground">{a.guarantors[0]?.name ?? '—'}</p>
            <span className="text-[10px]">জামিনদারের স্বাক্ষর / Guarantor</span>
          </div>
          <div className="border-t pt-2">
            <p className="font-medium text-foreground">শাখা ব্যবস্থাপক</p>
            <span className="text-[10px]">Branch Manager</span>
          </div>
        </div>
      </div>
    </div>
  );
}
