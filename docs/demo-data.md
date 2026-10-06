# Demo data & live database mode

The backend ships with two modes. Which one you get is decided **only** by the
Supabase env values in `apps/api/.env` (see `apps/api/src/lib/demo.ts`):

| Mode | Trigger | Data source |
|---|---|---|
| **Demo mode** | `SUPABASE_URL` contains `placeholder` **or** `SUPABASE_SERVICE_ROLE_KEY` = `service-role-placeholder` | In-memory store (restart wipes changes) |
| **Live mode** | Real project URL + real service-role key | Your Supabase Postgres database |

> The mode flips the moment the placeholders are gone — there is no separate
> flag to set.

## 1. Run the migrations

**Easiest path — one paste.** Open **`supabase/bootstrap-fresh.sql`** in the
SQL Editor and run it. It contains, in order: reset-all (drops every object),
all 57 migrations (with the fixes below), and the demo seed. If anything fails
the editor rolls back the entire batch and shows the exact error — you never
end up half-migrated.

> Alternatively run every file in `supabase/migrations/` one at a time in
> filename order (`0001_core.sql` → `0057_security_rls.sql`), then
> `demo-seed.sql`. Because the SQL editor runs each file as a single
> transaction, **one failing statement rolls back that whole file silently** —
> the missing-object errors you might see later (`relation "members" does not
> exist`, `relation "audit_records" does not exist`) mean an earlier file
> died. Known historical blockers, now fixed in the migration files:
>
> - `0007` re-created the `samities` table that `0001` already created
>   (fixed: now `create table if not exists` + additive `alter table ... add
>   column if not exists` for the module's own columns),
> - `0008` re-created two RLS policies from `0002` (fixed: guarded with
>   `drop policy if exists`),
> - `0028`'s child tables referenced `gl_accounts(code)`, which was not
>   unique (fixed: unique index `gl_accounts_code_key` added in `0028`),
> - `0056`'s audit-trigger loop aborted the whole security module if any of
>   its 14 target tables was missing (fixed: `to_regclass` guard — audit
>   coverage degrades gracefully instead of failing the file).

## 2. Load the demo dataset

**Recommended — one command from this repo.** With the real `service_role` key
in `.env`, run:

```bash
node scripts/seed-demo.mjs
```

It seeds over the REST API (no SQL Editor needed), is idempotent, and creates
more than the SQL file: a savings account + opening deposit for **every**
member, **four active (disbursed) loans** with full repayment schedules (one
deliberately 42 days overdue → delinquency case/worklist data), one pending
application for the pipeline, a full **Accounting / HR / Work / Delinquency**
starter set (GL chart, approved vouchers, cash book, petty cash, bank rec,
requisition, budgets; staff + salary structures + an approved September
payroll; October targets, tasks, audit plan + findings; delinquency settings,
case, follow-ups, early-warning signal), and a working login user
(**admin@samity.test / Samity@2026**, super_admin on the demo org). If the
service key cannot write (e.g. the anon key was pasted by mistake), the script
says so clearly instead of half-seeding.

**SQL Editor path.** Paste **`supabase/demo-seed.sql`** into the SQL Editor
and run it. It is idempotent — re-running never duplicates rows.

> Alternative: `npm run db:seed -w @samity/api` (`apps/api/src/scripts/seed.ts`)
> seeds a *minimal* dataset and creates real Supabase Auth users, but requires
> a direct `SUPABASE_DB` connection string. For the full demo dataset the SQL
> file above is the recommended path.

What `scripts/seed-demo.mjs` loads (the SQL file below is a smaller subset):

| Area | Rows |
|---|---|
| Org structure | 1 org, 1 zone, 2 areas, 2 active + 1 planned branch, 3 samities, 2 groups |
| Members | 12 members (MEM-DEMO-001…012), 2 groups |
| Savings | 2 products, 12 accounts (one per member), 12 opening transactions |
| Loans | 1 policy, 3 products, 5 applications: 4 disbursed + full weekly schedules (future installments due), 1 pending in review |
| Accounting | 9-account GL chart, 6 event→journal mappings, 3 approved vouchers + 6 lines, 2 auto-postings, open cash-book day, petty cash, bank rec + statement line, fund requisition, 3 October budget lines |
| HR | 4 staff, 3 salary structures, 1 vacancy + 2 applicants, attendance, 2 leave requests, 2 holidays, 1 transfer order, approved September payroll run + 4 lines, PF ledger, KPI + appraisal, 1 disciplinary case |
| Work | 3 October targets (branch + officer split), 4 tasks (1 overdue, 1 done), 1 delegation, supervision submission, audit plan + 2 findings, 1 proposed branch opening, 1 escalation |
| Delinquency | settings, 2 collection entries, 1 open case (42 DPD), 2 follow-ups (reminder tasks auto-created by trigger), 1 early-warning signal, 1 root cause |
| Auth | login user admin@samity.test / Samity@2026 (super_admin) — created first; its real id fills every created_by/prepared_by column |

Safety notes:

- **Auth users:** the SQL demo-seed needs **no** `auth.users` rows (every
  user-referencing column is NULL). The REST script does the opposite: it
  creates the real login user **first** and threads its id through every
  `created_by`/`prepared_by` column, so vouchers, payroll and audit trails
  show a proper name. The API's service-role client bypasses RLS either way.
- Two guarded `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements add
  `members.samity_name` and `members.deleted_by`, which the live API reads but
  no migration defines yet.
- Fixed UUIDs mean the web demo session ids (`…0aa` org, `…0b1` branch) match
  the seeded org/branch.

## 3. Point the API at the project

Fill the real values in `apps/api/.env` (copy from `.env.example`):

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role key>   # NOT the anon key
SUPABASE_JWT_SECRET=<jwt secret>               # Settings → API → JWT Settings
```

The API now boots in live mode — every mounted router
(`members`, `samities`, `org`, `savings`, `loans`, …) reads these tables.

> **Login:** with real env values the `/auth/login` route verifies passwords
> against Supabase Auth (`auth.users`). The web app's seeded demo token only
> exists in demo mode. Until you create a real user, either keep using demo
> mode or create a user in Supabase Auth and add `app_metadata` claims
> (`role`, `org_id`, `branch_id`) as described in
> `docs/go-live.md`. In demo mode you can also use the field-officer session
> by logging in with any credentials — the web seeds the demo super_admin
> session regardless.

## 4. Verify

```bash
curl http://localhost:4000/api/v1/health
curl http://localhost:4000/api/v1/members -H "Authorization: Bearer demo-token"
# → live mode returns the 8 seeded members; demo mode returns in-memory rows
```

## Where the data shows up

| Web screen | Table(s) |
|---|---|
| Dashboard | members, savings_accounts, loans |
| Members / Member 360 | members, member_nominees, member_notes, savings_accounts, loans |
| Samities & centers | samities, groups, group_members |
| Savings | savings_products, savings_accounts, savings_transactions |
| Loans | loan_policies, loan_products, loan_applications, loan_disbursements, loan_repayment_schedule, loan_installments |
| Org structure / map | zones, areas, branches, working_areas |
| Accounting | gl_accounts, event_journal_mappings, vouchers, voucher_lines, journal_postings, cash_book_days/lines, petty_cash_*, bank_reconciliations, bank_statement_lines, fund_requisitions, gl_budgets |
| HR | hr_staff, salary_structures, hr_vacancies, hr_applicants, hr_attendance, hr_leave_requests, hr_holidays, hr_movements, payroll_runs, payroll_lines, pf_ledger, kpi_scorecards, staff_appraisals, disciplinary_cases |
| Work | work_targets, work_tasks, task_delegations, supervision_submissions, audit_plans, audit_findings, branch_openings, work_escalations |
| Delinquency | delinquency_settings, delinquency_cases, delinquency_follow_ups, delinquency_tasks, early_warning_signals, delinquency_root_causes, collection_entries |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| API still serves restart-volatile demo data | `SUPABASE_URL` still contains `placeholder` or the service key is still `service-role-placeholder` — recheck `apps/api/.env` |
| `cannot drop type … because other objects depend on it` (2BP01) when running reset/bootstrap | Older reset ran without `cascade`; current files drop everything with `cascade`, making order irrelevant. Re-paste the latest `bootstrap-fresh.sql` |
| `relation "members" does not exist` when running the seed | Migrations never landed — an earlier migration file failed and its transaction rolled back. Run `supabase/reset-all.sql` once, then re-run migrations **one file at a time** (step 1) |
| `relation "audit_records" does not exist` at 0057 | `0056` rolled back (it hard-required 14 audit tables; now `to_regclass`-guarded). Use `bootstrap-fresh.sql` and the batch's error message will name the real culprit |
| `relation "zones" does not exist` | Migrations weren't run (or not in order) before the seed |
| `null value in column "account_number"` | Pre-0009 rows exist without account numbers — run `0009_savings_module.sql` again; its backfill covers them |
| Members screen empty in live mode | RLS requires an authenticated role; the service-role bypass only applies server-side. Log in with a real Supabase Auth user, or stay in demo mode |
| Seed writes fail with `42501 new row violates row-level security` | The `.env` holds the **anon** key, not `service_role` (reads work, writes fail). Paste the real service-role key and re-run |
