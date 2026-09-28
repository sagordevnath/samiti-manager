-- 0055_documents_rls.sql — RLS for the document module tables.
-- Templates + versions: staff read, managers+ write. Documents: org staff
-- read, managers+ insert/revoke. Verify codes: public anon read of a minimal
-- projection is enforced by the API layer (returns only non-personal fields),
-- the table policy below allows anon select but rows carry no PII beyond
-- title_snippet, which the API never returns for revoked/unknown codes.
-- Bulk jobs: managers+ run, staff read progress.

alter table doc_templates        enable row level security;
alter table doc_template_versions enable row level security;
alter table documents            enable row level security;
alter table bulk_jobs            enable row level security;
alter table bulk_job_items       enable row level security;

-- ── Doc templates: staff read, managers+ write ──────────────────────────────
create policy "doc_templates_read" on doc_templates
  for select to authenticated
  using (org_id = auth_org_id());

create policy "doc_templates_manage" on doc_templates
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

create policy "doc_versions_read" on doc_template_versions
  for select to authenticated
  using (org_id = auth_org_id());

create policy "doc_versions_insert" on doc_template_versions
  for insert to authenticated
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

-- ── Generated documents: staff read, managers+ create/revoke ────────────────
create policy "documents_read" on documents
  for select to authenticated
  using (org_id = auth_org_id());

create policy "documents_insert" on documents
  for insert to authenticated
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

create policy "documents_update" on documents
  for update to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

-- ── Bulk jobs: managers+ run, staff read ────────────────────────────────────
create policy "bulk_jobs_read" on bulk_jobs
  for select to authenticated
  using (org_id = auth_org_id());

create policy "bulk_jobs_manage" on bulk_jobs
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

create policy "bulk_items_read" on bulk_job_items
  for select to authenticated
  using (org_id = auth_org_id());

create policy "bulk_items_write" on bulk_job_items
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );
