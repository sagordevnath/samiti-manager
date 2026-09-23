-- 0028_accounting.sql — Accounting & double-entry bookkeeping (Module 10).
-- Chart of accounts (org-editable) with fund/project + branch dimensions,
-- vouchers with draft → checked → approved workflow, event-to-journal
-- mapping for automatic postings, daily branch cash book with locking,
-- bank reconciliation, and a petty-cash register.
--
-- Conventions: id uuid, org_id, branch_id where relevant, created_by,
-- created_at, updated_at, deleted_at (soft delete). Money numeric(14,2).

-- ── 1) Chart of accounts ────────────────────────────────────────────────────
create table if not exists gl_accounts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  code        varchar(4) not null,
  name        text not null,
  name_bn     text not null,
  type        text not null check (type in ('asset','liability','fund','income','expense')),
  category    text not null check (category in ('control','cash','bank','income','expense','party','member','memo')),
  parent_code varchar(4) references gl_accounts(code),
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (org_id, code)
);

-- ── 2) Vouchers ─────────────────────────────────────────────────────────────
create table if not exists vouchers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  branch_id      uuid not null references branches(id),
  voucher_number text not null unique,           -- VCH-<prefix>-<branchCode>-<YY>-<seq>
  voucher_type   text not null check (voucher_type in ('cash_receipt','cash_payment','bank_payment','journal','contra')),
  voucher_date   date not null,
  fund_id        uuid,                            -- fund/project dimension
  project_name   text,
  payee_payer    text,
  memo           text not null,
  status         text not null default 'draft' check (status in ('draft','checked','approved')),
  auto_source    text,                            -- event key when auto-posted
  amount_total   numeric(14,2) not null default 0 check (amount_total >= 0),
  prepared_by    uuid references auth.users(id),
  checked_by     uuid references auth.users(id),
  checked_at     timestamptz,
  approved_by    uuid references auth.users(id),
  approved_at    timestamptz,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table if not exists voucher_lines (
  id           uuid primary key default gen_random_uuid(),
  voucher_id   uuid not null references vouchers(id) on delete cascade,
  org_id       uuid not null references organizations(id),
  account_code varchar(4) not null references gl_accounts(code),
  fund_id      uuid,
  project_name text,
  party_name   text,
  note         text,
  debit        numeric(14,2) not null default 0 check (debit >= 0),
  credit       numeric(14,2) not null default 0 check (credit >= 0),
  check (debit = 0 or credit = 0),
  check (debit + credit > 0)
);

-- Balanced-voucher guard (defense in depth with the Zod refine).
create or replace function fn_voucher_balanced() returns trigger as $$
declare
  v_debit  numeric(14,2);
  v_credit numeric(14,2);
begin
  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_debit, v_credit
  from voucher_lines where voucher_id = coalesce(new.id, old.voucher_id);
  if abs(v_debit - v_credit) > 0.005 then
    raise exception 'Voucher % is not balanced (Dr % / Cr %)', coalesce(new.id, old.voucher_id), v_debit, v_credit;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_voucher_balanced
  after insert or update or delete on voucher_lines
  for each row execute function fn_voucher_balanced();

-- Workflow transition guard: draft → checked → approved, no skipping.
create or replace function fn_voucher_transition() returns trigger as $$
begin
  if new.status = 'checked' and old.status <> 'draft' then
    raise exception 'Only a draft voucher can be checked';
  end if;
  if new.status = 'approved' and old.status <> 'checked' then
    raise exception 'Only a checked voucher can be approved';
  end if;
  if old.status = 'approved' and new.status <> 'approved' then
    raise exception 'Approved vouchers are immutable';
  end if;
  if new.status = 'checked' then new.checked_by := auth.uid(); new.checked_at := now(); end if;
  if new.status = 'approved' then new.approved_by := auth.uid(); new.approved_at := now(); end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_voucher_transition
  before update of status on vouchers
  for each row execute function fn_voucher_transition();

-- Attachments (metadata only; binaries live in a private storage bucket).
create table if not exists voucher_attachments (
  id          uuid primary key default gen_random_uuid(),
  voucher_id  uuid not null references vouchers(id) on delete cascade,
  org_id      uuid not null references organizations(id),
  name        text not null,
  storage_path text not null,
  size_bytes  bigint not null check (size_bytes between 0 and 20971520),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

-- ── 3) Event-to-journal mapping (automatic postings) ────────────────────────
create table if not exists journal_postings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  branch_id    uuid references branches(id),
  event        text not null check (event in (
                 'savings_deposit','savings_withdrawal','loan_disbursement','loan_collection',
                 'fee_collected','insurance_premium','salary_payment','loan_writeoff','provision_posted')),
  source_table text not null,
  source_id    uuid not null,
  amount       numeric(14,2) not null check (amount >= 0),
  entry_date   date not null default current_date,
  memo         text,
  voucher_id   uuid references vouchers(id),
  idempotency_key text unique,                    -- e.g. 'collection:<entryId>'
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  unique (source_table, source_id, event)
);

