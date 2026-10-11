# UI CRUD Coverage — Module by Module

Which entities can be created, edited and removed from the web UI, and which
still cannot. Generated from two static analyses (see [Appendix](#appendix-how-this-was-produced)):

- every `api.post/patch/put/delete(...)` call made by each page under
  `apps/web/src/pages` (+ `lib`, `stores`, `components`), and
- every write route registered by the API routers under `apps/api/src/routes`,
  resolved to its mounted path via `apps/api/src/app.ts`.

A write endpoint that **no** UI surface calls is the strongest signal of a
missing create/edit/remove path. Read-only report/print/dashboard pages are
called out as intentional, not gaps.

Legend: ✅ full CRUD in UI · ✏️ create + edit but no remove · ➕ create only ·
👁️ read-only (intentional) · ⚠️ **gap** — API exists, no UI path.

---

## Operations

| Entity | Surface | Create | Edit | Remove | Notes |
|---|---|---|---|---|---|
| Member | `MembersPage`, `MemberAdmissionPage` | ✅ | ✅ | ✅ | Admission wizard + list PATCH/DELETE. |
| Member 360 / notes | `Member360Page` | ✅ | — | — | Notes are append-only by design. |
| Samity (center) | `SamitiesPage` | ✅ | ✅ | ✅ | Soft delete. |
| **Samity group (5–10 members)** | `SamitiesPage` → “দল ও সভা” panel | ✅ | ⚠️ | ⚠️ | **Closed this session.** Create from samity members (≤10). Edit/remove still API-less. |
| **Samity meeting** | `SamitiesPage` → “দল ও সভা” panel | ✅ | ⚠️ | ⚠️ | **Closed this session** (added `GET /samities/:id/meetings`). |
| Savings account | `SavingsPage` | ✅ | ⚠️ | ⚠️ | Deposits/transactions post; no account edit/close in UI. |
| Savings product | `SavingsPage` | ✅ | ⚠️ | ⚠️ | `POST /savings/products` only. |
| Share purchase / dividend | `SharesPage` | ✅ | ⚠️ | ⚠️ | Dividends + reconciliation run reachable; individual share rows are append-only. |
| Loan application | `LoanApplyPage`, `LoanDetailPage` | ✅ | ✅ | ⚠️ | Disburse/repay actions wired; no hard cancel in UI. |
| Loan product | `LoanProductsPage` | ✅ | ✅ | ⚠️ | No delete. |
| Loan utilization / approval matrix | — | ⚠️ | ⚠️ | — | `PUT /loans/applications/:id/utilization`, `PUT /loans/approval-matrix` have no UI. |
| Collection sheet / entries | `CollectionSheetPage` (offline outbox) | ✅ | — | — | Writes via `POST /collection/sync`. |
| Cash handover | `CashHandoverPage` | ✅ | — | — | |
| **Settlement control** (write-offs, reschedule, closure) | — | ⚠️ | ⚠️ | ⚠️ | `POST /collection/settlement/*`, `POST /collection/fraud-flags/:id/review`, `PATCH /collection/rules` unreachable. |

### Highest-impact open gaps here
- **Collection settlement control** (write-off / reschedule / closure decisions)
  is a supervisor workflow with no screen at all — the API and migration
  `0022_collection_settlement_control.sql` exist but a field supervisor cannot
  act on a write-off request.

---

## Administration

| Entity | Surface | Create | Edit | Remove | Notes |
|---|---|---|---|---|---|
| Branch | `BranchesPage`, `BranchFormPage` | ✅ | ✅ | — | No delete route by design; close via `status`. |
| Branch opening | `BranchesPage` | ✅ | ✅ | — | Checklist / decision / activate wired. |
| **Zone** | `OrgTreePage` → “কাঠামো তৈরি করুন” | ✅ | ⚠️ | ⚠️ | **Closed this session** (`POST /org/zones`). |
| **Area office** | `OrgTreePage` → “কাঠামো তৈরি করুন” | ✅ | ⚠️ | ⚠️ | **Closed this session** (`POST /org/areas`). |
| Working area (village) | `WorkingAreasPage` | ✅ | ✅ | — | Assign/import-geo: `POST /org/working-areas/import-geo` has no UI. |
| Staff assignment | — | ⚠️ | ⚠️ | ⚠️ | `POST /org/staff-assignments` unreachable. |
| User account | `UsersPage` | ✅ | ✅ | ✅ | **Purge fixed this session** (hard-delete works with a profile row). |
| **HR staff** | — | ⚠️ | ⚠️ | — | `POST /hr/staff`, `PATCH /hr/staff/:id`, `POST /hr/staff/:id/education` have no UI. |
| **HR vacancy** | — | ⚠️ | — | — | `POST /hr/vacancies` has no UI; only downstream decisions are wired. |
| **HR applicant** | — | ⚠️ | ⚠️ | — | `POST /hr/applicants`, `PATCH /hr/applicants/:id/status` have no UI. |
| HR holiday calendar | — | ⚠️ | — | — | `POST /hr/holidays` has no UI. |
| HR payroll structure | — | — | ⚠️ | — | `PUT /hr/payroll/structures` has no UI. |
| HR PF / gratuity | — | ⚠️ | — | — | `POST /hr/pf`, `POST /hr/pf/gratuity` have no UI. |
| Work task | `WorkPage` | ✅ | ✅ | — | |
| Work target | `WorkPage` | ✅ | ⚠️ | — | `PUT /work/targets` unreachable (create only). |
| Work reassign (single) | `WorkPage` | — | ⚠️ | — | Bulk reassign wired; `POST /work/tasks/:id/reassign` not. |
| Welfare enrolment / claim | `WelfarePage` | ✅ | ✅ *(decisions)* | — | |
| Welfare rules | — | — | ⚠️ | — | `PUT /insurance/welfare/rules` has no UI. |
| Micro-insurance product | — | ⚠️ | ⚠️ | — | `POST /insurance/micro/products` has no UI. |
| Governance AGM / dividend / exit | `GovernancePage` | ✅ | ✅ *(decisions)* | — | |
| Program (project / batch / beneficiary / service) | `ProgramsPage`, `ProgramsOpsPage` | ✅ | ✅ *(workflow)* | — | |
| Self-service | `SelfServicePage` | 👁️ | | | Intentional. |

### Highest-impact open gaps here
- **HR onboarding is unreachable**: you can run the whole downstream workflow
  (interview → offer → confirm → payroll) but you cannot create the staff,
  vacancy or applicant records in the first place. This is the largest
  administration gap remaining.

---

## Insights

| Entity | Surface | Create | Edit | Remove | Notes |
|---|---|---|---|---|---|
| Delinquency follow-up / run | `DelinquencyPage` | ✅ | — | — | |
| Delinquency settings | — | — | ⚠️ | — | `PATCH /delinquency/settings` has no UI (read-only in page). |
| Legal notice / waiver / task-complete | — | ⚠️ | ⚠️ | — | `POST /delinquency/legal-notices`, `/waivers`, `/tasks/:id/complete`, `POST /delinquency/savings-adjustments` have no UI. |
| Recovery proposal decision | `RecoveryPage` | ✅ | ✅ | — | Provision/write-off recovery actions wired. |
| Report template (MIS) | `MisPage` | ✅ | ⚠️ | ⚠️ | `PUT`/`DELETE /mis/templates/:id` have no UI. |
| MIS returns | `MisPage` | ✅ | ✅ *(submit)* | — | |
| MIS-ops schedule | `MisOpsPage` | ✅ | ✅ *(run)* | ✅ | |
| MIS-ops complaint | — | ⚠️ | ⚠️ | — | `POST /mis-ops/complaints`, `/:id/action` have no UI. |
| Accounting voucher | `AccountingPage` | ✅ | ✅ *(check/approve)* | — | |
| Accounting chart of accounts | — | ⚠️ | ⚠️ | — | `POST`/`PATCH /accounting/accounts` have no UI. |
| Accounting budget | — | — | ⚠️ | — | `PUT /accounting/budgets` has no UI. |
| Bank reconciliation | `AccountingPage` | ✅ | ✅ *(clear lines)* | — | |
| Communications broadcast / template / rule | `CommsPage` | ✅ | ⚠️ | ⚠️ | |
| Document | `DocsPage` | ✅ | ✅ *(revoke)* | — | |
| Privacy consent / correction | `SecurityPage` | ✅ | ✅ *(decisions)* | — | |
| Privacy retention rules | — | — | ⚠️ | — | `PUT /privacy/retention-rules` has no UI. |
| Security config / device / TOTP | `SecurityPage` | ✅ | ✅ | ⚠️ | No device un-revoke by design. |
| Dashboard, MIS reports, vouchers, passbook, certificates, donor reports | print/report pages | 👁️ | | | Intentional read-only. |

---

## What was closed this session

1. **User purge** — `DELETE /api/v1/users/:id` now hard-deletes a Supabase Auth
   user **even when a `users_profile` row exists**. Ordering is load-bearing:
   the profile row is removed first (so the `0056` audit trigger does not fire
   as the auth-admin role during the cascade), then the credential. On a
   restored-profile failure the row is put back and the admin is told to
   disable instead. Orphan logins (auth user with no profile) are also
   purgeable, scoped by the token's `org_id`.
2. **Org structure setup** — `OrgTreePage` gained a “কাঠামো তৈরি করুন” panel
   that creates **zones** and **area offices**, which the API has always
   exposed but no page called. Without them a fresh organization could not
   commission a branch.
3. **Samity groups & meetings** — `SamitiesPage` gained a “দল ও সভা” panel
   (list + create groups from the samity's members, list + schedule meetings),
   plus the missing `GET /samities/:id/meetings` endpoint. Demo mode returns an
   empty list for both collection endpoints.

## Recommended next gaps, in order

1. **HR onboarding forms** (staff, vacancy, applicant) — the biggest remaining
   hole; nothing else in HR can be exercised on real data without them.
2. **Collection settlement control** — write-off / reschedule / closure
   decisions are a supervisor surface with no UI.
3. **Accounting chart of accounts + budgets** — configuration-only, but blocks
   meaningful accounting setup.
4. **Delinquency legal notices / waivers** — recovery actions with no screen.

---

## Appendix: how this was produced

Both scripts live in `scripts/` and can be re-run from the repo root after UI
or route changes (they read paths relative to the working directory):

- `node scripts/audit-ui-crud.mjs` — per-page write verbs and endpoint list.
- `node scripts/audit-api-ui.mjs` — every API write route vs. its UI callers
  (mount-aware, demo/live deduplicated).

Caveats: static analysis follows literal call paths, so an endpoint reached
only through a dynamically built URL or a shared helper can be reported as a
gap. Items marked ⚠️ above were cross-checked against the page source; the
remaining counts are lower bounds on coverage, not proofs of absence.
