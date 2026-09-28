-- 0039_work_audit_rls.sql — RLS for supervision, audit and digest tables.
-- Staff read org-scoped; submissions are officer-writable; audit plans are
-- admin/AM-writable; findings get branch response + auditor follow-up; the
-- escalation ledger and digests are system/admin managed.

-- Reuse helpers from 0002_rls.sql: auth_org_id(), auth_user_role().

-- ── Supervision submissions: any staff may submit; org-scoped read ──────────
alter table supervision_submissions enable row level security;
create policy "supervision_read" on supervision_submissions
  for select to authenticated
  using (org_id = auth_org_id());
create policy "supervision_write" on supervision_submissions
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  );

-- ── Audit plans: admin/AM author, staff read ────────────────────────────────
alter table audit_plans enable row level security;
create policy "audit_plans_read" on audit_plans
  for select to authenticated
  using (org_id = auth_org_id());
create policy "audit_plans_author" on audit_plans
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager')
  );

-- ── Findings: staff read; branch response + auditor follow-up writes ────────
alter table audit_findings enable row level security;
create policy "findings_read" on audit_findings
  for select to authenticated
  using (org_id = auth_org_id());
create policy "findings_manage" on audit_findings
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

-- ── Escalation ledger: system-written, admin/AM readable ────────────────────
alter table work_escalations enable row level security;
create policy "escalations_read" on work_escalations
  for select to authenticated
  using (org_id = auth_org_id());
create policy "escalations_write" on work_escalations
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager')
  );

-- ── Digests: org-scoped read; admin manage ──────────────────────────────────
alter table work_digests enable row level security;
create policy "digests_read" on work_digests
  for select to authenticated
  using (org_id = auth_org_id());
create policy "digests_write" on work_digests
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager')
  );