create table if not exists event_journal_mappings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  event          text not null check (event in (
                   'savings_deposit','savings_withdrawal','loan_disbursement','loan_collection',
                   'fee_collected','insurance_premium','salary_payment','loan_writeoff','provision_posted')),
  settlement_code varchar(4) not null references gl_accounts(code),
  counter_code    varchar(4) not null references gl_accounts(code),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, event),
  check (settlement_code <> counter_code)
);

-- ── 4) Daily branch cash book ───────────────────────────────────────────────
create table if not exists cash_book_days (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id),
  branch_id           uuid not null references branches(id),
  book_date           date not null,
  status              text not null default 'open' check (status in ('open','closed')),
  opening_balance     numeric(14,2) not null default 0,
  total_cash_in       numeric(14,2) not null default 0,
  total_cash_out      numeric(14,2) not null default 0,
  expected_closing    numeric(14,2) not null default 0,
  counted_cash        numeric(14,2),
  difference          numeric(14,2),
  difference_kind     text check (difference_kind in ('shortage','excess','exact')),
  closing_balance     numeric(14,2),
  locked              boolean not null default false,
  manager_sign_name   text,
  accountant_sign_name text,
  closed_at           timestamptz,
  note                text,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (branch_id, book_date)
);

create table if not exists cash_book_lines (
  id            uuid primary key default gen_random_uuid(),
  cash_book_id  uuid not null references cash_book_days(id) on delete cascade,
  voucher_id    uuid references vouchers(id),
  voucher_number text,
  voucher_type  text,                             -- voucher type or 'auto'
  memo          text not null,
  cash_in       numeric(14,2) not null default 0 check (cash_in >= 0),
  cash_out      numeric(14,2) not null default 0 check (cash_out >= 0),
  created_at    timestamptz not null default now()
);

-- Day-end locking: once locked, nothing may change for that day.
create or replace function fn_cash_book_locked() returns trigger as $$
declare
  v_locked boolean;
  v_book_id uuid;
begin
  v_book_id := coalesce(new.cash_book_id, old.id);
  if tg_table_name = 'cash_book_days' then
    if old.locked and (
         new.opening_balance is distinct from old.opening_balance
      or new.total_cash_in   is distinct from old.total_cash_in
      or new.total_cash_out  is distinct from old.total_cash_out
      or new.counted_cash    is distinct from old.counted_cash
    ) then
      raise exception 'Cash book for % is locked (day-end closing)', old.book_date;
    end if;
    return coalesce(new, old);
  end if;
  select locked into v_locked from cash_book_days where id = v_book_id;
  if v_locked then
    raise exception 'Cash book % is locked; new lines are rejected', v_book_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_cash_book_days_lock
  before update or delete on cash_book_days
  for each row execute function fn_cash_book_locked();
create trigger trg_cash_book_lines_lock
  before insert or update or delete on cash_book_lines
  for each row execute function fn_cash_book_locked();

-- ── 5) Bank reconciliation ──────────────────────────────────────────────────
create table if not exists bank_reconciliations (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id),
  branch_id         uuid not null references branches(id),
  bank_code         varchar(4) not null references gl_accounts(code),
  period_start      date not null,
  period_end        date not null,
  book_balance      numeric(14,2) not null default 0,
  statement_balance numeric(14,2) not null default 0,
  status            text not null default 'pending' check (status in ('pending','cleared')),
  prepared_by       uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists bank_statement_lines (
  id            uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references bank_reconciliations(id) on delete cascade,
  value_date    date not null,
  narration     text not null,
  amount        numeric(14,2) not null,           -- + credit (money in), − debit (money out)
  cleared       boolean not null default false,
  matched_voucher_number text,
  created_at    timestamptz not null default now()
);

