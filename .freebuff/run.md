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

## 12. Work Distribution, Supervision & Internal Audit (module 0036–0037)

Shared: `packages/shared/src/work.ts` — task engine (todo → in_progress →
blocked → done → verified, assigner-only verification), auto-task factory
(`AUTO_TASK_DEFS`: overdue_followup, utilization_visit, meeting_due,
kyc_pending, report_submission, cash_count) with open-task dedupe by
`source:linkId`, target cascade (area → branch → officer) with achievement
(PAR inverse) and split-within-parent guard, delegation/reassignment helpers.

Migration 0036 (work_tasks, work_task_comments, work_delegations,
work_targets + transitions/dedupe/split triggers); RLS 0037 (org-scoped;
target authoring branch:manage+).

```bash
# task lifecycle
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"type":"manual","title":"শাখা পরিদর্শন","assigneeId":"00000000-0000-4000-8000-0000000000f1","dueDate":"2026-10-01"}' \
  http://localhost:4000/api/v1/work/tasks
curl -s -X PATCH -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"status":"in_progress"}' http://localhost:4000/api/v1/work/tasks/<id>
# auto task (dedupes while open -> 409 on repeat)
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"source":"overdue_followup","linkId":"00000000-0000-4000-8000-0000000000e7","linkLabel":"ঋণ","assigneeId":"00000000-0000-4000-8000-0000000000f2"}' \
  http://localhost:4000/api/v1/work/tasks/auto
# targets with live achievement
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/work/targets
# bulk reassignment on leave/transfer
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"fromStaffId":"00000000-0000-4000-8000-0000000000f1","toStaffId":"00000000-0000-4000-8000-0000000000f2","reason":"leave"}' \
  http://localhost:4000/api/v1/work/reassign-bulk
```

UI: `/work` (sidebar কাজ ও লক্ষ্য) — কাজের তালিকা, স্বয়ংক্রিয় কাজ,
লক্ষ্যমাত্রা (achievement bars), প্রতিনিধিত্ব tabs.

## 13. Work audit (req 5–9 of module 0038–0039)

Shared: `packages/shared/src/work-audit.ts` — supervision checklists
(5 form types with default Bangla checklists), audit plans + Fisher–Yates
random sampler, findings register (severity SLA 7/14/21/30 days, status
machine open → responded → in_followup → closed), approval inbox builder,
escalation tiers (3d BM / 7d AM / 14d HO), calendar/kanban builders and the
per-role daily digest.

Migration 0038 (supervision_submissions with exceptions trigger, audit_plans,
audit_findings with SLA + closed-guard triggers, work_escalations,
work_digests); RLS 0039 (officer submissions, admin/AM audits).

```bash
# supervision submission (mobile GPS + photos)
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"branchId":"00000000-0000-4000-8000-0000000000b1","formType":"cash_verification","lat":23.81,"lng":90.41,"answers":{"cav1":"yes"},"photos":[]}' \
  http://localhost:4000/api/v1/work/supervision
# audit plan + random sample + findings lifecycle
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"branchId":"00000000-0000-4000-8000-0000000000b1","branchName":"ঢাকা শাখা","title":"Q3 নিরীক্ষা","plannedDate":"2026-10-01","leadAuditorId":"00000000-0000-4000-8000-0000000000f3"}' \
  http://localhost:4000/api/v1/work/audits
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"sampleSize":5}' http://localhost:4000/api/v1/work/audits/<id>/sample
# approval inbox, escalation sweep, daily digest
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/work/inbox
curl -s -X POST -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/work/escalations/sweep
curl -s -H "Authorization: Bearer demo-token" "http://localhost:4000/api/v1/work/digest?role=branch_manager"
```

UI: `/work` gains কানবান, ক্যালেন্ডার, তত্ত্বাবধান, অভ্যন্তরীণ নিরীক্ষা and
অনুমোদন ইনবক্স tabs (9 tabs total).

## 14. Insurance, Member Welfare & Dividend (module 0040–0041)

Shared: `packages/shared/src/insurance-welfare.ts` — credit life premium
(pct of principal, min floor) + coverage cap, claim ladder submitted →
bm_review → am_review → ho_review → approved → paid with payout or loan
waiver journals (Dr 5300 / Cr 1010 or Cr 1200), death docs gate
(মৃত্যুসনদ, নমিনির এনআইডি, নমিনি প্রমাণপত্র), micro products
(cattle/crop/health) with per-unit coverage, welfare rules/cap/approval
matrix (BM ≤ 3000, AM ≤ 10000, HO above), fund-availability check,
benevolent payroll deduction, dividend split by shares.

Migrations: 0040 (credit_life_policies, insurance_claims with fn_claim_flow
trigger, micro products/enrollments, welfare rules/requests with fn_welfare_cap
trigger, fund ledger), 0041 (org-scoped RLS; products/rules admin-only,
ledger admin/accountant).

```bash
# credit life
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/insurance/policies
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"policyId":"00000000-0000-4000-8000-00000000c001","kind":"death","eventDate":"2026-09-24","cause":"natural", \
       "documents":[{"id":"death_certificate","labelBn":"মৃত্যুসনদ","path":"docs/dc.pdf"}, \
                    {"id":"nominee_nid","labelBn":"নমিনির এনআইডি","path":"docs/nid.pdf"}, \
                    {"id":"nominee_proof","labelBn":"নমিনি প্রমাণপত্র","path":"docs/proof.pdf"}], \
       "claimedAmount":"180000.00"}' \
  http://localhost:4000/api/v1/insurance/claims
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"action":"advance","note":""}' http://localhost:4000/api/v1/insurance/claims/<id>/decision
# approve at ho_review: {"action":"approve","approvedAmount":"150000.00"} then pay / settle_waiver

# micro insurance
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/insurance/micro/products
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"productId":"00000000-0000-4000-8000-00000000d001","memberId":"00000000-0000-4000-8000-0000000001a3", \
       "memberName":"কমল হোসেন","units":1,"subjectRef":"গরু #২০৩","startDate":"2026-09-24"}' \
  http://localhost:4000/api/v1/insurance/micro/enrollments
# micro claim requires photos: {"enrollmentId":"...","cause":"death","eventDate":"...","photos":["photos/x.jpg"],"claimedAmount":"30000.00"}

# welfare fund
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/insurance/welfare/rules
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"fund":"member","requesterId":"00000000-0000-4000-8000-0000000001a1","requesterName":"রহিমা বেগম", \
       "kind":"illness","type":"grant","amount":"2500.00","reason":"জরুরি চিকিৎসা"}' \
  http://localhost:4000/api/v1/insurance/welfare/requests
# decision actions: advance / approve (level-gated) / reject / disburse (posts ledger)
curl -s -H "Authorization: Bearer demo-token" http://localhost:4000/api/v1/insurance/welfare/summary
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"fund":"member_welfare","amount":"500.00","memo":"মাসিক চাঁদা"}' \
  http://localhost:4000/api/v1/insurance/welfare/contribution

# dividend
curl -s -X POST -H "Authorization: Bearer demo-token" -H "Content-Type: application/json" \
  -d '{"surplus":"150000","payoutPct":70,"totalShares":25,"holders":[{"memberId":"...","memberName":"...","shares":12}]}' \
  http://localhost:4000/api/v1/insurance/dividend/compute
```

