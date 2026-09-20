# Samity Manager

Role-based management system for Bangladeshi cooperative societies and NGO-MFIs (BRAC / Grameen / RRF / JCF style).

**Stack:** Vite + React + TypeScript · Node.js + Express + TypeScript · Supabase (Postgres, Auth, Storage, RLS) · free tiers only.

## Features (foundation)

- Monorepo: `apps/web`, `apps/api`, `packages/shared`
- Bangla-default UI (English toggle), Noto Sans Bengali, Bangla-digit toggle, mobile-first layout, PWA shell
- Permission-driven sidebar (same permission model on web + API)
- Express API: helmet, CORS, rate-limit, pino logs, Zod validation, central error handler, `/api/v1`, JWT middleware, `/health`
- Supabase migrations, seed script, generated-style DB types, RLS policies
- ESLint + Prettier + Vitest + GitHub Actions CI

## Folder tree

```
samity-manager/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── middleware/        # auth (JWT), error, validate
│   │   │   ├── lib/               # logger, supabase admin client, errors
│   │   │   ├── routes/            # health, auth, members, nav
│   │   │   ├── scripts/           # migrate, seed
│   │   │   ├── app.ts             # express factory
│   │   │   ├── env.ts             # zod-validated env
│   │   │   └── server.ts          # entrypoint + graceful shutdown
│   │   ├── package.json
│   │   └── tsconfig*.json
│   └── web/
│       ├── public/
│       ├── src/
│       │   ├── components/        # ui/ (shadcn-style), layout/, auth/
│       │   ├── lib/               # api client, i18n, digits, permissions
│       │   ├── locales/           # bn.json (default), en.json
│   │   │   ├── pages/             # Login, Dashboard, Placeholder
│       │   ├── stores/            # zustand: auth, ui
│       │   └── test/
│       ├── index.html
│       ├── vite.config.ts         # PWA manifest + Tailwind v4
│       └── package.json
├── packages/
│   └── shared/                    # zod schemas, types, roles, nav, formatters
├── supabase/
│   ├── migrations/                # 0001_core.sql, 0002_rls.sql
│   └── database.types.ts
├── .github/workflows/ci.yml
├── .env.example
├── package.json                   # npm workspaces
└── tsconfig.base.json
```

## Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- A free-tier [Supabase](https://supabase.com) project

## Setup

### 1. Install

```bash
npm install
cp .env.example .env
```

### 2. Configure Supabase

1. Create a project at supabase.com (free tier).
2. Copy **Project URL**, **anon key**, **service_role key** from Project Settings → API into `.env`.
3. Copy **JWT Secret** (Project Settings → API → JWT Settings) into `SUPABASE_JWT_SECRET`.
4. Copy the **connection string** (Project Settings → Database → Connection string → URI) into `SUPABASE_DB` (needed only for migrate/seed).

### 3. Database

```bash
# apply migrations (creates tables + RLS)
npm run db:migrate

# seed demo org, branches, users, members
npm run db:seed
```

Seed users (role is stored in `app_metadata` so the JWT carries it):

| Email                 | Password      | Role           |
| --------------------- | ------------- | -------------- |
| admin@samity.test     | Admin1234!    | org_admin      |
| manager@samity.test   | Manager1234!  | branch_manager |
| officer@samity.test   | Officer1234!  | account_officer|

### 4. Run

```bash
npm run dev          # api on :4000, web on :5173 (concurrently)
```

- Web: http://localhost:5173 (loads in Bangla)
- API health: http://localhost:4000/api/v1/health

### 5. Generate DB types (optional, after schema changes)

```bash
npm run db:types
```

## Scripts

| Command            | Purpose                                  |
| ------------------ | ---------------------------------------- |
| `npm run dev`      | API + web dev servers together           |
| `npm run build`    | Build all workspaces                     |
| `npm run typecheck`| tsc across workspaces                    |
| `npm run lint`     | ESLint across workspaces                 |
| `npm run test`     | Vitest across workspaces                 |
| `npm run format`   | Prettier write                           |
| `npm run db:*`     | migrate / seed / generate types          |

## Conventions

- Tables: `id uuid`, `org_id`, `branch_id` where relevant, `created_by`, `created_at`, `updated_at`, `deleted_at` (soft delete — queries must filter `deleted_at is null`).
- Money: `numeric(14,2)`, transmitted as string, BDT only.
- Dates: stored UTC (`timestamptz`), displayed in Asia/Dhaka (`formatDateUtc`/`formatDateTimeUtc` in shared).
- Permissions: `<domain>:<action>` strings in `packages/shared/src/roles.ts` — used by both the sidebar and API routes.
- API errors: `{ error: { code, message, details? } }` with stable machine codes.

## CI

GitHub Actions (`.github/workflows/ci.yml`): install → build shared → typecheck → lint → test → build on every push/PR to main.

## Next steps

- Wire Supabase Auth client in the browser (session refresh) and custom access-token hook to embed role claims.
- Savings collection & loan repayment ledgers, repayment schedules.
- Storage bucket policies for member photos/documents.
- Reports module with Dhaka-timezone daily close.