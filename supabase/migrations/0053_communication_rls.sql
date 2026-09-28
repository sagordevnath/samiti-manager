-- 0053_communication_rls.sql — RLS for communication tables + realtime.
-- Templates/rules/spend: managers+ manage, staff read. Notifications:
-- users read/update only their own rows. Delivery log: org read for
-- managers/accountant; members never see the log. Opt-outs: staff write.

alter table message_templates enable row level security;
alter table notifications       enable row level security;
alter table message_deliveries  enable row level security;
alter table comm_opt_outs       enable row level security;
alter table comm_rules          enable row level security;
alter table comm_spend          enable row level security;

-- ── Templates: staff read, managers+ write ──────────────────────────────────
create policy "templates_read" on message_templates
  for select to authenticated
  using (org_id = auth_org_id());

create policy "templates_manage" on message_templates
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

-- ── Notifications: strictly per-recipient (notification center) ─────────────
create policy "notifications_own_read" on notifications
  for select to authenticated
  using (org_id = auth_org_id() and user_id = auth_user_id());

create policy "notifications_own_update" on notifications
  for update to authenticated
  using (org_id = auth_org_id() and user_id = auth_user_id())
  with check (org_id = auth_org_id() and user_id = auth_user_id());

-- System/staff insert (approval requests, broadcast); recipients never insert
-- into others' feeds via this policy.
create policy "notifications_insert" on notifications
  for insert to authenticated
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

-- ── Delivery log: managers/accountant read; nobody deletes ──────────────────
create policy "deliveries_read" on message_deliveries
  for select to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

create policy "deliveries_insert" on message_deliveries
  for insert to authenticated
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

-- ── Opt-outs: all staff read (guards must check), staff write ───────────────
create policy "opt_outs_read" on comm_opt_outs
  for select to authenticated
  using (org_id = auth_org_id());

create policy "opt_outs_write" on comm_opt_outs
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  );

-- ── Rules & spend: read org-wide, write admins only ─────────────────────────
create policy "rules_read" on comm_rules
  for select to authenticated
  using (org_id = auth_org_id());

create policy "rules_manage" on comm_rules
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy "spend_read" on comm_spend
  for select to authenticated
  using (org_id = auth_org_id());

create policy "spend_write" on comm_spend
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ── Realtime for the notification center (req 1) ────────────────────────────
alter publication supabase_realtime add table notifications;
