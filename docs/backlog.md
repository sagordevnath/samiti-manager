# Due Tasks — Prioritized Backlog

Full-application review, 2026-10-11. Every item below is something the
application still needs; P0 blocks CI/release, P1 blocks real operations,
P2 hardens quality, P3 is hygiene. Work top-down.

## Review evidence (what was actually run)

| Check | Result |
| --- | --- |
| `npm run typecheck` (api + web + shared) | ✅ exit 0 |
| `npm test` — api / shared / web | ✅ 496 + 246 + 7 = **749 passed** |
| `npm run build` | ✅ exit 0 (web bundle warning, see P2-1) |
| `npm run lint` — api / web / shared | ❌ exit 1 every workspace (see P0-1) |
| `npm run format:check` | ❌ 487 files differ (see P2-4) |
| RLS coverage audit (179 created tables) | ✅ 178 RLS-enabled; only `loan_application_seq` (helper sequence) is not, by design |
| i18n key parity (`bn.json` vs `en.json`) | ✅ 137/137 |
| `TODO/FIXME` markers, placeholder pages | none — pages are real implementations |
| Id-addressed cross-tenant write guards | ✅ all 19 routers covered by live tests (see `apps/api/src/cross-tenant-writes.live.test.ts`) |

Counts: 58 migrations · 44 API routers · 49 web pages · 6 live-router test files.

---

## P0 — Blocking

- [ ] **P0-1 · Fix lint so CI is green again.**
  `npm run lint` fails in all three workspaces — api 88 errors/177 warnings,
  web 31/83, shared 21/38 — and `.github/workflows/ci.yml` runs lint, so every
  push/PR is currently red. Errors are mostly unused imports/vars and
  `consistent-type-imports`; the loudest warning class is
  `Resolve error: typescript with invalid interface loaded as resolver`
  (`import/order`), i.e. the eslint-plugin-import TypeScript resolver is
  misconfigured, not a real code smell. Fix: resolve the import resolver config,
  then clear the remaining errors per workspace (`npx eslint . --fix` handles a
  few). Do not silence rules wholesale.

- [x] **P0-2 · Land the uncommitted work safely.** _Landed 2026-10-11 in 7
  commits (`b095834`..`ad52c01`, 106 files: demo seed → shared types → api
  foundation → live routers → tests → web → docs), split foundation → routers →
  tests → docs. A secret scan found real Supabase values in `.env.example`
  (introduced by `6041f4a`) and restored the original placeholders; the values
  remain in git history, so rotate `SUPABASE_JWT_SECRET` if it was real. Scratch
  files under `.freebuff/` were left untracked as intended. Push still waits on
  P0-1._

## P1 — Needed for real operations

- [ ] **P1-1 · HR onboarding forms (staff, vacancy, applicant).**
  Biggest remaining product hole: the full HR workflow (interview → offer →
  confirm → payroll) works, but there is no way to create the staff, vacancy or
  applicant records in the UI (`POST /hr/staff`, `POST /hr/vacancies`,
  `POST /hr/applicants`, `PATCH /hr/applicants/:id/status` unreachable).
  See `docs/ui-crud-coverage.md` "Recommended next gaps" #1.

- [ ] **P1-2 · Collection settlement control screen.**
  Write-off / reschedule / early-closure decisions and fraud-flag review are a
  supervisor workflow with no screen at all, while the API and migration
  `0022_collection_settlement_control.sql` exist. A supervisor currently cannot
  act on a write-off request.

- [ ] **P1-3 · Monitoring and alerting.**
  No Sentry/log-drain integration; `apps/web/src/components/ErrorBoundary.tsx`
  has a placeholder comment. `docs/go-live.md` §5 requires an uptime monitor on
  `/api/v1/health` plus error monitoring for web + api before go-live.

