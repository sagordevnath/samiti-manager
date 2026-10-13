# Samity Manager

Role-based management system for Bangladeshi cooperative societies (সমিতি) and
NGO-MFIs — savings, shares, loans, collection, accounting, HR, MIS and
compliance, with a Bangla-first interface.

**Stack:** Vite + React + TypeScript · Node.js + Express + TypeScript ·
Supabase (Postgres, Auth, RLS) · free tiers only.

| | |
| --- | --- |
| API routers | 44 (`apps/api/src/routes/`) |
| Web pages | 49 (`apps/web/src/pages/`) |
| DB migrations | 58 (`supabase/migrations/`) |
| Runtime | Node.js **22+** (`@supabase/supabase-js` requires it) |
| Tests | 770 across api / web / shared |

---

## Quick start (5 minutes, no cloud account needed)

```bash
npm install
npm run dev:local
```

- Web: <http://localhost:5173> (loads in Bangla)
- API: <http://localhost:4000/api/v1/health>

With no Supabase credentials configured, the API serves an **in-memory sample
dataset** and the app opens straight into the dashboard — no login, no
database. That is demo mode; see [docs/demo-data.md](docs/demo-data.md).

### Run against a real database

1. Create a free [Supabase](https://supabase.com) project.
2. Copy `.env.example` → `.env` and fill in `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` (**service_role**, not the anon key!) and
   `SUPABASE_JWT_SECRET`.
3. Apply migrations and seed the demo org:

   ```bash
   SUPABASE_DB='postgresql://…' npm run db:migrate
   npm run db:seed
   ```

4. `npm run dev:local`, then sign in with `admin@samity.test / Samity@2026`.

The API switches between demo and live data automatically (`DEMO_MODE=auto`);
the boot log states which mode it chose.

---

## Deploying

Two pieces: a **static client** and a **Docker API**.

```bash
docker build -t samity-api .
docker run -d -p 4000:4000 \
  -e NODE_ENV=production \
  -e CORS_ORIGINS=https://YOUR-SITE.netlify.app \
  -e DEMO_MODE=force \        # sample data, no database — omit for live
  samity-api
```

For the client, `netlify.toml` is committed: import the repo into Netlify and
set `VITE_API_URL=https://YOUR-API-HOST/api/v1`. **Without that variable the
deployed site cannot reach any API and renders empty pages** — the app shows a
diagnostic screen explaining exactly this, and
**[docs/deploy.md](docs/deploy.md)** covers the full runbook, the env-var table
and the troubleshooting matrix.

---

## Documentation

| Document | Contents |
| -------- | -------- |
| [docs/deploy.md](docs/deploy.md) | Production deployment: Netlify + Docker + Supabase, verification commands, troubleshooting |
| [docs/go-live.md](docs/go-live.md) | Release checklist and staff training plan |
| [docs/demo-data.md](docs/demo-data.md) | Demo dataset reference and how to load it |
| [docs/infisical.md](docs/infisical.md) | Optional secret management for teams using Infisical |
| [docs/ui-crud-coverage.md](docs/ui-crud-coverage.md) | Map of every API endpoint against the screen that uses it |
| [docs/backlog.md](docs/backlog.md) | Prioritised remaining work with review evidence |

---

## Repository layout

```
samity-manager/
├── apps/
│   ├── api/                     # Express API
│   │   ├── src/
│   │   │   ├── middleware/      # auth (JWT + JWKS), error, validate, security
│   │   │   ├── lib/             # logger, supabase client, per-module stores
│   │   │   ├── routes/          # 44 routers (demo + Supabase-backed per module)
│   │   │   ├── app.ts           # express factory (mode-aware route mounting)
│   │   │   ├── env.ts           # zod-validated env + origin allow-list
│   │   │   └── server.ts        # entrypoint, boot banner, graceful shutdown
│   │   └── Dockerfile → ../../Dockerfile (repo root, workspace build)
│   └── web/                     # Vite SPA (PWA)
│       ├── public/config.js     # runtime API URL — editable after deploy
│       ├── src/
│       │   ├── components/      # ui/, layout/, auth/ (ProtectedRoute, ApiUnreachable)
│       │   ├── lib/             # api client, apiConfig, apiMode, i18n, digits
│       │   ├── locales/         # bn.json (default), en.json
│       │   ├── pages/           # 49 screens
│       │   └── stores/          # zustand: auth, ui
│       └── netlify.toml → ../../netlify.toml (repo root)
├── packages/shared/             # zod schemas, types, roles, nav, formatters
├── supabase/
│   ├── migrations/              # 58 ordered migrations (tables + RLS)
│   ├── bootstrap-fresh.sql      # single-file bootstrap for a new project
│   └── demo-seed-full.sql       # demo dataset + demo login (never in prod)
├── Dockerfile                   # production API image
├── docker-compose.yml           # local / VPS API run
├── netlify.toml                 # client build + SPA fallback + headers
└── docs/
```

---

## Scripts

| Command | Purpose |
| ------- | ------- |
| `npm run dev:local` | API + web dev servers, Zod defaults (demo mode) |
| `npm run dev` | Same, with secrets injected from Infisical |
| `npm run build` | Build shared → api → web |
| `npm run typecheck` | `tsc --noEmit` across workspaces |
| `npm run lint` | ESLint across workspaces |
| `npm run test` | Vitest across workspaces |
| `npm run format` | Prettier write |
| `npm run db:migrate` / `db:seed` / `db:types` | Database tasks (need `SUPABASE_DB`) |
| `npm run secrets:*` | Infisical helpers ([docs](docs/infisical.md)) |

---

## Conventions

- **Money** `numeric(14,2)`, transmitted as strings, BDT only.
- **Dates** stored UTC, rendered in Asia/Dhaka via the shared formatters.
- **Permissions** are `<domain>:<action>` strings in
  `packages/shared/src/roles.ts`, enforced by the sidebar and the API routes.
- **API errors** are `{ error: { code, message, details? } }` with stable codes.
- **Soft delete** — `deleted_at`; queries must filter `deleted_at is null`.
- **Two data backends** — every module has a demo router (in-memory) and a live
  router (Supabase). `apps/api/src/app.ts` mounts one per `DEMO_MODE`.

## CI

`.github/workflows/ci.yml` runs install → build shared → typecheck → lint →
test → build on every push and PR to `main`. `.github/workflows/backup.yml`
dumps the production database nightly (needs the `SUPABASE_DB` repo secret).
