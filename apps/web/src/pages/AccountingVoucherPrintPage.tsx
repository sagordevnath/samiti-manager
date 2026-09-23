/**
 * ── Accounting voucher print (Bangla + English) ──────────────────────────────
 * Requirement 10: a print-ready voucher sheet with bilingual headings, the
 * amount in words in both languages, and signature blocks (prepared /
 * checked / approved). Data comes from the accounting voucher API.
 */
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import type { Voucher } from '@samity/shared';
import { VOUCHER_TYPE_LABELS, VOUCHER_PRINT_LABELS, amountInWords } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

export function AccountingVoucherPrintPage() {
  const { voucherId } = useParams<{ voucherId: string }>();
  const money = useMoneyFormatter();
  const voucher = useQuery({
    queryKey: ['accounting', 'voucher', voucherId],
    enabled: !!voucherId,
    queryFn: () => api.get<{ items: Voucher[] }>('/accounting/vouchers'),
  });

  if (voucher.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }
  const v = (voucher.data?.items ?? []).find((x) => x.id === voucherId);
  if (!v) {
    return <div className="p-8 text-sm text-red-600">ভাউচার পাওয়া যায়নি।</div>;
  }

  const L = VOUCHER_PRINT_LABELS;
  const totalDebit = v.lines.reduce((s, l) => s + Number(l.debit), 0).toFixed(2);
  const typeLabel = VOUCHER_TYPE_LABELS[v.voucherType];

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
        {/* Header: bilingual */}
        <div className="border-b-2 border-teal-700 pb-3 text-center">
          <h1 className="text-xl font-bold text-teal-800">স্যামিটি ম্যানেজার</h1>
          <p className="text-sm text-muted-foreground">Samity Manager</p>
          <h2 className="mt-1 text-lg font-semibold">
            {typeLabel.bn} <span className="text-muted-foreground">/ {typeLabel.en}</span>
          </h2>
          <p className="text-xs text-muted-foreground">{v.branchName}</p>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-2 gap-2 py-3 text-sm sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{L.bn.voucherNo} / {L.en.voucherNo}</p>
            <p className="font-mono font-semibold">{v.voucherNumber}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{L.bn.date} / {L.en.date}</p>
            <p className="font-semibold">{v.voucherDate}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{L.bn.branch} / {L.en.branch}</p>
            <p className="font-semibold">{v.branchName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{L.bn.status} / {L.en.status}</p>
            <p className="font-semibold">{v.status}</p>
          </div>
        </div>

        {/* Payee / memo */}
        <div className="space-y-1 py-2 text-sm">
          <p><span className="text-muted-foreground">{L.bn.payeePayer} / {L.en.payeePayer}:</span> <span className="font-medium">{v.payeePayer ?? '—'}</span></p>
          <p><span className="text-muted-foreground">{L.bn.memo} / {L.en.memo}:</span> <span className="font-medium">{v.memo}</span></p>
          {v.autoSource && <p className="text-xs text-muted-foreground">{L.bn.autoSource}: {v.autoSource}</p>}
        </div>

        {/* Lines */}
        <table className="w-full border text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="border px-2 py-1.5 text-left text-xs">{L.bn.account} / {L.en.account}</th>
              <th className="border px-2 py-1.5 text-left text-xs">{L.bn.fund} / {L.en.fund}</th>
              <th className="border px-2 py-1.5 text-right text-xs">{L.bn.debit} / {L.en.debit}</th>
              <th className="border px-2 py-1.5 text-right text-xs">{L.bn.credit} / {L.en.credit}</th>
            </tr>
          </thead>
          <tbody>
            {v.lines.map((l, i) => (
              <tr key={i}>
                <td className="border px-2 py-1.5">
                  <span className="font-mono text-xs">{l.accountCode}</span> {l.accountName}
                </td>
                <td className="border px-2 py-1.5 text-xs text-muted-foreground">{l.projectName ?? l.fundId ?? '—'}</td>
                <td className="border px-2 py-1.5 text-right tabular-nums">{Number(l.debit) !== 0 ? money(l.debit) : ''}</td>
                <td className="border px-2 py-1.5 text-right tabular-nums">{Number(l.credit) !== 0 ? money(l.credit) : ''}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border px-2 py-1.5" colSpan={2}>{L.bn.total} / {L.en.total}</td>
              <td className="border px-2 py-1.5 text-right tabular-nums">{money(totalDebit)}</td>
              <td className="border px-2 py-1.5 text-right tabular-nums">{money(totalDebit)}</td>
            </tr>
          </tbody>
        </table>

        {/* Amount in words, bilingual */}
        <p className="mt-3 text-sm">
          <span className="text-muted-foreground">{L.bn.amountInWords} / {L.en.amountInWords}:</span>{' '}
          <span className="font-medium">{amountInWords(totalDebit)}</span>
        </p>

        {/* Signature blocks */}
        <div className="mt-8 grid grid-cols-3 gap-4 border-t pt-4 text-center text-sm">
          <div>
            <p className="border-t border-dashed pt-1">
              <span className="block text-xs text-muted-foreground">{L.bn.preparedBy} / {L.en.preparedBy}</span>
              {v.preparedBy ? v.preparedBy.slice(0, 8) : '—'}
            </p>
          </div>
          <div>
            <p className="border-t border-dashed pt-1">
              <span className="block text-xs text-muted-foreground">{L.bn.checkedBy} / {L.en.checkedBy}</span>
              {v.checkedBy ? v.checkedBy.slice(0, 8) : '—'}
            </p>
          </div>
          <div>
            <p className="border-t border-dashed pt-1">
              <span className="block text-xs text-muted-foreground">{L.bn.approvedBy} / {L.en.approvedBy}</span>
              {v.approvedBy ? v.approvedBy.slice(0, 8) : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
