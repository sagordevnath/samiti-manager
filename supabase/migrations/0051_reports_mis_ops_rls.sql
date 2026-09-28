-- 0051_reports_mis_ops_rls.sql — RLS for MIS ops tables (reqs 5–10).
-- Complaints: all staff read (aggregate indicators need it); managers/admins
-- act, field staff open. Saved reports: owner + shared roles + admins.
-- Freezes: admin-only write; everyone reads (guards must check).

alter table complaints         enable row level security;
alter table saved_reports      enable row level security;
alter table export_schedules   enable row level security;
alter table export_deliveries  enable row level security;
alter table month_freezes      enable row level security;

-- ── Complaints: org read; staff open; managers resolve; nobody deletes ──────
create policy "complaints_read" on complaints
  for select to authenticated
  using (org_id = auth_org_id());

create policy "complaints_insert" on complaints
  for insert to authenticated
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  );

create policy "complaints_update" on complaints
  for update to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

-- No delete policy: the grievance register is append/transition-only.

-- ── Saved reports: owner or shared-role or admin ────────────────────────────
create policy "saved_reports_read" on saved_reports
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      owner_user_id = auth_user_id()
      or shared_with_roles ? auth_user_role()
      or auth_user_role() in ('super_admin','org_admin')
    )
  );

create policy "saved_reports_write" on saved_reports
  for all to authenticated
  using (
    org_id = auth_org_id()
    and (
      owner_user_id = auth_user_id()
      or auth_user_role() in ('super_admin','org_admin')
    )
  )
  with check (
    org_id = auth_org_id()
    and (
      owner_user_id = auth_user_id()
      or auth_user_role() in ('super_admin','org_admin')
    )
  );

-- ── Export schedules: creator + admins manage; managers read ────────────────
create policy "export_schedules_read" on export_schedules
  for select to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

create policy "export_schedules_manage" on export_schedules
  for all to authenticated
  using (
    org_id = auth_org_id()
    and (
      created_by = auth_user_id()
      or auth_user_role() in ('super_admin','org_admin')
    )
  )
  with check (
    org_id = auth_org_id()
    and (
      created_by = auth_user_id()
      or auth_user_role() in ('super_admin','org_admin')
    )
  );

create policy "export_deliveries_read" on export_deliveries
  for select to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- Deliveries are written by the service role (cron); no app-role insert.

-- ── Month freezes: admin-only write; org read ───────────────────────────────
create policy "month_freezes_read" on month_freezes
  for select to authenticated
  using (org_id = auth_org_id());

create policy "month_freezes_manage" on month_freezes
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  );
