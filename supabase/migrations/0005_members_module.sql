-- 0005_members_module.sql — member management: admissions wizard, encrypted
-- identity, documents, status lifecycle, transfers, eligibility rules, notes,
-- attendance, insurance. Extends the members table from 0001_core.sql.

-- ── Enums ────────────────────────────────────────────────────────────────────
create type member_lifecycle as enum ('pending', 'active', 'dormant', 'dropout', 'transferred', 'deceased');
create type admission_stage as enum (
  'field_survey', 'eligibility_screening', 'household_verification',
  'manager_approval', 'orientation_completed', 'member_issued', 'passbook_generated'
);
create type id_type as enum ('nid', 'birth_registration');
create type transfer_stage as enum ('proposed', 'approved', 'rejected', 'completed');

-- ── Org-configurable eligibility rules (one row per org) ─────────────────────
create table eligibility_rules (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null unique references organizations (id) on delete cascade,
  min_age                  int  not null default 18 check (min_age between 12 and 70),
  max_age                  int  not null default 60 check (max_age between 18 and 100),
  max_land_decimals        numeric(10,2) not null default 50,
  one_member_per_household boolean not null default true,
  max_monthly_income       numeric(14,2) not null default 0, -- 0 = no limit
  women_only               boolean not null default false,
  created_by               uuid references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);

-- ── Members: extended profile columns ────────────────────────────────────────
alter table members
  add column if not exists lifecycle          member_lifecycle not null default 'pending',
  add column if not exists full_name_bn       text,
  add column if not exists father_or_husband_name text,
  add column if not exists mother_name        text,
  add column if not exists id_type            id_type default 'nid',
  -- AES-256-GCM ciphertext (base64). Never selectable by clients.
  add column if not exists id_number_enc      text,
  -- HMAC-SHA256 (base64) of the raw id for exact-match duplicate search.
  add column if not exists id_number_hash     text,
  add column if not exists dob                date,
  add column if not exists address            text,
  add column if not exists working_area_id    uuid references working_areas (id) on delete set null,
  add column if not exists occupation         text,
  add column if not exists monthly_household_income numeric(14,2),
  add column if not exists land_owned_decimals numeric(10,2),
  add column if not exists family_members     int,
  add column if not exists photo_path         text,
  add column if not exists signature_path     text, -- signature or thumbprint
  add column if not exists passbook_no        text unique,
  add column if not exists status_reason_code text,
  add column if not exists status_changed_at  timestamptz,
  add column if not exists status_note        text;

-- Old status enum (active/inactive/closed) stays for 0001-era consumers;
-- lifecycle is authoritative going forward.

