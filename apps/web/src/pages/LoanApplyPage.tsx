import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useMoneyFormatter } from '@/lib/digits';
import { normalizeProduct, type ProductRow } from '@/pages/LoanProductsPage';

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

export function LoanApplyPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fmt = useMoneyFormatter();

  const products = useQuery({
    queryKey: ['loans-products'],
    queryFn: async () => {
      const res = await api.get<{ items: Array<Record<string, unknown>> }>('/loans/products');
      return { items: res.items.map(normalizeProduct) };
    },
  });

  const [productId, setProductId] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [purpose, setPurpose] = useState('');
  const [termMonths, setTermMonths] = useState('');

  const product = products.data?.items.find((p) => p.id === productId) ?? null;
  const amountNum = Number(requestedAmount);
  const inBand = product !== null && requestedAmount !== '' && amountNum >= Number(product.min_amount) && amountNum <= Number(product.max_amount);

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/loans/applications', {
        memberId: '00000000-0000-4000-8000-0000000001a3', // demo member (Jahanara Parvin)
        productId,
        requestedAmount,
        purpose,
        ...(termMonths ? { termMonths: Number(termMonths) } : {}),
      }),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['loans-applications'] });
      void navigate(`/loans/${created.id}`);
    },
  });

  if (products.isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> লোড হচ্ছে…</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-teal-700">New application</p>
        <h1 className="text-2xl font-bold">ঋণের আবেদন</h1>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">১ · পণ্য নির্বাচন (Product)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {(products.data?.items ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { setProductId(p.id); setTermMonths(String(p.term_months)); }}
              className={`rounded-lg border p-3 text-left transition-all ${productId === p.id ? 'border-teal-500 bg-teal-50' : 'hover:border-teal-300'}`}
            >
              <p className="font-medium">{p.name_bn ?? p.name}</p>
              <p className="text-xs text-muted-foreground">
                {TYPE_BN[p.product_type] ?? p.product_type} · {fmt(p.min_amount)}–{fmt(p.max_amount)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.interest_rate}% {p.interest_method === 'flat' ? 'ফ্ল্যাট' : 'declining'} · {p.term_months} মাস · {p.installment_frequency}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      {product && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">২ · বিবরণ (Details)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {product.eligibility_note && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">যোগ্যতা: {product.eligibility_note}</p>
            )}
            {product.required_documents.length > 0 && (
              <p className="text-xs text-muted-foreground">প্রয়োজনীয় কাগজপত্র: {product.required_documents.join(', ')}</p>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>টাকার পরিমাণ ({fmt(product.min_amount)}–{fmt(product.max_amount)})</Label>
                <Input
                  type="number"
                  value={requestedAmount}
                  onChange={(e) => setRequestedAmount(e.target.value)}
                  placeholder="20000"
                />
                {requestedAmount !== '' && !inBand && (
                  <p className="text-xs text-red-600">পরিমাণ পণ্যের সীমার বাইরে</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>মেয়াদ (মাস)</Label>
                <Input type="number" value={termMonths} onChange={(e) => setTermMonths(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>উদ্দেশ্য</Label>
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="ব্যবসার মূলধন…" />
            </div>
            <p className="text-xs text-muted-foreground">
              গ্যারান্টর প্রয়োজন: {product.guarantors_required} · কিস্তি: {product.installment_frequency}
              {product.grace_period_installments > 0 ? ` · গ্রেস: ${product.grace_period_installments} কিস্তি` : ''}
            </p>

            <Button
              className="w-full bg-teal-600 hover:bg-teal-700"
              disabled={!inBand || purpose.trim().length < 3 || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              আবেদন জমা দিন
            </Button>
            {submit.isError && <p className="text-sm text-red-600">{(submit.error as Error).message}</p>}
          </CardContent>
        </Card>
      )}

      <Link to="/loans" className="block text-center text-sm text-muted-foreground hover:underline">তালিকায় ফিরে যান</Link>
    </div>
  );
}
