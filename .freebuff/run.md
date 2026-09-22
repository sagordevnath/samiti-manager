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

API (Express, pino) — port **4000**. IMPORTANT on this machine: the desktop
sandbox exports `PORT=0`, which fails the API's Zod env validation. The
detached launchers force it:

```bash
# detached (used by the preview):
.freebuff/start-api.cmd   # sets PORT=4000, cd apps/api, npm run dev
.freebuff/start-web.cmd   # vite on 127.0.0.1:5174 (preview probe needs IPv4)

# foreground:
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

## 4. Loan disbursement (modules 0016–0019)

Two-step control: the accountant PATCHes `/api/v1/loans/disbursements/:id`
(checks, mode, planned date — no money moves), then the branch manager POSTs
`.../authorize` (evidence + cash limit + journal + loan number + stored
schedule + passbook + SMS + 15-day utilization visit, all in one logical
transaction). Same-day rollback: POST `.../cancel` with a ≥10-char reason
posts a reversal journal and reverts the loan to `approved`.

Printable artifacts: `/loans/disbursements/:id/voucher` and
`/loans/disbursements/:id/agreement` (Bangla, `window.print()`).

Verification walkthrough (demo API, all on port 4000):

```bash
curl -s -H "Authorization: Bearer demo-token" \
  http://localhost:4000/api/v1/loans/disbursements/queue
# prepare (accountant) → authorize (manager) → cancel (same day) → journals
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/loans/journals
```

## 5. Collection & Repayment (module 0020–0021)

Per-meeting collection sheets (`/collection`, mobile-first + offline):
entries are queued in IndexedDB with uuid idempotency keys and flushed to
`POST /api/v1/collection/sync` (per-item posted | duplicate | failed).
Payment allocation (overdue → installment → savings → advance) lives in
`packages/shared/src/collection-engine.ts` and runs server-side at posting.

Officer cash handover (`/collection/cash`): cash-in-hand tally, submit with
counted amount, accountant confirm/reject; shortage/excess stored on the row.

Printable/WhatsApp receipts: `/collection/receipt/:idempotencyKey`.

```bash
curl -s -H "Authorization: Bearer demo-token" \
  "http://localhost:4000/api/v1/collection/sheet?branchId=00000000-0000-4000-8000-0000000000b1"
curl -s -H "Authorization: Bearer demo-token" \
  "http://localhost:4000/api/v1/collection/cash-summary?date=$(date -u +%F)"
```
