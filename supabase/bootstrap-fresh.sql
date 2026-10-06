-- ═══════════════════════════════════════════════════════════════════════
-- bootstrap-fresh.sql — ONE-PASTE database setup for Samity Manager.
-- = reset-all + all 57 migrations (fixed chain) + demo-seed, in order.
-- ⚠️ Destroys and rebuilds the public schema. Run ONCE in SQL Editor.
-- If any statement fails, the editor rolls the whole batch back and shows
-- the exact error — nothing is left half-built.
-- ═══════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════
-- reset-all.sql — DROP every Samity Manager schema object (clean slate).
-- Paste into Supabase SQL Editor and run ONCE, then run migrations in
-- filename order, then demo-seed.sql. CASCADE keeps the order irrelevant.
-- ⚠️ Destroys all data in this project's public schema.
-- ═══════════════════════════════════════════════════════════════════════

drop view if exists v_collection_dashboard cascade;
drop view if exists loans_classified cascade;
drop materialized view if exists mv_branch_portfolio_daily cascade;
drop materialized view if exists mv_complaint_sla_daily cascade;
drop materialized view if exists mv_officer_productivity_monthly cascade;
drop materialized view if exists mv_savings_position_daily cascade;

drop type if exists admission_stage cascade;
drop type if exists branch_status cascade;
drop type if exists disbursement_mode cascade;
drop type if exists disbursement_status cascade;
drop type if exists group_status cascade;
drop type if exists id_type cascade;
drop type if exists installment_frequency cascade;
drop type if exists interest_method cascade;
drop type if exists leader_rotation_status cascade;
drop type if exists loan_application_status cascade;
drop type if exists loan_product_type cascade;
drop type if exists loan_stage cascade;
drop type if exists loan_stage_action cascade;
drop type if exists meeting_status cascade;
drop type if exists member_lifecycle cascade;
drop type if exists member_status cascade;
drop type if exists opening_stage cascade;
drop type if exists samity_formation_stage cascade;
drop type if exists samity_status cascade;
drop type if exists transfer_stage cascade;
drop type if exists user_role cascade;
drop type if exists utilization_status cascade;

drop table if exists agm_records cascade;
drop table if exists areas cascade;
drop table if exists audit_findings cascade;
drop table if exists audit_plans cascade;
drop table if exists audit_records cascade;
drop table if exists bank_reconciliations cascade;
drop table if exists bank_statement_lines cascade;
drop table if exists beneficiaries cascade;
drop table if exists branch_cash_limits cascade;
drop table if exists branch_loan_seq cascade;
drop table if exists branch_openings cascade;
drop table if exists branches cascade;
drop table if exists bulk_job_items cascade;
drop table if exists bulk_jobs cascade;
drop table if exists case_access_log cascade;
drop table if exists cases cascade;
drop table if exists cash_book_days cascade;
drop table if exists cash_book_lines cascade;
drop table if exists cash_handovers cascade;
drop table if exists collection_entries cascade;
drop table if exists collection_fraud_flags cascade;
drop table if exists collection_reversals cascade;
drop table if exists collection_rules cascade;
drop table if exists comm_opt_outs cascade;
drop table if exists comm_rules cascade;
drop table if exists comm_spend cascade;
drop table if exists complaints cascade;
drop table if exists credit_life_policies cascade;
drop table if exists delinquency_cases cascade;
drop table if exists delinquency_follow_ups cascade;
drop table if exists delinquency_root_causes cascade;
drop table if exists delinquency_runs cascade;
drop table if exists delinquency_settings cascade;
drop table if exists delinquency_tasks cascade;
drop table if exists disciplinary_cases cascade;
drop table if exists dividend_declarations cascade;
drop table if exists dividend_distributions cascade;
drop table if exists dividend_lines cascade;
drop table if exists dividend_payments cascade;
drop table if exists doc_template_versions cascade;
drop table if exists doc_templates cascade;
drop table if exists documents cascade;
drop table if exists donor_reports cascade;
drop table if exists early_warning_scans cascade;
drop table if exists early_warning_signals cascade;
drop table if exists eligibility_rules cascade;
drop table if exists event_journal_mappings cascade;
drop table if exists export_deliveries cascade;
drop table if exists export_schedules cascade;
drop table if exists field_visits cascade;
drop table if exists fund_requisitions cascade;
drop table if exists funding_repayments cascade;
drop table if exists funding_sources cascade;
drop table if exists gl_accounts cascade;
drop table if exists gl_budgets cascade;
drop table if exists gratuity_settlements cascade;
drop table if exists group_members cascade;
drop table if exists groups cascade;
drop table if exists holiday_calendar cascade;
drop table if exists hr_applicants cascade;
drop table if exists hr_attendance cascade;
drop table if exists hr_holidays cascade;
drop table if exists hr_leave_requests cascade;
drop table if exists hr_movements cascade;
drop table if exists hr_staff cascade;
drop table if exists hr_staff_education cascade;
drop table if exists hr_staff_postings cascade;
drop table if exists hr_vacancies cascade;
drop table if exists indicator_values cascade;
drop table if exists insurance_claims cascade;
drop table if exists journal_entries cascade;
drop table if exists journal_lines cascade;
drop table if exists journal_postings cascade;
drop table if exists kpi_scorecards cascade;
drop table if exists loan_application_seq cascade;
drop table if exists loan_application_steps cascade;
drop table if exists loan_applications cascade;
drop table if exists loan_approval_matrix cascade;
drop table if exists loan_classifications cascade;
drop table if exists loan_closures cascade;
drop table if exists loan_disbursements cascade;
drop table if exists loan_holidays cascade;
drop table if exists loan_installments cascade;
drop table if exists loan_legal_notices cascade;
drop table if exists loan_loss_provision_proposals cascade;
drop table if exists loan_passbook_entries cascade;
drop table if exists loan_policies cascade;
drop table if exists loan_products cascade;
drop table if exists loan_repayment_schedule cascade;
drop table if exists loan_reschedules cascade;
drop table if exists loan_savings_adjustments cascade;
drop table if exists loan_utilization_plans cascade;
drop table if exists loan_waivers cascade;
drop table if exists loan_write_off_proposals cascade;
drop table if exists loan_write_off_recoveries cascade;
drop table if exists loan_write_offs cascade;
drop table if exists loans cascade;
drop table if exists logframe_entries cascade;
drop table if exists login_attempts cascade;
drop table if exists meeting_attendance cascade;
drop table if exists meeting_reschedule_requests cascade;
drop table if exists member_admissions cascade;
drop table if exists member_attendance cascade;
drop table if exists member_consents cascade;
drop table if exists member_corrections cascade;
drop table if exists member_counters cascade;
drop table if exists member_exits cascade;
drop table if exists member_insurance cascade;
drop table if exists member_key_versions cascade;
drop table if exists member_nominees cascade;
drop table if exists member_notes cascade;
drop table if exists member_status_history cascade;
drop table if exists member_transfers cascade;
drop table if exists members cascade;
drop table if exists message_deliveries cascade;
drop table if exists message_templates cascade;
drop table if exists micro_enrollments cascade;
drop table if exists micro_insurance_products cascade;
drop table if exists mis_formula_values cascade;
drop table if exists mis_snapshots cascade;
drop table if exists month_freezes cascade;
drop table if exists notifications cascade;
drop table if exists organizations cascade;
drop table if exists payroll_lines cascade;
drop table if exists payroll_runs cascade;
drop table if exists period_closes cascade;
drop table if exists petty_cash_accounts cascade;
drop table if exists petty_cash_movements cascade;
drop table if exists pf_ledger cascade;
drop table if exists program_activities cascade;
drop table if exists program_enrollments cascade;
drop table if exists program_services cascade;
drop table if exists project_budget_lines cascade;
drop table if exists project_expenses cascade;
drop table if exists projects cascade;
drop table if exists receipt_counters cascade;
drop table if exists reconciliation_runs cascade;
drop table if exists regulatory_returns cascade;
drop table if exists report_audit_log cascade;
drop table if exists report_templates cascade;
drop table if exists retention_rules cascade;
drop table if exists salary_structures cascade;
drop table if exists samities cascade;
drop table if exists samity_leaders cascade;
drop table if exists samity_meetings cascade;
drop table if exists samity_merge_requests cascade;
drop table if exists saved_reports cascade;
drop table if exists savings_accounts cascade;
drop table if exists savings_products cascade;
drop table if exists savings_transactions cascade;
drop table if exists security_config cascade;
drop table if exists share_allotments cascade;
drop table if exists sms_outbox cascade;
drop table if exists staff_appraisals cascade;
drop table if exists staff_assignments cascade;
drop table if exists staff_productivity_monthly cascade;
drop table if exists supervision_submissions cascade;
drop table if exists task_delegations cascade;
drop table if exists training_attendance cascade;
drop table if exists training_batches cascade;
drop table if exists training_certificates cascade;
drop table if exists training_test_scores cascade;
drop table if exists unmask_log cascade;
drop table if exists user_devices cascade;
drop table if exists user_totp cascade;
drop table if exists users_profile cascade;
drop table if exists utilization_visits cascade;
drop table if exists voucher_attachments cascade;
drop table if exists voucher_lines cascade;
drop table if exists vouchers cascade;
drop table if exists welfare_fund_rules cascade;
drop table if exists welfare_ledger cascade;
drop table if exists welfare_requests cascade;
drop table if exists work_digests cascade;
drop table if exists work_escalations cascade;
drop table if exists work_targets cascade;
drop table if exists work_tasks cascade;
drop table if exists working_areas cascade;
drop table if exists zones cascade;
drop table if exists _migrations cascade;

-- ─────────── migrations/0001_core.sql ───────────
-- 0001_core.sql — extensions, core org tables, roles/permissions enums.
-- Conventions: uuid PKs, org_id/branch_id scoping, created_by, created_at,
-- updated_at, deleted_at (soft delete). Money: numeric(14,2) BDT. Dates: UTC.

create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────────
create type user_role as enum ('super_admin', 'org_admin', 'area_manager', 'branch_manager', 'account_officer', 'member');
create type member_status as enum ('active', 'inactive', 'closed');

-- ── Organizations ────────────────────────────────────────────────────────────
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_bn     text,
  code        text not null unique,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- ── Branches ─────────────────────────────────────────────────────────────────
create table branches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  name        text not null,
  name_bn     text,
  code        text not null unique,
  district    text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index branches_org_idx on branches (org_id) where deleted_at is null;

-- ── Samities (weekly savings/loan groups) ────────────────────────────────────
create table samities (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  branch_id    uuid not null references branches (id) on delete cascade,
  name         text not null,
  meeting_day  text not null default 'friday',
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index samities_branch_idx on samities (branch_id) where deleted_at is null;

-- ── User profiles (1:1 with auth.users) ──────────────────────────────────────
create table users_profile (
  id          uuid primary key references auth.users (id) on delete cascade,
  org_id      uuid references organizations (id) on delete set null,
  branch_id   uuid references branches (id) on delete set null,
  role        user_role not null default 'member',
  full_name   text not null,
  phone       text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index users_profile_org_idx on users_profile (org_id) where deleted_at is null;

-- ── Members ──────────────────────────────────────────────────────────────────
create table members (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  branch_id     uuid not null references branches (id) on delete cascade,
  samity_id     uuid references samities (id) on delete set null,
  member_code   text unique,
  full_name     text not null,
  phone         text not null,
  national_id   text,
  status        member_status not null default 'active',
  join_date     date not null default current_date,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index members_branch_idx on members (branch_id) where deleted_at is null;
create index members_org_idx on members (org_id) where deleted_at is null;

-- ── Savings accounts (money numeric(14,2) BDT) ───────────────────────────────
create table savings_accounts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  branch_id     uuid not null references branches (id) on delete cascade,
  member_id     uuid not null references members (id) on delete cascade,
  product       text not null default 'general',
  balance       numeric(14,2) not null default 0 check (balance >= 0),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index savings_member_idx on savings_accounts (member_id) where deleted_at is null;

-- ── Loans ────────────────────────────────────────────────────────────────────
create table loans (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  branch_id       uuid not null references branches (id) on delete cascade,
  member_id       uuid not null references members (id) on delete cascade,
  principal       numeric(14,2) not null check (principal > 0),
  interest_rate   numeric(5,2) not null default 0,
  installment_cnt int not null default 45,
  disbursed_at    timestamptz,
  status          text not null default 'pending',
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index loans_member_idx on loans (member_id) where deleted_at is null;

-- ── updated_at touch trigger ─────────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['organizations','branches','samities','users_profile','members','savings_accounts','loans']
  loop
    execute format('drop trigger if exists trg_touch_%1$s on %1$s', t);
    execute format('create trigger trg_touch_%1$s before update on %1$s for each row execute function touch_updated_at()', t);
  end loop;
end;
$$;

-- ─────────── migrations/0002_rls.sql ───────────
-- 0002_rls.sql — Row Level Security so Postgres enforces tenant scoping even
-- if a buggy client hits Supabase directly with the anon key.

create or replace function auth_org_id() returns uuid as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'org_id', '')::uuid;
$$ language sql stable;

create or replace function auth_user_role() returns text as $$
  select coalesce(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'role', 'member');
$$ language sql stable;

-- Helper: can the caller read members in scope?
create or replace function can_read_members() returns boolean as $$
  select auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer');
$$ language sql stable;

alter table organizations    enable row level security;
alter table branches         enable row level security;
alter table samities         enable row level security;
alter table users_profile    enable row level security;
alter table members          enable row level security;
alter table savings_accounts enable row level security;
alter table loans            enable row level security;

-- Super admin sees everything.
create policy orgs_all_super on organizations for all using (auth_org_id() is not null and auth_user_role() = 'super_admin');
create policy branches_all_super on branches for all using (auth_user_role() = 'super_admin');

-- Staff read their org's rows; org_admin manages branches.
create policy branches_read_org on branches for select using (org_id = auth_org_id());
create policy branches_write_admin on branches for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy orgs_read_own on organizations for select using (id = auth_org_id());

create policy samities_read_org on samities for select using (org_id = auth_org_id());
create policy samities_write_staff on samities for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'));

create policy profile_read_self_or_org on users_profile for select using (id = auth.uid() or org_id = auth_org_id());
create policy profile_write_admin on users_profile for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy members_read_org on members for select using (can_read_members() and org_id = auth_org_id());
create policy members_write_staff on members for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy savings_read_org on savings_accounts for select using (org_id = auth_org_id());
create policy savings_write_staff on savings_accounts for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create policy loans_read_org on loans for select using (org_id = auth_org_id());
create policy loans_write_staff on loans for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

-- ─────────── migrations/0003_org_structure.sql ───────────
-- 0003_org_structure.sql — Organization Structure module.
-- Hierarchy: Head Office → Zone → Area → Branch → Center/Samity/VO → Group.
-- Working areas are villages; a village belongs to at most one branch.

-- ── Enums ────────────────────────────────────────────────────────────────────
create type branch_status as enum ('planned', 'active', 'closed');
create type opening_stage as enum ('proposed', 'director_approved', 'checklist_done', 'activated', 'rejected');

-- ── Zones (Head Office layer) ────────────────────────────────────────────────
create table zones (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  code        text not null,
  name        text not null,
  name_bn     text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (org_id, code)
);
create index zones_org_idx on zones (org_id) where deleted_at is null;

-- ── Areas (Zone layer) ───────────────────────────────────────────────────────
create table areas (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  zone_id     uuid not null references zones (id) on delete cascade,
  code        text not null,
  name        text not null,
  name_bn     text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (org_id, code)
);
create index areas_zone_idx on areas (zone_id) where deleted_at is null;

-- ── Extend branches (0001) into full branch profiles ─────────────────────────
alter table branches
  add column if not exists area_id         uuid references areas (id) on delete set null,
  add column if not exists status          branch_status not null default 'planned',
  add column if not exists opening_date    date,
  add column if not exists address         text,
  add column if not exists gps_lat         numeric(9, 6),
  add column if not exists gps_lng         numeric(9, 6),
  add column if not exists manager_user_id uuid references auth.users (id) on delete set null;

create index if not exists branches_area_idx on branches (area_id) where deleted_at is null;

-- ── Working areas: villages with Bangladesh geo hierarchy + survey data ──────
create table working_areas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  division        text not null,
  district        text not null,
  upazila         text not null,
  "union"         text,
  village         text not null,
  division_bn     text,
  district_bn     text,
  upazila_bn      text,
  union_bn        text,
  village_bn      text,
  population      int check (population >= 0),
  households      int check (households >= 0),
  market_days     text,
  competitor_mfis int not null default 0 check (competitor_mfis >= 0),
  potential_score int not null default 3 check (potential_score between 1 and 5),
  gps_lat         numeric(9, 6),
  gps_lng         numeric(9, 6),
  -- A village belongs to at most one branch; null = surveyed but unassigned.
  branch_id       uuid references branches (id) on delete set null,
  surveyed_at     timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- Village identity: one row per geo path per org (the one-branch-per-village
-- rule is structural — assignment moves branch_id, it never duplicates rows).
create unique index working_areas_geo_uidx on working_areas (
  org_id, division, district, upazila, coalesce("union", ''), village
) where deleted_at is null;

create index working_areas_branch_idx on working_areas (branch_id) where deleted_at is null and branch_id is not null;
create index working_areas_org_idx on working_areas (org_id) where deleted_at is null;

-- ── Branch opening workflow (proposal → approval → checklist → activation) ───
create table branch_openings (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  branch_id       uuid not null references branches (id) on delete cascade,
  stage           opening_stage not null default 'proposed',
  proposal_note   text not null,
  proposed_by     uuid references auth.users (id) on delete set null,
  proposed_at     timestamptz not null default now(),
  director_by     uuid references auth.users (id) on delete set null,
  director_at     timestamptz,
  director_note   text,
  checklist       jsonb not null default '[]'::jsonb,
  checklist_by    uuid references auth.users (id) on delete set null,
  checklist_at    timestamptz,
  activated_by    uuid references auth.users (id) on delete set null,
  activated_at    timestamptz,
  rejected_note   text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- One live opening per branch.
create unique index branch_openings_live_uidx on branch_openings (branch_id)
  where deleted_at is null and stage in ('proposed', 'director_approved', 'checklist_done');

-- ── Staff-to-branch assignments with transfer history ────────────────────────
create extension if not exists btree_gist;

create table staff_assignments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  branch_id       uuid not null references branches (id) on delete cascade,
  role_at_branch  user_role not null default 'branch_manager',
  effective_from  date not null,
  effective_to    date,
  note            text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index staff_assignments_user_idx on staff_assignments (user_id) where deleted_at is null;
create index staff_assignments_branch_idx on staff_assignments (branch_id) where deleted_at is null;

-- A staff member cannot hold two overlapping assignments.
alter table staff_assignments add constraint staff_no_overlap exclude using gist (
  user_id with =,
  daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[)') with &&
) where (deleted_at is null);

-- ── Business rule: closing a branch requires zero active centers ─────────────
create or replace function prevent_branch_close_with_centers() returns trigger as $$
begin
  if new.status = 'closed' and (old.status is distinct from 'closed') then
    if exists (
      select 1 from samities s
      where s.branch_id = new.id and s.deleted_at is null
    ) then
      raise exception 'BRANCH_HAS_ACTIVE_CENTERS: transfer all centers before closing branch %', new.code;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_branch_close_guard on branches;
create trigger trg_branch_close_guard
  before update of status on branches
  for each row execute function prevent_branch_close_with_centers();

-- ── updated_at triggers for the new tables ───────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['zones','areas','working_areas','branch_openings','staff_assignments']
  loop
    execute format('drop trigger if exists trg_touch_%1$s on %1$s', t);
    execute format('create trigger trg_touch_%1$s before update on %1$s for each row execute function touch_updated_at()', t);
  end loop;
end;
$$;

-- ─────────── migrations/0004_org_rls.sql ───────────
-- 0004_org_rls.sql — RLS for the Organization Structure module.

create or replace function can_manage_branches() returns boolean as $$
  select auth_user_role() in ('super_admin', 'org_admin', 'area_manager');
$$ language sql stable;

alter table zones             enable row level security;
alter table areas             enable row level security;
alter table working_areas     enable row level security;
alter table branch_openings   enable row level security;
alter table staff_assignments enable row level security;

-- ── Zones / Areas ────────────────────────────────────────────────────────────
create policy zones_read_org on zones for select using (org_id = auth_org_id());
create policy zones_write_admin on zones for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin'));

create policy areas_read_org on areas for select using (org_id = auth_org_id());
create policy areas_write_admin on areas for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin'));

-- ── Branches (extends 0002 policies with area-manager writes + close guard) ──
create policy branches_write_area on branches for update using (org_id = auth_org_id() and can_manage_branches());

-- ── Working areas ────────────────────────────────────────────────────────────
create policy working_areas_read_org on working_areas for select using (org_id = auth_org_id());
create policy working_areas_write_staff on working_areas for all using (
  org_id = auth_org_id() and can_manage_branches()
);

-- ── Branch openings ──────────────────────────────────────────────────────────
create policy openings_read_org on branch_openings for select using (org_id = auth_org_id());
create policy openings_insert_area on branch_openings for insert with check (
  org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'area_manager')
);
create policy openings_update_admin on branch_openings for update using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin')
);

-- ── Staff assignments ────────────────────────────────────────────────────────
create policy staff_read_org on staff_assignments for select using (org_id = auth_org_id());
create policy staff_write_admin on staff_assignments for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin')
);

-- ─────────── migrations/0005_members_module.sql ───────────
-- 0005_members_module.sql — member management: admissions wizard, encrypted
-- identity, documents, status lifecycle, transfers, eligibility rules, notes,
-- attendance, insurance. Extends the members table from 0001_core.sql.

-- ── Enums ────────────────────────────────────────────────────────────────────
create type member_lifecycle as enum ('pending', 'active', 'dormant', 'dropout', 'transferred', 'deceased');
create type admission_stage as enum (
  'field_survey', 'eligibility_screening', 'household_verification',
  'manager_approval', 'orientation_completed', 'member_issued', 'passbook_generated'
);
create type id_type as enum ('nid', 'birth_registration');
create type transfer_stage as enum ('proposed', 'approved', 'rejected', 'completed');

-- ── Org-configurable eligibility rules (one row per org) ─────────────────────
create table eligibility_rules (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null unique references organizations (id) on delete cascade,
  min_age                  int  not null default 18 check (min_age between 12 and 70),
  max_age                  int  not null default 60 check (max_age between 18 and 100),
  max_land_decimals        numeric(10,2) not null default 50,
  one_member_per_household boolean not null default true,
  max_monthly_income       numeric(14,2) not null default 0, -- 0 = no limit
  women_only               boolean not null default false,
  created_by               uuid references auth.users (id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz
);

-- ── Members: extended profile columns ────────────────────────────────────────
alter table members
  add column if not exists lifecycle          member_lifecycle not null default 'pending',
  add column if not exists full_name_bn       text,
  add column if not exists father_or_husband_name text,
  add column if not exists mother_name        text,
  add column if not exists id_type            id_type default 'nid',
  -- AES-256-GCM ciphertext (base64). Never selectable by clients.
  add column if not exists id_number_enc      text,
  -- HMAC-SHA256 (base64) of the raw id for exact-match duplicate search.
  add column if not exists id_number_hash     text,
  add column if not exists dob                date,
  add column if not exists address            text,
  add column if not exists working_area_id    uuid references working_areas (id) on delete set null,
  add column if not exists occupation         text,
  add column if not exists monthly_household_income numeric(14,2),
  add column if not exists land_owned_decimals numeric(10,2),
  add column if not exists family_members     int,
  add column if not exists photo_path         text,
  add column if not exists signature_path     text, -- signature or thumbprint
  add column if not exists passbook_no        text unique,
  add column if not exists status_reason_code text,
  add column if not exists status_changed_at  timestamptz,
  add column if not exists status_note        text;

-- Old status enum (active/inactive/closed) stays for 0001-era consumers;
-- lifecycle is authoritative going forward.

-- ── Nominees (shares must total 100 per member) ──────────────────────────────
create table member_nominees (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  member_id   uuid not null references members (id) on delete cascade,
  name        text not null,
  relation    text not null,
  share_pct   int not null check (share_pct between 1 and 100),
  phone       text,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index member_nominees_member_idx on member_nominees (member_id) where deleted_at is null;

-- Enforce shares sum to 100 at write time.
create or replace function check_nominee_shares() returns trigger as $$
declare total int;
begin
  select coalesce(sum(share_pct), 0) into total
  from member_nominees
  where member_id = new.member_id and deleted_at is null;
  if total > 100 then
    raise exception 'nominee shares exceed 100%% (now %)', total;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_nominee_shares
  after insert or update on member_nominees
  for each row execute function check_nominee_shares();

-- ── Admission wizard state (one live admission per draft) ────────────────────
create table member_admissions (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  branch_id      uuid not null references branches (id) on delete cascade,
  draft          jsonb not null default '{}'::jsonb,
  stage          admission_stage not null default 'field_survey',
  stage_history  jsonb not null default '[]'::jsonb,
  member_number  text unique,
  passbook_no    text unique,
  -- Set once the final stage completes; links to the created member row.
  member_id      uuid references members (id) on delete set null,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index member_admissions_org_idx on member_admissions (org_id) where deleted_at is null;
create index member_admissions_stage_idx on member_admissions (org_id, stage) where deleted_at is null;

-- ── Member status history (lifecycle audit) ──────────────────────────────────
create table member_status_history (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  member_id   uuid not null references members (id) on delete cascade,
  status      member_lifecycle not null,
  reason_code text not null,
  note        text,
  changed_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index member_status_history_member_idx on member_status_history (member_id);

-- ── Center-to-branch transfers with approval ─────────────────────────────────
create table member_transfers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  member_id    uuid not null references members (id) on delete cascade,
  from_branch_id uuid not null references branches (id) on delete cascade,
  to_branch_id   uuid not null references branches (id) on delete cascade,
  to_samity_name text,
  reason       text not null,
  stage        transfer_stage not null default 'proposed',
  proposed_by  uuid references auth.users (id) on delete set null,
  proposed_at  timestamptz not null default now(),
  decided_by   uuid references auth.users (id) on delete set null,
  decided_at   timestamptz,
  decision_note text,
  completed_at timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index member_transfers_member_idx on member_transfers (member_id);
create index member_transfers_org_stage_idx on member_transfers (org_id, stage) where deleted_at is null;

-- One open transfer per member.
create unique index member_transfers_open_uidx
  on member_transfers (member_id)
  where deleted_at is null and stage in ('proposed', 'approved');

-- ── Notes (Member 360) ───────────────────────────────────────────────────────
create table member_notes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  member_id   uuid not null references members (id) on delete cascade,
  note        text not null,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index member_notes_member_idx on member_notes (member_id) where deleted_at is null;

-- ── Attendance (weekly samity meetings) ──────────────────────────────────────
create table member_attendance (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  member_id    uuid not null references members (id) on delete cascade,
  samity_name  text,
  meeting_date date not null,
  present      boolean not null default true,
  recorded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (member_id, meeting_date)
);

-- ── Insurance policies ───────────────────────────────────────────────────────
create table member_insurance (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  branch_id   uuid not null references branches (id) on delete cascade,
  member_id   uuid not null references members (id) on delete cascade,
  product     text not null default 'life',
  premium     numeric(14,2) not null default 0,
  coverage    numeric(14,2) not null default 0,
  status      text not null default 'active',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index member_insurance_member_idx on member_insurance (member_id) where deleted_at is null;

-- ── Encryption keys (per-org DEK wrapped; dev fallback uses env master key) ──
-- For the free-tier reference implementation the API derives a per-org key
-- with HKDF from a master secret; production should move to pgsodium/Vault.
create table member_key_versions (
  org_id     uuid primary key references organizations (id) on delete cascade,
  key_version int not null default 1,
  rotated_at timestamptz not null default now()
);

-- ── Duplicate-detection support indexes ──────────────────────────────────────
create index members_id_hash_idx on members (org_id, id_number_hash) where deleted_at is null;
create index members_mobile_idx on members (org_id, phone) where deleted_at is null;
create index members_name_lower_idx on members (org_id, lower(full_name)) where deleted_at is null;
create index members_lifecycle_idx on members (org_id, lifecycle) where deleted_at is null;

-- ── updated_at triggers for new tables ───────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['eligibility_rules','member_nominees','member_admissions','member_transfers','member_insurance']
  loop
    execute format('drop trigger if exists trg_touch_%1$s on %1$s', t);
    execute format('create trigger trg_touch_%1$s before update on %1$s for each row execute function touch_updated_at()', t);
  end loop;
end;
$$;

-- ── Member number & passbook issuance helper ─────────────────────────────────
-- Format: <BRANCHCODE>-<YY>-<seq>, e.g. DHK01-26-00042. Issued atomically.
create or replace function issue_member_number(p_branch_id uuid, p_org_id uuid)
returns table (member_number text, passbook_no text) as $$
declare
  b_code text;
  seq bigint;
  yy text;
begin
  select code into b_code from branches where id = p_branch_id and org_id = p_org_id;
  if b_code is null then
    raise exception 'branch % not found in org %', p_branch_id, p_org_id;
  end if;
  yy = to_char(now() at time zone 'Asia/Dhaka', 'YY');

  with ins as (
    insert into member_counters (branch_id, year, last_seq)
    values (p_branch_id, yy::int, 1)
    on conflict (branch_id, year) do update set last_seq = member_counters.last_seq + 1
    returning last_seq
  )
  select last_seq into seq from ins;

  return query select
    format('%s-%s-%s', replace(b_code, '-', ''), yy, lpad(seq::text, 5, '0')),
    format('PB-%s-%s-%s', replace(b_code, '-', ''), yy, lpad(seq::text, 5, '0'));
end;
$$ language plpgsql;

-- Counter table used by the function.
create table member_counters (
  branch_id uuid not null references branches (id) on delete cascade,
  year      int  not null,
  last_seq  bigint not null default 0,
  primary key (branch_id, year)
);

-- ─────────── migrations/0006_members_rls.sql ───────────
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
-- Re-run guard: storage.objects is a Supabase system table (never dropped by
-- the reset block), so its policies must be removed explicitly first.
drop policy if exists "member docs read" on storage.objects;
drop policy if exists "member docs write" on storage.objects;

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

-- ─────────── migrations/0007_samity_group_module.sql ───────────
-- 0007_samity_group_module.sql
-- Samity / center / group workflow with meeting scheduling, attendance, leader rotation and approvals.

create type samity_status as enum ('forming', 'active', 'paused', 'closed', 'merged', 'split');
create type group_status as enum ('forming', 'active', 'paused', 'closed');
create type samity_formation_stage as enum ('projection_recorded', 'group_formed', 'observation_period', 'active');
create type meeting_status as enum ('scheduled', 'in_progress', 'closed', 'cancelled', 'rescheduled');
create type leader_rotation_status as enum ('active', 'review');

create table if not exists samities (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  branch_id         uuid not null references branches (id) on delete cascade,
  code              text not null,
  name              text not null,
  village           text not null,
  meeting_day       text not null default 'friday',
  meeting_time      time not null default '17:30:00',
  meeting_place     text not null,
  field_officer_id  uuid references auth.users (id) on delete set null,
  status            samity_status not null default 'forming',
  formation_stage   samity_formation_stage not null default 'projection_recorded',
  projection_note   text,
  projected_at      timestamptz,
  observed_at       timestamptz,
  activated_at      timestamptz,
  archived_at       timestamptz,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (org_id, branch_id, code)
);

-- 0001_core already creates a minimal `samities` table; for projects where
-- that earlier table exists, add the columns this module owns instead of
-- failing on the re-creation above.
alter table samities
  add column if not exists code             text,
  add column if not exists village          text not null default '',
  add column if not exists meeting_time     time not null default '17:30:00',
  add column if not exists meeting_place    text not null default '',
  add column if not exists field_officer_id uuid references auth.users (id) on delete set null,
  add column if not exists status           samity_status not null default 'forming',
  add column if not exists formation_stage  samity_formation_stage not null default 'projection_recorded',
  add column if not exists projection_note  text,
  add column if not exists projected_at     timestamptz,
  add column if not exists observed_at      timestamptz,
  add column if not exists activated_at     timestamptz,
  add column if not exists archived_at      timestamptz;

-- The inline unique constraint only applies on fresh creation; mirror it as an
-- index so pre-0007 tables get it too.
create unique index if not exists samities_org_branch_code_idx on samities (org_id, branch_id, code);

create index if not exists samities_org_idx on samities (org_id) where deleted_at is null;
create index samities_field_officer_idx on samities (field_officer_id) where deleted_at is null;

create table groups (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations (id) on delete cascade,
  samity_id        uuid not null references samities (id) on delete cascade,
  name             text not null,
  status           group_status not null default 'forming',
  member_count     int not null default 0,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (samity_id, name)
);

create table group_members (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  group_id          uuid not null references groups (id) on delete cascade,
  member_id         uuid not null references members (id) on delete cascade,
  joined_at         date not null default current_date,
  status            text not null default 'active' check (status in ('active', 'left', 'transferred')),
  is_leader         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (group_id, member_id)
);

create table samity_leaders (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations (id) on delete cascade,
  samity_id        uuid not null references samities (id) on delete cascade,
  chief_name       text not null,
  deputy_name      text not null,
  secretary_name   text not null,
  rotation_start   date not null,
  rotation_end     date not null,
  status           leader_rotation_status not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create table samity_meetings (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  samity_id         uuid not null references samities (id) on delete cascade,
  meeting_date      date not null,
  start_time        time not null,
  end_time          time not null,
  status            meeting_status not null default 'scheduled',
  gps_lat           numeric(9, 6),
  gps_lng           numeric(9, 6),
  attendance_total  int not null default 0,
  cash_total        numeric(14,2) not null default 0,
  notes             text,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create table meeting_attendance (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations (id) on delete cascade,
  meeting_id          uuid not null references samity_meetings (id) on delete cascade,
  member_id           uuid not null references members (id) on delete cascade,
  present             boolean not null default false,
  savings_amount      numeric(14,2) not null default 0,
  installment_amount  numeric(14,2) not null default 0,
  checkin_at          timestamptz,
  checkin_lat         numeric(9, 6),
  checkin_lng         numeric(9, 6),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  unique (meeting_id, member_id)
);

create table holiday_calendar (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  date          date not null,
  reason        text not null,
  is_closed     boolean not null default true,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (org_id, date)
);

create table meeting_reschedule_requests (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations (id) on delete cascade,
  meeting_id        uuid not null references samity_meetings (id) on delete cascade,
  requested_date    date not null,
  reason            text not null,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by      uuid references auth.users (id) on delete set null,
  reviewed_by       uuid references auth.users (id) on delete set null,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create table samity_merge_requests (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations (id) on delete cascade,
  source_samity_id    uuid not null references samities (id) on delete cascade,
  target_samity_id    uuid references samities (id) on delete set null,
  reason              text not null,
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  approved_by         uuid references auth.users (id) on delete set null,
  approved_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['samities','groups','group_members','samity_leaders','samity_meetings','meeting_attendance','holiday_calendar','meeting_reschedule_requests','samity_merge_requests']
  loop
    execute format('drop trigger if exists trg_touch_%1$s on %1$s', t);
    execute format('create trigger trg_touch_%1$s before update on %1$s for each row execute function touch_updated_at()', t);
  end loop;
end;
$$;

create index if not exists groups_samity_idx on groups (samity_id) where deleted_at is null;
create index if not exists group_members_member_idx on group_members (member_id) where deleted_at is null;
create index if not exists samity_meetings_date_idx on samity_meetings (meeting_date) where deleted_at is null;
create index if not exists meeting_attendance_member_idx on meeting_attendance (member_id) where deleted_at is null;

-- ─────────── migrations/0008_samity_group_rls.sql ───────────
-- 0008_samity_group_rls.sql
-- Row level security for samity, group, meeting attendance and leader history tables.

alter table samities enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table samity_leaders enable row level security;
alter table samity_meetings enable row level security;
alter table meeting_attendance enable row level security;
alter table holiday_calendar enable row level security;
alter table meeting_reschedule_requests enable row level security;
alter table samity_merge_requests enable row level security;

-- 0002_rls already creates these two policies on samities; replace them so
-- the wider staff set below takes effect.
drop policy if exists samities_read_org on samities;
drop policy if exists samities_write_staff on samities;

create policy samities_read_org on samities for select using (org_id = auth_org_id());
create policy samities_write_staff on samities for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
);

create policy groups_read_org on groups for select using (org_id = auth_org_id());
create policy groups_write_staff on groups for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
);

create policy group_members_read_org on group_members for select using (org_id = auth_org_id());
create policy group_members_write_staff on group_members for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
);

create policy leaders_read_org on samity_leaders for select using (org_id = auth_org_id());
create policy leaders_write_staff on samity_leaders for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
);

create policy meeting_read_org on samity_meetings for select using (org_id = auth_org_id());
create policy meeting_write_staff on samity_meetings for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
);

create policy attendance_read_org on meeting_attendance for select using (org_id = auth_org_id());
create policy attendance_write_staff on meeting_attendance for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
);

create policy holiday_read_org on holiday_calendar for select using (org_id = auth_org_id());
create policy holiday_write_staff on holiday_calendar for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
);

create policy reschedule_read_org on meeting_reschedule_requests for select using (org_id = auth_org_id());
create policy reschedule_write_staff on meeting_reschedule_requests for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
);

create policy merge_read_org on samity_merge_requests for select using (org_id = auth_org_id());
create policy merge_write_staff on samity_merge_requests for all using (
  org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
);

-- ─────────── migrations/0009_savings_module.sql ───────────
-- 0009_savings_module.sql — savings product setup and member accounts.

create table savings_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  code text not null,
  name text not null,
  name_bn text,
  product_type text not null check (product_type in ('compulsory', 'voluntary', 'dps', 'fixed', 'share')),
  interest_rate numeric(5,2) not null default 0 check (interest_rate between 0 and 100),
  compounding text not null default 'none' check (compounding in ('none', 'simple', 'quarterly', 'monthly', 'yearly')),
  min_balance numeric(14,2) not null default 0 check (min_balance >= 0),
  max_deposit numeric(14,2) check (max_deposit is null or max_deposit >= 0),
  withdrawal_limit numeric(14,2) not null default 0 check (withdrawal_limit >= 0),
  withdrawal_limit_period text not null default 'per_tx' check (withdrawal_limit_period in ('per_tx', 'daily', 'monthly')),
  withdrawal_rules text,
  lock_while_loan_active boolean not null default false,
  maturity_months integer not null default 0 check (maturity_months between 0 and 600),
  early_withdrawal_penalty_rate numeric(5,2) not null default 0 check (early_withdrawal_penalty_rate between 0 and 100),
  auto_link_loan boolean not null default false,
  auto_link_weekly_amount numeric(14,2) not null default 0 check (auto_link_weekly_amount >= 0),
  requires_manager_approval_above numeric(14,2) not null default 0 check (requires_manager_approval_above >= 0),
  dormant_after_months integer not null default 6 check (dormant_after_months between 0 and 120),
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index savings_products_org_code_idx on savings_products (org_id, lower(code)) where deleted_at is null;

alter table savings_accounts
  add column if not exists product_id uuid references savings_products (id) on delete restrict,
  add column if not exists account_number text,
  add column if not exists opening_date date not null default current_date,
  add column if not exists status text not null default 'active' check (status in ('active', 'dormant', 'frozen', 'closed')),
  add column if not exists nominee_id uuid references members (id) on delete set null,
  add column if not exists maturity_date date,
  add column if not exists closed_at timestamptz;

update savings_accounts
set account_number = 'SA-' || upper(substr(replace(id::text, '-', ''), 1, 12))
where account_number is null;

alter table savings_accounts alter column account_number set not null;
create unique index savings_accounts_number_idx on savings_accounts (account_number) where deleted_at is null;
create unique index savings_accounts_member_product_idx on savings_accounts (member_id, product_id)
  where deleted_at is null and product_id is not null;
create index savings_products_org_idx on savings_products (org_id) where deleted_at is null;

drop trigger if exists trg_touch_savings_products on savings_products;
create trigger trg_touch_savings_products before update on savings_products
for each row execute function touch_updated_at();

alter table savings_products enable row level security;
create policy savings_products_read_org on savings_products for select using (org_id = auth_org_id());
create policy savings_products_write_staff on savings_products for all
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

-- ─────────── migrations/0010_savings_transactions.sql ───────────
-- 0010_savings_transactions.sql — immutable savings ledger and interest support.

create table savings_transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  account_id uuid not null references savings_accounts (id) on delete restrict,
  to_account_id uuid references savings_accounts (id) on delete restrict,
  transaction_type text not null check (transaction_type in ('deposit', 'withdrawal', 'interest', 'transfer', 'adjustment', 'closure')),
  amount numeric(14,2) not null check (amount > 0),
  balance_after numeric(14,2) not null check (balance_after >= 0),
  reference text,
  note text,
  reversal_of uuid references savings_transactions (id) on delete restrict,
  reversal_reason text,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  interest_period text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index savings_transactions_account_idx on savings_transactions (account_id, created_at desc);
create unique index savings_interest_period_idx on savings_transactions (account_id, interest_period)
  where transaction_type = 'interest' and interest_period is not null;
create unique index savings_weekly_auto_link_idx on savings_transactions (account_id, reference)
  where reference like 'Compulsory weekly %';

create or replace function reject_savings_transaction_mutation() returns trigger as $$
begin
  raise exception 'Savings transactions are immutable; post a reversal entry instead';
end;
$$ language plpgsql;

create trigger savings_transactions_no_update before update or delete on savings_transactions
for each row execute function reject_savings_transaction_mutation();

create or replace function post_savings_transaction(
  p_account_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_created_by uuid,
  p_reference text default null,
  p_note text default null,
  p_to_account_id uuid default null,
  p_reversal_of uuid default null,
  p_reversal_reason text default null,
  p_approved_by uuid default null,
  p_interest_period text default null
) returns savings_transactions as $$
declare
  v_account savings_accounts;
  v_product savings_products;
  v_delta numeric(14,2);
  v_balance numeric(14,2);
  v_tx savings_transactions;
  v_original savings_transactions;
begin
  if p_amount <= 0 then raise exception 'Transaction amount must be positive'; end if;
  if p_transaction_type = 'transfer' and p_to_account_id is null then raise exception 'Transfer destination is required'; end if;
  select * into v_account from savings_accounts where id = p_account_id and deleted_at is null for update;
  if not found then raise exception 'Savings account not found'; end if;
  select * into v_product from savings_products where id = v_account.product_id and deleted_at is null;
  if not found then raise exception 'Savings product not found'; end if;
  if v_account.status = 'closed' then raise exception 'Savings account is closed'; end if;
  if p_transaction_type = 'transfer' and not exists (
    select 1 from savings_accounts where id = p_to_account_id and org_id = v_account.org_id and deleted_at is null and status <> 'closed'
  ) then
    raise exception 'Transfer destination account not found';
  end if;

  if p_reversal_of is not null then
    select * into v_original from savings_transactions where id = p_reversal_of and account_id = p_account_id;
    if not found or v_original.reversal_of is not null then raise exception 'Only original transactions can be reversed'; end if;
    if p_reversal_reason is null or length(trim(p_reversal_reason)) = 0 or p_approved_by is null then
      raise exception 'Reversal reason and approval are required';
    end if;
    v_delta := case when v_original.transaction_type in ('withdrawal','adjustment','closure') then v_original.amount else -v_original.amount end;
  elsif p_transaction_type in ('withdrawal', 'adjustment', 'closure', 'transfer') then
    v_delta := -p_amount;
  else
    v_delta := p_amount;
  end if;

  if p_transaction_type in ('withdrawal', 'adjustment', 'closure') and v_product.lock_while_loan_active
     and exists (select 1 from loans where member_id = v_account.member_id and status in ('active','disbursed','ongoing') and deleted_at is null) then
    raise exception 'Savings are locked while a loan is active';
  end if;
  v_balance := v_account.balance + v_delta;
  if v_balance < v_product.min_balance then raise exception 'Minimum balance would be breached'; end if;
  if v_balance < 0 then raise exception 'Insufficient savings balance'; end if;
  if p_transaction_type = 'interest' and p_interest_period is null then raise exception 'Interest period is required'; end if;

  insert into savings_transactions (
    org_id, account_id, to_account_id, transaction_type, amount, balance_after, reference, note,
    reversal_of, reversal_reason, approved_by, approved_at, interest_period, created_by
  ) values (
    v_account.org_id, p_account_id, p_to_account_id, p_transaction_type, p_amount, v_balance, p_reference, p_note,
    p_reversal_of, p_reversal_reason, p_approved_by, case when p_approved_by is null then null else now() end,
    p_interest_period, p_created_by
  ) returning * into v_tx;

  update savings_accounts
  set balance = v_balance,
      status = case when p_transaction_type = 'closure' then 'closed' when status = 'dormant' then 'active' else status end,
      closed_at = case when p_transaction_type = 'closure' then now() else closed_at end
  where id = p_account_id;
  if p_transaction_type = 'transfer' then
    update savings_accounts set balance = balance + p_amount where id = p_to_account_id and deleted_at is null;
  end if;
  return v_tx;
end;
$$ language plpgsql security definer set search_path = public;

alter table savings_transactions enable row level security;
create policy savings_transactions_read_org on savings_transactions for select using (org_id = auth_org_id());
create policy savings_transactions_write_staff on savings_transactions for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create or replace function mark_dormant_savings_accounts() returns void as $$
begin
  update savings_accounts sa
  set status = 'dormant'
  from savings_products sp
  where sa.product_id = sp.id
    and sa.status = 'active'
    and sa.deleted_at is null
    and sp.dormant_after_months > 0
    and sa.updated_at < now() - make_interval(months => sp.dormant_after_months);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function auto_link_compulsory_savings_to_loan() returns trigger as $$
declare
  v_account savings_accounts;
begin
  if new.status in ('disbursed', 'active', 'ongoing')
     and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    for v_account in
      select sa.* from savings_accounts sa
      join savings_products sp on sp.id = sa.product_id
      where sa.member_id = new.member_id and sa.deleted_at is null
        and sa.status in ('active', 'dormant')
        and sp.product_type = 'compulsory' and sp.auto_link_loan
    loop
      perform post_savings_transaction(
        v_account.id, 'deposit', new.principal, null,
        'Loan auto-link ' || new.id, 'Compulsory savings linked to loan amount'
      );
    end loop;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists loans_auto_link_compulsory_savings on loans;
create trigger loans_auto_link_compulsory_savings after insert or update of status on loans
for each row execute function auto_link_compulsory_savings_to_loan();

-- ─────────── migrations/0011_shares_dividends_integrity.sql ───────────
-- 0011_shares_dividends_integrity.sql — cooperative share capital, dividends,
-- and balance integrity (ledger-vs-balance reconciliation).

-- ── Share capital ────────────────────────────────────────────────────────────
-- Face value per share is a numeric(14,2) BDT amount. Allotments are an
-- append-only ledger (correct via reversals, like savings_transactions).

create table share_allotments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  member_id uuid not null references members (id) on delete restrict,
  product_id uuid not null references savings_products (id) on delete restrict,
  shares integer not null check (shares > 0),
  face_value numeric(14,2) not null check (face_value > 0),
  paid_amount numeric(14,2) not null check (paid_amount >= 0),
  paid_shares integer not null default 0 check (paid_shares >= 0 and paid_shares <= shares),
  reference text,
  reversal_of uuid references share_allotments (id) on delete restrict,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index share_allotments_org_idx on share_allotments (org_id, created_at desc);
create index share_allotments_member_idx on share_allotments (member_id);
create index share_allotments_reversal_idx on share_allotments (reversal_of) where reversal_of is not null;

-- Paid-up shares cannot exceed allotted shares per member/product.
create or replace function enforce_paid_share_cap() returns trigger as $$
declare
  v_allotted integer;
  v_paid integer;
begin
  if new.reversal_of is not null then return new; end if;
  select coalesce(sum(shares), 0) + new.shares into v_allotted
  from share_allotments
  where member_id = new.member_id and product_id = new.product_id;
  select coalesce(sum(paid_shares), 0) + new.paid_shares into v_paid
  from share_allotments
  where member_id = new.member_id and product_id = new.product_id;
  if v_paid > v_allotted then
    raise exception 'Paid shares (%) cannot exceed allotted shares (%)', v_paid, v_allotted;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger share_allotments_paid_cap before insert on share_allotments
for each row execute function enforce_paid_share_cap();

-- ── Dividends ────────────────────────────────────────────────────────────────
create table dividend_declarations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  product_id uuid not null references savings_products (id) on delete restrict,
  financial_year text not null,
  surplus numeric(14,2) not null check (surplus >= 0),
  payout_rate numeric(5,2) not null check (payout_rate between 0 and 100),
  dividend_pool numeric(14,2) not null check (dividend_pool >= 0),
  retained numeric(14,2) not null check (retained >= 0),
  approved_by_meeting_ref text not null,
  approved_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, product_id, financial_year)
);

