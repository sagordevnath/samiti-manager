import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { branchCreateSchema, type BranchCreateInput } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';

/** Create-branch form: profile + GPS. React-hook-form + shared Zod schema. */
export function BranchFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const areas = useQuery({
    queryKey: ['areas'],
    queryFn: () => api.get<{ items: { id: string; name: string; name_bn: string | null; code: string }[] }>('/org/areas'),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<BranchCreateInput>({
    resolver: zodResolver(branchCreateSchema),
    defaultValues: { openingDate: new Date().toISOString().slice(0, 10) },
  });

  const create = useMutation({
    mutationFn: (values: BranchCreateInput) => api.post('/org/branches', values),
    onSuccess: () => {
      void navigate('/branches');
    },
    onError: (err) => {
      setError('root', { message: err instanceof Error ? err.message : t('common.error') });
    },
  });

  const onSubmit = (values: BranchCreateInput) => create.mutate(values);

  const field = (name: keyof BranchCreateInput, label: string, type = 'text', required = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} type={type} step={type === 'number' ? 'any' : undefined} {...register(name as never, { required })} />
      {errors[name] && <p className="text-xs text-red-600">{String(errors[name]?.message ?? '')}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <h1 className="text-xl font-bold">{t('org.newBranch')}</h1>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('org.branchProfile')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              {field('name', t('org.nameEn'))}
              {field('nameBn', t('org.nameBn'))}
              {field('code', t('org.branchCode'))}
              <div className="space-y-1.5">
                <Label htmlFor="areaId">{t('org.area')}</Label>
                <select
                  id="areaId"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  {...register('areaId', { required: true })}
                >
                  <option value="">{t('org.selectArea')}</option>
                  {areas.data?.items.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name_bn ?? a.name} ({a.code})
                    </option>
                  ))}
                </select>
                {errors['areaId'] && <p className="text-xs text-red-600">{t('org.selectArea')}</p>}
              </div>
              {field('openingDate', t('org.openingDate'), 'date', true)}
              {field('address', t('org.address'))}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="gpsLat">{t('org.gpsLat')}</Label>
                  <Input id="gpsLat" type="number" step="any" {...register('gps.lat' as never, { valueAsNumber: true })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="gpsLng">{t('org.gpsLng')}</Label>
                  <Input id="gpsLng" type="number" step="any" {...register('gps.lng' as never, { valueAsNumber: true })} />
                </div>
              </div>
            </div>

            {errors.root && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{errors.root.message}</p>}

            <Button type="submit" className="w-full" disabled={isSubmitting || create.isPending}>
              {(isSubmitting || create.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('org.createBranch')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
