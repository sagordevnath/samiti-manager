import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  orgId: string | null;
  branchId: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: SessionUser | null;
  setSession: (payload: { accessToken: string; refreshToken: string; user: SessionUser }) => void;
  clear: () => void;
}

/** Persisted auth session (localStorage via zustand persist). */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: ({ accessToken, refreshToken, user }) => set({ accessToken, refreshToken, user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'samity-auth' },
  ),
);

const DEMO_SESSION = {
  accessToken: 'demo-token',
  refreshToken: 'demo-refresh',
  user: {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'admin@samity.test',
    role: 'super_admin',
    orgId: null,
    branchId: null,
  },
} satisfies { accessToken: string; refreshToken: string; user: SessionUser };

/**
 * Demo-mode bootstrap: seed a super_admin session at boot so the app opens
 * straight into the dashboard without a login wall. An existing persisted
 * session (e.g. a real Supabase login) is kept as-is.
 */
export function ensureDemoSession(): void {
  const state = useAuthStore.getState();
  if (state.accessToken && state.user) return;
  state.setSession(DEMO_SESSION);
}
