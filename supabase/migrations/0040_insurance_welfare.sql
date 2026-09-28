-- 0040_insurance_welfare.sql — Credit life, micro-insurance, member welfare
-- and staff benevolent funds. Standard convention: id uuid, org_id, branch_id,
-- created_by, created_at, updated_at, deleted_at. Money numeric(14,2) BDT.

-- ── 1) Credit life policies (issued at disbursement) ────────────────────────
create table if not exists credit_life_policies (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  branch_id        uuid not null references branches(id),
  application_id   uuid not null,
  loan_number      text not null,
  member_id        uuid not null,
  member_name      text not null,
  premium_rate_pct numeric(5,2) not null default 1.00,
  premium_amount   numeric(14,2) not null,
  principal        numeric(14,2) not null,
  coverage_amount  numeric(14,2) not null,
  start_date       date not null,
  end_date         date not null,
  nominee_name     text not null,
  nominee_relation text not null,
  nominee_phone    text,
  status           text not null default 'active' check (status in ('active','claimed','expired')),
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (application_id)
);

-- ── Insurance claims (death + micro kinds), one row per claim ───────────────
create table if not exists insurance_claims (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  policy_id       uuid not null, -- credit_life_policies or micro_enrollments
  claim_no        text not null unique,
  kind            text not null check (kind in ('death','cattle','crop','health')),
  member_id       uuid not null,
  member_name     text not null,
  event_date      date not null,
  reported_date   date not null default current_date,
  cause           text not null default '',
  documents       jsonb not null default '[]'::jsonb,
  assessment_note text not null default '',
  claimed_amount  numeric(14,2) not null,
  approved_amount numeric(14,2),
  settlement_mode text check (settlement_mode in ('payout','waiver')),
  status          text not null default 'submitted' check (status in
    ('submitted','bm_review','am_review','ho_review','approved','paid','rejected')),
  decision_note   text not null default '',
  decided_at      timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists idx_claims_branch on insurance_claims (org_id, branch_id, status);

-- Claim ladder may not skip levels (defense in depth for the shared engine).
create or replace function fn_claim_flow() returns trigger as $$
declare
  allowed text[] := case old.status
    when 'submitted' then array['bm_review','rejected']
    when 'bm_review' then array['am_review','rejected']
    when 'am_review' then array['ho_review','rejected']
    when 'ho_review' then array['approved','rejected']
    when 'approved'  then array['paid']
    else array[]::text[] end;
begin
  if new.status <> old.status and not (new.status = any(allowed)) then
    raise exception 'অবৈধ দাবি অবস্থান্তর % → %', old.status, new.status;
  end if;
  -- Death claims may not leave submitted without the required docs.
  if old.kind = 'death' and old.status = 'submitted' and new.status <> 'submitted' and new.status <> 'rejected' then
    declare doc_ids text[];
    begin
      select coalesce(jsonb_agg(d->>'id'), '{}') into doc_ids from jsonb_array_elements(new.documents) d;
      if not (doc_ids @> array['death_certificate','nominee_nid','nominee_proof']) then
        raise exception 'মৃত্যু দাবির প্রয়োজনীয় নথি অসম্পূর্ণ / Required death-claim documents missing';
      end if;
    end;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_claim_flow on insurance_claims;
create trigger trg_claim_flow
  before update on insurance_claims
  for each row execute function fn_claim_flow();

-- ── 2) Micro-insurance products and enrollments ─────────────────────────────
create table if not exists micro_insurance_products (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  kind           text not null check (kind in ('cattle','crop','health')),
  name_bn        text not null,
  annual_premium numeric(14,2) not null check (annual_premium >= 0),
  coverage_limit numeric(14,2) not null check (coverage_limit >= 0),
  units          integer not null default 1 check (units between 1 and 50),
  active         boolean not null default true,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table if not exists micro_enrollments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  branch_id      uuid not null references branches(id),
  product_id     uuid not null references micro_insurance_products(id),
  kind           text not null check (kind in ('cattle','crop','health')),
  member_id      uuid not null,
  member_name    text not null,
  units          integer not null default 1 check (units between 1 and 20),
  subject_ref    text not null default '',
  annual_premium numeric(14,2) not null,
  coverage_limit numeric(14,2) not null,
  start_date     date not null,
  end_date       date not null,
  status         text not null default 'active' check (status in ('active','claimed','expired')),
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- ── 3) Welfare fund rules and requests (member + staff) ─────────────────────
create table if not exists welfare_fund_rules (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) unique,
  monthly_contribution numeric(14,2) not null default 10.00,
  staff_contribution  numeric(14,2) not null default 50.00,
  grant_cap_bdt       numeric(14,2) not null default 5000,
  loan_cap_bdt        numeric(14,2) not null default 20000,
  loan_term_months    integer not null default 10 check (loan_term_months between 1 and 36),
  bm_approval_up_to   numeric(14,2) not null default 3000,
  am_approval_up_to   numeric(14,2) not null default 10000,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists welfare_requests (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  fund            text not null check (fund in ('member','staff')),
  request_no      text not null unique,
  requester_id    uuid not null,
  requester_name  text not null,
  kind            text not null check (kind in ('illness','funeral','flood','disaster','education')),
  type            text not null check (type in ('grant','interest_free_loan')),
  amount          numeric(14,2) not null check (amount >= 0),
  reason          text not null,
  photos          text[] not null default '{}',
  status          text not null default 'submitted' check (status in
    ('submitted','bm_review','am_review','approved','rejected','disbursed')),
  decision_note   text not null default '',
  decided_at      timestamptz,
  disbursed_at    timestamptz,
  repayment_months integer,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists idx_welfare_branch on welfare_requests (org_id, branch_id, status);

-- Grant/loan caps enforced in the DB as well.
create or replace function fn_welfare_cap() returns trigger as $$
declare
  cap numeric(14,2);
  fund_row welfare_fund_rules%rowtype;
begin
  select * into fund_row from welfare_fund_rules where org_id = new.org_id;
  cap := case when new.type = 'grant' then coalesce(fund_row.grant_cap_bdt, 5000) else coalesce(fund_row.loan_cap_bdt, 20000) end;
  if new.amount > cap then
    raise exception 'কল্যাণ সীমা ছাড়িয়েছে / Welfare cap exceeded (max %)', cap;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_welfare_cap on welfare_requests;
create trigger trg_welfare_cap
  before insert on welfare_requests
  for each row execute function fn_welfare_cap();

-- ── Fund ledger: contributions in, grants/claims out ────────────────────────
create table if not exists welfare_ledger (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  branch_id   uuid references branches(id),
  fund        text not null check (fund in ('member_welfare','staff_benevolent','insurance')),
  entry_type  text not null check (entry_type in
    ('contribution','premium','grant','loan_disbursed','loan_repaid','claim_paid','claim_waiver','adjustment')),
  ref_type    text,
  ref_id      uuid,
  amount      numeric(14,2) not null,
  memo        text not null default '',
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists idx_welfare_ledger on welfare_ledger (org_id, fund, created_at);
