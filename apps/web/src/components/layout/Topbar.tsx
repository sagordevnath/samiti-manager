import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore, ensureDemoSession } from '@/stores/auth';
import { useUiStore, type ThemePreference } from '@/stores/ui';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

const THEME_OPTIONS: ThemePreference[] = ['light', 'dark', 'system'];

/** Fixed glass topbar: hamburger, brand, digit/language toggles, theme, user menu. */
export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { t, i18n } = useTranslation();
  const asciiDigits = useUiStore((s) => s.asciiDigits);
  const toggleDigits = useUiStore((s) => s.toggleDigits);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Apply the persisted theme; 'system' follows prefers-color-scheme live.
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      if (theme === 'system') delete root.dataset.theme;
      else root.dataset.theme = theme;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  // Dismiss the user menu on outside pointer / Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const switchLang = () => {
    const next = i18n.language?.startsWith('en') ? 'bn' : 'en';
    void i18n.changeLanguage(next);
    document.documentElement.lang = next;
  };

  // Demo mode: "sign out" resets to a fresh demo session instead of logging out.
  const signOut = () => {
    setMenuOpen(false);
    clear();
    ensureDemoSession();
    queryClient.clear();
    window.location.assign('/');
    window.location.reload();
  };

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '?';

  return (
    <header className="glass glass-edge fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-1.5 border-b px-3 sm:px-4">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label={t('common.menu')}>
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex min-w-0 items-baseline gap-2">
        <span className="text-aurora truncate text-base font-extrabold tracking-tight">{t('app.name')}</span>
        <span className="hidden text-xs text-muted-foreground md:inline">· {t('app.tagline')}</span>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {/* Bangla ↔ ASCII digit toggle */}
        <button
          onClick={toggleDigits}
          title="Toggle Bangla/ASCII digits"
          className="flex h-9 min-w-9 items-center justify-center rounded-[var(--radius)] px-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {asciiDigits ? '১২৩' : '123'}
        </button>

        {/* Bangla / English language toggle */}
        <button
          onClick={switchLang}
          className="flex h-9 items-center justify-center rounded-[var(--radius)] px-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {i18n.language?.startsWith('en') ? 'বাংলা' : 'English'}
        </button>

        {user && (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={user.email}
              className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-indigo-500 text-xs font-bold text-white shadow-card ring-2 ring-background transition-transform hover:scale-105"
            >
              {initials}
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-background"
                aria-hidden
              />
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-orientation="vertical"
                className="absolute right-0 top-[calc(100%+10px)] w-60 overflow-hidden rounded-[var(--radius)] border bg-card shadow-float"
              >
                <div className="border-b px-3.5 py-3">
                  <p className="truncate text-sm font-semibold">{user.email}</p>
                  <p className="text-xs capitalize text-muted-foreground">{user.role.replace('_', ' ')}</p>
                </div>

                <div className="px-3.5 py-3">
                  <p className="pb-1.5 text-xs font-medium text-muted-foreground">{t('common.theme')}</p>
                  <div className="flex rounded-[var(--radius)] border p-0.5">
                    {THEME_OPTIONS.map((option) => (
                      <button
                        key={option}
                        role="menuitemradio"
                        aria-checked={theme === option}
                        onClick={() => setTheme(option)}
                        className={cn(
                          'flex-1 rounded-[calc(var(--radius)-2px)] px-1.5 py-1.5 text-xs font-medium capitalize transition-colors',
                          theme === option ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted',
                        )}
                      >
                        {t(`common.theme_${option}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t p-1.5">
                  <button
                    role="menuitem"
                    onClick={signOut}
                    className="flex w-full touch-safe items-center gap-2 rounded-[calc(var(--radius)-2px)] px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4" />
                    {t('auth.signOut')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