UI: `/welfare` (sidebar বীমা ও কল্যাণ তহবিল) — ৫টি ট্যাব: ক্রেডিট লাইফ ও দাবি
(policy issue, death-claim ladder with payout/loan-waiver buttons),
মাইক্রো বীমা (products + enrollments + photo claims), কল্যাণ তহবিল
(rules/approval matrix + grant/loan requests), তহবিল লেজার (balances,
pending counts, ledger), লভ্যাংশ (surplus split by shares).

Status: shared 159/159, API 18/18 (full suite 201/201), web tsc clean,
web vitest 7/7. Demo probes verified live: welfare grant → approve →
disburse posts ledger 3000.00 `WF-2026-0001 — রহিমা বেগম`; UI death claim
submit → CL-2026-0001 with 3 docs.

## 15. Cooperative governance: dividend, AGM, member exit, reports (module 0042–0043, req 5–8)

Shared engine `packages/shared/src/coop-governance.ts` (all pure, money is
string numeric(14,2)):

- **Req 5 dividend/surplus**: `splitSurplus(surplus, reservePct=25)` →
  statutory reserve + distributable pool; `periodWeightedShares`
  (shares × months ÷ 12); `distributeDividend` splits the pool by weighted
  share; status flow computed → agm_approved → posted → paid with
  `canTransitionDividendStatus`; `buildDividendJournal` (Dr 3305 Surplus
  Appropriation / Cr 3310 Statutory Reserve + Cr 2320 Dividend Payable);
  `buildDividendPaymentJournal` per member (Dr 2320 / Cr 2100 savings or
  Cr 1010 cash). `ratePct` (AGM-approved) is informational; the pool is what
  distributes.
- **Req 6 AGM**: draft → notice_issued → held → minutes_approved
  (`canTransitionAgm`); schemas agmUpsert (fiscalYear `^\d{4}-\d{2}$`,
  noticeDays 7–60), attendance, resolution, election; `quorumMet`,
  `electionWinner` (tie → null), `resolutionPasses` (special = 2/3 of valid
  votes); `buildNoticeTextBn` (uses `toBanglaDigits` — `১৪ দিনের নোটিশ`) and
  `buildMinutesTextBn` (কার্যবিবরণী with attendance, resolutions, elections).
- **Req 7 member exit**: requested → computed → approved → settled
  (+ rejected from requested/computed); `computeExitNet` = savings + share +
  dividend + welfare − dues (floored ≥ 0); `buildExitJournal` final voucher —
  Dr 2100/3100/2320/2340 payables, Cr 1210 dues (min(dues, payableTotal)),
  Cr 1010 net — always balanced; `nextExitNo` EX-YYYY-NNNN.
- **Req 8 reports**: `claimRatio` = (paid + waived) ÷ premiums × 100,
  `premiumVsPayout` rows per year, `FundBalanceRow` for fund balances.

Migrations: `supabase/migrations/0042_coop_governance.sql`
(dividend_distributions + dividend_lines + fn_dividend_flow, agm_records +
fn_agm_flow, member_exits + fn_exit_flow + fn_exit_net recompute trigger) and
`0043_coop_governance_rls.sql` (org-scoped RLS; dividend manage =
super_admin/org_admin/accountant, AGM manage = admins, exit writes include
account_officer). Row types appended to `database.types.ts`.

API: `apps/api/src/lib/coop-governance-store.ts` (in-memory demo store) +
`apps/api/src/routes/coop-governance.routes.ts` mounted at
`/api/v1/coop` when `isDemoMode()`. Endpoints:
`GET/POST /coop/dividend[/compute|/:fy/decision (agm_approve|post|pay +
memberId/destination)]`, `GET/POST /coop/agm` (+
`/:id/attendance|resolutions|elections|decision (issue_notice|hold|
approve_minutes)`), `GET/POST /coop/exits` +
`/:id/decision (compute|approve|reject|settle)`, `GET /coop/journals`
(dividend + settlement voucher trail), `GET /coop/reports` (joins the
insurance ledger for claim ratio / premium vs payout / fund balances).
Reads: member:read; admin actions: branch:manage; exits: member:write.
Note: `pay` sets status paid on first payment but keeps accepting payments
until every member is paid (member-by-member payout).

Tests: `apps/api/src/coop-governance.test.ts` — 17 tests. Coverage:
weighted split math (75000 pool → 21428.57/10714.29/42857.14), duplicate
year 409, full dividend walk with journal lines + double-pay 409, AGM
duplicate 409, quorum fail 422 then pass, ordinary/special (2/3) resolutions,
election tie 422, Bangla minutes with `কার্যবিবরণী`, exit math with dues
(15000.00 net, -4500.00 line), balanced voucher (Dr=Cr=19500 on 1210/1010),
zero-floor when dues exceed payables, reject path + transition guards 409,
reports (funds 18000/6000/2400, claim ratio 0% → 2500% after a paid claim,
dividend status), officer 403 on admin endpoints but 201 on exit request.
Full API suite 218/218 (16 files).

