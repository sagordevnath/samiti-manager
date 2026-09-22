import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';
import type { PassbookStatement } from '@samity/shared';

interface AccountRow {
  id: string;
  account_number: string;
  member_id: string;
  product_id: string;
  balance: string;
  status: string;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function PassbookPage() {
  const fmt = useMoneyFormatter();
  const accounts = useQuery({
    queryKey: ['savings-accounts'],
    queryFn: () => api.get<{ items: AccountRow[] }>('/savings/accounts'),
  });

  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 90 * 86_400_000)));
  const [to, setTo] = useState(isoDay(new Date()));

  useEffect(() => {
    if (!accountId && accounts.data?.items.length) setAccountId(accounts.data.items[0]!.id);
  }, [accounts.data, accountId]);

  const enabled = accountId !== '' && from !== '' && to !== '';
  const statement = useQuery({
    queryKey: ['passbook', accountId, from, to],
    enabled,
    queryFn: () =>
      api.get<{ statement: PassbookStatement }>(
        `/savings/passbook?accountId=${accountId}&from=${from}&to=${to}`,
      ),
  });

  const s = statement.data?.statement;

  if (accounts.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-700">Passbook</p>
          <h1 className="text-2xl font-bold">সঞ্চয় পাসবুক</h1>
        </div>
        <Button variant="outline" className="print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> প্রিন্ট করুন
        </Button>
      </div>

      <Card className="print:hidden">
        <CardContent className="grid gap-3 pt-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>হিসাব</Label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {(accounts.data?.items ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.account_number} ({a.status})</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>শুরুর তারিখ</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>শেষ তারিখ</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {statement.isLoading && (
        <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> স্টেটমেন্ট আসছে…</div>
      )}

      {s && (
        // ── Printable Bangla passbook (A5-friendly) ───────────────────────
        <div id="passbook-sheet" className="mx-auto max-w-3xl rounded-lg border bg-white p-6 shadow-sm print:border-0 print:shadow-none">
          <div className="border-b pb-3 text-center">
            <h2 className="text-lg font-bold">{s.account.orgName ?? 'সমবায় সমিতি'}</h2>
            <p className="text-sm text-muted-foreground">সঞ্চয় পাসবুক / Savings Passbook</p>
          </div>

          <div className="grid gap-2 border-b py-3 text-sm md:grid-cols-2">
            <p><span className="text-muted-foreground">সদস্যের নাম:</span> <strong>{s.account.memberNameBn ?? s.account.memberName}</strong></p>
            <p><span className="text-muted-foreground">সদস্য নম্বর:</span> {s.account.memberCode ?? '—'}</p>
            <p><span className="text-muted-foreground">হিসাব নম্বর:</span> {s.account.accountNumber}</p>
            <p><span className="text-muted-foreground">পণ্য:</span> {s.account.productNameBn ?? s.account.productName}</p>
            <p><span className="text-muted-foreground">শাখা:</span> {s.account.branchName ?? '—'}</p>
            <p><span className="text-muted-foreground">অবস্থা:</span> {s.account.status}</p>
          </div>

          <p className="py-2 text-sm text-muted-foreground">
            মেয়াদ: {s.from} থেকে {s.to} পর্যন্ত
          </p>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-1.5">তারিখ</th>
                <th className="py-1.5">বিবরণ</th>
                <th className="py-1.5 text-right">জমা</th>
                <th className="py-1.5 text-right">উত্তোলন</th>
                <th className="py-1.5 text-right">ব্যালান্স</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b bg-muted/40">
                <td className="py-1.5" colSpan={4}>প্রারম্ভিক ব্যালান্স</td>
                <td className="py-1.5 text-right font-medium">{fmt(s.openingBalance)}</td>
              </tr>
              {s.lines.map((line) => (
                <tr key={line.id} className="border-b last:border-0">
                  <td className="py-1.5 whitespace-nowrap">{line.date.slice(0, 10)}</td>
                  <td className="py-1.5">{line.reference ?? line.note ?? line.type}</td>
                  <td className="py-1.5 text-right">{Number(line.deposit) > 0 ? fmt(line.deposit) : ''}</td>
                  <td className="py-1.5 text-right">{Number(line.withdrawal) > 0 ? fmt(line.withdrawal) : ''}</td>
                  <td className="py-1.5 text-right font-medium">{fmt(line.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 font-semibold">
                <td className="py-2" colSpan={2}>মোট</td>
                <td className="py-2 text-right">{fmt(s.totalDeposits)}</td>
                <td className="py-2 text-right">{fmt(s.totalWithdrawals)}</td>
                <td className="py-2 text-right">{fmt(s.closingBalance)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="mt-8 flex justify-between text-xs text-muted-foreground print:mt-12">
            <span>________________<br />সদস্যের স্বাক্ষর</span>
            <span>________________<br />শাখা ব্যবস্থাপক</span>
          </div>
        </div>
      )}

      {!s && !statement.isLoading && enabled && statement.isError && (
        <p className="text-sm text-red-600">{(statement.error as Error).message}</p>
      )}
    </div>
  );
}
