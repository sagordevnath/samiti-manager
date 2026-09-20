import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useMoneyFormatter } from '@/lib/digits';

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  uptimeSec: number;
}

interface Summary {
  totalMembers: number;
  totalSavings: string;
  activeLoans: number;
  branches: number;
}

/** Landing page after login: KPI cards + API connectivity indicator. */
export function DashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const formatMoney = useMoneyFormatter();

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    retry: false,
  });

  // Placeholder summary until members/savings modules are built.
  const summary = useQuery<Summary>({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      // Replace with /dashboard/summary endpoint when backend module lands.
      const data = await api.get<{ items: unknown[]; total: number }>('/members?pageSize=1').catch(() => null);
      return {
        totalMembers: data?.total ?? 0,
        totalSavings: '0.00',
        activeLoans: 0,
        branches: 0,
      };
    },
    retry: false,
  });

  const apiOffline = health.isError;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{t('dashboard.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.welcome')}, {user?.email}
        </p>
      </div>

      {apiOffline && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{t('dashboard.apiOffline')}</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t('dashboard.totalMembers')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.data?.totalMembers ?? '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t('dashboard.totalSavings')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatMoney(summary.data?.totalSavings ?? '0.00')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t('dashboard.activeLoans')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.data?.activeLoans ?? '—'}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">{t('dashboard.branches')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{summary.data?.branches ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      {health.data && (
        <p className="text-xs text-muted-foreground">
          API: {health.data.service} · v{health.data.version} · {health.data.status} · uptime {health.data.uptimeSec}s
        </p>
      )}
    </div>
  );
}
