/**
 * ── Donor report print page (req 7) ─────────────────────────────────────────
 * Print-ready rendering of a generated donor report: bilingual header,
 * narrative, indicator table and financial summary. Word export opens the
 * API's HTML document; print → PDF via the browser.
 */
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { api } from '@/lib/api';

interface ReportRow {
  id: string;
  projectId: string;
  periodStart: string;
  periodEnd: string;
  generatedBy: string;
  report: {
    projectCode: string;
    projectNameBn: string;
    projectNameEn: string;
    donor: string;
    grantAgreementNo: string;
    fundCode: string;
    sector: string;
    narrativeBn: string[];
    indicators: { indicatorCode: string | null; statement: string; unit: string | null; baseline: string; target: string; achieved: string; progressPct: number; evidenceCount: number }[];
    financials: { lineItem: string; budgeted: string; spentPeriod: string; spentCumulative: string; utilizationPct: number }[];
    financialSummary: { budgetTotal: string; spentCumulative: string; spentPeriod: string; utilizationPct: number };
    delivery: { services: number; activitiesDone: number; beneficiariesEnrolled: number; visits: number; visitScorePct: number };
  };
}

export function DonorReportPrintPage() {
  const { reportId } = useParams<{ reportId: string }>();
  const reports = useQuery({
    queryKey: ['pops', 'reports'],
    queryFn: () => api.get<{ items: ReportRow[] }>('/programs/donor-reports'),
  });

  if (reports.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }
  const row = reports.data?.items.find((r) => r.id === reportId);
  if (!row) {
    return <div className="p-8 text-sm text-red-600">প্রতিবেদন পাওয়া যায়নি।</div>;
  }
  const r = row.report;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground" to="/programs/ops">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> ফিরে যান
        </Link>
        <div className="flex gap-2">
          <a
            className="inline-flex items-center rounded-md border px-4 py-2 text-sm hover:bg-muted"
            href={`/api/v1/programs/donor-reports/${row.id}/export`}
            target="_blank"
            rel="noreferrer"
          >
            Word এক্সপোর্ট
          </a>
          <button className="inline-flex items-center rounded-md border px-4 py-2 text-sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" /> প্রিন্ট / PDF
          </button>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <h1 className="text-center text-xl font-bold text-teal-800">স্যামিটি ম্যানেজার সমবায় সমিতি</h1>
        <p className="text-center text-sm text-muted-foreground">Samity Manager Cooperative Society</p>

        <h2 className="mt-4 border-b-2 border-teal-700 pb-2 text-center text-lg font-semibold">
          দাতা প্রতিবেদন / Donor Report — {r.projectCode}
        </h2>

        <table className="mt-4 w-full text-sm">
          <tbody>
            <tr><td className="py-1 font-semibold">প্রকল্প:</td><td>{r.projectNameBn} ({r.projectNameEn})</td><td className="font-semibold">দাতা:</td><td>{r.donor}</td></tr>
            <tr><td className="font-semibold">চুক্তি নং:</td><td className="font-mono text-xs">{r.grantAgreementNo}</td><td className="font-semibold">ফান্ড কোড:</td><td className="font-mono text-xs">{r.fundCode}</td></tr>
            <tr><td className="font-semibold">মেয়াদ:</td><td>{row.periodStart} থেকে {row.periodEnd}</td><td className="font-semibold">খাত:</td><td>{r.sector}</td></tr>
          </tbody>
        </table>

        <h3 className="mt-6 font-semibold">১) বিবরণী</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
          {r.narrativeBn.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>

        <h3 className="mt-6 font-semibold">২) সূচক তালিকা</h3>
        <table className="mt-1 w-full text-xs">
          <thead className="border-b bg-teal-50 text-muted-foreground">
            <tr><Th>কোড</Th><Th>সূচক</Th><Th right>বেসলাইন</Th><Th right>লক্ষ্য</Th><Th right>অর্জিত</Th><Th right>অগ্রগতি</Th></tr>
          </thead>
          <tbody>
            {r.indicators.map((i, k) => (
              <tr key={k} className="border-b last:border-0">
                <Td className="font-mono">{i.indicatorCode ?? '—'}</Td>
                <Td>{i.statement}</Td>
                <Td right>{i.baseline}</Td>
                <Td right>{i.target}{i.unit ? ` ${i.unit}` : ''}</Td>
                <Td right>{i.achieved}</Td>
                <Td right>{i.progressPct}%</Td>
              </tr>
            ))}
            {r.indicators.length === 0 && (
              <tr><td className="px-2 py-2 text-muted-foreground" colSpan={6}>—</td></tr>
            )}
          </tbody>
        </table>

        <h3 className="mt-6 font-semibold">৩) আর্থিক বিবরণী</h3>
        <table className="mt-1 w-full text-xs">
          <thead className="border-b bg-teal-50 text-muted-foreground">
            <tr><Th>বাজেট লাইন</Th><Th right>বাজেট (৳)</Th><Th right>প্রান্তিক ব্যয়</Th><Th right>ক্রমপুঞ্জিত</Th><Th right>ব্যবহার</Th></tr>
          </thead>
          <tbody>
            {r.financials.map((f) => (
              <tr key={f.lineItem} className="border-b last:border-0">
                <Td>{f.lineItem}</Td>
                <Td right>{Number(f.budgeted).toLocaleString('en-US')}</Td>
                <Td right>{Number(f.spentPeriod).toLocaleString('en-US')}</Td>
                <Td right>{Number(f.spentCumulative).toLocaleString('en-US')}</Td>
                <Td right>{f.utilizationPct}%</Td>
              </tr>
            ))}
            <tr className="border-t-2 bg-teal-50 font-semibold">
              <Td>মোট</Td>
              <Td right>{Number(r.financialSummary.budgetTotal).toLocaleString('en-US')}</Td>
              <Td right>{Number(r.financialSummary.spentPeriod).toLocaleString('en-US')}</Td>
              <Td right>{Number(r.financialSummary.spentCumulative).toLocaleString('en-US')}</Td>
              <Td right>{r.financialSummary.utilizationPct}%</Td>
            </tr>
          </tbody>
        </table>

        <p className="mt-6 text-xs text-muted-foreground">
          ডেলিভারি: সেবা {r.delivery.services} · সম্পন্ন কার্যক্রম {r.delivery.activitiesDone} · ভর্তি {r.delivery.beneficiariesEnrolled} জন · পরিদর্শন {r.delivery.visits} (গড় {r.delivery.visitScorePct}%)।
          সংবেদনশীল কেস-ব্যবস্থাপনার তথ্য এই প্রতিবেদনে অন্তর্ভুক্ত নয়।
        </p>
      </div>
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-2 py-1 text-left font-semibold ${right ? 'text-right' : ''}`}>{children}</th>;
}
function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`px-2 py-1 ${right ? 'text-right tabular-nums' : ''} ${className ?? ''}`}>{children}</td>;
}
