import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ellipsis, LayoutDashboard } from 'lucide-react';
import { NAV } from '@samity/shared';
import { usePermissions } from '@/lib/permissions';
import { MobileMenuSheet } from './MobileMenuSheet';
import { ICONS } from './nav-icons';
import { cn } from '@/lib/utils';

/** Primary destinations surfaced as a thumb-friendly floating dock on phones (< lg). */
const PRIMARY_KEYS = ['dashboard', 'members', 'collection', 'loans'];

function isActivePath(pathname: string, to: string): boolean {
  if (to === '/') return pathname === '/';
  return pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * ── Fixed bottom navigation (mobile) ─────────────────────────────────────────
 * Modern thumb-zone dock: a floating glass bar pinned above the safe area with
 * the four highest-traffic destinations plus "আরও / More", which slides up the
 * complete permission-filtered menu as a bottom sheet (MobileMenuSheet).
 * Desktop keeps the persistent sidebar; this dock is hidden from `lg` up.
 */
export function BottomNav() {
  const { t } = useTranslation();
  const permissions = usePermissions();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const primary = NAV.flatMap((group) => group.items)
    .filter((item) => PRIMARY_KEYS.includes(item.key) && permissions.includes(item.permission))
    .slice(0, 4);

  // "More" carries the active state when the current route lives in the sheet.
  const moreActive = !primary.some((item) => isActivePath(location.pathname, item.to));

  return (
    <>
      <nav
        aria-label={t('common.menu')}
        className="glass glass-edge shadow-float fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 flex items-stretch justify-around rounded-2xl border px-1.5 py-1 lg:hidden"
      >
      {primary.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutDashboard;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            aria-current="page"
            className="touch-safe flex min-w-[56px] flex-1 flex-col items-center gap-0.5 rounded-xl px-1 pb-1 pt-1.5 transition-transform active:scale-95"
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200',
                    isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span
                  className={cn(
                    'max-w-full truncate text-[0.625rem] leading-none',
                    isActive ? 'font-semibold text-primary' : 'text-muted-foreground',
                  )}
                >
                  {t(`nav.${item.key}`)}
                </span>
              </>
            )}
          </NavLink>
        );
      })}

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-haspopup="dialog"
          className="touch-safe flex min-w-[56px] flex-1 flex-col items-center gap-0.5 rounded-xl px-1 pb-1 pt-1.5 transition-transform active:scale-95"
        >
          <span
            className={cn(
              'flex h-7 w-12 items-center justify-center rounded-full transition-colors duration-200',
              moreActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
            )}
          >
            <Ellipsis className="h-5 w-5" />
          </span>
          <span
            className={cn(
              'text-[0.625rem] leading-none',
              moreActive ? 'font-semibold text-primary' : 'text-muted-foreground',
            )}
          >
            {t('common.more')}
          </span>
        </button>
      </nav>

      {/* Sibling of the dock — a fixed sheet must not live inside the dock's
          backdrop-filter (glass), which would hijack its containing block. */}
      <MobileMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
