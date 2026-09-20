import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { workingAreaSurveySchema, type WorkingAreaSurveyInput } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { applyDigitPreference } from '@/lib/digits';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/lib/utils';

interface VillageRow {
  id: string;
  village: string;
  village_bn: string | null;
  upazila: string;
  district: string;
  union: string | null;
  population: number | null;
  households: number | null;
  market_days: string | null;
  competitor_mfis: number;
  potential_score: number;
  branch_id: string | null;
}

const SCORE_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#16a34a'];

/** Working-area list + survey form + branch assignment. */
export function WorkingAreasPage() {
  const { t } = useTranslation();
  const asciiDigits = useUiStore((s) => s.asciiDigits);
  const queryClient = useQueryClient();
  const [filterUnassigned, setFilterUnassigned] = useState(false);

  const villages = useQuery({
    queryKey: ['working-areas', filterUnassigned],
    queryFn: () => api.get<{ items: VillageRow[] }>(`/org/working-areas${filterUnassigned ? '?unassigned=1' : ''}`),
  });

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<{ items: { id: string; name: string; name_bn: string | null; code: string; status: string }[] }>('/org/branches'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['working-areas'] });
    void queryClient.invalidateQueries({ queryKey: ['org-tree'] });
  };

  const survey = useForm<WorkingAreaSurveyInput>({
    resolver: zodResolver(workingAreaSurveySchema),
    defaultValues: { population: 0, households: 0, competitorMfis: 0, potentialScore: 3 },
  });

  const submitSurvey = useMutation({
    mutationFn: (values: WorkingAreaSurveyInput) => api.post('/org/working-areas', values),
    onSuccess: () => {
      survey.reset({ population: 0, households: 0, competitorMfis: 0, potentialScore: 3 });
      invalidate();
    },
  });

  const assign = useMutation({
    mutationFn: ({ id, branchId }: { id: string; branchId: string }) => api.post(`/org/working-areas/${id}/assign`, { branchId }),
    onSuccess: invalidate,
  });

  const field = (name: keyof WorkingAreaSurveyInput, label: string, type = 'text') => (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} type={type} step={type === 'number' ? 'any' : undefined} {...survey.register(name as never)} />
      {survey.formState.errors[name] && <p className="text-xs text-red-600">{String(survey.formState.errors[name]?.message ?? '')}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{t('org.workingAreasTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('org.workingAreasSubtitle')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setFilterUnassigned((v) => !v)}>
          {filterUnassigned ? t('org.showAll') : t('org.showUnassigned')}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('org.surveyForm')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={survey.handleSubmit((v) => submitSurvey.mutate(v))} className="grid gap-3 sm:grid-cols-3" noValidate>
            {field('village', t('org.village'))}
            {field('nameBn', t('org.villageBn'))}
            {field('division', t('org.division'))}
            {field('district', t('org.district'))}
            {field('upazila', t('org.upazila'))}
            {field('union', t('org.unionName'))}
            {field('population', t('org.population'), 'number')}
            {field('households', t('org.households'), 'number')}
            {field('marketDays', t('org.marketDays'))}
            {field('competitorMfis', t('org.competitorMfis'), 'number')}
            <div className="space-y-1.5">
              <Label htmlFor="potentialScore">{t('org.potentialScore')}</Label>
              <select
                id="potentialScore"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...survey.register('potentialScore')}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}/5
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={submitSurvey.isPending}>
                {submitSurvey.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('org.saveSurvey')}
              </Button>
            </div>

            {submitSurvey.isError && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 sm:col-span-3">
                {submitSurvey.error instanceof Error ? submitSurvey.error.message : t('common.error')}
              </p>
            )}
            {submitSurvey.isSuccess && (
              <p className="rounded-md bg-teal-50 px-3 py-2 text-xs text-teal-700 sm:col-span-3">{t('org.surveySaved')}</p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('org.villageList')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {villages.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
          {villages.data?.items.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2">
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SCORE_COLORS[v.potential_score - 1] ?? '#94a3b8' }} />
              <span className="text-sm font-medium">{v.village_bn ?? v.village}</span>
              <span className="text-xs text-muted-foreground">
                {v.upazila} · {applyDigitPreference(String(v.population ?? '—'), asciiDigits)} {t('org.populationShort')} ·{' '}
                {applyDigitPreference(String(v.households ?? '—'), asciiDigits)} {t('org.householdsShort')}
              </span>
              {v.market_days && <span className="text-xs text-muted-foreground">({v.market_days})</span>}
              <span className="ml-auto flex items-center gap-2">
                {v.branch_id ? (
                  <span className="rounded bg-teal-50 px-2 py-0.5 text-xs text-teal-700">
                    {branches.data?.items.find((b) => b.id === v.branch_id)?.code ?? t('org.assigned')}
                  </span>
                ) : (
                  <select
                    className={cn('rounded border border-input bg-background px-2 py-1 text-xs')}
                    value=""
                    onChange={(e) => e.target.value && assign.mutate({ id: v.id, branchId: e.target.value })}
                  >
                    <option value="">{t('org.assignTo')}</option>
                    {branches.data?.items.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.code} — {b.name_bn ?? b.name}
                      </option>
                    ))}
                  </select>
                )}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