UI: `apps/web/src/pages/GovernancePage.tsx` at `/governance` (sidebar
লভ্যাংশ ও শাসন, Gavel icon) — 4 tabs: লভ্যাংশ ও উদ্বৃত্ত (compute form with
per-member shares/months, approve → post → pay per member into সঞ্চয়ে/নগদ,
print button), সাধারণ সভা (create → notice → attendance → resolutions →
elections → Bangla minutes), নিষ্পত্তি (exit request form with 5 balances +
ladder buttons), রিপোর্ট (claim-ratio + fund cards, premium-vs-payout table,
dividend status, governance journal trail). Wired nav/locales (bn: লভ্যাংশ ও
শাসন) / Sidebar Gavel.

Live probes (demo servers on :4000/:5174): computed 150000 surplus → pool
১,১২,৫০০.০০ / reserve ৩৭,৫০০.০০; রহিমা বেগম paid ৳৩২,১৪২.৮৬ into savings
(journal Dr 2320 / Cr 2100); exit settled via compute→approve→settle
(early-settle 409); AGM notice contains `১৪ দিনের নোটিশ`; reports tab shows
claim ratio 0%, funds ১৮,০০০/৬,০০০/১,৮০০, dividend status পরিশোধিত 1/3.
Fixed during UI check: journal footnote rendered raw `{money(...)}` braces —
template now interpolated.

Status: shared 167/167, API 218/218, web tsc clean, web vitest 7/7.

## 16. Programs & Projects (module 0044–0045, NGO development sector)

Education, health, skills training, agriculture, WASH, child protection,
awareness — for RRF/JCF/BRAC-style organizations running development work
beside microfinance.

Shared engine `packages/shared/src/programs.ts`:
- **Req 1 project register**: `projectSchema` (donor, grantAgreementNo,
  fundCode, sector ∈ 7, dates, targetAreas, targetBeneficiaries, manager,
  budget lines) + `projectTotalBudget`; status flow proposed → active →
  suspended ⇄ active → closed (`canTransitionProject`, PROJECT_ACTION_TO_STATUS
  activate|suspend|resume|close); `fundCode` is the restricted fund tag —
  journal lines posted with projectName = fundCode feed Module 10
  `/accounting/reports/fund-statement?fund=<fundCode>`.
- **Req 2 logframe**: goal/objective/output/indicator entries (statement,
  parentLabel, indicatorCode, baseline, targetValue, unit, meansOfVerification)
  + `indicatorValueSchema` with evidence uploads; `indicatorProgress` =
  cumulative achieved vs target (capped 100%) + evidence count.
- **Req 3 beneficiaries**: `beneficiarySchema` (optional memberId link),
  BEN-0001 codes, multi-program `enrollmentSchema` (unique per project),
  `serviceRecordSchema` for training/health_camp/school_enrollment/
  kit_distribution/awareness_session.
- **Req 4 activities & training**: `activitySchema` + planned→done|cancelled
  (`canTransitionActivity`), `activitiesInRange` calendar slice;
  `trainingBatchSchema` (TRN-2026-NNN, trainer, hours, sessions),
  attendance upsert rows, pre/post `testScoreSchema`, `batchStats`
  (attendance %, avg pre/post, gain %), CERT-2026-NNNN with
  `buildCertificateTextBn` (Bangla digits: ২৪ ঘণ্টার).

Migrations: `0044_programs.sql` — projects (+budget lines), logframe_entries,
indicator_values (evidence jsonb), beneficiaries, program_enrollments,
program_services, program_activities, training_batches, training_attendance,
training_test_scores, training_certificates + fn_project_flow /
fn_activity_flow triggers, fn_certificate_guard (≥60% attendance, post ≥ 40)
and duplicate-certificate guard. `0045_programs_rls.sql` — org-scoped RLS,
register/logframe/batch manage = admins+managers, field staff write
beneficiaries/services/attendance/scores/indicator values. Row types appended
to database.types.ts.

API: `apps/api/src/lib/programs-store.ts` +
`apps/api/src/routes/programs.routes.ts` mounted at `/api/v1/programs`
(demo mode). Endpoints: `GET/POST /projects` (+`/:id/decision`,
`/:id/logframe`), `POST /indicator-values`, `GET/POST /beneficiaries`,
`GET/POST /enrollments`, `GET/POST /services`, `GET/POST /activities`
(+`/:id/decision`), `GET/POST /batches` (+`/:id` detail with stats,
`PUT /:id/attendance`, `PUT /:id/scores`, `POST /:id/certificates` returning
the batch+beneficiary print payload, `GET /certificates`). Reads
member:read; register/batch manage branch:manage; field records member:write.

Tests: `apps/api/src/programs.test.ts` — 14 tests: budget total + duplicate
code 409 + bad dates 422, full lifecycle walk with invalid-transition 409s,
sector/donor/status filters, logframe 3 levels + wrong-level value 422 +
indicator math (120+60 vs target 300), inverted period 422, BEN codes +
member link, multi-project enrollment with per-project duplicate 409, 5
service kinds, calendar slice + activity completion + terminal 409, session
beyond plan 422 + attendance upsert + batch stats (100% attendance, 50→80,
+60%), certificate ladder (no attendance 422 → no score 422 → post<40 422 →
issue CERT-2026-0001 → second issue 409) + <60% attendance refusal, officer
403 on register writes but 201 beneficiary. Full API suite 232/232 (17 files).

UI: `apps/web/src/pages/ProgramsPage.tsx` at `/programs` (sidebar প্রোগ্রাম ও
প্রকল্প, Sprout icon) — 5 tabs: প্রকল্প রেজিস্টার (full form + lifecycle
buttons + fund-code card), লগফ্রেম (per-project tree with progress % and
evidence counts, one-click ±120/+60 measurements), উপকারভোগী (registry with
member-link, enrollment, quick service buttons), কার্যক্রম ক্যালেন্ডার
(date-range slice + done/cancel), প্রশিক্ষণ ব্যাচ (batch table, detail card
with attendance/score/certificate actions per beneficiary, stats pill).
Certificate print: `/programs/certificates/:id/print`
(CertificatePrintPage.tsx) — double-border Bangla certificate with batch,
trainer, hours, cert no and signature blocks, window.print() for PDF.

