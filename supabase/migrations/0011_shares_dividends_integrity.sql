-- 0011_shares_dividends_integrity.sql — cooperative share capital, dividends,
-- and balance integrity (ledger-vs-balance reconciliation).

-- ── Share capital ────────────────────────────────────────────────────────────
-- Face value per share is a numeric(14,2) BDT amount. Allotments are an
-- append-only ledger (correct via reversals, like savings_transactions).

create table share_allotments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  member_id uuid not null references members (id) on delete restrict,
  product_id uuid not null references savings_products (id) on delete restrict,
  shares integer not null check (shares > 0),
  face_value numeric(14,2) not null check (face_value > 0),
  paid_amount numeric(14,2) not null check (paid_amount >= 0),
  paid_shares integer not null default 0 check (paid_shares >= 0 and paid_shares <= shares),
  reference text,
  reversal_of uuid references share_allotments (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index share_allotments_org_idx on share_allotments (org_id, created_at desc);
create index share_allotments_member_idx on share_allotments (member_id);
create index share_allotments_reversal_idx on share_allotments (reversal_of) where reversal_of is not null;

-- Paid-up shares cannot exceed allotted shares per member/product.
create or replace function enforce_paid_share_cap() returns trigger as $$
declare
  v_allotted integer;
  v_paid integer;
begin
  if new.reversal_of is not null then return new; end if;
  select coalesce(sum(shares), 0) + new.shares into v_allotted
  from share_allotments
  where member_id = new.member_id and product_id = new.product_id;
  select coalesce(sum(paid_shares), 0) + new.paid_shares into v_paid
  from share_allotments
  where member_id = new.member_id and product_id = new.product_id;
  if v_paid > v_allotted then
    raise exception 'Paid shares (%) cannot exceed allotted shares (%)', v_paid, v_allotted;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger share_allotments_paid_cap before insert on share_allotments
for each row execute function enforce_paid_share_cap();

-- ── Dividends ────────────────────────────────────────────────────────────────
create table dividend_declarations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  product_id uuid not null references savings_products (id) on delete restrict,
  financial_year text not null,
  surplus numeric(14,2) not null check (surplus >= 0),
  payout_rate numeric(5,2) not null check (payout_rate between 0 and 100),
  dividend_pool numeric(14,2) not null check (dividend_pool >= 0),
  retained numeric(14,2) not null check (retained >= 0),
  approved_by_meeting_ref text not null,
  approved_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, product_id, financial_year)
);

-- One declaration per org/product/year; pool must equal surplus * payout_rate.
create or replace function enforce_dividend_pool_math() returns trigger as $$
begin
  if round(new.surplus * new.payout_rate / 100, 2) <> new.dividend_pool then
    raise exception 'dividend_pool must equal surplus * payout_rate / 100';
  end if;
  if round(new.surplus - new.dividend_pool, 2) <> new.retained then
    raise exception 'retained must equal surplus - dividend_pool';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger dividend_declarations_math before insert or update on dividend_declarations
for each row execute function enforce_dividend_pool_math();

-- Immutable after the general meeting approval record.
create or replace function reject_dividend_mutation() returns trigger as $$
begin
  if old.status = 'approved' then
    raise exception 'Approved dividends are immutable';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger dividend_declarations_lock before update or delete on dividend_declarations
for each row execute function reject_dividend_mutation();

create table dividend_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  declaration_id uuid not null references dividend_declarations (id) on delete cascade,
  member_id uuid not null references members (id) on delete restrict,
  paid_shares integer not null check (paid_shares > 0),
  face_value numeric(14,2) not null check (face_value > 0),
  amount numeric(14,2) not null check (amount >= 0),
  paid_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (declaration_id, member_id)
);

create index dividend_payments_decl_idx on dividend_payments (declaration_id);

-- ── Balance integrity / reconciliation ───────────────────────────────────────
-- Accounts hold a materialized balance; savings_transactions are the source of
-- truth. The API post path (post_savings_transaction) maintains balance_after
-- per entry, so stored = ledger when the data is consistent.

create or replace function recompute_balance(p_account_id uuid) returns numeric(14,2) as $$
  select coalesce(sum(
    case
      when transaction_type in ('deposit', 'interest') then amount
      when transaction_type = 'transfer' then
        case when account_id = p_account_id then -amount else amount end
      else -amount
    end
  ), 0)::numeric(14,2)
  from savings_transactions
  where (account_id = p_account_id or to_account_id = p_account_id)
    and not exists (
      select 1 from savings_transactions r
      where r.reversal_of = savings_transactions.id
    )
  ;
$$ language sql stable;

create or replace function run_reconciliation(p_org_id uuid) returns table (
  account_id uuid,
  account_number text,
  stored_balance numeric(14,2),
  ledger_balance numeric(14,2),
  difference numeric(14,2),
  entry_count bigint,
  last_entry_at timestamptz,
  status text
) as $$
  select sa.id, sa.account_number, sa.balance,
         coalesce(recompute_balance(sa.id), 0)::numeric(14,2) as ledger_balance,
         (sa.balance - coalesce(recompute_balance(sa.id), 0))::numeric(14,2) as difference,
         count(st.id) as entry_count,
         max(st.created_at) as last_entry_at,
         case when sa.balance = coalesce(recompute_balance(sa.id), 0) then 'ok' else 'mismatch' end
  from savings_accounts sa
  left join savings_transactions st on st.account_id = sa.id
  where sa.org_id = p_org_id and sa.deleted_at is null
  group by sa.id
  order by sa.account_number;
$$ language sql stable;

-- Nightly report materialization: cron in Supabase (pg_cron) or a scheduled
-- GitHub Action calling POST /api/v1/savings/reconciliation/run.
create table reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  run_at timestamptz not null default now(),
  checked integer not null,
  mismatches integer not null,
  results jsonb not null, -- array of ReconciliationResult
  created_by uuid references auth.users (id) on delete set null
);

create index reconciliation_runs_org_idx on reconciliation_runs (org_id, run_at desc);

-- touch triggers
drop trigger if exists trg_touch_dividend_declarations on dividend_declarations;
create trigger trg_touch_dividend_declarations before update on dividend_declarations
for each row execute function touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table share_allotments       enable row level security;
alter table dividend_declarations  enable row level security;
alter table dividend_payments      enable row level security;
alter table reconciliation_runs    enable row level security;

create policy share_allotments_read_org on share_allotments for select using (org_id = auth_org_id());
create policy share_allotments_write_staff on share_allotments for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));
create policy share_allotments_update_admin on share_allotments for update
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy dividend_declarations_read_org on dividend_declarations for select using (org_id = auth_org_id());
create policy dividend_declarations_write_admin on dividend_declarations for all
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy dividend_payments_read_org on dividend_payments for select using (org_id = auth_org_id());
create policy dividend_payments_write_admin on dividend_payments for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy reconciliation_runs_read_staff on reconciliation_runs for select
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- Members may read their own passbook statements via the API (service role);
-- direct RLS on savings_transactions already scoped reads to org staff.
