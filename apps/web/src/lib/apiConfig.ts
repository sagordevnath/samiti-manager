/**
 * ── API base URL resolution ──────────────────────────────────────────────────
 * A static bundle cannot know which API host it was deployed against, so the
 * URL is resolved at RUNTIME first and only then falls back to the value baked
 * in at build time:
 *
 *   0. `localStorage['samity.apiUrl']`    — set from the unreachable-API screen
 *      by whoever is looking at the page. Repairs ONE browser with no rebuild
 *      and no host access; it is not a deployment fix.
 *   1. `window.__SAMITY_CONFIG__.apiUrl` — served from /config.js, editable on
 *      the host after deploy with no rebuild.
 *   2. `import.meta.env.VITE_API_URL`     — injected by Vite at build time
 *      (Netlify: Site settings → Environment variables → VITE_API_URL).
 *   3. `/api/v1`                          — same-origin (Vite dev proxy, or a
 *      reverse proxy that serves the SPA and the API from one origin).
 *
 * Getting this wrong is the #1 cause of "the deployed site shows no data":
 * without (1) or (2) the SPA calls its own static host, every request returns
 * index.html, and each page renders an empty shell.
 */

/** Shape written by `public/config.js`. */
export interface SamityRuntimeConfig {
  /** Absolute API base URL including the version prefix, e.g. https://api.example.com/api/v1 */
  apiUrl?: string;
}

declare global {
  interface Window {
    __SAMITY_CONFIG__?: SamityRuntimeConfig;
  }
}

/** Where the effective API URL came from — surfaced in diagnostics. */
export type ApiUrlSource = 'override' | 'runtime' | 'build' | 'default';

/** Where the per-browser override lives. Documented on the diagnostic screen. */
export const API_URL_OVERRIDE_KEY = 'samity.apiUrl';

/** Build-time value baked in by Vite. Empty string when unset. */
const BUILD_TIME_API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? '';

/** Trim whitespace and trailing slashes so `${base}${path}` never doubles up. */
function tidy(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * localStorage can throw (Safari private mode, disabled storage, opaque
 * origins). A missing override must degrade to the next source, never crash
 * the boot screen.
 */
function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The per-browser override, when someone set one from the diagnostic screen. */
export function apiUrlOverride(): string {
  return tidy(storage()?.getItem(API_URL_OVERRIDE_KEY) ?? '');
}

/** Persist (or, with an empty value, remove) the per-browser API override. */
export function setApiUrlOverride(url: string): void {
  const store = storage();
  if (!store) return;
  const clean = tidy(url);
  try {
    if (clean) store.setItem(API_URL_OVERRIDE_KEY, clean);
    else store.removeItem(API_URL_OVERRIDE_KEY);
  } catch {
    /* storage full or blocked — the probe will simply fail again */
  }
}

/** Forget the override and fall back to the deployment's configuration. */
export function clearApiUrlOverride(): void {
  setApiUrlOverride('');
}

/** The runtime override, when a host has written one into /config.js. */
function runtimeApiUrl(): string {
  if (typeof window === 'undefined') return '';
  return tidy(window.__SAMITY_CONFIG__?.apiUrl ?? '');
}

/**
 * Resolve the API base URL. Read on every call (not cached at module load) so
 * a host that injects /config.js late — or a test that sets it — is honoured.
 */
export function apiBaseUrl(): string {
  const override = apiUrlOverride();
  if (override) return override;
  const runtime = runtimeApiUrl();
  if (runtime) return runtime;
  if (BUILD_TIME_API_URL) return tidy(BUILD_TIME_API_URL);
  return '/api/v1';
}

/** Which layer supplied the URL (for the unreachable-API diagnostic screen). */
export function apiBaseUrlSource(): ApiUrlSource {
  if (apiUrlOverride()) return 'override';
  if (runtimeApiUrl()) return 'runtime';
  if (BUILD_TIME_API_URL) return 'build';
  return 'default';
}

export type ParsedApiUrl = { ok: true; url: string } | { ok: false; error: string };

/**
 * Validate and normalise an API address typed into the diagnostic screen.
 * The prefix is easy to forget and the failure is confusing (every request
 * 404s), so a bare host — or a host ending in `/api` — gets `/api/v1` added.
 */
export function parseApiBaseUrl(input: string): ParsedApiUrl {
  const raw = tidy(input);
  if (!raw) return { ok: false, error: 'API ঠিকানা লিখুন / Enter an API address' };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: 'পূর্ণ URL দিন, যেমন https://api.example.com/api/v1 / Enter a full http(s) URL' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'শুধু http বা https / http(s) addresses only' };
  }

  // A bare host (or a host ending in /api) is missing the version prefix.
  const path = parsed.pathname.replace(/\/+$/, '');
  const withPrefix = path === '' || path === '/api' ? '/api/v1' : path;
  return { ok: true, url: `${parsed.origin}${withPrefix}` };
}

/**
 * True when the API address was explicitly configured for this deployment
 * (or for this browser). A `false` here plus an unreachable API almost always
 * means the build was shipped without VITE_API_URL — the exact symptom to
 * surface in the UI.
 */
export function isApiUrlExplicitlyConfigured(): boolean {
  return apiBaseUrlSource() !== 'default';
}

/** True when the app is served over http(s) from a non-loopback host. */
export function isDeployedOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const { protocol, hostname } = window.location;
  if (protocol === 'file:') return false;
  return !/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(hostname);
}
