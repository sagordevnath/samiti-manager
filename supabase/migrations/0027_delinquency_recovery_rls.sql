-- 0027_delinquency_recovery_rls.sql — RLS for the recovery tables.
-- Staff read; workflow writes role-gated (BM+ create, AM/admin decide).

alter table delinquency_root_causes        enable row level security;
alter table loan_waivers                   enable row level security;
alter table loan_savings_adjustments       enable row level security;
alter table loan_legal_notices             enable row level security;
alter table loan_write_off_proposals       enable row level security;
alter table loan_write_off_recoveries      enable row level security;
alter table loan_loss_provision_proposals  enable row level security;
alter table early_warning_signals          enable row level security;
alter table early_warning_scans            enable row level security;

-- Staff can read every recovery artifact for their org.
create policy recovery_read on delinquency_root_causes
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_waivers on loan_waivers
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_adjustments on loan_savings_adjustments
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_notices on loan_legal_notices
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_proposals on loan_write_off_proposals
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_recoveries on loan_write_off_recoveries
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_provisions on loan_loss_provision_proposals
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_warnings on early_warning_signals
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_scans on early_warning_scans
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

-- Writes: BM+ can create; decisions restricted by app logic per table.
create policy recovery_write_causes on delinquency_root_causes
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_write_waivers on loan_waivers
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'));
create policy recovery_write_adjustments on loan_savings_adjustments
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'));
create policy recovery_write_notices on loan_legal_notices
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'));
create policy recovery_write_proposals on loan_write_off_proposals
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'));
create policy recovery_write_recoveries on loan_write_off_recoveries
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_write_provisions on loan_loss_provision_proposals
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));
create policy recovery_write_warnings on early_warning_signals
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_write_scans on early_warning_scans
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
