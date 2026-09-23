-- 0035_hr_payroll_rls.sql — RLS for payroll, PF, performance and discipline.
-- Staff see only their own rows (self-service, req 9); staff-facing HR data is
-- readable by any staff-permission role; disciplinary cases are restricted to
-- HR/Director-level roles (super_admin / org_admin).

-- Reuse helpers from 0002_rls.sql: auth_org_id(), auth_user_role().

-- ── Salary structures ───────────────────────────────────────────────────────
alter table salary_structures enable row level security;
create policy "salary_structures_read" on salary_structures
  for select to authenticated
  using (org_id = auth_org_id());
create policy "salary_structures_admin" on salary_structures
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ── Payroll: staff see their own lines; staff roles manage runs ─────────────
alter table payroll_runs enable row level security;
create policy "payroll_runs_read" on payroll_runs
  for select to authenticated
  using (org_id = auth_org_id());
create policy "payroll_runs_write" on payroll_runs
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'));

alter table payroll_lines enable row level security;
create policy "payroll_lines_read_own" on payroll_lines
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      staff_id::text = auth.uid()::text
      or auth_user_role() in ('super_admin','org_admin','branch_manager','area_manager')
    )
  );

-- ── PF ledger: staff see their own ledger; finance manages ─────────────────
alter table pf_ledger enable row level security;
create policy "pf_ledger_read_own" on pf_ledger
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      staff_id::text = auth.uid()::text
      or auth_user_role() in ('super_admin','org_admin','branch_manager')
    )
  );
create policy "pf_ledger_write" on pf_ledger
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

alter table gratuity_settlements enable row level security;
create policy "gratuity_read" on gratuity_settlements
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      staff_id::text = auth.uid()::text
      or auth_user_role() in ('super_admin','org_admin','branch_manager')
    )
  );
create policy "gratuity_write" on gratuity_settlements
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ── KPI + appraisal: own rows or staff-capable roles ────────────────────────
alter table kpi_scorecards enable row level security;
create policy "kpi_read" on kpi_scorecards
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      staff_id::text = auth.uid()::text
      or auth_user_role() in ('super_admin','org_admin','branch_manager','area_manager')
    )
  );
create policy "kpi_write" on kpi_scorecards
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'));

alter table staff_appraisals enable row level security;
create policy "appraisal_read" on staff_appraisals
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      staff_id::text = auth.uid()::text
      or auth_user_role() in ('super_admin','org_admin','branch_manager','area_manager')
    )
  );
create policy "appraisal_write" on staff_appraisals
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'));

-- ── Disciplinary: HR/Director only (super_admin / org_admin) ────────────────
alter table disciplinary_cases enable row level security;
create policy "discipline_read" on disciplinary_cases
  for select to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));
create policy "discipline_write" on disciplinary_cases
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));
