-- 0029_accounting_rls.sql — RLS for the accounting tables.
-- Reads are org-scoped staff permissions; voucher workflow writes are
-- role-gated (accountant/manager roles); cash-book closing requires
-- branch_manager or above; day-end locked rows stay read-only via triggers.

alter table gl_accounts             enable row level security;
alter table vouchers                enable row level security;
alter table voucher_lines           enable row level security;
alter table voucher_attachments     enable row level security;
alter table journal_postings        enable row level security;
alter table event_journal_mappings  enable row level security;
alter table cash_book_days          enable row level security;
alter table cash_book_lines         enable row level security;
alter table bank_reconciliations    enable row level security;
alter table bank_statement_lines    enable row level security;
alter table petty_cash_accounts     enable row level security;
alter table petty_cash_movements    enable row level security;

-- Reuse helpers from 0002_rls.sql: auth_org_id(), auth_user_role().

-- ── Chart of accounts: all staff read; admins manage ────────────────────────
create policy gl_accounts_read on gl_accounts
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy gl_accounts_write on gl_accounts
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ── Vouchers: staff read; workflow writes gated ─────────────────────────────
create policy vouchers_read on vouchers
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy vouchers_insert on vouchers
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));
create policy vouchers_update on vouchers
  for update using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create policy voucher_lines_read on voucher_lines
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy voucher_lines_write on voucher_lines
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create policy voucher_attachments_read on voucher_attachments
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy voucher_attachments_write on voucher_attachments
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

-- ── Auto-postings + mappings ────────────────────────────────────────────────
create policy journal_postings_read on journal_postings
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy journal_postings_write on journal_postings
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create policy event_mappings_read on event_journal_mappings
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy event_mappings_write on event_journal_mappings
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ── Cash book: staff read; accountant/manager write; close = BM+ ────────────
create policy cash_book_read on cash_book_days
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy cash_book_write on cash_book_days
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create policy cash_book_lines_read on cash_book_lines
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy cash_book_lines_write on cash_book_lines
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

-- ── Bank reconciliation ─────────────────────────────────────────────────────
create policy bank_rec_read on bank_reconciliations
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy bank_rec_write on bank_reconciliations
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create policy bank_stmt_read on bank_statement_lines
  for select using (
    exists (select 1 from bank_reconciliations r
            where r.id = bank_statement_lines.reconciliation_id
              and r.org_id = auth_org_id()
              and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')));
create policy bank_stmt_write on bank_statement_lines
  for all using (
    exists (select 1 from bank_reconciliations r
            where r.id = bank_statement_lines.reconciliation_id
              and r.org_id = auth_org_id()
              and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer')))
  with check (
    exists (select 1 from bank_reconciliations r
            where r.id = bank_statement_lines.reconciliation_id
              and r.org_id = auth_org_id()
              and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer')));

-- ── Petty cash ──────────────────────────────────────────────────────────────
create policy petty_accounts_read on petty_cash_accounts
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy petty_accounts_write on petty_cash_accounts
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create policy petty_movements_read on petty_cash_movements
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy petty_movements_write on petty_cash_movements
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));
