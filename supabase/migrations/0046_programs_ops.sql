-- 0046_programs_ops.sql — Programs operations (reqs 5–9).
-- Project expenses vs budget lines (80% alerts), field monitoring visits with
-- checklists + photos, donor quarterly reports, sensitive case management
-- (restricted fields, access logging) and the grant / PKSF / bank borrowing
-- tracker with repayment schedules. Money is numeric(14,2) text.

-- ── 5) Project expenses (budget monitoring) ─────────────────────────────────
create table if not exists project_expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  expense_date date not null,
  budget_line text not null,
  amount numeric(14,2) not null check (amount > 0),
  voucher_no text not null default '',
  description text not null default '',
  recorded_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_expenses_project on project_expenses (org_id, project_id, expense_date);

-- ── 6) Field monitoring visits ──────────────────────────────────────────────
create table if not exists field_visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  visit_date date not null,
  officer_id text not null,
  officer_name text not null,
  village text not null default '',
  beneficiaries_met integer not null default 0 check (beneficiaries_met >= 0),
  checklist jsonb not null default '[]'::jsonb,   -- [{item, passed, note}]
  photos jsonb not null default '[]'::jsonb,      -- [{id, labelBn, path}]
  findings text not null default '',
  follow_ups jsonb not null default '[]'::jsonb,  -- [{action, owner, dueDate, done}]
  created_at timestamptz not null default now()
);
create index if not exists idx_visits_project on field_visits (org_id, project_id, visit_date);

-- ── 7) Donor reports (generated quarterly) ──────────────────────────────────
create table if not exists donor_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  payload jsonb not null,             -- DonorReport document
  generated_by text not null,
  created_at timestamptz not null default now(),
  unique (org_id, project_id, period_start, period_end)
);

-- ── 8) Sensitive case management ────────────────────────────────────────────
create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  case_no text not null,
  type text not null check (type in ('child_protection','gbv_survivor','child_marriage','trafficking','other_sensitive')),
  severity text not null check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','referred','closed')),
  beneficiary_id uuid references beneficiaries(id),
  beneficiary_name text not null,
  -- RESTRICTED: readable only by case workers/admins; RLS masks it for staff.
  restricted_details text not null,
  consent_given boolean not null default false,
  opened_at date not null default current_date,
  assigned_worker_id text not null,
  assigned_worker_name text not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, case_no)
);

-- Append-only access log: every open/update is recorded; rows are never
-- updated or deleted (enforced by RLS insert-only policy in 0047).
create table if not exists case_access_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  user_id text not null,
  user_name text not null,
  action text not null check (action in ('create','view','view_restricted','update','close')),
  at timestamptz not null default now()
);
create index if not exists idx_case_access_case on case_access_log (org_id, case_id, at desc);

-- Case status state machine (trigger-enforced, mirrors canTransitionCase).
create or replace function fn_case_flow()
returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  allowed := case new.status
    when 'open'        then array['in_progress','referred','closed']
    when 'in_progress' then array['referred','closed']
    when 'referred'    then array['closed']
    when 'closed'      then array[]::text[]
  end;
  if old.status is distinct from new.status and not (new.status = any(allowed)) then
    raise exception 'INVALID_CASE_TRANSITION % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  if new.status = 'closed' and old.status <> 'closed' then
    new.closed_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_case_flow on cases;
create trigger trg_case_flow before update on cases
  for each row execute function fn_case_flow();

-- ── 9) Grants & PKSF/bank borrowing tracker ─────────────────────────────────
create table if not exists funding_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  source_name text not null,
  kind text not null check (kind in ('grant','pksf','bank','mfi_wholesale','internal_fund')),
  principal numeric(14,2) not null check (principal > 0),
  interest_rate_pct numeric(5,2) not null default 0 check (interest_rate_pct >= 0 and interest_rate_pct <= 100),
  tenure_months integer not null check (tenure_months between 0 and 600),
  disbursement_date date not null,
  repayment_start date not null,
  purpose_project_id uuid references projects(id),
  lender_contact text not null default '',
  status text not null default 'active' check (status in ('active','repaid','defaulted')),
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists funding_repayments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  source_id uuid not null references funding_sources(id) on delete cascade,
  installment_no integer not null check (installment_no >= 1),
  due_date date not null,
  principal numeric(14,2) not null,
  interest numeric(14,2) not null,
  total numeric(14,2) not null,
  balance numeric(14,2) not null,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, installment_no)
);
create index if not exists idx_repayments_source on funding_repayments (org_id, source_id, due_date);

-- Sequence helpers
create or replace function next_case_seq(p_org_id uuid)
returns integer language sql as $$
  select count(*)::int + 1 from cases where org_id = p_org_id;
$$;

create or replace function next_funding_seq(p_org_id uuid)
returns integer language sql as $$
  select count(*)::int + 1 from funding_sources where org_id = p_org_id;
$$;
