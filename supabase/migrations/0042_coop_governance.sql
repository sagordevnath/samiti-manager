-- 0042_coop_governance.sql — Dividend & surplus distribution, AGM records and
-- member exit settlement (req 5–7). Money numeric(14,2) BDT, standard columns.

-- ── 5) Dividend distributions (one row per fiscal year) ─────────────────────
create table if not exists dividend_distributions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) unique,
  fiscal_year     text not null,
  surplus         numeric(14,2) not null check (surplus >= 0),
  reserve_pct     numeric(5,2) not null default 25.00 check (reserve_pct between 0 and 100),
  reserve_amount  numeric(14,2) not null default 0,
  rate_pct        numeric(5,2) not null default 8.00,
  pool_amount     numeric(14,2) not null default 0,
  total_weighted  numeric(12,2) not null default 0,
  agm_meeting_id  uuid,
  status          text not null default 'computed' check (status in ('computed','agm_approved','posted','paid')),
  declared_by     uuid,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists dividend_lines (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  distribution_id uuid not null references dividend_distributions(id) on delete cascade,
  member_id      uuid not null,
  member_name    text not null,
  shares         integer not null default 0,
  months_held    integer not null default 12 check (months_held between 0 and 12),
  weighted_shares numeric(12,2) not null default 0,
  weight_pct     numeric(6,3) not null default 0,
  amount         numeric(14,2) not null default 0,
  destination    text not null default 'savings' check (destination in ('savings','cash')),
  paid_at        timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_dividend_lines on dividend_lines (org_id, distribution_id);

-- Dividend status machine: computed → agm_approved → posted → paid.
create or replace function fn_dividend_flow() returns trigger as $$
declare
  allowed text[] := case old.status
    when 'computed' then array['agm_approved']
    when 'agm_approved' then array['posted']
    when 'posted' then array['paid']
    else array[]::text[] end;
begin
  if new.status <> old.status and not (new.status = any(allowed)) then
    raise exception 'অবৈধ লভ্যাংশ অবস্থান্তর % → %', old.status, new.status;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_dividend_flow on dividend_distributions;
create trigger trg_dividend_flow
  before update on dividend_distributions
  for each row execute function fn_dividend_flow();

-- ── 6) AGM records ──────────────────────────────────────────────────────────
create table if not exists agm_records (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  fiscal_year     text not null,
  meeting_date    date not null,
  venue           text not null,
  notice_date     date,
  notice_days     integer not null default 14 check (notice_days between 7 and 60),
  agenda          jsonb not null default '[]'::jsonb,
  attendance      jsonb not null default '[]'::jsonb,
  quorum_required integer not null default 10,
  resolutions     jsonb not null default '[]'::jsonb,
  elections       jsonb not null default '[]'::jsonb,
  minutes_bn      text not null default '',
  approved_by     uuid,
  status          text not null default 'draft' check (status in ('draft','notice_issued','held','minutes_approved')),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, fiscal_year)
);

-- AGM flow: draft → notice_issued → held → minutes_approved.
create or replace function fn_agm_flow() returns trigger as $$
declare
  allowed text[] := case old.status
    when 'draft' then array['notice_issued']
    when 'notice_issued' then array['held']
    when 'held' then array['minutes_approved']
    else array[]::text[] end;
begin
  if new.status <> old.status and not (new.status = any(allowed)) then
    raise exception 'অবৈধ সভা অবস্থান্তর % → %', old.status, new.status;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_agm_flow on agm_records;
create trigger trg_agm_flow
  before update on agm_records
  for each row execute function fn_agm_flow();

-- ── 7) Member exit settlements ──────────────────────────────────────────────
create table if not exists member_exits (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  member_id       uuid not null,
  member_name     text not null,
  request_date    date not null,
  exit_no         text not null unique,
  savings_balance numeric(14,2) not null default 0,
  share_value     numeric(14,2) not null default 0,
  dividend_due    numeric(14,2) not null default 0,
  welfare_balance numeric(14,2) not null default 0,
  dues_outstanding numeric(14,2) not null default 0,
  net_payable     numeric(14,2) not null default 0,
  lines           jsonb not null default '[]'::jsonb,
  status          text not null default 'requested' check (status in ('requested','computed','approved','settled','rejected')),
  decision_note   text not null default '',
  settled_at      timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_member_exits on member_exits (org_id, branch_id, status);

-- Exit flow: requested → computed → approved → settled; reject from requested/computed.
create or replace function fn_exit_flow() returns trigger as $$
declare
  allowed text[] := case old.status
    when 'requested' then array['computed','rejected']
    when 'computed' then array['approved','rejected']
    when 'approved' then array['settled']
    else array[]::text[] end;
begin
  if new.status <> old.status and not (new.status = any(allowed)) then
    raise exception 'অবৈধ নিষ্পত্তি অবস্থান্তর % → %', old.status, new.status;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_exit_flow on member_exits;
create trigger trg_exit_flow
  before update on member_exits
  for each row execute function fn_exit_flow();

-- Settlement cannot be paid below zero after dues adjustment.
create or replace function fn_exit_net() returns trigger as $$
begin
  new.net_payable := greatest(
    0,
    coalesce(new.savings_balance, 0) + coalesce(new.share_value, 0)
      + coalesce(new.dividend_due, 0) + coalesce(new.welfare_balance, 0)
      - coalesce(new.dues_outstanding, 0)
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_exit_net on member_exits;
create trigger trg_exit_net
  before insert or update on member_exits
  for each row execute function fn_exit_net();
