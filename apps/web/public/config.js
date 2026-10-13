/* global window */
/**
 * ── Runtime configuration ────────────────────────────────────────────────────
 * Loaded by index.html BEFORE the app bundle, so it can override the API
 * address baked in at build time. Editing this file on the host (Netlify →
 * Deploys → Browse published deploy → edit /config.js) repoints the deployed
 * site at a different API with no rebuild and no redeploy.
 *
 * Resolution order in the app (see src/lib/apiConfig.ts):
 *   0. localStorage['samity.apiUrl']    ← set from the "cannot reach the API"
 *      screen; repairs ONE browser and WINS over this file, so a stale value
 *      there makes this file look ignored. Clear it on that screen.
 *   1. window.__SAMITY_CONFIG__.apiUrl  ← this file
 *   2. VITE_API_URL (Vite build-time env var)
 *   3. '/api/v1' (same origin)
 *
 * Leave apiUrl empty ('') to fall through to (2) / (3). Otherwise set the FULL
 * base URL including the /api/v1 prefix, e.g.:
 *
 *   window.__SAMITY_CONFIG__ = { apiUrl: 'https://samity-api.onrender.com/api/v1' };
 *
 * ⚠️ This file is public. Never put secrets (service_role keys, JWT secrets)
 *    in it — the browser can read everything here.
 */
window.__SAMITY_CONFIG__ = {
  apiUrl: '',
};
