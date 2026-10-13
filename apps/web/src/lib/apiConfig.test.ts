import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  API_URL_OVERRIDE_KEY,
  apiBaseUrl,
  apiBaseUrlSource,
  clearApiUrlOverride,
  isApiUrlExplicitlyConfigured,
  parseApiBaseUrl,
  setApiUrlOverride,
} from './apiConfig';

/**
 * The resolution order is what makes a deployed static build work at all:
 * /config.js → VITE_API_URL → same-origin /api/v1. Getting it wrong is the
 * "deployed the site but it shows no data" failure, so pin it.
 */
describe('apiBaseUrl resolution', () => {
  afterEach(() => {
    delete window.__SAMITY_CONFIG__;
    window.localStorage.clear();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('falls back to the same-origin default when nothing is configured', () => {
    expect(apiBaseUrl()).toBe('/api/v1');
    expect(apiBaseUrlSource()).toBe('default');
    expect(isApiUrlExplicitlyConfigured()).toBe(false);
  });

  it('lets the deployed /config.js override the build-time value', () => {
    window.__SAMITY_CONFIG__ = { apiUrl: 'https://api.example.com/api/v1/' };

    // Trailing slash trimmed so `${base}${path}` never doubles up.
    expect(apiBaseUrl()).toBe('https://api.example.com/api/v1');
    expect(apiBaseUrlSource()).toBe('runtime');
    expect(isApiUrlExplicitlyConfigured()).toBe(true);
  });

  it('ignores a blank runtime value and falls through', () => {
    window.__SAMITY_CONFIG__ = { apiUrl: '   ' };
    expect(apiBaseUrl()).toBe('/api/v1');
    expect(apiBaseUrlSource()).toBe('default');
  });

  it('prefers /config.js over VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', 'https://build.example.com/api/v1');
    vi.resetModules();
    const mod = await import('./apiConfig');

    expect(mod.apiBaseUrl()).toBe('https://build.example.com/api/v1');
    expect(mod.apiBaseUrlSource()).toBe('build');

    window.__SAMITY_CONFIG__ = { apiUrl: 'https://runtime.example.com/api/v1' };
    expect(mod.apiBaseUrl()).toBe('https://runtime.example.com/api/v1');
    expect(mod.apiBaseUrlSource()).toBe('runtime');
  });

  it('lets a browser override win over /config.js, and forgets it on clear', () => {
    window.__SAMITY_CONFIG__ = { apiUrl: 'https://config.example.com/api/v1' };

    // Set from the diagnostic screen: repairs this browser without a rebuild.
    setApiUrlOverride('https://mine.example.com/api/v1/');
    expect(window.localStorage.getItem(API_URL_OVERRIDE_KEY)).toBe('https://mine.example.com/api/v1');
    expect(apiBaseUrl()).toBe('https://mine.example.com/api/v1');
    expect(apiBaseUrlSource()).toBe('override');

    clearApiUrlOverride();
    expect(apiBaseUrl()).toBe('https://config.example.com/api/v1');
    expect(apiBaseUrlSource()).toBe('runtime');
  });

  it('normalises a typed API address, adding the missing version prefix', () => {
    expect(parseApiBaseUrl(' https://api.example.com/api/v1/ ')).toEqual({
      ok: true,
      url: 'https://api.example.com/api/v1',
    });
    // A bare host, or one that stops at /api, is the classic mistake: every
    // request would hit /health instead of /api/v1/health.
    expect(parseApiBaseUrl('https://api.example.com')).toEqual({ ok: true, url: 'https://api.example.com/api/v1' });
    expect(parseApiBaseUrl('https://api.example.com/api')).toEqual({ ok: true, url: 'https://api.example.com/api/v1' });
  });

  it('rejects an address that is not a usable http(s) URL', () => {
    expect(parseApiBaseUrl('')).toMatchObject({ ok: false });
    expect(parseApiBaseUrl('api.example.com')).toMatchObject({ ok: false });
    expect(parseApiBaseUrl('ftp://api.example.com')).toMatchObject({ ok: false });
    expect(parseApiBaseUrl('/api/v1')).toMatchObject({ ok: false });
  });
});
