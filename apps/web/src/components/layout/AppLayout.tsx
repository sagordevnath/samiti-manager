import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/lib/utils';

/** Mobile-first shell: fixed topbar + slide-in drawer + content area. */
export function AppLayout() {
  const { t, i18n } = useTranslation();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Close drawer on route change to mobile; avoid scroll bleed.
  useEffect(() => {
    document.body.style.overflow = sidebarOpen && !isDesktop ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen, isDesktop]);

  return (
    <div className="min-h-dvh bg-background">
      <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex">
        {/* Backdrop for the mobile drawer */}
        {sidebarOpen && !isDesktop && (
          <div className="fixed inset-0 top-14 z-30 bg-black/40" onClick={() => setSidebarOpen(false)} aria-hidden />
        )}

        <aside
          className={cn(
            'fixed top-14 bottom-0 z-40 w-64 border-r bg-card transition-transform lg:sticky lg:top-14 lg:z-0 lg:translate-x-0',
            sidebarOpen && !isDesktop ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 py-3 lg:hidden">
              <span className="text-sm font-semibold">{t('common.menu')}</span>
              <button aria-label="close menu" onClick={() => setSidebarOpen(false)} className="p-1">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar />
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-4 pb-20 lg:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