- [ ] **P1-4 · Verify backup restore end-to-end.**
  `.github/workflows/backup.yml` dumps nightly to artifacts (needs the
  `SUPABASE_DB` repo secret), but a restore into a throwaway project has not
  been exercised — an untested backup is not a backup. `docs/go-live.md` §4.

- [ ] **P1-5 · Environment separation (dev / staging / prod).**
  `docs/go-live.md` §1 is unchecked: three Supabase projects, migrations applied
  per environment, Infisical environments + production machine identity. Blocks
  staging rehearsals and a safe pilot.

- [ ] **P1-6 · Accounting setup UI (chart of accounts + budgets).**
  `POST`/`PATCH /accounting/accounts` and `PUT /accounting/budgets` have no UI,
  so accounting cannot be configured without SQL. Ranked #3 in the CRUD review.

- [ ] **P1-7 · Delinquency recovery actions UI.**
  Legal notices, waivers, task completion and savings adjustments
  (`POST /delinquency/legal-notices`, `/waivers`, `/tasks/:id/complete`,
  `/savings-adjustments`) have no screen; delinquency settings are read-only.

## P2 — Quality / performance

- [ ] **P2-1 · Code-split the web bundle.**
  `vite build` emits one 1,629 kB JS chunk (441 kB gzip) and warns above 500 kB,
  which is heavy for the field-officer mobile PWA. Route-level `React.lazy` +
  manual chunks; measure before/after with the build output.

- [ ] **P2-2 · Thicken web test coverage.**
  Only 4 test files / 7 tests against 49 pages. Prioritise the money paths:
  collection sheet offline outbox, disbursement two-step, voucher approval,
  settlement decisions, and the workflow panels in `HrPage`/`WorkPage`.

- [ ] **P2-3 · Generate and consume real database types.**
  `db:types` writes `apps/api/src/generated/database.types.ts`, but that file
  does not exist and nothing imports it; `supabase/database.types.ts` is also
  stale relative to 58 migrations. Generate from the current schema and type the
  Supabase client, or drop the claim/script.

- [ ] **P2-4 · Decide the Prettier policy.**
  `format:check` differs on 487 files although the README advertises Prettier.
  Either run one formatting commit (large but mechanical — do it after P0-2 to
  keep review sane) or remove the script/claim. CI does not run format today.

- [ ] **P2-5 · Extend cross-tenant guard tests to every id-addressed write.**
  The new suite covers representative writes per router; the id-write
  enumerator still lists 119 write chains (many are sub-statements of one
  workflow handler). Add the remaining decision/workflow
  endpoints (e.g. vouchers check/approve, bank-rec line clear, HR payroll and
  movements, documents template restore) as data shapes are confirmed.

- [ ] **P2-6 · Remaining smaller UI gaps from `docs/ui-crud-coverage.md`.**
  Staff assignments; MIS-ops complaint intake/action; work target edit + single
  reassign; welfare rules + micro-insurance products; privacy retention rules;
  MIS template edit/delete; zone/area edit/delete; savings account edit/close;
  loan utilization + approval matrix.

## P3 — Hygiene

- [ ] **P3-1 · Refresh `README.md`.**
  It still describes migrations `0001_core.sql / 0002_rls.sql`, a Placeholder
  page and the original four routers; the app now has 58 migrations, 44 routers,
  49 pages and 749 tests. Add quick-start, environment and docs links.

- [ ] **P3-2 · Tidy scratch tooling.**
  `.freebuff/` holds 7 audit scripts from review sessions and `scripts/` holds
  the two CRUD audits. Keep the reusable ones under `scripts/` with npm aliases
  (`audit:routes`, `audit:ui`, `audit:rls`), delete the rest; never commit
  `.freebuff/`.

- [ ] **P3-3 · Reviewer runbook.**
  `docs/go-live.md` is the release checklist, `docs/ui-crud-coverage.md` the
  UI-gap map, `docs/demo-data.md` the seed reference, and this file the working
  backlog. Cross-link them from the README so the next reviewer starts here.
