import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import type { LoanVoucherData } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const MODE_LABELS_BN: Record<string, string> = {
  cash_branch: 'নগদ (শাখা)',
  cash_center: 'নগদ (কেন্দ্র)',
  bank_transfer: 'ব্যাংক ট্রান্সফার',
  bkash: 'বিকাশ',
  nagad: 'নগদ',
};

export function VoucherPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const fmt = useMoneyFormatter();
  const voucher = useQuery({
    queryKey: ['loan-voucher', applicationId],
    enabled: !!applicationId,
    queryFn: () => api.get<LoanVoucherData>(`/loans/disbursements/${applicationId}/voucher`),
  });

  if (voucher.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }
  if (voucher.isError || !voucher.data) {
    return <div className="p-8 text-sm text-red-600">ভাউচার পাওয়া যায়নি — বিতরণ সম্পন্ন হয়েছে কি না নিশ্চিত করুন।</div>;
  }

  const v = voucher.data;

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
          <h1 className="text-xl font-bold text-teal-800">{v.orgName}</h1>
          <p className="text-sm text-muted-foreground">{v.branchName}</p>
          <p className="mt-1 text-lg font-semibold">ঋণ বিতরণ ভাউচার · Loan Disbursement Voucher</p>
        </div>

        {/* Voucher meta */}
        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
          <p><span className="text-muted-foreground">ভাউচার নং:</span> <strong>{v.voucherNumber}</strong></p>
          <p><span className="text-muted-foreground">ঋণ নং:</span> <strong>{v.loanNumber}</strong></p>
          <p><span className="text-muted-foreground">তারিখ:</span> {v.disbursementDate}</p>
          <p><span className="text-muted-foreground">আবেদন নং:</span> {v.applicationNumber}</p>
        </div>

        {/* Party */}
        <div className="mt-5 space-y-1.5 rounded-md border p-3 text-sm">
          <p><span className="text-muted-foreground">সদস্য:</span> <strong>{v.memberName}</strong> ({v.memberCode})</p>
          <p><span className="text-muted-foreground">ঋণের ধরন:</span> {v.productName ?? '—'}</p>
          <p>
            <span className="text-muted-foreground">পরিশোধিত মূলধন:</span>{' '}
            <strong className="text-base">{fmt(v.amount)} টাকা</strong>
          </p>
          <p><span className="text-muted-foreground">মাধ্যম:</span> {v.modeBn || (MODE_LABELS_BN[v.mode] ?? v.mode)}</p>
          {v.cashReceivedByName && <p><span className="text-muted-foreground">নগদ গ্রহণকারী:</span> {v.cashReceivedByName}</p>}
          {v.mfsReference && <p><span className="text-muted-foreground">TrxID:</span> {v.mfsReference}</p>}
          {v.bankReference && <p><span className="text-muted-foreground">ব্যাংক রেফারেন্স:</span> {v.bankReference}</p>}
          {v.actualUserOfFunds && (
            <p className="text-xs text-muted-foreground">
              প্রকৃত ব্যবহারকারী: {v.actualUserOfFunds}{v.actualUserRelation ? ` (সম্পর্ক: ${v.actualUserRelation})` : ''}
            </p>
          )}
        </div>

        {/* Journal lines (double-entry proof) */}
        {v.journal && (
          <table className="mt-5 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1.5">হিসাব (A/C)</th>
                <th className="py-1.5">খাতের নাম</th>
                <th className="py-1.5 text-right">ডেবিট</th>
                <th className="py-1.5 text-right">ক্রেডিট</th>
              </tr>
            </thead>
            <tbody>
              {v.journal.lines.map((l) => (
                <tr key={l.accountCode} className="border-b last:border-0">
                  <td className="py-1.5 font-mono text-xs">{l.accountCode}</td>
                  <td className="py-1.5">{l.accountName}</td>
                  <td className="py-1.5 text-right">{fmt(l.debit)}</td>
                  <td className="py-1.5 text-right">{fmt(l.credit)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td colSpan={2} className="py-1.5">মোট</td>
                <td className="py-1.5 text-right">
                  {fmt(v.journal.lines.reduce((s, l) => s + Number(l.debit), 0).toFixed(2))}
                </td>
                <td className="py-1.5 text-right">
                  {fmt(v.journal.lines.reduce((s, l) => s + Number(l.credit), 0).toFixed(2))}
                </td>
              </tr>
            </tfoot>
          </table>
        )}

        {/* Signatures */}
        <div className="mt-10 grid grid-cols-3 gap-6 text-center text-xs text-muted-foreground print:mt-14">
          <div className="border-t pt-2">
            <p className="font-medium text-foreground">{v.preparedBy ?? 'হিসাবরক্ষক'}</p>
            <span className="text-[10px]">তৈরি করেছেন (হিসাবরক্ষক)</span>
          </div>
          <div className="border-t pt-2">
            <p className="font-medium text-foreground">{v.authorizedBy ?? 'শাখা ব্যবস্থাপক'}</p>
            <span className="text-[10px]">অনুমোদন (শাখা ব্যবস্থাপক)</span>
          </div>
          <div className="border-t pt-2">
            <p className="font-medium text-foreground">{v.cashReceivedByName ?? v.memberName}</p>
            <span className="text-[10px]">গ্রহণকারীর স্বাক্ষর / Received by</span>
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] text-muted-foreground">
          তৈরি: {v.generatedAt.slice(0, 10)} · সমিতি ম্যানেজার স্বয়ংক্রিয় ভাউচার
        </p>
      </div>
    </div>
  );
}