Live probes: project activated (চলমান), রহিমা বেগম enrolled (BEN-0001,
member-linked), indicator 120/300 logged with evidence, batch TRN-2026-001
(24h, 3 sessions) with 3/3 attendance + 40→78 score issued CERT-2026-0001;
print page renders সার্টিফিকেট নং/ব্যাচ/trainer. Status: shared 174/174,
API 232/232, web tsc clean, web vitest 7/7.

## 17. Programs ops: budget, visits, donor reports, cases, funding (module 0046–0047, req 5–9)

**Shared** — `packages/shared/src/programs-ops.ts` (exported after programs.js):
- **Req 5 budget**: `projectExpenseSchema` (no recordedBy — server stamps the auth email),
  `budgetAlertLevel` (ok <80 ≤ warning <95 ≤ critical), `BUDGET_ALERT_THRESHOLD=80`,
  `budgetMonitor` (per-line spent/remaining/utilization, `unbudgetedSpent` bucket,
  `hasAlert`), `burnRate` (elapsed-share vs burn-share, ±10/−25 variance →
  overspent/on_track/underspent), `donorUtilization` (donor rollup with alert levels).
- **Req 6 visits**: `fieldVisitSchema` (checklist 1–40 required, photos ≤50,
  followUps), `visitScore` (% passed), `overdueFollowUps`.
- **Req 7 donor reports**: `buildDonorReport` (indicator rows filtered to measurements
  OVERLAPPING the period; financials split period vs cumulative; delivery counts incl.
  avg visit score; Bangla narrative via toBanglaDigits), `buildDonorReportHtml`
  (standalone Word-openable HTML; never contains case data).
- **Req 8 cases**: CASE_TYPES (5), CASE_FLOW open→in_progress/referred→closed
  (`canTransitionCase`), `caseFileSchema`, `nextCaseNo`, `CASE_WORKER_ROLES`
  (super_admin/org_admin/area_manager), `canManageCases` (or assigned worker),
  `maskCase` (nulls beneficiaryName + restrictedDetails), access-log model with
  actions create/view/view_restricted/update/close.
- **Req 9 funding**: FUNDING_KINDS grant/pksf/bank/mfi_wholesale/internal_fund,
  `fundingSourceSchema`, `repaymentSchedule` (flat vs declining EMI; 0% →
  principal-only; last row clears rounding), `repaymentSummary`.

**Tests**: shared 190/190 (16 new), API 250/250 (18 new in `programs-ops.test.ts`:
90% line warning, unbudgeted bucket, burn overspent, donor rollup, visit score 75%,
duplicate report 409, officer 403, Word export title/no-CASE, officer masked row,
access-log view_restricted, counts-only stats, PKSF EMI 24 rows + shrinking interest,
grant principal-only, repayment-before-disbursement 422, unknown purpose project 404),
web tsc clean, web vitest 7/7, web build ok.

**Migrations** — `0046_programs_ops.sql`: project_expenses, field_visits (jsonb
checklist/photos/follow_ups), donor_reports (unique org/project/period, payload
jsonb), cases (+fn_case_flow trigger mirroring CASE_FLOW, closed_at auto),
case_access_log, funding_sources, funding_repayments, next_case_seq /
next_funding_seq. `0047_programs_ops_rls.sql`: standard org-scoped read/manage for
expenses/visits/reports/funding; **cases strict**: select/write only for
super_admin/org_admin/area_manager OR `assigned_worker_id = auth_user_id()` (new
`auth_user_id()` helper returns auth.uid()::text); **case_access_log INSERT-ONLY**
(insert requires user_id = caller and caller can see the case; no
select/update/delete policies for app roles → tamper-evident audit trail).
database.types.ts: +7 Row interfaces, +6 enum union types.

**API** — `programs-store.ts` extended: addExpense/listExpenses,
projectBudgetStatus (monitor+burn+donor row), budgetAlerts (org-wide ≥80% lines),
addVisit/listVisits (scorePct + overdue count)/getVisit,
generateDonorReport (dup period 409)/listDonorReports/getDonorReport,
createCase/listCases (row-level mask)/getCaseDetail (view_restricted logged)/
decideCase (403 non-worker, 409 bad transition, 'close' action logged)/
caseAccessLog (worker-only)/caseStats (counts only, no identity),
addFundingSource (repayment≥disbursement 422, method by kind, schedule+summary)/
listFundingSources/getFundingSource. `programs.routes.ts` new endpoints:
GET/POST /programs/expenses, GET /programs/projects/:id/budget-status?asOf=,
GET /programs/budget/alerts, GET /programs/budget/donor-utilization,
GET/POST /programs/visits, GET /programs/visits/:id,
GET/POST /programs/donor-reports, GET /programs/donor-reports/:id,
GET /programs/donor-reports/:id/export (text/html, inline filename),
GET /programs/cases/stats, GET/POST /programs/cases, GET /programs/cases/:id,
POST /programs/cases/:id/decision, GET /programs/cases/:id/access-log,
GET/POST /programs/funding, GET /programs/funding/:id.
Case routes gate on member:read but enforce the case-worker tier in the store
(403/ masking) — mirroring the 0047 RLS. Cases never appear in donor reports.

**Web** — `ProgramsOpsPage.tsx` at `/programs/ops`: 5 Bangla tabs বাজেট ও ব্যয়
(project selector, per-line table + ৮০% pills, burn-rate line, alerts table,
donor rollup, expense ledger) / মাঠ পরিদর্শন (checklist ✅❌, photos 📷, follow-ups,
score pill) / দাতা প্রতিবেদন (period picker, generate, Word/PDF export links,
indicator + financial mini-tables) / সংবেদনশীল কেস (privacy note, masked rows,
open/in_progress/close actions, detail card with restricted block + access log for
workers) / তহবিল ও ঋণ (add form, summary table, full installment schedule with EMI).
`DonorReportPrintPage.tsx` at `/programs/ops/donor-reports/:reportId/print`
(print toolbar + Word export link, bilingual header, narrative/indicator/financial
tables, "case data excluded" note). Wired: App.tsx routes, nav.ts programsOps
(ClipboardCheck, member:read), Sidebar import+ICONS, bn.json
"বাজেট · দাতা · কেস", en.json "Budget · Donors · Cases".