-- One declaration per org/product/year; pool must equal surplus * payout_rate.
create or replace function enforce_dividend_pool_math() returns trigger as $$
begin
  if round(new.surplus * new.payout_rate / 100, 2) <> new.dividend_pool then
    raise exception 'dividend_pool must equal surplus * payout_rate / 100';
  end if;
  if round(new.surplus - new.dividend_pool, 2) <> new.retained then
    raise exception 'retained must equal surplus - dividend_pool';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger dividend_declarations_math before insert or update on dividend_declarations
for each row execute function enforce_dividend_pool_math();

-- Immutable after the general meeting approval record.
create or replace function reject_dividend_mutation() returns trigger as $$
begin
  if old.status = 'approved' then
    raise exception 'Approved dividends are immutable';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger dividend_declarations_lock before update or delete on dividend_declarations
for each row execute function reject_dividend_mutation();

create table dividend_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  declaration_id uuid not null references dividend_declarations (id) on delete cascade,
  member_id uuid not null references members (id) on delete restrict,
  paid_shares integer not null check (paid_shares > 0),
  face_value numeric(14,2) not null check (face_value > 0),
  amount numeric(14,2) not null check (amount >= 0),
  paid_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (declaration_id, member_id)
);

create index dividend_payments_decl_idx on dividend_payments (declaration_id);

-- ── Balance integrity / reconciliation ───────────────────────────────────────
-- Accounts hold a materialized balance; savings_transactions are the source of
-- truth. The API post path (post_savings_transaction) maintains balance_after
-- per entry, so stored = ledger when the data is consistent.

create or replace function recompute_balance(p_account_id uuid) returns numeric(14,2) as $$
  select coalesce(sum(
    case
      when transaction_type in ('deposit', 'interest') then amount
      when transaction_type = 'transfer' then
        case when account_id = p_account_id then -amount else amount end
      else -amount
    end
  ), 0)::numeric(14,2)
  from savings_transactions
  where (account_id = p_account_id or to_account_id = p_account_id)
    and not exists (
      select 1 from savings_transactions r
      where r.reversal_of = savings_transactions.id
    )
  ;
$$ language sql stable;

create or replace function run_reconciliation(p_org_id uuid) returns table (
  account_id uuid,
  account_number text,
  stored_balance numeric(14,2),
  ledger_balance numeric(14,2),
  difference numeric(14,2),
  entry_count bigint,
  last_entry_at timestamptz,
  status text
) as $$
  select sa.id, sa.account_number, sa.balance,
         coalesce(recompute_balance(sa.id), 0)::numeric(14,2) as ledger_balance,
         (sa.balance - coalesce(recompute_balance(sa.id), 0))::numeric(14,2) as difference,
         count(st.id) as entry_count,
         max(st.created_at) as last_entry_at,
         case when sa.balance = coalesce(recompute_balance(sa.id), 0) then 'ok' else 'mismatch' end
  from savings_accounts sa
  left join savings_transactions st on st.account_id = sa.id
  where sa.org_id = p_org_id and sa.deleted_at is null
  group by sa.id
  order by sa.account_number;
$$ language sql stable;

-- Nightly report materialization: cron in Supabase (pg_cron) or a scheduled
-- GitHub Action calling POST /api/v1/savings/reconciliation/run.
create table reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  run_at timestamptz not null default now(),
  checked integer not null,
  mismatches integer not null,
  results jsonb not null, -- array of ReconciliationResult
  created_by uuid references auth.users (id) on delete set null
);

create index reconciliation_runs_org_idx on reconciliation_runs (org_id, run_at desc);

-- touch triggers
drop trigger if exists trg_touch_dividend_declarations on dividend_declarations;
create trigger trg_touch_dividend_declarations before update on dividend_declarations
for each row execute function touch_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table share_allotments       enable row level security;
alter table dividend_declarations  enable row level security;
alter table dividend_payments      enable row level security;
alter table reconciliation_runs    enable row level security;

create policy share_allotments_read_org on share_allotments for select using (org_id = auth_org_id());
create policy share_allotments_write_staff on share_allotments for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));
create policy share_allotments_update_admin on share_allotments for update
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy dividend_declarations_read_org on dividend_declarations for select using (org_id = auth_org_id());
create policy dividend_declarations_write_admin on dividend_declarations for all
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy dividend_payments_read_org on dividend_payments for select using (org_id = auth_org_id());
create policy dividend_payments_write_admin on dividend_payments for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy reconciliation_runs_read_staff on reconciliation_runs for select
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- Members may read their own passbook statements via the API (service role);
-- direct RLS on savings_transactions already scoped reads to org staff.

-- ─────────── migrations/0012_loan_products_applications.sql ───────────
-- 0012_loan_products_applications.sql — loan product catalog, regulatory rate
-- policy, application workflow (member request → officer visit → household
-- check → guarantor → BM review → [AM review] → decision), and guarantors.

-- ── Regulatory policy (one row per org, editable) ────────────────────────────
create table loan_policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references organizations (id) on delete cascade,
  rate_cap_percent numeric(5, 2) not null default 27.00 check (rate_cap_percent between 0 and 100),
  bm_approval_limit_bdt numeric(14, 2) not null default 30000.00 check (bm_approval_limit_bdt >= 0),
  guarantors_required integer not null default 1 check (guarantors_required between 0 and 5),
  max_active_loans_per_member integer not null default 2 check (max_active_loans_per_member between 1 and 10),
  min_days_between_loans integer not null default 0 check (min_days_between_loans between 0 and 365),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ── Product catalog ──────────────────────────────────────────────────────────
create type loan_product_type as enum (
  'general', 'seasonal_agri', 'microenterprise', 'housing', 'education',
  'emergency', 'migration', 'device', 'climate'
);

create type installment_frequency as enum ('daily', 'weekly', 'biweekly', 'monthly');

create type interest_method as enum ('declining_balance', 'flat');

create table loan_products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  code text not null,
  name text not null,
  name_bn text,
  product_type loan_product_type not null default 'general',
  min_amount numeric(14, 2) not null check (min_amount >= 0),
  max_amount numeric(14, 2) not null check (max_amount >= 0),
  term_months integer not null check (term_months between 1 and 120),
  installment_frequency installment_frequency not null default 'weekly',
  interest_method interest_method not null default 'declining_balance',
  interest_rate numeric(5, 2) not null check (interest_rate >= 0 and interest_rate <= 100),
  service_charge numeric(5, 2) not null default 0 check (service_charge >= 0),
  processing_fee_rate numeric(5, 2) not null default 0 check (processing_fee_rate >= 0),
  insurance_premium_rate numeric(5, 2) not null default 0 check (insurance_premium_rate >= 0),
  grace_period_installments integer not null default 0 check (grace_period_installments >= 0),
  eligibility_note text,
  required_documents jsonb not null default '[]'::jsonb,
  guarantors_required integer not null default 1 check (guarantors_required between 0 and 5),
  guarantor_min_relationship text,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code),
  constraint loan_product_amount_range check (min_amount <= max_amount)
);

create index loan_products_org_idx on loan_products (org_id) where is_active;

-- Rate cap is policy, not schema: validated at insert/update time against the
-- org's loan_policies row so it stays editable without a migration.
create or replace function enforce_loan_rate_cap() returns trigger as $$
declare
  v_cap numeric(5, 2);
  v_effective numeric(5, 2);
begin
  select rate_cap_percent into v_cap from loan_policies where org_id = new.org_id;
  if v_cap is null then
    v_cap := 27.00; -- MRA default when no policy row exists yet
  end if;
  v_effective := case when new.interest_method = 'flat' then new.interest_rate * 2 else new.interest_rate end;
  if v_effective > v_cap then
    raise exception 'Loan rate %%% (%) exceeds the regulatory cap of %%% (flat rates count double)',
      new.interest_rate,
      new.interest_method,
      v_cap;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_products_rate_cap before insert or update on loan_products
for each row execute function enforce_loan_rate_cap();

-- ── Applications ─────────────────────────────────────────────────────────────
create type loan_application_status as enum (
  'draft', 'submitted', 'officer_review', 'bm_review', 'am_review',
  'approved', 'rejected', 'disbursed', 'closed'
);

create table loan_applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  branch_id uuid not null references branches (id) on delete restrict,
  member_id uuid not null references members (id) on delete restrict,
  product_id uuid not null references loan_products (id) on delete restrict,
  application_number text not null unique,
  requested_amount numeric(14, 2) not null check (requested_amount > 0),
  purpose text not null check (char_length(purpose) between 3 and 500),
  status loan_application_status not null default 'draft',
  term_months integer not null check (term_months between 1 and 120),
  guarantors jsonb not null default '[]'::jsonb,
  decision_reason text,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index loan_applications_org_idx on loan_applications (org_id, status, created_at desc);
create index loan_applications_member_idx on loan_applications (member_id);
create index loan_applications_branch_idx on loan_applications (branch_id, status);

-- ── Workflow steps (audit trail of the wizard) ───────────────────────────────
create type loan_stage as enum (
  'member_request', 'officer_visit', 'household_check', 'guarantor',
  'bm_review', 'am_review', 'decision'
);

create type loan_stage_action as enum ('done', 'approved', 'rejected', 'returned');

create table loan_application_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  application_id uuid not null references loan_applications (id) on delete cascade,
  stage loan_stage not null,
  action loan_stage_action not null,
  actor_role text not null,
  actor_id uuid references auth.users (id) on delete set null,
  note text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index loan_application_steps_app_idx on loan_application_steps (application_id, created_at);

-- Requested amount must sit inside the product's min/max band.
create or replace function enforce_loan_amount_band() returns trigger as $$
declare
  v_min numeric(14, 2);
  v_max numeric(14, 2);
begin
  select min_amount, max_amount into v_min, v_max from loan_products where id = new.product_id;
  if new.requested_amount < v_min or new.requested_amount > v_max then
    raise exception 'Requested amount % is outside the product band %–%', new.requested_amount, v_min, v_max;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_applications_amount_band before insert or update on loan_applications
for each row execute function enforce_loan_amount_band();

-- Status moves one step at a time; area review is only required above the BM
-- limit. Enforced in SQL so no client can skip the approval chain.
create or replace function enforce_loan_status_transition() returns trigger as $$
declare
  v_allowed loan_application_status[];
  v_bm_limit numeric(14, 2);
begin
  if new.status = old.status then
    return new;
  end if;
  if new.status in ('draft', 'disbursed', 'closed') then
    raise exception 'Status % must be reached via its own API flow', new.status;
  end if;
  select bm_approval_limit_bdt into v_bm_limit from loan_policies where org_id = new.org_id;
  v_allowed := case
    when old.status = 'draft' then array['submitted']::loan_application_status[]
    when old.status = 'submitted' then array['officer_review']::loan_application_status[]
    when old.status = 'officer_review' then array['bm_review']::loan_application_status[]
    when old.status = 'bm_review' then
      case
        when v_bm_limit is not null and new.requested_amount > v_bm_limit
          then array['am_review', 'approved', 'rejected']::loan_application_status[]
        else array['approved', 'rejected']::loan_application_status[]
      end
    when old.status = 'am_review' then array['approved', 'rejected']::loan_application_status[]
    else array['rejected']::loan_application_status[]
  end;
  if not (new.status = any (v_allowed)) then
    raise exception 'Invalid loan status transition % → %', old.status, new.status;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_applications_status_guard before update on loan_applications
for each row execute function enforce_loan_status_transition();

-- Per-branch application sequence for human-readable numbers (LO-<BRANCH>-0001).
create table loan_application_seq (
  branch_id uuid primary key references branches(id),
  seq       integer not null default 0
);

create or replace function next_loan_seq(p_branch uuid)
returns integer language plpgsql as $$
declare v_seq integer;
begin
  insert into loan_application_seq (branch_id, seq) values (p_branch, 1)
  on conflict (branch_id) do update set seq = loan_application_seq.seq + 1
  returning seq into v_seq;
  return v_seq;
end;
$$;

-- ─────────── migrations/0013_loan_rls.sql ───────────
-- 0013_loan_rls.sql — RLS for the loan module. Reads are org-scoped for
-- staff; writes are role-gated. Policy updates are admin-only.

alter table loan_policies           enable row level security;
alter table loan_products           enable row level security;
alter table loan_applications       enable row level security;
alter table loan_application_steps  enable row level security;

-- ── Policies ─────────────────────────────────────────────────────────────────
create policy loan_policies_read_staff on loan_policies for select
  using (org_id = auth_org_id());

create policy loan_policies_write_admin on loan_policies for all
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin'));

create policy loan_products_read_staff on loan_products for select
  using (org_id = auth_org_id());

create policy loan_products_write_staff on loan_products for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager'));

create policy loan_products_update_staff on loan_products for update
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager'));

-- Applications: any staff can read; creation is officer/manager level.
create policy loan_applications_read_staff on loan_applications for select
  using (org_id = auth_org_id());

create policy loan_applications_insert_staff on loan_applications for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer'));

create policy loan_applications_update_staff on loan_applications for update
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'area_manager', 'account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'area_manager', 'account_officer'));

-- Steps are an append-only audit trail; write at application-edit level.
create policy loan_application_steps_read_staff on loan_application_steps for select
  using (org_id = auth_org_id());

create policy loan_application_steps_insert_staff on loan_application_steps for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'area_manager', 'account_officer'));

-- touch trigger for updated_at on loan_applications (function exists from 0001).
drop trigger if exists trg_touch_loan_applications on loan_applications;
create trigger trg_touch_loan_applications before update on loan_applications
for each row execute function touch_updated_at();

drop trigger if exists trg_touch_loan_products on loan_products;
create trigger trg_touch_loan_products before update on loan_products
for each row execute function touch_updated_at();

drop trigger if exists trg_touch_loan_policies on loan_policies;
create trigger trg_touch_loan_policies before update on loan_policies
for each row execute function touch_updated_at();

-- ─────────── migrations/0014_loan_governance.sql ───────────
-- 0014_loan_governance.sql — approval matrix, loan-cycle policy + history,
-- repayment installments (for overdue detection), utilization plans, and
-- timeline enrichment for the loan governance spec. Extends 0012/0013.

-- ── 4) Approval matrix (configurable per designation) ───────────────────────
create table loan_approval_matrix (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations (id) on delete cascade,
  product_id          uuid references loan_products (id) on delete cascade, -- null = all products
  min_amount          numeric(14, 2), -- null = open lower bound
  max_amount          numeric(14, 2), -- null = open upper bound
  approver_roles      text[] not null check (array_length(approver_roles, 1) >= 1),
  solo_approval_limit numeric(14, 2), -- null = unlimited solo approval
  priority            integer not null default 0,
  is_active           boolean not null default true,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  constraint loan_matrix_band_order check (
    min_amount is null or max_amount is null or min_amount <= max_amount
  ),
  constraint loan_matrix_roles_valid check (
    approver_roles <@ array[
      'super_admin', 'org_admin', 'area_manager', 'branch_manager',
      'account_officer', 'member'
    ]::text[]
  )
);

create index loan_matrix_resolve_idx on loan_approval_matrix (org_id, priority desc) where is_active;

-- ── 5) Cycle policy columns on loan_policies ────────────────────────────────
alter table loan_policies
  add column if not exists first_loan_cap_bdt        numeric(14, 2) not null default 20000.00,
  add column if not exists step_up_percent           numeric(5, 2)  not null default 25.00,
  add column if not exists max_cycle_cap_bdt         numeric(14, 2) not null default 100000.00,
  add column if not exists overdue_grace_days        integer        not null default 0,
  add column if not exists max_debt_to_income_ratio  numeric(5, 2)  not null default 0.40,
  add column if not exists max_loan_to_savings_ratio numeric(5, 2)  not null default 3.00,
  add column if not exists max_overlapping_loans     integer        not null default 2;

-- Disbursed loans with installment plans (drives overdue + cycle history).
create table loan_installments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  application_id uuid not null references loan_applications (id) on delete cascade,
  seq            integer not null check (seq >= 1),
  due_date       date not null,
  principal      numeric(14, 2) not null,
  interest       numeric(14, 2) not null,
  paid_amount    numeric(14, 2) not null default 0,
  paid_at        date,
  created_at     timestamptz not null default now(),
  unique (application_id, seq)
);

create index loan_installments_due_idx on loan_installments (org_id, due_date) where paid_at is null;

-- A disbursed loan is "closed" when all installments are paid; closure date
-- relative to the last due date drives the on-time flag in cycle history.
create or replace function loan_cycle_history(p_member uuid, p_org uuid)
returns table (
  application_id uuid,
  application_number text,
  status text,
  disbursed_at timestamptz,
  closed_at timestamptz,
  closed_on_time boolean
) language sql stable as $$
  select
    la.id,
    la.application_number,
    la.status::text,
    la.decided_at as disbursed_at,
    (select max(li.paid_at)::timestamptz from loan_installments li where li.application_id = la.id) as closed_at,
    coalesce(
      (select max(li.paid_at) <= max(li.due_date) + interval '30 days'
       from loan_installments li where li.application_id = la.id),
      true
    ) as closed_on_time
  from loan_applications la
  where la.member_id = p_member
    and la.org_id = p_org
    and la.status in ('disbursed', 'closed')
  order by la.decided_at;
$$;

-- ── 9) Utilization plan ─────────────────────────────────────────────────────
create type utilization_status as enum ('planned', 'verified');

create table loan_utilization_plans (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  application_id uuid not null references loan_applications (id) on delete cascade,
  items          jsonb not null check (jsonb_typeof(items) = 'array'),
  status         utilization_status not null default 'planned',
  verification   jsonb,
  verified_by    uuid references auth.users (id) on delete set null,
  verified_at    timestamptz,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (application_id)
);

-- Verification snapshot must be recorded before status flips to verified.
create or replace function enforce_utilization_verification() returns trigger as $$
begin
  if new.status = 'verified' and (new.verification is null or jsonb_typeof(new.verification) <> 'object') then
    raise exception 'A verification object is required to mark a utilization plan verified';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_utilization_verification before insert or update on loan_utilization_plans
