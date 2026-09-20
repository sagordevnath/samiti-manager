import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { ensureDemoSession, useAuthStore } from '@/stores/auth';

/**
 * Demo mode gate: no session → seed a demo user instead of redirecting to
 * /login (the login route is disabled while demo mode is on). This also
 * removes any race between persist rehydration and first paint.
 */
export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);

  if (!accessToken) {
    ensureDemoSession();
  }

  return children ? <>{children}</> : <Outlet />;
}