**Ports** — 4000 is now occupied by the MediNova project's dev server on this
machine; our API moved to **4010** (`.freebuff/start-api.cmd` PORT=4010) and web
sets `VITE_API_PROXY=http://localhost:4010` (`start-web.cmd`), vite.config proxy
now honors `VITE_API_PROXY`. Health: `curl http://localhost:4010/api/v1/health`.

**Live verified (preview + smoke script `.freebuff/smoke/run-smoke.sh`, UTF-8
payloads via the vite proxy; console-issued Bangla curls get mangled to `?`)**:
90% টিউবওয়েল warning pill in alerts table + per-line monitor, burn 60% vs 73.4%
on_track, JCF donor rollup 30%, visit scored 75% with photo + follow-up, Q2 donor
report generated with Word export (title present, zero case data), CASE-0001:
officer view masked (name+details null, unlocked=false) while admin sees restricted
text + access log [view, create], officer log 403, FND-0001 PKSF 24-installment
declining schedule (interest 6000→264.60, final balance 0, payable 1276433.57).
Print page shows Bangla-digit narrative "এই প্রান্তিকে ১৮০,০০০ টাকা ব্যয়…".

## 18. Reports, MIS & Compliance (module 0048–0049, reqs 1–4)

**Shared** — `packages/shared/src/reports-mis.ts` (exported after programs-ops):
- **Req 1 dashboards**: DASHBOARD_ROLES field_officer/branch_manager/area_zone/
  head_office/board + ROLE_TO_DASHBOARD mapping. Builders: buildOfficerDashboard
  (today sheet rows, collection summary, targets with achievement %, overdue
  clients), buildBranchDashboard-style data on the API (collection efficiency,
  PAR metrics, cash position opening→closing, per-officer performance),
  areaZoneDashboard + branchRanking (score = 40% efficiency + 40% inverse PAR +
  20% membership, ranked), headOfficeDashboard (portfolio, YTD disbursement/
  collection, growth vs prev period, six ratios, ranked branches),
  buildBoardDashboard (KPI cards + Bangla headline, summary only).
- **Req 2 reports**: STANDARD_REPORTS (11 kinds) → StandardReport shape
  {meta, columns[type], rows, totals} for uniform render/export:
  member_statement, loan_statement, disbursement_register, collection_efficiency
  (per officer + branch), outstanding_loans (applicationId travels for
  deep-linking), overdue_aging (4 delinquency buckets per branch),
  savings_position, samity_list, dropout_analysis (by reason, branch rate),
  staff_productivity, loan_utilization (Bangla finding labels). MisSnapshot is
  the single data contract between API stores and all builders.
- **Req 3 ratios**: computeRatios → OSS = operatingIncome ÷ (opExpense +
  finExpense), portfolio yield = interest&fees ÷ avg portfolio, cost per
  borrower, borrowers per officer, savings-to-loan, write-off ratio; all
  zero-denominator-safe with labels, formatted strings and benchmarks.
- **Req 4 designer**: ReportTemplate rows with formula strings ("=expr", "-",
  section/note kinds, unit bdt/count/pct/ratio); evalFormula is a closed
  tokenizer+recursive-descent parser (numbers, identifiers incl. Bangla, + -
  * / parens, unary minus — function calls/property access rejected);
  formulaIdentifiers + validateTemplate (syntax probe, missing identifiers);
  generateRegulatoryReturn fills rows and surfaces missingValues instead of
  failing; needsVerification flag + circularRef required on every template;
  mraStarterTemplate (সঞ্চয় ও নিজস্ব তহবিল + ঋণের মান sections) and
  pksfStarterTemplate seeded; renderRegulatoryTextBn Word-openable export.

**Tests**: shared 210/210 (20 new: dashboards, ranking order, all 9 parametric
reports, ratio math incl. zero-safe, formula eval incl. `=Math.round(1.5)`
rejected, template validation, MRA/PKSF generation, missing-values surfacing).
API 268/250→**268/268** (18 new in mis.test.ts: 5 role dashboards incl. demo
?role= override + 401, 11 report kinds, unknown kind 422, member_statement
422/404, loan_statement from classified loan, audit trail, 6 ratios, starter
templates seeded verified-flagged, custom template with missingIdentifiers=0,
broken formula 422 naming the row, update/verify clears flag, generate/dup 409/
submit-once 409, export with যাচাই warning, template list officer-readable,
POST officer 403, delete 204). Web tsc clean, vitest 7/7, build ok (Sidebar
test updated for the renamed রিপোর্ট label).

**Migrations** — `0048_reports_mis.sql`: report_templates (rows jsonb,
needs_verification, verified_at/by), regulatory_returns (payload jsonb, unique
org/template/period, submitted_at), mis_snapshots (role/scope cached), 
mis_formula_values (org/as_of/key unique), staff_productivity_monthly,
report_audit_log. `0049_reports_mis_rls.sql`: org-scoped read + finance-tier
manage (templates/returns), snapshots/formula-values admin+accountant write,
productivity manager write, audit log INSERT-ONLY (no update/delete policies).
database.types.ts: +6 Row interfaces, +2 union types.

**API** — `apps/api/src/lib/mis-store.ts` (resetMisStore): buildSnapshot(asOf)
auto-runs the nightly classification when empty, maps disbursements→members,
account balances→savings (by product_type), completed utilization visits→
findings (notes keyword heuristic), per-officer rollup (demand ≈12% of
outstanding, collected = demand − overdue); formulaValues (total_savings,
own_funds, outstanding, borrowers, oss, par30, active_loans, branches, members,
written_off); ratioInputs with demo GL proxies; dashboardForRole(viewer,
overrideRole). `apps/api/src/routes/mis.routes.ts` mounted at `/api/v1/mis`:
GET /dashboard (?role= demo override), GET /dashboard/board, GET
/reports/:kind (validated + audited), GET /audit, GET /ratios, GET/POST/PUT/
DELETE /templates, POST /templates/:id/verify, GET/POST /returns, GET
/returns/:id, POST /returns/:id/submit, GET /returns/:id/export (text/plain
Bangla). List + generate returns both flatten to {…generated, id, submittedAt}.

