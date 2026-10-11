import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight,
  Banknote,
  Building2,
  ClipboardList,
  HandCoins,
  MapPin,
  PiggyBank,
  TrendingDown,
  UserPlus,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useMoneyFormatter } from '@/lib/digits';
import { ROLE_LABELS, type Role } from '@samity/shared';

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
  samities?: number;
}

/** One KPI card. The whole card is a link so a click lands on the module that
 * owns the number — the dashboard becomes a navigation surface, not a dead end. */
function KpiCard({
  to,
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  to: string;
  label: string;
  value: string | number;
  hint: string;
  icon: typeof Users;
  tone: string;
}) {
  return (
    <Link
      to={to}
      aria-label={`${label} — ${hint}`}
      className="group block rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="h-full transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-float">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
          <span className={`flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius)-2px)] ${tone}`}>
            <Icon className="h-4 w-4" />
          </span>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            {hint} <ArrowUpRight className="h-3 w-3" />
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Landing page after login: clickable KPI cards + quick actions + connectivity. */
export function DashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const formatMoney = useMoneyFormatter();

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    retry: false,
  });

  // Live mode: one dedicated endpoint computes every KPI from the database.
  // Demo mode (or endpoint unavailable): fall back to list-endpoint counts so
  // every KPI still reflects the demo dataset.
  const summary = useQuery<Summary>({
    queryKey: ['dashboard-summary'],
    queryFn: async () => {
      try {
        return await api.get<Summary>('/dashboard/summary');
      } catch {
        const [members, savings, loans, branches] = await Promise.all([
          api.get<{ total: number }>('/members?pageSize=1').catch(() => null),
          api.get<{ items: Array<{ balance?: string | number }> }>('/savings/accounts').catch(() => null),
          api.get<{ items: Array<{ status?: string }> }>('/loans/applications').catch(() => null),
          api.get<{ items: unknown[] }>('/org/branches').catch(() => null),
        ]);
        const totalSavings = (savings?.items ?? []).reduce((t, a) => t + Number(a.balance ?? 0), 0);
        const activeLoans = (loans?.items ?? []).filter((l) => ['approved', 'disbursed', 'am_review'].includes(l.status ?? '')).length;
        return {
          totalMembers: members?.total ?? 0,
          totalSavings: totalSavings.toFixed(2),
          activeLoans,
          branches: branches?.items?.length ?? 0,
        };
      }
    },
    retry: false,
  });

  const apiOffline = health.isError;
  const roleLabel = user?.role ? ROLE_LABELS[user.role as Role] : null;

  const quickActions = [
    { to: '/members/new', label: t('dashboard.qaAdmission'), icon: UserPlus },
    { to: '/collection', label: t('dashboard.qaCollection'), icon: ClipboardList },
    { to: '/loans/new', label: t('dashboard.qaLoan'), icon: HandCoins },
    { to: '/samities', label: t('dashboard.qaCenter'), icon: MapPin },
    { to: '/delinquency', label: t('dashboard.qaOverdue'), icon: TrendingDown },
    { to: '/accounting', label: t('dashboard.qaAccounting'), icon: Banknote },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">{t('dashboard.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.welcome')}, {user?.email}
            {roleLabel ? ` · ${roleLabel.bn}` : ''}
          </p>
        </div>
        <Link
          to="/reports"
          className="text-xs font-medium text-primary hover:underline"
        >
          {t('dashboard.viewReports')} →
        </Link>
      </div>

      {apiOffline && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{t('dashboard.apiOffline')}</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          to="/members"
          label={t('dashboard.totalMembers')}
          value={summary.data?.totalMembers ?? '—'}
          hint={t('dashboard.openMembers')}
          icon={Users}
          tone="bg-teal-50 text-teal-700"
        />
        <KpiCard
          to="/savings"
          label={t('dashboard.totalSavings')}
          value={formatMoney(summary.data?.totalSavings ?? '0.00')}
          hint={t('dashboard.openSavings')}
          icon={PiggyBank}
          tone="bg-emerald-50 text-emerald-700"
        />
        <KpiCard
          to="/loans"
          label={t('dashboard.activeLoans')}
          value={summary.data?.activeLoans ?? '—'}
          hint={t('dashboard.openLoans')}
          icon={HandCoins}
          tone="bg-indigo-50 text-indigo-700"
        />
        <KpiCard
          to="/branches"
          label={t('dashboard.branches')}
          value={summary.data?.branches ?? '—'}
          hint={t('dashboard.openBranches')}
          icon={Building2}
          tone="bg-sky-50 text-sky-700"
        />
      </div>

      {/* Quick actions: the daily field workflow in one tap. */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('dashboard.quickActions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {quickActions.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="flex touch-safe flex-col items-center gap-1.5 rounded-[var(--radius)] border bg-card/60 px-2 py-3 text-center text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {health.data && (
        <p className="text-xs text-muted-foreground">
          API: {health.data.service} · v{health.data.version} · {health.data.status} · uptime {health.data.uptimeSec}s
        </p>
      )}
    </div>
  );
}
