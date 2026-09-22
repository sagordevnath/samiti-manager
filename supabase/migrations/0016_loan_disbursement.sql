-- 0016_loan_disbursement.sql — converts approved applications into active
-- loans: branch cash limits, the holiday calendar, the disbursement record
-- (mode + evidence + receiver), and the stored repayment schedule rows.

-- ── Branch cash limit (evidence for the cash_available check) ───────────────
create table if not exists branch_cash_limits (
  branch_id     uuid primary key references branches (id) on delete cascade,
  org_id        uuid not null references organizations (id) on delete cascade,
  cash_limit    numeric(14, 2) not null default 0,
  updated_by    uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now()
);

-- ── Holiday calendar (org-wide; recurring entries repeat every year) ────────
create table loan_holidays (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  date        date not null,
  name        text not null check (length(name) between 2 and 120),
  name_bn     text,
  is_recurring boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (org_id, date)
);

-- ── 3) Disbursement record ──────────────────────────────────────────────────
create type disbursement_mode as enum ('cash_branch', 'cash_center', 'bank_transfer', 'bkash', 'nagad');
create type disbursement_status as enum ('pending', 'completed');

create table loan_disbursements (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations (id) on delete cascade,
  branch_id            uuid not null references branches (id) on delete cascade,
  application_id       uuid not null unique references loan_applications (id) on delete cascade,
  samity_id            uuid references samities (id) on delete set null,
  status               disbursement_status not null default 'pending',
  planned_date         date,
  checks               jsonb not null default '[]'::jsonb check (jsonb_typeof(checks) = 'array'),
  -- mode + evidence
  mode                 disbursement_mode,
  disbursement_date    date,
  mfs_reference        text check (mfs_reference is null or length(mfs_reference) between 4 and 40),
  bank_reference       text check (bank_reference is null or length(bank_reference) between 4 and 60),
  cash_received_by_name text,
  actual_user_of_funds  text, -- women borrowers: who actually uses the money
  actual_user_relation  text,
  note                 text,
  disbursed_by         uuid references auth.users (id) on delete set null,
  disbursed_at         timestamptz,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index loan_disbursements_queue_idx on loan_disbursements (org_id, branch_id, status, planned_date nulls last);

-- A disbursement can complete only once; the mode/evidence requirements are
-- enforced in the API service layer (shared schema) — the DB keeps a
-- structural guard so a completed row always carries mode + date.
create or replace function enforce_disbursement_completion() returns trigger as $$
begin
  if new.status = 'completed' then
    if new.mode is null or new.disbursement_date is null or new.disbursed_by is null then
      raise exception 'A completed disbursement requires mode, disbursement_date and disbursed_by';
    end if;
    if new.mode in ('cash_branch', 'cash_center') and coalesce(new.cash_received_by_name, '') = '' then
      raise exception 'Cash disbursement must record who received the money';
    end if;
    if new.mode = 'bank_transfer' and coalesce(new.bank_reference, '') = '' then
      raise exception 'Bank transfer requires a bank reference number';
    end if;
    if new.mode in ('bkash', 'nagad') and coalesce(new.mfs_reference, '') = '' then
      raise exception 'bKash/Nagad disbursement requires an MFS reference (TrxID)';
    end if;
    -- Every pre-disbursement check must be recorded as done.
    if exists (
      select 1
      from jsonb_array_elements(new.checks) as c
      where coalesce((c->>'done')::boolean, false) = false
    ) then
      raise exception 'All pre-disbursement checks must be completed before disbursement';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_disbursement_completion before insert or update on loan_disbursements
for each row execute function enforce_disbursement_completion();

-- ── 4) Stored repayment schedule rows ───────────────────────────────────────
create table loan_repayment_schedule (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations (id) on delete cascade,
  application_id   uuid not null references loan_applications (id) on delete cascade,
  seq              integer not null check (seq >= 1),
  original_due_date date not null,
  due_date         date not null,
  shifted          boolean not null default false,
  shift_reason     text,
  principal        numeric(14, 2) not null check (principal >= 0),
  interest         numeric(14, 2) not null check (interest >= 0),
  total            numeric(14, 2) not null check (total >= 0),
  balance_after    numeric(14, 2) not null check (balance_after >= 0),
  paid_amount      numeric(14, 2) not null default 0 check (paid_amount >= 0),
  paid_at          date,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (application_id, seq)
);

create index loan_repayment_schedule_due_idx on loan_repayment_schedule (org_id, due_date) where paid_at is null;

-- Schedule rows exist exactly once per application and the totals must
-- reconstruct the loan: sum(principal) = disbursed principal.
create or replace function enforce_schedule_total() returns trigger as $$
declare
  v_principal numeric(14, 2);
  v_app_amount numeric(14, 2);
begin
  select requested_amount into v_app_amount from loan_applications where id = new.application_id;
  if v_app_amount is null then
    return new; -- application gone: cascade will clean up
  end if;
  select coalesce(sum(principal), 0) into v_principal
  from loan_repayment_schedule
  where application_id = new.application_id and seq <> coalesce(old.seq, -1);
  if v_principal + new.principal > v_app_amount + 0.01 then
    raise exception 'Schedule principal total % exceeds the approved amount %', v_principal + new.principal, v_app_amount;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_schedule_total_guard before insert or update on loan_repayment_schedule
for each row execute function enforce_schedule_total();

-- Disbursing an application moves it to the disbursed status (mirrors the
-- API service layer; defense in depth against direct writes).
create or replace function mark_application_disbursed() returns trigger as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    update loan_applications
       set status = 'disbursed', updated_at = now()
     where id = new.application_id
       and status in ('approved', 'disbursed');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_disbursement_marks_application after update on loan_disbursements
for each row execute function mark_application_disbursed();

drop trigger if exists trg_touch_loan_disbursements on loan_disbursements;
create trigger trg_touch_loan_disbursements before update on loan_disbursements
for each row execute function touch_updated_at();