**Web** — `apps/web/src/pages/MisPage.tsx` at `/reports` (replaces the
placeholder): 4 tabs — ড্যাশবোর্ড (demo role switch ফিল্ড অফিসার→বোর্ড সারসংক্ষেপ;
HO KPI cards + growth + ranking table; area/zone branch comparison; branch
collection/PAR/cash/officers; officer today-sheet + target bars + overdue
clients; board KPI cards with "শুধু সারসংক্ষেপ" note) / স্ট্যান্ডার্ড রিপোর্ট
(report picker + period, generic column renderer with money/number/pct types
and totals footer) / আর্থিক অনুপাত (6 ratio cards with benchmarks + formula
note) / নিয়ন্ত্রক রিটার্ন (template list with ⚠ যাচাই প্রয়োজন badges and
verify action, generate form, return cards with rows/submit/export, missing
values note, + কাস্টম টেমপ্লেট button proving no-code extensibility). App.tsx
routes /reports → MisPage; bn/en nav label renamed "রিপোর্ট, এমআইএস ও
কমপ্লায়েন্স" / "Reports, MIS & Compliance".

**Live verified (preview)**: HO dashboard ৳১২,৬০০ outstanding / 1 borrower /
শাখা র‍্যাংকিং (ধানমন্ডি score 80, ময়মনসিংহ 40); ratios OSS 110.0% (amber vs
120% benchmark), yield 15.77%; officer dashboard আজকের শিট গাজীপুর সমিতি +
লক্ষ্য বার; branch dashboard PAR/নগদ/কর্মীর পারফরম্যান্স tables; board summary
KPIs; outstanding report row LN-DHK-26-0001 with totals; MRA return generated
from the UI (মোট সঞ্চয় 33860.00, নিজস্ব তহবিল 67720.00, বকেয়া 12600.00, OSS
1.100, PAR-30 0.00%) with ⚠ badge + export "⚠ সর্বশেষ দপ্তর/সার্কুলারের সাথে
যাচাই প্রয়োজন"; disbursement re-seeded after API restart (demo store is
in-memory). Fixed during verification: GET /returns now flattens the generated
payload (UI crashed on the nested shape).

## 19. MIS ops: protection, builder, exports, freeze, matviews (module 0050–0051, reqs 5–10)

Shared engine `packages/shared/src/reports-mis-ops.ts`: complaint
register/state machine (open→in_progress→escalated→resolved|rejected,
escalate→escalate climbs branch→area→head→board, critical skips branch),
ESCALATION_LADDER + SLA (critical +1d, else +3d),
clientProtectionIndicators (median/avg resolution, SLA%, overlap cases,
repayment-stress cases, per-1000-borrowers, by category/branch),
savedReportSchema (5 datasets, filters eq/neq/gt/gte/lt/lte/in/contains,
groupBy, metric count/sum/avg, chartType, sharedWithRoles), closed formula
parser reused for builder, export builders toCsv (UTF-8 BOM)/toExcelXml/
toPrintHtml (Bangla fonts), SmtpConfig over free SMTP (nodemailer-free
fetch impl in API store), isScheduleDue + run-due, monthFreezeSchema
(soft|hard), matview catalogue metadata.

Migrations 0050 (complaints + complaint_events, saved_reports, exports
registry, export_schedules, deliveries, month_freezes, mis_audit_log,
4 materialized views + refresh_mis_matviews() + documented indexes) and
0051 (org RLS; complaints readable org-wide but actions by manager tier;
schedules/freeze = branch:manage+; audit log insert-only). database.types
rows appended.

API mis-ops-store + mis-ops.routes mounted at /api/v1/mis-ops: complaints
CRUD+action (escalation writes events, resolve accepts backdated resolvedOn,
assertNotFrozen rejects complaints dated in a frozen month → 409
ALREADY_CLOSED), protection rollup, builder run/save/list/run-saved/delete
(role-sharing enforced in listSavedReports), exports standard/saved ×
csv/excel/pdf with RFC 5987 Content-Disposition (Bangla filenames were
crashing the header — fixed with ASCII fallback + filename*), schedules
CRUD + POST /schedules/:id/run ("run now", added during verification) +
run-due cron entry, month freeze/unfreeze, matview stats. SMTP-missing
runs record lastStatus=error on the schedule instead of silently dropping.

Tests: shared +17 (227/227 total), apps/api mis-ops.test.ts 16 tests —
284/284 across 20 files. Web MisOpsPage at /reports/ops (4 Bangla tabs:
সুরক্ষা সূচক with Recharts bar by category, রিপোর্ট বিল্ডার with live
chart + saved/share, এক্সপোর্ট ও শিডিউল, ফ্রিজ ও গতি) + nav "রিপোর্ট
অপারেশন" (SlidersHorizontal, report:read). Web tsc clean, vitest 7/7.

Live-verified: 2 complaints → protection KPIs + Recharts chart + branch
table; builder grouped loans by branch (ধানমন্ডি ১২,৬০০, chart rendered),
saved+shared to branch_manager; CSV export begins with BOM+Bangla header,
Excel 200; weekly schedule with "run now" → smtp-not-configured error
recorded (ত্রুটি in UI, warns to set SMTP_HOST/PORT/USER/PASS for free
SMTP); hard freeze 2026-08 → complaint dated 2026-08-15 rejected 409;
matview catalogue shows 4 views + pg_cron SQL. Loans dataset re-seeded
after API restarts (in-memory demo). Fixed during verification: missing
POST /schedules/:id/run endpoint, complaint category labels mismatched
real COMPLAINT_CATEGORIES, runBuilder rows use {group,count,metric}.

## 20. Communication & Documents (module 0052–0055, reqs 1–8)