-- ── Nominees (shares must total 100 per member) ──────────────────────────────
create table member_nominees (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  member_id   uuid not null references members (id) on delete cascade,
  name        text not null,
  relation    text not null,
  share_pct   int not null check (share_pct between 1 and 100),
  phone       text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index member_nominees_member_idx on member_nominees (member_id) where deleted_at is null;

-- Enforce shares sum to 100 at write time.
create or replace function check_nominee_shares() returns trigger as $$
declare total int;
begin
  select coalesce(sum(share_pct), 0) into total
  from member_nominees
  where member_id = new.member_id and deleted_at is null;
  if total > 100 then
    raise exception 'nominee shares exceed 100%% (now %)', total;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_nominee_shares
  after insert or update on member_nominees
  for each row execute function check_nominee_shares();

-- ── Admission wizard state (one live admission per draft) ────────────────────
create table member_admissions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  branch_id      uuid not null references branches (id) on delete cascade,
  draft          jsonb not null default '{}'::jsonb,
  stage          admission_stage not null default 'field_survey',
  stage_history  jsonb not null default '[]'::jsonb,
  member_number  text unique,
  passbook_no    text unique,
  -- Set once the final stage completes; links to the created member row.
  member_id      uuid references members (id) on delete set null,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index member_admissions_org_idx on member_admissions (org_id) where deleted_at is null;
create index member_admissions_stage_idx on member_admissions (org_id, stage) where deleted_at is null;

-- ── Member status history (lifecycle audit) ──────────────────────────────────
create table member_status_history (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  member_id   uuid not null references members (id) on delete cascade,
  status      member_lifecycle not null,
  reason_code text not null,
  note        text,
  changed_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index member_status_history_member_idx on member_status_history (member_id);

-- ── Center-to-branch transfers with approval ─────────────────────────────────
create table member_transfers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  member_id    uuid not null references members (id) on delete cascade,
  from_branch_id uuid not null references branches (id) on delete cascade,
  to_branch_id   uuid not null references branches (id) on delete cascade,
  to_samity_name text,
  reason       text not null,
  stage        transfer_stage not null default 'proposed',
  proposed_by  uuid references auth.users (id) on delete set null,
  proposed_at  timestamptz not null default now(),
  decided_by   uuid references auth.users (id) on delete set null,
  decided_at   timestamptz,
  decision_note text,
  completed_at timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index member_transfers_member_idx on member_transfers (member_id);
create index member_transfers_org_stage_idx on member_transfers (org_id, stage) where deleted_at is null;

-- One open transfer per member.
create unique index member_transfers_open_uidx
  on member_transfers (member_id)
  where deleted_at is null and stage in ('proposed', 'approved');

-- ── Notes (Member 360) ───────────────────────────────────────────────────────
create table member_notes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  member_id   uuid not null references members (id) on delete cascade,
  note        text not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index member_notes_member_idx on member_notes (member_id) where deleted_at is null;

-- ── Attendance (weekly samity meetings) ──────────────────────────────────────
create table member_attendance (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  member_id    uuid not null references members (id) on delete cascade,
  samity_name  text,
  meeting_date date not null,
  present      boolean not null default true,
  recorded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (member_id, meeting_date)
);

-- ── Insurance policies ───────────────────────────────────────────────────────
create table member_insurance (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  branch_id   uuid not null references branches (id) on delete cascade,
  member_id   uuid not null references members (id) on delete cascade,
  product     text not null default 'life',
  premium     numeric(14,2) not null default 0,
  coverage    numeric(14,2) not null default 0,
  status      text not null default 'active',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index member_insurance_member_idx on member_insurance (member_id) where deleted_at is null;

-- ── Encryption keys (per-org DEK wrapped; dev fallback uses env master key) ──
-- For the free-tier reference implementation the API derives a per-org key
-- with HKDF from a master secret; production should move to pgsodium/Vault.
create table member_key_versions (
  org_id     uuid primary key references organizations (id) on delete cascade,
  key_version int not null default 1,
  rotated_at timestamptz not null default now()
);

-- ── Duplicate-detection support indexes ──────────────────────────────────────
create index members_id_hash_idx on members (org_id, id_number_hash) where deleted_at is null;
create index members_mobile_idx on members (org_id, phone) where deleted_at is null;
create index members_name_lower_idx on members (org_id, lower(full_name)) where deleted_at is null;
create index members_lifecycle_idx on members (org_id, lifecycle) where deleted_at is null;

-- ── updated_at triggers for new tables ───────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['eligibility_rules','member_nominees','member_admissions','member_transfers','member_insurance']
  loop
    execute format('drop trigger if exists trg_touch_%1$s on %1$s', t);
    execute format('create trigger trg_touch_%1$s before update on %1$s for each row execute function touch_updated_at()', t);
  end loop;
end;
$$;

-- ── Member number & passbook issuance helper ─────────────────────────────────
-- Format: <BRANCHCODE>-<YY>-<seq>, e.g. DHK01-26-00042. Issued atomically.
create or replace function issue_member_number(p_branch_id uuid, p_org_id uuid)
returns table (member_number text, passbook_no text) as $$
declare
  b_code text;
  seq bigint;
  yy text;
begin
  select code into b_code from branches where id = p_branch_id and org_id = p_org_id;
  if b_code is null then
    raise exception 'branch % not found in org %', p_branch_id, p_org_id;
  end if;
  yy = to_char(now() at time zone 'Asia/Dhaka', 'YY');

  with ins as (
    insert into member_counters (branch_id, year, last_seq)
    values (p_branch_id, yy::int, 1)
    on conflict (branch_id, year) do update set last_seq = member_counters.last_seq + 1
    returning last_seq
  )
  select last_seq into seq from ins;

  return query select
    format('%s-%s-%s', replace(b_code, '-', ''), yy, lpad(seq::text, 5, '0')),
    format('PB-%s-%s-%s', replace(b_code, '-', ''), yy, lpad(seq::text, 5, '0'));
end;
$$ language plpgsql;

-- Counter table used by the function.
create table member_counters (
  branch_id uuid not null references branches (id) on delete cascade,
  year      int  not null,
  last_seq  bigint not null default 0,
  primary key (branch_id, year)
);