-- ── Petty cash register ─────────────────────────────────────────────────────
create table if not exists petty_cash_accounts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id),
  branch_id  uuid not null references branches(id) unique,
  balance    numeric(14,2) not null default 0 check (balance >= 0),
  spend_limit numeric(14,2) not null default 2000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists petty_cash_movements (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  branch_id    uuid not null references branches(id),
  kind         text not null check (kind in ('top_up','spend')),
  amount       numeric(14,2) not null check (amount > 0),
  expense_code varchar(4) references gl_accounts(code),
  spent_on     text,
  note         text,
  balance_after numeric(14,2) not null,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

-- Spending guard: never below zero (limit is enforced in the service layer).
create or replace function fn_petty_cash_floor() returns trigger as $$
declare
  v_balance numeric(14,2);
begin
  select balance into v_balance from petty_cash_accounts
    where branch_id = coalesce(new.branch_id, old.branch_id);
  if v_balance < 0 then
    raise exception 'Petty cash balance cannot go below zero';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_petty_cash_floor
  after update of balance on petty_cash_accounts
  for each row execute function fn_petty_cash_floor();

-- Seed the default chart of accounts + event mappings for every org.
insert into gl_accounts (org_id, code, name, name_bn, type, category, parent_code)
select o.id, d.code, d.name, d.name_bn, d.type, d.category, d.parent_code
from organizations o
cross join (values
  ('1000','Cash & Bank (Control)','নগদ ও ব্যাংক (নিয়ন্ত্রণ)','asset','control',null::varchar),
  ('1010','Cash in Vault','নগদ তহবিল','asset','cash','1000'),
  ('1015','Petty Cash','খুচরা নগদ','asset','cash','1000'),
  ('1020','Bank Account','ব্যাংক হিসাব','asset','bank','1000'),
  ('1030','MFS Clearing','মোবাইল ব্যাংকিং ক্লিয়ারিং','asset','bank','1000'),
  ('1200','Loan Portfolio','ঋণ পোর্টফোলিও','asset','control',null),
  ('1300','Loan Loss Provision Reserve','ঋণ ক্ষতি সঞ্চিতি সংরক্ষণ','asset','control',null),
  ('1400','Stationery & Stock','স্টেশনারি ও মজুদ','asset','control',null),
  ('2100','Member Savings Deposits','সদস্য সঞ্চয় আমানত','liability','control',null),
  ('2110','Term Deposits (DPS/FDR)','মেয়াদি আমানত','liability','control','2100'),
  ('2200','Member Advance Credit','সদস্য অগ্রিম জমা','liability','control',null),
  ('2300','Loan Loss Provision (P&L offset)','ঋণ ক্ষতি সঞ্চিতি (লাভ-ক্ষতি)','liability','control',null),
  ('2400','Salary Payable','বেতন বাক্যবাহী','liability','control',null),
  ('2500','Insurance Claim Payable','বীমা দাবি বাক্যবাহী','liability','control',null),
  ('3100','Members'' Share Capital','সদস্য শেয়ার মূলধন','fund','control',null),
  ('3200','General Fund','সাধারণ তহবিল','fund','control',null),
  ('3300','Dividend Payable','লভ্যাংশ বাক্যবাহী','fund','control',null),
  ('4100','Interest Income','সুদ আয়','income','income',null),
  ('4200','Loan Processing Fee Income','ঋণ প্রক্রিয়াকরণ ফি আয়','income','income',null),
  ('4210','Service Charge Income','সার্ভিস চার্জ আয়','income','income',null),
  ('4220','Insurance Premium Income','বীমা প্রিমিয়াম আয়','income','income',null),
  ('4300','Savings Interest Expense (contra)','সঞ্চয় সুদ ব্যয় (বিপরীত)','income','income',null),
  ('4400','Write-off Recovery Income','অপুনরুদ্ধারযোগ্য ঋণ পুনরুদ্ধার আয়','income','income',null),
  ('4500','Other Income','অন্যান্য আয়','income','income',null),
  ('6100','Salaries & Allowances','বেতন ও ভাতা','expense','expense',null),
  ('6110','Office Rent','অফিস ভাড়া','expense','expense',null),
  ('6120','Utilities & Communication','ইউটিলিটি ও যোগাযোগ','expense','expense',null),
  ('6130','Travel & Conveyance','ভ্রমণ ও যাতায়াত','expense','expense',null),
  ('6200','Loan Write-off Expense','ঋণ লেখা ব্যয়','expense','expense',null),
  ('6210','Write-off Recovery Income (contra)','পুনরুদ্ধার আয় (বিপরীত)','expense','expense',null),
  ('6300','Audit & Legal','নিরীক্ষা ও আইনগত','expense','expense',null),
  ('7100','Loan Loss Provision Expense','ঋণ ক্ষতি সঞ্চিতি ব্যয়','expense','expense',null)
) as d(code, name, name_bn, type, category, parent_code)
where not exists (
  select 1 from gl_accounts g where g.org_id = o.id and g.code = d.code
);
