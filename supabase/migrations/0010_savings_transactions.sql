-- 0010_savings_transactions.sql — immutable savings ledger and interest support.

create table savings_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  account_id uuid not null references savings_accounts (id) on delete restrict,
  to_account_id uuid references savings_accounts (id) on delete restrict,
  transaction_type text not null check (transaction_type in ('deposit', 'withdrawal', 'interest', 'transfer', 'adjustment', 'closure')),
  amount numeric(14,2) not null check (amount > 0),
  balance_after numeric(14,2) not null check (balance_after >= 0),
  reference text,
  note text,
  reversal_of uuid references savings_transactions (id) on delete restrict,
  reversal_reason text,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  interest_period text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index savings_transactions_account_idx on savings_transactions (account_id, created_at desc);
create unique index savings_interest_period_idx on savings_transactions (account_id, interest_period)
  where transaction_type = 'interest' and interest_period is not null;
create unique index savings_weekly_auto_link_idx on savings_transactions (account_id, reference)
  where reference like 'Compulsory weekly %';

create or replace function reject_savings_transaction_mutation() returns trigger as $$
begin
  raise exception 'Savings transactions are immutable; post a reversal entry instead';
end;
$$ language plpgsql;

create trigger savings_transactions_no_update before update or delete on savings_transactions
for each row execute function reject_savings_transaction_mutation();

create or replace function post_savings_transaction(
  p_account_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_created_by uuid,
  p_reference text default null,
  p_note text default null,
  p_to_account_id uuid default null,
  p_reversal_of uuid default null,
  p_reversal_reason text default null,
  p_approved_by uuid default null,
  p_interest_period text default null
) returns savings_transactions as $$
declare
  v_account savings_accounts;
  v_product savings_products;
  v_delta numeric(14,2);
  v_balance numeric(14,2);
  v_tx savings_transactions;
  v_original savings_transactions;
begin
  if p_amount <= 0 then raise exception 'Transaction amount must be positive'; end if;
  if p_transaction_type = 'transfer' and p_to_account_id is null then raise exception 'Transfer destination is required'; end if;
  select * into v_account from savings_accounts where id = p_account_id and deleted_at is null for update;
  if not found then raise exception 'Savings account not found'; end if;
  select * into v_product from savings_products where id = v_account.product_id and deleted_at is null;
  if not found then raise exception 'Savings product not found'; end if;
  if v_account.status = 'closed' then raise exception 'Savings account is closed'; end if;
  if p_transaction_type = 'transfer' and not exists (
    select 1 from savings_accounts where id = p_to_account_id and org_id = v_account.org_id and deleted_at is null and status <> 'closed'
  ) then
    raise exception 'Transfer destination account not found';
  end if;

  if p_reversal_of is not null then
    select * into v_original from savings_transactions where id = p_reversal_of and account_id = p_account_id;
    if not found or v_original.reversal_of is not null then raise exception 'Only original transactions can be reversed'; end if;
    if p_reversal_reason is null or length(trim(p_reversal_reason)) = 0 or p_approved_by is null then
      raise exception 'Reversal reason and approval are required';
    end if;
    v_delta := case when v_original.transaction_type in ('withdrawal','adjustment','closure') then v_original.amount else -v_original.amount end;
  elsif p_transaction_type in ('withdrawal', 'adjustment', 'closure', 'transfer') then
    v_delta := -p_amount;
  else
    v_delta := p_amount;
  end if;

  if p_transaction_type in ('withdrawal', 'adjustment', 'closure') and v_product.lock_while_loan_active
     and exists (select 1 from loans where member_id = v_account.member_id and status in ('active','disbursed','ongoing') and deleted_at is null) then
    raise exception 'Savings are locked while a loan is active';
  end if;
  v_balance := v_account.balance + v_delta;
  if v_balance < v_product.min_balance then raise exception 'Minimum balance would be breached'; end if;
  if v_balance < 0 then raise exception 'Insufficient savings balance'; end if;
  if p_transaction_type = 'interest' and p_interest_period is null then raise exception 'Interest period is required'; end if;

  insert into savings_transactions (
    org_id, account_id, to_account_id, transaction_type, amount, balance_after, reference, note,
    reversal_of, reversal_reason, approved_by, approved_at, interest_period, created_by
  ) values (
    v_account.org_id, p_account_id, p_to_account_id, p_transaction_type, p_amount, v_balance, p_reference, p_note,
    p_reversal_of, p_reversal_reason, p_approved_by, case when p_approved_by is null then null else now() end,
    p_interest_period, p_created_by
  ) returning * into v_tx;

  update savings_accounts
  set balance = v_balance,
      status = case when p_transaction_type = 'closure' then 'closed' when status = 'dormant' then 'active' else status end,
      closed_at = case when p_transaction_type = 'closure' then now() else closed_at end
  where id = p_account_id;
  if p_transaction_type = 'transfer' then
    update savings_accounts set balance = balance + p_amount where id = p_to_account_id and deleted_at is null;
  end if;
  return v_tx;
end;
$$ language plpgsql security definer set search_path = public;

alter table savings_transactions enable row level security;
create policy savings_transactions_read_org on savings_transactions for select using (org_id = auth_org_id());
create policy savings_transactions_write_staff on savings_transactions for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create or replace function mark_dormant_savings_accounts() returns void as $$
begin
  update savings_accounts sa
  set status = 'dormant'
  from savings_products sp
  where sa.product_id = sp.id
    and sa.status = 'active'
    and sa.deleted_at is null
    and sp.dormant_after_months > 0
    and sa.updated_at < now() - make_interval(months => sp.dormant_after_months);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function auto_link_compulsory_savings_to_loan() returns trigger as $$
declare
  v_account savings_accounts;
begin
  if new.status in ('disbursed', 'active', 'ongoing')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    for v_account in
      select sa.* from savings_accounts sa
      join savings_products sp on sp.id = sa.product_id
      where sa.member_id = new.member_id and sa.deleted_at is null
        and sa.status in ('active', 'dormant')
        and sp.product_type = 'compulsory' and sp.auto_link_loan
    loop
      perform post_savings_transaction(
        v_account.id, 'deposit', new.principal, null,
        'Loan auto-link ' || new.id, 'Compulsory savings linked to loan amount'
      );
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists loans_auto_link_compulsory_savings on loans;
create trigger loans_auto_link_compulsory_savings after insert or update of status on loans
for each row execute function auto_link_compulsory_savings_to_loan();
