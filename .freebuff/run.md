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

## 6. Delinquency Management & Recovery (module 0024–0025)

Nightly classification over disbursed schedules (days past due, buckets,
asset class, provisioning) with org-editable settings; PAR1/30/90 +
on-time rate at org/zone/area/branch/samity/officer scopes; escalating
worklist (officer → BM → AM by days past due); follow-ups (visit/call,
promise-to-pay, next visit) auto-minting reminder tasks. UI: `/delinquency`
(PAR cards, scope switcher, bucket table, worklist + follow-up dialog).

```bash
# nightly run (manual trigger)
curl -s -X POST -H "Authorization: Bearer demo-token" \
  -H "Content-Type: application/json" -d '{}' http://localhost:4000/api/v1/delinquency/run
# PAR by scope: org | zone | area | branch | samity | officer
curl -s -H "Authorization: Bearer demo-token" \
  "http://localhost:4000/api/v1/delinquency/par?scope=branch"
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/delinquency/worklist
```

Note: `demo-token` posts as super_admin; `demo-token-officer` is a second
demo session with the account_officer role (used for role-gate tests).

## 7. Delinquency Recovery (module 0026–0027, requirements 5–9)

Root-cause tagging (7 causes), recovery actions (partial waiver with
approval chain, savings adjustment with balanced journal, Bangla legal
notice, write-off chain: propose → AM recommends → Director approves →
later recovery), loan-loss provision proposals (incremental, posted to
the journal), early-warning scan (2 missed installments / falling samity
attendance / rising officer PAR), heatmap (branch × bucket) and PAR
trend charts. UI: `/delinquency/recovery` (heatmap, Recharts trend,
early-warning panel, root-cause + write-off forms, provision cards).

```bash
# early-warning scan (dedupes on kind+ref until acknowledged)
curl -s -X POST -H "Authorization: Bearer demo-token" \
  -H "Content-Type: application/json" -d '{}' \
  http://localhost:4000/api/v1/delinquency/early-warning/scan
# heatmap + trends (Recharts payloads)
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/delinquency/heatmap
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/delinquency/trends
# write-off chain (needs a disbursed, aged loan — see section 6 aging)
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/delinquency/write-off-proposals
```

## 8. Accounting (module 0028–0029)

Double-entry back office at `/accounting` (sidebar: হিসাবরক্ষণ): chart of
accounts + trial balance, vouchers (draft → checked → approved,
auto-numbered `VCH-<prefix>-<branch>-<YY>-<seq>`), event-to-journal map with
demo auto-posting buttons (৳500 per event), daily cash book with count +
day-end closing (BM + Accountant signatures, locks the date), bank
reconciliation with line clearing, and petty cash with limit checks.

```bash
# auto-post an event through the map
curl -s -X POST -H "Authorization: Bearer demo-token" \
  -H "Content-Type: application/json" \
  -d '{"event":"savings_deposit","amount":"500.00","branchId":"00000000-0000-4000-8000-0000000000b1"}' \
  http://localhost:4000/api/v1/accounting/postings
# seed a bank reconciliation (statement lines are user-supplied)
curl -s -X POST -H "Authorization: Bearer demo-token" \
  -H "Content-Type: application/json" \
  -d '{"branchId":"00000000-0000-4000-8000-0000000000b1","bankCode":"1020","periodStart":"2026-09-01","periodEnd":"2026-09-23","statementBalance":"18400.00","statementLines":[{"valueDate":"2026-09-20","narration":"Sonali Bank deposit","amount":"12500.00"}]}' \
  http://localhost:4000/api/v1/accounting/bank-reconciliations
# cash count + day-end close (two signatures)
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"countedCash":"5000.00"}' http://localhost:4000/api/v1/accounting/cash-book/count
```

## 9. Accounting ops (requirements 6–10 of module 0030–0031)

