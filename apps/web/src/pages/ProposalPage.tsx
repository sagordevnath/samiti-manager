import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Printer } from 'lucide-react';
import type { LoanProposalData } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

const FREQ_BN: Record<string, string> = { daily: 'দৈনিক', weekly: 'সাপ্তাহিক', biweekly: 'পাক্ষিক', monthly: 'মাসিক' };
const RELATION_BN: Record<string, string> = {
  spouse: 'স্বামী/স্ত্রী',
  parent: 'পিতা/মাতা',
  sibling: 'ভাই/বোন',
  same_group_member: 'একই গোষ্ঠীর সদস্য',
  business_peer: 'ব্যবসায়িক পরিচিত',
  other: 'অন্যান্য',
};

export function ProposalPage() {
  const { id } = useParams<{ id: string }>();
  const fmt = useMoneyFormatter();

  const proposal = useQuery({
    queryKey: ['loan-proposal', id],
    enabled: id !== undefined,
    queryFn: () => api.get<LoanProposalData>(`/loans/applications/${id}/proposal`),
  });

  if (proposal.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }
  if (proposal.isError || !proposal.data) {
    return <p className="p-8 text-sm text-red-600">{(proposal.error as Error)?.message ?? 'পাওয়া যায়নি'}</p>;
  }

  const p = proposal.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-700">Loan proposal</p>
          <h1 className="text-2xl font-bold">ঋণের প্রস্তাব — {p.applicationNumber}</h1>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> প্রিন্ট / PDF
        </Button>
      </div>

      {/* ── Printable Bangla proposal sheet ─────────────────────────────── */}
      <div id="loan-proposal-sheet" className="mx-auto max-w-3xl rounded-lg border bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="border-b-2 border-teal-700 pb-3 text-center">
          <h2 className="text-xl font-bold">{p.orgName}</h2>
          <p className="text-sm text-muted-foreground">ঋণ প্রস্তাব পত্র / Loan Proposal</p>
        </div>

        {/* Photo block (top-right, print tradition) */}
        <div className="relative">
          <div className="absolute right-0 top-0 flex h-28 w-24 items-center justify-center rounded border border-dashed border-teal-400 bg-teal-50/40 text-center text-xs text-muted-foreground">
            {p.member.photoUrl ? (
              <img src={p.member.photoUrl} alt="সদস্যের ছবি" className="h-full w-full rounded object-cover" />
            ) : (
              <span>ছবি<br />Photo</span>
            )}
          </div>
        </div>

        <table className="mt-2 w-full text-sm">
          <tbody>
            <tr>
              <td className="w-48 py-1 text-muted-foreground">আবেদন নম্বর</td>
              <td className="py-1 font-semibold">{p.applicationNumber}</td>
            </tr>
            <tr>
              <td className="py-1 text-muted-foreground">সদস্যের নাম</td>
              <td className="py-1 font-semibold">{p.member.nameBn ?? p.member.name} ({p.member.code})</td>
            </tr>
            <tr>
              <td className="py-1 text-muted-foreground">শাখা</td>
              <td className="py-1">{p.member.branchName ?? '—'}</td>
            </tr>
            <tr>
              <td className="py-1 text-muted-foreground">ঋণের পণ্য</td>
              <td className="py-1">{p.product.nameBn ?? p.product.name} ({p.product.code})</td>
            </tr>
            <tr>
              <td className="py-1 text-muted-foreground">ঋণের পরিমাণ</td>
              <td className="py-1 text-lg font-bold text-teal-800">{fmt(p.requestedAmount)}</td>
            </tr>
            <tr>
              <td className="py-1 text-muted-foreground">মেয়াদ ও কিস্তি</td>
              <td className="py-1">{p.termMonths} মাস · {FREQ_BN[p.product.installmentFrequency] ?? p.product.installmentFrequency} · {p.product.interestRate}% {p.product.interestMethod === 'flat' ? 'ফ্ল্যাট' : 'declining'}</td>
            </tr>
            <tr>
              <td className="py-1 align-top text-muted-foreground">উদ্দেশ্য</td>
              <td className="py-1">{p.purpose}</td>
            </tr>
          </tbody>
        </table>

        {/* Utilization plan */}
        {p.utilization.items.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1 border-b pb-1 font-semibold">ঋণের ব্যবহার পরিকল্পনা (Utilization plan)</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">খাত</th>
                  <th className="py-1">বিবরণ</th>
                  <th className="py-1 text-right">পরিমাণ</th>
                </tr>
              </thead>
              <tbody>
                {p.utilization.items.map((item) => (
                  <tr key={item.category} className="border-t">
                    <td className="py-1">{item.category}</td>
                    <td className="py-1">{item.note ?? '—'}</td>
                    <td className="py-1 text-right">{fmt(item.plannedAmount)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 font-semibold">
                  <td className="py-1" colSpan={2}>মোট</td>
                  <td className="py-1 text-right">{fmt(p.utilization.plannedTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Repayment schedule (first 12 installments + total row) */}
        <div className="mt-4">
          <h3 className="mb-1 border-b pb-1 font-semibold">পরিশোধ সূচি (Repayment schedule)</h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1">কিস্তি</th>
                <th className="py-1">তারিখ</th>
                <th className="py-1 text-right">মূল</th>
                <th className="py-1 text-right">সুদ</th>
                <th className="py-1 text-right">মোট</th>
              </tr>
            </thead>
            <tbody>
              {p.schedule.slice(0, 12).map((inst) => (
                <tr key={inst.seq} className="border-t">
                  <td className="py-0.5">{inst.seq}</td>
                  <td className="py-0.5">{inst.dueDate}</td>
                  <td className="py-0.5 text-right">{fmt(inst.principal)}</td>
                  <td className="py-0.5 text-right">{fmt(inst.interest)}</td>
                  <td className="py-0.5 text-right">{fmt(inst.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {p.schedule.length > 12 && (
            <p className="mt-1 text-xs text-muted-foreground">… মোট {p.schedule.length} কিস্তি</p>
          )}
        </div>

        {/* Guarantors */}
        {p.guarantors.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1 border-b pb-1 font-semibold">জামিনদার (Guarantors)</h3>
            <ul className="list-inside list-disc text-sm">
              {p.guarantors.map((g) => (
                <li key={g.name}>{g.name} — {RELATION_BN[g.relation] ?? g.relation} — {g.mobile}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Workflow signatures */}
        <div className="mt-8 grid grid-cols-3 gap-6 text-xs text-muted-foreground print:mt-12">
          <div>
            <div className="h-12 border-b border-dashed border-muted-foreground" />
            সদস্যের স্বাক্ষর / সংকেত<br />
            <span className="text-[10px]">Member signature / thumbprint</span>
          </div>
          <div>
            <div className="h-12 border-b border-dashed border-muted-foreground" />
            একাউন্ট অফিসার<br />
            <span className="text-[10px]">Account Officer</span>
          </div>
          <div>
            <div className="h-12 border-b border-dashed border-muted-foreground" />
            শাখা ব্যবস্থাপক<br />
            <span className="text-[10px]">Branch Manager</span>
          </div>
        </div>
        <p className="mt-4 text-center text-[10px] text-muted-foreground">
          তৈরি: {new Date(p.generatedAt).toLocaleString('bn-BD')} · {p.applicationNumber}
        </p>
      </div>
    </div>
  );
}