for each row execute function enforce_utilization_verification();

-- ── Overdue + balance helpers used by the API service layer ─────────────────
create or replace function member_overdue_installments(p_member uuid, p_org uuid, p_grace_days integer)
returns table (
  installment_id uuid,
  loan_id uuid,
  due_date date,
  days_overdue integer,
  amount_due numeric(14, 2)
) language sql stable as $$
  select
    li.id,
    li.application_id,
    li.due_date,
    (current_date - li.due_date)::integer,
    (li.principal + li.interest - li.paid_amount)
  from loan_installments li
  join loan_applications la on la.id = li.application_id
  where la.member_id = p_member
    and la.org_id = p_org
    and la.status in ('disbursed', 'closed')
    and li.paid_at is null
    and (current_date - li.due_date)::integer > p_grace_days;
$$;

create or replace function member_savings_balance(p_member uuid, p_org uuid)
returns numeric(14, 2) language sql stable as $$
  select coalesce(sum(sa.balance), 0)
  from savings_accounts sa
  where sa.member_id = p_member
    and sa.org_id = p_org
    and sa.status in ('active', 'dormant');
$$;

-- Defense in depth: a live opening (am_review/bm_review → approved) must pass
-- the overlap limit recorded in policy. The full cycle gate runs in the API
-- service layer where schedule/eligibility context is available.
create or replace function enforce_loan_overlap_limit() returns trigger as $$
declare
  v_max integer;
  v_active integer;
begin
  if new.status not in ('approved') or old.status = 'approved' then
    return new;
  end if;
  select max_overlapping_loans into v_max from loan_policies where org_id = new.org_id;
  select count(*) into v_active
  from loan_applications la
  where la.member_id = new.member_id
    and la.org_id = new.org_id
    and la.id <> new.id
    and la.status in ('approved', 'disbursed');
  if v_active >= coalesce(v_max, 2) then
    raise exception 'Member already has % active loans (policy max %)', v_active, coalesce(v_max, 2);
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_applications_overlap_guard before update on loan_applications
for each row execute function enforce_loan_overlap_limit();

-- ─────────── migrations/0015_loan_governance_rls.sql ───────────
-- 0015_loan_governance_rls.sql — RLS for the governance tables added in 0014.

alter table loan_approval_matrix    enable row level security;
alter table loan_installments       enable row level security;
alter table loan_utilization_plans  enable row level security;

-- ── Approval matrix: staff read, admins write ────────────────────────────────
create policy loan_matrix_read_staff on loan_approval_matrix for select
  using (org_id = auth_org_id());

create policy loan_matrix_write_admin on loan_approval_matrix for all
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin'));

-- ── Installments: staff read; writes via disbursal/collection service only ──
create policy loan_installments_read_staff on loan_installments for select
  using (org_id = auth_org_id());

create policy loan_installments_write_admin on loan_installments for all
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager'));

-- ── Utilization plans: staff read; officers capture, managers verify ────────
create policy loan_utilization_read_staff on loan_utilization_plans for select
  using (org_id = auth_org_id());

create policy loan_utilization_write_staff on loan_utilization_plans for insert
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer'));

create policy loan_utilization_update_staff on loan_utilization_plans for update
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer'));

-- ─────────── migrations/0016_loan_disbursement.sql ───────────
-- 0016_loan_disbursement.sql — converts approved applications into active
-- loans: branch cash limits, the holiday calendar, the disbursement record
-- (mode + evidence + receiver), and the stored repayment schedule rows.

-- ── Branch cash limit (evidence for the cash_available check) ───────────────
create table if not exists branch_cash_limits (
  branch_id     uuid primary key references branches (id) on delete cascade,
  org_id        uuid not null references organizations (id) on delete cascade,
  cash_limit    numeric(14, 2) not null default 0,
  updated_by    uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now()
);

-- ── Holiday calendar (org-wide; recurring entries repeat every year) ────────
create table loan_holidays (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  date        date not null,
  name        text not null check (length(name) between 2 and 120),
  name_bn     text,
  is_recurring boolean not null default false,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (org_id, date)
);

-- ── 3) Disbursement record ──────────────────────────────────────────────────
create type disbursement_mode as enum ('cash_branch', 'cash_center', 'bank_transfer', 'bkash', 'nagad');
create type disbursement_status as enum ('pending', 'completed');

create table loan_disbursements (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations (id) on delete cascade,
  branch_id            uuid not null references branches (id) on delete cascade,
  application_id       uuid not null unique references loan_applications (id) on delete cascade,
  samity_id            uuid references samities (id) on delete set null,
  status               disbursement_status not null default 'pending',
  planned_date         date,
  checks               jsonb not null default '[]'::jsonb check (jsonb_typeof(checks) = 'array'),
  -- mode + evidence
  mode                 disbursement_mode,
  disbursement_date    date,
  mfs_reference        text check (mfs_reference is null or length(mfs_reference) between 4 and 40),
  bank_reference       text check (bank_reference is null or length(bank_reference) between 4 and 60),
  cash_received_by_name text,
  actual_user_of_funds  text, -- women borrowers: who actually uses the money
  actual_user_relation  text,
  note                 text,
  disbursed_by         uuid references auth.users (id) on delete set null,
  disbursed_at         timestamptz,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index loan_disbursements_queue_idx on loan_disbursements (org_id, branch_id, status, planned_date nulls last);

-- A disbursement can complete only once; the mode/evidence requirements are
-- enforced in the API service layer (shared schema) — the DB keeps a
-- structural guard so a completed row always carries mode + date.
create or replace function enforce_disbursement_completion() returns trigger as $$
begin
  if new.status = 'completed' then
    if new.mode is null or new.disbursement_date is null or new.disbursed_by is null then
      raise exception 'A completed disbursement requires mode, disbursement_date and disbursed_by';
    end if;
    if new.mode in ('cash_branch', 'cash_center') and coalesce(new.cash_received_by_name, '') = '' then
      raise exception 'Cash disbursement must record who received the money';
    end if;
    if new.mode = 'bank_transfer' and coalesce(new.bank_reference, '') = '' then
      raise exception 'Bank transfer requires a bank reference number';
    end if;
    if new.mode in ('bkash', 'nagad') and coalesce(new.mfs_reference, '') = '' then
      raise exception 'bKash/Nagad disbursement requires an MFS reference (TrxID)';
    end if;
    -- Every pre-disbursement check must be recorded as done.
    if exists (
      select 1
      from jsonb_array_elements(new.checks) as c
      where coalesce((c->>'done')::boolean, false) = false
    ) then
      raise exception 'All pre-disbursement checks must be completed before disbursement';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_disbursement_completion before insert or update on loan_disbursements
for each row execute function enforce_disbursement_completion();

-- ── 4) Stored repayment schedule rows ───────────────────────────────────────
create table loan_repayment_schedule (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations (id) on delete cascade,
  application_id   uuid not null references loan_applications (id) on delete cascade,
  seq              integer not null check (seq >= 1),
  original_due_date date not null,
  due_date         date not null,
  shifted          boolean not null default false,
  shift_reason     text,
  principal        numeric(14, 2) not null check (principal >= 0),
  interest         numeric(14, 2) not null check (interest >= 0),
  total            numeric(14, 2) not null check (total >= 0),
  balance_after    numeric(14, 2) not null check (balance_after >= 0),
  paid_amount      numeric(14, 2) not null default 0 check (paid_amount >= 0),
  paid_at          date,
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (application_id, seq)
);

create index loan_repayment_schedule_due_idx on loan_repayment_schedule (org_id, due_date) where paid_at is null;

-- Schedule rows exist exactly once per application and the totals must
-- reconstruct the loan: sum(principal) = disbursed principal.
create or replace function enforce_schedule_total() returns trigger as $$
declare
  v_principal numeric(14, 2);
  v_app_amount numeric(14, 2);
begin
  select requested_amount into v_app_amount from loan_applications where id = new.application_id;
  if v_app_amount is null then
    return new; -- application gone: cascade will clean up
  end if;
  select coalesce(sum(principal), 0) into v_principal
  from loan_repayment_schedule
  where application_id = new.application_id and seq <> coalesce(old.seq, -1);
  if v_principal + new.principal > v_app_amount + 0.01 then
    raise exception 'Schedule principal total % exceeds the approved amount %', v_principal + new.principal, v_app_amount;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_schedule_total_guard before insert or update on loan_repayment_schedule
for each row execute function enforce_schedule_total();

-- Disbursing an application moves it to the disbursed status (mirrors the
-- API service layer; defense in depth against direct writes).
create or replace function mark_application_disbursed() returns trigger as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    update loan_applications
       set status = 'disbursed', updated_at = now()
     where id = new.application_id
       and status in ('approved', 'disbursed');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_disbursement_marks_application after update on loan_disbursements
for each row execute function mark_application_disbursed();

drop trigger if exists trg_touch_loan_disbursements on loan_disbursements;
create trigger trg_touch_loan_disbursements before update on loan_disbursements
for each row execute function touch_updated_at();

-- ─────────── migrations/0017_disbursement_rls.sql ───────────
-- 0017_disbursement_rls.sql — RLS for disbursement, holidays, cash limits and
-- the stored repayment schedule. Same shape as 0013/0015: org-scoped reads,
-- role-gated writes, service role bypasses RLS for server-side flows.

alter table branch_cash_limits        enable row level security;
alter table loan_holidays             enable row level security;
alter table loan_disbursements        enable row level security;
alter table loan_repayment_schedule   enable row level security;

-- ── branch_cash_limits ───────────────────────────────────────────────────────
drop policy if exists branch_cash_limits_read on branch_cash_limits;
create policy branch_cash_limits_read on branch_cash_limits
  for select using (org_id = auth_org_id());

drop policy if exists branch_cash_limits_write on branch_cash_limits;
create policy branch_cash_limits_write on branch_cash_limits
  for all using (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'branch_manager'));

-- ── loan_holidays ────────────────────────────────────────────────────────────
drop policy if exists loan_holidays_read on loan_holidays;
create policy loan_holidays_read on loan_holidays
  for select using (org_id = auth_org_id());

drop policy if exists loan_holidays_write on loan_holidays;
create policy loan_holidays_write on loan_holidays
  for all using (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'area_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'area_manager'));

-- ── loan_disbursements ───────────────────────────────────────────────────────
drop policy if exists loan_disbursements_read on loan_disbursements;
create policy loan_disbursements_read on loan_disbursements
  for select using (org_id = auth_org_id());

drop policy if exists loan_disbursements_write on loan_disbursements;
create policy loan_disbursements_write on loan_disbursements
  for all using (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'branch_manager', 'account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'branch_manager', 'account_officer'));

-- ── loan_repayment_schedule ──────────────────────────────────────────────────
drop policy if exists loan_repayment_schedule_read on loan_repayment_schedule;
create policy loan_repayment_schedule_read on loan_repayment_schedule
  for select using (org_id = auth_org_id());

-- Rows are written only by the disbursement service (service role) and
-- repayment posting later; staff get no direct insert.
drop policy if exists loan_repayment_schedule_update on loan_repayment_schedule;
create policy loan_repayment_schedule_update on loan_repayment_schedule
  for update using (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'branch_manager', 'account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'branch_manager', 'account_officer'));

-- ─────────── migrations/0018_disbursement_governance.sql ───────────
-- 0018_disbursement_governance.sql — requirements 5–10 of the disbursement
-- spec: two-step control columns, the Module-10 journal backbone, loan
-- numbers, passbook entries, the SMS outbox, auto utilization visits, and
-- same-day rollback. The authorize/cancel RPCs each run as ONE transaction.

-- ── Two-step control + rollback columns (requirement 6, 10) ────────────────
alter type disbursement_status add value if not exists 'prepared' after 'pending';
alter type disbursement_status add value if not exists 'cancelled' after 'completed';

alter table loan_disbursements
  add column if not exists prepared_by     uuid references auth.users (id) on delete set null,
  add column if not exists prepared_at     timestamptz,
  add column if not exists loan_number     text,
  add column if not exists voucher_number  text,
  add column if not exists cancelled_at    timestamptz,
  add column if not exists cancelled_by    uuid references auth.users (id) on delete set null,
  add column if not exists cancel_reason   text;

create unique index if not exists loan_disbursements_loan_number_idx on loan_disbursements (loan_number) where loan_number is not null;

-- A completed disbursement must have a loan number and a preparer.
drop trigger if exists loan_disbursement_authorization_guard on loan_disbursements;
create or replace function enforce_disbursement_authorization() returns trigger as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    if new.prepared_by is null or new.prepared_at is null then
      raise exception 'Two-step control violated: an accountant must prepare before authorization';
    end if;
    if coalesce(new.loan_number, '') = '' then
      raise exception 'A completed disbursement requires a loan number';
    end if;
  end if;
  if new.status = 'cancelled' and coalesce(new.cancel_reason, '') = '' then
    raise exception 'Cancelling a disbursement requires a reason';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger loan_disbursement_authorization_guard before update on loan_disbursements
for each row execute function enforce_disbursement_authorization();

-- ── Loan number sequence per branch (requirement 8) ─────────────────────────
create table if not exists branch_loan_seq (
  branch_id uuid primary key references branches (id) on delete cascade,
  org_id    uuid not null references organizations (id) on delete cascade,
  seq       integer not null default 0
);

-- ── Module 10 backbone: the general journal (requirement 5) ─────────────────
create table if not exists journal_entries (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  branch_id   uuid references branches (id) on delete set null,
  entry_date  date not null,
  source_type text not null check (source_type in ('loan_disbursement','loan_disbursement_reversal','savings','share','manual')),
  source_id   uuid,
  memo        text not null,
  voided_at   timestamptz,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists journal_lines (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references journal_entries (id) on delete cascade,
  account_code text not null,
  account_name text not null,
  debit        numeric(14, 2) not null default 0 check (debit >= 0),
  credit       numeric(14, 2) not null default 0 check (credit >= 0)
);

create index journal_entries_source_idx on journal_entries (source_type, source_id);

-- Every entry must balance: sum(debit) = sum(credit).
create or replace function enforce_journal_balanced() returns trigger as $$
declare
  v_debit numeric(14, 2);
  v_credit numeric(14, 2);
begin
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0)
    into v_debit, v_credit
  from journal_lines where entry_id = coalesce(new.entry_id, old.entry_id);
  if abs(v_debit - v_credit) > 0.005 then
    raise exception 'Journal entry is not balanced: debits %, credits %', v_debit, v_credit;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

create constraint trigger journal_balanced after insert or update on journal_lines
deferrable initially deferred for each row execute function enforce_journal_balanced();

-- ── Loan passbook entries (requirement 8) ───────────────────────────────────
create table if not exists loan_passbook_entries (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  application_id uuid not null references loan_applications (id) on delete cascade,
  member_id     uuid not null,
  loan_number   text not null,
  entry_date    date not null,
  description   text not null,
  debit         numeric(14, 2) not null default 0 check (debit >= 0),
  credit        numeric(14, 2) not null default 0 check (credit >= 0),
  balance_after numeric(14, 2) not null default 0,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

-- ── SMS outbox (requirement 8; delivery is a later integration) ─────────────
create table if not exists sms_outbox (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations (id) on delete cascade,
  member_id  uuid,
  phone      text,
  template   text not null,
  body       text not null check (length(body) between 5 and 480),
  status     text not null default 'queued' check (status in ('queued','sent','failed')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

-- ── Auto utilization visit (requirement 9) ──────────────────────────────────
create table if not exists utilization_visits (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  branch_id      uuid references branches (id) on delete set null,
  application_id uuid not null references loan_applications (id) on delete cascade,
  member_id      uuid not null,
  scheduled_date date not null,
  status         text not null default 'scheduled' check (status in ('scheduled','completed','missed')),
  visited_at     date,
  notes          text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (application_id)
);

-- ── 6) Authorization RPC — everything below runs in ONE transaction ─────────
create or replace function authorize_loan_disbursement(
  p_application_id uuid,
  p_actor          uuid,
  p_schedule       jsonb,  -- [{seq, original_due_date, due_date, shifted, shift_reason, principal, interest, total, balance_after}]
  p_journal        jsonb,  -- {entry_date, memo, lines:[{account_code, account_name, debit, credit}]}
  p_passbook       jsonb,  -- {entry_date, description, debit, credit, balance_after}
  p_sms            jsonb   -- {member_id, phone, template, body}
) returns json as $$
declare
  v_rec        loan_disbursements%rowtype;
  v_app        loan_applications%rowtype;
  v_branch     branches%rowtype;
  v_limit      numeric(14, 2);
  v_out_today  numeric(14, 2);
  v_seq        integer;
  v_loan_no    text;
  v_entry_id   uuid;
  v_line       jsonb;
  v_row        jsonb;
  v_balance    numeric(14, 2);
begin
  -- Lock the disbursement row for the duration of the transaction.
  select * into v_rec from loan_disbursements
    where application_id = p_application_id for update;
  if not found then
    raise exception 'NOT_FOUND: Loan application not found';
  end if;
  if v_rec.status = 'completed' then
    raise exception 'CONFLICT: This loan has already been disbursed';
  end if;
  if v_rec.status <> 'prepared' then
    raise exception 'CONFLICT: Two-step control violated — an accountant must prepare the disbursement first (status: %)', v_rec.status;
  end if;

  select * into v_app from loan_applications where id = p_application_id;
  select * into v_branch from branches where id = v_rec.branch_id;

  -- Cash limit (requirement 6): block over the limit at authorization.
  if v_rec.mode in ('cash_branch', 'cash_center') then
    select coalesce(cash_limit, 0) into v_limit from branch_cash_limits where branch_id = v_rec.branch_id;
    select coalesce(sum(a.requested_amount), 0) into v_out_today
      from loan_disbursements d
      join loan_applications a on a.id = d.application_id
     where d.branch_id = v_rec.branch_id
       and d.status = 'completed'
       and d.mode in ('cash_branch', 'cash_center')
       and d.disbursement_date = v_rec.disbursement_date
       and d.application_id <> p_application_id;
    if v_out_today + v_app.requested_amount > coalesce(v_limit, 0) then
      raise exception 'CASH_LIMIT: Branch cash limit exceeded (% out today + % requested > % limit)', v_out_today, v_app.requested_amount, v_limit;
    end if;
  end if;

  -- Loan number (requirement 8): LN-<branchCode>-<YY>-<seq>.
  insert into branch_loan_seq (branch_id, org_id, seq) values (v_rec.branch_id, v_rec.org_id, 1)
    on conflict (branch_id) do update set seq = branch_loan_seq.seq + 1
    returning seq into v_seq;
  v_loan_no := 'LO-' || coalesce(v_branch.code, 'BR') || '-' || to_char(now(), 'YY') || '-' || lpad(v_seq::text, 4, '0');

  update loan_disbursements set
    status        = 'completed',
    loan_number   = v_loan_no,
    voucher_number = 'VCH-' || v_loan_no,
    disbursed_by  = p_actor,
    disbursed_at  = now(),
    updated_at    = now()
  where application_id = p_application_id
  returning * into v_rec;

  -- Stored schedule rows (requirement 4).
  delete from loan_repayment_schedule where application_id = p_application_id;
  for v_row in select * from jsonb_array_elements(p_schedule) loop
    insert into loan_repayment_schedule (
      org_id, application_id, seq, original_due_date, due_date, shifted, shift_reason,
      principal, interest, total, balance_after, created_by
    ) values (
      v_rec.org_id, p_application_id, (v_row->>'seq')::int,
      (v_row->>'originalDueDate')::date, (v_row->>'dueDate')::date,
      coalesce((v_row->>'shifted')::boolean, false), v_row->>'shiftReason',
      (v_row->>'principal')::numeric, (v_row->>'interest')::numeric,
      (v_row->>'total')::numeric, (v_row->>'balanceAfter')::numeric, p_actor
    );
  end loop;

  -- Journal entry + balanced lines (requirement 5).
  insert into journal_entries (org_id, branch_id, entry_date, source_type, source_id, memo, created_by)
  values (v_rec.org_id, v_rec.branch_id, (p_journal->>'entryDate')::date, 'loan_disbursement',
          p_application_id, p_journal->>'memo', p_actor)
  returning id into v_entry_id;
  for v_line in select * from jsonb_array_elements(p_journal->'lines') loop
    insert into journal_lines (entry_id, account_code, account_name, debit, credit)
    values (v_entry_id, v_line->>'accountCode', v_line->>'accountName',
            (v_line->>'debit')::numeric, (v_line->>'credit')::numeric);
  end loop;

  -- Passbook entry (requirement 8).
  insert into loan_passbook_entries (org_id, application_id, member_id, loan_number, entry_date, description, debit, credit, balance_after, created_by)
  values (v_rec.org_id, p_application_id, v_app.member_id, v_loan_no,
          (p_passbook->>'entryDate')::date, p_passbook->>'description',
          (p_passbook->>'debit')::numeric, (p_passbook->>'credit')::numeric,
          (p_passbook->>'balanceAfter')::numeric, p_actor);

  -- SMS to the member (requirement 8).
  if p_sms is not null and coalesce(p_sms->>'body', '') <> '' then
    insert into sms_outbox (org_id, member_id, phone, template, body, created_by)
    values (v_rec.org_id, (p_sms->>'memberId')::uuid, p_sms->>'phone', coalesce(p_sms->>'template', 'loan_disbursed'), p_sms->>'body', p_actor);
  end if;

  -- Utilization visit 15 days out (requirement 9).
  insert into utilization_visits (org_id, branch_id, application_id, member_id, scheduled_date, created_by)
  values (v_rec.org_id, v_rec.branch_id, p_application_id, v_app.member_id,
          v_rec.disbursement_date + 15, p_actor)
  on conflict (application_id) do nothing;

  -- Flip the application.
  update loan_applications set status = 'disbursed', updated_at = now()
    where id = p_application_id and status = 'approved';

  return to_json(v_rec);
end;
$$ language plpgsql;

-- ── 10) Rollback RPC — same-day cancel with reversal, ONE transaction ───────
create or replace function cancel_loan_disbursement(
  p_application_id uuid,
  p_actor          uuid,
  p_reason         text
) returns json as $$
declare
  v_rec       loan_disbursements%rowtype;
  v_app       loan_applications%rowtype;
  v_entry     journal_entries%rowtype;
  v_line      journal_lines%rowtype;
  v_entry_id  uuid;
  v_balance   numeric(14, 2);
begin
  if length(coalesce(p_reason, '')) < 10 then
    raise exception 'VALIDATION: A reason of at least 10 characters is required';
  end if;
  select * into v_rec from loan_disbursements where application_id = p_application_id for update;
  if not found then
    raise exception 'NOT_FOUND: Loan application not found';
  end if;
  if v_rec.status <> 'completed' then
    raise exception 'CONFLICT: Only a completed disbursement can be cancelled (status: %)', v_rec.status;
  end if;
  if v_rec.disbursement_date <> current_date then
    raise exception 'CONFLICT: A disbursement can only be cancelled on the same day (disbursed %)', v_rec.disbursement_date;
  end if;

  select * into v_app from loan_applications where id = p_application_id;

  -- Void the original entry and post the reversal.
  update journal_entries set voided_at = now()
    where source_type = 'loan_disbursement' and source_id = p_application_id and voided_at is null
    returning * into v_entry;
  if found then
    insert into journal_entries (org_id, branch_id, entry_date, source_type, source_id, memo, created_by)
    values (v_rec.org_id, v_rec.branch_id, current_date, 'loan_disbursement_reversal', p_application_id,
            'Reversal: ' || p_reason, p_actor)
    returning id into v_entry_id;
    for v_line in select * from journal_lines where entry_id = v_entry.id loop
      insert into journal_lines (entry_id, account_code, account_name, debit, credit)
      values (v_entry_id, v_line.account_code, v_line.account_name, v_line.credit, v_line.debit);
    end loop;
  end if;

  -- Passbook reversal entry.
  select coalesce(sum(credit - debit), 0) into v_balance from loan_passbook_entries where application_id = p_application_id;
  insert into loan_passbook_entries (org_id, application_id, member_id, loan_number, entry_date, description, debit, credit, balance_after, created_by)
  values (v_rec.org_id, p_application_id, v_app.member_id, coalesce(v_rec.loan_number, ''), current_date,
          'বাতিল / Disbursement cancelled: ' || p_reason, v_app.requested_amount, 0, v_balance - v_app.requested_amount, p_actor);

  -- Drop the schedule (regenerated on re-authorization) and the scheduled visit.
  delete from loan_repayment_schedule where application_id = p_application_id;
  delete from utilization_visits where application_id = p_application_id;

  -- Mark cancelled and revert the application to approved.
  update loan_disbursements set
    status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor, cancel_reason = p_reason, updated_at = now()
  where application_id = p_application_id
  returning * into v_rec;

  update loan_applications set status = 'approved', updated_at = now()
    where id = p_application_id and status = 'disbursed';

  -- Notify the member of the cancellation.
  insert into sms_outbox (org_id, member_id, template, body, created_by)
  values (v_rec.org_id, v_app.member_id, 'loan_cancelled',
          format('প্রিয় সদস্য, আপনার ঋণ %s বাতিল করা হয়েছে।', coalesce(v_rec.loan_number, v_rec.application_number)), p_actor);

  return to_json(v_rec);
end;
$$ language plpgsql;

-- ─────────── migrations/0019_disbursement_governance_rls.sql ───────────
-- 0019_disbursement_governance_rls.sql — RLS for the governance tables.
-- Journal/ledger and outbox are service-role domains; staff get reads.
-- Passbook rows are visible to staff; visits are branch-managed.

alter table branch_loan_seq            enable row level security;
alter table journal_entries            enable row level security;
alter table journal_lines              enable row level security;
alter table loan_passbook_entries      enable row level security;
alter table sms_outbox                 enable row level security;
alter table utilization_visits         enable row level security;

-- ── branch_loan_seq: service role only ──────────────────────────────────────
-- (no policies → only the service-role client / RPCs can touch it)

-- ── journal: org-scoped reads; writes only via the RPCs ─────────────────────
drop policy if exists journal_entries_read on journal_entries;
create policy journal_entries_read on journal_entries
  for select using (org_id = auth_org_id());

drop policy if exists journal_lines_read on journal_lines;
create policy journal_lines_read on journal_lines
  for select using (
    exists (select 1 from journal_entries e where e.id = journal_lines.entry_id and e.org_id = auth_org_id())
  );

-- ── passbook: staff reads; writes via the RPCs ──────────────────────────────
drop policy if exists loan_passbook_entries_read on loan_passbook_entries;
create policy loan_passbook_entries_read on loan_passbook_entries
  for select using (org_id = auth_org_id());

-- ── sms_outbox: admins read the outbox; delivery worker is service role ─────
drop policy if exists sms_outbox_read on sms_outbox;
create policy sms_outbox_read on sms_outbox
  for select using (org_id = auth_org_id());

-- ── utilization_visits: staff read, branch staff update completion ──────────
drop policy if exists utilization_visits_read on utilization_visits;
create policy utilization_visits_read on utilization_visits
  for select using (org_id = auth_org_id());

drop policy if exists utilization_visits_update on utilization_visits;
create policy utilization_visits_update on utilization_visits
  for update using (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'area_manager', 'branch_manager', 'account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('org_admin', 'area_manager', 'branch_manager', 'account_officer'));

-- ─────────── migrations/0020_collection_repayment.sql ───────────
-- 0020_collection_repayment.sql — Collection & Repayment module.
-- Idempotent collection entries (offline-safe), officer cash handovers with
-- shortage/excess tracking, and the payment-allocation guard trigger.

-- ── Collection entries ───────────────────────────────────────────────────────
create table if not exists collection_entries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  idempotency_key uuid not null unique,
  member_id       uuid not null references members(id),
  application_id  uuid references loan_applications(id),
  meeting_date    date not null,
  loan_paid       numeric(14,2) not null default 0 check (loan_paid >= 0),
  savings_paid    numeric(14,2) not null default 0 check (savings_paid >= 0),
  extra_paid      numeric(14,2) not null default 0 check (extra_paid >= 0),
  allocation      jsonb not null,
  receipt_no      text not null,
  collected_by    uuid references auth.users(id),
  captured_at     timestamptz,
  note            text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  -- soft delete support (referenced by v_collection_dashboard and the API's
  -- `.is('deleted_at', null)` convention); nullable so legacy rows are valid.
  deleted_at      timestamptz
);

create index if not exists collection_entries_branch_date_idx
  on collection_entries (branch_id, meeting_date);
create index if not exists collection_entries_officer_idx
  on collection_entries (collected_by, meeting_date);
create unique index if not exists collection_entries_receipt_uq
  on collection_entries (org_id, receipt_no);

-- ── Officer cash handovers ───────────────────────────────────────────────────
create table if not exists cash_handovers (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  officer_id      uuid not null references auth.users(id),
  handover_date   date not null,
  expected_amount numeric(14,2) not null default 0,
  counted_amount  numeric(14,2),
  received_amount numeric(14,2),
  difference      numeric(14,2) not null default 0,
  difference_kind text not null default 'none'
    check (difference_kind in ('none', 'shortage', 'excess')),
  status          text not null default 'draft'
    check (status in ('draft', 'submitted', 'confirmed', 'rejected')),
  officer_note    text,
  accountant_note text,
  confirmed_by    uuid references auth.users(id),
  confirmed_at    timestamptz,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One handover per officer per day.
  unique (org_id, officer_id, handover_date)
);

create index if not exists cash_handovers_branch_date_idx
  on cash_handovers (branch_id, handover_date);

-- ── Receipt numbering per branch per day ─────────────────────────────────────
create table if not exists receipt_counters (
  branch_id uuid not null references branches(id),
  yr        int not null,
  last_seq  int not null default 0,
  primary key (branch_id, yr)
);

-- ── Allocation guard (defense in depth — mirrors shared/collection-engine) ──
-- Overdue installments must be settled before later ones when the allocation
-- order is overdue_first; a posting may never leave an earlier installment
-- unpaid while paying a later one in the same call.
create or replace function enforce_collection_allocation_order()
returns trigger as $$
begin
  -- Every installment referenced by the allocation must exist on the
  -- application, and no applied amount may exceed what is owed on it.
  if new.application_id is not null then
    if (new.allocation -> 'overdueApplied') <> '[]'::jsonb
       or new.allocation ? 'currentApplied' then
      perform 1 from loan_repayment_schedule s
        where s.application_id = new.application_id
          and s.seq in (
            select (x ->> 'seq')::int
            from jsonb_array_elements(new.allocation -> 'overdueApplied') x
            union
            select (new.allocation -> 'currentApplied' ->> 'seq')::int
            where new.allocation ? 'currentApplied'
          );
      if not found then
        raise exception 'Allocation references unknown installments';
      end if;
    end if;

    perform 1 from loan_repayment_schedule s
      where s.application_id = new.application_id
        and s.seq = (new.allocation -> 'currentApplied' ->> 'seq')::int
        and s.paid_amount + (new.allocation -> 'currentApplied' ->> 'amount')::numeric <= s.total;
    if new.allocation ? 'currentApplied' and not found then
      raise exception 'Current-installment allocation exceeds the amount due';
    end if;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_collection_allocation on collection_entries;
create trigger trg_collection_allocation
  before insert on collection_entries
  for each row execute function enforce_collection_allocation_order();

-- ── Handover difference keeper ───────────────────────────────────────────────
create or replace function keep_handover_difference()
returns trigger as $$
begin
  if new.counted_amount is not null then
    new.difference := new.counted_amount - new.expected_amount;
    new.difference_kind := case
      when abs(new.difference) < 0.005 then 'none'
      when new.difference < 0 then 'shortage'
      else 'excess'
    end;
  else
    new.difference := 0;
    new.difference_kind := 'none';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_handover_difference on cash_handovers;
create trigger trg_handover_difference
  before insert or update on cash_handovers
  for each row execute function keep_handover_difference();

-- ── Cash tally: expected amount for an officer on a date ────────────────────
-- Sum of collection entries' allocated totals for that officer/day
-- (loan_paid + savings_paid + extra_paid minus any unapplied remainder).
create or replace function officer_cash_expected(
  p_org_id uuid,
  p_officer_id uuid,
  p_handover_date date
) returns numeric(14,2) as $$
  select coalesce(sum(loan_paid + savings_paid + extra_paid), 0)
  from collection_entries
  where org_id = p_org_id
    and collected_by = p_officer_id
    and meeting_date = p_handover_date;
$$ language sql stable;

-- ── Receipt numbering (concurrency-safe per branch per year) ────────────────
create or replace function next_receipt_no(
  p_org_id uuid,
  p_branch_id uuid
) returns text as $$
declare
  v_branch_code text;
  v_year int := extract(year from now())::int;
  v_seq int;
begin
  select code into v_branch_code from branches where id = p_branch_id and org_id = p_org_id;
  v_branch_code := coalesce(v_branch_code, 'BR');

  insert into receipt_counters (branch_id, yr, last_seq)
  values (p_branch_id, v_year, 1)
  on conflict (branch_id, yr) do update set last_seq = receipt_counters.last_seq + 1
  returning last_seq into v_seq;

  return 'RCP-' || v_branch_code || '-' || substr(v_year::text, 3, 2) || '-' || lpad(v_seq::text, 4, '0');
end;
$$ language plpgsql;

-- ─────────── migrations/0021_collection_rls.sql ───────────
-- 0021_collection_rls.sql — RLS for collection entries and cash handovers.
-- Field officers collect within their own branch; accountants and managers
-- confirm handovers. Reads are org-scoped (helpers from 0002_rls.sql).

alter table collection_entries enable row level security;
alter table cash_handovers     enable row level security;
alter table receipt_counters   enable row level security;

-- ── Collection entries ──────────────────────────────────────────────────────
create policy collection_entries_select on collection_entries
  for select using (
    org_id = auth_org_id() and can_read_members()
  );

create policy collection_entries_insert on collection_entries
  for insert with check (
    org_id = auth_org_id()
    and (
      auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer')
      -- An officer may post on behalf of themselves only; collected_by is
      -- pinned to the JWT user for field roles.
      and (collected_by is null or collected_by = auth.uid())
    )
  );

-- Immutable ledger: entries are never updated or deleted. Corrections happen
-- through reversal entries at the application layer.

-- ── Cash handovers ──────────────────────────────────────────────────────────
create policy cash_handovers_select on cash_handovers
  for select using (
    org_id = auth_org_id() and can_read_members()
  );

create policy cash_handovers_insert on cash_handovers
  for insert with check (
    org_id = auth_org_id()
    and officer_id = auth.uid()  -- officers open their own handovers
    and auth_user_role() in ('super_admin', 'org_admin', 'branch_manager', 'account_officer')
  );

create policy cash_handovers_update on cash_handovers
  for update using (
    org_id = auth_org_id()
    and (
      -- Officer advances their own draft/submitted handover.
      (officer_id = auth.uid() and status in ('draft', 'submitted'))
      -- Accountant / manager confirm or reject submitted handovers.
      or (
        auth_user_role() in ('super_admin', 'org_admin', 'branch_manager')
        and status = 'submitted'
      )
    )
  );

-- ── Receipt counters (service-role writes via RPC; readable in-org) ─────────
create policy receipt_counters_select on receipt_counters
  for select using (true);

-- ─────────── migrations/0022_collection_settlement_control.sql ───────────
-- 0022_collection_settlement_control.sql — Collection extensions (req 5–9):
-- date rules, entry reversals, reschedules, write-offs, early closures with
-- rebate, fraud flags and the realtime-friendly rollup view for the BM board.

-- ── 8) Rule engine config (per org) ─────────────────────────────────────────
create table if not exists collection_rules (
  org_id             uuid primary key references organizations(id) on delete cascade,
  backdate_limit_days int not null default 2 check (backdate_limit_days between 0 and 30),
  future_limit_days  int  not null default 0 check (future_limit_days  between 0 and 7),
  allocation_order   text not null default 'overdue_first'
    check (allocation_order in ('overdue_first','savings_first','proportional')),
  fraud_identical_min_members int not null default 5,
  fraud_meeting_radius_meters int not null default 500,
  fraud_self_pocket_min_entries int not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 6) Entry reversals (Branch Manager only) ────────────────────────────────
create table if not exists collection_reversals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  branch_id    uuid not null references branches(id),
  entry_id     uuid not null references collection_entries(id),
  receipt_no   text not null,
  reason       text not null check (char_length(reason) between 10 and 500),
  reversed_by  uuid not null references auth.users(id),
  unapplied    jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (entry_id) -- one reversal per entry; re-posting creates a new entry
);

-- Undo the allocation when a reversal row is inserted (single direction).
create or replace function fn_reverse_collection_entry() returns trigger
language plpgsql as $$
declare
  r collection_entries%rowtype;
begin
  select * into r from collection_entries where id = new.entry_id;
  if r.id is null then
    raise exception 'entry % not found', new.entry_id;
  end if;
  -- Restore unpaid portions on touched schedule rows.
  update loan_installments li
     set paid_amount = greatest(li.paid_amount - (x.amt), 0),
         paid_at     = null
    from (
      select (elem->>'seq')::int as seq, (elem->>'amount')::numeric(14,2) as amt
        from jsonb_array_elements(coalesce(new.unapplied->'overdue','[]'::jsonb)) elem
      union all
      select (new.unapplied->'current'->>'seq')::int, (new.unapplied->'current'->>'amount')::numeric(14,2)
        where new.unapplied->'current' ? 'seq'
    ) x
   where li.application_id = r.application_id and li.seq = x.seq;
  -- Remove the savings deposit leg (ledger-reversal convention).
  update savings_accounts sa
     set balance = balance - ((new.unapplied->>'savings')::numeric(14,2))
   where sa.id = (r.meta->>'savingsAccountId')::uuid
     and new.unapplied->>'savings' is not null;
  -- INSERT ... VALUES cannot take a WHERE clause; use INSERT ... SELECT ... WHERE.
  insert into savings_transactions (id, org_id, account_id, type, amount, reference, note, created_by, created_at)
  select gen_random_uuid(), r.org_id, (r.meta->>'savingsAccountId')::uuid, 'withdrawal',
         (new.unapplied->>'savings')::numeric(14,2), 'reversal:'||new.id::text,
         'ভুল এন্ট্রি বাতিল / Wrong-entry reversal', new.reversed_by, now()
   where new.unapplied->>'savings' is not null
     and (r.meta->>'savingsAccountId') is not null;
  return new;
end $$;

drop trigger if exists trg_reverse_collection_entry on collection_reversals;
create trigger trg_reverse_collection_entry
after insert on collection_reversals
for each row execute function fn_reverse_collection_entry();

-- ── 5) Reschedules ──────────────────────────────────────────────────────────
create table if not exists loan_reschedules (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id),
  branch_id          uuid not null references branches(id),
  application_id     uuid not null references loan_applications(id),
  shift_installments int  not null check (shift_installments between 1 and 12),
  reason             text not null check (reason in
                       ('disaster','illness','seasonal_income','death_in_family','other')),
  note               text not null check (char_length(note) between 3 and 500),
  moved_rows         jsonb not null default '[]'::jsonb,
  requested_by       uuid references auth.users(id),
  requested_at       timestamptz not null default now(),
  status             text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by         uuid references auth.users(id),
  decided_at         timestamptz,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

-- Approval applies the shift to the stored installments.
create or replace function fn_apply_reschedule() returns trigger
language plpgsql as $$
declare
  n int;
begin
  if new.status = 'approved' and old.status = 'pending' then
    select count(*) into n from loan_reschedules
     where application_id = new.application_id and status = 'approved' and id <> new.id;
    if n > 0 then raise exception 'loan already rescheduled once'; end if;
    update loan_installments li
       set due_date = li.due_date + ((li.seq - coalesce(
             (select min(seq) from loan_installments
               where application_id = new.application_id and paid_amount < total), 1)) * 0)
     where li.application_id = new.application_id; -- shifted via moved_rows below
    -- Concrete shift is recorded per row in moved_rows by the service layer
    -- (dates depend on the calendar engine); the trigger guards uniqueness.
  end if;
  return new;
end $$;

drop trigger if exists trg_apply_reschedule on loan_reschedules;
create trigger trg_apply_reschedule
after update on loan_reschedules
for each row execute function fn_apply_reschedule();

-- ── 5) Write-offs (request → approve; journal on approval) ──────────────────
create table if not exists loan_write_offs (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id),
  branch_id          uuid not null references branches(id),
  application_id     uuid not null references loan_applications(id),
  outstanding_amount numeric(14,2) not null check (outstanding_amount >= 0),
  reason             text not null check (reason in
                       ('death','permanent_disability','untraceable','fraud','court_written_off','other')),
  note               text not null check (char_length(note) between 10 and 1000),
  requested_by       uuid references auth.users(id),
  requested_at       timestamptz not null default now(),
  status             text not null default 'pending' check (status in ('pending','recommended','approved','rejected')),
  decided_by         uuid references auth.users(id),
  decided_at         timestamptz,
  decision_note      text,
  created_by         uuid references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  unique (application_id)
);

