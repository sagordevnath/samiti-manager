-- 0012_loan_products_applications.sql — loan product catalog, regulatory rate
-- policy, application workflow (member request → officer visit → household
-- check → guarantor → BM review → [AM review] → decision), and guarantors.

-- ── Regulatory policy (one row per org, editable) ────────────────────────────
create table loan_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references organizations (id) on delete cascade,
  rate_cap_percent numeric(5, 2) not null default 27.00 check (rate_cap_percent between 0 and 100),
  bm_approval_limit_bdt numeric(14, 2) not null default 30000.00 check (bm_approval_limit_bdt >= 0),
  guarantors_required integer not null default 1 check (guarantors_required between 0 and 5),
  max_active_loans_per_member integer not null default 2 check (max_active_loans_per_member between 1 and 10),
  min_days_between_loans integer not null default 0 check (min_days_between_loans between 0 and 365),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ── Product catalog ──────────────────────────────────────────────────────────
create type loan_product_type as enum (
  'general', 'seasonal_agri', 'microenterprise', 'housing', 'education',
  'emergency', 'migration', 'device', 'climate'
);

create type installment_frequency as enum ('daily', 'weekly', 'biweekly', 'monthly');

create type interest_method as enum ('declining_balance', 'flat');

create table loan_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  code text not null,
  name text not null,
  name_bn text,
  product_type loan_product_type not null default 'general',
  min_amount numeric(14, 2) not null check (min_amount >= 0),
  max_amount numeric(14, 2) not null check (max_amount >= 0),
  term_months integer not null check (term_months between 1 and 120),
  installment_frequency installment_frequency not null default 'weekly',
  interest_method interest_method not null default 'declining_balance',
  interest_rate numeric(5, 2) not null check (interest_rate >= 0 and interest_rate <= 100),
  service_charge numeric(5, 2) not null default 0 check (service_charge >= 0),
  processing_fee_rate numeric(5, 2) not null default 0 check (processing_fee_rate >= 0),
  insurance_premium_rate numeric(5, 2) not null default 0 check (insurance_premium_rate >= 0),
  grace_period_installments integer not null default 0 check (grace_period_installments >= 0),
  eligibility_note text,
  required_documents jsonb not null default '[]'::jsonb,
  guarantors_required integer not null default 1 check (guarantors_required between 0 and 5),
  guarantor_min_relationship text,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code),
  constraint loan_product_amount_range check (min_amount <= max_amount)
);

create index loan_products_org_idx on loan_products (org_id) where is_active;

-- Rate cap is policy, not schema: validated at insert/update time against the
-- org's loan_policies row so it stays editable without a migration.
create or replace function enforce_loan_rate_cap() returns trigger as $$
declare
  v_cap numeric(5, 2);
  v_effective numeric(5, 2);
begin
  select rate_cap_percent into v_cap from loan_policies where org_id = new.org_id;
  if v_cap is null then
    v_cap := 27.00; -- MRA default when no policy row exists yet
  end if;
  v_effective := case when new.interest_method = 'flat' then new.interest_rate * 2 else new.interest_rate end;
  if v_effective > v_cap then
    raise exception 'Loan rate %%% (%) exceeds the regulatory cap of %%% (flat rates count double)',
      new.interest_rate,
      new.interest_method,
      v_cap;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_products_rate_cap before insert or update on loan_products
for each row execute function enforce_loan_rate_cap();

-- ── Applications ─────────────────────────────────────────────────────────────
create type loan_application_status as enum (
  'draft', 'submitted', 'officer_review', 'bm_review', 'am_review',
  'approved', 'rejected', 'disbursed', 'closed'
);

create table loan_applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete restrict,
  member_id uuid not null references members (id) on delete restrict,
  product_id uuid not null references loan_products (id) on delete restrict,
  application_number text not null unique,
  requested_amount numeric(14, 2) not null check (requested_amount > 0),
  purpose text not null check (char_length(purpose) between 3 and 500),
  status loan_application_status not null default 'draft',
  term_months integer not null check (term_months between 1 and 120),
  guarantors jsonb not null default '[]'::jsonb,
  decision_reason text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index loan_applications_org_idx on loan_applications (org_id, status, created_at desc);
create index loan_applications_member_idx on loan_applications (member_id);
create index loan_applications_branch_idx on loan_applications (branch_id, status);

-- ── Workflow steps (audit trail of the wizard) ───────────────────────────────
create type loan_stage as enum (
  'member_request', 'officer_visit', 'household_check', 'guarantor',
  'bm_review', 'am_review', 'decision'
);

create type loan_stage_action as enum ('done', 'approved', 'rejected', 'returned');

create table loan_application_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  application_id uuid not null references loan_applications (id) on delete cascade,
  stage loan_stage not null,
  action loan_stage_action not null,
  actor_role text not null,
  actor_id uuid references auth.users (id) on delete set null,
  note text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index loan_application_steps_app_idx on loan_application_steps (application_id, created_at);

-- Requested amount must sit inside the product's min/max band.
create or replace function enforce_loan_amount_band() returns trigger as $$
declare
  v_min numeric(14, 2);
  v_max numeric(14, 2);
begin
  select min_amount, max_amount into v_min, v_max from loan_products where id = new.product_id;
  if new.requested_amount < v_min or new.requested_amount > v_max then
    raise exception 'Requested amount % is outside the product band %–%', new.requested_amount, v_min, v_max;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_applications_amount_band before insert or update on loan_applications
for each row execute function enforce_loan_amount_band();

-- Status moves one step at a time; area review is only required above the BM
-- limit. Enforced in SQL so no client can skip the approval chain.
create or replace function enforce_loan_status_transition() returns trigger as $$
declare
  v_allowed loan_application_status[];
  v_bm_limit numeric(14, 2);
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status in ('draft', 'disbursed', 'closed') then
    raise exception 'Status % must be reached via its own API flow', new.status;
  end if;
  select bm_approval_limit_bdt into v_bm_limit from loan_policies where org_id = new.org_id;
  v_allowed := case
    when old.status = 'draft' then array['submitted']::loan_application_status[]
    when old.status = 'submitted' then array['officer_review']::loan_application_status[]
    when old.status = 'officer_review' then array['bm_review']::loan_application_status[]
    when old.status = 'bm_review' then
      case
        when v_bm_limit is not null and new.requested_amount > v_bm_limit
          then array['am_review', 'approved', 'rejected']::loan_application_status[]
        else array['approved', 'rejected']::loan_application_status[]
      end
    when old.status = 'am_review' then array['approved', 'rejected']::loan_application_status[]
    else array['rejected']::loan_application_status[]
  end;
  if not (new.status = any (v_allowed)) then
    raise exception 'Invalid loan status transition % → %', old.status, new.status;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_applications_status_guard before update on loan_applications
for each row execute function enforce_loan_status_transition();

-- Per-branch application sequence for human-readable numbers (LO-<BRANCH>-0001).
create table loan_application_seq (
  branch_id uuid primary key references branches(id),
  seq       integer not null default 0
);

create or replace function next_loan_seq(p_branch uuid)
returns integer language plpgsql as $$
declare v_seq integer;
begin
  insert into loan_application_seq (branch_id, seq) values (p_branch, 1)
  on conflict (branch_id) do update set seq = loan_application_seq.seq + 1
  returning seq into v_seq;
  return v_seq;
end;
$$;
