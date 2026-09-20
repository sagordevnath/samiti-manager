-- 0006_members_rls.sql — RLS for the member-management tables. Reads are
-- org-scoped for staff roles; writes are role-gated. Identity ciphertext and
-- document objects are only ever touched through the service-role API.

-- Helpers reused from 0002_rls.sql: auth_org_id(), auth_user_role(),
-- can_read_members().

create or replace function can_approve_members() returns boolean as $$
  select auth_user_role() in ('super_admin', 'org_admin', 'branch_manager');
$$ language sql stable;

alter table eligibility_rules     enable row level security;
alter table members               enable row level security; -- re-assert
alter table member_nominees       enable row level security;
alter table member_admissions     enable row level security;
alter table member_status_history enable row level security;
alter table member_transfers      enable row level security;
alter table member_notes          enable row level security;
alter table member_attendance     enable row level security;
alter table member_insurance      enable row level security;
alter table member_counters       enable row level security;
alter table member_key_versions   enable row level security;

-- ── Eligibility rules ────────────────────────────────────────────────────────
create policy rules_read_org on eligibility_rules for select using (org_id = auth_org_id());
create policy rules_write_admin on eligibility_rules for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin')
);

-- ── Members (extended profile) ───────────────────────────────────────────────
-- Reads stay covered by members_read_org (0002). Recreate the write policy
-- with an explicit with check so new lifecycle rows stay org-scoped.
drop policy if exists members_write_staff on members;
create policy members_write_staff on members for all using (
  org_id = auth_org_id()
  and auth_user_role() in ('super_admin', 'org_admin', 'area_manager', 'branch_manager', 'account_officer')
) with check (
  org_id = auth_org_id()
  and auth_user_role() in ('super_admin', 'org_admin', 'area_manager', 'branch_manager', 'account_officer')
);

-- ── Nominees ─────────────────────────────────────────────────────────────────
create policy nominees_read_org on member_nominees for select using (org_id = auth_org_id() and can_read_members());
create policy nominees_write_staff on member_nominees for all using (
  org_id = auth_org_id()
  and auth_user_role() in ('super_admin', 'org_admin', 'area_manager', 'branch_manager', 'account_officer')
);

-- ── Admissions (wizard state) ────────────────────────────────────────────────
create policy admissions_read_org on member_admissions for select using (org_id = auth_org_id() and can_read_members());
create policy admissions_write_staff on member_admissions for all using (
  org_id = auth_org_id()
  and auth_user_role() in ('super_admin', 'org_admin', 'area_manager', 'branch_manager', 'account_officer')
);
-- Stage-level authorization (manager approval, issuance) is enforced by the API.

-- ── Status history (append-only for staff) ───────────────────────────────────
create policy status_history_read_org on member_status_history for select using (org_id = auth_org_id() and can_read_members());
create policy status_history_insert_staff on member_status_history for insert with check (
  org_id = auth_org_id()
  and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer')
);

-- ── Transfers ────────────────────────────────────────────────────────────────
create policy transfers_read_org on member_transfers for select using (org_id = auth_org_id() and can_read_members());
create policy transfers_write_staff on member_transfers for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'area_manager', 'branch_manager')
);

-- ── Notes ────────────────────────────────────────────────────────────────────
create policy notes_read_org on member_notes for select using (org_id = auth_org_id() and can_read_members());
create policy notes_write_staff on member_notes for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer')
);

-- ── Attendance ───────────────────────────────────────────────────────────────
create policy attendance_read_org on member_attendance for select using (org_id = auth_org_id() and can_read_members());
create policy attendance_write_staff on member_attendance for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer')
);

-- ── Insurance ────────────────────────────────────────────────────────────────
create policy insurance_read_org on member_insurance for select using (org_id = auth_org_id());
create policy insurance_write_staff on member_insurance for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer')
);

-- ── Counters & key versions ──────────────────────────────────────────────────
-- RLS enabled with NO policies: direct client access is denied; only the
-- service-role key (used by the API) bypasses RLS.

-- ── Storage: private member-documents bucket ─────────────────────────────────
insert into storage.buckets (id, name, public)
values ('member-documents', 'member-documents', false)
on conflict (id) do nothing;

-- Path convention: org/<org_id>/member/<member_id>/<photo|signature|doc>.<ext>
create policy "member docs read" on storage.objects for select
using (
  bucket_id = 'member-documents'
  and can_read_members()
  and (storage.foldername(name))[1] = 'org'
  and (storage.foldername(name))[2] = auth_org_id()::text
);

create policy "member docs write" on storage.objects for insert
with check (
  bucket_id = 'member-documents'
  and auth_user_role() in ('super_admin', 'org_admin', 'area_manager', 'branch_manager', 'account_officer')
  and (storage.foldername(name))[1] = 'org'
  and (storage.foldername(name))[2] = auth_org_id()::text
);
