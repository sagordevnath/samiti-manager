-- 0049_reports_mis_rls.sql — RLS for Reports/MIS tables.
-- Templates & returns are finance/admin-managed; all staff read dashboards and
-- standard reports of their own org. The audit log is append-only for readers.

alter table report_templates            enable row level security;
alter table regulatory_returns          enable row level security;
alter table mis_snapshots               enable row level security;
alter table mis_formula_values          enable row level security;
alter table staff_productivity_monthly  enable row level security;
alter table report_audit_log            enable row level security;

-- ── Templates: staff read; admins/finance manage ────────────────────────────
create policy "report_templates_read" on report_templates
  for select to authenticated
  using (org_id = auth_org_id());

create policy "report_templates_manage" on report_templates
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ── Generated returns: staff read; finance/admin generate & submit ──────────
create policy "regulatory_returns_read" on regulatory_returns
  for select to authenticated
  using (org_id = auth_org_id());

create policy "regulatory_returns_manage" on regulatory_returns
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ── Snapshots & formula values: org-scoped read; service role maintains ─────
create policy "mis_snapshots_read" on mis_snapshots
  for select to authenticated
  using (org_id = auth_org_id());

create policy "mis_snapshots_write" on mis_snapshots
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  );

create policy "mis_formula_values_read" on mis_formula_values
  for select to authenticated
  using (org_id = auth_org_id());

create policy "mis_formula_values_write" on mis_formula_values
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  );

-- ── Staff productivity: org read; managers/accountant write ─────────────────
create policy "staff_productivity_read" on staff_productivity_monthly
  for select to authenticated
  using (org_id = auth_org_id());

create policy "staff_productivity_write" on staff_productivity_monthly
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ── Audit log: org read; every report pull appends ──────────────────────────
create policy "report_audit_read" on report_audit_log
  for select to authenticated
  using (org_id = auth_org_id());

create policy "report_audit_insert" on report_audit_log
  for insert to authenticated
  with check (org_id = auth_org_id() and requested_by = auth_user_id());

-- No update/delete policies on report_audit_log: rows are immutable.
