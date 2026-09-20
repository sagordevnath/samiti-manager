-- 0003_org_structure.sql — Organization Structure module.
-- Hierarchy: Head Office → Zone → Area → Branch → Center/Samity/VO → Group.
-- Working areas are villages; a village belongs to at most one branch.

-- ── Enums ────────────────────────────────────────────────────────────────────
create type branch_status as enum ('planned', 'active', 'closed');
create type opening_stage as enum ('proposed', 'director_approved', 'checklist_done', 'activated', 'rejected');

-- ── Zones (Head Office layer) ────────────────────────────────────────────────
create table zones (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  code        text not null,
  name        text not null,
  name_bn     text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (org_id, code)
);
create index zones_org_idx on zones (org_id) where deleted_at is null;

-- ── Areas (Zone layer) ───────────────────────────────────────────────────────
create table areas (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  zone_id     uuid not null references zones (id) on delete cascade,
  code        text not null,
  name        text not null,
  name_bn     text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (org_id, code)
);
create index areas_zone_idx on areas (zone_id) where deleted_at is null;

-- ── Extend branches (0001) into full branch profiles ─────────────────────────
alter table branches
  add column if not exists area_id         uuid references areas (id) on delete set null,
  add column if not exists status          branch_status not null default 'planned',
  add column if not exists opening_date    date,
  add column if not exists address         text,
  add column if not exists gps_lat         numeric(9, 6),
  add column if not exists gps_lng         numeric(9, 6),
  add column if not exists manager_user_id uuid references auth.users (id) on delete set null;

create index if not exists branches_area_idx on branches (area_id) where deleted_at is null;

-- ── Working areas: villages with Bangladesh geo hierarchy + survey data ──────
create table working_areas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  division        text not null,
  district        text not null,
  upazila         text not null,
  "union"         text,
  village         text not null,
  division_bn     text,
  district_bn     text,
  upazila_bn      text,
  union_bn        text,
  village_bn      text,
  population      int check (population >= 0),
  households      int check (households >= 0),
  market_days     text,
  competitor_mfis int not null default 0 check (competitor_mfis >= 0),
  potential_score int not null default 3 check (potential_score between 1 and 5),
  gps_lat         numeric(9, 6),
  gps_lng         numeric(9, 6),
  -- A village belongs to at most one branch; null = surveyed but unassigned.
  branch_id       uuid references branches (id) on delete set null,
  surveyed_at     timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- Village identity: one row per geo path per org (the one-branch-per-village
-- rule is structural — assignment moves branch_id, it never duplicates rows).
create unique index working_areas_geo_uidx on working_areas (
  org_id, division, district, upazila, coalesce("union", ''), village
) where deleted_at is null;

create index working_areas_branch_idx on working_areas (branch_id) where deleted_at is null and branch_id is not null;
create index working_areas_org_idx on working_areas (org_id) where deleted_at is null;

-- ── Branch opening workflow (proposal → approval → checklist → activation) ───
create table branch_openings (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  branch_id       uuid not null references branches (id) on delete cascade,
  stage           opening_stage not null default 'proposed',
  proposal_note   text not null,
  proposed_by     uuid references auth.users (id) on delete set null,
  proposed_at     timestamptz not null default now(),
  director_by     uuid references auth.users (id) on delete set null,
  director_at     timestamptz,
  director_note   text,
  checklist       jsonb not null default '[]'::jsonb,
  checklist_by    uuid references auth.users (id) on delete set null,
  checklist_at    timestamptz,
  activated_by    uuid references auth.users (id) on delete set null,
  activated_at    timestamptz,
  rejected_note   text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- One live opening per branch.
create unique index branch_openings_live_uidx on branch_openings (branch_id)
  where deleted_at is null and stage in ('proposed', 'director_approved', 'checklist_done');

-- ── Staff-to-branch assignments with transfer history ────────────────────────
create extension if not exists btree_gist;

create table staff_assignments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  branch_id       uuid not null references branches (id) on delete cascade,
  role_at_branch  user_role not null default 'branch_manager',
  effective_from  date not null,
  effective_to    date,
  note            text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index staff_assignments_user_idx on staff_assignments (user_id) where deleted_at is null;
create index staff_assignments_branch_idx on staff_assignments (branch_id) where deleted_at is null;

-- A staff member cannot hold two overlapping assignments.
alter table staff_assignments add constraint staff_no_overlap exclude using gist (
  user_id with =,
  daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[)') with &&
) where (deleted_at is null);

-- ── Business rule: closing a branch requires zero active centers ─────────────
create or replace function prevent_branch_close_with_centers() returns trigger as $$
begin
  if new.status = 'closed' and (old.status is distinct from 'closed') then
    if exists (
      select 1 from samities s
      where s.branch_id = new.id and s.deleted_at is null
    ) then
      raise exception 'BRANCH_HAS_ACTIVE_CENTERS: transfer all centers before closing branch %', new.code;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_branch_close_guard on branches;
create trigger trg_branch_close_guard
  before update of status on branches
  for each row execute function prevent_branch_close_with_centers();

-- ── updated_at triggers for the new tables ───────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['zones','areas','working_areas','branch_openings','staff_assignments']
  loop
    execute format('drop trigger if exists trg_touch_%1$s on %1$s', t);
    execute format('create trigger trg_touch_%1$s before update on %1$s for each row execute function touch_updated_at()', t);
  end loop;
end;
$$;
