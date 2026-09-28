-- 0043_coop_governance_rls.sql — RLS for dividend, AGM and exit tables.
-- Staff read org-scoped; dividend computation/posting is admin/accountant;
-- AGM records are admin managed (staff read); exits are branch workflow
-- writable by BM and above.

alter table dividend_distributions enable row level security;
alter table dividend_lines         enable row level security;
alter table agm_records            enable row level security;
alter table member_exits           enable row level security;

-- ── Dividend distributions: staff read; admin/accountant manage ─────────────
create policy "dividend_read" on dividend_distributions
  for select to authenticated
  using (org_id = auth_org_id());
create policy "dividend_manage" on dividend_distributions
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  );

create policy "dividend_lines_read" on dividend_lines
  for select to authenticated
  using (org_id = auth_org_id());
create policy "dividend_lines_manage" on dividend_lines
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  );

-- ── AGM: all staff read; admin authors and approves minutes ─────────────────
create policy "agm_read" on agm_records
  for select to authenticated
  using (org_id = auth_org_id());
create policy "agm_manage" on agm_records
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  );

-- ── Member exits: staff read; branch workflow writes ────────────────────────
create policy "member_exits_read" on member_exits
  for select to authenticated
  using (org_id = auth_org_id());
create policy "member_exits_write" on member_exits
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );
