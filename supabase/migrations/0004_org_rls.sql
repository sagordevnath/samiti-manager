-- 0004_org_rls.sql — RLS for the Organization Structure module.

create or replace function can_manage_branches() returns boolean as $$
  select auth_user_role() in ('super_admin', 'org_admin', 'area_manager');
$$ language sql stable;

alter table zones             enable row level security;
alter table areas             enable row level security;
alter table working_areas     enable row level security;
alter table branch_openings   enable row level security;
alter table staff_assignments enable row level security;

-- ── Zones / Areas ────────────────────────────────────────────────────────────
create policy zones_read_org on zones for select using (org_id = auth_org_id());
create policy zones_write_admin on zones for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin'));

create policy areas_read_org on areas for select using (org_id = auth_org_id());
create policy areas_write_admin on areas for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin'));

-- ── Branches (extends 0002 policies with area-manager writes + close guard) ──
create policy branches_write_area on branches for update using (org_id = auth_org_id() and can_manage_branches());

-- ── Working areas ────────────────────────────────────────────────────────────
create policy working_areas_read_org on working_areas for select using (org_id = auth_org_id());
create policy working_areas_write_staff on working_areas for all using (
  org_id = auth_org_id() and can_manage_branches()
);

-- ── Branch openings ──────────────────────────────────────────────────────────
create policy openings_read_org on branch_openings for select using (org_id = auth_org_id());
create policy openings_insert_area on branch_openings for insert with check (
  org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'area_manager')
);
create policy openings_update_admin on branch_openings for update using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin')
);

-- ── Staff assignments ────────────────────────────────────────────────────────
create policy staff_read_org on staff_assignments for select using (org_id = auth_org_id());
create policy staff_write_admin on staff_assignments for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin')
);
