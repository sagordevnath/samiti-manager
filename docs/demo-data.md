# Demo data & live database mode

The backend ships with two modes. Which one you get is decided **only** by the
Supabase env values in root `.env` (see `apps/api/src/lib/demo.ts`):

| Mode | Trigger | Data source |
|---|---|---|
| **Demo mode** | `SUPABASE_URL` contains `placeholder` **or** the service key is a known placeholder / too short | In-memory store (restart wipes changes) |
| **Live mode** | Real project URL + real **service_role** key | Your Supabase Postgres database |

`GET /api/v1/health` reports which mode is active (`"mode": "demo" | "live"`) —
the web app uses this to decide between the seeded demo session and the login
page. At boot the API also warns loudly when the service key decodes to a
**non-service_role** JWT (i.e. the anon key was pasted into the wrong slot —
the single most common cause of "live pages show no data").

## ⚠️ 0. First: make sure the service key is the real one

Open **Supabase Dashboard → Project Settings → API keys** and copy the
**service_role** secret (legacy JWT, payload contains `"role":"service_role"`,
or the new opaque `sb_secret_…` key) into root `.env`:

```
SUPABASE_SERVICE_ROLE_KEY=<service_role secret — NOT the anon key>
```

The legacy **anon** JWT and the service_role JWT look almost identical (both
long `eyJ…` tokens) — check the middle segment: it literally contains
`"role":"anon"` or `"role":"service_role"`. With the anon key in place the API
boots, login works, but **every database read returns 0 rows** (RLS blocks
anon) — pages look "broken" even with a fully seeded database.

## 1. Run the migrations

**Easiest path — one paste.** Open **`supabase/bootstrap-fresh.sql`** in the
SQL Editor and run it. It contains, in order: reset-all (drops every object),
all 58 migrations, and the **full** demo seed (login user + every module). If
anything fails the editor rolls back the entire batch and shows the exact
error.

> Alternative: run every file in `supabase/migrations/` one at a time in
> filename order (`0001_core.sql` → `0058_collection_live_fixes.sql`), then the
> seed (step 2). If a migration fails its transaction rolls back silently —
> later `relation … does not exist` errors point at the file that died.

## 2. Load the demo dataset (pick ONE path)

### Path A — SQL Editor (recommended, no service key needed)

Paste **`supabase/demo-seed-full.sql`** into the SQL Editor and run. One paste
gives you:

- **Login user** `admin@samity.test` / `Samity@2026` (super_admin, demo org) —
  created in `auth.users` via pgcrypto + its `users_profile` row;
- 1 org · zone · 2 areas · 3 branches · 3 samities · 2 groups · 12 members
  (+ nominees, admissions, attendance, notes, consents) · working areas ·
  branch cash limits;
- 12 savings accounts with a consistent ledger, interest + withdrawal entries;
- share allotments, approved dividend declaration + payments, reconciliation
  run;
- 5 loan applications: 4 disbursed with full weekly schedules (42/28/21/7 days
  past due on the four active loans) + 1 in review + 1 submitted;
- 25 weekly collection entries + receipt counters + 3 cash handovers;
- full accounting (GL chart, event mappings, vouchers, journal postings, cash
  book, petty cash, bank reconciliation, fund requisition, budgets);
- full HR (staff, salary structures, recruitment, attendance, leave, holidays,
  transfer order, approved September payroll, PF ledger, KPI, appraisal,
  disciplinary case);
- full work module (targets, tasks incl. an overdue follow-up, delegation,
  supervision, audit plan + findings, branch-opening proposal, escalation);
- full delinquency set (settings, open cases, follow-ups — reminder tasks are
  created by trigger — early-warning signals, root cause);
- welfare fund rules + requests + ledger; credit life + micro-insurance +
  claim; dividend distribution + AGM records + member exit;
- programs (2 projects, budget, logframe, beneficiaries, activities) + ops
  (expenses, field visit, sensitive case, funding source + repayments);
- communication (templates, deliveries, notifications, opt-out, rules, spend);
- documents (templates incl. sadhu register, versions, generated documents with
  public verify codes, bulk job) — try `/verify/DEMO-VERIFY-0001-…`;
- security (config, retention rules, correction request).

Everything is idempotent (fixed UUIDs + `on conflict do nothing`); re-running
is safe. For a from-zero reset run `supabase/reset-all.sql` first (never delete
from `audit_records` or `savings_transactions` yourself — they are
append-only by trigger).

### Path B — REST seeder (needs the working service key)

```bash
node --env-file=.env scripts/seed-demo.mjs
```

Seeds the core dataset over the REST API (org → loans → accounting → HR → work
→ delinquency) **and** creates the same login user through Supabase Auth's
admin API. The script refuses to run when it detects the anon key in the
service-key slot, and accepts both legacy service_role JWTs and new
`sb_secret_…` keys.

### Path C — create just the login user (Admin API, always works)

If the SQL seed loaded your data but login still says **"incorrect email or
password"**, the `auth.users` insert was rejected by your project's auth schema
and the demo user was never created. Fix it without touching the schema:

