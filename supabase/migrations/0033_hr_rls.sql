-- 0033_hr_rls.sql — RLS for HR tables. Staff records are org-scoped; NID/bank
-- ciphertext columns are additionally only exposed through the service-role
-- client (see API layer). HR administration is admin-level; supervisors
-- decide leave.

alter table hr_staff            enable row level security;
alter table hr_staff_postings   enable row level security;
alter table hr_staff_education  enable row level security;
alter table hr_vacancies        enable row level security;
alter table hr_applicants       enable row level security;
alter table hr_attendance       enable row level security;
alter table hr_leave_requests   enable row level security;
alter table hr_holidays         enable row level security;
alter table hr_movements        enable row level security;

create policy "hr_staff_read" on hr_staff
  for select using (org_id = auth_org_id());
create policy "hr_staff_write" on hr_staff
  for all using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

create policy "hr_staff_postings_read" on hr_staff_postings
  for select using (org_id = auth_org_id());
create policy "hr_staff_postings_write" on hr_staff_postings
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy "hr_staff_education_read" on hr_staff_education
  for select using (org_id = auth_org_id());
create policy "hr_staff_education_write" on hr_staff_education
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'));

create policy "hr_vacancies_read" on hr_vacancies
  for select using (org_id = auth_org_id());
create policy "hr_vacancies_request" on hr_vacancies
  for insert with check (org_id = auth_org_id());
create policy "hr_vacancies_decide" on hr_vacancies
  for update using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy "hr_applicants_read" on hr_applicants
  for select using (org_id = auth_org_id());
create policy "hr_applicants_write" on hr_applicants
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','area_manager'));

create policy "hr_attendance_read" on hr_attendance
  for select using (org_id = auth_org_id());
create policy "hr_attendance_write" on hr_attendance
  for insert with check (org_id = auth_org_id());

create policy "hr_leave_read" on hr_leave_requests
  for select using (org_id = auth_org_id());
create policy "hr_leave_request" on hr_leave_requests
  for insert with check (org_id = auth_org_id());
create policy "hr_leave_decide" on hr_leave_requests
  for update using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

create policy "hr_holidays_read" on hr_holidays
  for select using (org_id = auth_org_id());
create policy "hr_holidays_admin" on hr_holidays
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy "hr_movements_read" on hr_movements
  for select using (org_id = auth_org_id());
create policy "hr_movements_write" on hr_movements
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));
