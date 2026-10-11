export type ApiMode = 'demo' | 'live';

const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

let probe: Promise<ApiMode> | null = null;

/**
 * Ask the API whether it is serving the in-memory demo store (placeholder
 * Supabase env) or a real Supabase project. Cached for the tab's lifetime:
 * the mode never flips while the API process stays up.
 *
 * - demo → ProtectedRoute seeds the in-app demo session (no login wall).
 * - live → users sign in through /login with real Supabase credentials.
 */
export function apiMode(): Promise<ApiMode> {
  probe ??= fetch(`${API_URL}/health`)
    .then((res) => (res.ok ? (res.json() as Promise<{ mode?: string }>) : undefined))
    .then((body) => (body?.mode === 'demo' ? 'demo' : 'live'))
    .catch(() => 'live');
  return probe;
}
