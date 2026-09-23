-- 0034_hr_payroll.sql — HR payroll, provident fund, performance, discipline.
-- Money numeric(14,2); periods are YYYY-MM / YYYY strings. All tables follow
-- the standard convention: id uuid, org_id, created_by, created_at, updated_at,
-- deleted_at (soft delete).

-- ── 5) Salary structures (per org + grade) ──────────────────────────────────
create table if not exists salary_structures (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  grade            text not null,
  basic            numeric(14,2) not null check (basic > 0),
  house_rent       numeric(14,2) not null default 0,
  medical          numeric(14,2) not null default 0,
  conveyance       numeric(14,2) not null default 0,
  field_allowance  numeric(14,2) not null default 0,
  pf_employee_rate numeric(6,4) not null default 0.05 check (pf_employee_rate between 0 and 1),
  pf_employer_rate numeric(6,4) not null default 0.05 check (pf_employer_rate between 0 and 1),
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (org_id, grade)
);

-- ── 5) Payroll runs (one per org+period) + lines ────────────────────────────
create table if not exists payroll_runs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  period         text not null check (period ~ '^\d{4}-\d{2}$'),
  status         text not null default 'draft' check (status in ('draft','approved','paid')),
  total_gross    numeric(14,2) not null default 0,
  total_deduction numeric(14,2) not null default 0,
  total_net      numeric(14,2) not null default 0,
  bonus_total    numeric(14,2) not null default 0,
  prepared_by    uuid not null references auth.users(id),
  approved_by    uuid references auth.users(id),
  approved_at    timestamptz,
  paid_at        timestamptz,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (org_id, period)
);

create table if not exists payroll_lines (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  payroll_id       uuid not null references payroll_runs(id) on delete cascade,
  staff_id         uuid not null references staff(id),
  components       jsonb not null, -- {basic, house_rent, medical, conveyance, field_allowance}
  gross            numeric(14,2) not null,
  deductions       jsonb not null, -- {pf_employee, tax, loan_advance, other}
  total_deduction  numeric(14,2) not null,
  net              numeric(14,2) not null,
  bonus            numeric(14,2) not null default 0,
  working_days     integer not null default 26,
  present_days     integer not null default 0,
  attendance_ratio numeric(6,4) not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (payroll_id, staff_id),
  check (gross >= 0 and total_deduction >= 0 and net >= 0)
);

-- Totals on the run must equal the sum of lines (kept by app + trigger).
create or replace function fn_payroll_totals_check() returns trigger as $$
declare
  v_gross numeric(14,2);
  v_net   numeric(14,2);
begin
  select coalesce(sum(gross + bonus), 0), coalesce(sum(net), 0)
    into v_gross, v_net
    from payroll_lines where payroll_id = new.id and deleted_at is null;
  if new.total_gross <> v_gross or new.total_net <> v_net then
    new.total_gross := v_gross;
    new.total_net := v_net;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_payroll_totals before insert or update on payroll_runs
  for each row execute function fn_payroll_totals_check();

-- Approved/paid runs are immutable.
create or replace function fn_payroll_no_edit_after_approval() returns trigger as $$
begin
  if old.status <> 'draft' then
    raise exception 'approved payroll runs are immutable';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_payroll_immutable before update or delete on payroll_lines
  for each row execute function fn_payroll_no_edit_after_approval();

-- ── 6) PF ledger + gratuity ─────────────────────────────────────────────────
create table if not exists pf_ledger (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  staff_id         uuid not null references staff(id),
  period           text check (period is null or period ~ '^\d{4}-\d{2}$'),
  type             text not null check (type in ('contribution','interest','withdrawal','transfer_out')),
  employee_amount  numeric(14,2) not null default 0,
  employer_amount  numeric(14,2) not null default 0,
  balance_after    numeric(14,2) not null default 0,
  note             text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists idx_pf_ledger_staff on pf_ledger (org_id, staff_id, created_at);

-- Withdrawals may never overdraw the balance.
create or replace function fn_pf_no_overdraw() returns trigger as $$
declare
  v_balance numeric(14,2);
begin
  select coalesce(sum(employee_amount + employer_amount), 0) into v_balance
    from pf_ledger
   where org_id = new.org_id and staff_id = new.staff_id and deleted_at is null;
  if new.type in ('withdrawal', 'transfer_out') then
    if v_balance < new.employee_amount + new.employer_amount then
      raise exception 'PF withdrawal exceeds balance';
    end if;
  end if;
  new.balance_after := v_balance
    + case when new.type in ('contribution','interest') then new.employee_amount + new.employer_amount
           else -(new.employee_amount + new.employer_amount) end;
  return new;
end;
$$ language plpgsql;

create trigger trg_pf_balance before insert on pf_ledger
  for each row execute function fn_pf_no_overdraw();

create table if not exists gratuity_settlements (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  staff_id      uuid not null references staff(id),
  joining_date  date not null,
  leaving_date  date not null,
  last_basic    numeric(14,2) not null,
  years         integer not null,
  amount        numeric(14,2) not null check (amount >= 0),
  paid_at       timestamptz,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- ── 7) KPI scorecards + appraisals ──────────────────────────────────────────
create table if not exists kpi_scorecards (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id),
  staff_id   uuid not null references staff(id),
  period     text not null check (period ~ '^\d{4}-\d{2}$'),
  actuals    jsonb not null, -- {collection_rate, par, new_members, meeting_attendance}
  scores     jsonb not null,
  total_score numeric(6,2) not null,
  grade      text not null check (grade in ('A','B','C','D')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (org_id, staff_id, period)
);

create table if not exists staff_appraisals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  staff_id     uuid not null references staff(id),
  year         text not null check (year ~ '^\d{4}$'),
  scores       jsonb not null,
  comments     text not null default '',
  rating       numeric(6,2) not null,
  status       text not null default 'draft' check (status in ('draft','submitted','reviewed')),
  reviewer_id  uuid references auth.users(id),
  reviewer_note text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (org_id, staff_id, year)
);

-- ── 8) Disciplinary cases (HR + Director only via RLS) ──────────────────────
create table if not exists disciplinary_cases (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  staff_id      uuid not null references staff(id),
  severity      text not null check (severity in ('verbal_warning','written_warning','show_cause','suspension','termination')),
  incident_date date not null,
  description   text not null,
  status        text not null default 'open' check (status in ('open','explained','closed')),
  explanation   text,
  outcome       text,
  raised_by     uuid not null references auth.users(id),
  closed_by     uuid references auth.users(id),
  closed_at     timestamptz,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists idx_discipline_staff on disciplinary_cases (org_id, staff_id);

-- ── Report indexes ──────────────────────────────────────────────────────────
create index if not exists idx_payroll_lines_org on payroll_lines (org_id, payroll_id);