-- On approval: zero the remaining installments and post the write-off journal.
create or replace function fn_apply_write_off() returns trigger
language plpgsql as $$
declare
  v_total numeric(14,2);
begin
  if new.status = 'approved' and old.status in ('pending','recommended') then
    select coalesce(sum(total - paid_amount), 0) into v_total
      from loan_installments where application_id = new.application_id;
    if v_total <> new.outstanding_amount then
      update loan_write_offs set outstanding_amount = v_total where id = new.id;
    end if;
    update loan_installments set paid_amount = total
     where application_id = new.application_id and paid_amount < total;
    update loan_applications set status = 'written_off' where id = new.application_id;
    -- Journal: debit write-off expense / credit loan portfolio (Module 10).
    insert into journal_entries (id, org_id, branch_id, entry_date, source_type, source_id, memo, created_by, created_at)
    values (gen_random_uuid(), new.org_id, new.branch_id, current_date, 'loan_write_off',
            new.application_id, 'ঋণ অপরিশোধিত অংশ অপসারণ / Loan write-off ' || coalesce(new.decision_note,''), new.decided_by, now());
    insert into journal_lines (id, entry_id, account_code, debit, credit)
    values
      (gen_random_uuid(), (select id from journal_entries where source_id = new.application_id and source_type='loan_write_off' order by created_at desc limit 1), '6200', v_total, 0),
      (gen_random_uuid(), (select id from journal_entries where source_id = new.application_id and source_type='loan_write_off' order by created_at desc limit 1), '1200', 0, v_total);
  end if;
  return new;
end $$;

drop trigger if exists trg_apply_write_off on loan_write_offs;
create trigger trg_apply_write_off
after update on loan_write_offs
for each row execute function fn_apply_write_off();

-- ── 5) Early closure with rebate ────────────────────────────────────────────
create table if not exists loan_closures (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references organizations(id),
  branch_id              uuid not null references branches(id),
  application_id         uuid not null references loan_applications(id),
  outstanding_principal  numeric(14,2) not null,
  unearned_interest      numeric(14,2) not null,
  rebate                 numeric(14,2) not null check (rebate >= 0),
  service_deduction      numeric(14,2) not null default 0,
  closure_amount         numeric(14,2) not null check (closure_amount >= 0),
  remaining_installments int not null default 0,
  closed_at              timestamptz not null default now(),
  closed_by              uuid references auth.users(id),
  created_by             uuid references auth.users(id),
  created_at             timestamptz not null default now(),
  unique (application_id)
);

-- ── 9) Fraud flags (BM review queue) ────────────────────────────────────────
create table if not exists collection_fraud_flags (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  branch_id   uuid not null references branches(id),
  entry_id    uuid not null references collection_entries(id),
  receipt_no  text not null,
  rule        text not null check (rule in ('officer_self_pocket','identical_amounts','outside_meeting_radius')),
  severity    text not null check (severity in ('low','medium','high')),
  detail      text not null,
  detail_bn   text not null,
  reviewed    boolean not null default false,
  reviewed_by uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_fraud_flags_open
  on collection_fraud_flags (org_id, reviewed, created_at desc);

-- ── 7) Realtime rollup view (BM dashboard) ──────────────────────────────────
create or replace view v_collection_dashboard as
select
  ce.org_id,
  ce.branch_id,
  ce.meeting_date,
  ce.collected_by                        as officer_id,
  count(*)                               as entries_count,
  sum((ce.loan_paid + ce.savings_paid + ce.extra_paid))::numeric(14,2) as collected
from collection_entries ce
where ce.deleted_at is null
group by ce.org_id, ce.branch_id, ce.meeting_date, ce.collected_by;

-- publication for Supabase Realtime (free tier) on the new tables
alter publication supabase_realtime add table collection_entries;
alter publication supabase_realtime add table collection_fraud_flags;
alter publication supabase_realtime add table cash_handovers;

-- ─────────── migrations/0023_collection_settlement_rls.sql ───────────
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

-- ─────────── migrations/0024_delinquency_management.sql ───────────
-- 0024_delinquency_management.sql — Delinquency Management & Recovery.
-- Editable classification/provisioning settings, nightly classification runs,
-- escalating worklist cases, and follow-up records with reminder tasks.

-- ── 1) Editable settings (one row per org) ──────────────────────────────────
create table if not exists delinquency_settings (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id),
  bucket_bounds       jsonb not null default '{"d1_30":30,"d31_90":90,"d91_180":180}',
  provisioning_pct    jsonb not null default '{"standard":0,"substandard":25,"doubtful":50,"bad":100}',
  asset_class_by_dpd  jsonb not null default '{"substandard":31,"doubtful":91,"bad":181}',
  escalate_to_bm_days int not null default 3 check (escalate_to_bm_days between 1 and 180),
  escalate_to_am_days int not null default 15 check (escalate_to_am_days between 1 and 365),
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint delinquency_settings_org_key unique (org_id)
);

-- ── 1) Nightly classification run + per-loan snapshot ───────────────────────
create table if not exists delinquency_runs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  run_date    date not null,
  settings    jsonb not null,
  loans_total int not null default 0,
  loans_risk  int not null default 0,
  outstanding_total numeric(14,2) not null default 0,
  at_risk_total     numeric(14,2) not null default 0,
  provision_total   numeric(14,2) not null default 0,
  created_at  timestamptz not null default now(),
  constraint delinquency_runs_org_date_key unique (org_id, run_date)
);

create table if not exists loan_classifications (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id),
  run_id             uuid not null references delinquency_runs(id) on delete cascade,
  run_date           date not null,
  application_id     uuid not null references loan_applications(id),
  branch_id          uuid references branches(id),
  samity_id          uuid,
  officer_id         uuid,
  member_id          uuid not null,
  outstanding        numeric(14,2) not null default 0,
  overdue_principal  numeric(14,2) not null default 0,
  overdue_interest   numeric(14,2) not null default 0,
  days_past_due      int not null default 0,
  bucket             text not null check (bucket in ('regular','d1_30','d31_90','d91_180','d180_plus')),
  asset_class        text not null check (asset_class in ('standard','substandard','doubtful','bad')),
  provision_percent  numeric(5,2) not null default 0,
  provision_amount   numeric(14,2) not null default 0,
  oldest_unpaid_due  date,
  constraint loan_classifications_run_loan_key unique (run_id, application_id)
);
create index if not exists loan_classifications_run_idx on loan_classifications(run_id);
create index if not exists loan_classifications_dpd_idx on loan_classifications(org_id, days_past_due desc);

-- ── 3) Worklist cases (persist escalation state; refreshed nightly) ─────────
create table if not exists delinquency_cases (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  application_id uuid not null references loan_applications(id),
  branch_id      uuid references branches(id),
  samity_id      uuid,
  officer_id     uuid,
  days_past_due  int not null,
  bucket         text not null,
  overdue_total  numeric(14,2) not null default 0,
  outstanding    numeric(14,2) not null default 0,
  assigned_level text not null default 'field_officer' check (assigned_level in ('field_officer','branch_manager','area_manager')),
  assigned_to    uuid,
  status         text not null default 'open' check (status in ('open','cleared','written_off')),
  opened_at      date not null default current_date,
  cleared_at     date,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint delinquency_cases_open_loan_key unique (application_id, status)
);

-- ── 4) Follow-up records + reminder tasks ───────────────────────────────────
create table if not exists delinquency_follow_ups (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  case_id         uuid not null references delinquency_cases(id) on delete cascade,
  type            text not null check (type in ('visit','phone_call','group_meeting','letter','legal_notice')),
  outcome         text not null check (outcome in ('promise_to_pay','partial_paid','refused','not_found','rescheduled','escalated')),
  promise_date    date,
  promise_amount  numeric(14,2),
  note            text,
  next_visit_date date,
  created_by      uuid,
  created_at      timestamptz not null default now()
);

create table if not exists delinquency_tasks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  follow_up_id   uuid references delinquency_follow_ups(id) on delete cascade,
  application_id uuid references loan_applications(id),
  member_id      uuid,
  title          text not null,
  title_bn       text not null,
  due_date       date not null,
  assigned_to    uuid,
  status         text not null default 'open' check (status in ('open','done')),
  done_at        timestamptz,
  source         text not null default 'delinquency' check (source in ('delinquency','manual')),
  created_at     timestamptz not null default now()
);
create index if not exists delinquency_tasks_open_idx on delinquency_tasks(org_id, status, due_date);

-- ── Trigger: promise-to-pay / next-visit auto-creates a reminder task ───────
create or replace function fn_delinquency_follow_up_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loan text;
  v_member uuid;
  v_due date;
begin
  v_due := coalesce(new.next_visit_date, new.promise_date);
  if v_due is null then
    return new;
  end if;
  select rec.loan_number, rec.member_id
    into v_loan, v_member
  from delinquency_cases c
  join loan_applications la on la.id = c.application_id
  left join loan_disbursements rec on rec.application_id = la.id and rec.cancelled_at is null
  where c.id = new.case_id;

  insert into delinquency_tasks (org_id, follow_up_id, application_id, member_id, title, title_bn, due_date)
  values (
    new.org_id,
    new.id,
    (select application_id from delinquency_cases where id = new.case_id),
    v_member,
    coalesce('Follow-up: ' || v_loan, 'Follow-up'),
    coalesce('ফলো-আপ: ' || v_loan, 'ফলো-আপ'),
    v_due
  );
  return new;
end;
$$;

drop trigger if exists trg_delinquency_follow_up_task on delinquency_follow_ups;
create trigger trg_delinquency_follow_up_task
after insert on delinquency_follow_ups
for each row execute function fn_delinquency_follow_up_task();

-- ── 2) PAR rollup helper: aggregate a classification run by any scope ───────
create or replace function fn_par_by_scope(p_run_id uuid, p_scope text)
returns table (scope_id uuid, scope_name text, outstanding_total numeric, at_risk numeric,
               par1 numeric, par30 numeric, par90 numeric, loans_total bigint, loans_at_risk bigint)
language sql
stable
set search_path = public
as $$
  with base as (
    select
      c.application_id,
      case p_scope
        when 'branch' then c.branch_id
        when 'officer' then c.officer_id
        when 'samity' then c.samity_id
        else c.org_id::uuid
      end as node_id,
      c.outstanding,
      (c.days_past_due > 0)  as at_risk_flag,
      (c.days_past_due >= 30) as at30_flag,
      (c.days_past_due >= 90) as at90_flag
    from loan_classifications c
    where c.run_id = p_run_id
  ),
  agg as (
    select node_id,
           sum(outstanding) as outstanding_total,
           sum(case when at_risk_flag then outstanding else 0 end) as at_risk,
           sum(case when at30_flag then outstanding else 0 end) as at30,
           sum(case when at90_flag then outstanding else 0 end) as at90,
           count(*) as loans_total,
           count(*) filter (where at_risk_flag) as loans_at_risk
    from base group by node_id
  )
  select node_id,
         coalesce(b.name, a.name, z.name, o.name, 'Organization'),
         agg.outstanding_total, agg.at_risk,
         case when agg.outstanding_total > 0 then agg.at_risk / agg.outstanding_total else 0 end,
         case when agg.outstanding_total > 0 then agg.at30 / agg.outstanding_total else 0 end,
         case when agg.outstanding_total > 0 then agg.at90 / agg.outstanding_total else 0 end,
         agg.loans_total, agg.loans_at_risk
  from agg
  left join branches b on p_scope = 'branch' and b.id = agg.node_id
  -- samity scope: node_id is a samities.id; samities has a name column
  -- (working_areas does not, and the old join here caused 42703).
  left join samities a on p_scope = 'samity' and a.id = agg.node_id
  left join areas z on p_scope = 'area' and z.id = agg.node_id
  left join organizations o on p_scope in ('org','zone') and o.id = agg.node_id;
$$;

-- ─────────── migrations/0025_delinquency_rls.sql ───────────
-- 0025_delinquency_rls.sql — RLS for the delinquency tables.
-- Reads are org-scoped staff permissions; settings changes are admin-only;
-- follow-ups are writable by any collections-capable staff role.

alter table delinquency_settings       enable row level security;
alter table delinquency_runs           enable row level security;
alter table loan_classifications       enable row level security;
alter table delinquency_cases          enable row level security;
alter table delinquency_follow_ups     enable row level security;
alter table delinquency_tasks          enable row level security;

-- ── Settings: read by staff, write by org admins ────────────────────────────
create policy delinquency_settings_read on delinquency_settings
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy delinquency_settings_write on delinquency_settings
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ── Runs + classifications: staff read, service-role write (nightly job) ────
create policy delinquency_runs_read on delinquency_runs
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy loan_classifications_read on loan_classifications
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

-- ── Cases: staff read; write gated on role (BM clears, officers progress) ───
create policy delinquency_cases_read on delinquency_cases
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy delinquency_cases_write on delinquency_cases
  for update using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy delinquency_cases_insert on delinquency_cases
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'));

-- ── Follow-ups: read staff; write collections-capable roles ─────────────────
create policy delinquency_follow_ups_read on delinquency_follow_ups
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy delinquency_follow_ups_write on delinquency_follow_ups
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

-- ── Tasks: assigned user or staff can read; writers mark done ───────────────
create policy delinquency_tasks_read on delinquency_tasks
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy delinquency_tasks_write on delinquency_tasks
  for update using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

create policy delinquency_tasks_insert on delinquency_tasks
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

-- ─────────── migrations/0026_delinquency_recovery.sql ───────────
-- 0026_delinquency_recovery.sql — Recovery extensions (requirements 5–9).
-- Root-cause tags, recovery actions (waivers, savings adjustments, legal
-- notices, write-off proposals with approval chain + later recovery),
-- provision proposals, early-warning signals, and run history for trends.

-- ── 5) Root-cause tags ──────────────────────────────────────────────────────
create table if not exists delinquency_root_causes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  application_id uuid not null references loan_applications(id),
  cause        text not null check (cause in ('business_failure','illness','flood_disaster','migration','diversion_of_funds','staff_weakness','over_lending')),
  note         text,
  created_by   uuid,
  created_at   timestamptz not null default now()
);
create index if not exists delinquency_root_causes_loan_idx on delinquency_root_causes(application_id);

-- ── 6) Partial waivers (BM recommends → AM approves) ────────────────────────
create table if not exists loan_waivers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  application_id uuid not null references loan_applications(id),
  basis          text not null check (basis in ('overdue_interest','total_overdue')),
  percent        numeric(5,2) not null check (percent between 1 and 100),
  waived_amount  numeric(14,2) not null default 0,
  reason         text not null,
  status         text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by   uuid,
  requested_at   timestamptz not null default now(),
  decided_by     uuid,
  decided_at     timestamptz,
  decision_note  text
);

-- ── 6) Savings adjustments (loan offset from member savings) ────────────────
create table if not exists loan_savings_adjustments (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  application_id   uuid not null references loan_applications(id),
  savings_account_id uuid not null,
  amount           numeric(14,2) not null check (amount > 0),
  journal_entry_id uuid,
  note             text,
  created_by       uuid,
  created_at       timestamptz not null default now()
);

-- ── 6) Legal notices ────────────────────────────────────────────────────────
create table if not exists loan_legal_notices (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  application_id   uuid not null references loan_applications(id),
  reply_within_days int not null check (reply_within_days between 3 and 60),
  overdue_total    numeric(14,2) not null default 0,
  outstanding      numeric(14,2) not null default 0,
  body_bn          text not null,
  issued_by        uuid,
  issued_at        timestamptz not null default now()
);

-- ── 6) Write-off proposals (AM recommends → Director Operations approves)
--      with later recovery postings ──────────────────────────────────────────
create table if not exists loan_write_off_proposals (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id),
  application_id     uuid not null references loan_applications(id),
  outstanding_amount numeric(14,2) not null default 0,
  reason             text not null,
  legal_action_taken text,
  status             text not null default 'pending' check (status in ('pending','recommended','approved','rejected')),
  requested_by       uuid,
  requested_at       timestamptz not null default now(),
  recommended_by     uuid,
  recommended_at     timestamptz,
  decided_by         uuid,
  decided_at         timestamptz,
  decision_note      text
);

create table if not exists loan_write_off_recoveries (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  proposal_id  uuid not null references loan_write_off_proposals(id) on delete cascade,
  amount       numeric(14,2) not null check (amount > 0),
  note         text,
  journal_entry_id uuid,
  received_by  uuid,
  received_at  timestamptz not null default now()
);

-- ── 7) Loan-loss provision proposals (Dr expense / Cr reserve on approval) ──
create table if not exists loan_loss_provision_proposals (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  run_date         date not null,
  by_class         jsonb not null,
  provision_total  numeric(14,2) not null default 0,
  prior_total      numeric(14,2) not null default 0,
  provision_expense numeric(14,2) not null default 0,
  status           text not null default 'pending_approval' check (status in ('pending_approval','posted')),
  note             text,
  requested_by     uuid,
  requested_at     timestamptz not null default now(),
  posted_at        timestamptz,
  journal_entry_id uuid
);

-- ── 8) Early-warning signals ────────────────────────────────────────────────
create table if not exists early_warning_signals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  kind         text not null check (kind in ('member_missed_two','samity_attendance_falling','officer_par_rising')),
  severity     text not null check (severity in ('low','medium','high')),
  ref_id       uuid not null,
  branch_id    uuid,
  detail       text not null,
  detail_bn    text not null,
  metric       numeric(14,4) not null default 0,
  prior_metric numeric(14,4),
  detected_at  timestamptz not null default now(),
  acknowledged boolean not null default false,
  acknowledged_by uuid,
  acknowledged_at timestamptz
);
create index if not exists early_warning_open_idx on early_warning_signals(org_id, acknowledged, kind);

-- ── Scan bookkeeping: prevent duplicate signals between runs ────────────────
create table if not exists early_warning_scans (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id),
  scan_date  date not null,
  signals    int not null default 0,
  created_at timestamptz not null default now(),
  constraint early_warning_scans_org_date_key unique (org_id, scan_date)
);

-- ─────────── migrations/0027_delinquency_recovery_rls.sql ───────────
-- 0027_delinquency_recovery_rls.sql — RLS for the recovery tables.
-- Staff read; workflow writes role-gated (BM+ create, AM/admin decide).

alter table delinquency_root_causes        enable row level security;
alter table loan_waivers                   enable row level security;
alter table loan_savings_adjustments       enable row level security;
alter table loan_legal_notices             enable row level security;
alter table loan_write_off_proposals       enable row level security;
alter table loan_write_off_recoveries      enable row level security;
alter table loan_loss_provision_proposals  enable row level security;
alter table early_warning_signals          enable row level security;
alter table early_warning_scans            enable row level security;

-- Staff can read every recovery artifact for their org.
create policy recovery_read on delinquency_root_causes
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_waivers on loan_waivers
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_adjustments on loan_savings_adjustments
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_notices on loan_legal_notices
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_proposals on loan_write_off_proposals
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_recoveries on loan_write_off_recoveries
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_provisions on loan_loss_provision_proposals
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_warnings on early_warning_signals
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_read_scans on early_warning_scans
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

-- Writes: BM+ can create; decisions restricted by app logic per table.
create policy recovery_write_causes on delinquency_root_causes
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_write_waivers on loan_waivers
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'));
create policy recovery_write_adjustments on loan_savings_adjustments
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'));
create policy recovery_write_notices on loan_legal_notices
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'));
create policy recovery_write_proposals on loan_write_off_proposals
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager'));
create policy recovery_write_recoveries on loan_write_off_recoveries
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_write_provisions on loan_loss_provision_proposals
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));
create policy recovery_write_warnings on early_warning_signals
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy recovery_write_scans on early_warning_scans
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));

-- ─────────── migrations/0028_accounting.sql ───────────
-- 0028_accounting.sql — Accounting & double-entry bookkeeping (Module 10).
-- Chart of accounts (org-editable) with fund/project + branch dimensions,
-- vouchers with draft → checked → approved workflow, event-to-journal
-- mapping for automatic postings, daily branch cash book with locking,
-- bank reconciliation, and a petty-cash register.
--
-- Conventions: id uuid, org_id, branch_id where relevant, created_by,
-- created_at, updated_at, deleted_at (soft delete). Money numeric(14,2).

-- ── 1) Chart of accounts ────────────────────────────────────────────────────
create table if not exists gl_accounts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  code        varchar(4) not null,
  name        text not null,
  name_bn     text not null,
  type        text not null check (type in ('asset','liability','fund','income','expense')),
  category    text not null check (category in ('control','cash','bank','income','expense','party','member','memo')),
  -- self-FK added below via alter table: an inline `references gl_accounts(code)`
  -- cannot be validated until the unique index on code exists (42830).
  parent_code varchar(4),
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (org_id, code)
);

-- Several child tables below reference gl_accounts(code) directly. Code is a
-- 4-char per-org code, so give it a global unique index to make those FKs
-- valid (single-org deployments — this app's model — are unaffected).
create unique index if not exists gl_accounts_code_key on gl_accounts (code);

-- Now that the unique index exists, attach the parent self-reference.
alter table gl_accounts drop constraint if exists gl_accounts_parent_code_fkey;
alter table gl_accounts
  add constraint gl_accounts_parent_code_fkey
  foreign key (parent_code) references gl_accounts(code);

-- ── 2) Vouchers ─────────────────────────────────────────────────────────────
create table if not exists vouchers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  branch_id      uuid not null references branches(id),
  voucher_number text not null unique,           -- VCH-<prefix>-<branchCode>-<YY>-<seq>
  voucher_type   text not null check (voucher_type in ('cash_receipt','cash_payment','bank_payment','journal','contra')),
  voucher_date   date not null,
  fund_id        uuid,                            -- fund/project dimension
  project_name   text,
  payee_payer    text,
  memo           text not null,
  status         text not null default 'draft' check (status in ('draft','checked','approved')),
  auto_source    text,                            -- event key when auto-posted
  amount_total   numeric(14,2) not null default 0 check (amount_total >= 0),
  prepared_by    uuid references auth.users(id),
  checked_by     uuid references auth.users(id),
  checked_at     timestamptz,
  approved_by    uuid references auth.users(id),
  approved_at    timestamptz,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table if not exists voucher_lines (
  id           uuid primary key default gen_random_uuid(),
  voucher_id   uuid not null references vouchers(id) on delete cascade,
  org_id       uuid not null references organizations(id),
  account_code varchar(4) not null references gl_accounts(code),
  fund_id      uuid,
  project_name text,
  party_name   text,
  note         text,
  debit        numeric(14,2) not null default 0 check (debit >= 0),
  credit       numeric(14,2) not null default 0 check (credit >= 0),
  check (debit = 0 or credit = 0),
  check (debit + credit > 0)
);

-- Balanced-voucher guard (defense in depth with the Zod refine).
create or replace function fn_voucher_balanced() returns trigger as $$
declare
  v_debit  numeric(14,2);
  v_credit numeric(14,2);
begin
  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_debit, v_credit
  from voucher_lines where voucher_id = coalesce(new.id, old.voucher_id);
  if abs(v_debit - v_credit) > 0.005 then
    raise exception 'Voucher % is not balanced (Dr % / Cr %)', coalesce(new.id, old.voucher_id), v_debit, v_credit;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_voucher_balanced
  after insert or update or delete on voucher_lines
  for each row execute function fn_voucher_balanced();

-- Workflow transition guard: draft → checked → approved, no skipping.
create or replace function fn_voucher_transition() returns trigger as $$
begin
  if new.status = 'checked' and old.status <> 'draft' then
    raise exception 'Only a draft voucher can be checked';
  end if;
  if new.status = 'approved' and old.status <> 'checked' then
    raise exception 'Only a checked voucher can be approved';
  end if;
  if old.status = 'approved' and new.status <> 'approved' then
    raise exception 'Approved vouchers are immutable';
  end if;
  if new.status = 'checked' then new.checked_by := auth.uid(); new.checked_at := now(); end if;
  if new.status = 'approved' then new.approved_by := auth.uid(); new.approved_at := now(); end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_voucher_transition
  before update of status on vouchers
  for each row execute function fn_voucher_transition();

-- Attachments (metadata only; binaries live in a private storage bucket).
create table if not exists voucher_attachments (
  id          uuid primary key default gen_random_uuid(),
  voucher_id  uuid not null references vouchers(id) on delete cascade,
  org_id      uuid not null references organizations(id),
  name        text not null,
  storage_path text not null,
  size_bytes  bigint not null check (size_bytes between 0 and 20971520),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

-- ── 3) Event-to-journal mapping (automatic postings) ────────────────────────
create table if not exists journal_postings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  branch_id    uuid references branches(id),
  event        text not null check (event in (
                 'savings_deposit','savings_withdrawal','loan_disbursement','loan_collection',
                 'fee_collected','insurance_premium','salary_payment','loan_writeoff','provision_posted')),
  source_table text not null,
  source_id    uuid not null,
  amount       numeric(14,2) not null check (amount >= 0),
  entry_date   date not null default current_date,
  memo         text,
  voucher_id   uuid references vouchers(id),
  idempotency_key text unique,                    -- e.g. 'collection:<entryId>'
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  unique (source_table, source_id, event)
);

create table if not exists event_journal_mappings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  event          text not null check (event in (
                   'savings_deposit','savings_withdrawal','loan_disbursement','loan_collection',
                   'fee_collected','insurance_premium','salary_payment','loan_writeoff','provision_posted')),
  settlement_code varchar(4) not null references gl_accounts(code),
  counter_code    varchar(4) not null references gl_accounts(code),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (org_id, event),
  check (settlement_code <> counter_code)
);

