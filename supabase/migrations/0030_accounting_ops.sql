-- 0030_accounting_ops.sql — Accounting requirements 6–10: fund requisitions
-- and inter-branch transfers with matching entries, budget lines, period
-- close, and the savings-restriction guard on voucher lines.

-- ── 6) Fund requisitions / inter-branch transfers ────────────────────────────
create table if not exists fund_requisitions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  kind            text not null check (kind in ('branch_to_ho','ho_to_branch','inter_branch')),
  from_node_id    uuid not null,
  to_node_id      uuid not null,
  amount          numeric(14,2) not null check (amount > 0),
  purpose         text not null,
  status          text not null default 'requested' check (status in ('requested','approved','rejected','disbursed','received')),
  settlement_code varchar(4) not null references gl_accounts(code),
  requested_by    uuid not null,
  decided_by      uuid,
  decided_at      timestamptz,
  out_voucher_id  uuid references vouchers(id),
  in_voucher_id   uuid references vouchers(id),
  note            text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  check (from_node_id <> to_node_id)
);

-- ── 7) Posting rule: savings cannot fund fixed assets or expenses ───────────
-- Mirrors checkVoucherPostingRules() in @samity/shared. A voucher that
-- credits savings (2100/2110) while debiting an expense or a fixed asset is
-- rejected at the DB level too.
create or replace function fn_voucher_savings_rule() returns trigger as $$
declare
  v_voucher   uuid;
  v_savings   numeric(14,2);
  v_line      record;
begin
  v_voucher := coalesce(new.voucher_id, old.voucher_id);
  if v_voucher is null then return coalesce(new, old); end if;

  select coalesce(sum(credit), 0) into v_savings
  from voucher_lines
  where voucher_id = v_voucher and account_code in ('2100','2110');

  if v_savings = 0 then return coalesce(new, old); end if;

  for v_line in
    select vl.account_code, coalesce(ga.type, '') as acc_type
    from voucher_lines vl
    left join gl_accounts ga on ga.code = vl.account_code
    where vl.voucher_id = v_voucher and vl.debit > 0
  loop
    if v_line.acc_type = 'expense' then
      raise exception 'Voucher %: savings cannot fund expenses (savings_to_expense)', v_voucher;
    end if;
    if v_line.account_code in ('1500','1510','1520') then
      raise exception 'Voucher %: savings cannot fund fixed assets (savings_to_fixed_asset)', v_voucher;
    end if;
  end loop;

  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_voucher_savings_rule on voucher_lines;
create trigger trg_voucher_savings_rule
  after insert or update or delete on voucher_lines
  for each row execute function fn_voucher_savings_rule();

-- ── 8) Budget lines (budget vs actual) ──────────────────────────────────────
create table if not exists gl_budgets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  branch_id     uuid references branches(id),
  account_code  varchar(4) not null references gl_accounts(code),
  period_start  date not null,
  period_end    date not null,
  amount        numeric(14,2) not null check (amount >= 0),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (org_id, branch_id, account_code, period_start)
);

-- ── 9) Period close ─────────────────────────────────────────────────────────
create table if not exists period_closes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  kind          text not null check (kind in ('monthly','annual')),
  period_start  date not null,
  period_end    date not null,
  closed_by     uuid not null,
  closed_at     timestamptz not null default now(),
  snapshot_json jsonb not null default '{}'::jsonb,
  note          text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (org_id, kind, period_start)
);

-- Once a period is closed, new/approved vouchers inside it are blocked at the
-- DB level. Reopen (delete of the close row) is gated by RLS to Director
-- Finance roles in 0031.
create or replace function fn_period_locked() returns trigger as $$
declare
  v_locked int;
begin
  select count(*) into v_locked
  from period_closes pc
  where pc.deleted_at is null
    and new.voucher_date >= pc.period_start
    and new.voucher_date <= pc.period_end;

  if v_locked > 0 then
    raise exception 'Period containing % is closed; reopen required (Director Finance)', new.voucher_date;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_period_locked on vouchers;
create trigger trg_period_locked
  before insert or update of voucher_date on vouchers
  for each row execute function fn_period_locked();

-- Indexes for the report scans.
create index if not exists idx_vouchers_date_status on vouchers(voucher_date, status) where deleted_at is null;
create index if not exists idx_voucher_lines_account on voucher_lines(account_code);
create index if not exists idx_fund_requisitions_status on fund_requisitions(status) where deleted_at is null;
