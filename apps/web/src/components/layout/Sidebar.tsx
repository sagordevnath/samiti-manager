import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  BookLock,
  Building2,
  ClipboardList,
  HandCoins,
  HeartPulse,
  Landmark,
  LayoutDashboard,
  Map,
  MapPinned,
  PiggyBank,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { NAV, type NavItem } from '@samity/shared';
import { usePermissions } from '@/lib/permissions';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/lib/utils';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  Users,
  PiggyBank,
  HandCoins,
  ClipboardList,
  Building2,
  UserCog,
  Landmark,
  BarChart3,
  Map,
  MapPinned,
  Wallet,
  HeartPulse,
  BookLock,
}

/** Sidebar rendered from the shared NAV tree, filtered by user permissions. */
export function Sidebar() {
  const { t } = useTranslation();
  const permissions = usePermissions();
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  const visibleGroups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item: NavItem) => permissions.includes(item.permission)),
  })).filter((g) => g.items.length > 0);

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
      {visibleGroups.map((group) => (
        <div key={group.key}>
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`nav.${group.key}`)}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-teal-50 text-teal-800' : 'text-foreground hover:bg-muted',
                    )
                  }
                >
                  {(() => {
                    const Icon = ICONS[item.icon] ?? LayoutDashboard;
                    return <Icon className="h-4 w-4 shrink-0" />;
                  })()}
                  {t(`nav.${item.key}`)}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
