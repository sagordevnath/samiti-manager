-- 0008_samity_group_rls.sql
-- Row level security for samity, group, meeting attendance and leader history tables.

alter table samities enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table samity_leaders enable row level security;
alter table samity_meetings enable row level security;
alter table meeting_attendance enable row level security;
alter table holiday_calendar enable row level security;
alter table meeting_reschedule_requests enable row level security;
alter table samity_merge_requests enable row level security;

create policy samities_read_org on samities for select using (org_id = auth_org_id());
create policy samities_write_staff on samities for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
);

create policy groups_read_org on groups for select using (org_id = auth_org_id());
create policy groups_write_staff on groups for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
);

create policy group_members_read_org on group_members for select using (org_id = auth_org_id());
create policy group_members_write_staff on group_members for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
);

create policy leaders_read_org on samity_leaders for select using (org_id = auth_org_id());
create policy leaders_write_staff on samity_leaders for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
);

create policy meeting_read_org on samity_meetings for select using (org_id = auth_org_id());
create policy meeting_write_staff on samity_meetings for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
);

create policy attendance_read_org on meeting_attendance for select using (org_id = auth_org_id());
create policy attendance_write_staff on meeting_attendance for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
);

create policy holiday_read_org on holiday_calendar for select using (org_id = auth_org_id());
create policy holiday_write_staff on holiday_calendar for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
);

create policy reschedule_read_org on meeting_reschedule_requests for select using (org_id = auth_org_id());
create policy reschedule_write_staff on meeting_reschedule_requests for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
);

create policy merge_read_org on samity_merge_requests for select using (org_id = auth_org_id());
create policy merge_write_staff on samity_merge_requests for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
);
