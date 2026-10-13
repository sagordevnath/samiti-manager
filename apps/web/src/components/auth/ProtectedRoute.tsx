import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { ensureDemoSession, useAuthStore } from '@/stores/auth';
import { probeApi, resetApiProbe, type ApiProbe } from '@/lib/apiMode';
import { clearApiUrlOverride, setApiUrlOverride } from '@/lib/apiConfig';
import { ApiUnreachable } from './ApiUnreachable';

type Gate = 'probing' | 'ready' | 'login' | 'unreachable';

/** Branded boot screen — shown while the one-shot API probe is in flight. */
function BootSplash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background">
      <div className="text-3xl">🏛️</div>
      <div
        role="status"
        aria-live="polite"
        className="h-5 w-5 animate-spin rounded-full border-2 border-teal-700/30 border-t-teal-700"
      />
      <p className="text-xs text-muted-foreground">সংযোগ যাচাই করা হচ্ছে… / Checking API connection…</p>
    </div>
  );
}

/**
 * Auth gate, aware of the API's mode and reachability (GET /api/v1/health):
 * - Reachable API + a session token → render (live tokens and the demo token
 *   both flow through here).
 * - No token + reachable API in demo mode → seed the demo super_admin session
 *   (no login wall).
 * - No token + reachable live API → redirect to /login. Seeding the demo token
 *   against a real Supabase-backed API would 401 on every request.
 * - API unreachable → an explicit diagnostic screen. Previously this rendered
 *   nothing (a blank page) or bounced to a login form that could never work,
 *   which is indistinguishable from "the app has no data".
 */
export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [gate, setGate] = useState<Gate>('probing');
  const [probe, setProbe] = useState<ApiProbe | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // On the diagnostic screen the retry keeps the screen visible while the
    // fresh probe runs; a first boot shows the splash instead.
    setGate((current) => (current === 'unreachable' ? current : 'probing'));

    // Reachability is checked even when a session is already persisted. A
    // stored token used to short-circuit straight to the app, so a returning
    // user hitting a misconfigured deployment saw a fully rendered shell full
    // of zeros — indistinguishable from "the app has no data". The API is what
    // serves every number, so an unreachable API always explains itself first.
    void probeApi().then((result) => {
      if (cancelled) return;
      setRetrying(false);
      setProbe(result);
      if (!result.reachable) {
        setGate('unreachable');
        return;
      }
      if (accessToken) {
        setGate('ready');
        return;
      }
      if (result.mode === 'demo') {
        ensureDemoSession();
        setGate('ready');
        return;
      }
      setGate('login');
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, nonce]);

  const retry = useCallback(() => {
    resetApiProbe();
    setRetrying(true);
    setNonce((n) => n + 1);
  }, []);

  // Someone on the diagnostic screen can point this browser at a reachable API
  // (or forget it again). The override is per-browser, so it never changes what
  // visitors see — the deployment still needs /config.js or VITE_API_URL.
  const applyApiUrl = useCallback(
    (url: string | null) => {
      if (url) setApiUrlOverride(url);
      else clearApiUrlOverride();
      retry();
    },
    [retry],
  );

  if (gate === 'ready') return children ? <>{children}</> : <Outlet />;
  if (gate === 'unreachable' && probe) {
    return <ApiUnreachable probe={probe} onRetry={retry} retrying={retrying} onSetApiUrl={applyApiUrl} />;
  }
  if (gate === 'login') return <Navigate to="/login" replace />;
  return <BootSplash />;
}
