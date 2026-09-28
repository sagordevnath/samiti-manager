/**
 * ── Public verification page (req 7) ────────────────────────────────────────
 * Reached by scanning the QR printed on any document (…/verify/VRF-…).
 * Deliberately OUTSIDE the authenticated layout: it calls the public API
 * endpoint and shows ONLY non-personal fields — document kind, number, org,
 * issued date and validity. No member/staff names, no amounts, no body.
 */
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import { api } from '@/lib/api';

interface PublicVerify {
  kind: string;
  kindLabelBn: string;
  docNo: string;
  orgName: string;
  issuedAt: string;
  status: 'valid' | 'revoked' | 'unknown';
}

const API_BASE = import.meta.env.VITE_API_URL ?? '/api/v1';

export default function VerifyPage() {
  const { code = '' } = useParams();
  const q = useQuery({
    queryKey: ['public-verify', code],
    queryFn: () => fetch(`${API_BASE}/public/verify/${encodeURIComponent(code)}`).then((r) => r.json() as Promise<PublicVerify>),
    retry: false,
  });
  const v = q.data;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-teal-50">
          {v?.status === 'valid' && <BadgeCheck className="h-8 w-8 text-teal-600" />}
          {v?.status === 'revoked' && <ShieldAlert className="h-8 w-8 text-red-600" />}
          {(!v || v.status === 'unknown') && <ShieldQuestion className="h-8 w-8 text-slate-400" />}
        </div>
        <h1 className="text-lg font-bold">দলিল যাচাই</h1>
        <p className="mt-1 text-sm text-muted-foreground">কোড: <span className="font-mono">{code}</span></p>

        {v && v.status === 'valid' && (
          <div className="mt-6 space-y-2 rounded-lg border border-teal-200 bg-teal-50/60 p-4 text-sm">
            <p className="text-base font-semibold text-teal-800">✅ দলিলটি সত্য ও সক্রিয়</p>
            <p>ধরন: {v.kindLabelBn || v.kind}</p>
            <p>দলিল নম্বর: <span className="font-mono">{v.docNo}</span></p>
            <p>সংস্থা: {v.orgName}</p>
            <p>ইস্যু: {v.issuedAt ? new Date(v.issuedAt).toLocaleString('bn-BD') : '—'}</p>
          </div>
        )}
        {v && v.status === 'revoked' && (
          <div className="mt-6 space-y-2 rounded-lg border border-red-200 bg-red-50/60 p-4 text-sm">
            <p className="text-base font-semibold text-red-800">⛔ দলিলটি বাতিল করা হয়েছে</p>
            <p>ধরন: {v.kindLabelBn || v.kind}</p>
            <p>দলিল নম্বর: <span className="font-mono">{v.docNo}</span></p>
          </div>
        )}
        {v && v.status === 'unknown' && (
          <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
            <p className="font-semibold text-slate-700">কোনো দলিল এই কোডে পাওয়া যায়নি।</p>
            <p className="mt-1 text-xs text-muted-foreground">QR ঠিকভাবে স্ক্যান করেছেন কিনা দেখুন।</p>
          </div>
        )}

        <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
          এই পেজ শুধু দলিলের সত্যতা নিশ্চিত করে। গোপনীয়তা রক্ষায় এখানে সদস্যের নাম, টাকার পরিমাণ বা অন্য কোনো ব্যক্তিগত তথ্য দেখানো হয় না।
        </p>
      </div>
    </div>
  );
}
