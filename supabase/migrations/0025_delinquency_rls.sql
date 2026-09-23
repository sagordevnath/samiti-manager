-- 0025_delinquency_rls.sql — RLS for the delinquency tables.
-- Reads are org-scoped staff permissions; settings changes are admin-only;
-- follow-ups are writable by any collections-capable staff role.

alter table delinquency_settings       enable row level security;
alter table delinquency_runs           enable row level security;
alter table loan_classifications       enable row level security;
alter table delinquency_cases          enable row level security;
alter table delinquency_follow_ups     enable row level security;
alter table delinquency_tasks          enable row level security;

-- ── Settings: read by staff, write by org admins ────────────────────────────
create policy delinquency_settings_read on delinquency_settings
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy delinquency_settings_write on delinquency_settings
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ── Runs + classifications: staff read, service-role write (nightly job) ────
create policy delinquency_runs_read on delinquency_runs
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy loan_classifications_read on loan_classifications
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

-- ── Cases: staff read; write gated on role (BM clears, officers progress) ───
create policy delinquency_cases_read on delinquency_cases
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy delinquency_cases_write on delinquency_cases
  for update using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy delinquency_cases_insert on delinquency_cases
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'));

-- ── Follow-ups: read staff; write collections-capable roles ─────────────────
create policy delinquency_follow_ups_read on delinquency_follow_ups
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy delinquency_follow_ups_write on delinquency_follow_ups
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

-- ── Tasks: assigned user or staff can read; writers mark done ───────────────
create policy delinquency_tasks_read on delinquency_tasks
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy delinquency_tasks_write on delinquency_tasks
  for update using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy delinquency_tasks_insert on delinquency_tasks
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
