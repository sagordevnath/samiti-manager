-- 0019_disbursement_governance_rls.sql — RLS for the governance tables.
-- Journal/ledger and outbox are service-role domains; staff get reads.
-- Passbook rows are visible to staff; visits are branch-managed.

alter table branch_loan_seq            enable row level security;
alter table journal_entries            enable row level security;
alter table journal_lines              enable row level security;
alter table loan_passbook_entries      enable row level security;
alter table sms_outbox                 enable row level security;
alter table utilization_visits         enable row level security;

-- ── branch_loan_seq: service role only ──────────────────────────────────────
-- (no policies → only the service-role client / RPCs can touch it)

-- ── journal: org-scoped reads; writes only via the RPCs ─────────────────────
drop policy if exists journal_entries_read on journal_entries;
create policy journal_entries_read on journal_entries
  for select using (org_id = auth_org_id());

drop policy if exists journal_lines_read on journal_lines;
create policy journal_lines_read on journal_lines
  for select using (
    exists (select 1 from journal_entries e where e.id = journal_lines.entry_id and e.org_id = auth_org_id())
  );

-- ── passbook: staff reads; writes via the RPCs ──────────────────────────────
drop policy if exists loan_passbook_entries_read on loan_passbook_entries;
create policy loan_passbook_entries_read on loan_passbook_entries
  for select using (org_id = auth_org_id());

-- ── sms_outbox: admins read the outbox; delivery worker is service role ─────
drop policy if exists sms_outbox_read on sms_outbox;
create policy sms_outbox_read on sms_outbox
  for select using (org_id = auth_org_id());

-- ── utilization_visits: staff read, branch staff update completion ──────────
drop policy if exists utilization_visits_read on utilization_visits;
create policy utilization_visits_read on utilization_visits
  for select using (org_id = auth_org_id());

drop policy if exists utilization_visits_update on utilization_visits;
create policy utilization_visits_update on utilization_visits
  for update using (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'area_manager', 'branch_manager', 'account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'area_manager', 'branch_manager', 'account_officer'));