-- ── 4) Daily branch cash book ───────────────────────────────────────────────
create table if not exists cash_book_days (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id),
  branch_id           uuid not null references branches(id),
  book_date           date not null,
  status              text not null default 'open' check (status in ('open','closed')),
  opening_balance     numeric(14,2) not null default 0,
  total_cash_in       numeric(14,2) not null default 0,
  total_cash_out      numeric(14,2) not null default 0,
  expected_closing    numeric(14,2) not null default 0,
  counted_cash        numeric(14,2),
  difference          numeric(14,2),
  difference_kind     text check (difference_kind in ('shortage','excess','exact')),
  closing_balance     numeric(14,2),
  locked              boolean not null default false,
  manager_sign_name   text,
  accountant_sign_name text,
  closed_at           timestamptz,
  note                text,
  created_by          uuid references auth.users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (branch_id, book_date)
);

create table if not exists cash_book_lines (
  id            uuid primary key default gen_random_uuid(),
  cash_book_id  uuid not null references cash_book_days(id) on delete cascade,
  voucher_id    uuid references vouchers(id),
  voucher_number text,
  voucher_type  text,                             -- voucher type or 'auto'
  memo          text not null,
  cash_in       numeric(14,2) not null default 0 check (cash_in >= 0),
  cash_out      numeric(14,2) not null default 0 check (cash_out >= 0),
  created_at    timestamptz not null default now()
);

-- Day-end locking: once locked, nothing may change for that day.
create or replace function fn_cash_book_locked() returns trigger as $$
declare
  v_locked boolean;
  v_book_id uuid;
begin
  v_book_id := coalesce(new.cash_book_id, old.id);
  if tg_table_name = 'cash_book_days' then
    if old.locked and (
         new.opening_balance is distinct from old.opening_balance
      or new.total_cash_in   is distinct from old.total_cash_in
      or new.total_cash_out  is distinct from old.total_cash_out
      or new.counted_cash    is distinct from old.counted_cash
    ) then
      raise exception 'Cash book for % is locked (day-end closing)', old.book_date;
    end if;
    return coalesce(new, old);
  end if;
  select locked into v_locked from cash_book_days where id = v_book_id;
  if v_locked then
    raise exception 'Cash book % is locked; new lines are rejected', v_book_id;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_cash_book_days_lock
  before update or delete on cash_book_days
  for each row execute function fn_cash_book_locked();
create trigger trg_cash_book_lines_lock
  before insert or update or delete on cash_book_lines
  for each row execute function fn_cash_book_locked();

-- ── 5) Bank reconciliation ──────────────────────────────────────────────────
create table if not exists bank_reconciliations (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id),
  branch_id         uuid not null references branches(id),
  bank_code         varchar(4) not null references gl_accounts(code),
  period_start      date not null,
  period_end        date not null,
  book_balance      numeric(14,2) not null default 0,
  statement_balance numeric(14,2) not null default 0,
  status            text not null default 'pending' check (status in ('pending','cleared')),
  prepared_by       uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (period_end >= period_start)
);

create table if not exists bank_statement_lines (
  id            uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references bank_reconciliations(id) on delete cascade,
  value_date    date not null,
  narration     text not null,
  amount        numeric(14,2) not null,           -- + credit (money in), − debit (money out)
  cleared       boolean not null default false,
  matched_voucher_number text,
  created_at    timestamptz not null default now()
);

-- ── Petty cash register ─────────────────────────────────────────────────────
create table if not exists petty_cash_accounts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id),
  branch_id  uuid not null references branches(id) unique,
  balance    numeric(14,2) not null default 0 check (balance >= 0),
  spend_limit numeric(14,2) not null default 2000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists petty_cash_movements (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  branch_id    uuid not null references branches(id),
  kind         text not null check (kind in ('top_up','spend')),
  amount       numeric(14,2) not null check (amount > 0),
  expense_code varchar(4) references gl_accounts(code),
  spent_on     text,
  note         text,
  balance_after numeric(14,2) not null,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);

-- Spending guard: never below zero (limit is enforced in the service layer).
create or replace function fn_petty_cash_floor() returns trigger as $$
declare
  v_balance numeric(14,2);
begin
  select balance into v_balance from petty_cash_accounts
    where branch_id = coalesce(new.branch_id, old.branch_id);
  if v_balance < 0 then
    raise exception 'Petty cash balance cannot go below zero';
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger trg_petty_cash_floor
  after update of balance on petty_cash_accounts
  for each row execute function fn_petty_cash_floor();

-- Seed the default chart of accounts + event mappings for every org.
insert into gl_accounts (org_id, code, name, name_bn, type, category, parent_code)
select o.id, d.code, d.name, d.name_bn, d.type, d.category, d.parent_code
from organizations o
cross join (values
  ('1000','Cash & Bank (Control)','নগদ ও ব্যাংক (নিয়ন্ত্রণ)','asset','control',null::varchar),
  ('1010','Cash in Vault','নগদ তহবিল','asset','cash','1000'),
  ('1015','Petty Cash','খুচরা নগদ','asset','cash','1000'),
  ('1020','Bank Account','ব্যাংক হিসাব','asset','bank','1000'),
  ('1030','MFS Clearing','মোবাইল ব্যাংকিং ক্লিয়ারিং','asset','bank','1000'),
  ('1200','Loan Portfolio','ঋণ পোর্টফোলিও','asset','control',null),
  ('1300','Loan Loss Provision Reserve','ঋণ ক্ষতি সঞ্চিতি সংরক্ষণ','asset','control',null),
  ('1400','Stationery & Stock','স্টেশনারি ও মজুদ','asset','control',null),
  ('2100','Member Savings Deposits','সদস্য সঞ্চয় আমানত','liability','control',null),
  ('2110','Term Deposits (DPS/FDR)','মেয়াদি আমানত','liability','control','2100'),
  ('2200','Member Advance Credit','সদস্য অগ্রিম জমা','liability','control',null),
  ('2300','Loan Loss Provision (P&L offset)','ঋণ ক্ষতি সঞ্চিতি (লাভ-ক্ষতি)','liability','control',null),
  ('2400','Salary Payable','বেতন বাক্যবাহী','liability','control',null),
  ('2500','Insurance Claim Payable','বীমা দাবি বাক্যবাহী','liability','control',null),
  ('3100','Members'' Share Capital','সদস্য শেয়ার মূলধন','fund','control',null),
  ('3200','General Fund','সাধারণ তহবিল','fund','control',null),
  ('3300','Dividend Payable','লভ্যাংশ বাক্যবাহী','fund','control',null),
  ('4100','Interest Income','সুদ আয়','income','income',null),
  ('4200','Loan Processing Fee Income','ঋণ প্রক্রিয়াকরণ ফি আয়','income','income',null),
  ('4210','Service Charge Income','সার্ভিস চার্জ আয়','income','income',null),
  ('4220','Insurance Premium Income','বীমা প্রিমিয়াম আয়','income','income',null),
  ('4300','Savings Interest Expense (contra)','সঞ্চয় সুদ ব্যয় (বিপরীত)','income','income',null),
  ('4400','Write-off Recovery Income','অপুনরুদ্ধারযোগ্য ঋণ পুনরুদ্ধার আয়','income','income',null),
  ('4500','Other Income','অন্যান্য আয়','income','income',null),
  ('6100','Salaries & Allowances','বেতন ও ভাতা','expense','expense',null),
  ('6110','Office Rent','অফিস ভাড়া','expense','expense',null),
  ('6120','Utilities & Communication','ইউটিলিটি ও যোগাযোগ','expense','expense',null),
  ('6130','Travel & Conveyance','ভ্রমণ ও যাতায়াত','expense','expense',null),
  ('6200','Loan Write-off Expense','ঋণ লেখা ব্যয়','expense','expense',null),
  ('6210','Write-off Recovery Income (contra)','পুনরুদ্ধার আয় (বিপরীত)','expense','expense',null),
  ('6300','Audit & Legal','নিরীক্ষা ও আইনগত','expense','expense',null),
  ('7100','Loan Loss Provision Expense','ঋণ ক্ষতি সঞ্চিতি ব্যয়','expense','expense',null)
) as d(code, name, name_bn, type, category, parent_code)
where not exists (
  select 1 from gl_accounts g where g.org_id = o.id and g.code = d.code
);

-- ─────────── migrations/0029_accounting_rls.sql ───────────
-- 0029_accounting_rls.sql — RLS for the accounting tables.
-- Reads are org-scoped staff permissions; voucher workflow writes are
-- role-gated (accountant/manager roles); cash-book closing requires
-- branch_manager or above; day-end locked rows stay read-only via triggers.

alter table gl_accounts             enable row level security;
alter table vouchers                enable row level security;
alter table voucher_lines           enable row level security;
alter table voucher_attachments     enable row level security;
alter table journal_postings        enable row level security;
alter table event_journal_mappings  enable row level security;
alter table cash_book_days          enable row level security;
alter table cash_book_lines         enable row level security;
alter table bank_reconciliations    enable row level security;
alter table bank_statement_lines    enable row level security;
alter table petty_cash_accounts     enable row level security;
alter table petty_cash_movements    enable row level security;

-- Reuse helpers from 0002_rls.sql: auth_org_id(), auth_user_role().

-- ── Chart of accounts: all staff read; admins manage ────────────────────────
create policy gl_accounts_read on gl_accounts
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy gl_accounts_write on gl_accounts
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ── Vouchers: staff read; workflow writes gated ─────────────────────────────
create policy vouchers_read on vouchers
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy vouchers_insert on vouchers
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));
create policy vouchers_update on vouchers
  for update using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create policy voucher_lines_read on voucher_lines
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy voucher_lines_write on voucher_lines
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create policy voucher_attachments_read on voucher_attachments
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy voucher_attachments_write on voucher_attachments
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

-- ── Auto-postings + mappings ────────────────────────────────────────────────
create policy journal_postings_read on journal_postings
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy journal_postings_write on journal_postings
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create policy event_mappings_read on event_journal_mappings
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy event_mappings_write on event_journal_mappings
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ── Cash book: staff read; accountant/manager write; close = BM+ ────────────
create policy cash_book_read on cash_book_days
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy cash_book_write on cash_book_days
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

-- cash_book_lines has no org_id column; route the org check through its
-- parent cash_book_days (a bare org_id reference here failed with 42703).
create policy cash_book_lines_read on cash_book_lines
  for select using (
    exists (select 1 from cash_book_days d
            where d.id = cash_book_lines.cash_book_id
              and d.org_id = auth_org_id())
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy cash_book_lines_write on cash_book_lines
  for all using (
    exists (select 1 from cash_book_days d
            where d.id = cash_book_lines.cash_book_id
              and d.org_id = auth_org_id())
    and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (
    exists (select 1 from cash_book_days d
            where d.id = cash_book_lines.cash_book_id
              and d.org_id = auth_org_id())
    and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

-- ── Bank reconciliation ─────────────────────────────────────────────────────
create policy bank_rec_read on bank_reconciliations
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy bank_rec_write on bank_reconciliations
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create policy bank_stmt_read on bank_statement_lines
  for select using (
    exists (select 1 from bank_reconciliations r
            where r.id = bank_statement_lines.reconciliation_id
              and r.org_id = auth_org_id()
              and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')));
create policy bank_stmt_write on bank_statement_lines
  for all using (
    exists (select 1 from bank_reconciliations r
            where r.id = bank_statement_lines.reconciliation_id
              and r.org_id = auth_org_id()
              and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer')))
  with check (
    exists (select 1 from bank_reconciliations r
            where r.id = bank_statement_lines.reconciliation_id
              and r.org_id = auth_org_id()
              and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer')));

-- ── Petty cash ──────────────────────────────────────────────────────────────
create policy petty_accounts_read on petty_cash_accounts
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy petty_accounts_write on petty_cash_accounts
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

create policy petty_movements_read on petty_cash_movements
  for select using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer'));
create policy petty_movements_write on petty_cash_movements
  for insert with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','account_officer'));

-- ─────────── migrations/0030_accounting_ops.sql ───────────
-- 0030_accounting_ops.sql — Accounting requirements 6–10: fund requisitions
-- and inter-branch transfers with matching entries, budget lines, period
-- close, and the savings-restriction guard on voucher lines.

-- ── 6) Fund requisitions / inter-branch transfers ────────────────────────────
create table if not exists fund_requisitions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  kind            text not null check (kind in ('branch_to_ho','ho_to_branch','inter_branch')),
  from_node_id    uuid not null,
  to_node_id      uuid not null,
  amount          numeric(14,2) not null check (amount > 0),
  purpose         text not null,
  status          text not null default 'requested' check (status in ('requested','approved','rejected','disbursed','received')),
  settlement_code varchar(4) not null references gl_accounts(code),
  requested_by    uuid not null,
  decided_by      uuid,
  decided_at      timestamptz,
  out_voucher_id  uuid references vouchers(id),
  in_voucher_id   uuid references vouchers(id),
  note            text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  check (from_node_id <> to_node_id)
);

-- ── 7) Posting rule: savings cannot fund fixed assets or expenses ───────────
-- Mirrors checkVoucherPostingRules() in @samity/shared. A voucher that
-- credits savings (2100/2110) while debiting an expense or a fixed asset is
-- rejected at the DB level too.
create or replace function fn_voucher_savings_rule() returns trigger as $$
declare
  v_voucher   uuid;
  v_savings   numeric(14,2);
  v_line      record;
begin
  v_voucher := coalesce(new.voucher_id, old.voucher_id);
  if v_voucher is null then return coalesce(new, old); end if;

  select coalesce(sum(credit), 0) into v_savings
  from voucher_lines
  where voucher_id = v_voucher and account_code in ('2100','2110');

  if v_savings = 0 then return coalesce(new, old); end if;

  for v_line in
    select vl.account_code, coalesce(ga.type, '') as acc_type
    from voucher_lines vl
    left join gl_accounts ga on ga.code = vl.account_code
    where vl.voucher_id = v_voucher and vl.debit > 0
  loop
    if v_line.acc_type = 'expense' then
      raise exception 'Voucher %: savings cannot fund expenses (savings_to_expense)', v_voucher;
    end if;
    if v_line.account_code in ('1500','1510','1520') then
      raise exception 'Voucher %: savings cannot fund fixed assets (savings_to_fixed_asset)', v_voucher;
    end if;
  end loop;

  return coalesce(new, old);
end;
$$ language plpgsql;

drop trigger if exists trg_voucher_savings_rule on voucher_lines;
create trigger trg_voucher_savings_rule
  after insert or update or delete on voucher_lines
  for each row execute function fn_voucher_savings_rule();

-- ── 8) Budget lines (budget vs actual) ──────────────────────────────────────
create table if not exists gl_budgets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  branch_id     uuid references branches(id),
  account_code  varchar(4) not null references gl_accounts(code),
  period_start  date not null,
  period_end    date not null,
  amount        numeric(14,2) not null check (amount >= 0),
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (org_id, branch_id, account_code, period_start)
);

-- ── 9) Period close ─────────────────────────────────────────────────────────
create table if not exists period_closes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  kind          text not null check (kind in ('monthly','annual')),
  period_start  date not null,
  period_end    date not null,
  closed_by     uuid not null,
  closed_at     timestamptz not null default now(),
  snapshot_json jsonb not null default '{}'::jsonb,
  note          text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (org_id, kind, period_start)
);

-- Once a period is closed, new/approved vouchers inside it are blocked at the
-- DB level. Reopen (delete of the close row) is gated by RLS to Director
-- Finance roles in 0031.
create or replace function fn_period_locked() returns trigger as $$
declare
  v_locked int;
begin
  select count(*) into v_locked
  from period_closes pc
  where pc.deleted_at is null
    and new.voucher_date >= pc.period_start
    and new.voucher_date <= pc.period_end;

  if v_locked > 0 then
    raise exception 'Period containing % is closed; reopen required (Director Finance)', new.voucher_date;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_period_locked on vouchers;
create trigger trg_period_locked
  before insert or update of voucher_date on vouchers
  for each row execute function fn_period_locked();

-- Indexes for the report scans.
create index if not exists idx_vouchers_date_status on vouchers(voucher_date, status) where deleted_at is null;
create index if not exists idx_voucher_lines_account on voucher_lines(account_code);
create index if not exists idx_fund_requisitions_status on fund_requisitions(status) where deleted_at is null;

-- ─────────── migrations/0031_accounting_ops_rls.sql ───────────
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

-- ─────────── migrations/0032_hr.sql ───────────
-- 0032_hr.sql — HR module for a field-heavy workforce.
-- Staff master with encrypted NID/bank (ciphertext columns; masked columns
-- for display), recruitment lite, GPS+selfie attendance, leave with balances,
-- holiday calendar, and transfer/promotion orders.

-- ── 1) Staff master ─────────────────────────────────────────────────────────
create table if not exists hr_staff (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id),
  employee_code     varchar(20) not null,
  name              text not null,
  name_bn           text not null,
  designation       text not null,
  grade             varchar(4) not null,
  branch_id         uuid references branches(id),
  joining_date      date not null,
  probation_end_date date,
  confirmation_date date,
  status            text not null default 'probation' check (status in ('probation','confirmed','suspended','resigned','terminated','retired')),
  mobile            varchar(15) not null,
  email             text,
  nid_enc           text,
  nid_masked        varchar(4),
  bank_account_enc  text,
  bank_name         text,
  bank_masked       varchar(6),
  monthly_gross     numeric(14,2) not null default 0 check (monthly_gross >= 0),
  emergency_contact_name  text,
  emergency_contact_phone text,
  documents         jsonb not null default '[]'::jsonb,
  created_by        uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (org_id, employee_code)
);

create table if not exists hr_staff_postings (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  staff_id       uuid not null references hr_staff(id) on delete cascade,
  branch_id      uuid references branches(id),
  designation    text not null,
  effective_from date not null,
  effective_to   date,
  note           text,
  created_at     timestamptz not null default now()
);

create table if not exists hr_staff_education (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  staff_id      uuid not null references hr_staff(id) on delete cascade,
  level         text not null,
  institution   text not null,
  passing_year  int not null,
  result        varchar(20) not null,
  created_at    timestamptz not null default now()
);

-- ── 2) Recruitment lite ─────────────────────────────────────────────────────
create table if not exists hr_vacancies (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  branch_id     uuid not null references branches(id),
  designation   text not null,
  headcount     int not null check (headcount between 1 and 20),
  reason        text not null,
  status        text not null default 'requested' check (status in ('requested','approved','rejected','closed')),
  requested_by  uuid not null,
  decided_by    uuid,
  decided_at    timestamptz,
  note          text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create table if not exists hr_applicants (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  vacancy_id       uuid not null references hr_vacancies(id),
  name             text not null,
  mobile           varchar(15) not null,
  education_level  text not null,
  experience_years int not null default 0,
  status           text not null default 'applied' check (status in ('applied','shortlisted','interviewed','offered','joined','rejected')),
  interview_scores jsonb not null default '[]'::jsonb,
  offered_salary   numeric(14,2),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── 3) Attendance & leave ───────────────────────────────────────────────────
create table if not exists hr_attendance (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  staff_id        uuid not null references hr_staff(id),
  work_date       date not null,
  status          text not null check (status in ('present','late','absent','leave','holiday')),
  check_in_at     timestamptz,
  check_in_lat    double precision,
  check_in_lng    double precision,
  selfie_path     text,
  distance_meters int,
  mode            text not null check (mode in ('field','office')),
  note            text,
  created_at      timestamptz not null default now(),
  unique (org_id, staff_id, work_date)
);

create table if not exists hr_leave_requests (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  staff_id    uuid not null references hr_staff(id),
  leave_type  text not null check (leave_type in ('casual','sick','annual','maternity')),
  start_date  date not null,
  end_date    date not null,
  days        int not null check (days > 0),
  reason      text not null,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by  uuid,
  decided_at  timestamptz,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists hr_holidays (
  id       uuid primary key default gen_random_uuid(),
  org_id   uuid not null references organizations(id),
  date     date not null,
  name     text not null,
  name_bn  text not null,
  created_at timestamptz not null default now(),
  unique (org_id, date)
);

-- ── 4) Transfer & promotion orders ──────────────────────────────────────────
create table if not exists hr_movements (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id),
  kind              text not null check (kind in ('transfer','promotion')),
  staff_id          uuid not null references hr_staff(id),
  from_branch_id    uuid references branches(id),
  to_branch_id      uuid references branches(id),
  from_designation  text not null,
  to_designation    text not null,
  to_grade          varchar(4),
  new_monthly_gross numeric(14,2),
  effective_date    date not null,
  reason            text not null,
  status            text not null default 'proposed' check (status in ('proposed','approved','rejected','effective')),
  proposed_by       uuid not null,
  approved_by       uuid,
  approved_at       timestamptz,
  order_number      varchar(20),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_hr_staff_branch on hr_staff(branch_id) where deleted_at is null;
create index if not exists idx_hr_attendance_date on hr_attendance(work_date);
create index if not exists idx_hr_leave_status on hr_leave_requests(status) where status = 'pending';

-- ─────────── migrations/0033_hr_rls.sql ───────────
-- 0033_hr_rls.sql — RLS for HR tables. Staff records are org-scoped; NID/bank
-- ciphertext columns are additionally only exposed through the service-role
-- client (see API layer). HR administration is admin-level; supervisors
-- decide leave.

alter table hr_staff            enable row level security;
alter table hr_staff_postings   enable row level security;
alter table hr_staff_education  enable row level security;
alter table hr_vacancies        enable row level security;
alter table hr_applicants       enable row level security;
alter table hr_attendance       enable row level security;
alter table hr_leave_requests   enable row level security;
alter table hr_holidays         enable row level security;
alter table hr_movements        enable row level security;

create policy "hr_staff_read" on hr_staff
  for select using (org_id = auth_org_id());
create policy "hr_staff_write" on hr_staff
  for all using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

create policy "hr_staff_postings_read" on hr_staff_postings
  for select using (org_id = auth_org_id());
create policy "hr_staff_postings_write" on hr_staff_postings
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy "hr_staff_education_read" on hr_staff_education
  for select using (org_id = auth_org_id());
create policy "hr_staff_education_write" on hr_staff_education
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'));

create policy "hr_vacancies_read" on hr_vacancies
  for select using (org_id = auth_org_id());
create policy "hr_vacancies_request" on hr_vacancies
  for insert with check (org_id = auth_org_id());
create policy "hr_vacancies_decide" on hr_vacancies
  for update using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy "hr_applicants_read" on hr_applicants
  for select using (org_id = auth_org_id());
create policy "hr_applicants_write" on hr_applicants
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager','area_manager'));

create policy "hr_attendance_read" on hr_attendance
  for select using (org_id = auth_org_id());
create policy "hr_attendance_write" on hr_attendance
  for insert with check (org_id = auth_org_id());

create policy "hr_leave_read" on hr_leave_requests
  for select using (org_id = auth_org_id());
create policy "hr_leave_request" on hr_leave_requests
  for insert with check (org_id = auth_org_id());
create policy "hr_leave_decide" on hr_leave_requests
  for update using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

create policy "hr_holidays_read" on hr_holidays
  for select using (org_id = auth_org_id());
create policy "hr_holidays_admin" on hr_holidays
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

create policy "hr_movements_read" on hr_movements
  for select using (org_id = auth_org_id());
create policy "hr_movements_write" on hr_movements
  for all using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ─────────── migrations/0034_hr_payroll.sql ───────────
-- 0034_hr_payroll.sql — HR payroll, provident fund, performance, discipline.
-- Money numeric(14,2); periods are YYYY-MM / YYYY strings. All tables follow
-- the standard convention: id uuid, org_id, created_by, created_at, updated_at,
-- deleted_at (soft delete).

-- ── 5) Salary structures (per org + grade) ──────────────────────────────────
create table if not exists salary_structures (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  grade            text not null,
  basic            numeric(14,2) not null check (basic > 0),
  house_rent       numeric(14,2) not null default 0,
  medical          numeric(14,2) not null default 0,
  conveyance       numeric(14,2) not null default 0,
  field_allowance  numeric(14,2) not null default 0,
  pf_employee_rate numeric(6,4) not null default 0.05 check (pf_employee_rate between 0 and 1),
  pf_employer_rate numeric(6,4) not null default 0.05 check (pf_employer_rate between 0 and 1),
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (org_id, grade)
);

-- ── 5) Payroll runs (one per org+period) + lines ────────────────────────────
create table if not exists payroll_runs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  period         text not null check (period ~ '^\d{4}-\d{2}$'),
  status         text not null default 'draft' check (status in ('draft','approved','paid')),
  total_gross    numeric(14,2) not null default 0,
  total_deduction numeric(14,2) not null default 0,
  total_net      numeric(14,2) not null default 0,
  bonus_total    numeric(14,2) not null default 0,
  prepared_by    uuid not null references auth.users(id),
  approved_by    uuid references auth.users(id),
  approved_at    timestamptz,
  paid_at        timestamptz,
  created_by     uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (org_id, period)
);

create table if not exists payroll_lines (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  payroll_id       uuid not null references payroll_runs(id) on delete cascade,
  staff_id         uuid not null references hr_staff(id),
  components       jsonb not null, -- {basic, house_rent, medical, conveyance, field_allowance}
  gross            numeric(14,2) not null,
  deductions       jsonb not null, -- {pf_employee, tax, loan_advance, other}
  total_deduction  numeric(14,2) not null,
  net              numeric(14,2) not null,
  bonus            numeric(14,2) not null default 0,
  working_days     integer not null default 26,
  present_days     integer not null default 0,
  attendance_ratio numeric(6,4) not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (payroll_id, staff_id),
  check (gross >= 0 and total_deduction >= 0 and net >= 0)
);

-- Totals on the run must equal the sum of lines (kept by app + trigger).
create or replace function fn_payroll_totals_check() returns trigger as $$
declare
  v_gross numeric(14,2);
  v_net   numeric(14,2);
begin
  select coalesce(sum(gross + bonus), 0), coalesce(sum(net), 0)
    into v_gross, v_net
    from payroll_lines where payroll_id = new.id and deleted_at is null;
  if new.total_gross <> v_gross or new.total_net <> v_net then
    new.total_gross := v_gross;
    new.total_net := v_net;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_payroll_totals before insert or update on payroll_runs
  for each row execute function fn_payroll_totals_check();

-- Approved/paid runs are immutable.
create or replace function fn_payroll_no_edit_after_approval() returns trigger as $$
begin
  if old.status <> 'draft' then
    raise exception 'approved payroll runs are immutable';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_payroll_immutable before update or delete on payroll_lines
  for each row execute function fn_payroll_no_edit_after_approval();

-- ── 6) PF ledger + gratuity ─────────────────────────────────────────────────
create table if not exists pf_ledger (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  staff_id         uuid not null references hr_staff(id),
  period           text check (period is null or period ~ '^\d{4}-\d{2}$'),
  type             text not null check (type in ('contribution','interest','withdrawal','transfer_out')),
  employee_amount  numeric(14,2) not null default 0,
  employer_amount  numeric(14,2) not null default 0,
  balance_after    numeric(14,2) not null default 0,
  note             text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index if not exists idx_pf_ledger_staff on pf_ledger (org_id, staff_id, created_at);

-- Withdrawals may never overdraw the balance.
create or replace function fn_pf_no_overdraw() returns trigger as $$
declare
  v_balance numeric(14,2);
begin
  select coalesce(sum(employee_amount + employer_amount), 0) into v_balance
    from pf_ledger
   where org_id = new.org_id and staff_id = new.staff_id and deleted_at is null;
  if new.type in ('withdrawal', 'transfer_out') then
    if v_balance < new.employee_amount + new.employer_amount then
      raise exception 'PF withdrawal exceeds balance';
    end if;
  end if;
  new.balance_after := v_balance
    + case when new.type in ('contribution','interest') then new.employee_amount + new.employer_amount
           else -(new.employee_amount + new.employer_amount) end;
  return new;
end;
$$ language plpgsql;

create trigger trg_pf_balance before insert on pf_ledger
  for each row execute function fn_pf_no_overdraw();

create table if not exists gratuity_settlements (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  staff_id      uuid not null references hr_staff(id),
  joining_date  date not null,
  leaving_date  date not null,
  last_basic    numeric(14,2) not null,
  years         integer not null,
  amount        numeric(14,2) not null check (amount >= 0),
  paid_at       timestamptz,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

-- ── 7) KPI scorecards + appraisals ──────────────────────────────────────────
create table if not exists kpi_scorecards (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id),
  staff_id   uuid not null references hr_staff(id),
  period     text not null check (period ~ '^\d{4}-\d{2}$'),
  actuals    jsonb not null, -- {collection_rate, par, new_members, meeting_attendance}
  scores     jsonb not null,
  total_score numeric(6,2) not null,
  grade      text not null check (grade in ('A','B','C','D')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (org_id, staff_id, period)
);

create table if not exists staff_appraisals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  staff_id     uuid not null references hr_staff(id),
  year         text not null check (year ~ '^\d{4}$'),
  scores       jsonb not null,
  comments     text not null default '',
  rating       numeric(6,2) not null,
  status       text not null default 'draft' check (status in ('draft','submitted','reviewed')),
  reviewer_id  uuid references auth.users(id),
  reviewer_note text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (org_id, staff_id, year)
);

-- ── 8) Disciplinary cases (HR + Director only via RLS) ──────────────────────
create table if not exists disciplinary_cases (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  staff_id      uuid not null references hr_staff(id),
  severity      text not null check (severity in ('verbal_warning','written_warning','show_cause','suspension','termination')),
  incident_date date not null,
  description   text not null,
  status        text not null default 'open' check (status in ('open','explained','closed')),
  explanation   text,
  outcome       text,
  raised_by     uuid not null references auth.users(id),
  closed_by     uuid references auth.users(id),
  closed_at     timestamptz,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index if not exists idx_discipline_staff on disciplinary_cases (org_id, staff_id);

-- ── Report indexes ──────────────────────────────────────────────────────────
create index if not exists idx_payroll_lines_org on payroll_lines (org_id, payroll_id);

-- ─────────── migrations/0035_hr_payroll_rls.sql ───────────
-- 0035_hr_payroll_rls.sql — RLS for payroll, PF, performance and discipline.
-- Staff see only their own rows (self-service, req 9); staff-facing HR data is
-- readable by any staff-permission role; disciplinary cases are restricted to
-- HR/Director-level roles (super_admin / org_admin).

-- Reuse helpers from 0002_rls.sql: auth_org_id(), auth_user_role().

-- ── Salary structures ───────────────────────────────────────────────────────
alter table salary_structures enable row level security;
create policy "salary_structures_read" on salary_structures
  for select to authenticated
  using (org_id = auth_org_id());
create policy "salary_structures_admin" on salary_structures
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ── Payroll: staff see their own lines; staff roles manage runs ─────────────
alter table payroll_runs enable row level security;
create policy "payroll_runs_read" on payroll_runs
  for select to authenticated
  using (org_id = auth_org_id());
create policy "payroll_runs_write" on payroll_runs
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'));

alter table payroll_lines enable row level security;
create policy "payroll_lines_read_own" on payroll_lines
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      staff_id::text = auth.uid()::text
      or auth_user_role() in ('super_admin','org_admin','branch_manager','area_manager')
    )
  );

-- ── PF ledger: staff see their own ledger; finance manages ─────────────────
alter table pf_ledger enable row level security;
create policy "pf_ledger_read_own" on pf_ledger
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      staff_id::text = auth.uid()::text
      or auth_user_role() in ('super_admin','org_admin','branch_manager')
    )
  );
create policy "pf_ledger_write" on pf_ledger
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

alter table gratuity_settlements enable row level security;
create policy "gratuity_read" on gratuity_settlements
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      staff_id::text = auth.uid()::text
      or auth_user_role() in ('super_admin','org_admin','branch_manager')
    )
  );
create policy "gratuity_write" on gratuity_settlements
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ── KPI + appraisal: own rows or staff-capable roles ────────────────────────
alter table kpi_scorecards enable row level security;
create policy "kpi_read" on kpi_scorecards
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      staff_id::text = auth.uid()::text
      or auth_user_role() in ('super_admin','org_admin','branch_manager','area_manager')
    )
  );
create policy "kpi_write" on kpi_scorecards
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'));

alter table staff_appraisals enable row level security;
create policy "appraisal_read" on staff_appraisals
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      staff_id::text = auth.uid()::text
      or auth_user_role() in ('super_admin','org_admin','branch_manager','area_manager')
    )
  );
create policy "appraisal_write" on staff_appraisals
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin','branch_manager'));

-- ── Disciplinary: HR/Director only (super_admin / org_admin) ────────────────
alter table disciplinary_cases enable row level security;
create policy "discipline_read" on disciplinary_cases
  for select to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));
create policy "discipline_write" on disciplinary_cases
  for all to authenticated
  using (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'))
  with check (org_id = auth_org_id() and auth_user_role() in ('super_admin','org_admin'));

-- ─────────── migrations/0036_work.sql ───────────
-- 0036_work.sql — Work Distribution, Supervision & Internal Audit.
-- Tasks (with comments as jsonb), auto-source dedupe, monthly target cascade
-- (area → branch → officer) and delegation history. Convention: id uuid,
-- org_id, created_by, created_at, updated_at, deleted_at (soft delete).

-- ── 1) Tasks ────────────────────────────────────────────────────────────────
create table if not exists work_tasks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  branch_id      uuid references branches(id),
  type           text not null check (type in ('overdue_followup','utilization_visit','meeting_due','kyc_pending','report_submission','cash_count','manual')),
  title          text not null check (length(btrim(title)) between 3 and 160),
  description    text not null default '',
  assignee_id    uuid not null,
  assignee_name  text not null,
  assigner_id    uuid not null,
  assigner_name  text not null,
  due_date       date not null,
  priority       text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  link_kind      text not null default 'other' check (link_kind in ('member','loan','samity','branch','other')),
  link_id        uuid,
  link_label     text not null default '',
  status         text not null default 'todo' check (status in ('todo','in_progress','blocked','done','verified')),
  comments       jsonb not null default '[]'::jsonb,
  attachments    text[] not null default '{}',
  auto_key       text,
  completed_at   timestamptz,
  verified_at    timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index if not exists idx_work_tasks_assignee on work_tasks(org_id, assignee_id, status);
