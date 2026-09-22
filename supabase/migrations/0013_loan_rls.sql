-- 0013_loan_rls.sql — RLS for the loan module. Reads are org-scoped for
-- staff; writes are role-gated. Policy updates are admin-only.

alter table loan_policies           enable row level security;
alter table loan_products           enable row level security;
alter table loan_applications       enable row level security;
alter table loan_application_steps  enable row level security;

-- ── Policies ─────────────────────────────────────────────────────────────────
create policy loan_policies_read_staff on loan_policies for select
  using (org_id = auth_org_id());

create policy loan_policies_write_admin on loan_policies for all
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin'));

create policy loan_products_read_staff on loan_products for select
  using (org_id = auth_org_id());

create policy loan_products_write_staff on loan_products for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager'));

create policy loan_products_update_staff on loan_products for update
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager'));

-- Applications: any staff can read; creation is officer/manager level.
create policy loan_applications_read_staff on loan_applications for select
  using (org_id = auth_org_id());

create policy loan_applications_insert_staff on loan_applications for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer'));

create policy loan_applications_update_staff on loan_applications for update
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'area_manager', 'account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'area_manager', 'account_officer'));

-- Steps are an append-only audit trail; write at application-edit level.
create policy loan_application_steps_read_staff on loan_application_steps for select
  using (org_id = auth_org_id());

create policy loan_application_steps_insert_staff on loan_application_steps for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'area_manager', 'account_officer'));

-- touch trigger for updated_at on loan_applications (function exists from 0001).
drop trigger if exists trg_touch_loan_applications on loan_applications;
create trigger trg_touch_loan_applications before update on loan_applications
for each row execute function touch_updated_at();

drop trigger if exists trg_touch_loan_products on loan_products;
create trigger trg_touch_loan_products before update on loan_products
for each row execute function touch_updated_at();

drop trigger if exists trg_touch_loan_policies on loan_policies;
create trigger trg_touch_loan_policies before update on loan_policies
for each row execute function touch_updated_at();
