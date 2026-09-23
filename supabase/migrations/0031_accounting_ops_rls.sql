-- 0031_accounting_ops_rls.sql — RLS for the ops tables.
-- Staff read; requisition create is savings-write capable staff, decisions
-- are admin-level; budget edits are admin; period reopen is Director
-- Finance (org_admin / super_admin).

alter table fund_requisitions enable row level security;
alter table gl_budgets        enable row level security;
alter table period_closes     enable row level security;

create policy "fund_requisitions_read" on fund_requisitions
  for select using (org_id = auth_org_id());
create policy "fund_requisitions_write" on fund_requisitions
  for insert with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );
create policy "fund_requisitions_decide" on fund_requisitions
  for update using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  );

create policy "gl_budgets_read" on gl_budgets
  for select using (org_id = auth_org_id());
create policy "gl_budgets_admin" on gl_budgets
  for all using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  );

create policy "period_closes_read" on period_closes
  for select using (org_id = auth_org_id());
create policy "period_closes_close" on period_closes
  for insert with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  );
-- Reopen = delete; Director Finance only.
create policy "period_closes_reopen" on period_closes
  for delete using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  );
