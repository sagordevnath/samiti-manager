-- 0007_samity_group_module.sql
-- Samity / center / group workflow with meeting scheduling, attendance, leader rotation and approvals.

create type samity_status as enum ('forming', 'active', 'paused', 'closed', 'merged', 'split');
create type group_status as enum ('forming', 'active', 'paused', 'closed');
create type samity_formation_stage as enum ('projection_recorded', 'group_formed', 'observation_period', 'active');
create type meeting_status as enum ('scheduled', 'in_progress', 'closed', 'cancelled', 'rescheduled');
create type leader_rotation_status as enum ('active', 'review');

create table samities (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  branch_id         uuid not null references branches (id) on delete cascade,
  code              text not null,
  name              text not null,
  village           text not null,
  meeting_day       text not null default 'friday',
  meeting_time      time not null default '17:30:00',
  meeting_place     text not null,
  field_officer_id  uuid references auth.users (id) on delete set null,
  status            samity_status not null default 'forming',
  formation_stage   samity_formation_stage not null default 'projection_recorded',
  projection_note   text,
  projected_at      timestamptz,
  observed_at       timestamptz,
  activated_at      timestamptz,
  archived_at       timestamptz,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (org_id, branch_id, code)
);

create index samities_org_idx on samities (org_id) where deleted_at is null;
create index samities_field_officer_idx on samities (field_officer_id) where deleted_at is null;

create table groups (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations (id) on delete cascade,
  samity_id        uuid not null references samities (id) on delete cascade,
  name             text not null,
  status           group_status not null default 'forming',
  member_count     int not null default 0,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (samity_id, name)
);

create table group_members (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  group_id          uuid not null references groups (id) on delete cascade,
  member_id         uuid not null references members (id) on delete cascade,
  joined_at         date not null default current_date,
  status            text not null default 'active' check (status in ('active', 'left', 'transferred')),
  is_leader         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (group_id, member_id)
);

create table samity_leaders (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations (id) on delete cascade,
  samity_id        uuid not null references samities (id) on delete cascade,
  chief_name       text not null,
  deputy_name      text not null,
  secretary_name   text not null,
  rotation_start   date not null,
  rotation_end     date not null,
  status           leader_rotation_status not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create table samity_meetings (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  samity_id         uuid not null references samities (id) on delete cascade,
  meeting_date      date not null,
  start_time        time not null,
  end_time          time not null,
  status            meeting_status not null default 'scheduled',
  gps_lat           numeric(9, 6),
  gps_lng           numeric(9, 6),
  attendance_total  int not null default 0,
  cash_total        numeric(14,2) not null default 0,
  notes             text,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create table meeting_attendance (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations (id) on delete cascade,
  meeting_id          uuid not null references samity_meetings (id) on delete cascade,
  member_id           uuid not null references members (id) on delete cascade,
  present             boolean not null default false,
  savings_amount      numeric(14,2) not null default 0,
  installment_amount  numeric(14,2) not null default 0,
  checkin_at          timestamptz,
  checkin_lat         numeric(9, 6),
  checkin_lng         numeric(9, 6),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  unique (meeting_id, member_id)
);

create table holiday_calendar (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  date          date not null,
  reason        text not null,
  is_closed     boolean not null default true,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (org_id, date)
);

create table meeting_reschedule_requests (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  meeting_id        uuid not null references samity_meetings (id) on delete cascade,
  requested_date    date not null,
  reason            text not null,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by      uuid references auth.users (id) on delete set null,
  reviewed_by       uuid references auth.users (id) on delete set null,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create table samity_merge_requests (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations (id) on delete cascade,
  source_samity_id    uuid not null references samities (id) on delete cascade,
  target_samity_id    uuid references samities (id) on delete set null,
  reason              text not null,
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by         uuid references auth.users (id) on delete set null,
  approved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['samities','groups','group_members','samity_leaders','samity_meetings','meeting_attendance','holiday_calendar','meeting_reschedule_requests','samity_merge_requests']
  loop
    execute format('drop trigger if exists trg_touch_%1$s on %1$s', t);
    execute format('create trigger trg_touch_%1$s before update on %1$s for each row execute function touch_updated_at()', t);
  end loop;
end;
$$;

create index if not exists groups_samity_idx on groups (samity_id) where deleted_at is null;
create index if not exists group_members_member_idx on group_members (member_id) where deleted_at is null;
create index if not exists samity_meetings_date_idx on samity_meetings (meeting_date) where deleted_at is null;
create index if not exists meeting_attendance_member_idx on meeting_attendance (member_id) where deleted_at is null;