```bash
node --env-file=.env scripts/ensure-demo-user.mjs
# custom password:
node --env-file=.env scripts/ensure-demo-user.mjs 'MyNewPass1!'
```

It creates `admin@samity.test` through Supabase's Admin API (so the password
hash and `auth.identities` row are exactly what GoTrue expects), upserts the
matching `users_profile` row, and finally proves the credentials by calling the
same token endpoint the browser uses. Idempotent — an existing user is reused.

(`supabase/demo-seed.sql` is the old compact core subset — kept for quick
tests, but Path A covers every screen.)

## 3. Start the app and sign in

```bash
# API
cd apps/api && PORT=4001 npm run dev      # or node ../../node_modules/tsx/dist/cli.mjs src/server.ts
# Web
cd apps/web && npm run dev
```

- **Live mode:** the app opens on `/login` with the demo credentials
  prefilled — press **Sign in** (they exist once step 2 ran). The session is a
  real Supabase JWT; role/org come from the user's `app_metadata` claims or,
  as fallback, the seeded `users_profile` row.
- **Demo mode** (placeholder env): no login wall — the app seeds the demo
  super_admin session automatically. `/login` also works there (the API serves
  the demo session for the same credentials).
- A stale/expired token anywhere lands back on `/login` automatically.

## 4. Verify

```bash
curl http://localhost:4001/api/v1/health            # → "mode":"live"
curl http://localhost:4001/api/v1/members -H "Authorization: Bearer <accessToken>"
```

## Where the data shows up

| Web screen | Table(s) |
|---|---|
| Dashboard | members, savings_accounts, loan_applications, collection_entries |
| Members / Member 360 | members, member_nominees, member_notes, member_admissions, member_attendance, savings_accounts, loan_applications |
| Samities & centers | samities, groups, group_members, samity_leaders, samity_meetings, meeting_attendance |
| Savings | savings_products, savings_accounts, savings_transactions |
| Shares | share_allotments, dividend_declarations, dividend_payments, reconciliation_runs |
| Loans | loan_policies, loan_products, loan_applications, loan_application_steps, loan_disbursements, loan_repayment_schedule, credit_life_policies |
| Collection | collection_entries, cash_handovers, receipt_counters, v_collection_dashboard |
| Delinquency | delinquency_settings, delinquency_cases, delinquency_follow_ups, delinquency_tasks (auto), early_warning_signals, delinquency_root_causes |
| Accounting | gl_accounts, event_journal_mappings, vouchers, voucher_lines, journal_postings, cash_book_days/lines, petty_cash_*, bank_reconciliations, bank_statement_lines, fund_requisitions, gl_budgets |
| HR | hr_staff, salary_structures, hr_vacancies, hr_applicants, hr_attendance, hr_leave_requests, hr_holidays, hr_movements, payroll_runs, payroll_lines, pf_ledger, kpi_scorecards, staff_appraisals, disciplinary_cases |
| Work | work_targets, work_tasks, task_delegations, supervision_submissions, audit_plans, audit_findings, branch_openings, work_escalations, working_areas |
| Welfare | welfare_fund_rules, welfare_requests, welfare_ledger, micro_insurance_products, micro_enrollments, insurance_claims |
| Governance | dividend_distributions, dividend_lines, agm_records, member_exits |
| Programs / Ops | projects, project_budget_lines, logframe_entries, indicator_values, beneficiaries, program_enrollments, program_services, program_activities, project_expenses, field_visits, funding_sources, funding_repayments, cases |
| Reports / MIS | computed from the tables above |
| Comms | message_templates, message_deliveries, notifications, comm_opt_outs, comm_rules, comm_spend |
| Documents | doc_templates, doc_template_versions, documents, bulk_jobs, bulk_job_items |
| Security | security_config, retention_rules, member_consents, member_corrections, audit_records (auto), unmask_log |
| Org structure / map | zones, areas, branches, branch_cash_limits, working_areas, branch_openings |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| **Live pages show no data even after seeding** | The `.env` service key is the **anon** key (payload `role":"anon"`). The API log warns about it at boot. Paste the real service_role key and restart |
| Login returns "Incorrect email or password" | The seed's auth-user step didn't run (or the password differs). Re-run `demo-seed-full.sql`, or create the user via `scripts/seed-demo.mjs` |
| Login works but pages are empty | See first row — login only needs the anon key, data reads need service_role |
| API still serves restart-volatile demo data | `SUPABASE_URL` still contains `placeholder` or the service key is still `service-role-placeholder` |
| `cannot drop type … because other objects depend on it` (2BP01) on reset | Older reset ran without `cascade`; re-paste the latest `bootstrap-fresh.sql` |
| `relation "…" does not exist` when seeding | Migrations never landed — an earlier migration file failed. Run `bootstrap-fresh.sql` and read its error |
| Seed writes fail with `42501 new row violates row-level security` | The seeder is using the anon key — paste the real service_role key |
| Pages show old numbers after re-seeding | Idempotent seed keeps existing rows; run `reset-all.sql` first for a clean slate |
