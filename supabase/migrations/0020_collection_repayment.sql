-- 0020_collection_repayment.sql — Collection & Repayment module.
-- Idempotent collection entries (offline-safe), officer cash handovers with
-- shortage/excess tracking, and the payment-allocation guard trigger.

-- ── Collection entries ───────────────────────────────────────────────────────
create table if not exists collection_entries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  idempotency_key uuid not null unique,
  member_id       uuid not null references members(id),
  application_id  uuid references loan_applications(id),
  meeting_date    date not null,
  loan_paid       numeric(14,2) not null default 0 check (loan_paid >= 0),
  savings_paid    numeric(14,2) not null default 0 check (savings_paid >= 0),
  extra_paid      numeric(14,2) not null default 0 check (extra_paid >= 0),
  allocation      jsonb not null,
  receipt_no      text not null,
  collected_by    uuid references auth.users(id),
  captured_at     timestamptz,
  note            text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create index if not exists collection_entries_branch_date_idx
  on collection_entries (branch_id, meeting_date);
create index if not exists collection_entries_officer_idx
  on collection_entries (collected_by, meeting_date);
create unique index if not exists collection_entries_receipt_uq
  on collection_entries (org_id, receipt_no);

-- ── Officer cash handovers ───────────────────────────────────────────────────
create table if not exists cash_handovers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  officer_id      uuid not null references auth.users(id),
  handover_date   date not null,
  expected_amount numeric(14,2) not null default 0,
  counted_amount  numeric(14,2),
  received_amount numeric(14,2),
  difference      numeric(14,2) not null default 0,
  difference_kind text not null default 'none'
    check (difference_kind in ('none', 'shortage', 'excess')),
  status          text not null default 'draft'
    check (status in ('draft', 'submitted', 'confirmed', 'rejected')),
  officer_note    text,
  accountant_note text,
  confirmed_by    uuid references auth.users(id),
  confirmed_at    timestamptz,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One handover per officer per day.
  unique (org_id, officer_id, handover_date)
);

create index if not exists cash_handovers_branch_date_idx
  on cash_handovers (branch_id, handover_date);

-- ── Receipt numbering per branch per day ─────────────────────────────────────
create table if not exists receipt_counters (
  branch_id uuid not null references branches(id),
  yr        int not null,
  last_seq  int not null default 0,
  primary key (branch_id, yr)
);

-- ── Allocation guard (defense in depth — mirrors shared/collection-engine) ──
-- Overdue installments must be settled before later ones when the allocation
-- order is overdue_first; a posting may never leave an earlier installment
-- unpaid while paying a later one in the same call.
create or replace function enforce_collection_allocation_order()
returns trigger as $$
begin
  -- Every installment referenced by the allocation must exist on the
  -- application, and no applied amount may exceed what is owed on it.
  if new.application_id is not null then
    if (new.allocation -> 'overdueApplied') <> '[]'::jsonb
       or new.allocation ? 'currentApplied' then
      perform 1 from loan_repayment_schedule s
        where s.application_id = new.application_id
          and s.seq in (
            select (x ->> 'seq')::int
            from jsonb_array_elements(new.allocation -> 'overdueApplied') x
            union
            select (new.allocation -> 'currentApplied' ->> 'seq')::int
            where new.allocation ? 'currentApplied'
          );
      if not found then
        raise exception 'Allocation references unknown installments';
      end if;
    end if;

    perform 1 from loan_repayment_schedule s
      where s.application_id = new.application_id
        and s.seq = (new.allocation -> 'currentApplied' ->> 'seq')::int
        and s.paid_amount + (new.allocation -> 'currentApplied' ->> 'amount')::numeric <= s.total;
    if new.allocation ? 'currentApplied' and not found then
      raise exception 'Current-installment allocation exceeds the amount due';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_collection_allocation on collection_entries;
create trigger trg_collection_allocation
  before insert on collection_entries
  for each row execute function enforce_collection_allocation_order();

-- ── Handover difference keeper ───────────────────────────────────────────────
create or replace function keep_handover_difference()
returns trigger as $$
begin
  if new.counted_amount is not null then
    new.difference := new.counted_amount - new.expected_amount;
    new.difference_kind := case
      when abs(new.difference) < 0.005 then 'none'
      when new.difference < 0 then 'shortage'
      else 'excess'
    end;
  else
    new.difference := 0;
    new.difference_kind := 'none';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_handover_difference on cash_handovers;
create trigger trg_handover_difference
  before insert or update on cash_handovers
  for each row execute function keep_handover_difference();

-- ── Cash tally: expected amount for an officer on a date ────────────────────
-- Sum of collection entries' allocated totals for that officer/day
-- (loan_paid + savings_paid + extra_paid minus any unapplied remainder).
create or replace function officer_cash_expected(
  p_org_id uuid,
  p_officer_id uuid,
  p_handover_date date
) returns numeric(14,2) as $$
  select coalesce(sum(loan_paid + savings_paid + extra_paid), 0)
  from collection_entries
  where org_id = p_org_id
    and collected_by = p_officer_id
    and meeting_date = p_handover_date;
$$ language sql stable;

-- ── Receipt numbering (concurrency-safe per branch per year) ────────────────
create or replace function next_receipt_no(
  p_org_id uuid,
  p_branch_id uuid
) returns text as $$
declare
  v_branch_code text;
  v_year int := extract(year from now())::int;
  v_seq int;
begin
  select code into v_branch_code from branches where id = p_branch_id and org_id = p_org_id;
  v_branch_code := coalesce(v_branch_code, 'BR');

  insert into receipt_counters (branch_id, yr, last_seq)
  values (p_branch_id, v_year, 1)
  on conflict (branch_id, yr) do update set last_seq = receipt_counters.last_seq + 1
  returning last_seq into v_seq;

  return 'RCP-' || v_branch_code || '-' || substr(v_year::text, 3, 2) || '-' || lpad(v_seq::text, 4, '0');
end;
$$ language plpgsql;
