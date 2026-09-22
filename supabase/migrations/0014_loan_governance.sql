-- 0014_loan_governance.sql — approval matrix, loan-cycle policy + history,
-- repayment installments (for overdue detection), utilization plans, and
-- timeline enrichment for the loan governance spec. Extends 0012/0013.

-- ── 4) Approval matrix (configurable per designation) ───────────────────────
create table loan_approval_matrix (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations (id) on delete cascade,
  product_id          uuid references loan_products (id) on delete cascade, -- null = all products
  min_amount          numeric(14, 2), -- null = open lower bound
  max_amount          numeric(14, 2), -- null = open upper bound
  approver_roles      text[] not null check (array_length(approver_roles, 1) >= 1),
  solo_approval_limit numeric(14, 2), -- null = unlimited solo approval
  priority            integer not null default 0,
  is_active           boolean not null default true,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint loan_matrix_band_order check (
    min_amount is null or max_amount is null or min_amount <= max_amount
  ),
  constraint loan_matrix_roles_valid check (
    approver_roles <@ array[
      'super_admin', 'org_admin', 'area_manager', 'branch_manager',
      'account_officer', 'member'
    ]::text[]
  )
);

create index loan_matrix_resolve_idx on loan_approval_matrix (org_id, priority desc) where is_active;

-- ── 5) Cycle policy columns on loan_policies ────────────────────────────────
alter table loan_policies
  add column if not exists first_loan_cap_bdt        numeric(14, 2) not null default 20000.00,
  add column if not exists step_up_percent           numeric(5, 2)  not null default 25.00,
  add column if not exists max_cycle_cap_bdt         numeric(14, 2) not null default 100000.00,
  add column if not exists overdue_grace_days        integer        not null default 0,
  add column if not exists max_debt_to_income_ratio  numeric(5, 2)  not null default 0.40,
  add column if not exists max_loan_to_savings_ratio numeric(5, 2)  not null default 3.00,
  add column if not exists max_overlapping_loans     integer        not null default 2;

-- Disbursed loans with installment plans (drives overdue + cycle history).
create table loan_installments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  application_id uuid not null references loan_applications (id) on delete cascade,
  seq            integer not null check (seq >= 1),
  due_date       date not null,
  principal      numeric(14, 2) not null,
  interest       numeric(14, 2) not null,
  paid_amount    numeric(14, 2) not null default 0,
  paid_at        date,
  created_at     timestamptz not null default now(),
  unique (application_id, seq)
);

create index loan_installments_due_idx on loan_installments (org_id, due_date) where paid_at is null;

-- A disbursed loan is "closed" when all installments are paid; closure date
-- relative to the last due date drives the on-time flag in cycle history.
create or replace function loan_cycle_history(p_member uuid, p_org uuid)
returns table (
  application_id uuid,
  application_number text,
  status text,
  disbursed_at timestamptz,
  closed_at timestamptz,
  closed_on_time boolean
) language sql stable as $$
  select
    la.id,
    la.application_number,
    la.status::text,
    la.decided_at as disbursed_at,
    (select max(li.paid_at)::timestamptz from loan_installments li where li.application_id = la.id) as closed_at,
    coalesce(
      (select max(li.paid_at) <= max(li.due_date) + interval '30 days'
       from loan_installments li where li.application_id = la.id),
      true
    ) as closed_on_time
  from loan_applications la
  where la.member_id = p_member
    and la.org_id = p_org
    and la.status in ('disbursed', 'closed')
  order by la.decided_at;
$$;

-- ── 9) Utilization plan ─────────────────────────────────────────────────────
create type utilization_status as enum ('planned', 'verified');

create table loan_utilization_plans (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  application_id uuid not null references loan_applications (id) on delete cascade,
  items          jsonb not null check (jsonb_typeof(items) = 'array'),
  status         utilization_status not null default 'planned',
  verification   jsonb,
  verified_by    uuid references auth.users (id) on delete set null,
  verified_at    timestamptz,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (application_id)
);

-- Verification snapshot must be recorded before status flips to verified.
create or replace function enforce_utilization_verification() returns trigger as $$
begin
  if new.status = 'verified' and (new.verification is null or jsonb_typeof(new.verification) <> 'object') then
    raise exception 'A verification object is required to mark a utilization plan verified';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_utilization_verification before insert or update on loan_utilization_plans
for each row execute function enforce_utilization_verification();

-- ── Overdue + balance helpers used by the API service layer ─────────────────
create or replace function member_overdue_installments(p_member uuid, p_org uuid, p_grace_days integer)
returns table (
  installment_id uuid,
  loan_id uuid,
  due_date date,
  days_overdue integer,
  amount_due numeric(14, 2)
) language sql stable as $$
  select
    li.id,
    li.application_id,
    li.due_date,
    (current_date - li.due_date)::integer,
    (li.principal + li.interest - li.paid_amount)
  from loan_installments li
  join loan_applications la on la.id = li.application_id
  where la.member_id = p_member
    and la.org_id = p_org
    and la.status in ('disbursed', 'closed')
    and li.paid_at is null
    and (current_date - li.due_date)::integer > p_grace_days;
$$;

create or replace function member_savings_balance(p_member uuid, p_org uuid)
returns numeric(14, 2) language sql stable as $$
  select coalesce(sum(sa.balance), 0)
  from savings_accounts sa
  where sa.member_id = p_member
    and sa.org_id = p_org
    and sa.status in ('active', 'dormant');
$$;

-- Defense in depth: a live opening (am_review/bm_review → approved) must pass
-- the overlap limit recorded in policy. The full cycle gate runs in the API
-- service layer where schedule/eligibility context is available.
create or replace function enforce_loan_overlap_limit() returns trigger as $$
declare
  v_max integer;
  v_active integer;
begin
  if new.status not in ('approved') or old.status = 'approved' then
    return new;
  end if;
  select max_overlapping_loans into v_max from loan_policies where org_id = new.org_id;
  select count(*) into v_active
  from loan_applications la
  where la.member_id = new.member_id
    and la.org_id = new.org_id
    and la.id <> new.id
    and la.status in ('approved', 'disbursed');
  if v_active >= coalesce(v_max, 2) then
    raise exception 'Member already has % active loans (policy max %)', v_active, coalesce(v_max, 2);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_applications_overlap_guard before update on loan_applications
for each row execute function enforce_loan_overlap_limit();
