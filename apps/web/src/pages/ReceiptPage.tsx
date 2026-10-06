import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Printer, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMoneyFormatter } from '@/lib/digits';
import { getOutboxEntry, type OutboxEntry } from '@/lib/offline';
import { api } from '@/lib/api';

/** Server-side receipt shape (GET /collection/entries/:idempotencyKey/receipt).
 *  Both routers reply { entry: CollectionReceipt } — same as the post/sync response. */
interface ServerReceiptEntry {
  idempotencyKey: string;
  meetingDate: string;
  createdAt: string;
  memberName: string;
  receiptNo: string;
  allocation: {
    overdueApplied: Array<{ installmentId: string; seq: number; amount: string }>;
    currentApplied: { installmentId: string; seq: number; amount: string } | null;
    savingsApplied: string;
    advanceApplied: string;
  };
}
interface ServerReceiptResponse {
  entry: ServerReceiptEntry;
}

/** Map a server receipt onto the outbox-entry shape the page renders. */
function fromServerResponse(res: ServerReceiptResponse): OutboxEntry {
  const e = res.entry;
  const loanApplied =
    e.allocation.overdueApplied.reduce((s, o) => s + Number(o.amount), 0) +
    Number(e.allocation.currentApplied?.amount ?? 0);
  return {
    idempotencyKey: e.idempotencyKey,
    memberId: '',
    meetingDate: e.meetingDate,
    loanPaid: loanApplied.toFixed(2),
    savingsPaid: Number(e.allocation.savingsApplied).toFixed(2),
    extraPaid: Number(e.allocation.advanceApplied).toFixed(2),
    capturedAt: e.createdAt,
    status: 'posted',
    receiptNo: e.receiptNo,
    memberName: e.memberName,
  };
}

/**
 * Printable / WhatsApp-shareable collection receipt (requirement 3).
 * Offline-first: reads the stored outbox entry; when the entry was captured
 * on another device (or the outbox was cleared) it falls back to the server's
 * idempotent receipt lookup so re-print / WhatsApp share always works.
 */
export function ReceiptPage() {
  const { idempotencyKey } = useParams<{ idempotencyKey: string }>();
  const fmt = useMoneyFormatter();
  const [entry, setEntry] = useState<OutboxEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const key = idempotencyKey ?? '';
    void (async () => {
      const local = await getOutboxEntry(key);
      if (cancelled) return;
      if (local) {
        setEntry(local);
        setLoading(false);
        return;
      }
      try {
        const res = await api.get<ServerReceiptResponse>(`/collection/entries/${encodeURIComponent(key)}/receipt`);
        if (cancelled) return;
        setEntry(fromServerResponse(res));
      } catch {
        if (!cancelled) setEntry(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idempotencyKey]);

  if (loading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }
  if (!entry) {
    return <div className="p-8 text-sm text-red-600">রসিদ পাওয়া যায়নি।</div>;
  }

  const total = Number(entry.loanPaid) + Number(entry.savingsPaid) + Number(entry.extraPaid);
  const shareText = [
    `রসিদ নং: ${entry.receiptNo ?? '(সিঙ্ক হয়নি)'}`,
    `তারিখ: ${entry.meetingDate}`,
    `সদস্য: ${entry.memberName ?? ''}`,
    `মোট আদায়: ৳${total.toFixed(2)}`,
    entry.loanPaid !== '0.00' ? `কিস্তি: ৳${Number(entry.loanPaid).toFixed(2)}` : '',
    entry.savingsPaid !== '0.00' ? `সঞ্চয়: ৳${Number(entry.savingsPaid).toFixed(2)}` : '',
    entry.extraPaid !== '0.00' ? `অগ্রিম: ৳${Number(entry.extraPaid).toFixed(2)}` : '',
    '— সমিতি ম্যানেজার',
  ]
    .filter(Boolean)
    .join('\n');

  const share = async () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={() => window.history.back()}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> ফিরে যান
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={share}>
            <Share2 className="mr-1.5 h-4 w-4" /> WhatsApp
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> প্রিন্ট
          </Button>
        </div>
      </div>

      {/* Receipt sheet — compact thermal-print friendly */}
      <div className="mx-auto rounded-lg border bg-white p-6 shadow-sm print:border-0 print:shadow-none">
        <div className="border-b-2 border-teal-700 pb-2 text-center">
          <h1 className="text-lg font-bold text-teal-800">সমিতি ম্যানেজার</h1>
          <p className="text-xs text-muted-foreground">আদায় রসিদ · Collection Receipt</p>
        </div>

        <div className="mt-3 space-y-1 text-sm">
          <p className="flex justify-between"><span className="text-muted-foreground">রসিদ নং</span> <strong className="font-mono text-xs">{entry.receiptNo ?? 'সিঙ্ক অপেক্ষমাণ'}</strong></p>
          <p className="flex justify-between"><span className="text-muted-foreground">তারিখ</span> <span>{entry.meetingDate}</span></p>
          <p className="flex justify-between"><span className="text-muted-foreground">সদস্য</span> <strong>{entry.memberName ?? '—'}</strong></p>
        </div>

        <table className="mt-4 w-full text-sm">
          <tbody>
            {Number(entry.loanPaid) > 0 && (
              <tr className="border-b">
                <td className="py-1.5">কিস্তি / Installment</td>
                <td className="py-1.5 text-right">{fmt(entry.loanPaid)}</td>
              </tr>
            )}
            {Number(entry.savingsPaid) > 0 && (
              <tr className="border-b">
                <td className="py-1.5">সঞ্চয় / Savings</td>
                <td className="py-1.5 text-right">{fmt(entry.savingsPaid)}</td>
              </tr>
            )}
            {Number(entry.extraPaid) > 0 && (
              <tr className="border-b">
                <td className="py-1.5">অগ্রিম / Advance</td>
                <td className="py-1.5 text-right">{fmt(entry.extraPaid)}</td>
              </tr>
            )}
            <tr>
              <td className="pt-2 font-semibold">মোট / Total</td>
              <td className="pt-2 text-right text-base font-bold">{fmt(total.toFixed(2))}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-2 text-[10px] text-muted-foreground">
          পাসবুকে লিপিবদ্ধ · প্রাপকের স্বাক্ষর হিসাবে চূড়ান্ত
        </p>

        <div className="mt-8 grid grid-cols-2 gap-6 text-center text-xs text-muted-foreground print:mt-10">
          <div className="border-t pt-2">
            <span className="text-[10px]">গ্রহণকারীর স্বাক্ষর / Received by</span>
          </div>
          <div className="border-t pt-2">
            <span className="text-[10px]">আদায়কারী / Collector</span>
          </div>
        </div>

        {entry.status === 'queued' && (
          <p className="mt-3 rounded bg-amber-50 px-2 py-1 text-center text-[10px] text-amber-700 print:hidden">
            এন্ট্রি এখনো অফলাইন সারিতে — সিঙ্কের পর রসিদ নং আসবে।
          </p>
        )}
      </div>
    </div>
  );
}