Packages/shared: `communication.ts` (reqs 1–3: provider iface MessageProvider
with MockSmsProvider ৳0.35/part + HttpSmsGatewayProvider for BD gateways via
SMS_GATEWAY_URL/BODY/API_KEY env; 7 bilingual template kinds ×bn/en = 14
seeded; renderTemplate {{var}}; rules window 09:00–20:00 Dhaka-local
(inSendWindow overnight-safe, localHhmm uses Intl Asia/Dhaka), opt-out per
channel, retry backoff nextRetryAt, caps assertWithinCaps daily/monthly,
smsParts UCS-2 70 / GSM-7 160) and `documents.ts` (reqs 4–8: DOC_KINDS 11
kinds × cholito|sadhu register = 22 seeded templates; docTemplateSchema;
docVariablesUsed/renderDocTemplate; numberToWordsBn কোটি/লক্ষ/হাজার/শত +
taka/পয়সা, toBanglaDigitsFlexible, re-export toEnglishDigits;
banglaCalendarDate anchored 14 Apr = ১ বৈশাখ, months 1–6 have 31 days,
Falgun 31 absorbs Gregorian leap day, year −593; VERIFY_CODE_RE
VRF-+10 no-lookalikes; verifyCodePayload → {baseUrl}/verify/{code};
PublicVerifyPayload = kind/docNo/org/issuedAt/status ONLY; BULK_JOB_KINDS
documents_batch/sms_batch/notification_batch/status_flip; bulkJobSchema).
NOTE: toBanglaDigits already lived in format.ts — documents.ts re-exports
instead of duplicating (TS2308 lesson).

PDF strategy: no pdfkit/pdfmake in tree; print-HTML with font stack
'Noto Sans Bengali','Nirmala UI','SolaimanLipi','Vrinda' (browsers embed at
print time — same as toPrintHtml). `qrcode` 1.5.4 installed (api + web);
server-side QR → data URL embedded in the print-HTML footer with the
verify code + URL, so every printed doc carries its QR.

Migrations: 0054_documents.sql (doc_templates unique org/kind/register,
doc_template_versions immutable snapshots, documents verify_code unique +
payload jsonb + html, bulk_jobs + bulk_job_items) and 0055_documents_rls.sql
(anon-safe documents read is intentionally NOT granted — the public path is
the API projection; templates/versions/jobs managers+; documents insert
staff+; bulk staff read). database.types.ts: +5 Row interfaces.

