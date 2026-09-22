-- 0015_loan_governance_rls.sql — RLS for the governance tables added in 0014.

alter table loan_approval_matrix    enable row level security;
alter table loan_installments       enable row level security;
alter table loan_utilization_plans  enable row level security;

-- ── Approval matrix: staff read, admins write ────────────────────────────────
create policy loan_matrix_read_staff on loan_approval_matrix for select
  using (org_id = auth_org_id());

create policy loan_matrix_write_admin on loan_approval_matrix for all
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin'));

-- ── Installments: staff read; writes via disbursal/collection service only ──
create policy loan_installments_read_staff on loan_installments for select
  using (org_id = auth_org_id());

create policy loan_installments_write_admin on loan_installments for all
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager'));

-- ── Utilization plans: staff read; officers capture, managers verify ────────
create policy loan_utilization_read_staff on loan_utilization_plans for select
  using (org_id = auth_org_id());

create policy loan_utilization_write_staff on loan_utilization_plans for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer'));

create policy loan_utilization_update_staff on loan_utilization_plans for update
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer'));
