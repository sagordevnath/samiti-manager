import { useState, type FormEvent } from 'react';
import { AlertTriangle, Link2, RefreshCw, ServerCrash, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ApiProbe } from '@/lib/apiMode';
import { apiBaseUrlSource, apiUrlOverride, isDeployedOrigin, parseApiBaseUrl } from '@/lib/apiConfig';

/**
 * ── "Cannot reach the API" screen ────────────────────────────────────────────
 * A static bundle with no API address calls its own host for every request and
 * renders empty pages — the classic "deployed the site but there is no data"
 * failure. This screen replaces that silence with the resolved URL, the reason
 * the probe failed and the exact fix, so a misconfigured deploy is diagnosable
 * by whoever is looking at it.
 *
 * It can also accept a fix: the person looking at the page can point THIS
 * BROWSER at a reachable API. That is stored in localStorage — no rebuild, no
 * dashboard access — and is deliberately a per-browser repair, useful for the
 * operator of a demo. Visitors still need the deployment configured
 * (/config.js or VITE_API_URL); a browser override never ships to anyone else.
 */
export function ApiUnreachable({
  probe,
  onRetry,
  retrying,
  onSetApiUrl,
}: {
  probe: ApiProbe;
  onRetry: () => void;
  retrying: boolean;
  /** Persist (or, with null, clear) a per-browser API address and re-probe. */
  onSetApiUrl: (url: string | null) => void;
}) {
  const source = apiBaseUrlSource();
  const deployed = isDeployedOrigin();
  const override = apiUrlOverride();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseApiBaseUrl(value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    setValue('');
    onSetApiUrl(parsed.url);
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl space-y-5 rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700">
            <ServerCrash className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-bold">API সার্ভারে সংযোগ করা যাচ্ছে না</h1>
            <p className="text-sm text-muted-foreground">Cannot reach the API server</p>
          </div>
        </div>

        <dl className="space-y-2 rounded-md bg-muted/60 p-3 text-xs">
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-semibold">API base URL:</dt>
            <dd className="break-all font-mono">{probe.apiUrl}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-semibold">Source:</dt>
            <dd className="font-mono">
              {source === 'override' && 'this browser (localStorage) — set on this screen'}
              {source === 'runtime' && 'window.__SAMITY_CONFIG__ (public/config.js)'}
              {source === 'build' && 'VITE_API_URL (baked in at build time)'}
              {source === 'default' && 'same-origin default "/api/v1" — nothing was configured'}
            </dd>
          </div>
          {probe.status !== undefined && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">HTTP status:</dt>
              <dd className="font-mono">{probe.status}</dd>
            </div>
          )}
          {probe.error && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="font-semibold">Reason:</dt>
              <dd className="break-all font-mono">{probe.error}</dd>
            </div>
          )}
        </dl>

        {source === 'default' && deployed && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              This build was deployed <strong>without an API address</strong>, so it is asking the static host for data. Set{' '}
              <code className="font-mono">VITE_API_URL</code> in the host&apos;s environment variables and redeploy, or edit{' '}
              <code className="font-mono">/config.js</code> on the deployed site (no rebuild needed) — see{' '}
              <code className="font-mono">docs/deploy.md</code>.
            </p>
          </div>
        )}

        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>
            The API container must be running and reachable at <code className="font-mono">{probe.apiUrl}</code>.
          </li>
          <li>
            The API&apos;s <code className="font-mono">CORS_ORIGINS</code> must contain <code className="font-mono">{typeof window !== 'undefined' ? window.location.origin : 'this origin'}</code>.
          </li>
          <li>
            On the API host, <code className="font-mono">GET {probe.apiUrl}/health</code> should return{' '}
            <code className="font-mono">{'{ "service": "samity-api" }'}</code>.
          </li>
        </ol>

        <form onSubmit={submit} className="space-y-2 rounded-md border p-3">
          <label htmlFor="api-url-override" className="flex items-center gap-2 text-xs font-semibold">
            <Link2 className="h-3.5 w-3.5" />
            অন্য API ব্যবহার করুন (শুধু এই ব্রাউজারে) / Use a different API (this browser only)
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="api-url-override"
              // Deliberately text, not type="url": native validation blocks
              // submit on a bare host ("api.example.com") and its tooltip is
              // less useful than parseApiBaseUrl, which adds /api/v1 itself.
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              placeholder="https://samity-api.onrender.com/api/v1"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-invalid={error ? true : undefined}
              className="h-9 flex-1 text-xs"
            />
            <Button type="submit" variant="outline" size="sm" disabled={retrying}>
              সংযোগ পরীক্ষা করুন / Test
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-rose-700">
              {error}
            </p>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Saved in this browser only, and it wins over <code className="font-mono">/config.js</code> — other visitors still use
            the deployment&apos;s address. Your session token is sent to whatever address you enter, so only use one you trust.
            The full base URL including <code className="font-mono">/api/v1</code> is expected.
          </p>
        </form>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onRetry} disabled={retrying}>
            <RefreshCw className={retrying ? 'animate-spin' : undefined} />
            আবার চেষ্টা করুন / Retry
          </Button>
          {override && (
            <Button variant="ghost" onClick={() => onSetApiUrl(null)} disabled={retrying}>
              <Trash2 />
              এই ব্রাউজারের ঠিকানা মুছুন / Clear this browser&apos;s address
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
