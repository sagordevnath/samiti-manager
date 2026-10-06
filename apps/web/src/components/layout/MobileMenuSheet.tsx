import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, LayoutDashboard, X } from 'lucide-react';
import { NAV, type NavItem } from '@samity/shared';
import { usePermissions } from '@/lib/permissions';
import { ICONS } from './nav-icons';
import { cn } from '@/lib/utils';

interface MobileMenuSheetProps {
  open: boolean;
  onClose: () => void;
}

/**
 * ── Mobile menu as a modal bottom sheet ─────────────────────────────────────
 * The phone counterpart of the desktop sidebar: the complete permission-
 * filtered navigation slides up from the bottom dock's "আরও / More" button.
 * Closes on selection, backdrop tap or Escape; locks body scroll while open;
 * respects the safe-area inset on notched devices.
 */
export function MobileMenuSheet({ open, onClose }: MobileMenuSheetProps) {
  const { t } = useTranslation();
  const permissions = usePermissions();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const visibleGroups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((item: NavItem) => permissions.includes(item.permission)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="lg:hidden">
      {/* Backdrop */}
      <div
        className="fade-enter fixed inset-0 z-[60] bg-black/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('common.menu')}
        className="glass glass-edge sheet-enter shadow-float fixed inset-x-0 bottom-0 z-[60] flex max-h-[82dvh] flex-col overflow-hidden rounded-t-[1.25rem] border-x border-t"
      >
        {/* Drag handle */}
        <span
          className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30"
          aria-hidden
        />

        <div className="flex items-center justify-between px-4 pb-1 pt-4">
          <p className="text-sm font-bold">{t('common.menu')}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="touch-safe flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="scroll-slim overflow-y-auto px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {visibleGroups.map((group) => (
            <div key={group.key} className="pt-2">
              <p className="px-2 pb-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted-foreground/80">
                {t(`nav.${group.key}`)}
              </p>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const Icon = ICONS[item.icon] ?? LayoutDashboard;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cn(
                            'group flex touch-safe items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-primary/10 font-semibold text-primary ring-1 ring-primary/15'
                              : 'text-foreground/75 hover:bg-muted/70 hover:text-foreground',
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              className={cn(
                                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                                isActive
                                  ? 'bg-primary/15 text-primary'
                                  : 'bg-muted/60 text-muted-foreground group-hover:text-foreground',
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="flex-1 truncate">{t(`nav.${item.key}`)}</span>
                            <ChevronRight
                              className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5"
                              aria-hidden
                            />
                          </>
                        )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </div>
  );
}
