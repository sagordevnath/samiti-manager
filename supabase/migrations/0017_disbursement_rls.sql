-- 0017_disbursement_rls.sql — RLS for disbursement, holidays, cash limits and
-- the stored repayment schedule. Same shape as 0013/0015: org-scoped reads,
-- role-gated writes, service role bypasses RLS for server-side flows.

alter table branch_cash_limits        enable row level security;
alter table loan_holidays             enable row level security;
alter table loan_disbursements        enable row level security;
alter table loan_repayment_schedule   enable row level security;

-- ── branch_cash_limits ───────────────────────────────────────────────────────
drop policy if exists branch_cash_limits_read on branch_cash_limits;
create policy branch_cash_limits_read on branch_cash_limits
  for select using (org_id = auth_org_id());

drop policy if exists branch_cash_limits_write on branch_cash_limits;
create policy branch_cash_limits_write on branch_cash_limits
  for all using (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'branch_manager'));

-- ── loan_holidays ────────────────────────────────────────────────────────────
drop policy if exists loan_holidays_read on loan_holidays;
create policy loan_holidays_read on loan_holidays
  for select using (org_id = auth_org_id());

drop policy if exists loan_holidays_write on loan_holidays;
create policy loan_holidays_write on loan_holidays
  for all using (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'area_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'area_manager'));

-- ── loan_disbursements ───────────────────────────────────────────────────────
drop policy if exists loan_disbursements_read on loan_disbursements;
create policy loan_disbursements_read on loan_disbursements
  for select using (org_id = auth_org_id());

drop policy if exists loan_disbursements_write on loan_disbursements;
create policy loan_disbursements_write on loan_disbursements
  for all using (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'branch_manager', 'account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'branch_manager', 'account_officer'));

-- ── loan_repayment_schedule ──────────────────────────────────────────────────
drop policy if exists loan_repayment_schedule_read on loan_repayment_schedule;
create policy loan_repayment_schedule_read on loan_repayment_schedule
  for select using (org_id = auth_org_id());

-- Rows are written only by the disbursement service (service role) and
-- repayment posting later; staff get no direct insert.
drop policy if exists loan_repayment_schedule_update on loan_repayment_schedule;
create policy loan_repayment_schedule_update on loan_repayment_schedule
  for update using (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'branch_manager', 'account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'branch_manager', 'account_officer'));
