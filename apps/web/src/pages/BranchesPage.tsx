import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Circle, Loader2, Plus } from 'lucide-react';
import type { BranchStatus } from '@samity/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import { applyDigitPreference } from '@/lib/digits';
import { useUiStore } from '@/stores/ui';

interface BranchRow {
  id: string;
  name: string;
  name_bn: string | null;
  code: string;
  district: string | null;
  status: BranchStatus;
  opening_date: string | null;
  address: string | null;
  gps_lat: string | null;
  gps_lng: string | null;
}

interface OpeningRow {
  id: string;
  branch_id: string;
  stage: 'proposed' | 'director_approved' | 'checklist_done' | 'activated' | 'rejected';
  checklist: { item: string; done: boolean }[];
}

const STATUS_BADGE: Record<BranchStatus, string> = {
  active: 'bg-teal-50 text-teal-700',
  planned: 'bg-amber-50 text-amber-700',
  closed: 'bg-red-50 text-red-700',
};

const STAGE_BN: Record<OpeningRow['stage'], string> = {
  proposed: 'প্রস্তাব',
  director_approved: 'অনুমোদিত',
  checklist_done: 'চেকলিস্ট সম্পন্ন',
  activated: 'সক্রিয়',
  rejected: 'বাতিল',
};

/** Branch list + opening-workflow controls. */
export function BranchesPage() {
  const { t } = useTranslation();
  const asciiDigits = useUiStore((s) => s.asciiDigits);
  const queryClient = useQueryClient();

  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: () => api.get<{ items: BranchRow[] }>('/org/branches'),
  });

  const openings = useQuery({
    queryKey: ['branch-openings'],
    queryFn: () => api.get<{ items: OpeningRow[] }>('/org/branch-openings'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['branches'] });
    void queryClient.invalidateQueries({ queryKey: ['branch-openings'] });
    void queryClient.invalidateQueries({ queryKey: ['org-tree'] });
  };

  const propose = useMutation({
    mutationFn: (branchId: string) =>
      api.post('/org/branch-openings', { branchId, proposalNote: 'এলাকা জরিপ অনুযায়ী শাখা খোলার প্রস্তাব।' }),
    onSuccess: invalidate,
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) =>
      api.post(`/org/branch-openings/${id}/decision`, { decision }),
    onSuccess: invalidate,
  });

  const checklist = useMutation({
    mutationFn: (id: string) =>
      api.post(`/org/branch-openings/${id}/checklist`, {
        items: [
          { item: 'office_rent', done: true },
          { item: 'staff_recruited', done: true },
          { item: 'cash_limit_set', done: true },
        ],
      }),
    onSuccess: invalidate,
  });

  const activate = useMutation({
    mutationFn: (id: string) => api.post(`/org/branch-openings/${id}/activate`),
    onSuccess: invalidate,
  });

  const closeBranch = useMutation({
    mutationFn: (id: string) => api.patch(`/org/branches/${id}`, { status: 'closed' }),
    onSuccess: invalidate,
    onError: (err) => {
      if (err instanceof ApiError) window.alert(err.message);
    },
  });

  const openingFor = (branchId: string) => openings.data?.items.find((o) => o.branch_id === branchId && o.stage !== 'activated' && o.stage !== 'rejected');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">{t('org.branchesTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('org.branchesSubtitle')}</p>
        </div>
        <Link to="/branches/new">
          <Button size="sm">
            <Plus className="h-4 w-4" /> {t('org.newBranch')}
          </Button>
        </Link>
      </div>

      {branches.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {branches.isError && <p className="text-sm text-red-600">{t('common.error')}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {branches.data?.items.map((b) => {
          const opening = openingFor(b.id);
          return (
            <Card key={b.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{b.name_bn ?? b.name}</CardTitle>
                  <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', STATUS_BADGE[b.status])}>{b.status}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{b.code}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {b.district ?? '—'}
                  {b.opening_date && ` · ${applyDigitPreference(b.opening_date, asciiDigits)}`}
                </p>

                {opening ? (
                  <div className="space-y-2 rounded-md border p-2">
                    <p className="text-xs font-semibold">{t('org.openingStage')}: {STAGE_BN[opening.stage]}</p>
                    <div className="flex flex-wrap gap-2">
                      {opening.stage === 'proposed' && (
                        <>
                          <Button size="sm" onClick={() => decide.mutate({ id: opening.id, decision: 'approve' })} disabled={decide.isPending}>
                            {t('org.approve')}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: opening.id, decision: 'reject' })} disabled={decide.isPending}>
                            {t('org.reject')}
                          </Button>
                        </>
                      )}
                      {opening.stage === 'director_approved' && (
                        <Button size="sm" onClick={() => checklist.mutate(opening.id)} disabled={checklist.isPending}>
                          {t('org.completeChecklist')}
                        </Button>
                      )}
                      {opening.stage === 'checklist_done' && (
                        <Button size="sm" onClick={() => activate.mutate(opening.id)} disabled={activate.isPending}>
                          {t('org.activate')}
                        </Button>
                      )}
                    </div>
                    <ul className="space-y-1">
                      {opening.checklist.map((c) => (
                        <li key={c.item} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          {c.done ? <CheckCircle2 className="h-3.5 w-3.5 text-teal-600" /> : <Circle className="h-3.5 w-3.5" />}
                          {t(`org.checklist.${c.item}`)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  b.status === 'planned' && (
                    <Button size="sm" variant="outline" onClick={() => propose.mutate(b.id)} disabled={propose.isPending}>
                      {t('org.proposeOpening')}
                    </Button>
                  )
                )}

                {b.status === 'active' && (
                  <Button size="sm" variant="ghost" className="text-red-600" onClick={() => closeBranch.mutate(b.id)} disabled={closeBranch.isPending}>
                    {t('org.closeBranch')}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
