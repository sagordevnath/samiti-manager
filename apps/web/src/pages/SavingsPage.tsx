import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import {
  savingsAccountCreateSchema,
  savingsProductCreateSchema,
  type SavingsAccountCreateInput,
  type SavingsProductCreateInput,
} from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

type ProductForm = Omit<SavingsProductCreateInput, 'orgId'>;
type AccountForm = Omit<SavingsAccountCreateInput, 'orgId'>;

const productTypes = [
  ['compulsory', 'Compulsory savings'],
  ['voluntary', 'Voluntary savings'],
  ['dps', 'DPS / recurring'],
  ['fixed', 'Fixed / FDR'],
  ['share', 'Share capital'],
] as const;

const productField = (register: UseFormRegister<ProductForm>, name: keyof ProductForm, label: string, type = 'text') => (
  <div className="space-y-1.5">
    <Label htmlFor={name}>{label}</Label>
    <Input id={name} type={type} step={type === 'number' ? 'any' : undefined} {...register(name as never)} />
  </div>
);

const accountField = (register: UseFormRegister<AccountForm>, name: keyof AccountForm, label: string, type = 'text') => (
  <div className="space-y-1.5">
    <Label htmlFor={name}>{label}</Label>
    <Input id={name} type={type} step={type === 'number' ? 'any' : undefined} {...register(name as never)} />
  </div>
);

export function SavingsPage() {
  const [section, setSection] = useState<'products' | 'accounts'>('products');
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const products = useQuery({
    queryKey: ['savings-products'],
    queryFn: () => api.get<{ items: Array<Record<string, string | number | boolean | null>> }>('/savings/products'),
  });
  const accounts = useQuery({
    queryKey: ['savings-accounts'],
    queryFn: () => api.get<{ items: Array<Record<string, unknown>> }>('/savings/accounts'),
  });

  const productForm = useForm<ProductForm>({
    resolver: zodResolver(savingsProductCreateSchema.omit({ orgId: true })),
    defaultValues: {
      productType: 'voluntary',
      interestRate: 0,
      compounding: 'none',
      minBalance: '0',
      withdrawalLimit: '0',
      withdrawalLimitPeriod: 'per_tx',
      maturityMonths: 0,
      earlyWithdrawalPenaltyRate: 0,
      autoLinkLoan: false,
      autoLinkWeeklyAmount: '0',
      requiresManagerApprovalAbove: '0',
      dormantAfterMonths: 6,
      isActive: true,
    },
  });
  const accountForm = useForm<AccountForm>({
    resolver: zodResolver(savingsAccountCreateSchema.omit({ orgId: true })),
    defaultValues: { openingBalance: '0', productId: '', memberId: '', branchId: '' },
  });

  const createProduct = useMutation({
    mutationFn: (body: ProductForm) => api.post('/savings/products', body),
    onSuccess: () => {
      productForm.reset();
      void queryClient.invalidateQueries({ queryKey: ['savings-products'] });
    },
  });
  const createAccount = useMutation({
    mutationFn: (body: AccountForm) => api.post('/savings/accounts', body),
    onSuccess: () => {
      accountForm.reset({ openingBalance: '0', productId: '', memberId: '', branchId: '' });
      void queryClient.invalidateQueries({ queryKey: ['savings-accounts'] });
    },
  });

  const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Unable to save');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Savings</h1>
        <p className="text-sm text-muted-foreground">Configure products and open one account per member per product.</p>
      </div>
      <div className="flex gap-2">
        <Button variant={section === 'products' ? 'default' : 'outline'} onClick={() => setSection('products')}>Products</Button>
        <Button variant={section === 'accounts' ? 'default' : 'outline'} onClick={() => setSection('accounts')}>Accounts</Button>
      </div>

      {section === 'products' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card>
            <CardHeader><CardTitle>Product setup</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={productForm.handleSubmit((values) => createProduct.mutate(values))} noValidate>
                <div className="grid gap-4 sm:grid-cols-2">
                  {productField(productForm.register, 'code', 'Code')}
                  {productField(productForm.register, 'name', 'Name')}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="productType">Type</Label>
                    <select id="productType" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...productForm.register('productType')}>
                      {productTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  {productField(productForm.register, 'interestRate', 'Interest rate (%)', 'number')}
                  {productField(productForm.register, 'minBalance', 'Minimum balance', 'number')}
                  {productField(productForm.register, 'compounding', 'Compounding')}
                  {productField(productForm.register, 'maturityMonths', 'Maturity (months)', 'number')}
                  {productField(productForm.register, 'withdrawalRules', 'Withdrawal rules')}
                  {productField(productForm.register, 'earlyWithdrawalPenaltyRate', 'Penalty (%)', 'number')}
                </div>
                {createProduct.isError && <p className="text-xs text-red-600">{errorMessage(createProduct.error)}</p>}
                <Button type="submit" disabled={createProduct.isPending}>
                  {createProduct.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save product
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Configured products</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm"><thead><tr className="border-b text-muted-foreground"><th className="p-2">Code</th><th className="p-2">Name</th><th className="p-2">Type</th><th className="p-2">Rate</th></tr></thead>
                  <tbody>{products.data?.items.map((product) => <tr className="border-b" key={String(product.id)}><td className="p-2">{String(product.code)}</td><td className="p-2">{String(product.name)}</td><td className="p-2">{String(product.product_type)}</td><td className="p-2">{String(product.interest_rate)}%</td></tr>)}</tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card>
            <CardHeader><CardTitle>Open savings account</CardTitle></CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={accountForm.handleSubmit((values) => createAccount.mutate(values))} noValidate>
                {accountField(accountForm.register, 'memberId', 'Member ID')}
                {accountField(accountForm.register, 'branchId', 'Branch ID')}
                <div className="space-y-1.5"><Label htmlFor="accountProduct">Product</Label><select id="accountProduct" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...accountForm.register('productId')}><option value="">Select product</option>{products.data?.items.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}</select></div>
                {accountField(accountForm.register, 'nomineeId', 'Nominee ID')}
                {accountField(accountForm.register, 'openingBalance', 'Opening balance', 'number')}
                {createAccount.isError && <p className="text-xs text-red-600">{errorMessage(createAccount.error)}</p>}
                <Button type="submit" disabled={createAccount.isPending}>Open account</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Accounts</CardTitle></CardHeader>
            <CardContent><div className="space-y-2 text-sm">{accounts.data?.items.map((account) => <div className="flex flex-wrap justify-between gap-2 rounded-md border p-3" key={String(account.id)}><span className="font-medium">{String(account.account_number)}</span><span>{String(account.status)}</span><span>BDT {String(account.balance)}</span></div>)}</div></CardContent>
          </Card>
        </div>
      )}
      {user?.role === 'member' && <p className="text-xs text-muted-foreground">Account opening is restricted to authorized staff.</p>}
    </div>
  );
}
