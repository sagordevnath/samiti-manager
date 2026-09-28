import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { useUiStore } from '@/stores/ui';
import { cn } from '@/lib/utils';

/** Mobile-first shell: glass topbar, slide-in drawer, aurora content area, bottom nav. */
export function AppLayout() {
  const { t } = useTranslation();
  const location = useLocation();
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
    <div className="min-h-dvh">
      <Topbar onMenuClick={() => setSidebarOpen(!sidebarOpen)} />

      <div className="flex">
        {/* Backdrop for the mobile drawer */}
        {sidebarOpen && !isDesktop && (
          <div
            className="fixed inset-0 top-14 z-30 bg-black/40 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}

        <aside
          className={cn(
            'glass fixed top-14 bottom-0 z-40 w-72 border-r shadow-float transition-transform duration-300 lg:sticky lg:top-14 lg:z-0 lg:h-[calc(100dvh-3.5rem)] lg:w-64 lg:translate-x-0 lg:shadow-none',
            sidebarOpen && !isDesktop ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 py-3 lg:hidden">
              <span className="text-sm font-semibold">{t('common.menu')}</span>
              <button aria-label="close menu" onClick={() => setSidebarOpen(false)} className="p-2">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar />
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-3 py-4 pb-28 sm:px-5 lg:px-8 lg:pb-8">
          {/* Keyed by path so the enter animation replays on navigation. */}
          <div key={location.pathname} className="page-enter mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
