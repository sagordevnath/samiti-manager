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
 *
 * Scrolling model (one intentional behaviour):
 * - The document scrolls the page content only.
 * - The sidebar is `sticky` under the fixed topbar with its own bounded height
 *   and `overflow-y-auto`, so the menu scrolls independently and never drags
 *   the page or disappears behind it. `flex-col` + `min-h-0` on the nav is what
 *   actually bounds the scroll area — without it the nav grows past the shell
 *   and the two scroll positions fight each other.
 */
export function AppLayout() {
  const location = useLocation();

  return (
    <div className="min-h-dvh">
      <Topbar />

      {/* pt-14 clears the fixed topbar so page headings are never hidden. */}
      <div className="flex pt-14">
        {/* Persistent sidebar — desktop only; phones use the bottom dock. */}
        <aside className="glass glass-edge sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 flex-col overflow-hidden border-r lg:flex">
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
