-- 0009_savings_module.sql — savings product setup and member accounts.

create table savings_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  code text not null,
  name text not null,
  name_bn text,
  product_type text not null check (product_type in ('compulsory', 'voluntary', 'dps', 'fixed', 'share')),
  interest_rate numeric(5,2) not null default 0 check (interest_rate between 0 and 100),
  compounding text not null default 'none' check (compounding in ('none', 'simple', 'quarterly', 'monthly', 'yearly')),
  min_balance numeric(14,2) not null default 0 check (min_balance >= 0),
  max_deposit numeric(14,2) check (max_deposit is null or max_deposit >= 0),
  withdrawal_limit numeric(14,2) not null default 0 check (withdrawal_limit >= 0),
  withdrawal_limit_period text not null default 'per_tx' check (withdrawal_limit_period in ('per_tx', 'daily', 'monthly')),
  withdrawal_rules text,
  lock_while_loan_active boolean not null default false,
  maturity_months integer not null default 0 check (maturity_months between 0 and 600),
  early_withdrawal_penalty_rate numeric(5,2) not null default 0 check (early_withdrawal_penalty_rate between 0 and 100),
  auto_link_loan boolean not null default false,
  auto_link_weekly_amount numeric(14,2) not null default 0 check (auto_link_weekly_amount >= 0),
  requires_manager_approval_above numeric(14,2) not null default 0 check (requires_manager_approval_above >= 0),
  dormant_after_months integer not null default 6 check (dormant_after_months between 0 and 120),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index savings_products_org_code_idx on savings_products (org_id, lower(code)) where deleted_at is null;

alter table savings_accounts
  add column if not exists product_id uuid references savings_products (id) on delete restrict,
  add column if not exists account_number text,
  add column if not exists opening_date date not null default current_date,
  add column if not exists status text not null default 'active' check (status in ('active', 'dormant', 'frozen', 'closed')),
  add column if not exists nominee_id uuid references members (id) on delete set null,
  add column if not exists maturity_date date,
  add column if not exists closed_at timestamptz;

update savings_accounts
set account_number = 'SA-' || upper(substr(replace(id::text, '-', ''), 1, 12))
where account_number is null;

alter table savings_accounts alter column account_number set not null;
create unique index savings_accounts_number_idx on savings_accounts (account_number) where deleted_at is null;
create unique index savings_accounts_member_product_idx on savings_accounts (member_id, product_id)
  where deleted_at is null and product_id is not null;
create index savings_products_org_idx on savings_products (org_id) where deleted_at is null;

drop trigger if exists trg_touch_savings_products on savings_products;
create trigger trg_touch_savings_products before update on savings_products
for each row execute function touch_updated_at();

alter table savings_products enable row level security;
create policy savings_products_read_org on savings_products for select using (org_id = auth_org_id());
create policy savings_products_write_staff on savings_products for all
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));
