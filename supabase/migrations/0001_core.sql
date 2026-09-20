-- 0001_core.sql — extensions, core org tables, roles/permissions enums.
-- Conventions: uuid PKs, org_id/branch_id scoping, created_by, created_at,
-- updated_at, deleted_at (soft delete). Money: numeric(14,2) BDT. Dates: UTC.

create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────────
create type user_role as enum ('super_admin', 'org_admin', 'area_manager', 'branch_manager', 'account_officer', 'member');
create type member_status as enum ('active', 'inactive', 'closed');

-- ── Organizations ────────────────────────────────────────────────────────────
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_bn     text,
  code        text not null unique,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ── Branches ─────────────────────────────────────────────────────────────────
create table branches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  name        text not null,
  name_bn     text,
  code        text not null unique,
  district    text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index branches_org_idx on branches (org_id) where deleted_at is null;

-- ── Samities (weekly savings/loan groups) ────────────────────────────────────
create table samities (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  branch_id    uuid not null references branches (id) on delete cascade,
  name         text not null,
  meeting_day  text not null default 'friday',
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index samities_branch_idx on samities (branch_id) where deleted_at is null;

-- ── User profiles (1:1 with auth.users) ──────────────────────────────────────
create table users_profile (
  id          uuid primary key references auth.users (id) on delete cascade,
  org_id      uuid references organizations (id) on delete set null,
  branch_id   uuid references branches (id) on delete set null,
  role        user_role not null default 'member',
  full_name   text not null,
  phone       text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index users_profile_org_idx on users_profile (org_id) where deleted_at is null;

-- ── Members ──────────────────────────────────────────────────────────────────
create table members (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  branch_id     uuid not null references branches (id) on delete cascade,
  samity_id     uuid references samities (id) on delete set null,
  member_code   text unique,
  full_name     text not null,
  phone         text not null,
  national_id   text,
  status        member_status not null default 'active',
  join_date     date not null default current_date,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index members_branch_idx on members (branch_id) where deleted_at is null;
create index members_org_idx on members (org_id) where deleted_at is null;

-- ── Savings accounts (money numeric(14,2) BDT) ───────────────────────────────
create table savings_accounts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  branch_id     uuid not null references branches (id) on delete cascade,
  member_id     uuid not null references members (id) on delete cascade,
  product       text not null default 'general',
  balance       numeric(14,2) not null default 0 check (balance >= 0),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index savings_member_idx on savings_accounts (member_id) where deleted_at is null;

-- ── Loans ────────────────────────────────────────────────────────────────────
create table loans (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  branch_id       uuid not null references branches (id) on delete cascade,
  member_id       uuid not null references members (id) on delete cascade,
  principal       numeric(14,2) not null check (principal > 0),
  interest_rate   numeric(5,2) not null default 0,
  installment_cnt int not null default 45,
  disbursed_at    timestamptz,
  status          text not null default 'pending',
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index loans_member_idx on loans (member_id) where deleted_at is null;

-- ── updated_at touch trigger ─────────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['organizations','branches','samities','users_profile','members','savings_accounts','loans']
  loop
    execute format('drop trigger if exists trg_touch_%1$s on %1$s', t);
    execute format('create trigger trg_touch_%1$s before update on %1$s for each row execute function touch_updated_at()', t);
  end loop;
end;
$$;