create index if not exists idx_work_tasks_branch   on work_tasks(org_id, branch_id, status);
create index if not exists idx_work_tasks_due      on work_tasks(org_id, due_date) where status not in ('done','verified');
-- One open auto task per source+link event:
create unique index if not exists uq_work_tasks_auto_open
  on work_tasks(org_id, auto_key) where auto_key is not null and status not in ('done','verified');

-- Status flow guard: todo → in_progress/blocked → done → verified, reopen
-- from done, nothing leaves verified.
create or replace function fn_work_task_transition_guard()
returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if old.status = 'todo' and new.status in ('in_progress','blocked') then return new; end if;
  if old.status = 'in_progress' and new.status in ('done','blocked') then return new; end if;
  if old.status = 'blocked' and new.status = 'in_progress' then return new; end if;
  if old.status = 'done' and new.status in ('verified','in_progress') then return new; end if;
  raise exception 'Invalid task status transition % -> %', old.status, new.status using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_work_task_transition on work_tasks;
create trigger trg_work_task_transition
  before update of status on work_tasks
  for each row execute function fn_work_task_transition_guard();

-- ── 2) Delegation history ───────────────────────────────────────────────────
create table if not exists task_delegations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  task_id       uuid references work_tasks(id) on delete cascade,
  from_staff_id uuid not null,
  to_staff_id   uuid not null,
  reason        text not null default 'workload' check (reason in ('leave','transfer','workload','other')),
  note          text not null default '',
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_task_delegations_from on task_delegations(org_id, from_staff_id, created_at);

-- ── 3) Monthly targets (area → branch → officer cascade) ───────────────────
create table if not exists work_targets (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  scope          text not null check (scope in ('area','branch','officer')),
  owner_branch_id uuid references branches(id),
  owner_staff_id uuid,
  owner_name     text not null,
  parent_id      uuid references work_targets(id),
  period         text not null check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  new_members    integer not null default 0 check (new_members >= 0),
  disbursement   numeric(14,2) not null default 0 check (disbursement >= 0),
  collection     numeric(14,2) not null default 0 check (collection >= 0),
  savings        numeric(14,2) not null default 0 check (savings >= 0),
  par_limit      numeric(5,1) not null default 0 check (par_limit between 0 and 100),
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- Inline UNIQUE constraints cannot contain expressions (coalesce on nullable
-- owner columns here); an expression unique index is the PostgreSQL-correct
-- equivalent.
create unique index if not exists uq_work_targets_scope_owner_period
  on work_targets (
    org_id, scope,
    coalesce(owner_branch_id::text, '-'),
    coalesce(owner_staff_id::text, '-'),
    period
  );

create index if not exists idx_work_targets_period on work_targets(org_id, period, scope);

-- Officer splits must not exceed the parent branch target (money + counts;
-- PAR is a ceiling, not additive).
create or replace function fn_target_split_guard()
returns trigger language plpgsql as $$
declare
  parent record;
  sibling_sum record;
begin
  if new.scope <> 'officer' or new.parent_id is null then return new; end if;
  select * into parent from work_targets
    where id = new.parent_id and org_id = new.org_id and scope = 'branch';
  if not found then
    raise exception 'Parent branch target not found' using errcode = 'foreign_key_violation';
  end if;

  select coalesce(sum(new_members),0) as new_members,
         coalesce(sum(disbursement),0) as disbursement,
         coalesce(sum(collection),0) as collection,
         coalesce(sum(savings),0) as savings
    into sibling_sum
    from work_targets
    where org_id = new.org_id and parent_id = new.parent_id and scope = 'officer'
      and id <> new.id and deleted_at is null;

  if (coalesce(sibling_sum.new_members,0) + new.new_members) > parent.new_members
     or (coalesce(sibling_sum.disbursement,0) + new.disbursement) > parent.disbursement + 0.001
     or (coalesce(sibling_sum.collection,0) + new.collection) > parent.collection + 0.001
     or (coalesce(sibling_sum.savings,0) + new.savings) > parent.savings + 0.001 then
    raise exception 'Officer splits exceed the branch target' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_target_split on work_targets;
create trigger trg_target_split
  before insert or update of new_members, disbursement, collection, savings on work_targets
  for each row execute function fn_target_split_guard();

-- ─────────── migrations/0037_work_rls.sql ───────────
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

-- ─────────── migrations/0038_work_audit.sql ───────────
-- 0038_work_audit.sql — Supervision forms, internal audit, findings, escalations.
-- Standard convention: id uuid, org_id, branch_id where relevant, created_by,
-- created_at, updated_at, deleted_at (soft delete). Money numeric(14,2) BDT;
-- dates UTC; displayed Asia/Dhaka.

-- ── 5) Supervision submissions (mobile: photos + GPS) ───────────────────────
create table if not exists supervision_submissions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  form_type       text not null check (form_type in
    ('center_visit','branch_inspection','passbook_verification','cash_verification','loan_utilization')),
  link_id         uuid,
  link_label      text not null default '',
  submitted_by    uuid not null,
  submitted_name  text not null default '',
  submitted_at    timestamptz not null default now(),
  lat             double precision,
  lng             double precision,
  distance_meters double precision,
  photos          text[] not null default '{}',
  items           jsonb not null default '[]'::jsonb,
  exceptions      integer not null default 0,
  note            text not null default '',
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists idx_supervision_branch_date on supervision_submissions (org_id, branch_id, submitted_at);

-- Exceptions must match the answered rows (defense in depth for the register).
create or replace function fn_supervision_exceptions() returns trigger as $$
declare
  no_count integer;
begin
  select count(*) into no_count
  from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) it
  where it->>'answer' = 'no';
  new.exceptions := no_count;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_supervision_exceptions on supervision_submissions;
create trigger trg_supervision_exceptions
  before insert or update on supervision_submissions
  for each row execute function fn_supervision_exceptions();

-- ── 6) Internal audit: plans and findings ───────────────────────────────────
create table if not exists audit_plans (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  branch_id        uuid not null references branches(id),
  branch_name      text not null default '',
  title            text not null,
  planned_date     date not null,
  lead_auditor_id  uuid not null,
  lead_auditor_name text not null default '',
  status           text not null default 'planned' check (status in ('planned','in_progress','draft_report','closed')),
  loan_sample      uuid[] not null default '{}',
  member_sample    uuid[] not null default '{}',
  sample_size      integer not null default 10 check (sample_size between 1 and 200),
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);
create index if not exists idx_audit_plans_branch on audit_plans (org_id, branch_id, planned_date);

create table if not exists audit_findings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id),
  audit_id      uuid not null references audit_plans(id) on delete cascade,
  ref           text not null default '',
  title         text not null,
  detail        text not null default '',
  severity      text not null check (severity in ('low','medium','high','critical')),
  status        text not null default 'open' check (status in ('open','responded','in_followup','closed')),
  response      text not null default '',
  responded_at  timestamptz,
  deadline      date,
  follow_ups    jsonb not null default '[]'::jsonb,
  closed_at     timestamptz,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_findings_audit on audit_findings (org_id, audit_id, status);

-- Severity SLA: deadline defaults to response_days(severity) after creation.
create or replace function fn_finding_sla() returns trigger as $$
declare
  sla_days integer;
begin
  if new.deadline is null then
    sla_days := case new.severity
      when 'critical' then 7 when 'high' then 14 when 'medium' then 21 else 30 end;
    new.deadline := (current_date + sla_days);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_finding_sla on audit_findings;
create trigger trg_finding_sla
  before insert on audit_findings
  for each row execute function fn_finding_sla();

-- Closed findings keep closed_at in sync and never reopen (shared rule).
create or replace function fn_finding_closed_guard() returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    if old.status = 'closed' and new.status <> 'closed' then
      raise exception 'বন্ধ ফাইন্ডিং আর খোলা যাবে না / A closed finding cannot reopen';
    end if;
    if new.status = 'closed' and old.status <> 'closed' then
      new.closed_at := now();
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_finding_closed_guard on audit_findings;
create trigger trg_finding_closed_guard
  before update on audit_findings
  for each row execute function fn_finding_closed_guard();

-- ── 8) Escalation ledger (what escalated, when, to whom) ────────────────────
create table if not exists work_escalations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  entity_type    text not null check (entity_type in ('task','finding')),
  entity_id      uuid not null,
  days_overdue   integer not null check (days_overdue >= 0),
  tier_role      text not null check (tier_role in ('branch_manager','area_manager','org_admin')),
  escalated_at   timestamptz not null default now(),
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (entity_type, entity_id, tier_role)
);

-- ── 9) Daily digests (rendered per role; audit trail of what was sent) ──────
create table if not exists work_digests (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id),
  role         text not null,
  digest_date  date not null,
  payload      jsonb not null default '{}'::jsonb,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (org_id, role, digest_date)
);

-- ─────────── migrations/0039_work_audit_rls.sql ───────────
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

-- ─────────── migrations/0040_insurance_welfare.sql ───────────
-- 0040_insurance_welfare.sql — Credit life, micro-insurance, member welfare
-- and staff benevolent funds. Standard convention: id uuid, org_id, branch_id,
-- created_by, created_at, updated_at, deleted_at. Money numeric(14,2) BDT.

-- ── 1) Credit life policies (issued at disbursement) ────────────────────────
create table if not exists credit_life_policies (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id),
  branch_id        uuid not null references branches(id),
  application_id   uuid not null,
  loan_number      text not null,
  member_id        uuid not null,
  member_name      text not null,
  premium_rate_pct numeric(5,2) not null default 1.00,
  premium_amount   numeric(14,2) not null,
  principal        numeric(14,2) not null,
  coverage_amount  numeric(14,2) not null,
  start_date       date not null,
  end_date         date not null,
  nominee_name     text not null,
  nominee_relation text not null,
  nominee_phone    text,
  status           text not null default 'active' check (status in ('active','claimed','expired')),
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  unique (application_id)
);

-- ── Insurance claims (death + micro kinds), one row per claim ───────────────
create table if not exists insurance_claims (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  policy_id       uuid not null, -- credit_life_policies or micro_enrollments
  claim_no        text not null unique,
  kind            text not null check (kind in ('death','cattle','crop','health')),
  member_id       uuid not null,
  member_name     text not null,
  event_date      date not null,
  reported_date   date not null default current_date,
  cause           text not null default '',
  documents       jsonb not null default '[]'::jsonb,
  assessment_note text not null default '',
  claimed_amount  numeric(14,2) not null,
  approved_amount numeric(14,2),
  settlement_mode text check (settlement_mode in ('payout','waiver')),
  status          text not null default 'submitted' check (status in
    ('submitted','bm_review','am_review','ho_review','approved','paid','rejected')),
  decision_note   text not null default '',
  decided_at      timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists idx_claims_branch on insurance_claims (org_id, branch_id, status);

-- Claim ladder may not skip levels (defense in depth for the shared engine).
create or replace function fn_claim_flow() returns trigger as $$
declare
  allowed text[] := case old.status
    when 'submitted' then array['bm_review','rejected']
    when 'bm_review' then array['am_review','rejected']
    when 'am_review' then array['ho_review','rejected']
    when 'ho_review' then array['approved','rejected']
    when 'approved'  then array['paid']
    else array[]::text[] end;
begin
  if new.status <> old.status and not (new.status = any(allowed)) then
    raise exception 'অবৈধ দাবি অবস্থান্তর % → %', old.status, new.status;
  end if;
  -- Death claims may not leave submitted without the required docs.
  if old.kind = 'death' and old.status = 'submitted' and new.status <> 'submitted' and new.status <> 'rejected' then
    declare doc_ids text[];
    begin
      select coalesce(jsonb_agg(d->>'id'), '{}') into doc_ids from jsonb_array_elements(new.documents) d;
      if not (doc_ids @> array['death_certificate','nominee_nid','nominee_proof']) then
        raise exception 'মৃত্যু দাবির প্রয়োজনীয় নথি অসম্পূর্ণ / Required death-claim documents missing';
      end if;
    end;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_claim_flow on insurance_claims;
create trigger trg_claim_flow
  before update on insurance_claims
  for each row execute function fn_claim_flow();

-- ── 2) Micro-insurance products and enrollments ─────────────────────────────
create table if not exists micro_insurance_products (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  kind           text not null check (kind in ('cattle','crop','health')),
  name_bn        text not null,
  annual_premium numeric(14,2) not null check (annual_premium >= 0),
  coverage_limit numeric(14,2) not null check (coverage_limit >= 0),
  units          integer not null default 1 check (units between 1 and 50),
  active         boolean not null default true,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create table if not exists micro_enrollments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  branch_id      uuid not null references branches(id),
  product_id     uuid not null references micro_insurance_products(id),
  kind           text not null check (kind in ('cattle','crop','health')),
  member_id      uuid not null,
  member_name    text not null,
  units          integer not null default 1 check (units between 1 and 20),
  subject_ref    text not null default '',
  annual_premium numeric(14,2) not null,
  coverage_limit numeric(14,2) not null,
  start_date     date not null,
  end_date       date not null,
  status         text not null default 'active' check (status in ('active','claimed','expired')),
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- ── 3) Welfare fund rules and requests (member + staff) ─────────────────────
create table if not exists welfare_fund_rules (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) unique,
  monthly_contribution numeric(14,2) not null default 10.00,
  staff_contribution  numeric(14,2) not null default 50.00,
  grant_cap_bdt       numeric(14,2) not null default 5000,
  loan_cap_bdt        numeric(14,2) not null default 20000,
  loan_term_months    integer not null default 10 check (loan_term_months between 1 and 36),
  bm_approval_up_to   numeric(14,2) not null default 3000,
  am_approval_up_to   numeric(14,2) not null default 10000,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists welfare_requests (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  fund            text not null check (fund in ('member','staff')),
  request_no      text not null unique,
  requester_id    uuid not null,
  requester_name  text not null,
  kind            text not null check (kind in ('illness','funeral','flood','disaster','education')),
  type            text not null check (type in ('grant','interest_free_loan')),
  amount          numeric(14,2) not null check (amount >= 0),
  reason          text not null,
  photos          text[] not null default '{}',
  status          text not null default 'submitted' check (status in
    ('submitted','bm_review','am_review','approved','rejected','disbursed')),
  decision_note   text not null default '',
  decided_at      timestamptz,
  disbursed_at    timestamptz,
  repayment_months integer,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists idx_welfare_branch on welfare_requests (org_id, branch_id, status);

-- Grant/loan caps enforced in the DB as well.
create or replace function fn_welfare_cap() returns trigger as $$
declare
  cap numeric(14,2);
  fund_row welfare_fund_rules%rowtype;
begin
  select * into fund_row from welfare_fund_rules where org_id = new.org_id;
  cap := case when new.type = 'grant' then coalesce(fund_row.grant_cap_bdt, 5000) else coalesce(fund_row.loan_cap_bdt, 20000) end;
  if new.amount > cap then
    raise exception 'কল্যাণ সীমা ছাড়িয়েছে / Welfare cap exceeded (max %)', cap;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_welfare_cap on welfare_requests;
create trigger trg_welfare_cap
  before insert on welfare_requests
  for each row execute function fn_welfare_cap();

-- ── Fund ledger: contributions in, grants/claims out ────────────────────────
create table if not exists welfare_ledger (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id),
  branch_id   uuid references branches(id),
  fund        text not null check (fund in ('member_welfare','staff_benevolent','insurance')),
  entry_type  text not null check (entry_type in
    ('contribution','premium','grant','loan_disbursed','loan_repaid','claim_paid','claim_waiver','adjustment')),
  ref_type    text,
  ref_id      uuid,
  amount      numeric(14,2) not null,
  memo        text not null default '',
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists idx_welfare_ledger on welfare_ledger (org_id, fund, created_at);

-- ─────────── migrations/0041_insurance_welfare_rls.sql ───────────
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

-- ─────────── migrations/0042_coop_governance.sql ───────────
-- 0042_coop_governance.sql — Dividend & surplus distribution, AGM records and
-- member exit settlement (req 5–7). Money numeric(14,2) BDT, standard columns.

-- ── 5) Dividend distributions (one row per fiscal year) ─────────────────────
create table if not exists dividend_distributions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) unique,
  fiscal_year     text not null,
  surplus         numeric(14,2) not null check (surplus >= 0),
  reserve_pct     numeric(5,2) not null default 25.00 check (reserve_pct between 0 and 100),
  reserve_amount  numeric(14,2) not null default 0,
  rate_pct        numeric(5,2) not null default 8.00,
  pool_amount     numeric(14,2) not null default 0,
  total_weighted  numeric(12,2) not null default 0,
  agm_meeting_id  uuid,
  status          text not null default 'computed' check (status in ('computed','agm_approved','posted','paid')),
  declared_by     uuid,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists dividend_lines (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id),
  distribution_id uuid not null references dividend_distributions(id) on delete cascade,
  member_id      uuid not null,
  member_name    text not null,
  shares         integer not null default 0,
  months_held    integer not null default 12 check (months_held between 0 and 12),
  weighted_shares numeric(12,2) not null default 0,
  weight_pct     numeric(6,3) not null default 0,
  amount         numeric(14,2) not null default 0,
  destination    text not null default 'savings' check (destination in ('savings','cash')),
  paid_at        timestamptz,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_dividend_lines on dividend_lines (org_id, distribution_id);

-- Dividend status machine: computed → agm_approved → posted → paid.
create or replace function fn_dividend_flow() returns trigger as $$
declare
  allowed text[] := case old.status
    when 'computed' then array['agm_approved']
    when 'agm_approved' then array['posted']
    when 'posted' then array['paid']
    else array[]::text[] end;
begin
  if new.status <> old.status and not (new.status = any(allowed)) then
    raise exception 'অবৈধ লভ্যাংশ অবস্থান্তর % → %', old.status, new.status;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_dividend_flow on dividend_distributions;
create trigger trg_dividend_flow
  before update on dividend_distributions
  for each row execute function fn_dividend_flow();

-- ── 6) AGM records ──────────────────────────────────────────────────────────
create table if not exists agm_records (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  fiscal_year     text not null,
  meeting_date    date not null,
  venue           text not null,
  notice_date     date,
  notice_days     integer not null default 14 check (notice_days between 7 and 60),
  agenda          jsonb not null default '[]'::jsonb,
  attendance      jsonb not null default '[]'::jsonb,
  quorum_required integer not null default 10,
  resolutions     jsonb not null default '[]'::jsonb,
  elections       jsonb not null default '[]'::jsonb,
  minutes_bn      text not null default '',
  approved_by     uuid,
  status          text not null default 'draft' check (status in ('draft','notice_issued','held','minutes_approved')),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, fiscal_year)
);

-- AGM flow: draft → notice_issued → held → minutes_approved.
create or replace function fn_agm_flow() returns trigger as $$
declare
  allowed text[] := case old.status
    when 'draft' then array['notice_issued']
    when 'notice_issued' then array['held']
    when 'held' then array['minutes_approved']
    else array[]::text[] end;
begin
  if new.status <> old.status and not (new.status = any(allowed)) then
    raise exception 'অবৈধ সভা অবস্থান্তর % → %', old.status, new.status;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_agm_flow on agm_records;
create trigger trg_agm_flow
  before update on agm_records
  for each row execute function fn_agm_flow();

-- ── 7) Member exit settlements ──────────────────────────────────────────────
create table if not exists member_exits (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id),
  branch_id       uuid not null references branches(id),
  member_id       uuid not null,
  member_name     text not null,
  request_date    date not null,
  exit_no         text not null unique,
  savings_balance numeric(14,2) not null default 0,
  share_value     numeric(14,2) not null default 0,
  dividend_due    numeric(14,2) not null default 0,
  welfare_balance numeric(14,2) not null default 0,
  dues_outstanding numeric(14,2) not null default 0,
  net_payable     numeric(14,2) not null default 0,
  lines           jsonb not null default '[]'::jsonb,
  status          text not null default 'requested' check (status in ('requested','computed','approved','settled','rejected')),
  decision_note   text not null default '',
  settled_at      timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_member_exits on member_exits (org_id, branch_id, status);

-- Exit flow: requested → computed → approved → settled; reject from requested/computed.
create or replace function fn_exit_flow() returns trigger as $$
declare
  allowed text[] := case old.status
    when 'requested' then array['computed','rejected']
    when 'computed' then array['approved','rejected']
    when 'approved' then array['settled']
    else array[]::text[] end;
begin
  if new.status <> old.status and not (new.status = any(allowed)) then
    raise exception 'অবৈধ নিষ্পত্তি অবস্থান্তর % → %', old.status, new.status;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_exit_flow on member_exits;
create trigger trg_exit_flow
  before update on member_exits
  for each row execute function fn_exit_flow();

-- Settlement cannot be paid below zero after dues adjustment.
create or replace function fn_exit_net() returns trigger as $$
begin
  new.net_payable := greatest(
    0,
    coalesce(new.savings_balance, 0) + coalesce(new.share_value, 0)
      + coalesce(new.dividend_due, 0) + coalesce(new.welfare_balance, 0)
      - coalesce(new.dues_outstanding, 0)
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_exit_net on member_exits;
create trigger trg_exit_net
  before insert or update on member_exits
  for each row execute function fn_exit_net();

-- ─────────── migrations/0043_coop_governance_rls.sql ───────────
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

-- ─────────── migrations/0044_programs.sql ───────────
-- 0044_programs.sql — Programs & projects (NGO development sector).
-- Project register, logframe + indicator values, beneficiary registry,
-- enrollments, service delivery, activity planner, training batches with
-- attendance, test scores and certificates. Money is numeric(14,2) text.

-- ── 1) Project register ─────────────────────────────────────────────────────
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid references branches(id),
  code text not null,
  name_bn text not null,
  name_en text not null,
  donor text not null,
  grant_agreement_no text not null,
  -- Restricted fund code; voucher lines tagged with it feed Module 10 fund statements.
  fund_code text not null,
  sector text not null check (sector in ('education','health','skills_training','agriculture','wash','child_protection','awareness')),
  start_date date not null,
  end_date date not null,
  target_areas jsonb not null default '[]'::jsonb,
  target_beneficiaries integer not null default 0 check (target_beneficiaries >= 0),
  manager_name text not null,
  status text not null default 'proposed' check (status in ('proposed','active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists project_budget_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  line_item text not null,
  amount numeric(14,2) not null check (amount >= 0),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_budget_lines_project on project_budget_lines (org_id, project_id);

-- ── 2) Logframe ─────────────────────────────────────────────────────────────
create table if not exists logframe_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  level text not null check (level in ('goal','objective','output','indicator')),
  statement text not null,
  parent_label text,
  indicator_code text,
  baseline text not null default '0',
  target_value text not null default '0',
  unit text,
  means_of_verification text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_logframe_project on logframe_entries (org_id, project_id);

create table if not exists indicator_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  entry_id uuid not null references logframe_entries(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  value text not null,
  evidence jsonb not null default '[]'::jsonb,
  note text not null default '',
  entered_at timestamptz not null default now()
);
create index if not exists idx_indicator_values_entry on indicator_values (org_id, entry_id);

-- ── 3) Beneficiaries, enrollments, services ─────────────────────────────────
create table if not exists beneficiaries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid references branches(id),
  code text not null,
  member_id uuid references members(id),
  name_bn text not null,
  guardian_bn text not null default '',
  phone text not null default '',
  age integer not null default 0 check (age between 0 and 120),
  gender text not null default 'female' check (gender in ('male','female','other')),
  village text not null default '',
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists program_enrollments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  beneficiary_id uuid not null references beneficiaries(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  enrolled_at date not null default current_date,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (beneficiary_id, project_id)
);

create table if not exists program_services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id),
  beneficiary_id uuid not null references beneficiaries(id),
  kind text not null check (kind in ('training','health_camp','school_enrollment','kit_distribution','awareness_session')),
  service_date date not null,
  details text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_services_beneficiary on program_services (org_id, beneficiary_id);
create index if not exists idx_services_project on program_services (org_id, project_id);

-- ── 4) Activities, batches, attendance, scores, certificates ────────────────
create table if not exists program_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  title_bn text not null,
  kind text not null check (kind in ('training','health_camp','school_enrollment','kit_distribution','awareness_session')),
  planned_date date not null,
  venue text not null default '',
  target_participants integer not null default 0,
  status text not null default 'planned' check (status in ('planned','done','cancelled')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists idx_activities_project_date on program_activities (org_id, project_id, planned_date);

create table if not exists training_batches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id),
  code text not null,
  title_bn text not null,
  trainer_name text not null,
  trainer_org_bn text not null default '',
  start_date date not null,
  end_date date not null,
  hours integer not null default 6 check (hours between 1 and 400),
  sessions integer not null default 1 check (sessions between 1 and 60),
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists training_attendance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  batch_id uuid not null references training_batches(id) on delete cascade,
  beneficiary_id uuid not null references beneficiaries(id) on delete cascade,
  session_no integer not null check (session_no between 1 and 60),
  present boolean not null default true,
  created_at timestamptz not null default now(),
  unique (batch_id, beneficiary_id, session_no)
);

create table if not exists training_test_scores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  batch_id uuid not null references training_batches(id) on delete cascade,
  beneficiary_id uuid not null references beneficiaries(id) on delete cascade,
  pre numeric(5,2) not null check (pre between 0 and 100),
  post numeric(5,2) not null check (post between 0 and 100),
  created_at timestamptz not null default now(),
  unique (batch_id, beneficiary_id)
);

create table if not exists training_certificates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  cert_no text not null,
  batch_id uuid not null references training_batches(id) on delete cascade,
  beneficiary_id uuid not null references beneficiaries(id) on delete cascade,
  issued_at timestamptz not null default now(),
  unique (org_id, cert_no)
);

-- ── Sequence helpers ─────────────────────────────────────────────────────────
create or replace function next_project_seq(p_org_id uuid, p_prefix text)
returns integer language sql as $$
  select count(*)::int + 1 from projects
  where org_id = p_org_id and code like p_prefix || '-%';
$$;

create or replace function next_beneficiary_seq(p_org_id uuid)
returns integer language sql as $$
  select count(*)::int + 1 from beneficiaries where org_id = p_org_id;
$$;

-- ── Project status state machine (trigger-enforced) ─────────────────────────
create or replace function fn_project_flow()
returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  allowed := case new.status
    when 'proposed' then array['active','closed']
    when 'active'   then array['suspended','closed']
    when 'suspended' then array['active','closed']
    when 'closed'   then array[]::text[]
  end;
  if old.status is distinct from new.status and not (new.status = any(allowed)) then
    raise exception 'INVALID_PROJECT_TRANSITION % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_project_flow on projects;
create trigger trg_project_flow before update on projects
  for each row execute function fn_project_flow();

-- ── Activity status state machine ────────────────────────────────────────────
create or replace function fn_activity_flow()
returns trigger language plpgsql as $$
begin
  if old.status is distinct from new.status then
    if old.status = 'planned' and new.status not in ('done','cancelled') then
      raise exception 'INVALID_ACTIVITY_TRANSITION planned -> %', new.status
        using errcode = 'check_violation';
    elsif old.status in ('done','cancelled') then
      raise exception 'INVALID_ACTIVITY_TRANSITION % is terminal', old.status
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activity_flow on program_activities;
create trigger trg_activity_flow before update on program_activities
  for each row execute function fn_activity_flow();

-- ── Certificates require attendance + passing post-test ─────────────────────
create or replace function fn_certificate_guard()
returns trigger language plpgsql as $$
declare
  v_marks integer;
  v_present integer;
  v_post numeric;
  v_pre numeric;
begin
  select count(*), coalesce(sum(case when present then 1 else 0 end), 0)
    into v_marks, v_present
  from training_attendance
  where batch_id = new.batch_id and beneficiary_id = new.beneficiary_id;

  if v_marks = 0 or v_present < ceil(v_marks * 0.6) then
    -- a literal % in a RAISE format string must be doubled (%%), or PL/pgSQL
    -- parses it as a parameter placeholder ("too few parameters for RAISE").
    raise exception 'CERTIFICATE_REQUIRES_ATTENDANCE (>=60%%)'
      using errcode = 'check_violation';
  end if;

  select pre, post into v_pre, v_post
  from training_test_scores
  where batch_id = new.batch_id and beneficiary_id = new.beneficiary_id;

  if v_post is null or v_post < 40 then
    raise exception 'CERTIFICATE_REQUIRES_POST_TEST_MIN_40'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_certificate_guard on training_certificates;
create trigger trg_certificate_guard before insert on training_certificates
  for each row execute function fn_certificate_guard();

-- Duplicate certificate guard
create or replace function fn_certificate_unique_ben()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from training_certificates
    where org_id = new.org_id and batch_id = new.batch_id and beneficiary_id = new.beneficiary_id
  ) then
    raise exception 'CERTIFICATE_ALREADY_ISSUED'
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_certificate_unique_ben on training_certificates;
create trigger trg_certificate_unique_ben before insert on training_certificates
  for each row execute function fn_certificate_unique_ben();

-- ─────────── migrations/0045_programs_rls.sql ───────────
-- 0045_programs_rls.sql — RLS for programs & projects tables.
-- Staff read org-scoped; project/logframe/activity/batch writes are
-- program-manager-level (admins + manager/officer roles); beneficiaries and
-- service records are writable by all field staff; indicator values are
-- evidence-tracked writes.

alter table projects               enable row level security;
alter table project_budget_lines   enable row level security;
alter table logframe_entries       enable row level security;
alter table indicator_values       enable row level security;
alter table beneficiaries          enable row level security;
alter table program_enrollments    enable row level security;
alter table program_services       enable row level security;
alter table program_activities     enable row level security;
alter table training_batches       enable row level security;
alter table training_attendance    enable row level security;
alter table training_test_scores   enable row level security;
alter table training_certificates  enable row level security;

-- ── Projects: staff read; admins/program roles manage ───────────────────────
create policy "projects_read" on projects
  for select to authenticated
  using (org_id = auth_org_id());

create policy "projects_manage" on projects
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

create policy "budget_lines_read" on project_budget_lines
  for select to authenticated
  using (org_id = auth_org_id());

create policy "budget_lines_manage" on project_budget_lines
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ── Logframe: staff read; program roles author, all staff add values ────────
create policy "logframe_read" on logframe_entries
  for select to authenticated
  using (org_id = auth_org_id());

create policy "logframe_manage" on logframe_entries
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

create policy "indicator_values_read" on indicator_values
  for select to authenticated
  using (org_id = auth_org_id());

create policy "indicator_values_write" on indicator_values
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

-- ── Beneficiaries & services: all field staff write ──────────────────────────
create policy "beneficiaries_read" on beneficiaries
  for select to authenticated
  using (org_id = auth_org_id());

create policy "beneficiaries_write" on beneficiaries
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

create policy "enrollments_read" on program_enrollments
  for select to authenticated
  using (org_id = auth_org_id());

create policy "enrollments_write" on program_enrollments
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

create policy "services_read" on program_services
  for select to authenticated
  using (org_id = auth_org_id());

create policy "services_write" on program_services
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

-- ── Activities & batches: program roles manage; staff read ──────────────────
create policy "activities_read" on program_activities
  for select to authenticated
  using (org_id = auth_org_id());

create policy "activities_write" on program_activities
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

create policy "batches_read" on training_batches
  for select to authenticated
  using (org_id = auth_org_id());

create policy "batches_manage" on training_batches
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ── Attendance, scores: field staff write ────────────────────────────────────
create policy "attendance_read" on training_attendance
  for select to authenticated
  using (org_id = auth_org_id());

create policy "attendance_write" on training_attendance
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

create policy "scores_read" on training_test_scores
  for select to authenticated
  using (org_id = auth_org_id());

create policy "scores_write" on training_test_scores
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

-- ── Certificates: admins/program roles issue; staff read ────────────────────
create policy "certificates_read" on training_certificates
  for select to authenticated
  using (org_id = auth_org_id());

create policy "certificates_manage" on training_certificates
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ─────────── migrations/0046_programs_ops.sql ───────────
-- 0046_programs_ops.sql — Programs operations (reqs 5–9).
-- Project expenses vs budget lines (80% alerts), field monitoring visits with
-- checklists + photos, donor quarterly reports, sensitive case management
-- (restricted fields, access logging) and the grant / PKSF / bank borrowing
-- tracker with repayment schedules. Money is numeric(14,2) text.

-- ── 5) Project expenses (budget monitoring) ─────────────────────────────────
create table if not exists project_expenses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  expense_date date not null,
  budget_line text not null,
  amount numeric(14,2) not null check (amount > 0),
  voucher_no text not null default '',
  description text not null default '',
  recorded_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_expenses_project on project_expenses (org_id, project_id, expense_date);

-- ── 6) Field monitoring visits ──────────────────────────────────────────────
create table if not exists field_visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  visit_date date not null,
  officer_id text not null,
  officer_name text not null,
  village text not null default '',
  beneficiaries_met integer not null default 0 check (beneficiaries_met >= 0),
  checklist jsonb not null default '[]'::jsonb,   -- [{item, passed, note}]
  photos jsonb not null default '[]'::jsonb,      -- [{id, labelBn, path}]
  findings text not null default '',
  follow_ups jsonb not null default '[]'::jsonb,  -- [{action, owner, dueDate, done}]
  created_at timestamptz not null default now()
);
create index if not exists idx_visits_project on field_visits (org_id, project_id, visit_date);

