-- 0041_insurance_welfare_rls.sql — RLS for the insurance & welfare tables.
-- Staff read org-scoped; claims/welfare requests are branch-workflow writable;
-- products and rules are admin-only; the ledger is system/admin managed.

alter table credit_life_policies     enable row level security;
alter table insurance_claims         enable row level security;
alter table micro_insurance_products enable row level security;
alter table micro_enrollments        enable row level security;
alter table welfare_fund_rules       enable row level security;
alter table welfare_requests         enable row level security;
alter table welfare_ledger           enable row level security;

-- ── Credit life policies: staff read; issuance via service role ─────────────
create policy "credit_life_read" on credit_life_policies
  for select to authenticated
  using (org_id = auth_org_id());
create policy "credit_life_write" on credit_life_policies
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ── Claims: staff read; workflow writes BM and above (advance) / service role ─
create policy "claims_read" on insurance_claims
  for select to authenticated
  using (org_id = auth_org_id());
create policy "claims_manage" on insurance_claims
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  );

-- ── Micro products: admin-only authoring; staff read ────────────────────────
create policy "micro_products_read" on micro_insurance_products
  for select to authenticated
  using (org_id = auth_org_id());
create policy "micro_products_admin" on micro_insurance_products
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  );

-- ── Micro enrollments: staff write (enrollment + claims intake) ─────────────
create policy "micro_enrollments_read" on micro_enrollments
  for select to authenticated
  using (org_id = auth_org_id());
create policy "micro_enrollments_write" on micro_enrollments
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  );

-- ── Fund rules: admin-only ──────────────────────────────────────────────────
create policy "welfare_rules_read" on welfare_fund_rules
  for select to authenticated
  using (org_id = auth_org_id());
create policy "welfare_rules_admin" on welfare_fund_rules
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  );

-- ── Welfare requests: staff read; requesters + approvers write ──────────────
create policy "welfare_requests_read" on welfare_requests
  for select to authenticated
  using (org_id = auth_org_id());
create policy "welfare_requests_write" on welfare_requests
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  );

-- ── Ledger: admin/accountant managed; staff read ────────────────────────────
create policy "welfare_ledger_read" on welfare_ledger
  for select to authenticated
  using (org_id = auth_org_id());
create policy "welfare_ledger_write" on welfare_ledger
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  );
