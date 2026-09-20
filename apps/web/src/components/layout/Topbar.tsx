import { useTranslation } from 'react-i18next';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore, ensureDemoSession } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { useQueryClient } from '@tanstack/react-query';

/** Fixed topbar: hamburger, app title, digit toggle, language switch, user menu. */
export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { t, i18n } = useTranslation();
  const asciiDigits = useUiStore((s) => s.asciiDigits);
  const toggleDigits = useUiStore((s) => s.toggleDigits);
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();

  const switchLang = () => {
    const next = i18n.language?.startsWith('en') ? 'bn' : 'en';
    void i18n.changeLanguage(next);
    document.documentElement.lang = next;
  };

  // Demo mode: "sign out" resets to a fresh demo session instead of logging out.
  const signOut = () => {
    clear();
    ensureDemoSession();
    queryClient.clear();
    window.location.assign('/');
    window.location.reload();
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-2 border-b bg-card px-4">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick} aria-label={t('common.menu')}>
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-2">
        <span className="text-base font-bold text-teal-800">{t('app.name')}</span>
        <span className="hidden text-xs text-muted-foreground md:inline">· {t('app.tagline')}</span>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Bangla ↔ ASCII digit toggle */}
        <Button variant="outline" size="sm" onClick={toggleDigits} title="Toggle Bangla/ASCII digits">
          {asciiDigits ? '১২৩' : '123'}
        </Button>

        {/* Bangla / English language toggle */}
        <Button variant="outline" size="sm" onClick={switchLang}>
          {i18n.language?.startsWith('en') ? 'বাংলা' : 'English'}
        </Button>

        {user && (
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={signOut}>
              {t('auth.signOut')}
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
