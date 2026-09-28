/**
 * ── Training certificate print (Bangla, PDF-ready) ───────────────────────────
 * Req 4: a print-ready certificate sheet from the certificate API — bilingual
 * header, the completed batch, trainer, hours and signature block. Mirror of
 * the accounting voucher print page.
 */
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { api } from '@/lib/api';

interface CertList {
  items: { id: string; certNo: string; batchId: string; beneficiaryId: string; issuedAt: string }[];
  batches: { id: string; code: string; titleBn: string; trainerName: string; trainerOrgBn: string; startDate: string; endDate: string; hours: number; projectId: string }[];
  beneficiaries: { id: string; code: string; nameBn: string; guardianBn: string; village: string }[];
}

export function CertificatePrintPage() {
  const { certificateId } = useParams<{ certificateId: string }>();
  const certs = useQuery({
    queryKey: ['pg', 'certificates'],
    queryFn: () => api.get<CertList>('/programs/certificates'),
  });

  if (certs.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }
  const cert = certs.data?.items.find((c) => c.id === certificateId);
  const batch = cert && certs.data?.batches.find((b) => b.id === cert.batchId);
  const ben = cert && certs.data?.beneficiaries.find((b) => b.id === cert.beneficiaryId);
  if (!cert || !batch || !ben) {
    return <div className="p-8 text-sm text-red-600">সার্টিফিকেট পাওয়া যায়নি।</div>;
  }
  const issued = new Date(cert.issuedAt).toLocaleDateString('bn-BD');

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <a className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground" href="/programs">
          <ArrowLeft className="mr-1.5 h-4 w-4" /> ফিরে যান
        </a>
        <button className="inline-flex items-center rounded-md border px-4 py-2 text-sm" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" /> প্রিন্ট / PDF
        </button>
      </div>

      <div className="mx-auto rounded-lg border-4 border-double border-teal-800 bg-white p-10 text-center shadow-sm print:border-0 print:shadow-none">
        <h1 className="text-2xl font-bold text-teal-800">স্যামিটি ম্যানেজার সমবায় সমিতি</h1>
        <p className="text-sm text-muted-foreground">Samity Manager Cooperative Society</p>

        <h2 className="mt-6 text-xl font-semibold">প্রশিক্ষণ সম্পন্নের সার্টিফিকেট</h2>
        <p className="text-xs text-muted-foreground">Certificate of Training Completion</p>

        <div className="mt-8 space-y-4 text-base leading-relaxed">
          <p>এই মাধ্যমে প্রত্যয়ন করা হচ্ছে যে,</p>
          <p className="text-xl font-bold">{ben.nameBn}</p>
          <p className="text-sm text-muted-foreground">
            {ben.code}{ben.village ? ` · ${ben.village}` : ''}{ben.guardianBn ? ` · অভিভাবক: ${ben.guardianBn}` : ''}
          </p>
          <p>
            <b>"{batch.titleBn}"</b> শীর্ষক <b>{batch.hours} ঘণ্টা</b>র প্রশিক্ষণ সফলতার সাথে সম্পন্ন করেছেন
            (মেয়াদ: {batch.startDate} থেকে {batch.endDate})।
          </p>
          <p className="text-sm">প্রশিক্ষক: {batch.trainerName}{batch.trainerOrgBn ? `, ${batch.trainerOrgBn}` : ''}</p>
        </div>

        <div className="mt-10 flex items-end justify-between text-sm">
          <div className="text-left">
            <div className="border-t border-foreground/40 pt-1">প্রশিক্ষণ সমন্বয়ক</div>
          </div>
          <div className="text-center">
            <p className="font-mono text-xs">{cert.certNo}</p>
            <p className="text-xs text-muted-foreground">ব্যাচ: {batch.code}</p>
            <p className="text-xs text-muted-foreground">ইস্যুর তারিখ: {issued}</p>
          </div>
          <div className="text-right">
            <div className="border-t border-foreground/40 pt-1">পরিচালক</div>
          </div>
        </div>
      </div>
    </div>
  );
}
