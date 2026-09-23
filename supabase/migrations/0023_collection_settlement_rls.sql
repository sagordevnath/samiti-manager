-- 0023_collection_settlement_rls.sql — RLS for the settlement/control tables.
-- Reuses helpers from 0002_rls.sql (auth_org_id(), auth_user_role(),
-- auth_user_branch_id()).

alter table collection_rules          enable row level security;
alter table collection_reversals      enable row level security;
alter table loan_reschedules          enable row level security;
alter table loan_write_offs           enable row level security;
alter table loan_closures             enable row level security;
alter table collection_fraud_flags    enable row level security;

-- ── Rules config: org-scoped read; org admins write ─────────────────────────
create policy rules_read on collection_rules
  for select using (org_id = auth_org_id());
create policy rules_write on collection_rules
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id());

-- ── Reversals: staff read; Branch Manager+ write ────────────────────────────
create policy reversals_read on collection_reversals
  for select using (org_id = auth_org_id());
create policy reversals_write on collection_reversals
  for insert with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','director_operations','branch_manager')
  );

-- ── Reschedules: branch staff read; managers/AM request + decide ────────────
create policy reschedules_read on loan_reschedules
  for select using (org_id = auth_org_id());
create policy reschedules_write on loan_reschedules
  for all using (org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','director_operations','area_manager','branch_manager'))
  with check (org_id = auth_org_id());

-- ── Write-offs: staff read; AM recommends, director approves ────────────────
create policy writeoffs_read on loan_write_offs
  for select using (org_id = auth_org_id());
create policy writeoffs_write on loan_write_offs
  for all using (org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','director_operations','area_manager'))
  with check (org_id = auth_org_id());

-- ── Closures: staff read; branch managers + accountants close ───────────────
create policy closures_read on loan_closures
  for select using (org_id = auth_org_id());
create policy closures_write on loan_closures
  for all using (org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','director_operations','area_manager','branch_manager','accountant'))
  with check (org_id = auth_org_id());

-- ── Fraud flags: read by supervisors; system/BM writes ──────────────────────
create policy fraud_read on collection_fraud_flags
  for select using (org_id = auth_org_id());
create policy fraud_write on collection_fraud_flags
  for all using (org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','director_operations','area_manager','branch_manager'))
  with check (org_id = auth_org_id());
