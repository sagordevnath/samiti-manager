-- 0037_work_rls.sql — RLS for the work module.
-- Staff-facing reads are org-scoped; officers additionally see tasks assigned
-- to them. Target authoring is Area-Manager-and-above; delegation writes are
-- any staff role (assigner/BM action).

-- Reuse helpers from 0002_rls.sql: auth_org_id(), auth_user_role().

-- ── Tasks ───────────────────────────────────────────────────────────────────
alter table work_tasks enable row level security;
create policy "work_tasks_read" on work_tasks
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
      or assignee_id::text = auth.uid()::text
    )
  );
create policy "work_tasks_write" on work_tasks
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );
-- Assignees may update their own tasks (status, comments) but not delete:
create policy "work_tasks_assignee_update" on work_tasks
  for update to authenticated
  using (org_id = auth_org_id() and assignee_id::text = auth.uid()::text);

-- ── Delegations ─────────────────────────────────────────────────────────────
alter table task_delegations enable row level security;
create policy "task_delegations_read" on task_delegations
  for select to authenticated
  using (org_id = auth_org_id());
create policy "task_delegations_write" on task_delegations
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

-- ── Targets: authoring is Area-Manager-and-above ────────────────────────────
alter table work_targets enable row level security;
create policy "work_targets_read" on work_targets
  for select to authenticated
  using (org_id = auth_org_id());
create policy "work_targets_author" on work_targets
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );
