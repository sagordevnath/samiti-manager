import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

/**
 * Guard against shipping a bundle with no API address.
 *
 * A static host answers /api/v1/health with 200 + index.html, so a deploy
 * without an address renders an empty shell that looks exactly like "the app
 * has no data" — and every page silently shows nothing. A production deploy to
 * a static host therefore has to be deliberate: either VITE_API_URL is set, or
 * the address is supplied another way and the deployer says so with
 * SAMITY_ALLOW_UNCONFIGURED_API=1 (a /config.js edited after deploy, or a
 * reverse proxy serving the SPA and the API from one origin).
 *
 * Only PRODUCTION deploys fail; PR/branch previews keep building so the red
 * "cannot reach the API" screen can be reviewed like any other change.
 */
function productionStaticHost(): string | null {
  // Netlify sets CONTEXT=production for the production branch only.
  if (process.env['NETLIFY'] === 'true') {
    return process.env['CONTEXT'] === 'production' ? 'Netlify' : null;
  }
  if (process.env['VERCEL'] === '1') {
    return process.env['VERCEL_ENV'] === 'production' ? 'Vercel' : null;
  }
  // Cloudflare Pages exposes no production flag, so every CF Pages build is
  // treated as a real deploy.
  if (process.env['CF_PAGES'] === '1') return 'Cloudflare Pages';
  return null;
}

const API_URL_HINT =
  'Set VITE_API_URL (e.g. https://your-api-host/api/v1) in the host\u2019s environment variables, ' +
  'or set SAMITY_ALLOW_UNCONFIGURED_API=1 when the address comes from somewhere else (a ' +
  '/config.js edited on the host, or a reverse proxy that serves the SPA and the API from ' +
  'one origin). See docs/deploy.md \u00a72.';

function guardMissingApiUrl(): Plugin {
  return {
    name: 'samity:api-url-guard',
    apply: 'build',
    buildStart() {
      const apiUrl = process.env['VITE_API_URL']?.trim();
      if (apiUrl) {
        // Wrong prefix = every request 404s against a healthy API.
        if (!/\/api\/v\d+$/.test(apiUrl.replace(/\/+$/, ''))) {
          this.warn(
            `VITE_API_URL="${apiUrl}" does not end in /api/vN — the client asks for ` +
              '${base}/health, so the version prefix must be included (https://your-api-host/api/v1).',
          );
        }
        return;
      }
      if (process.env['SAMITY_ALLOW_UNCONFIGURED_API'] === '1') return;
      const host = productionStaticHost();
      if (host) {
        this.error(
          `${host} production build without an API address: the deployed site would call its own ` +
            `static host for /api/v1 and render empty pages. ${API_URL_HINT}`,
        );
        return;
      }
      this.warn(
        'VITE_API_URL is not set \u2014 this build will use same-origin "/api/v1". ' +
          'That is correct only behind a dev proxy or a same-origin reverse proxy. ' +
          API_URL_HINT,
      );
    },
  };
}

export default defineConfig({
  plugins: [
    guardMissingApiUrl(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Samity Manager',
        short_name: 'Samity',
        description: 'সমিতি ও এনজিও-এমএফআই ব্যবস্থাপনা / Cooperative society & NGO-MFI management',
        lang: 'bn',
        dir: 'ltr',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // config.js carries the deployed API address, so it must never be
        // pinned inside the service-worker precache — otherwise an updated
        // config is not picked up until the next SW activation. Served
        // network-first instead so an edit on the host takes effect at once.
        globIgnores: ['**/config.js'],
        runtimeCaching: [
          {
            urlPattern: /\/config\.js$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'samity-runtime-config' },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    // Dev convenience: same-origin /api/v1 → local API, so no CORS setup is
    // needed while developing. Production uses the real gateway origin.
    // VITE_API_PROXY overrides the target (e.g. when 4000 is taken by another
    // project's dev server on a shared machine).
    proxy: process.env.NODE_ENV !== 'production' ? { '/api/v1': process.env['VITE_API_PROXY'] ?? 'http://localhost:4000' } : undefined,
  },
});
