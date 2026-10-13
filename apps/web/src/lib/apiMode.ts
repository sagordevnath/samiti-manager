/**
 * ── API mode & reachability probe ────────────────────────────────────────────
 * One call to `GET /health` answers two questions:
 *
 *   1. is the API reachable at all, and
 *   2. is it serving the in-memory demo store or a real Supabase project?
 *
 * - demo → ProtectedRoute seeds the in-app demo session (no login wall).
 * - live → users sign in through /login with real Supabase credentials.
 * - unreachable → the UI shows an explicit diagnostic screen instead of the
 *   silent empty pages that a misconfigured deploy used to produce.
 */
import { apiBaseUrl } from '@/lib/apiConfig';

export type ApiMode = 'demo' | 'live';

export interface ApiProbe {
  /** Which store the API is serving. Meaningless when `reachable` is false. */
  mode: ApiMode;
  /** True only when /health answered with the samity-api payload. */
  reachable: boolean;
  /** The exact base URL that was probed — shown in the diagnostic screen. */
  apiUrl: string;
  /** Transport or payload failure, when `reachable` is false. */
  error?: string;
  /** HTTP status when the host answered but not like the API. */
  status?: number;
}

/** Give up after 10s: an unreachable host must not hang the boot screen. */
const PROBE_TIMEOUT_MS = 10_000;

/**
 * Free container hosts (Render's free plan and friends) stop an idle instance
 * and hold the next request at the edge for up to a minute while it boots.
 * From here that looks like a TIMEOUT, whereas a genuinely dead host refuses
 * the connection at once — so one timeout earns one longer attempt instead of
 * showing "cannot reach the API" for an API that is merely waking up.
 */
const COLD_START_TIMEOUT_MS = 45_000;

let probe: Promise<ApiProbe> | null = null;

/** One attempt. `timedOut` tells a sleeping host apart from an unreachable one. */
async function probeOnce(
  apiUrl: string,
  timeoutMs: number,
  coldStart: boolean,
): Promise<{ result: ApiProbe; timedOut: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    // A static host rewrites unknown paths to index.html, so a 200 alone
    // proves nothing — the payload must look like samity-api's health body.
    const body = (await res.json().catch(() => undefined)) as
      | { status?: string; service?: string; mode?: string }
      | undefined;
    if (!res.ok || body?.service !== 'samity-api') {
      return {
        timedOut: false,
        result: {
          mode: 'live',
          reachable: false,
          apiUrl,
          status: res.status,
          error: body
            ? `Unexpected response from ${apiUrl}/health (HTTP ${res.status}) — this looks like a static host, not the API.`
            : `${apiUrl}/health did not return JSON (HTTP ${res.status}).`,
        },
      };
    }
    return {
      timedOut: false,
      result: { mode: body.mode === 'demo' ? 'demo' : 'live', reachable: true, apiUrl, status: res.status },
    };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return {
      timedOut: aborted,
      result: {
        mode: 'live',
        reachable: false,
        apiUrl,
        error: aborted
          ? `Timed out after ${timeoutMs / 1000}s waiting for ${apiUrl}/health` +
            (coldStart ? ' — a free-tier API host may still be starting; try again in a moment.' : '')
          : `Cannot reach ${apiUrl}/health (${err instanceof Error ? err.message : String(err)})`,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe the API once per tab and cache the result — the mode never flips while
 * the API process stays up. Call `resetApiProbe()` to force a fresh attempt
 * (used by the diagnostic screen's retry button).
 */
export function probeApi(): Promise<ApiProbe> {
  probe ??= (async (): Promise<ApiProbe> => {
    const apiUrl = apiBaseUrl();
    const first = await probeOnce(apiUrl, PROBE_TIMEOUT_MS, false);
    if (!first.timedOut) return first.result;
    const waking = await probeOnce(apiUrl, COLD_START_TIMEOUT_MS, true);
    return waking.result;
  })();
  return probe;
}

/** Drop the cached probe so the next call retries (diagnostic screen retry). */
export function resetApiProbe(): void {
  probe = null;
}

/**
 * Backwards-compatible convenience wrapper: the module the API is serving.
 * An unreachable API reports 'live', which routes the user to /login — the
 * reachability screen (ProtectedRoute) is what explains the failure.
 */
export function apiMode(): Promise<ApiMode> {
  return probeApi().then((p) => p.mode);
}
