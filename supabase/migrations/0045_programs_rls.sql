-- 0045_programs_rls.sql — RLS for programs & projects tables.
-- Staff read org-scoped; project/logframe/activity/batch writes are
-- program-manager-level (admins + manager/officer roles); beneficiaries and
-- service records are writable by all field staff; indicator values are
-- evidence-tracked writes.

alter table projects               enable row level security;
alter table project_budget_lines   enable row level security;
alter table logframe_entries       enable row level security;
alter table indicator_values       enable row level security;
alter table beneficiaries          enable row level security;
alter table program_enrollments    enable row level security;
alter table program_services       enable row level security;
alter table program_activities     enable row level security;
alter table training_batches       enable row level security;
alter table training_attendance    enable row level security;
alter table training_test_scores   enable row level security;
alter table training_certificates  enable row level security;

-- ── Projects: staff read; admins/program roles manage ───────────────────────
create policy "projects_read" on projects
  for select to authenticated
  using (org_id = auth_org_id());

create policy "projects_manage" on projects
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

create policy "budget_lines_read" on project_budget_lines
  for select to authenticated
  using (org_id = auth_org_id());

create policy "budget_lines_manage" on project_budget_lines
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ── Logframe: staff read; program roles author, all staff add values ────────
create policy "logframe_read" on logframe_entries
  for select to authenticated
  using (org_id = auth_org_id());

create policy "logframe_manage" on logframe_entries
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

create policy "indicator_values_read" on indicator_values
  for select to authenticated
  using (org_id = auth_org_id());

create policy "indicator_values_write" on indicator_values
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

-- ── Beneficiaries & services: all field staff write ──────────────────────────
create policy "beneficiaries_read" on beneficiaries
  for select to authenticated
  using (org_id = auth_org_id());

create policy "beneficiaries_write" on beneficiaries
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

create policy "enrollments_read" on program_enrollments
  for select to authenticated
  using (org_id = auth_org_id());

create policy "enrollments_write" on program_enrollments
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

create policy "services_read" on program_services
  for select to authenticated
  using (org_id = auth_org_id());

create policy "services_write" on program_services
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

-- ── Activities & batches: program roles manage; staff read ──────────────────
create policy "activities_read" on program_activities
  for select to authenticated
  using (org_id = auth_org_id());

create policy "activities_write" on program_activities
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

create policy "batches_read" on training_batches
  for select to authenticated
  using (org_id = auth_org_id());

create policy "batches_manage" on training_batches
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ── Attendance, scores: field staff write ────────────────────────────────────
create policy "attendance_read" on training_attendance
  for select to authenticated
  using (org_id = auth_org_id());

create policy "attendance_write" on training_attendance
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

create policy "scores_read" on training_test_scores
  for select to authenticated
  using (org_id = auth_org_id());

create policy "scores_write" on training_test_scores
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

-- ── Certificates: admins/program roles issue; staff read ────────────────────
create policy "certificates_read" on training_certificates
  for select to authenticated
  using (org_id = auth_org_id());

create policy "certificates_manage" on training_certificates
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );
