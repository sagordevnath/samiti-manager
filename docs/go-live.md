# Go-Live Checklist & Training Plan

Module 17, requirements 9–10. Work through every section in order; an
unchecked box blocks go-live.

## 1. Environment separation

- [ ] Three Supabase projects exist: **dev**, **staging**, **prod** (all free tier).
- [ ] Migrations applied in order on each: `npm run db:migrate` with that project's `SUPABASE_DB`.
- [ ] Infisical project has separate environments for dev / staging / prod; the API `start` script reads `--env=prod` in production (see `docs/infisical.md`).
- [ ] A machine identity with Universal Auth exists for the production process, scoped to the prod environment only.
- [ ] `.infisical.json` committed; no `.env` files anywhere in the working copy.

## 2. Data & configuration

- [ ] Real org hierarchy seeded: zones → areas → branches → working areas (CSV import).
- [ ] Branches created with codes, GPS, cash limits and manager assignments.
- [ ] Loan products configured and rate caps validated against the latest MRA circular (the 27% default is editable and must be re-checked).
- [ ] Savings products configured (compulsory link, withdrawal rules, interest posting cadence).
- [ ] Eligibility rules set per org policy (age range, land ceiling, one-member-per-household).
- [ ] Chart of accounts reviewed; event-to-journal mappings verified with test postings.
- [ ] Regulatory report templates verified against the latest MRA/PKSF circulars (the ⚠ verification badge must be cleared by a compliance officer).
- [ ] Seed demo data removed from prod (`npm run db:seed` is dev-only).

## 3. Security

- [ ] All staff accounts use real emails; demo sessions disabled in prod (`NODE_ENV=production`, no placeholder Supabase values).
- [ ] Password policy active; TOTP 2FA enrolled for Head Office roles.
- [ ] Finance-role IP allow-list configured (or consciously disabled and recorded).
- [ ] RLS matrix passes: `GET /api/v1/security/rls-matrix` shows every cross-branch probe denied.
- [ ] `npm run secrets:scan` run on the final commit history; any leaked value rotated.
- [ ] Unmask-audit reviewed: `GET /api/v1/security/unmask-log` empty or justified at go-live.

## 4. Verification runs

- [ ] Full test suite green: `npm test` (shared + api + web).
- [ ] Day-end rehearsal on staging: collection → cash handover → day-end close → trial balance matches cash book.
- [ ] One full loan cycle rehearsed: application → approval → disbursement → 4 collections → utilization visit → closure.
- [ ] Backup restore test passed (see `scripts/backup.sh` restore section) into a throwaway project.
- [ ] Load sanity: disbursement-day queue with ~50 loans on staging completes without rate-limit errors.

## 5. Monitoring & support

- [ ] Health check wired to an uptime monitor (free: UptimeRobot pinging `/api/v1/health`).
- [ ] Sentry (free plan) DSN set for web + api, or structured pino logs shipped to a free log drain.
- [ ] Nightly backup workflow green for 3 consecutive days.
- [ ] Support rota named: who receives complaints, who can unlock accounts, who approves write-offs.

## 6. User training plan

| Session | Audience | Duration | Content |
| ------- | -------- | -------- | ------- |
| 1. Orientation | All staff | 2h | Roles and permissions, dashboard, Bangla/English toggle, mobile PWA install |
| 2. Field officers | Field officers | 1 day | Meeting screen, offline collection, cash handover, receipts, follow-ups |
| 3. Branch office | BM + accountant | 1 day | Admission wizard, disbursement two-step control, day-end, vouchers, reports |
| 4. Area/HO | AM, HO, audit | half day | Targets, approval inbox, audit plans, MIS dashboards, regulatory returns |
| 5. Refresh & drills | All | monthly | 30-minute refresher + one scripted failure drill (offline day, wrong entry, freeze) |

Training principles: train on **staging with demo data**, never prod; every
session ends with each attendee completing one real workflow unaided; the
offline-mode drill is mandatory for field officers before branch rollout.

## 7. Rollout

- [ ] Pilot in one branch for two full weeks; daily feedback captured.
- [ ] Paper parallel-run: the branch keeps its paper cash book for the pilot and the two records are reconciled daily.
- [ ] Pilot exit criteria met: zero unexplained cash differences over 5 days, PAR data matching paper records, all officers posting from the meeting screen.
- [ ] Roll out branch-by-branch (2–3 branches per week), never all at once.
- [ ] hypercare: named person available for the first month after each branch cutover.
