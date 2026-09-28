import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Bell,
  BookLock,
  FileText,
  Building2,
  ClipboardCheck,
  ClipboardList,
  HandCoins,
  HeartHandshake,
  HeartPulse,
  Gavel,
  Landmark,
  LayoutDashboard,
  Map,
  MapPinned,
  PiggyBank,
  ShieldCheck,
  Sprout,
  UserCog,
  Users,
  Wallet,
  ListChecks,
  SlidersHorizontal,
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
  HeartHandshake,
  HeartPulse,
  Gavel,
  BookLock,
  ListChecks,
  Sprout,
  ClipboardCheck,
  SlidersHorizontal,
  Bell,
  FileText,
  ShieldCheck,
}
export function Sidebar() {
  const { t } = useTranslation();
  const permissions = usePermissions();
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);

  const visibleGroups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item: NavItem) => permissions.includes(item.permission)),
  })).filter((g) => g.items.length > 0);

  return (
    <nav className="scroll-slim flex-1 space-y-5 overflow-y-auto px-3 py-3">
      {visibleGroups.map((group) => (
        <div key={group.key}>
          <p className="px-2 pb-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted-foreground/80">
            {t(`nav.${group.key}`)}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex touch-safe items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium transition-all duration-200',
                      isActive
                        ? 'bg-primary/10 font-semibold text-primary ring-1 ring-primary/15'
                        : 'text-foreground/75 hover:bg-muted/70 hover:text-foreground',
                    )
                  }
                >
                  {({ isActive }) => {
                    const Icon = ICONS[item.icon] ?? LayoutDashboard;
                    return (
                      <>
                        {isActive && (
                          <span
                            className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary"
                            aria-hidden
                          />
                        )}
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110',
                            isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                          )}
                        />
                        <span className="truncate">{t(`nav.${item.key}`)}</span>
                      </>
                    );
                  }}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
