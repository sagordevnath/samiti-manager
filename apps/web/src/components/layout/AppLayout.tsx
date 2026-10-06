import { Outlet, useLocation } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * ── App shell ────────────────────────────────────────────────────────────────
 * Desktop (lg+): glass topbar over a persistent sidebar.
 * Mobile: the same topbar shrinks to brand + controls, and navigation moves to
 * the thumb zone — a fixed floating bottom dock (BottomNav) whose "More"
 * button slides up the full menu as a bottom sheet.
 */
export function AppLayout() {
  const location = useLocation();

  return (
    <div className="min-h-dvh">
      <Topbar />

      {/* pt-14 clears the fixed topbar so page headings are never hidden. */}
      <div className="flex pt-14">
        {/* Persistent sidebar — desktop only; phones use the bottom dock. */}
        <aside className="glass glass-edge sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 border-r lg:block">
          <Sidebar />
        </aside>

        <main className="min-w-0 flex-1 px-3 py-4 pb-32 sm:px-5 lg:px-8 lg:pb-8">
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
