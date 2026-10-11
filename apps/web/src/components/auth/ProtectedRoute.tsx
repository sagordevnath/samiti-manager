import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { ensureDemoSession, useAuthStore } from '@/stores/auth';
import { apiMode } from '@/lib/apiMode';

/**
 * Auth gate, aware of the API's mode (GET /api/v1/health → mode):
 * - With a session token, always render (live tokens and the demo token both
 *   flow through here).
 * - No token + demo API → seed the demo super_admin session (no login wall).
 * - No token + live API → redirect to /login. Seeding the demo token against
 *   a real Supabase-backed API would 401 on every request (empty pages).
 */
export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [mode, setMode] = useState<'demo' | 'live' | null>(null);

  useEffect(() => {
    if (!accessToken) void apiMode().then(setMode);
  }, [accessToken]);

  if (accessToken) return children ? <>{children}</> : <Outlet />;

  // Wait for the one-shot mode probe before deciding.
  if (!mode) return null;

  if (mode === 'demo') {
    ensureDemoSession();
    return children ? <>{children}</> : <Outlet />;
  }

  return <Navigate to="/login" replace />;
}
