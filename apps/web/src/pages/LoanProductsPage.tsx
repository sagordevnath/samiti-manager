import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';

interface PolicyRow {
  rateCapPercent: number;
  bmApprovalLimitBdt: string;
  guarantorsRequired: number;
  maxActiveLoansPerMember: number;
}

export interface ProductRow {
  id: string;
  code: string;
  name: string;
  name_bn: string | null;
  product_type: string;
  min_amount: string;
  max_amount: string;
  term_months: number;
  installment_frequency: string;
  interest_method: string;
  interest_rate: number;
  service_charge: number;
  processing_fee_rate: number;
  insurance_premium_rate: number;
  grace_period_installments: number;
  eligibility_note: string | null;
  required_documents: string[];
  guarantors_required: number;
}

/** The API returns camelCase read models (demo) or DB rows (Supabase). */
export function normalizeProduct(raw: Record<string, unknown>): ProductRow {
  return {
    id: String(raw['id']),
    code: String(raw['code']),
    name: String(raw['name']),
    name_bn: (raw['name_bn'] ?? raw['nameBn'] ?? null) as string | null,
    product_type: String(raw['product_type'] ?? raw['productType']),
    min_amount: String(raw['min_amount'] ?? raw['minAmount'] ?? '0'),
    max_amount: String(raw['max_amount'] ?? raw['maxAmount'] ?? '0'),
    term_months: Number(raw['term_months'] ?? raw['termMonths'] ?? 0),
    installment_frequency: String(raw['installment_frequency'] ?? raw['installmentFrequency']),
    interest_method: String(raw['interest_method'] ?? raw['interestMethod']),
    interest_rate: Number(raw['interest_rate'] ?? raw['interestRate'] ?? 0),
    service_charge: Number(raw['service_charge'] ?? raw['serviceCharge'] ?? 0),
    processing_fee_rate: Number(raw['processing_fee_rate'] ?? raw['processingFeeRate'] ?? 0),
    insurance_premium_rate: Number(raw['insurance_premium_rate'] ?? raw['insurancePremiumRate'] ?? 0),
    grace_period_installments: Number(raw['grace_period_installments'] ?? raw['gracePeriodInstallments'] ?? 0),
    eligibility_note: (raw['eligibility_note'] ?? raw['eligibilityNote'] ?? null) as string | null,
    required_documents: (raw['required_documents'] ?? raw['requiredDocuments'] ?? []) as string[],
    guarantors_required: Number(raw['guarantors_required'] ?? raw['guarantorsRequired'] ?? 1),
  };
}

const TYPE_BN: Record<string, string> = {
  general: 'সাধারণ',
  seasonal_agri: 'মৌসুমি কৃষি',
  microenterprise: 'ক্ষুদ্র উদ্যোগ',
  housing: 'আবাসন',
  education: 'শিক্ষা',
  emergency: 'জরুরি',
  migration: 'প্রবাস',
  device: 'ডিভাইস',
  climate: 'জলবায়ু',
};

const FREQ_BN: Record<string, string> = {
  daily: 'দৈনিক',
  weekly: 'সাপ্তাহিক',
  biweekly: 'পাক্ষিক',
  monthly: 'মাসিক',
};

