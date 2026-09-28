-- 0057_security_rls.sql — RLS for the security module (completes the
-- every-table RLS coverage, req 4). Audit records: org read for admins,
-- INSERT for any authenticated role (the trigger writes them), and the
-- append-only guarantee is the trigger guard from 0056 — no update/delete
-- policy means those operations fail for non-service-role sessions.

alter table audit_records     enable row level security;
alter table unmask_log        enable row level security;
alter table security_config   enable row level security;
alter table login_attempts    enable row level security;
alter table user_devices      enable row level security;
alter table user_totp         enable row level security;
alter table member_consents   enable row level security;
alter table retention_rules   enable row level security;
alter table member_corrections enable row level security;

-- ── Audit trail: org-wide read for admins; org members read own actions ─────
create policy "audit_records_read" on audit_records
  for select to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

create policy "audit_records_insert" on audit_records
  for insert to authenticated
  with check (org_id = auth_org_id());

-- ── Unmask log: same visibility as the data it guards ───────────────────────
create policy "unmask_log_read" on unmask_log
  for select to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

create policy "unmask_log_insert" on unmask_log
  for insert to authenticated
  with check (org_id = auth_org_id());

-- ── Security config: admins manage, managers read ───────────────────────────
create policy "security_config_read" on security_config
  for select to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

create policy "security_config_manage" on security_config
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  );

-- ── Login attempts: admins read (brute-force monitoring); nobody edits ──────
create policy "login_attempts_read" on login_attempts
  for select to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  );

create policy "login_attempts_insert" on login_attempts
  for insert to authenticated
  with check (org_id = auth_org_id());

-- ── Devices: users manage their own; admins read org-wide ───────────────────
create policy "devices_own_read" on user_devices
  for select to authenticated
  using (org_id = auth_org_id() and (user_id = auth_user_id() or auth_user_role() in ('super_admin','org_admin')));

create policy "devices_own_write" on user_devices
  for all to authenticated
  using (org_id = auth_org_id() and user_id = auth_user_id())
  with check (org_id = auth_org_id() and user_id = auth_user_id());

-- ── TOTP enrollment: strictly the owner; even admins never read secrets ─────
create policy "totp_own_all" on user_totp
  for all to authenticated
  using (org_id = auth_org_id() and user_id = auth_user_id())
  with check (org_id = auth_org_id() and user_id = auth_user_id());

-- ── Consents: managers read, staff write (recorded at admission) ────────────
create policy "consents_read" on member_consents
  for select to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  );

create policy "consents_write" on member_consents
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  );

-- ── Retention rules: admins manage, managers read ───────────────────────────
create policy "retention_read" on retention_rules
  for select to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

create policy "retention_manage" on retention_rules
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ── Corrections: staff read, managers decide, officers submit ───────────────
create policy "corrections_read" on member_corrections
  for select to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  );

create policy "corrections_write" on member_corrections
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  );
