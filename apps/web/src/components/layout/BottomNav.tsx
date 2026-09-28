import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClipboardList, HandCoins, LayoutDashboard, PiggyBank, Users } from 'lucide-react';
import { NAV } from '@samity/shared';
import { usePermissions } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Users,
  PiggyBank,
  ClipboardList,
  HandCoins,
};

/** Primary destinations surfaced as a thumb-friendly dock on phones (< lg). */
const PRIMARY_KEYS = ['dashboard', 'members', 'samities', 'collection', 'loans'];

export function BottomNav() {
  const { t } = useTranslation();
  const permissions = usePermissions();

  const items = NAV.flatMap((group) => group.items)
    .filter((item) => PRIMARY_KEYS.includes(item.key) && permissions.includes(item.permission))
    .slice(0, 5);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label={t('common.menu')}
      className="glass glass-edge fixed inset-x-3 bottom-0 z-40 mb-safe flex items-stretch justify-around rounded-t-[var(--radius)] border-x border-t px-1 pb-safe shadow-float lg:hidden"
    >
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'touch-safe flex min-w-[64px] flex-col items-center gap-1 px-2 pb-1 pt-2 text-[0.6875rem] font-medium transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="h-5 w-5" />
                <span className="max-w-full truncate">{t(`nav.${item.key}`)}</span>
                <span
                  className={cn('h-0.5 w-6 rounded-full transition-opacity', isActive ? 'bg-primary opacity-100' : 'opacity-0')}
                  aria-hidden
                />
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}