API: `lib/doc-store.ts` — generator (nextDocNo RCP/MEM/AGR/…-YYYY-####,
autoVars issuedDateBn via Bangla calendar + issuedDateEn, withAmountWords
auto-fills loanAmountWords/paidAmountWords, receiptNo auto = docNo, missing
vars → 422), template upsert bumps version + writes a version snapshot
(seeded v1 snapshots), restore copies old body as a NEW version, preview
with sample vars, list (light, no html) + /:id/download (RFC 5987
filename*) + revoke (managers), publicVerify returns the minimal payload
(unknown code → status unknown 200), createBulkJob resolves demo roster
(s1/s2/b1/b2 → members incl. the opted-out 01700000001), processJob runs
all items (documents_batch → real generateDocument per member; sms_batch →
comm sendMessage with force=false so guards apply; notification_batch →
broadcast), processPendingJobs + startBulkJobWorker (setInterval 2.5s,
unref'd) started in server.ts demo mode; tick endpoint for on-demand runs.
Routes: documentsRouter at /api/v1/documents (templates, preview, versions,
restore, generate, list, download, revoke, bulk-jobs + tick),
publicVerifyRouter at /api/v1/public/verify/:code mounted WITHOUT requireAuth,
commBulkRouter alias at /api/v1/comms/bulk. Comm reqs 1–3 routes in
comm.routes.ts (notifications/mark-read/broadcast, templates+preview,
send with Dhaka window + admin-only force, deliveries+stats+retry-due,
opt-outs, rules+spend). Viewer map: super_admin admin@samity.test, officer
demo-token-officer (no branch:manage/report:read).

Tests: shared 235/235 (+4 documents), api comm.test.ts 9/9 + documents.test.ts
7/7 → full suite 300/300 across 22 files. Traps hit: bn greeting SMS = 2
parts (110 chars) so cap test needs ৳1 not ৳0.5; disbursement_confirmation
email needs locale:'en' (bn template is sms-only); unknown vars 422; seeded
template ids are slugs (doc-notice-cholito) so upsert schema id is a plain
string, not uuid; generate is strict on template vars (branchName must be
passed) but receiptNo/balance/paidAmountWords auto-fill.

Web: CommsPage /comms (নোটিফিকেশন feed 15s poll + broadcast, টেমপ্লেট editor
with placeholder chips {{var}} + live preview + 422 surfacing, পাঠানো ও লগ
send form + delivery log with status chips + cost + retry button, নিয়ম ও
খরচ window/caps/retry editor + opt-out toggles), DocsPage /documents (দলিল
তৈরি with per-kind var fields + cholito/sadhu select + QR preview card +
প্রিন্ট/PDF button, টেমপ্লেট সম্পাদক placeholder picker + orientation +
iframe srcDoc live preview + version history with restore, ইস্যুকৃত দলিল
list with verify codes + revoke, গুচ্ছ কার্যক্রম job form samity/branch +
progress bars + এখনই চালান), VerifyPage /verify/:code OUTSIDE AppLayout
(shows kind/docNo/org/issued only, valid/revoked/unknown states, privacy
note). Nav: communications → /comms (Bell), documents → /documents
(FileText) under insights; bn/en locale keys added.

Live-verified (servers 4010/5174): POST /documents/generate → RCP-2026-0002
VRF-TS6R7F5EUZ, QR data-URL embedded, বারো হাজার পাঁচ শত টাকা পঞ্চাশ পয়সা
for 12500.50, Bangla date আশ্বিন present; public verify (no auth) returns
the 5-field payload and unknown code → status unknown; /comms/bulk sms_batch
for ঢাকা শাখা → worker drained 5/5 in ~6s with exactly 1 failed (seeded
opt-out guard); /verify/VRF-TS6R7F5EUZ renders the ✅ সত্য ও সক্রিয় card in
browser with no personal data. Bangla curl payloads must go through
--data-binary @file (console mangles UTF-8 → '?').

## 21. Security, Audit & Deployment

Req 1–5 implemented across shared engine + migrations + API store/routes/middleware + web page.

Req 1 audit trail: `audit_records` table (table, record_id, action, old_values, new_values,
user_id, user_role, ip, at) with append-only guard trigger `audit_records_append_only`; generic
trigger factory `audit_row_change()` attached to 14 sensitive tables via DO block (user/ip from
request.* GUCs). API demo store `appendAudit/listAudit` with filter schema (table, action,
userId, entityId, from, to) + `auditForMember` linking consents/corrections; every mutation
route writes an audit record via `auditMutationTrail` middleware (route→table map, 2xx only).

Req 2 field protection: app-layer AES-256-GCM (node crypto, per-org key derivation) encrypts
NID/bank/phone at rest in the store; `maskedProtectedField` renders role-based masks
(NID '••••••6789', bank '••••••6655', phone '01712••••78'); `revealProtectedField` is
role-gated (super_admin/org_admin/branch_manager, officer denied 403) and every reveal writes
`unmask_log`; migration side uses pgcrypto. Web masks by default, reveal button per field.

Req 3 controls: password policy schema + evaluatePassword (length/classes/common list) with
POST /security/password/check; TOTP 2FA for Head Office roles (base32 secret, otpauth URL,
enroll start/confirm/verify/status) gated super_admin/org_admin; session idle timeout 60min
→ 401 'নিষ্ক্রিয়তা' via sessionTimeoutMiddleware; device list register/revoke;
finance-role IP allow-list (ipInAllowlist + /security/finance-ip-check + config enable);
brute-force lockout (5 fails → 15min, checked in /auth/login with Bangla message, attempts
recorded); CSRF guard (Origin allow-list + X-Requested-With: XMLHttpRequest proof on
mutations, no-Origin API clients pass); helmet for XSS headers; Zod validate middleware on
every security/privacy route (400 ZodError); rate limits 120/min global + 10/min on
/auth/login, /security/protected-fields/reveal, /security/totp/confirm (429 verified);
dependency scan `npm audit --omit=dev`: 0 high/critical, 2 moderate (react-router,
react-router-dom advisory) — noted, no lockfile changes.

Req 4 RLS: automated matrix 12 tables × select/insert/update/delete = 48 probes; every
cross-branch probe must be denied, own-branch select must allow (rlsVerdict/runRlsMatrix/
rlsVisibleRows; visibleB1Members === 1). GET /security/rls-matrix; migration 0057 applies
org-scoped RLS to all 9 new tables (auth_org_id()/auth_user_role() helpers from 0002).

Req 5 data protection: consent records (CONSENT_KINDS + labels, POST /privacy/consents
member:write); retention rules per class (RETENTION_CLASSES + DEFAULT_RETENTION_RULES,
PUT org:manage, purge preview counts); right-to-correction workflow
create → review → approve → apply (canTransitionCorrection enforced, member:approve gate,
apply writes protected field + audit); member data export GET /privacy/export/:memberId
(profile + protected fields + audit + consents + corrections + devices as JSON).

Files: packages/shared/src/security.ts (+index export, +9 tests → shared 244/244);
supabase/migrations/0056_security.sql + 0057_security_rls.sql (+9 Row interfaces in
database.types.ts); apps/api/src/lib/security-store.ts; apps/api/src/middleware/security.ts
(auditMutationTrail, sessionTimeoutMiddleware, csrfGuard); apps/api/src/routes/security.routes.ts
(GET /audit, GET /protected-fields/:table/:id, POST /protected-fields/reveal, GET /unmask-log,
GET/PUT /config, POST /password/check, GET /session/timeout, GET /finance-ip-check,
GET/POST /devices, POST /devices/:id/revoke, GET /totp/status, POST /totp/start,
POST /totp/confirm, GET /rls-matrix); apps/api/src/routes/privacy.routes.ts (GET/POST
/consents, GET/PUT /retention-rules, GET/POST /corrections, POST /corrections/:id/decide,
POST /corrections/:id/apply, GET /export/:memberId); apps/api/src/routes/auth.routes.ts
(lockout + attempt recording); apps/api/src/app.ts (middleware order + /security,/privacy
mounts in demo mode); apps/api/src/security.test.ts 12/12. Web: SecurityPage.tsx 4 tabs
(অডিট ট্রেল / তথ্য সুরক্ষা / নিরাপত্তা নিয়ন্ত্রণ / প্রাইভেসি — audit filters + viewer,
masked NID/bank/phone with logged reveal, password check, TOTP enroll, IP allow-list toggle,
devices, RLS matrix card, consents, corrections workflow, retention table, export viewer);
api.ts sends X-Requested-With on all requests; route /security + nav ShieldCheck + bn/en
locales. Traps: auditRecordMatches userId filter needed the missing '!';
correctionDecisionSchema needed 'review' step; masked phone in export must be the masked
form; secrets must be URL-safe base32 (hand-math vectors wrong twice — trust machine
tests: base32Encode([0x46])==='IY', [0x46,0x6f]==='IZXQ').

Live-verified (servers 4010/5174, api up 18:13): full chain green — shared 244/244, api
security.test 12/12 + full suite **312/312 across 23 files**, web tsc clean, web 7/7.
`npm audit --omit=dev`: 0 high/critical, 2 moderate (react-router, react-router-dom).
curl: consent POST → audit row (member_consents/insert with user+IP), masked
NID/bank/phone, reveal officer 403 (Bangla) vs admin 200 '1990123456789' logged:true,
unmask-log populated, rls-matrix 48/48 deny + visibleB1Members=1, cross-origin POST
without proof header 403, reveal limiter 200×7 → 429, export has masked phone + NO raw NID.
Browser /security: nav item renders, tab state via .click() eval (CDP mouse clicks don't
reach React synthetic handlers — type works, click doesn't; app itself is fine), protection
tab shows 3 masked rows + 12-table deny matrix, and দেখুন reveal from the real 5174 origin
decrypted NID and appended the unmask-log row (who/when/field/IP) — CSRF chain intact.
Trap fixed late: CORS_ORIGINS default was 'http://localhost:5173' only, so the real web
port 5174 would be CSRF-blocked on every mutation — default is now '5173,5174'
(env.ts; no .env change). Other traps: 5174 was briefly serving a DIFFERENT app
(MediNova) after a restart — on any mismatch check `netstat -ano` PID → CommandLine
before changing ports; shared dist must be rebuilt after nav.ts edits or the sidebar
item is missing (vite consumes packages/shared/dist). Fresh API store = empty audit
log is expected, not a bug.