Fund requisitions/inter-branch transfers (matching JV entries), savings
posting rule (no expense/fixed-asset debits funded by savings), financial
reports, period close/reopen, bilingual voucher print. UI tabs on
`/accounting`: funds, reports, period. Voucher print:
`/accounting/vouchers/:id/print`.

```bash
# requisition lifecycle
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"kind":"branch_to_ho","fromNodeId":"00000000-0000-4000-8000-0000000000b1","toNodeId":"00000000-0000-4000-8000-0000000000a0","amount":"2500.00","purpose":"Weekly sweep","settlementCode":"1010"}' \
  http://localhost:4000/api/v1/accounting/requisitions
# then /decision {decision:"approve"} -> /disburse -> /receive
# reports
curl -s -H "Authorization: Bearer demo-token" "http://localhost:4000/api/v1/accounting/reports/balance-sheet?asOf=2026-09-23"
curl -s -H "Authorization: Bearer demo-token" "http://localhost:4000/api/v1/accounting/reports/budget-vs-actual?start=2026-09-01&end=2026-09-23"
# period close (locks vouchers in range; reopen = Director Finance only)
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"kind":"monthly","periodStart":"2026-09-01","periodEnd":"2026-09-30"}' \
  http://localhost:4000/api/v1/accounting/period-closes
```

## 10. HR (module 0032–0033)

Staff master (encrypted NID/bank, masked display, probation/confirmation,
posting history), recruitment lite (vacancy → approve → applicants →
interview scores → offer), attendance (field GPS+selfie check-in within
2 km radius / office terminal check-in, late after 09:10), leave types
with balances and holiday calendar, transfer/promotion workflow with
bilingual order text at `GET /hr/movements/:id/order`. UI: `/hr` (four
tabs), sidebar মানব সম্পদ.

```bash
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/hr/staff
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"workDate":"2026-09-23","lat":23.8113,"lng":90.413,"selfiePath":"selfies/d1.jpg"}' \
  http://localhost:4000/api/v1/hr/attendance/field-check-in
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"staffId":"00000000-0000-4000-8000-0000000000f2","leaveType":"casual","startDate":"2026-10-05","endDate":"2026-10-07","reason":"Family visit"}' \
  http://localhost:4000/api/v1/hr/leave
```

## 11. HR payroll, PF, performance & discipline (module 0034–0035, req 5–9)

Salary structures (per grade), monthly payroll run (draft → approved → paid,
attendance-prorated, festival/Eid bonus rule, progressive tax + PF +
loan-advance deductions), payslips (`GET /hr/payroll/runs/:id/payslip/:staffId`),
bank sheet with masked accounts, PF ledger (contributions auto-posted on
payment; withdrawals can never overdraw), gratuity settlement (15 days' basic
per completed year), monthly KPI scorecards (collection/PAR/new-members/
attendance → A–D grade), yearly appraisals (1–10 × 5 criteria → 0–100),
disciplinary cases with bilingual warning letters (HR/Director roles only),
and `/self-service` page (own payslips, leave balance, PF, documents).
RLS 0035: payroll_lines/pf/staff_appraisals readable by owner or staff roles;
disciplinary_cases restricted to super_admin/org_admin.

```bash
# payroll run for the current month
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d "{\"period\":\"$(date -u +%Y-%m)\"}" http://localhost:4000/api/v1/hr/payroll/runs
# approve -> pay (posts PF contributions)
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"action":"pay"}' http://localhost:4000/api/v1/hr/payroll/runs/<id>/decision
# PF ledger, KPI, self-service
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/hr/pf
curl -s -X PUT -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"collection_rate":1.0,"par":0.02,"new_members":9,"meeting_attendance":0.95}' \
  http://localhost:4000/api/v1/hr/performance/kpi/00000000-0000-4000-8000-0000000000f1/2026-09
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/hr/self-service
```

UI: `/hr` gains পেরোল ও পিএফ and পারফরম্যান্স ও শৃঙ্খলা tabs;
`/self-service` is the staff self-service page (sidebar স্ব-সেবা).