export function LoanProductsPage() {
  const queryClient = useQueryClient();
  const fmt = useMoneyFormatter();

  const policy = useQuery({ queryKey: ['loans-policy'], queryFn: () => api.get<PolicyRow>('/loans/policy') });
  const products = useQuery({
    queryKey: ['loans-products'],
    queryFn: async () => {
      const res = await api.get<{ items: Array<Record<string, unknown>> }>('/loans/products');
      return { items: res.items.map(normalizeProduct) };
    },
  });

  const [capDraft, setCapDraft] = useState<string | null>(null);
  const [rate, setRate] = useState('25');
  const [method, setMethod] = useState<'declining_balance' | 'flat'>('declining_balance');
  const [rateFeedback, setRateFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const savePolicy = useMutation({
    mutationFn: (body: { rateCapPercent: number }) => api.patch('/loans/policy', body),
    onSuccess: () => {
      setCapDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['loans-policy'] });
    },
  });

  const checkRate = useMutation({
    mutationFn: () => api.post<{ ok: boolean; cap: number; message?: string }>('/loans/rate-check', { interestRate: Number(rate), interestMethod: method }),
    onSuccess: (res) =>
      setRateFeedback(
        res.ok
          ? { ok: true, message: `হার সীমার মধ্যে আছে (সর্বোচ্চ ${res.cap}%)` }
          : { ok: false, message: res.message ?? 'সীমার বাইরে' },
      ),
  });

  if (policy.isLoading || products.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-700">Loan products</p>
        <h1 className="text-2xl font-bold">ঋণের পণ্য তালিকা</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">নীতিমালা (Policy)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>নিয়ন্ত্রক সুদের সীমা (MRA)</Label>
              {capDraft === null ? (
                <button
                  type="button"
                  className="flex h-9 w-full items-center rounded-md border bg-background px-2 text-sm hover:border-teal-400"
                  onClick={() => setCapDraft(String(policy.data?.rateCapPercent ?? 27))}
                >
                  {policy.data?.rateCapPercent ?? '—'}%
                </button>
              ) : (
                <div className="flex gap-1">
                  <Input type="number" value={capDraft} onChange={(e) => setCapDraft(e.target.value)} autoFocus />
                  <Button
                    size="sm"
                    className="bg-teal-600 hover:bg-teal-700"
                    disabled={savePolicy.isPending}
                    onClick={() => savePolicy.mutate({ rateCapPercent: Number(capDraft) })}
                  >
                    সংরক্ষণ
                  </Button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>শাখা ব্যবস্থাপকের অনুমোদন-সীমা</Label>
              <Input value={fmt(policy.data?.bmApprovalLimitBdt ?? '0')} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <Label>প্রয়োজনীয় গ্যারান্টর</Label>
              <Input value={String(policy.data?.guarantorsRequired ?? '—')} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <Label>সর্বোচ্চ সক্রিয় ঋণ (সদস্যপ্রতি)</Label>
              <Input value={String(policy.data?.maxActiveLoansPerMember ?? '—')} readOnly disabled />
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3">
            <p className="mb-2 text-sm font-medium">নতুন পণ্যের হার-সীমা যাচাই</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">হার %</Label>
                <Input type="number" className="w-24" value={rate} onChange={(e) => setRate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">পদ্ধতি</Label>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={method}
                  onChange={(e) => setMethod(e.target.value as 'declining_balance' | 'flat')}
                >
                  <option value="declining_balance">Declining balance</option>
                  <option value="flat">ফ্ল্যাট</option>
                </select>
              </div>
              <Button variant="outline" disabled={checkRate.isPending} onClick={() => checkRate.mutate()}>
                যাচাই করুন
              </Button>
              {rateFeedback && (
                <span className={`text-sm ${rateFeedback.ok ? 'text-emerald-700' : 'text-red-600'}`}>{rateFeedback.message}</span>
              )}
            </div>
            {method === 'flat' && (
              <p className="mt-2 text-xs text-muted-foreground">ফ্ল্যাট হারকে প্রায় ২× গুণ করে declining-সমতুল্য করে সীমার সাথে মেলানো হয়।</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">পণ্য ক্যাটালগ</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {(products.data?.items ?? []).map((p) => (
            <div key={p.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{p.name_bn ?? p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.code} · {TYPE_BN[p.product_type] ?? p.product_type}</p>
                </div>
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">{p.interest_rate}%</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>সীমা: {fmt(p.min_amount)}–{fmt(p.max_amount)}</span>
                <span>মেয়াদ: {p.term_months} মাস</span>
                <span>কিস্তি: {FREQ_BN[p.installment_frequency] ?? p.installment_frequency}</span>
                <span>পদ্ধতি: {p.interest_method === 'flat' ? 'ফ্ল্যাট' : 'declining'}</span>
                {p.service_charge > 0 && <span>সার্ভিস চার্জ: {p.service_charge}%</span>}
                {p.processing_fee_rate > 0 && <span>প্রসেসিং ফি: {p.processing_fee_rate}%</span>}
                {p.insurance_premium_rate > 0 && <span>বীমা: {p.insurance_premium_rate}%</span>}
                {p.grace_period_installments > 0 && <span>গ্রেস: {p.grace_period_installments} কিস্তি</span>}
                <span>গ্যারান্টর: {p.guarantors_required}</span>
              </div>
              {p.eligibility_note && <p className="mt-2 text-xs text-amber-800">যোগ্যতা: {p.eligibility_note}</p>}
              {p.required_documents.length > 0 && <p className="text-xs text-muted-foreground">কাগজ: {p.required_documents.join(', ')}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
