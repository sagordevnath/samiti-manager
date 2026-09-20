-- 0002_rls.sql — Row Level Security so Postgres enforces tenant scoping even
-- if a buggy client hits Supabase directly with the anon key.

create or replace function auth_org_id() returns uuid as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'org_id', '')::uuid;
$$ language sql stable;

create or replace function auth_user_role() returns text as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', 'member');
$$ language sql stable;

-- Helper: can the caller read members in scope?
create or replace function can_read_members() returns boolean as $$
  select auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer');
$$ language sql stable;

alter table organizations    enable row level security;
alter table branches         enable row level security;
alter table samities         enable row level security;
alter table users_profile    enable row level security;
alter table members          enable row level security;
alter table savings_accounts enable row level security;
alter table loans            enable row level security;

-- Super admin sees everything.
create policy orgs_all_super on organizations for all using (auth_org_id() is not null and auth_user_role() = 'super_admin');
create policy branches_all_super on branches for all using (auth_user_role() = 'super_admin');

-- Staff read their org's rows; org_admin manages branches.
create policy branches_read_org on branches for select using (org_id = auth_org_id());
create policy branches_write_admin on branches for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy orgs_read_own on organizations for select using (id = auth_org_id());

create policy samities_read_org on samities for select using (org_id = auth_org_id());
create policy samities_write_staff on samities for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'));

create policy profile_read_self_or_org on users_profile for select using (id = auth.uid() or org_id = auth_org_id());
create policy profile_write_admin on users_profile for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy members_read_org on members for select using (can_read_members() and org_id = auth_org_id());
create policy members_write_staff on members for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy savings_read_org on savings_accounts for select using (org_id = auth_org_id());
create policy savings_write_staff on savings_accounts for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create policy loans_read_org on loans for select using (org_id = auth_org_id());
create policy loans_write_staff on loans for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));