-- ── 7) Donor reports (generated quarterly) ──────────────────────────────────
create table if not exists donor_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  payload jsonb not null,             -- DonorReport document
  generated_by text not null,
  created_at timestamptz not null default now(),
  unique (org_id, project_id, period_start, period_end)
);

-- ── 8) Sensitive case management ────────────────────────────────────────────
create table if not exists cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  case_no text not null,
  type text not null check (type in ('child_protection','gbv_survivor','child_marriage','trafficking','other_sensitive')),
  severity text not null check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','referred','closed')),
  beneficiary_id uuid references beneficiaries(id),
  beneficiary_name text not null,
  -- RESTRICTED: readable only by case workers/admins; RLS masks it for staff.
  restricted_details text not null,
  consent_given boolean not null default false,
  opened_at date not null default current_date,
  assigned_worker_id text not null,
  assigned_worker_name text not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, case_no)
);

-- Append-only access log: every open/update is recorded; rows are never
-- updated or deleted (enforced by RLS insert-only policy in 0047).
create table if not exists case_access_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  user_id text not null,
  user_name text not null,
  action text not null check (action in ('create','view','view_restricted','update','close')),
  at timestamptz not null default now()
);
create index if not exists idx_case_access_case on case_access_log (org_id, case_id, at desc);

-- Case status state machine (trigger-enforced, mirrors canTransitionCase).
create or replace function fn_case_flow()
returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  allowed := case new.status
    when 'open'        then array['in_progress','referred','closed']
    when 'in_progress' then array['referred','closed']
    when 'referred'    then array['closed']
    when 'closed'      then array[]::text[]
  end;
  if old.status is distinct from new.status and not (new.status = any(allowed)) then
    raise exception 'INVALID_CASE_TRANSITION % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  if new.status = 'closed' and old.status <> 'closed' then
    new.closed_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_case_flow on cases;
create trigger trg_case_flow before update on cases
  for each row execute function fn_case_flow();

-- ── 9) Grants & PKSF/bank borrowing tracker ─────────────────────────────────
create table if not exists funding_sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,
  source_name text not null,
  kind text not null check (kind in ('grant','pksf','bank','mfi_wholesale','internal_fund')),
  principal numeric(14,2) not null check (principal > 0),
  interest_rate_pct numeric(5,2) not null default 0 check (interest_rate_pct >= 0 and interest_rate_pct <= 100),
  tenure_months integer not null check (tenure_months between 0 and 600),
  disbursement_date date not null,
  repayment_start date not null,
  purpose_project_id uuid references projects(id),
  lender_contact text not null default '',
  status text not null default 'active' check (status in ('active','repaid','defaulted')),
  created_at timestamptz not null default now(),
  unique (org_id, code)
);

create table if not exists funding_repayments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  source_id uuid not null references funding_sources(id) on delete cascade,
  installment_no integer not null check (installment_no >= 1),
  due_date date not null,
  principal numeric(14,2) not null,
  interest numeric(14,2) not null,
  total numeric(14,2) not null,
  balance numeric(14,2) not null,
  paid boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, installment_no)
);
create index if not exists idx_repayments_source on funding_repayments (org_id, source_id, due_date);

-- Sequence helpers
create or replace function next_case_seq(p_org_id uuid)
returns integer language sql as $$
  select count(*)::int + 1 from cases where org_id = p_org_id;
$$;

create or replace function next_funding_seq(p_org_id uuid)
returns integer language sql as $$
  select count(*)::int + 1 from funding_sources where org_id = p_org_id;
$$;

-- ─────────── migrations/0047_programs_ops_rls.sql ───────────
-- 0047_programs_ops_rls.sql — RLS for Programs ops tables.
-- Expenses/visits/reports/funding follow the standard org-scoped pattern.
-- CASES are special: only case workers (admins + area managers) and the
-- assigned worker may read them; restricted fields are additionally masked in
-- the API layer for viewers without case clearance. The access log is
-- INSERT-ONLY — rows can never be updated or deleted by app roles, so the
-- audit trail of who saw a case is tamper-evident. Cases never join into
-- donor reports or any general reporting endpoint.

-- Helper: the caller's auth uid as text (assigned_worker_id is text).
create or replace function auth_user_id() returns text as $$
  select auth.uid()::text;
$$ language sql stable;

alter table project_expenses    enable row level security;
alter table field_visits        enable row level security;
alter table donor_reports       enable row level security;
alter table cases               enable row level security;
alter table case_access_log     enable row level security;
alter table funding_sources     enable row level security;
alter table funding_repayments  enable row level security;

-- ── Project expenses: staff read; admins/accountants/program roles write ────
create policy "project_expenses_read" on project_expenses
  for select to authenticated
  using (org_id = auth_org_id());

create policy "project_expenses_manage" on project_expenses
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

-- ── Field visits: staff read; field staff write ──────────────────────────────
create policy "field_visits_read" on field_visits
  for select to authenticated
  using (org_id = auth_org_id());

create policy "field_visits_write" on field_visits
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant','account_officer')
  );

-- ── Donor reports: read by all staff; generated by admins/program roles ─────
create policy "donor_reports_read" on donor_reports
  for select to authenticated
  using (org_id = auth_org_id());

create policy "donor_reports_manage" on donor_reports
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ── CASES: strict — no general-staff select. ────────────────────────────────
-- Case workers (super_admin/org_admin/area_manager) and the assigned worker
-- only. account_officer and branch_manager have NO read access here.
create policy "cases_case_worker_read" on cases
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      auth_user_role() in ('super_admin','org_admin','area_manager')
      or assigned_worker_id = auth_user_id()
    )
  );

create policy "cases_case_worker_write" on cases
  for all to authenticated
  using (
    org_id = auth_org_id()
    and (
      auth_user_role() in ('super_admin','org_admin','area_manager')
      or assigned_worker_id = auth_user_id()
    )
  )
  with check (
    org_id = auth_org_id()
    and (
      auth_user_role() in ('super_admin','org_admin','area_manager')
      or assigned_worker_id = auth_user_id()
    )
  );

-- ── Case access log: INSERT-ONLY audit trail ─────────────────────────────────
-- Case workers may append entries for cases they can see; nobody may update
-- or delete. Non-case-workers cannot even insert, so the log is complete.
create policy "case_access_log_insert" on case_access_log
  for insert to authenticated
  with check (
    org_id = auth_org_id()
    and user_id = auth_user_id()
    and exists (
      select 1 from cases c
      where c.id = case_id
        and c.org_id = auth_org_id()
        and (
          auth_user_role() in ('super_admin','org_admin','area_manager')
          or c.assigned_worker_id = auth_user_id()
        )
    )
  );

-- No select/update/delete policies on case_access_log for app roles: only the
-- service role (used by the case endpoints) may read it back. This keeps the
-- audit trail tamper-evident even for case workers.

-- ── Funding sources & repayments: finance-tier manage, staff read ───────────
create policy "funding_sources_read" on funding_sources
  for select to authenticated
  using (org_id = auth_org_id());

create policy "funding_sources_manage" on funding_sources
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

create policy "funding_repayments_read" on funding_repayments
  for select to authenticated
  using (org_id = auth_org_id());

create policy "funding_repayments_manage" on funding_repayments
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ─────────── migrations/0048_reports_mis.sql ───────────
-- 0048_reports_mis.sql — Reports, MIS & compliance (reqs 1–4).
-- Report templates (configurable designer), generated regulatory returns and
-- dashboard/report snapshots. Snapshot values come from the operational
-- modules at query time; these tables persist the designer's templates, the
-- generated submissions and dashboard layout preferences.

-- ── Report designer templates (req 4) ───────────────────────────────────────
create table if not exists report_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  regulator text not null check (regulator in ('MRA','PKSF','OTHER')),
  section text not null default '',
  circular_ref text not null default '',
  -- Marked true until verified against the latest official circular.
  needs_verification boolean not null default true,
  verified_at timestamptz,
  verified_by text,
  rows jsonb not null default '[]'::jsonb,  -- TemplateRow[]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Generated returns (submissions ledger) ──────────────────────────────────
create table if not exists regulatory_returns (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  template_id uuid not null references report_templates(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  payload jsonb not null,             -- GeneratedRegulatoryReturn
  missing_values jsonb not null default '[]'::jsonb,
  generated_by text not null,
  submitted_at timestamptz,           -- set when actually filed with the regulator
  created_at timestamptz not null default now(),
  unique (org_id, template_id, period_start, period_end)
);

-- ── Snapshot cache for dashboards/reports (refreshed on demand) ─────────────
create table if not exists mis_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  as_of date not null,
  role text not null check (role in ('field_officer','branch_manager','area_zone','head_office','board')),
  scope_id text,                      -- officer/branch/area id when scoped
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (org_id, as_of, role, scope_id)
);
create index if not exists idx_mis_snapshots_org_date on mis_snapshots (org_id, as_of desc);

-- ── Formula-value registry: named values templates may reference ────────────
-- Populated by a scheduled rollup job (or computed on the fly in demo mode).
create table if not exists mis_formula_values (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  as_of date not null,
  key text not null,
  value numeric(18,4) not null,
  source text not null default 'rollup',  -- rollup | manual | ratio
  created_at timestamptz not null default now(),
  unique (org_id, as_of, key)
);

-- ── Staff productivity rollup (per officer, per month) ──────────────────────
create table if not exists staff_productivity_monthly (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid references branches(id),
  officer_id text not null,
  officer_name text not null,
  period text not null,               -- YYYY-MM
  samities integer not null default 0,
  borrowers integer not null default 0,
  due_amount numeric(14,2) not null default 0,
  collected_amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, officer_id, period)
);

-- ── Report generation audit (who pulled what, when) ─────────────────────────
create table if not exists report_audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null,                 -- standard report kind or 'regulatory_return'
  params jsonb not null default '{}'::jsonb,
  requested_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_report_audit_org on report_audit_log (org_id, created_at desc);

-- ─────────── migrations/0049_reports_mis_rls.sql ───────────
-- 0049_reports_mis_rls.sql — RLS for Reports/MIS tables.
-- Templates & returns are finance/admin-managed; all staff read dashboards and
-- standard reports of their own org. The audit log is append-only for readers.

alter table report_templates            enable row level security;
alter table regulatory_returns          enable row level security;
alter table mis_snapshots               enable row level security;
alter table mis_formula_values          enable row level security;
alter table staff_productivity_monthly  enable row level security;
alter table report_audit_log            enable row level security;

-- ── Templates: staff read; admins/finance manage ────────────────────────────
create policy "report_templates_read" on report_templates
  for select to authenticated
  using (org_id = auth_org_id());

create policy "report_templates_manage" on report_templates
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ── Generated returns: staff read; finance/admin generate & submit ──────────
create policy "regulatory_returns_read" on regulatory_returns
  for select to authenticated
  using (org_id = auth_org_id());

create policy "regulatory_returns_manage" on regulatory_returns
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ── Snapshots & formula values: org-scoped read; service role maintains ─────
create policy "mis_snapshots_read" on mis_snapshots
  for select to authenticated
  using (org_id = auth_org_id());

create policy "mis_snapshots_write" on mis_snapshots
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  );

create policy "mis_formula_values_read" on mis_formula_values
  for select to authenticated
  using (org_id = auth_org_id());

create policy "mis_formula_values_write" on mis_formula_values
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','accountant')
  );

-- ── Staff productivity: org read; managers/accountant write ─────────────────
create policy "staff_productivity_read" on staff_productivity_monthly
  for select to authenticated
  using (org_id = auth_org_id());

create policy "staff_productivity_write" on staff_productivity_monthly
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- ── Audit log: org read; every report pull appends ──────────────────────────
create policy "report_audit_read" on report_audit_log
  for select to authenticated
  using (org_id = auth_org_id());

create policy "report_audit_insert" on report_audit_log
  for insert to authenticated
  with check (org_id = auth_org_id() and requested_by = auth_user_id());

-- No update/delete policies on report_audit_log: rows are immutable.

-- ─────────── migrations/0050_reports_mis_ops.sql ───────────
-- 0050_reports_mis_ops.sql — Reports/MIS ops (reqs 5–10).
-- Complaint & grievance register with escalation, saved report builder,
-- export schedules, month freeze (data freeze), nightly materialized views
-- and the documented index set.

-- ── 10) Complaint & grievance register ──────────────────────────────────────
create table if not exists complaints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  ticket_no text not null,
  channel text not null check (channel in ('branch','hotline','field_visit','whistlebox','regulator')),
  category text not null check (category in ('product_transparency','overcharging','staff_behaviour','coercive_collection','privacy','delay','other')),
  status text not null default 'open' check (status in ('open','in_progress','escalated','resolved','rejected')),
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  subject text not null,
  details text not null default '',
  member_id uuid references members(id),
  member_name text not null,
  branch_id uuid references branches(id),
  reported_at date not null,
  -- SLA deadline: critical +1 day, else +3 days (mirrors complaintDueAt).
  due_at date not null,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolution_note text not null default '',
  escalations jsonb not null default '[]'::jsonb, -- [{level, at, note}]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, ticket_no)
);
-- Req 8 documented indexes (see MIS_INDEX_DOCS in shared).
create index if not exists idx_complaints_org_status_reported on complaints (org_id, status, reported_at desc);
create index if not exists idx_complaints_member on complaints (member_id);
create index if not exists idx_complaints_org_branch on complaints (org_id, branch_id);

-- Complaint state machine: open → in_progress/escalated/resolved/rejected;
-- escalated can escalate further (ladder); resolved & rejected are terminal
-- (mirrors canTransitionComplaint).
create or replace function fn_complaint_flow()
returns trigger language plpgsql as $$
declare
  allowed text[];
begin
  allowed := case new.status
    when 'open'        then array['in_progress','escalated','resolved','rejected']
    when 'in_progress' then array['escalated','resolved','rejected']
    when 'escalated'   then array['in_progress','escalated','resolved','rejected']
    when 'resolved'    then array[]::text[]
    when 'rejected'    then array[]::text[]
  end;
  if old.status is distinct from new.status and not (new.status = any(allowed)) then
    raise exception 'INVALID_COMPLAINT_TRANSITION % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  if new.status = 'resolved' and old.status <> 'resolved' then
    new.resolved_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_complaint_flow on complaints;
create trigger trg_complaint_flow before update on complaints
  for each row execute function fn_complaint_flow();

-- ── 6) Saved reports (builder) ──────────────────────────────────────────────
create table if not exists saved_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  dataset text not null check (dataset in ('loans','savings','collections','complaints','members')),
  filters jsonb not null default '[]'::jsonb,   -- [{field, op, value}]
  group_by text not null,
  metric text not null default 'count' check (metric in ('count','sum','avg')),
  metric_field text,
  chart_type text not null default 'bar' check (chart_type in ('table','bar','line','pie')),
  shared_with_roles jsonb not null default '[]'::jsonb,
  owner_user_id text not null,
  owner_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 7) Export schedules (free-SMTP delivery) ────────────────────────────────
create table if not exists export_schedules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('saved_report','standard_report')),
  report_id text not null,
  format text not null check (format in ('csv','excel','pdf')),
  frequency text not null check (frequency in ('daily','weekly','monthly')),
  run_on integer not null default 1 check (run_on between 1 and 28),
  recipients jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_status text check (last_status in ('ok','error')),
  last_error text,
  created_by text not null,
  created_at timestamptz not null default now()
);

-- Delivery log (one row per send attempt).
create table if not exists export_deliveries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  schedule_id uuid not null references export_schedules(id) on delete cascade,
  sent_at timestamptz not null default now(),
  status text not null check (status in ('ok','error')),
  recipients jsonb not null default '[]'::jsonb,
  error text
);

-- ── 9) Data freeze (closed months immutable) ────────────────────────────────
create table if not exists month_freezes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  month text not null,                 -- YYYY-MM
  status text not null default 'hard' check (status in ('soft','hard')),
  frozen_by text not null,
  frozen_at timestamptz not null default now(),
  note text not null default '',
  unique (org_id, month)
);

-- ── 8) Materialized views (nightly refresh, req 8) ──────────────────────────
-- loans_classified shim: normalizes the live loan tables into the per-loan
-- snapshot shape the MIS matviews expect (the classifier table `0050` was
-- modelled on never landed). One row per application with outstanding =
-- demand minus payments; DPD from the oldest unpaid due.
create or replace view loans_classified as
select
  ld.application_id,
  ld.org_id,
  ld.branch_id,
  ld.samity_id,
  ld.disbursed_by                        as officer_id,
  coalesce(u.full_name, 'Unassigned')    as officer_name,
  la.member_id                           as member_id,
  m.full_name                            as member_name,
  coalesce(sum(li.principal + li.interest), 0)::numeric(14,2) as demand_total,
  coalesce(sum(li.paid_amount), 0)::numeric(14,2)             as paid_total,
  greatest(
    coalesce(sum(li.principal + li.interest), 0) - coalesce(sum(li.paid_amount), 0),
    0
  )::numeric(14,2)                       as outstanding,
  coalesce(sum(case when li.due_date < current_date then (li.principal + li.interest - li.paid_amount) end), 0)::numeric(14,2) as overdue_total,
  coalesce(min(case when li.paid_amount < li.principal + li.interest then li.due_date end), current_date) - current_date as days_past_due
from loan_disbursements ld
join loan_applications la on la.id = ld.application_id
join members m on m.id = la.member_id
left join users_profile u on u.id = ld.disbursed_by
left join loan_installments li on li.application_id = ld.application_id
where ld.status = 'completed'
  and ld.cancelled_at is null
  and la.status in ('disbursed','closed')
group by ld.application_id, ld.org_id, ld.branch_id, ld.samity_id, ld.disbursed_by, u.full_name, m.full_name, la.member_id;

-- Branch portfolio: outstanding, loans, PAR30 per branch per day.
create materialized view if not exists mv_branch_portfolio_daily as
select
  l.org_id,
  l.branch_id,
  current_date::date                                  as as_of,
  count(*)::int                                       as loans_total,
  coalesce(sum(l.outstanding), 0)::numeric(18,2)      as outstanding_total,
  coalesce(sum(case when l.days_past_due > 0 then l.outstanding else 0 end), 0)::numeric(18,2) as at_risk,
  coalesce(sum(case when l.days_past_due >= 30 then l.outstanding else 0 end), 0)::numeric(18,2) as par30_value,
  count(*) filter (where l.days_past_due > 0)::int    as loans_at_risk
from loans_classified l
group by l.org_id, l.branch_id;

-- Officer productivity: borrowers, demand vs collection per officer.
create materialized view if not exists mv_officer_productivity_monthly as
select
  org_id,
  officer_id,
  officer_name,
  branch_id,
  date_trunc('month', current_date)::date             as period,
  count(distinct member_id)::int                      as borrowers,
  count(distinct samity_id)::int                      as samities,
  sum(outstanding)::numeric(18,2)                     as outstanding_total,
  sum(overdue_total)::numeric(18,2)                   as overdue_total
from loans_classified
group by org_id, officer_id, officer_name, branch_id;

-- Savings position per branch/product.
create materialized view if not exists mv_savings_position_daily as
select
  org_id,
  branch_id,
  product_id,
  current_date::date                                  as as_of,
  count(*)::int                                       as accounts,
  coalesce(sum(balance), 0)::numeric(18,2)            as total_balance
from savings_accounts
where status <> 'closed'
group by org_id, branch_id, product_id;

-- Complaint SLA per branch.
create materialized view if not exists mv_complaint_sla_daily as
select
  org_id,
  branch_id,
  current_date::date                                  as as_of,
  count(*)::int                                       as complaints_total,
  count(*) filter (where status in ('open','in_progress','escalated'))::int as complaints_open,
  count(*) filter (where status = 'escalated')::int   as escalated,
  coalesce(avg(case when resolved_at is not null
    then extract(epoch from (resolved_at - reported_at::timestamptz)) / 86400 end), 0)::numeric(10,1) as resolution_days_avg,
  count(*) filter (where resolved_at is not null and resolved_at::date <= due_at)::int as resolved_within_sla
from complaints
group by org_id, branch_id;

-- Unique index makes CONCURRENTLY refreshes possible.
create unique index if not exists ux_mv_branch_portfolio on mv_branch_portfolio_daily (org_id, branch_id, as_of);
create unique index if not exists ux_mv_officer_productivity on mv_officer_productivity_monthly (org_id, officer_id, period);
create unique index if not exists ux_mv_savings_position on mv_savings_position_daily (org_id, branch_id, product_id, as_of);
create unique index if not exists ux_mv_complaint_sla on mv_complaint_sla_daily (org_id, branch_id, as_of);

-- Nightly refresh helper (call from pg_cron / app cron after classification).
create or replace function refresh_mis_matviews()
returns void language plpgsql as $$
begin
  refresh materialized view concurrently mv_branch_portfolio_daily;
  refresh materialized view concurrently mv_officer_productivity_monthly;
  refresh materialized view concurrently mv_savings_position_daily;
  refresh materialized view concurrently mv_complaint_sla_daily;
end;
$$;

-- ── Seq helper ──────────────────────────────────────────────────────────────
create or replace function next_complaint_seq(p_org_id uuid)
returns integer language sql as $$
  select count(*)::int + 1 from complaints where org_id = p_org_id;
$$;

-- NOTE: mv_* views reference loans_classified / savings_accounts shapes from
-- the demo schema; adjust column names to the live schema when applying to a
-- real project (the shared MIS_INDEX_DOCS catalogue documents intent).

-- ─────────── migrations/0051_reports_mis_ops_rls.sql ───────────
-- 0051_reports_mis_ops_rls.sql — RLS for MIS ops tables (reqs 5–10).
-- Complaints: all staff read (aggregate indicators need it); managers/admins
-- act, field staff open. Saved reports: owner + shared roles + admins.
-- Freezes: admin-only write; everyone reads (guards must check).

alter table complaints         enable row level security;
alter table saved_reports      enable row level security;
alter table export_schedules   enable row level security;
alter table export_deliveries  enable row level security;
alter table month_freezes      enable row level security;

-- ── Complaints: org read; staff open; managers resolve; nobody deletes ──────
create policy "complaints_read" on complaints
  for select to authenticated
  using (org_id = auth_org_id());

create policy "complaints_insert" on complaints
  for insert to authenticated
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','account_officer')
  );

create policy "complaints_update" on complaints
  for update to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager')
  );

-- No delete policy: the grievance register is append/transition-only.

-- ── Saved reports: owner or shared-role or admin ────────────────────────────
create policy "saved_reports_read" on saved_reports
  for select to authenticated
  using (
    org_id = auth_org_id()
    and (
      owner_user_id = auth_user_id()
      or shared_with_roles ? auth_user_role()
      or auth_user_role() in ('super_admin','org_admin')
    )
  );

create policy "saved_reports_write" on saved_reports
  for all to authenticated
  using (
    org_id = auth_org_id()
    and (
      owner_user_id = auth_user_id()
      or auth_user_role() in ('super_admin','org_admin')
    )
  )
  with check (
    org_id = auth_org_id()
    and (
      owner_user_id = auth_user_id()
      or auth_user_role() in ('super_admin','org_admin')
    )
  );

-- ── Export schedules: creator + admins manage; managers read ────────────────
create policy "export_schedules_read" on export_schedules
  for select to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

create policy "export_schedules_manage" on export_schedules
  for all to authenticated
  using (
    org_id = auth_org_id()
    and (
      created_by = auth_user_id()
      or auth_user_role() in ('super_admin','org_admin')
    )
  )
  with check (
    org_id = auth_org_id()
    and (
      created_by = auth_user_id()
      or auth_user_role() in ('super_admin','org_admin')
    )
  );

create policy "export_deliveries_read" on export_deliveries
  for select to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin','area_manager','branch_manager','accountant')
  );

-- Deliveries are written by the service role (cron); no app-role insert.

-- ── Month freezes: admin-only write; org read ───────────────────────────────
create policy "month_freezes_read" on month_freezes
  for select to authenticated
  using (org_id = auth_org_id());

create policy "month_freezes_manage" on month_freezes
  for all to authenticated
  using (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  )
  with check (
    org_id = auth_org_id()
    and auth_user_role() in ('super_admin','org_admin')
  );

-- ─────────── migrations/0052_communication.sql ───────────
-- 0052_communication.sql — Communication & document module (reqs 1–3).
-- Notification center (in-app), bilingual templates, delivery log with
-- retries, opt-out preferences, send-window + cost-cap rules and spend counters.
-- Mirrors packages/shared/src/communication.ts.

create table if not exists message_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  kind        text not null check (kind in ('installment_reminder','disbursement_confirmation','receipt','meeting_notice','overdue_notice','greeting','approval_request')),
  name        text not null,
  locale      text not null default 'bn' check (locale in ('bn','en')),
  channel     text not null check (channel in ('in_app','email','sms')),
  subject     text not null default '',
  body        text not null,
  enabled     boolean not null default true,
  updated_by  text not null,
  updated_at  timestamptz not null default now(),
  unique (org_id, kind, locale, channel)
);

-- In-app notification center. Realtime: supabase_realtime publication (0053).
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     text not null,
  title       text not null,
  body        text not null default '',
  kind        text not null default 'custom',
  link        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_notifications_user on notifications (org_id, user_id, read, created_at desc);

-- Unified delivery log across channels (email/sms + audit of in-app).
create table if not exists message_deliveries (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  channel        text not null check (channel in ('in_app','email','sms')),
  provider       text not null,
  recipient_name text not null default '',
  recipient      text not null,
  kind           text not null default 'custom',
  template_id    uuid references message_templates(id) on delete set null,
  locale         text not null default 'bn' check (locale in ('bn','en')),
  subject        text not null default '',
  body           text not null,
  status         text not null check (status in ('queued','sent','failed','opted_out','outside_window','cap_blocked','retrying')),
  attempts       integer not null default 0,
  cost           numeric(10,2) not null default 0,
  error          text,
  sent_at        timestamptz,
  next_retry_at  timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists idx_deliveries_recent on message_deliveries (org_id, created_at desc);
create index if not exists idx_deliveries_retry on message_deliveries (org_id, status, next_retry_at);

-- Per-recipient opt-out preferences (req 3).
create table if not exists comm_opt_outs (
  org_id      uuid not null references organizations(id) on delete cascade,
  recipient   text not null,
  email       boolean not null default false,
  sms         boolean not null default false,
  note        text not null default '',
  updated_at  timestamptz not null default now(),
  primary key (org_id, recipient)
);

-- One rules row per org (send window, retry, caps).
create table if not exists comm_rules (
  org_id               uuid primary key references organizations(id) on delete cascade,
  send_window_start    text not null default '09:00',
  send_window_end      text not null default '20:00',
  max_retries          integer not null default 3,
  retry_backoff_minutes integer not null default 15,
  daily_cost_cap       numeric(12,2) not null default 500,
  monthly_cost_cap     numeric(12,2) not null default 5000,
  cost_per_sms_part    numeric(8,2) not null default 0.35,
  updated_at           timestamptz not null default now()
);

-- Rolling spend counters for the caps (req 3).
create table if not exists comm_spend (
  org_id       uuid not null references organizations(id) on delete cascade,
  day          date not null,
  month        text not null,
  daily_cost   numeric(12,2) not null default 0,
  monthly_cost numeric(12,2) not null default 0,
  primary key (org_id, day)
);

-- ─────────── migrations/0053_communication_rls.sql ───────────
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

-- ─────────── migrations/0054_documents.sql ───────────
-- 0054_documents.sql — Document module (reqs 4–8).
-- Doc templates with cholito/sadhu register variants and version history,
-- generated documents with QR verification codes, and bulk jobs for
-- samity/branch-wide actions. Mirrors packages/shared/src/documents.ts.

-- ── Req 4/5: doc templates (11 kinds × cholito|sadhu) with versions ─────────
create table if not exists doc_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  kind        text not null check (kind in ('membership_form','loan_application','loan_agreement','guarantor_declaration','receipt','passbook_page','meeting_minutes','notice','appointment_letter','transfer_letter','legal_notice')),
  register    text not null default 'cholito' check (register in ('cholito','sadhu')),
  orientation text not null default 'portrait' check (orientation in ('portrait','landscape')),
  body        text not null,
  enabled     boolean not null default true,
  version     integer not null default 1,
  updated_by  text not null,
  updated_at  timestamptz not null default now(),
  unique (org_id, kind, register)
);

-- Immutable snapshots taken on every save (req 5 version history).
create table if not exists doc_template_versions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  template_id uuid not null references doc_templates(id) on delete cascade,
  version     integer not null,
  body        text not null,
  orientation text not null default 'portrait',
  updated_by  text not null,
  updated_at  timestamptz not null default now(),
  unique (template_id, version)
);
create index if not exists idx_doc_versions_template on doc_template_versions (template_id, version desc);

-- ── Req 4/7: generated documents + opaque verification codes ────────────────
-- html holds the print-HTML (embedded Bengali font stack); verify_code is the
-- ONLY lookup key the public page accepts and exposes no personal data.
create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  kind         text not null check (kind in ('membership_form','loan_application','loan_agreement','guarantor_declaration','receipt','passbook_page','meeting_minutes','notice','appointment_letter','transfer_letter','legal_notice')),
  register     text not null default 'cholito' check (register in ('cholito','sadhu')),
  doc_no       text not null,
  verify_code  text not null unique,
  title_snippet text not null default '',
  template_id  uuid references doc_templates(id) on delete set null,
  template_version integer,
  reference_id uuid,
  payload      jsonb not null default '{}'::jsonb,
  issued_by    text not null,
  issued_at    timestamptz not null default now(),
  status       text not null default 'active' check (status in ('active','revoked')),
  html         text not null,
  unique (org_id, doc_no)
);
create index if not exists idx_documents_verify on documents (verify_code);
create index if not exists idx_documents_recent on documents (org_id, issued_at desc);

-- ── Req 8: bulk jobs over a samity or branch ────────────────────────────────
create table if not exists bulk_jobs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  kind        text not null check (kind in ('documents_batch','sms_batch','notification_batch','status_flip')),
  scope       text not null check (scope in ('samity','branch')),
  scope_id    text not null,
  scope_name  text not null,
  params      jsonb not null default '{}'::jsonb,
  status      text not null default 'pending' check (status in ('pending','running','done','failed')),
  total       integer not null default 0,
  processed   integer not null default 0,
  failed      integer not null default 0,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists idx_bulk_jobs_recent on bulk_jobs (org_id, created_at desc);

create table if not exists bulk_job_items (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  job_id      uuid not null references bulk_jobs(id) on delete cascade,
  target_id   text not null,
  target_name text not null,
  status      text not null default 'pending' check (status in ('pending','done','failed')),
  ref_id      uuid,
  error       text
);
create index if not exists idx_bulk_items_job on bulk_job_items (job_id, status);

-- ─────────── migrations/0055_documents_rls.sql ───────────
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

-- ─────────── migrations/0056_security.sql ───────────
-- 0056_security.sql — Security, audit & data-protection tables.
-- Generic audit trail (append-only, req 1), unmask log (req 2), security
-- config (password/TOTP/lockout/session/IP policies, req 3), login attempts
-- (brute-force lockout), device registry, and the data-protection set:
-- consents, retention rules, correction requests (req 5). RLS follows in
-- 0057. Mirrors packages/shared/src/security.ts.

create extension if not exists pgcrypto;

-- ── Req 1: generic append-only audit trail ──────────────────────────────────
-- One row per sensitive-table change, written ONLY by the trigger below.
create table if not exists audit_records (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  table_name     text not null,
  record_id      text not null,
  action         text not null check (action in ('insert','update','delete')),
  old_values     jsonb,
  new_values     jsonb,
  changed_fields text[] not null default '{}',
  user_id        text,
  user_name      text,
  ip             text,
  user_agent     text,
  at             timestamptz not null default now()
);
create index if not exists idx_audit_recent on audit_records (org_id, at desc);
create index if not exists idx_audit_table on audit_records (org_id, table_name, record_id);

-- Hard append-only guard: UPDATE/DELETE always raise (service role included;
-- rows can only age out via a retention purge job that deletes by age).
create or replace function audit_records_append_only() returns trigger as $$
begin
  raise exception 'audit_records is append-only (%) blocked', tg_op;
end;
$$ language plpgsql;

drop trigger if exists trg_audit_records_immutable on audit_records;
create trigger trg_audit_records_immutable
  before update or delete on audit_records
  for each row execute function audit_records_append_only();

-- Generic trigger factory: old→new diff into audit_records. Column sets and
-- branch_id/org_id are read from the row itself, so the same function serves
-- every sensitive table in the schema.
create or replace function audit_row_change() returns trigger as $$
declare
  rec      uuid;
  org      uuid;
  branch   uuid;
  old_row  jsonb;
  new_row  jsonb;
  changed  text[];
