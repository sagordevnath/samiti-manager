# Due Tasks — Prioritized Backlog

Full-application review, 2026-10-11. Every item below is something the
application still needs; P0 blocks CI/release, P1 blocks real operations,
P2 hardens quality, P3 is hygiene. Work top-down.

## Review evidence (what was actually run)

| Check | Result |
| --- | --- |
| `npm run typecheck` (api + web + shared) | ✅ exit 0 |
| `npm test` — api / shared / web | ✅ 507 + 246 + 17 = **770 passed** |
| `npm run build` | ✅ exit 0 (web bundle warning, see P2-1) |
| `npm run lint` — api / web / shared | ✅ exit 0 (was ❌; fixed in P0-1, 2026-10-12) |
| `npm run format:check` | ❌ 487 files differ (see P2-4) |
| RLS coverage audit (179 created tables) | ✅ 178 RLS-enabled; only `loan_application_seq` (helper sequence) is not, by design |
| i18n key parity (`bn.json` vs `en.json`) | ✅ 137/137 |
| `TODO/FIXME` markers, placeholder pages | none — pages are real implementations |
| Id-addressed cross-tenant write guards | ✅ all 19 routers covered by live tests (see `apps/api/src/cross-tenant-writes.live.test.ts`) |

Counts: 58 migrations · 44 API routers · 49 web pages · 6 live-router test files.

**Deployment pass (2026-10-12).** A production-deployment review added the
static-host wiring that was missing (`netlify.toml`, a runtime `/config.js` API
override, an actionable "cannot reach the API" screen), a production `Dockerfile`
+ compose file, an explicit `DEMO_MODE` switch, and moved `dotenv` from
devDependencies to dependencies — it is imported by `env.ts` at runtime, so a
`--omit=dev` install would have crashed the production container. See
`docs/deploy.md`.

---

## P0 — Blocking

- [x] **P0-1 · Fix lint so CI is green again.** _Landed 2026-10-12. Root cause of
  the loudest warning class was a missing `eslint-import-resolver-typescript`
  (the config referenced a resolver that was not installed) — installing it as a
  root devDependency removed ~294 bogus warnings. The remaining 132 errors were
  all dead code (unused imports/vars/functions, one no-op self-assignment, one
  `let`→`const`) and are cleared: `npm run lint` now exits 0 with 5 warnings.
  Two genuine bugs surfaced while fixing them: `apps/api/src/routes/loans.routes.ts`
  ran a dead `loan_policies` query on every stage advance, and the target-vs-actual
  report queried `collection_entries` for a value it then discarded (see P1-8)._

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
  `/api/v1/health` plus error monitoring for web + api before go-live. The public
  status page (`status/`, `docs/deploy.md` §9) covers the uptime half and reports
  its own blind spots, but it cannot tell its own outage apart from a skipped
  workflow run: an observer outside this stack — an alerting uptime monitor, or at
  least one that records — is still missing.
  _Uptime half landed 2026-10-12: `.github/workflows/keep-alive.yml` probes every
  10 minutes and fails red when the API is not answering, and the public status
  page in `status/` keeps D1-backed history (see `docs/deploy.md` §9). Error
  monitoring and a log drain are still the open half._

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

- [ ] **P1-8 · Attribute collections to branches in target-vs-actual.**
  `GET /api/v1/work/...` computes live actuals for members, disbursements and
  savings but the `collection` metric always reports 0: the branch attribution
  was never implemented (the old code queried `collection_entries` and then
  discarded the result). The dead query has been removed and the gap is noted in
  a code comment, so the report is honest but incomplete until a branch-attributed
  sum is added.

- [ ] **P1-9 · Verify the Docker image build in CI.**
  `Dockerfile` + `docker-compose.yml` are new and were authored for this
  release, but the build has not been executed end to end because no Docker
  daemon was available in the authoring environment. Add a `docker build` job to
  CI (or run it once manually) so the image cannot silently rot.

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

- [x] **P3-1 · Refresh `README.md`.** _Landed 2026-10-12: accurate counts
  (58 migrations, 44 routers, 49 pages), a quick start that works with no cloud
  account, a deployment section pointing at `docs/deploy.md`, a docs index and a
  corrected repository tree._

- [ ] **P3-2 · Tidy scratch tooling.**
  `.freebuff/` holds 7 audit scripts from review sessions and `scripts/` holds
  the two CRUD audits. Keep the reusable ones under `scripts/` with npm aliases
  (`audit:routes`, `audit:ui`, `audit:rls`), delete the rest; never commit
  `.freebuff/`.

- [ ] **P3-3 · Reviewer runbook.**
  `docs/go-live.md` is the release checklist, `docs/ui-crud-coverage.md` the
  UI-gap map, `docs/demo-data.md` the seed reference, and this file the working
  backlog. Cross-link them from the README so the next reviewer starts here.
