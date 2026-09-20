# Samity Manager — run doc (dev preview)

## 1. Reproduce the uncommitted artifacts a fresh checkout needs

```bash
# a) dependencies (npm workspaces)
npm install --no-audit --no-fund

# b) shared package build output — apps/web and apps/api import @samity/shared
#    which resolves to packages/shared/dist (see packages/shared/package.json exports)
npm run build:shared

# c) environment: no .env is required to boot the API (Zod-validated defaults
#    point at placeholder Supabase values). For real Supabase:
cp .env.example .env   # then fill in SUPABASE_* from the dashboard
```

Nothing else is machine-specific: no secret env files, no generated clients.
Supabase migrations are plain SQL in `supabase/migrations/` (apply via
`npm run db:migrate` only when a real project is configured).

## 2. Run the servers

API (Express, pino) — port **4000**:

```bash
npm run dev:api
```

Web (Vite + Tailwind v4 + PWA) — port **5173**; when 5173/4000 are busy,
override the port without editing files:

```bash
npm run dev:web -- --port 5174 --strictPort
```

`apps/web/vite.config.ts` proxies same-origin `/api/v1/*` → `http://localhost:4000`
in dev only, so the UI talks to the API with no CORS configuration.
If the API is offline the dashboard still renders with a demo-mode banner.

Health check: `curl http://localhost:4000/api/v1/health` → `{"status":"ok","service":"samity-api","version":"v1"}`.

## 3. Demo mode (current default)

The app boots with an auto-seeded demo session (`admin@samity.test`, role
`super_admin`) — no login required; every route is directly accessible.
Implemented in `apps/web/src/stores/auth.ts` (`ensureDemoSession`) and
`ProtectedRoute` (seeds instead of redirecting); the `/login` route is
commented out of `App.tsx`. To restore the real login flow: re-add
`<Route path="/login" element={<LoginPage />} />`, revert `ProtectedRoute`,
and remove the `ensureDemoSession()` call in `main.tsx`. "Sign out" in the
topbar resets to a fresh demo session.