begin
  if tg_op = 'DELETE' then
    old_row := to_jsonb(old);
    new_row := null;
    rec := coalesce(old_row->>'id', old_row->>'uuid', '')::uuid;
    org := (old_row->>'org_id')::uuid;
  else
    old_row := case when tg_op = 'UPDATE' then to_jsonb(old) end;
    new_row := to_jsonb(new);
    rec := coalesce(new_row->>'id', new_row->>'uuid', '')::uuid;
    org := (new_row->>'org_id')::uuid;
    if tg_op = 'UPDATE' then
      select array_agg(key) into changed
      from jsonb_each(new_row) n
      join jsonb_each(old_row) o using (key)
      where n.value is distinct from o.value;
      if changed is null then
        return coalesce(new, old);  -- no-op update: nothing to log
      end if;
    end if;
  end if;
  insert into audit_records (org_id, table_name, record_id, action, old_values, new_values, changed_fields, user_id, user_name, ip, user_agent)
  values (
    org,
    tg_table_name,
    coalesce(rec::text, ''),
    lower(tg_op),
    old_row,
    new_row,
    coalesce(changed, '{}'),
    current_setting('request.user_id', true),
    current_setting('request.user_name', true),
    current_setting('request.ip', true),
    current_setting('request.user_agent', true)
  );
  return coalesce(new, old);
end;
$$ language plpgsql security definer;

-- Attach to the sensitive tables (re-runnable: drop/recreate per table).
-- Tables are checked with to_regclass so a partial earlier migration chain
-- degrades audit coverage gracefully instead of aborting the whole file —
-- the security module must never fail to install because one unrelated
-- table is missing.
do $$
declare t text;
begin
  foreach t in array array[
    'members','member_nominees','savings_accounts','savings_transactions',
    'loans','loan_applications','loan_disbursements',
    'collection_entries','cash_handovers','vouchers','voucher_lines',
    'payroll_lines','hr_staff','users_profile'
  ] loop
    if to_regclass(format('%I', t)) is not null then
      execute format('drop trigger if exists trg_audit_%s on %I', t, t);
      execute format(
        'create trigger trg_audit_%s after insert or update or delete on %I
           for each row execute function audit_row_change()', t, t);
    end if;
  end loop;
end;
$$;

-- ── Req 2: unmask log (every reveal of protected fields) ────────────────────
create table if not exists unmask_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  entity_table text not null,
  entity_id   text not null,
  field       text not null check (field in ('national_id','bank_account','phone')),
  user_id     text not null,
  user_name   text,
  role        text not null,
  ip          text,
  at          timestamptz not null default now()
);
create index if not exists idx_unmask_recent on unmask_log (org_id, at desc);

-- ── Req 3: security configuration (one row per org) ─────────────────────────
create table if not exists security_config (
  org_id              uuid primary key references organizations(id) on delete cascade,
  password_policy     jsonb not null,
  totp_config         jsonb not null,
  lockout_policy      jsonb not null,
  session_policy      jsonb not null,
  ip_allowlist        jsonb not null default '{"enabled":false,"cidrs":[]}'::jsonb,
  updated_by          text not null,
  updated_at          timestamptz not null default now()
);

-- ── Req 3: login attempts (brute-force lockout source) ──────────────────────
create table if not exists login_attempts (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid references organizations(id) on delete cascade,
  email   text not null,
  ok      boolean not null,
  ip      text,
  at      timestamptz not null default now()
);
create index if not exists idx_login_attempts_email on login_attempts (email, at desc);

-- ── Req 3: device registry ──────────────────────────────────────────────────
create table if not exists user_devices (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     text not null,
  label       text not null,
  user_agent  text,
  ip          text,
  created_at  timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked     boolean not null default false
);
create index if not exists idx_devices_user on user_devices (org_id, user_id);

-- ── TOTP enrollment per user (secret stays server-side; QR shows otpauth URL) ──
create table if not exists user_totp (
  user_id     text primary key,
  org_id      uuid not null references organizations(id) on delete cascade,
  secret_b32  text not null,
  confirmed   boolean not null default false,
  last_code   text,
  enabled     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ── Req 5: consent records (versioned, per member) ──────────────────────────
create table if not exists member_consents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  kind         text not null check (kind in ('data_processing','photo_use','sms_communication','biometric')),
  granted      boolean not null,
  text_version text not null default 'v1',
  method       text not null default 'written' check (method in ('written','verbal','digital')),
  witness_name text,
  granted_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  recorded_by  text not null
);
create index if not exists idx_consents_member on member_consents (org_id, member_id);

-- ── Req 5: retention rules per record class ─────────────────────────────────
create table if not exists retention_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  class         text not null check (class in ('member_core','savings_transactions','loan_records','audit_logs','sms_deliveries','documents')),
  retain_months integer not null check (retain_months between 6 and 600),
  legal_hold    boolean not null default false,
  updated_by    text not null,
  updated_at    timestamptz not null default now(),
  unique (org_id, class)
);

-- ── Req 5: right-to-correction workflow ─────────────────────────────────────
create table if not exists member_corrections (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  member_id       uuid not null references members(id) on delete cascade,
  member_name     text not null,
  field           text not null,
  current_value   text not null,
  requested_value text not null,
  reason          text not null,
  status          text not null default 'submitted' check (status in ('submitted','in_review','approved','rejected','applied')),
  decided_by      text,
  decided_at      timestamptz,
  decision_note   text not null default '',
  applied_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_corrections_member on member_corrections (org_id, member_id);

-- ─────────── migrations/0057_security_rls.sql ───────────
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

-- ─────────── migrations/0058_collection_live_fixes.sql ───────────
-- 0058_collection_live_fixes.sql — Runtime fixes for the collection module.
-- Found during the live-API finalization audit: the 0022 triggers referenced
-- columns/tables that do not exist as written, which would make entry
-- reversal and write-off approval fail at runtime. All statements are
-- idempotent so bootstrap and re-runs stay safe.

-- ── a) collection_entries.meta (capture GPS + savingsAccountId reference) ───
-- The reversal trigger reads meta->>'savingsAccountId'; the API writes it.
alter table collection_entries add column if not exists meta jsonb;

-- ── b) journal_entries.source_type: allow collection + write-off entries ────
-- 0018 shipped the CHECK with only disbursement/savings/share/manual values,
-- so the collection journal and the write-off journal could never be posted.
alter table journal_entries drop constraint if exists journal_entries_source_type_check;
alter table journal_entries add constraint journal_entries_source_type_check
  check (source_type in (
    'loan_disbursement', 'loan_disbursement_reversal', 'savings', 'share',
    'manual', 'collection', 'loan_write_off'
  ));

-- ── c) loan_application_status: written_off lifecycle value ─────────────────
alter type loan_application_status add value if not exists 'written_off' after 'closed';

-- ── d) Corrected reversal trigger ────────────────────────────────────────
-- Fixes vs 0022: the savings ledger column is transaction_type (0010), a
-- balance_after is mandatory (0010), and the live disbursement flow stores
-- installments in loan_repayment_schedule (0016) — un-apply there (and keep
-- the legacy loan_installments update for older data).
create or replace function fn_reverse_collection_entry() returns trigger
language plpgsql as $$
declare
  r collection_entries%rowtype;
  v_savings numeric(14,2);
  v_account uuid;
  v_balance numeric(14,2);
begin
  select * into r from collection_entries where id = new.entry_id;
  if r.id is null then
    raise exception 'entry % not found', new.entry_id;
  end if;

  -- Restore unpaid portions on touched schedule rows (live table).
  update loan_repayment_schedule s
     set paid_amount = greatest(s.paid_amount - (x.amt), 0),
         paid_at     = null
    from (
      select (elem->>'seq')::int as seq, (elem->>'amount')::numeric(14,2) as amt
        from jsonb_array_elements(coalesce(new.unapplied->'overdue','[]'::jsonb)) elem
      union all
      select (new.unapplied->'current'->>'seq')::int, (new.unapplied->'current'->>'amount')::numeric(14,2)
        where new.unapplied->'current' ? 'seq'
    ) x
   where s.application_id = r.application_id and s.seq = x.seq;

  -- Legacy table (harmless 0-row update when only the schedule is populated).
  update loan_installments li
     set paid_amount = greatest(li.paid_amount - (x.amt), 0),
         paid_at     = null
    from (
      select (elem->>'seq')::int as seq, (elem->>'amount')::numeric(14,2) as amt
        from jsonb_array_elements(coalesce(new.unapplied->'overdue','[]'::jsonb)) elem
      union all
      select (new.unapplied->'current'->>'seq')::int, (new.unapplied->'current'->>'amount')::numeric(14,2)
        where new.unapplied->'current' ? 'seq'
    ) x
   where li.application_id = r.application_id and li.seq = x.seq;

  -- Remove the savings deposit leg (ledger-reversal convention).
  v_savings := coalesce((new.unapplied->>'savings')::numeric(14,2), 0);
  v_account := (r.meta->>'savingsAccountId')::uuid;
  if v_savings > 0 and v_account is not null then
    select balance into v_balance from savings_accounts where id = v_account;
    update savings_accounts set balance = greatest(balance - v_savings, 0) where id = v_account;
    insert into savings_transactions (org_id, account_id, transaction_type, amount, balance_after, reference, note, created_by)
    values (r.org_id, v_account, 'withdrawal', v_savings, greatest(coalesce(v_balance, 0) - v_savings, 0),
            'reversal:' || new.id::text, 'ভুল এন্ট্রি বাতিল / Wrong-entry reversal', new.reversed_by);
  end if;
  return new;
end $$;

-- ── e) Corrected write-off trigger ───────────────────────────────────────
-- Fixes vs 0022: read outstanding from loan_repayment_schedule (the live
-- table), write journal_lines WITH the NOT NULL account_name, and mark the
-- schedule rows paid (not just the legacy loan_installments).
create or replace function fn_apply_write_off() returns trigger
language plpgsql as $$
declare
  v_total numeric(14,2);
  v_entry_id uuid;
begin
  if new.status = 'approved' and old.status in ('pending','recommended') then
    select coalesce(sum(total - paid_amount), 0) into v_total
      from loan_repayment_schedule where application_id = new.application_id;
    if v_total <> new.outstanding_amount then
      update loan_write_offs set outstanding_amount = v_total where id = new.id;
    end if;
    update loan_repayment_schedule set paid_amount = total, paid_at = current_date
     where application_id = new.application_id and paid_amount < total;
    update loan_installments set paid_amount = total, paid_at = current_date
     where application_id = new.application_id and paid_amount < total;
    update loan_applications set status = 'written_off', updated_at = now() where id = new.application_id;

    -- Journal: debit write-off expense / credit loan portfolio (Module 10).
    insert into journal_entries (org_id, branch_id, entry_date, source_type, source_id, memo, created_by)
    values (new.org_id, new.branch_id, current_date, 'loan_write_off', new.application_id,
            'ঋণ অপরিশোধিত অংশ অপসারণ / Loan write-off ' || coalesce(new.decision_note, ''), new.decided_by)
    returning id into v_entry_id;
    insert into journal_lines (entry_id, account_code, account_name, debit, credit)
    values
      (v_entry_id, '6200', 'Loan Write-off Expense', v_total, 0),
      (v_entry_id, '1200', 'Loan Portfolio', 0, v_total);
  end if;
  return new;
end $$;

-- ═══ PART 3/3: demo data ═══
-- ═════════════════════════════════════════════════════════════════════════════
-- demo-seed.sql — Samity Manager demo dataset (compact)
-- ─────────────────────────────────────────────────────────────────────────────
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → paste this whole file → Run.
--   Prerequisite: run supabase/migrations/*.sql first (all of them, in order).
--   Safe to re-run: every statement is idempotent (ON CONFLICT DO NOTHING /
--   guarded inserts), fixed UUIDs keep cross-references stable.
--
-- WHAT YOU GET
--   1 organization, 1 zone, 2 areas, 2 branches, 3 samities, 2 groups,
--   12 members (+3 insurance policies), 2 savings products, 8 savings accounts
--   with transactions, 1 loan policy, 3 loan products, 3 loan applications
--   (1 disbursed with schedule + installments, 1 in review, 1 submitted),
--   5 GL accounts, 1 approved voucher, 4 HR staff.
--
-- NOTES
--   * No auth.users rows are created or required: every user-referencing
--     column (created_by, decided_by, field_officer_id, …) is left NULL.
--     The API's service-role client bypasses RLS, so screens work immediately.
--   * Two guarded ALTERs add columns the live API reads/writes but no
--     migration defines (members.samity_name, members.deleted_by) — no-ops
--     if a future migration adds them.
--   * Demo org/branch ids match the web demo session (…0aa / …b1) so the
--     officer demo token is org-scoped to the seeded data.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── 0) Compat columns the live API expects ───────────────────────────────────
alter table members add column if not exists samity_name text;
alter table members add column if not exists deleted_by uuid references auth.users (id) on delete set null;

-- ── 1) Organization, zones, areas, branches ─────────────────────────────────
insert into organizations (id, name, name_bn, code) values
  ('00000000-0000-4000-8000-0000000000aa', 'Samity Demo Organization', 'সমিতি ডেমো সংস্থা', 'DEMO-ORG')
on conflict do nothing;

insert into zones (id, org_id, code, name, name_bn) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000aa', 'Z-01', 'Northern Zone', 'উত্তর অঞ্চল')
on conflict do nothing;

insert into areas (id, org_id, zone_id, code, name, name_bn) values
  ('00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000a001', 'A-01', 'Sirajganj Area', 'সিরাজগঞ্জ এরিয়া'),
  ('00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000a001', 'A-02', 'Pabna Area', 'পাবনা এরিয়া')
on conflict do nothing;

insert into branches (id, org_id, area_id, name, name_bn, code, district, status, opening_date, address, gps_lat, gps_lng) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000a101', 'Sadar Branch', 'সদর শাখা', 'BR-001', 'Sirajganj', 'active', current_date - interval '400 days', 'সিরাজগঞ্জ সদর, বাংলাদেশ', 24.453900, 89.700700),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000a102', 'Kazla Branch', 'কাজলা শাখা', 'BR-002', 'Pabna', 'active', current_date - interval '180 days', 'পাবনা কাজলা, বাংলাদেশ', 24.418000, 89.669000)
on conflict do nothing;

-- ── 2) Samities (weekly centers) + groups ───────────────────────────────────
insert into samities (id, org_id, branch_id, code, name, village, meeting_day, meeting_time, meeting_place, status, formation_stage) values
  ('00000000-0000-4000-8000-000000000c11', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'S-101', 'সোনালী সমিতি', 'রামপুর', 'friday', '17:30', 'রামপুর সরকারি প্রাথমিক বিদ্যালয়', 'active', 'active'),
  ('00000000-0000-4000-8000-000000000c12', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'S-102', 'রূপালী সমিতি', 'চাঁদপুর', 'saturday', '16:00', 'চাঁদপুর মহিলা ক্লাব', 'active', 'active'),
  ('00000000-0000-4000-8000-000000000c21', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', 'S-201', 'একতা সমিতি', 'মির্জাপুর', 'sunday', '17:00', 'মির্জাপুর কমিউনিটি সেন্টার', 'active', 'active')
on conflict do nothing;

insert into groups (id, org_id, samity_id, name, status, member_count) values
  ('00000000-0000-4000-8000-000000000d11', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000c11', 'ক দল', 'active', 4),
  ('00000000-0000-4000-8000-000000000d12', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000c12', 'খ দল', 'active', 2)
on conflict do nothing;

-- ── 3) Members (+ insurance policies) ───────────────────────────────────────
insert into members (id, org_id, branch_id, samity_id, member_code, passbook_no, full_name, full_name_bn, phone, national_id, status, lifecycle, join_date, samity_name, occupation, address) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c11', 'MEM-DEMO-001', 'PB-DEMO-001', 'Rahela Begum', 'মোছাঃ রাহেলা বেগম', '01711000001', '1990123456001', 'active', 'active', current_date - interval '380 days', 'সোনালী সমিতি', 'পোলট্রি খামার', 'রামপুর, সিরাজগঞ্জ'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c11', 'MEM-DEMO-002', 'PB-DEMO-002', 'Abdul Karim', 'মোঃ আব্দুল করিম', '01711000002', '1985123456002', 'active', 'active', current_date - interval '370 days', 'সোনালী সমিতি', 'ক্ষুদ্র ব্যবসা', 'রামপুর, সিরাজগঞ্জ'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c11', 'MEM-DEMO-003', 'PB-DEMO-003', 'Fatema Khatun', 'মোসাঃ ফাতেমা খাতুন', '01711000003', '1992123456003', 'active', 'active', current_date - interval '350 days', 'সোনালী সমিতি', 'তাঁত শিল্প', 'রামপুর, সিরাজগঞ্জ'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c12', 'MEM-DEMO-004', 'PB-DEMO-004', 'Shahjahan Mia', 'মোঃ শাহজাহান মিয়া', '01711000004', '1988123456004', 'active', 'active', current_date - interval '320 days', 'রূপালী সমিতি', 'ভ্যান চালক', 'চাঁদপুর, সিরাজগঞ্জ'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c12', 'MEM-DEMO-005', 'PB-DEMO-005', 'Salma Akter', 'মোছাঃ সালমা আক্তার', '01711000005', '1995123456005', 'active', 'active', current_date - interval '300 days', 'রূপালী সমিতি', 'মুদি দোকান', 'চাঁদপুর, সিরাজগঞ্জ'),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000c21', 'MEM-DEMO-006', 'PB-DEMO-006', 'Jasim Uddin', 'মোঃ জসিম উদ্দিন', '01711000006', '1987123456006', 'active', 'active', current_date - interval '150 days', 'একতা সমিতি', 'গরু পালন', 'মির্জাপুর, পাবনা'),
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000c21', 'MEM-DEMO-007', 'PB-DEMO-007', 'Nazma Haque', 'মোসাঃ নাজমা হক', '01711000007', '1993123456007', 'active', 'active', current_date - interval '140 days', 'একতা সমিতি', 'সেলাই কারখানা', 'মির্জাপুর, পাবনা'),
  ('00000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000c21', 'MEM-DEMO-008', 'PB-DEMO-008', 'Rafiqul Islam', 'মোঃ রফিকুল ইসলাম', '01711000008', null, 'inactive', 'dormant', current_date - interval '120 days', 'একতা সমিতি', 'কৃষি দিনমজুর', 'মির্জাপুর, পাবনা')
on conflict do nothing;

-- ── 3c) Extra demo members (009-012) for the CRUD demo ─────────────────────
-- Org/branch/samity are derived from the samity code, so the rows stay valid
-- even if the fixed UUIDs above change. Guarded: safe to re-run.
insert into members (id, org_id, branch_id, samity_id, member_code, passbook_no,
                     full_name, full_name_bn, phone, national_id, status, lifecycle,
                     join_date, samity_name, occupation, address)
select
  v.id::uuid,
  s.org_id,
  s.branch_id,
  s.id,
  v.member_code,
  v.passbook_no,
  v.full_name,
  v.full_name_bn,
  v.phone,
  v.national_id,
  v.status::member_status,
  v.lifecycle::member_lifecycle,
  current_date - v.age_days,
  s.name,
  v.occupation,
  v.address
from (values
  ('00000000-0000-4000-8000-000000000109'::uuid, 'MEM-DEMO-009', 'PB-DEMO-009', 'Morium Akter', 'মোছাঃ মরিয়ম আক্তার', '01711000009', '1996123456009', 'active', 'active', 90, 'মুরগি খামার', 'রামপুর, সিরাজগঞ্জ', 'S-101'),
  ('00000000-0000-4000-8000-000000000110'::uuid, 'MEM-DEMO-010', 'PB-DEMO-010', 'Kamal Hossain', 'মোঃ কামাল হোসেন', '01711000010', '1986123456010', 'active', 'active', 80, 'ইটভাটা শ্রমিক', 'চাঁদপুর, সিরাজগঞ্জ', 'S-102'),
  ('00000000-0000-4000-8000-000000000111'::uuid, 'MEM-DEMO-011', 'PB-DEMO-011', 'Shirin Sultana', 'মোছাঃ শিরিন সুলতানা', '01711000011', '1994123456011', 'active', 'active', 60, 'সেলাই কারখানা', 'মির্জাপুর, পাবনা', 'S-201'),
  ('00000000-0000-4000-8000-000000000112'::uuid, 'MEM-DEMO-012', 'PB-DEMO-012', 'Alamin Sheikh', 'মোঃ আল আমিন শেখ', '01711000012', null, 'active', 'pending', 30, 'ভ্যান চালক', 'মির্জাপুর, পাবনা', 'S-201')
) as v(id, member_code, passbook_no, full_name, full_name_bn, phone, national_id, status, lifecycle, age_days, occupation, address, samity_code)
join samities s on s.code = v.samity_code
where not exists (select 1 from members m where m.member_code = v.member_code);

-- ── 3b) Group memberships (must run after members: member_id FK) ────────────
insert into group_members (id, org_id, group_id, member_id, is_leader) values
  ('00000000-0000-4000-8000-000000000d21', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d11', '00000000-0000-4000-8000-000000000101', true),
  ('00000000-0000-4000-8000-000000000d22', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d11', '00000000-0000-4000-8000-000000000102', false),
  ('00000000-0000-4000-8000-000000000d23', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d11', '00000000-0000-4000-8000-000000000103', false),
  ('00000000-0000-4000-8000-000000000d24', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d11', '00000000-0000-4000-8000-000000000104', false),
  ('00000000-0000-4000-8000-000000000d25', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d12', '00000000-0000-4000-8000-000000000105', true),
  ('00000000-0000-4000-8000-000000000d26', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d12', '00000000-0000-4000-8000-000000000106', false)
on conflict do nothing;

insert into member_insurance (id, org_id, branch_id, member_id, product, premium, coverage, status)
select v.id::uuid, v.org_id::uuid, v.branch_id::uuid, v.member_id::uuid, v.product, v.premium, v.coverage, v.status
from (values
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000101', 'life', 250.00::numeric, 25000.00::numeric, 'active'),
  ('00000000-0000-4000-8000-0000000001a2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000103', 'life', 250.00::numeric, 25000.00::numeric, 'active'),
  ('00000000-0000-4000-8000-0000000001a3', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000106', 'life', 300.00::numeric, 30000.00::numeric, 'active')
) as v(id, org_id, branch_id, member_id, product, premium, coverage, status)
where not exists (select 1 from member_insurance m where m.id = v.id::uuid);

-- ── 4) Savings: products, accounts, transactions ────────────────────────────
insert into savings_products (id, org_id, code, name, name_bn, product_type, interest_rate, compounding, min_balance, withdrawal_limit, withdrawal_limit_period, maturity_months, is_active) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000aa', 'SV-GEN', 'সাধারণ সঞ্চয়', 'সাধারণ সঞ্চয় হিসাব', 'voluntary', 8.00, 'simple', 50.00, 5000.00, 'per_tx', 0, true),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-0000000000aa', 'SV-DPS', 'মাসিক সঞ্চয় (ডিপিএস)', 'ডিপিএস হিসাব', 'dps', 11.00, 'monthly', 500.00, 0.00, 'per_tx', 60, true)
on conflict do nothing;

insert into savings_accounts (id, org_id, branch_id, member_id, product_id, product, account_number, balance, status, opening_date) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-01', 4500.00, 'active', current_date - interval '380 days'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-02', 8200.00, 'active', current_date - interval '370 days'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000302', 'dps', 'SA-DEMO-03', 6000.00, 'active', current_date - interval '350 days'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-04', 2100.00, 'active', current_date - interval '320 days'),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000302', 'dps', 'SA-DEMO-05', 3000.00, 'active', current_date - interval '300 days'),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-06', 12000.00, 'active', current_date - interval '150 days'),
  ('00000000-0000-4000-8000-000000000207', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-07', 1500.00, 'active', current_date - interval '140 days'),
  ('00000000-0000-4000-8000-000000000208', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-08', 400.00, 'dormant', current_date - interval '120 days')
on conflict do nothing;

-- Transactions are guarded (no unique key to conflict on): only seed once.
insert into savings_transactions (id, org_id, account_id, transaction_type, amount, balance_after, reference, created_at)
select s.id, '00000000-0000-4000-8000-0000000000aa', s.id, 'deposit', s.balance, s.balance, 'ডেমো প্রারম্ভিক জমা', now() - interval '60 days'
from savings_accounts s
where s.org_id = '00000000-0000-4000-8000-0000000000aa'
  and s.account_number like 'SA-DEMO-%'
  and not exists (select 1 from savings_transactions t where t.org_id = s.org_id and t.reference = 'ডেমো প্রারম্ভিক জমা');

-- ── 5) Loans: policy, products, applications, disbursement, schedule ────────
insert into loan_policies (id, org_id, rate_cap_percent, bm_approval_limit_bdt, guarantors_required, max_active_loans_per_member, min_days_between_loans) values
  ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-0000000000aa', 27.00, 30000.00, 1, 2, 90)
on conflict do nothing;

insert into loan_products (id, org_id, code, name, name_bn, product_type, min_amount, max_amount, term_months, installment_frequency, interest_method, interest_rate, service_charge, processing_fee_rate, insurance_premium_rate, guarantors_required, is_active) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000aa', 'LN-GEN', 'সাধারণ ঋণ', 'সাধারণ মৌসুমি-বিহীন ঋণ', 'general', 5000.00, 50000.00, 12, 'weekly', 'declining_balance', 24.00, 1.00, 1.00, 0.50, 1, true),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-0000000000aa', 'LN-AGRI', 'কৃষি ঋণ', 'মৌসুমি কৃষি ঋণ', 'seasonal_agri', 10000.00, 80000.00, 10, 'monthly', 'flat', 12.50, 0.50, 1.00, 0.50, 1, true),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-0000000000aa', 'LN-EMRG', 'জরুরি ঋণ', 'দ্রুত জরুরি ঋণ', 'emergency', 1000.00, 10000.00, 6, 'weekly', 'flat', 13.00, 0.00, 0.00, 0.00, 0, true)
on conflict do nothing;

insert into loan_applications (id, org_id, branch_id, member_id, product_id, application_number, requested_amount, purpose, status, term_months) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000401', 'LA-DEMO-001', 30000.00, 'পোলট্রি খামার সম্প্রসারণ', 'disbursed', 12),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000401', 'LA-DEMO-002', 20000.00, 'দোকানের মজুত বৃদ্ধি', 'bm_review', 12),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000402', 'LA-DEMO-003', 40000.00, 'গরু ক্রয়', 'submitted', 10)
on conflict do nothing;

-- Pending disbursement for the approved application (no auth-user refs needed).
insert into loan_disbursements (id, org_id, branch_id, application_id, samity_id, status, planned_date, checks)
values (
  '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-0000000000aa',
  '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000c11', 'pending', current_date + interval '7 days',
  '[{"key":"kyc","label":"কেওয়াইসি যাচাই","done":true},{"key":"savings","label":"সঞ্চয় যাচাই","done":true}]'::jsonb
)
on conflict do nothing;

-- Repayment schedule: 10 weekly rows, principal sums to the requested amount.
insert into loan_repayment_schedule (id, org_id, application_id, seq, original_due_date, due_date, principal, interest, total, balance_after)
select
  ('00000000-0000-4000-8000-0000000006' || lpad(seq::text, 2, '0'))::uuid,
  '00000000-0000-4000-8000-0000000000aa'::uuid,
  '00000000-0000-4000-8000-000000000501'::uuid,
  seq,
  current_date - interval '56 days' + (seq * interval '7 days'),
  current_date - interval '56 days' + (seq * interval '7 days'),
  3000.00, 120.00, 3120.00,
  30000.00 - (seq * 3000.00)
from generate_series(1, 10) as seq
on conflict (application_id, seq) do nothing;

-- Installments: first 4 paid.
insert into loan_installments (id, org_id, application_id, seq, due_date, principal, interest, paid_amount, paid_at)
select
  ('00000000-0000-4000-8000-0000000007' || lpad(seq::text, 2, '0'))::uuid,
  '00000000-0000-4000-8000-0000000000aa'::uuid,
  '00000000-0000-4000-8000-000000000501'::uuid,
  seq,
  current_date - interval '56 days' + (seq * interval '7 days'),
  3000.00, 120.00,
  case when seq <= 4 then 3120.00 else 0 end,
  case when seq <= 4 then (current_date - interval '56 days' + (seq * interval '7 days'))::date else null end
from generate_series(1, 10) as seq
on conflict (application_id, seq) do nothing;

insert into loan_application_steps (id, org_id, application_id, stage, action, actor_role, note, created_at)
select v.id::uuid, v.org_id::uuid, v.application_id::uuid, v.stage::loan_stage, v.action::loan_stage_action, v.actor_role, v.note, v.created_at
from (values
  ('00000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000501', 'member_request', 'done', 'account_officer', 'আবেদন গ্রহণ', now() - interval '75 days'),
  ('00000000-0000-4000-8000-0000000007a2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000501', 'bm_review', 'approved', 'branch_manager', 'শাখা ব্যবস্থাপক অনুমোদন', now() - interval '70 days'),
  ('00000000-0000-4000-8000-0000000007a3', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000502', 'officer_visit', 'done', 'account_officer', 'মাঠ পরিদর্শন সম্পন্ন', now() - interval '5 days')
) as v(id, org_id, application_id, stage, action, actor_role, note, created_at)
where not exists (select 1 from loan_application_steps s where s.id = v.id::uuid);

-- ── 6) Accounting: GL accounts + one approved voucher ───────────────────────
insert into gl_accounts (id, org_id, code, name, name_bn, type, category, is_active) values
  ('00000000-0000-4000-8000-0000000008a1', '00000000-0000-4000-8000-0000000000aa', '1001', 'Cash in Hand', 'নগদ তহবিল', 'asset', 'cash', true),
  ('00000000-0000-4000-8000-0000000008a2', '00000000-0000-4000-8000-0000000000aa', '1002', 'Bank Account', 'ব্যাংক হিসাব', 'asset', 'bank', true),
  ('00000000-0000-4000-8000-0000000008a3', '00000000-0000-4000-8000-0000000000aa', '2001', 'Member Savings', 'সদস্য সঞ্চয়', 'liability', 'member', true),
  ('00000000-0000-4000-8000-0000000008a4', '00000000-0000-4000-8000-0000000000aa', '4001', 'Loan Interest Income', 'ঋণ সুদ আয়', 'income', 'income', true),
  ('00000000-0000-4000-8000-0000000008a5', '00000000-0000-4000-8000-0000000000aa', '5001', 'Operating Expense', 'পরিচালন ব্যয়', 'expense', 'expense', true)
on conflict do nothing;

insert into vouchers (id, org_id, branch_id, voucher_number, voucher_type, voucher_date, payee_payer, memo, status, amount_total)
select '00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1',
       'VCH-DEMO-001', 'cash_receipt', current_date, 'সোনালী সমিতি', 'সাপ্তাহিক আদায় (ডেমো)', 'approved', 5000.00
where not exists (select 1 from vouchers where org_id = '00000000-0000-4000-8000-0000000000aa' and voucher_number = 'VCH-DEMO-001');

insert into voucher_lines (id, voucher_id, org_id, account_code, party_name, note, debit, credit)
select v.id::uuid, v.voucher_id::uuid, v.org_id::uuid, v.account_code, v.party_name, v.note, v.debit, v.credit
from (values
  ('00000000-0000-4000-8000-0000000007b1', '00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-0000000000aa', '1001', 'সোনালী সমিতি', 'নগদ গৃহীত', 5000.00::numeric, 0.00::numeric),
  ('00000000-0000-4000-8000-0000000007b2', '00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-0000000000aa', '4001', 'সোনালী সমিতি', 'ঋণ সুদ ও কিস্তি', 0.00::numeric, 5000.00::numeric)
) as v(id, voucher_id, org_id, account_code, party_name, note, debit, credit)
where not exists (select 1 from voucher_lines l where l.id = v.id::uuid);

-- ── 7) HR staff ─────────────────────────────────────────────────────────────
insert into hr_staff (id, org_id, employee_code, name, name_bn, designation, grade, branch_id, joining_date, confirmation_date, status, mobile, email, monthly_gross, nid_masked) values
  ('00000000-0000-4000-8000-0000000009a1', '00000000-0000-4000-8000-0000000000aa', 'EMP-001', 'Md. Anisur Rahman', 'মোঃ আনিসুর রহমান', 'শাখা ব্যবস্থাপক', 'A1', '00000000-0000-4000-8000-0000000000b1', current_date - interval '900 days', current_date - interval '840 days', 'confirmed', '01811000001', 'bm.sadar@samity.test', 42000.00, '1234'),
  ('00000000-0000-4000-8000-0000000009a2', '00000000-0000-4000-8000-0000000000aa', 'EMP-002', 'Sultana Razia', 'সুলতানা রাজিয়া', 'হিসাব কর্মকর্তা', 'A2', '00000000-0000-4000-8000-0000000000b1', current_date - interval '600 days', current_date - interval '540 days', 'confirmed', '01811000002', 'ao.sadar@samity.test', 28000.00, '2345'),
  ('00000000-0000-4000-8000-0000000009a3', '00000000-0000-4000-8000-0000000000aa', 'EMP-003', 'Kamal Hossain', 'কামাল হোসেন', 'শাখা ব্যবস্থাপক', 'A1', '00000000-0000-4000-8000-0000000000b2', current_date - interval '200 days', null, 'probation', '01811000003', 'bm.kazla@samity.test', 38000.00, '3456'),
  ('00000000-0000-4000-8000-0000000009a4', '00000000-0000-4000-8000-0000000000aa', 'EMP-004', 'Rokeya Begum', 'রোকেয়া বেগম', 'ফিল্ড অফিসার', 'B1', '00000000-0000-4000-8000-0000000000b2', current_date - interval '90 days', null, 'probation', '01811000004', 'fo.kazla@samity.test', 19000.00, '4567')
on conflict do nothing;

commit;
