-- ═════════════════════════════════════════════════════════════════════════════
-- demo-seed-full.sql — Samity Manager FULL demo dataset (SQL Editor edition)
-- ─────────────────────────────────────────────────────────────────────────────
-- HOW TO RUN
--   Supabase Dashboard → SQL Editor → New query → paste this WHOLE file → Run.
--   Prerequisite: every migration in supabase/migrations/ (0001 → 0058) applied
--   first (supabase/bootstrap-fresh.sql does migrations + this seed in one paste).
--
--   Idempotent: fixed UUIDs + ON CONFLICT DO NOTHING / guarded inserts make
--   re-runs safe; nothing is deleted. For a truly clean slate run
--   supabase/reset-all.sql first, then this file. (savings_transactions and
--   audit_records are append-only by trigger design and are never deleted.)
--
-- WHAT YOU GET (all modules, one paste)
--   Login user  admin@samity.test / Samity@2026   (super_admin sees everything)
--   1 org · 1 zone · 2 areas · 3 branches · 3 samities · 2 groups · 12 members
--   (+nominees/admission/attendance/notes/consents) · eligibility rules
--   12 savings accounts (one per member) + ledger entries incl. interest/withdrawal
--   share allotments + approved dividend declaration/payments + reconciliation run
--   4 ACTIVE disbursed loans (schedules marked paid; LA-DEMO-001 is 42 DPD overdue,
--     LA-DEMO-003 28 DPD, LA-DEMO-004 21 DPD, LA-DEMO-005 7 DPD) + 1 in-review
--   disbursement records (completed ×4 + pending ×1) + branch cash limits + holidays
--   25 weekly collection entries (realistic allocation shapes, 42-DPD trail)
--   3 cash handovers (submitted/confirmed/shortage) + receipt counters
--   working areas (5 villages) + branch opening proposal + org hierarchy
--   full accounting: 9 GL accounts, 6 event mappings, 3 vouchers, auto journal
--   postings, open cash-book day + lines, petty cash + movement, bank
--   reconciliation + statement line, fund requisition, 3 budgets
--   full HR: 4 staff, salary structures, vacancy + 2 applicants, attendance, 2
--   leaves, 2 holidays, transfer order, approved September payroll + 4 lines,
--   PF ledger ×4, KPI scorecard, appraisal, 1 disciplinary case
--   full work: 3 October targets, 4 tasks (overdue + in_progress + todo ×2 + done),
--   delegation, supervision submission, audit plan + 2 findings, escalation
--   full delinquency: settings, 1 open case (42 DPD) + 2 follow-ups (reminder
--   tasks auto-created by trigger), 2 early-warning signals, root cause
--   welfare: fund rules + 2 requests (grant + loan) + 5 ledger rows
--   credit life policy + insurance claim + micro-insurance products + 2 enrollments
--   governance: dividend distribution + 3 member lines, 2 AGM records, member exit
--   programs: 2 projects (active + proposed), budget line, 3 logframe entries +
--   indicator value, 3 beneficiaries ×2 projects, 4 activities
--   programs ops: 2 expenses, 1 field visit, 1 expense case, 1 funding source + 2 repayments
--   MIS views need no seed; communication: 5 templates + 3 deliveries + opt-out + rules + spend
--   documents: 3 templates (cholito + sadhu) + version + 2 generated documents with
--   verify codes + 1 bulk job + items
--   security: config, 3 consents, 4 retention rules, 1 correction request
--   2 samity meetings (2 closed + attendance 5×2)
--
-- NOTES
--   * auth.users INSERT is safe when Public user signups are disabled (that
--     setting only gates the public endpoint, not SQL). requires pgcrypto
--     crypt(); Supabase projects have it enabled by default.
--   * No other auth.users row is touched: the demo user is created ON CONFLICT
--     DO NOTHING by email, so re-running never duplicates or overwrites.
--   * Every statement is idempotent. Fixed UUIDs keep cross-references stable.
--   * created_by leaves NULL in tables the triggers never read from session —
--     audit triggers (0056) read request.user_id/…, which SQL Editor sessions
--     leave unset, so the audit log simply shows NULL users — harmless for demo.
-- ═════════════════════════════════════════════════════════════════════════════

begin;

-- ── 0) Compat columns the live API expects but no migration defines ─────────
alter table members add column if not exists samity_name text;
alter table members add column if not exists deleted_by uuid references auth.users (id) on delete set null;
alter table collection_entries add column if not exists collected_by_name text;
alter table members add column if not exists email text;

-- ── 1) No destructive wipe here: every insert below is guarded, so this file
--    can be re-run at any time. Run supabase/reset-all.sql first if you want
--    a from-zero reset (audit_records + savings ledger are append-only and
--    can never be DELETEd, so the wipe would abort the whole script).


-- ═════════════════════════════════════════════════════════════════════════════
-- A) LOGIN USER (Supabase Auth) — must exist before org-scoped seeds
-- ═════════════════════════════════════════════════════════════════════════════
-- Password 'Samity@2026' pre-hashed with pgcrypto.crypt (bf algorithm).
--
-- Wrapped in a DO block with an exception handler. Some Supabase projects add
-- NOT NULL columns or triggers on auth.users; a raw failure here would abort
-- the whole transaction and leave you with data but NO login user (the exact
-- cause of "incorrect email or password"). The handler keeps the seed atomic
-- for everything else and reports a notice instead.
--
-- If this block prints a notice, the login user was NOT created — run
--   node scripts/ensure-demo-user.mjs
-- which uses the Admin API (guaranteed GoTrue-compatible hash + identity row).
do $$
begin
  insert into auth.users (
    instance_id, id, aud, "role", email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data
  )
  values
    ('00000000-0000-0000-0000-000000000000'::uuid,
     '00000000-0000-4000-8000-000000000001'::uuid,
     'authenticated', 'authenticated',
     'admin@samity.test',
     crypt('Samity@2026', gen_salt('bf', 10)),
     now(), now(), now(),
     '', '', '', '',
     '{"provider":"email","providers":["email"],"role":"super_admin","org_id":"00000000-0000-4000-8000-0000000000aa","branch_id":null}'::jsonb,
     '{"full_name":"Demo Super Admin"}'::jsonb)
  on conflict do nothing;

  insert into auth.identities (
    id, user_id, identity_data, provider_id, provider, last_sign_in_at, created_at, updated_at
  )
  select
    '00000000-0000-4000-8000-000000000002'::uuid,
    u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email, 'provider', 'email', 'providers', '["email"]'::jsonb),
    u.id::text, 'email',
    now(), now(), now()
  from auth.users u where u.email = 'admin@samity.test'
  on conflict do nothing;
exception when others then
  raise notice 'auth seed skipped (%). Run scripts/ensure-demo-user.mjs to create the demo login user.', sqlerrm;
end $$;


-- ═════════════════════════════════════════════════════════════════════════════
-- B) ORGANIZATION STRUCTURE
-- ═════════════════════════════════════════════════
insert into organizations (id, name, name_bn, code, created_by) values
  ('00000000-0000-4000-8000-0000000000aa', 'Samity Demo Organization', 'সমিতি ডেমো সংস্থা', 'DEMO-ORG', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- Mirror the profile row the org structure expects (users_profile is 1:1 with auth.users).
insert into users_profile (id, org_id, branch_id, role, full_name, phone)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1',
        'super_admin', 'Demo Super Admin', '01700000001')
on conflict (id) do nothing;




insert into zones (id, org_id, code, name, name_bn, created_by) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000aa', 'Z-01', 'Northern Zone', 'উত্তর অঞ্চল', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into areas (id, org_id, zone_id, code, name, name_bn, created_by) values
  ('00000000-0000-4000-8000-00000000a101', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000a001', 'A-01', 'Sirajganj Area', 'সিরাজগঞ্জ এরিয়া', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-00000000a102', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000a001', 'A-02', 'Pabna Area', 'পাবনা এরিয়া', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into branches (id, org_id, area_id, name, name_bn, code, district, status, opening_date, address, gps_lat, gps_lng, created_by) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000a101', 'Sadar Branch', 'সদর শাখা', 'BR-001', 'Sirajganj', 'active', current_date - interval '400 days', 'সিরাজগঞ্জ সদর, বাংলাদেশ', 24.453900, 89.700700, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000a102', 'Kazla Branch', 'কাজলা শাখা', 'BR-002', 'Pabna', 'active', current_date - interval '180 days', 'পাবনা কাজলা, বাংলাদেশ', 24.418000, 89.669000, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-00000000a101', 'Shahzadpur Branch', 'শাহজাদপুর শাখা', 'BR-003', 'Sirajganj', 'planned', null, 'শাহজাদপুর, সিরাজগঞ্জ', 24.286000, 89.606000, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into branch_cash_limits (branch_id, org_id, cash_limit, updated_by) values
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000aa', 200000.00, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000aa', 150000.00, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into working_areas (id, org_id, division, district, upazila, "union", village,
                           division_bn, district_bn, upazila_bn, union_bn, village_bn,
                           population, households, market_days, competitor_mfis, potential_score,
                           gps_lat, gps_lng, branch_id, surveyed_at, created_by) values
  ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-0000000000aa', 'Rajshahi', 'Sirajganj', 'Sirajganj Sadar', 'Sadar', 'রামপুর',
   'রাজশাহী', 'সিরাজগঞ্জ', 'সদর', 'সদর', 'রামপুর', 1250, 310, 'শুক্র+মঙ্গল', 2, 4, 24.4539, 89.7007,
   '00000000-0000-4000-8000-0000000000b1', now() - interval '420 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-0000000000aa', 'Rajshahi', 'Sirajganj', 'Sirajganj Sadar', 'Sadar', 'চাঁদপুর',
   'রাজশাহী', 'সিরাজগঞ্জ', 'সদর', 'সদর', 'চাঁদপুর', 980, 240, 'শনি', 1, 4, 24.4602, 89.6950,
   '00000000-0000-4000-8000-0000000000b1', now() - interval '420 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000002003', '00000000-0000-4000-8000-0000000000aa', 'Rajshahi', 'Pabna', 'Ishwardi', 'Mirkamarpur', 'মির্জাপুর',
   'রাজশাহী', 'পাবনা', 'ঈশ্বরদী', 'মিরকামারপুর', 'মির্জাপুর', 2100, 520, 'রবি+বৃহ', 3, 5, 24.4190, 89.6710,
   '00000000-0000-4000-8000-0000000000b2', now() - interval '200 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000002004', '00000000-0000-4000-8000-0000000000aa', 'Rajshahi', 'Sirajganj', 'Shahzadpur', 'Shahzadpur', 'শাহজাদপুর',
   'রাজশাহী', 'সিরাজগঞ্জ', 'শাহজাদপুর', 'শাহজাদপুর', 'শাহজাদপুর', 3400, 860, 'বৃহ+শুক্র', 2, 4, 24.2860, 89.6060,
   null, now() - interval '30 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000002005', '00000000-0000-4000-8000-0000000000aa', 'Rajshahi', 'Pabna', 'Ishwardi', 'Mirkamarpur', 'চরমালিকা',
   'রাজশাহী', 'পাবনা', 'ঈশ্বরদী', 'মিরকামারপুর', 'চরমালিকা', 760, 180, 'শনি', 0, 3, 24.4300, 89.6850,
   '00000000-0000-4000-8000-0000000000b2', now() - interval '190 days', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into branch_openings (id, org_id, branch_id, stage, proposal_note, proposed_by, proposed_at, created_by) values
  ('00000000-0000-4000-8000-000000000e51', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b3', 'proposed',
   'শাহজাদপুরে নতুন শাখার প্রস্তাব — জরিপ সম্পন্ন (ডেমো)', '00000000-0000-4000-8000-000000000001', now() - interval '10 days', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- C) SAMITIES, GROUPS, LEADERSHIP, MEETINGS
-- ═════════════════════════════════════════════════════════════════════════════
insert into samities (id, org_id, branch_id, code, name, village, meeting_day, meeting_time, meeting_place, status, formation_stage, projection_note, observed_at, activated_at, created_at, created_by) values
  ('00000000-0000-4000-8000-000000000c11', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'S-101', 'সোনালী সমিতি', 'রামপুর', 'friday', '17:30', 'রামপুর সরকারি প্রাথমিক বিদ্যালয়', 'active', 'active', '৫০ জন সম্ভাব্য সদস্য (ডেমো)', now() - interval '380 days', now() - interval '370 days', now() - interval '390 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000c12', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'S-102', 'রূপালী সমিতি', 'চাঁদপুর', 'saturday', '16:00', 'চাঁদপুর মহিলা ক্লাব', 'active', 'active', '৪৫ জন সম্ভাব্য সদস্য (ডেমো)', now() - interval '330 days', now() - interval '320 days', now() - interval '340 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000c21', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', 'S-201', 'একতা সমিতি', 'মির্জাপুর', 'sunday', '17:00', 'মির্জাপুর কমিউনিটি সেন্টার', 'active', 'active', '৬০ জন সম্ভাব্য সদস্য (ডেমো)', now() - interval '160 days', now() - interval '150 days', now() - interval '170 days', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into groups (id, org_id, samity_id, name, status, member_count, created_by) values
  ('00000000-0000-4000-8000-000000000d11', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000c11', 'ক দল', 'active', 4, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000d12', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000c12', 'খ দল', 'active', 2, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;


insert into samity_leaders (id, org_id, samity_id, chief_name, deputy_name, secretary_name, rotation_start, rotation_end) values
  ('00000000-0000-4000-8000-000000000d31', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000c11', 'রাহেলা বেগম', 'আব্দুল করিম', 'ফাতেমা খাতুন', current_date - interval '30 days', current_date + interval '60 days'),
  ('00000000-0000-4000-8000-000000000d32', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000c21', 'জসিম উদ্দিন', 'নাজমা হক', 'শিরিন সুলতানা', current_date - interval '20 days', current_date + interval '70 days')
on conflict do nothing;

insert into holiday_calendar (id, org_id, date, reason) values
  ('00000000-0000-4000-8000-000000000d41', '00000000-0000-4000-8000-0000000000aa', current_date + interval '20 days', 'ঈদে মিলাদুন্নবী'),
  ('00000000-0000-4000-8000-000000000d42', '00000000-0000-4000-8000-0000000000aa', current_date + interval '45 days', 'মহান বিজয় দিবস')
on conflict do nothing;

-- Two closed meetings with attendance (5 members each) — feeding MIS pages.
insert into samity_meetings (id, org_id, samity_id, meeting_date, start_time, end_time, status, gps_lat, gps_lng, attendance_total, cash_total, notes, created_by) values
  ('00000000-0000-4000-8000-000000000d51', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000c11', current_date - interval '7 days', '17:30', '18:45', 'closed', 24.4539, 89.7007, 5, 3050.00, 'সাপ্তাহিক সভা (ডেমো)', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000d52', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000c21', current_date - interval '5 days', '17:00', '18:00', 'closed', 24.4190, 89.6710, 5, 2800.00, 'সাপ্তাহিক সভা (ডেমো)', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;


-- ═════════════════════════════════════════════════════════════════════════════
-- D) MEMBERS (12) + member module
-- ═════════════════════════════════════════════════════════════════════════════
insert into eligibility_rules (org_id, min_age, max_age, max_land_decimals, one_member_per_household, max_monthly_income, women_only, created_by)
values ('00000000-0000-4000-8000-0000000000aa', 18, 60, 50, true, 0, false, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into members (id, org_id, branch_id, samity_id, member_code, passbook_no, full_name, full_name_bn, phone, national_id,
                     status, lifecycle, join_date, samity_name, occupation, address, created_at, created_by) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c11', 'MEM-DEMO-001', 'PB-DEMO-001', 'Rahela Begum', 'মোছাঃ রাহেলা বেগম', '01711000001', '1990123456001', 'active', 'active', current_date - interval '380 days', 'সোনালী সমিতি', 'পোলট্রি খামার', 'রামপুর, সিরাজগঞ্জ', now() - interval '380 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c11', 'MEM-DEMO-002', 'PB-DEMO-002', 'Abdul Karim', 'মোঃ আব্দুল করিম', '01711000002', '1985123456002', 'active', 'active', current_date - interval '370 days', 'সোনালী সমিতি', 'ক্ষুদ্র ব্যবসা', 'রামপুর, সিরাজগঞ্জ', now() - interval '370 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c11', 'MEM-DEMO-003', 'PB-DEMO-003', 'Fatema Khatun', 'মোসাঃ ফাতেমা খাতুন', '01711000003', '1992123456003', 'active', 'active', current_date - interval '350 days', 'সোনালী সমিতি', 'তাঁত শিল্প', 'রামপুর, সিরাজগঞ্জ', now() - interval '350 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c12', 'MEM-DEMO-004', 'PB-DEMO-004', 'Shahjahan Mia', 'মোঃ শাহজাহান মিয়া', '01711000004', '1988123456004', 'active', 'active', current_date - interval '320 days', 'রূপালী সমিতি', 'ভ্যান চালক', 'চাঁদপুর, সিরাজগঞ্জ', now() - interval '320 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c12', 'MEM-DEMO-005', 'PB-DEMO-005', 'Salma Akter', 'মোছাঃ সালমা আক্তার', '01711000005', '1995123456005', 'active', 'active', current_date - interval '300 days', 'রূপালী সমিতি', 'মুদি দোকান', 'চাঁদপুর, সিরাজগঞ্জ', now() - interval '300 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000c21', 'MEM-DEMO-006', 'PB-DEMO-006', 'Jasim Uddin', 'মোঃ জসিম উদ্দিন', '01711000006', '1987123456006', 'active', 'active', current_date - interval '150 days', 'একতা সমিতি', 'গরু পালন', 'মির্জাপুর, পাবনা', now() - interval '150 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000c21', 'MEM-DEMO-007', 'PB-DEMO-007', 'Nazma Haque', 'মোসাঃ নাজমা হক', '01711000007', '1993123456007', 'active', 'active', current_date - interval '140 days', 'একতা সমিতি', 'সেলাই কারখানা', 'মির্জাপুর, পাবনা', now() - interval '140 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000c21', 'MEM-DEMO-008', 'PB-DEMO-008', 'Rafiqul Islam', 'মোঃ রফিকুল ইসলাম', '01711000008', null, 'inactive', 'dormant', current_date - interval '120 days', 'একতা সমিতি', 'কৃষি দিনমজুর', 'মির্জাপুর, পাবনা', now() - interval '120 days', '00000000-0000-4000-8000-000000000001'),
  -- 009-012 support CRUD demos; 012 is pending admission (lifecycle=pending).
  ('00000000-0000-4000-8000-000000000109', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c11', 'MEM-DEMO-009', 'PB-DEMO-009', 'Morium Akter', 'মোছাঃ মরিয়ম আক্তার', '01711000009', '1996123456009', 'active', 'active', current_date - interval '90 days', 'সোনালী সমিতি', 'মুরগি খামার', 'রামপুর, সিরাজগঞ্জ', now() - interval '90 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c12', 'MEM-DEMO-010', 'PB-DEMO-010', 'Kamal Hossain', 'মোঃ কামাল হোসেন', '01711000010', '1986123456010', 'active', 'active', current_date - interval '80 days', 'রূপালী সমিতি', 'ইটভাটা শ্রমিক', 'চাঁদপুর, সিরাজগঞ্জ', now() - interval '80 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000c21', 'MEM-DEMO-011', 'PB-DEMO-011', 'Shirin Sultana', 'মোছাঃ শিরিন সুলতানা', '01711000011', '1994123456011', 'active', 'active', current_date - interval '60 days', 'একতা সমিতি', 'সেলাই কারখানা', 'মির্জাপুর, পাবনা', now() - interval '60 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000c21', 'MEM-DEMO-012', 'PB-DEMO-012', 'Alamin Sheikh', 'মোঃ আল আমিন শেখ', '01711000012', null, 'active', 'pending', current_date - interval '30 days', 'একতা সমিতি', 'ভ্যান চালক', 'মির্জাপুর, পাবনা', now() - interval '30 days', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- Group memberships + meeting attendance (after members: member_id FK).
insert into group_members (id, org_id, group_id, member_id, is_leader, joined_at) values
  ('00000000-0000-4000-8000-000000000d21', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d11', '00000000-0000-4000-8000-000000000101', true,  current_date - interval '370 days'),
  ('00000000-0000-4000-8000-000000000d22', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d11', '00000000-0000-4000-8000-000000000102', false, current_date - interval '360 days'),
  ('00000000-0000-4000-8000-000000000d23', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d11', '00000000-0000-4000-8000-000000000103', false, current_date - interval '340 days'),
  ('00000000-0000-4000-8000-000000000d24', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d11', '00000000-0000-4000-8000-000000000104', false, current_date - interval '310 days'),
  ('00000000-0000-4000-8000-000000000d25', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d12', '00000000-0000-4000-8000-000000000105', true,  current_date - interval '290 days'),
  ('00000000-0000-4000-8000-000000000d26', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d12', '00000000-0000-4000-8000-000000000106', false, current_date - interval '150 days')
on conflict do nothing;

insert into meeting_attendance (id, org_id, meeting_id, member_id, present, savings_amount, installment_amount) values
  ('00000000-0000-4000-8000-000000000d61', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d51', '00000000-0000-4000-8000-000000000101', true,  250.00, 2620.00),
  ('00000000-0000-4000-8000-000000000d62', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d51', '00000000-0000-4000-8000-000000000102', true,  310.00, 0.00),
  ('00000000-0000-4000-8000-000000000d63', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d51', '00000000-0000-4000-8000-000000000103', true,  430.00, 0.00),
  ('00000000-0000-4000-8000-000000000d64', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d51', '00000000-0000-4000-8000-000000000104', true,  190.00, 0.00),
  ('00000000-0000-4000-8000-000000000d65', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d51', '00000000-0000-4000-8000-000000000110', false, 0.00, 0.00),
  ('00000000-0000-4000-8000-000000000d66', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d52', '00000000-0000-4000-8000-000000000106', true,  420.00, 4420.00),
  ('00000000-0000-4000-8000-000000000d67', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d52', '00000000-0000-4000-8000-000000000107', true,  300.00, 1390.00),
  ('00000000-0000-4000-8000-000000000d68', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d52', '00000000-0000-4000-8000-000000000108', false, 0.00, 0.00),
  ('00000000-0000-4000-8000-000000000d69', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d52', '00000000-0000-4000-8000-000000000111', true,  260.00, 0.00),
  ('00000000-0000-4000-8000-000000000d70', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d52', '00000000-0000-4000-8000-000000000112', true,  160.00, 0.00)
on conflict do nothing;


-- Group memberships + meeting attendance (after members: member_id FK).



-- Insurance policies (from the old compact seed).
insert into member_insurance (id, org_id, branch_id, member_id, product, premium, coverage, status, created_by)
select v.id::uuid, v.org_id::uuid, v.branch_id::uuid, v.member_id::uuid, v.product, v.premium, v.coverage, v.status, '00000000-0000-4000-8000-000000000001'
from (values
  ('00000000-0000-4000-8000-0000000001a1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000101', 'life', 250.00::numeric, 25000.00::numeric, 'active'),
  ('00000000-0000-4000-8000-0000000001a2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000103', 'life', 250.00::numeric, 25000.00::numeric, 'active'),
  ('00000000-0000-4000-8000-0000000001a3', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000106', 'life', 300.00::numeric, 30000.00::numeric, 'active')
) as v(id, org_id, branch_id, member_id, product, premium, coverage, status)
where not exists (select 1 from member_insurance m where m.id = v.id::uuid);

-- Nominees (shares ≤ 100 per member — trigger enforced).
insert into member_nominees (id, org_id, member_id, name, relation, share_pct, phone, created_by) values
  ('00000000-0000-4000-8000-0000000001b1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000101', 'মোঃ মোজাম্মেল হোসেন', 'স্বামী', 60, '01712000001', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000001b2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000101', 'মিস্টি আক্তার', 'কন্যা', 40, null, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000001b3', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000102', 'আমেনা বেগম', 'স্ত্রী', 100, '01712000002', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000001b4', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000106', 'তাসলিমা সুলতানা', 'স্ত্রী', 100, '01712000003', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- One completed admission (wizard + history; stage member_issued) + two pending.
insert into member_admissions (id, org_id, branch_id, draft, stage, stage_history, member_number, passbook_no, member_id, created_by) values
  ('00000000-0000-4000-8000-0000000001c1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1',
   '{"fullName":"মোছাঃ রাহেলা বেগম","phone":"01711000001","suggestedSamity":"সোনালী সমিতি"}'::jsonb,
   'member_issued',
   '[{"stage":"field_survey","ok":true},{"stage":"eligibility_screening","ok":true},{"stage":"household_verification","ok":true},{"stage":"manager_approval","ok":true},{"stage":"orientation_completed","ok":true},{"stage":"member_issued","ok":true}]'::jsonb,
   'MEM-DEMO-001', 'PB-DEMO-001', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000001c2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2',
   '{"fullName":"মোঃ আল আমিন শেখ","phone":"01711000012","suggestedSamity":"একতা সমিতি"}'::jsonb,
   'household_verification', '[{"stage":"field_survey","ok":true},{"stage":"eligibility_screening","ok":true}]'::jsonb,
   null, null, null, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000001c3', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1',
   '{"fullName":"মোছাঃ মরিয়ম আক্তার","phone":"01711000009","suggestedSamity":"সোনালী সমিতি"}'::jsonb,
   'manager_approval', '[{"stage":"field_survey","ok":true},{"stage":"eligibility_screening","ok":true},{"stage":"household_verification","ok":true}]'::jsonb,
   null, null, null, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- Attendance + notes + status history + consents (Member 360 + security demo).
insert into member_attendance (id, org_id, member_id, samity_name, meeting_date, present, recorded_by)
select md5((m.id || 'att' || g.idx)::text)::uuid,
       '00000000-0000-4000-8000-0000000000aa',
       m.id,
       x.samity_name,
       current_date - interval '7 days',
       g.idx % 5 <> 0,
       '00000000-0000-4000-8000-000000000001'
from members m
cross join (values ('সোনালী সমিতি'), ('রূপালী সমিতি')) as x(samity_name),
     lateral generate_series(1, 6) as g(idx)
where m.member_code like 'MEM-DEMO-%' and m.lifecycle = 'active'
  and not exists (select 1 from member_attendance a where a.member_id = m.id and a.meeting_date = current_date - interval '7 days')
on conflict (member_id, meeting_date) do nothing;

insert into member_notes (id, org_id, member_id, note, created_by)
select md5((m.id || 'note' || g.idx)::text)::uuid,
       '00000000-0000-4000-8000-0000000000aa', m.id, x.note,
       '00000000-0000-4000-8000-000000000001'
from members m
cross join (values ('কেন্দ্রে নিয়মিত উপস্থিত (ডেমো নোট)'), ('পিএফ ও সঞ্চয় আদায় হালনাগাদ আছে')) as x(note),
     lateral generate_series(1, 2) as g(idx)
where m.member_code in ('MEM-DEMO-001', 'MEM-DEMO-002', 'MEM-DEMO-006') and
      not exists (select 1 from member_notes n where n.member_id = m.id and n.note = x.note)
on conflict (member_id, note) do nothing;

insert into member_status_history (id, org_id, member_id, status, reason_code, changed_by)
select md5((m.id || 'sh' || g.idx)::text)::uuid,
       '00000000-0000-4000-8000-0000000000aa', m.id, 'active'::member_lifecycle, 'PASSBOOK_ISSUE', '00000000-0000-4000-8000-000000000001'
from members m, lateral generate_series(1, 1) as g(idx)
where m.member_code like 'MEM-DEMO-0%'
  and not exists (select 1 from member_status_history h where h.member_id = m.id)
on conflict (member_id) do nothing;

insert into member_consents (id, org_id, member_id, kind, granted, method, granted_at, recorded_by)
select md5((m.id || 'consent' || g.idx)::text)::uuid,
       '00000000-0000-4000-8000-0000000000aa', m.id,
       'data_processing', true, 'written', now() - interval '370 days',
       '00000000-0000-4000-8000-000000000001'
from members m, lateral generate_series(1, 1) as g(idx)
where m.member_code in ('MEM-DEMO-001', 'MEM-DEMO-002', 'MEM-DEMO-006')
  and not exists (select 1 from member_consents c where c.member_id = m.id and c.kind = 'data_processing')
on conflict (member_id, kind) do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- E) SAVINGS (products, 12 accounts, ledger, interest, reconciliation)
-- ═════════════════════════════════════════════════════════════════════════════
insert into savings_products (id, org_id, code, name, name_bn, product_type, interest_rate, compounding, min_balance, withdrawal_limit, withdrawal_limit_period, maturity_months, is_active) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-0000000000aa', 'SV-GEN', 'সাধারণ সঞ্চয়', 'সাধারণ সঞ্চয় হিসাব', 'voluntary', 8.00, 'simple', 50.00, 5000.00, 'per_tx', 0, true),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-0000000000aa', 'SV-DPS', 'মাসিক সঞ্চয় (ডিপিএস)', 'ডিপিএস হিসাব', 'dps', 11.00, 'monthly', 500.00, 0.00, 'per_tx', 60, true)
on conflict do nothing;

insert into savings_accounts (id, org_id, branch_id, member_id, product_id, product, account_number, balance, status, opening_date, created_by) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-01', 4594.00, 'active', current_date - interval '380 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-02', 8200.00, 'active', current_date - interval '370 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000302', 'dps', 'SA-DEMO-03', 6043.00, 'active', current_date - interval '350 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-04', 2100.00, 'active', current_date - interval '320 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000302', 'dps', 'SA-DEMO-05', 3000.00, 'active', current_date - interval '300 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-06', 12000.00, 'active', current_date - interval '150 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000207', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-07', 1500.00, 'active', current_date - interval '140 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000208', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000108', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-08', 400.00, 'dormant', current_date - interval '120 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000209', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000109', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-09', 2600.00, 'active', current_date - interval '90 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000210', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000110', '00000000-0000-4000-8000-000000000302', 'dps', 'SA-DEMO-10', 5200.00, 'active', current_date - interval '80 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000211', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-11', 1900.00, 'active', current_date - interval '60 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000212', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000301', 'general', 'SA-DEMO-12', 800.00, 'active', current_date - interval '30 days', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- F) SAVINGS LEDGER (immutable — a single "opening deposit" per account keeps
--    stored balance == ledger sum, so reconciliation reports 'ok')
-- ═════════════════════════════════════ Σ
insert into savings_transactions (id, org_id, account_id, transaction_type, amount, balance_after, reference, created_at, created_by)
select md5((a.id || 'dep' || g.idx)::text)::uuid,
       '00000000-0000-4000-8000-0000000000aa'::uuid,
       a.id, 'deposit', a.balance, a.balance,
       'ডেমো সমিতি সঞ্চয় প্রসঙ্গে প্রারম্ভিক জমা', now() - interval '60 days',
       '00000000-0000-4000-8000-000000000001'::uuid
from savings_accounts a
cross join lateral generate_series(1, 12) as g(idx)
where a.org_id = '00000000-0000-4000-8000-0000000000aa'
  and a.account_number like 'SA-DEMO-%'
  and not exists (
    select 1 from savings_transactions t
    where t.account_id = a.id and t.reference like '%প্রসঙ্গে প্রারম্ভিক জমা%'
  )

-- One interest entry (SA-DEMO-01, monthly period key — reconciliation stays equal
// because the account balance already includes the extra 94 + 43).
insert into savings_transactions (id, org_id, account_id, transaction_type, amount, balance_after, reference, interest_period, created_at, created_by)
select '00000000-0000-4000-8000-000000000240', '00000000-0000-4000-8000-0000000000aa',
       a.id, 'interest', 94.00, a.balance, 'মাসিক সুদ পোস্টিং (ডেমো)', '2026-09',
       now() - interval '15 days', '00000000-0000-4000-8000-000000000001'
from savings_accounts a
where a.account_number = 'SA-DEMO-01'
  and not exists (select 1 from savings_transactions t where t.account_id = a.id and t.transaction_type = 'interest');



-- One withdrawal (SA-DEMO-06 only — no active loan on that member; balance 12000 → 11440).
insert into savings_transactions (id, org_id, account_id, transaction_type, amount, balance_after, reference, created_at, created_by)
select '00000000-0000-4000-8000-000000000241', '00000000-0000-4000-8000-0000000000aa',
       a.id, 'withdrawal', 560.00, a.balance - 560.00, 'সঞ্চয় উত্তোলন (ডেমো)', now() - interval '10 days',
       '00000000-0000-4000-8000-000000000001'
from savings_accounts a
where a.account_number = 'SA-DEMO-06'
  and not exists (select 1 from savings_transactions t where t.account_id = a.id and t.reference like 'সঞ্চয় উত্তোলন%');

-- Keep account balance consistent with the ledger after the withdrawal.
update savings_accounts a set balance = a.balance - 560.00
where a.account_number = 'SA-DEMO-06'
  and exists (select 1 from savings_transactions t where t.account_id = a.id and t.reference like 'সঞ্চয় উত্তোলন%');

-- ═════════════════════════════════════════════════════════════════════════════
-- G) SHARES, DIVIDENDS, RECONCILIATION
-- ═════════════════════════════════════════════════════════════════════════════
insert into share_allotments (id, org_id, member_id, product_id, shares, face_value, paid_amount, paid_shares, reference, created_by)
select md5((m.id || 'share' || g.idx)::text)::uuid,
       '00000000-0000-4000-8000-0000000000aa', m.id,
       '00000000-0000-4000-8000-000000000301', 2, 100.00, 200.00, 2,
       'ডেমো শেয়ার ক্রয়', '00000000-0000-4000-8000-000000000001'
from members m,
     lateral generate_series(1, 4) as g(idx)
where m.member_code in ('MEM-DEMO-001', 'MEM-DEMO-002', 'MEM-DEMO-006', 'MEM-DEMO-007')
  and not exists (select 1 from share_allotments s where s.member_id = m.id)
on conflict (member_id, product_id) do nothing;

insert into dividend_declarations (id, org_id, product_id, financial_year, surplus, payout_rate, dividend_pool, retained, approved_by_meeting_ref, approved_at, status, approved_by, created_by)
values ('00000000-0000-4000-8000-000000000221', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000301', '2025-26',
        20000.00, 40.00, 8000.00, 12000.00, 'AGM/2025-26', now() - interval '20 days', 'approved', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001')
on conflict (org_id, product_id, financial_year) do nothing;

insert into dividend_payments (id, org_id, declaration_id, member_id, paid_shares, face_value, amount, paid_at, created_by)
select md5((m.id || 'div' || g.idx)::text)::uuid,
       '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000221', m.id, 2, 100.00, 160.00,
       now() - interval '18 days', '00000000-0000-4000-8000-000000000001'
from members m,
     lateral generate_series(1, 4) as g(idx)
where m.member_code in ('MEM-DEMO-001', 'MEM-DEMO-002', 'MEM-DEMO-006', 'MEM-DEMO-007')
  and not exists (select 1 from dividend_payments p where p.member_id = m.id and p.declaration_id = '00000000-0000-4000-8000-000000000221')
on conflict (member_id, declaration_id) do nothing;

insert into reconciliation_runs (id, org_id, run_at, checked, mismatches, results, created_by)
values ('00000000-0000-4000-8000-000000000241', '00000000-0000-4000-8000-0000000000aa', now() - interval '1 day', 12, 0,
        '[]'::jsonb, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- H) LOANS — policy, products, applications, disbursements, schedules
-- ═════════════════════════════════════════════════════════════════════════════
insert into loan_policies (id, org_id, rate_cap_percent, bm_approval_limit_bdt, guarantors_required, max_active_loans_per_member, min_days_between_loans)
values ('00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-0000000000aa', 27.00, 30000.00, 1, 2, 90)
on conflict do nothing;

insert into loan_products (id, org_id, code, name, name_bn, product_type, min_amount, max_amount, term_months, installment_frequency, interest_method, interest_rate, service_charge, processing_fee_rate, insurance_premium_rate, guarantors_required, is_active) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-0000000000aa', 'LN-GEN', 'সাধারণ ঋণ', 'সাধারণ মৌসুমি-বিহীন ঋণ', 'general', 5000.00, 50000.00, 12, 'weekly', 'declining_balance', 24.00, 1.00, 1.00, 0.50, 1, true),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-0000000000aa', 'LN-AGRI', 'কৃষি ঋণ', 'মৌসুমি কৃষি ঋণ', 'seasonal_agri', 10000.00, 80000.00, 10, 'monthly', 'flat', 12.50, 0.50, 1.00, 0.50, 1, true),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-0000000000aa', 'LN-EMRG', 'জরুরি ঋণ', 'দ্রুত জরুরি ঋণ', 'emergency', 1000.00, 10000.00, 6, 'weekly', 'flat', 13.00, 0.00, 0.00, 0.00, 0, true)
on conflict do nothing;

insert into loan_applications (id, org_id, branch_id, member_id, product_id, application_number, requested_amount, purpose, status, term_months) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000401', 'LA-DEMO-001', 30000.00, 'পোলট্রি খামার সম্প্রসারণ', 'disbursed', 12),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000401', 'LA-DEMO-002', 20000.00, 'দোকানের মজুত বৃদ্ধি', 'bm_review', 12),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000402', 'LA-DEMO-003', 40000.00, 'গরু ক্রয়', 'disbursed', 10),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000401', 'LA-DEMO-004', 20000.00, 'দোকানের স্টক পুনর্বহাল', 'disbursed', 12),
  ('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000403', 'LA-DEMO-005', 8000.00, 'জরুরি চিকিৎসা', 'disbursed', 6),
  ('00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000401', 'LA-DEMO-006', 15000.00, 'সেলাই মেশিন ক্রয়', 'bm_review', 12),
  ('00000000-0000-4000-8000-000000000507', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000105', '00000000-0000-4000-8000-000000000402', 'LA-DEMO-007', 25000.00, 'মুদি দোকান সম্প্রসারণ', 'submitted', 10)
on conflict do nothing;

insert into loan_application_steps (id, org_id, application_id, stage, action, actor_role, note, created_at)
select v.id::uuid, v.org_id::uuid, v.application_id::uuid, v.stage::loan_stage, v.action::loan_stage_action, v.actor_role, v.note, v.created_at
from (values
  ('00000000-0000-4000-8000-0000000007a1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000501', 'member_request', 'done', 'account_officer', 'আবেদন গ্রহণ', now() - interval '75 days'),
  ('00000000-0000-4000-8000-0000000007a2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000501', 'bm_review', 'approved', 'branch_manager', 'শাখা ব্যবস্থাপক অনুমোদন', now() - interval '70 days'),
  ('00000000-0000-4000-8000-0000000007a3', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000502', 'officer_visit', 'done', 'account_officer', 'মাঠ পরিদর্শন সম্পন্ন', now() - interval '5 days'),
  ('00000000-0000-4000-8000-0000000007a4', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000506', 'member_request', 'done', 'account_officer', 'আবেদন গ্রহণ', now() - interval '3 days')
) as v(id, org_id, application_id, stage, action, actor_role, note, created_at)
where not exists (select 1 from loan_application_steps s where s.id = v.id::uuid);

-- Disbursements: 4 completed (disbursed_by = demo user — completion guard) + 1 pending queue row.
insert into loan_disbursements (id, org_id, branch_id, application_id, samity_id, status, planned_date, mode, disbursement_date, cash_received_by_name, disbursed_by, disbursed_at, checks, created_by) values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000c11', 'completed', current_date - interval '70 days', 'cash_center', (current_date - interval '70 days'), 'রাহেলা বেগম', '00000000-0000-4000-8000-000000000001', now() - interval '70 days', '[{"key":"kyc","label":"কেওয়াইসি যাচাই","done":true},{"key":"savings","label":"সঞ্চয় যাচাই","done":true},{"key":"group","label":"দল অনুমোদন","done":true}]'::jsonb, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000c21', 'completed', current_date - interval '184 days', 'cash_center', (current_date - interval '184 days'), 'জসিম উদ্দিন', '00000000-0000-4000-8000-000000000001', now() - interval '184 days', '[{"key":"kyc","label":"কেওয়াইসি যাচাই","done":true},{"key":"savings","label":"সঞ্চয় যাচাই","done":true}]'::jsonb, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000603', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000c12', 'completed', current_date - interval '94 days', 'cash_branch', (current_date - interval '94 days'), 'আব্দুল করিম', '00000000-0000-4000-8000-000000000001', now() - interval '94 days', '[{"key":"kyc","label":"কেওয়াইসি যাচাই","done":true},{"key":"savings","label":"সঞ্চয় যাচাই","done":true}]'::jsonb, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000604', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000c21', 'completed', current_date - interval '35 days', 'cash_center', (current_date - interval '35 days'), 'নাজমা হক', '00000000-0000-4000-8000-000000000001', now() - interval '35 days', '[{"key":"kyc","label":"কেওয়াইসি যাচাই","done":true},{"key":"savings","label":"সঞ্চয় যাচাই","done":true}]'::jsonb, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000605', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000c11', 'pending', current_date + interval '7 days',
   null, null, null, null, null,
   '[{"key":"kyc","label":"কেওয়াইসি যাচাই","done":true},{"key":"savings","label":"সঞ্চয় যাচাই","done":true}]'::jsonb, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- Repayment schedules — one application at a time (the Σprincipal guard reads
-- the application row; seq 1 first sneaks past the "exceeds" check only when
-- the running total is built from existing rows).
insert into loan_repayment_schedule
  (id, org_id, application_id, seq, original_due_date, due_date, principal, interest, total, balance_after, paid_amount, paid_at, created_by)
select
  ('00000000-0000-4000-8000-610' || v.app_char || lpad(g.seq::text, 2, '0') || '000000')::uuid,
  '00000000-0000-4000-8000-0000000000aa'::uuid, v.application_id::uuid, g.seq,
  (current_date - v.age_days + (g.seq * 7))::date, (current_date - v.age_days + (g.seq * 7))::date,
  case when g.seq = v.weeks then v.amount - (v.principal_perc * (v.weeks - 1)) else v.principal_perc end,
  v.interest_perc,
  case when g.seq = v.weeks then (v.amount - (v.principal_perc * (v.weeks - 1))) + v.interest_perc else v.principal_perc + v.interest_perc end,
  greatest(v.amount - (v.principal_perc * g.seq), 0),
  case when g.seq <= v.paid_count then (case when g.seq = v.weeks then (v.amount - (v.principal_perc * (v.weeks - 1))) + v.interest_perc else v.principal_perc + v.interest_perc end) else 0 end,
  case when g.seq <= v.paid_count then (current_date - v.age_days + (g.seq * 7))::date else null end,
  '00000000-0000-4000-8000-000000000001'
from (values
  -- [app char, application, weeks, amount, principal/inst, interest/inst, age of due-1, paid weeks]
  ('1', '00000000-0000-4000-8000-000000000501', 52, 30000.00::numeric, 576.00::numeric, 120.00::numeric, 42, 4),
  ('3', '00000000-0000-4000-8000-000000000503', 40, 40000.00::numeric, 1000.00::numeric, 420.00::numeric, 28, 2),
  ('4', '00000000-0000-4000-8000-000000000504', 52, 20000.00::numeric, 384.00::numeric, 80.00::numeric, 21, 3),
  ('5', '00000000-0000-4000-8000-000000000505', 26, 8000.00::numeric, 300.00::numeric, 90.00::numeric, 7, 1)
) as v(app_char, application_id, weeks, amount, principal_perc, interest_perc, age_days, paid_count),
lateral generate_series(1, v.weeks) as g(seq)
where not exists (
  select 1 from loan_repayment_schedule s
  where s.application_id = v.application_id::uuid
)
on conflict (application_id, seq) do nothing;
-- ═════════════════════════════════════════════════════════════════════════════
-- I) COLLECTION ENTRIES + CASH HANDOVERS
-- ═════════════════════════════════════════════════════════════════════════════
-- 25 weekly entries (two branches × six meeting dates). Allocation jsonb uses
-- the plain {loan, savings, extra} shape: the 0020 guard only validates rows
-- that carry overdueApplied/currentApplied keys.
insert into collection_entries
  (id, org_id, branch_id, idempotency_key, member_id, application_id, meeting_date,
   loan_paid, savings_paid, extra_paid, allocation, receipt_no, collected_by,
   captured_at, note, created_by)
select
  ('00000000-0000-4000-8000-c' || lpad(v.idx::text, 3, '0') || '00000000')::uuid,  -- c001…c025
  '00000000-0000-4000-8000-0000000000aa'::uuid,
  v.branch_id::uuid, v.idk::uuid, v.member_id::uuid, v.app_id::uuid,
  v.meeting_date, v.loan_paid, v.savings_paid, 0.00,
      jsonb_build_object(
    'loan', v.loan_paid, 'savings', v.savings_paid, 'extra', 0,
    'installments', case when v.app_id is null then '[]'::jsonb
      else jsonb_build_array(jsonb_build_object('applicationId', v.app_id, 'amount', v.loan_paid)) end,
    'savingsAccountId', (select a.id::text from savings_accounts a where a.member_id = v.member_id::uuid limit 1)
  ),
  v.receipt_no, v.collector::uuid, v.captured, v.note,
  '00000000-0000-4000-8000-000000000001'::uuid
from (values
  -- idx, branch, idempotency (uuid-tail distinct), member, app, week-ago, loan, savings, receipt, collector
  (1,  '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-000000000001', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000501', 42, 2696.00, 250.00, 'RCT-DEMO-0001', '00000000-0000-4000-8000-000000000001'),
  (2,  '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-000000000002', '00000000-0000-4000-8000-000000000102', null, 42, 0.00,    310.00, 'RCT-DEMO-0002', '00000000-0000-4000-8000-000000000001'),
  (3,  '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-000000000003', '00000000-0000-4000-8000-000000000103', null, 42, 0.00,    430.00, 'RCT-DEMO-0003', '00000000-0000-4000-8000-000000000001'),
  (4,  '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-000000000004', '00000000-0000-4000-8000-000000000104', null, 42, 0.00,    190.00, 'RCT-DEMO-0004', '00000000-0000-4000-8000-000000000001'),
  (5,  '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-000000000005', '00000000-0000-4000-8000-000000000105', null, 42, 0.00,    300.00, 'RCT-DEMO-0005', '00000000-0000-4000-8000-000000000001'),
  (6,  '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-a900-000000000006', '00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000503', 28, 1420.00, 420.00, 'RCT-DEMO-0006', '00000000-0000-4000-8000-000000000001'),
  (7,  '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-a900-000000000007', '00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000505', 28, 1390.00, 300.00, 'RCT-DEMO-0007', '00000000-0000-4000-8000-000000000001'),
  (8,  '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-a900-000000000008', '00000000-0000-4000-8000-000000000108', null, 28, 0.00, 160.00, 'RCT-DEMO-0008', '00000000-0000-4000-8000-000000000001'),
  (9,  '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-a900-000000000009', '00000000-0000-4000-8000-000000000111', null, 28, 0.00, 260.00, 'RCT-DEMO-0009', '00000000-0000-4000-8000-000000000001'),
  (10, '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-a900-00000000000a', '00000000-0000-4000-8000-000000000112', null, 28, 0.00, 160.00, 'RCT-DEMO-0010', '00000000-0000-4000-8000-000000000001'),
  (11, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-00000000000b', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000501', 35, 2696.00, 250.00, 'RCT-DEMO-0011', '00000000-0000-4000-8000-000000000001'),
  (12, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-00000000000c', '00000000-0000-4000-8000-000000000104', null, 35, 0.00, 190.00, 'RCT-DEMO-0012', '00000000-0000-4000-8000-000000000001'),
  (13, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-00000000000d', '00000000-0000-4000-8000-000000000105', null, 35, 0.00, 300.00, 'RCT-DEMO-0013', '00000000-0000-4000-8000-000000000001'),
  (14, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-00000000000e', '00000000-0000-4000-8000-000000000109', null, 35, 0.00, 220.00, 'RCT-DEMO-0014', '00000000-0000-4000-8000-000000000001'),
  (15, '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-a900-00000000000f', '00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000503', 21, 1420.00, 420.00, 'RCT-DEMO-0015', '00000000-0000-4000-8000-000000000001'),
  (16, '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-a900-000000000010', '00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000505', 21, 1390.00, 300.00, 'RCT-DEMO-0016', '00000000-0000-4000-8000-000000000001'),
  (17, '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-a900-000000000011', '00000000-0000-4000-8000-000000000111', null, 21, 0.00, 260.00, 'RCT-DEMO-0017', '00000000-0000-4000-8000-000000000001'),
  (18, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-000000000012', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000501', 28, 2696.00, 250.00, 'RCT-DEMO-0018', '00000000-0000-4000-8000-000000000001'),
  (19, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-000000000013', '00000000-0000-4000-8000-000000000102', null, 28, 0.00, 310.00, 'RCT-DEMO-0019', '00000000-0000-4000-8000-000000000001'),
  (20, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-000000000014', '00000000-0000-4000-8000-000000000104', null, 28, 0.00, 190.00, 'RCT-DEMO-0020', '00000000-0000-4000-8000-000000000001'),
  (21, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-000000000015', '00000000-0000-4000-8000-000000000109', null, 28, 0.00, 220.00, 'RCT-DEMO-0021', '00000000-0000-4000-8000-000000000001'),
  (22, '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-a900-000000000016', '00000000-0000-4000-8000-000000000106', '00000000-0000-4000-8000-000000000503', 14, 1420.00, 420.00, 'RCT-DEMO-0022', '00000000-0000-4000-8000-000000000001'),
  (23, '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-a900-000000000017', '00000000-0000-4000-8000-000000000107', '00000000-0000-4000-8000-000000000505', 14, 1390.00, 300.00, 'RCT-DEMO-0023', '00000000-0000-4000-8000-000000000001'),
  (24, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-000000000018', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000501', 7,  2696.00, 250.00, 'RCT-DEMO-0024', '00000000-0000-4000-8000-000000000001'),
  (25, '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-a900-000000000019', '00000000-0000-4000-8000-000000000110', null, 7,  0.00,    520.00, 'RCT-DEMO-0025', '00000000-0000-4000-8000-000000000001')
) as v(idx, branch_id, idk, member_id, app_id, week_ago, loan_paid, savings_paid, receipt_no, collector)
cross join lateral (select (current_date - v.week_ago)::date as meeting_date,
                           now() - (v.week_ago || ' days')::interval as captured,
                           'ডেমো সাপ্তাহিক আদায়' as note) as x
where v.idx <= 25
  and not exists (select 1 from collection_entries c where c.idempotency_key = v.idk::uuid);

-- Receipt counters to keep the receipt-number sequence findable.
insert into receipt_counters (branch_id, yr, last_seq)
select '00000000-0000-4000-8000-0000000000b1', date_part('year', current_date)::int, 25
where not exists (select 1 from receipt_counters r where r.branch_id = '00000000-0000-4000-8000-0000000000b1' and r.yr = date_part('year', current_date)::int);

-- Three handovers: confirmed clean + submitted + shortage (needs the real auth user).
insert into cash_handovers (id, org_id, branch_id, officer_id, handover_date, expected_amount, counted_amount, difference, difference_kind, status, officer_note, accountant_note, confirmed_by, confirmed_at, created_by) values
  ('00000000-0000-4000-8000-0000000008d4', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', current_date - interval '2 days', 3060.00, 3060.00, 0.00, 'none', 'confirmed', 'নগদ জমা দেওয়া হয়েছে', 'ঠিক আছে (ডেমো)', '00000000-0000-4000-8000-000000000001', now() - interval '2 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008d5', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000001', current_date - interval '1 day', 2840.00, 2840.00, 0.00, 'none', 'submitted', 'পরের সপ্তাহে জমা হবে', null, null, null, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008d6', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000001', current_date, 2920.00, 2720.00, -200.00, 'shortage', 'draft', 'দুই সদস্য কিস্তি দিতে বাকি', null, null, null, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- J) ACCOUNTING — chart of accounts, mappings, vouchers, journal, cash book,
--    petty cash, bank recon, requisition, budgets
-- ═════════════════════════════════════════════════════════════════════════════
insert into gl_accounts (id, org_id, code, name, name_bn, type, category, is_active, created_by) values
  ('00000000-0000-4000-8000-0000000008a1', '00000000-0000-4000-8000-0000000000aa', '1010', 'Cash in Vault', 'নগদ তহবিল', 'asset', 'cash', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008a2', '00000000-0000-4000-8000-0000000000aa', '1020', 'Bank Account', 'ব্যাংক হিসাব', 'asset', 'bank', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008a3', '00000000-0000-4000-8000-0000000000aa', '1200', 'Loan Portfolio', 'ঋণ পোর্টফোলিও', 'asset', 'control', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008a4', '00000000-0000-4000-8000-0000000000aa', '2100', 'Member Savings Deposits', 'সদস্য সঞ্চয় আমানত', 'liability', 'control', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008a5', '00000000-0000-4000-8000-0000000000aa', '4100', 'Interest Income', 'সুদ আয়', 'income', 'income', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008a6', '00000000-0000-4000-8000-0000000000aa', '4200', 'Fees & Commission Income', 'ফি ও কমিশন আয়', 'income', 'income', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008a7', '00000000-0000-4000-8000-0000000000aa', '6100', 'Salaries & Allowances', 'বেতন ও ভাতা', 'expense', 'expense', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008a8', '00000000-0000-4000-8000-0000000000aa', '6110', 'Office Rent', 'অফিস ভাড়া', 'expense', 'expense', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008a9', '00000000-0000-4000-8000-0000000000aa', '7100', 'Loan Loss Provision Expense', 'ঋণ ক্ষতি সঞ্চিতি ব্যয়', 'expense', 'expense', true, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into event_journal_mappings (id, org_id, event, settlement_code, counter_code, is_active, created_by) values
  ('00000000-0000-4000-8000-0000000008e1', '00000000-0000-4000-8000-0000000000aa', 'savings_deposit', '1010', '2100', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008e2', '00000000-0000-4000-8000-0000000000aa', 'savings_withdrawal', '2100', '1010', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008e3', '00000000-0000-4000-8000-0000000000aa', 'loan_disbursement', '1200', '1010', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008e4', '00000000-0000-4000-8000-0000000000aa', 'loan_collection', '1010', '1200', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008e5', '00000000-0000-4000-8000-0000000000aa', 'fee_collected', '1010', '4200', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008e6', '00000000-0000-4000-8000-0000000000aa', 'salary_payment', '6100', '1010', true, '00000000-0000-4000-8000-000000000001')
on conflict (org_id, event) do nothing;

insert into vouchers (id, org_id, branch_id, voucher_number, voucher_type, voucher_date, payee_payer, memo, status, amount_total, prepared_by, checked_by, checked_at, approved_by, approved_at, created_by) values
  ('00000000-0000-4000-8000-0000000008d1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'VCH-DEMO-001', 'cash_receipt', current_date - interval '7 days', 'সোনালী সমিতি', 'সাপ্তাহিক আদায় (ডেমো)', 'approved', 5000.00, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', now() - interval '6 days', '00000000-0000-4000-8000-000000000001', now() - interval '6 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008d2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'VCH-DEMO-002', 'cash_payment', current_date - interval '5 days', 'বেতন বিল', 'সেপ্টেম্বর বেতন পরিশোধ', 'approved', 28000.00, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', now() - interval '5 days', '00000000-0000-4000-8000-000000000001', now() - interval '5 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008d3', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', 'VCH-DEMO-003', 'cash_payment', current_date - interval '3 days', 'বাড়িওয়ালা', 'অক্টোবর অফিস ভাড়া', 'approved', 8000.00, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', now() - interval '3 days', '00000000-0000-4000-8000-000000000001', now() - interval '3 days', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into voucher_lines (id, voucher_id, org_id, account_code, party_name, note, debit, credit) values
  ('00000000-0000-4000-8000-0000000008c1', '00000000-0000-4000-8000-0000000008d1', '00000000-0000-4000-8000-0000000000aa', '1010', 'সোনালী সমিতি', 'নগদ গৃহীত', 5000.00, 0.00),
  ('00000000-0000-4000-8000-0000000008c2', '00000000-0000-4000-8000-0000000008d1', '00000000-0000-4000-8000-0000000000aa', '4100', 'সোনালী সমিতি', 'ঋণ সুদ ও কিস্তি', 0.00, 5000.00),
  ('00000000-0000-4000-8000-0000000008c3', '00000000-0000-4000-8000-0000000008d2', '00000000-0000-4000-8000-0000000000aa', '6100', 'বেতন বিল', 'বেতন', 28000.00, 0.00),
  ('00000000-0000-4000-8000-0000000008c4', '00000000-0000-4000-8000-0000000008d2', '00000000-0000-4000-8000-0000000000aa', '1010', 'বেতন বিল', 'নগদ পরিশোধ', 0.00, 28000.00),
  ('00000000-0000-4000-8000-0000000008c5', '00000000-0000-4000-8000-0000000008d3', '00000000-0000-4000-8000-0000000000aa', '6110', 'বাড়িওয়ালা', 'ভাড়া', 8000.00, 0.00),
  ('00000000-0000-4000-8000-0000000008c6', '00000000-0000-4000-8000-0000000008d3', '00000000-0000-4000-8000-0000000000aa', '1010', 'বাড়িওয়ালা', 'নগদ পরিশোধ', 0.00, 8000.00)
on conflict do nothing;

insert into journal_postings (id, org_id, branch_id, event, source_table, source_id, amount, entry_date, memo, voucher_id, idempotency_key, created_by) values
  ('00000000-0000-4000-8000-0000000008f1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'loan_collection', 'collection_entries', '00000000-0000-4000-8000-c02400000000', 2946.00, current_date - interval '7 days', 'সাপ্তাহিক আদায় (অটো পোস্টিং ডেমো)', '00000000-0000-4000-8000-0000000008d1', 'seed:collection:1', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008f2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'loan_collection', 'collection_entries', '00000000-0000-4000-8000-c01100000000', 2696.00, current_date - interval '35 days', 'সাপ্তাহিক আদায় (অটো পোস্টিং ডেমো)', '00000000-0000-4000-8000-0000000008d1', 'seed:collection:2', '00000000-0000-4000-8000-000000000001')
on conflict (idempotency_key) do nothing;

-- Cash book (one OPEN day; totals-only — live close recomputes real totals).
insert into cash_book_days (id, org_id, branch_id, book_date, status, opening_balance, total_cash_in, total_cash_out, expected_closing) values
  ('00000000-0000-4000-8000-0000000008cb', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', current_date - interval '1 day', 'open', 25000.00, 5000.00, 0.00, 30000.00)
on conflict do nothing;

insert into cash_book_lines (id, cash_book_id, voucher_id, voucher_number, voucher_type, memo, cash_in, cash_out) values
  ('00000000-0000-4000-8000-0000000008c7', '00000000-0000-4000-8000-0000000008cb', '00000000-0000-4000-8000-0000000008d1', 'VCH-DEMO-001', 'cash_receipt', 'সাপ্তাহিক আদায়', 5000.00, 0.00)
on conflict do nothing;

-- Petty cash + bank recon + requisition + budgets
insert into petty_cash_accounts (id, org_id, branch_id, balance, spend_limit) values
  ('00000000-0000-4000-8000-0000000008c8', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 2500.00, 2000.00)
on conflict do nothing;

insert into petty_cash_movements (id, org_id, branch_id, kind, amount, note, balance_after, created_by) values
  ('00000000-0000-4000-8000-0000000008c9', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'top_up', 2500.00, 'খুচরা নগদ প্রারম্ভ (ডেমো)', 2500.00, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into bank_reconciliations (id, org_id, branch_id, bank_code, period_start, period_end, book_balance, statement_balance, status, prepared_by) values
  ('00000000-0000-4000-8000-0000000008ca', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '1020', current_date - interval '32 days', current_date - interval '2 days', 148000.00, 146200.00, 'pending', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into bank_statement_lines (id, reconciliation_id, value_date, narration, amount, cleared) values
  ('00000000-0000-4000-8000-0000000008cc', '00000000-0000-4000-8000-0000000008ca', current_date - interval '10 days', 'SMS চার্জ', -1800.00, false)
on conflict do nothing;

insert into fund_requisitions (id, org_id, kind, from_node_id, to_node_id, amount, purpose, status, settlement_code, requested_by, decided_by, decided_at, note, created_by) values
  ('00000000-0000-4000-8000-0000000008cd', '00000000-0000-4000-8000-0000000000aa', 'branch_to_ho', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000aa', 50000.00, 'সদর শাখার নগদ সংরক্ষণ বৃদ্ধি', 'approved', '1010', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', now() - interval '2 days', 'ডেমো রিকুইজিশন', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into gl_budgets (id, org_id, period_start, period_end, account_code, amount, created_by) values
  ('00000000-0000-4000-8000-0000000008b1', '00000000-0000-4000-8000-0000000000aa', '2026-10-01', '2026-10-31', '6100', 120000.00, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008b2', '00000000-0000-4000-8000-0000000000aa', '2026-10-01', '2026-10-31', '6110', 24000.00, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000008b3', '00000000-0000-4000-8000-0000000000aa', '2026-10-01', '2026-10-31', '4100', 180000.00, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- K) HR — staff, salaries, recruitment, attendance, leave, holidays, payroll
-- ═════════════════════════════════════════════════════════════════════════════
insert into hr_staff (id, org_id, employee_code, name, name_bn, designation, grade, branch_id, joining_date, confirmation_date, status, mobile, email, monthly_gross, nid_masked, created_by) values
  ('00000000-0000-4000-8000-0000000009a1', '00000000-0000-4000-8000-0000000000aa', 'EMP-001', 'Md. Anisur Rahman', 'মোঃ আনিসুর রহমান', 'শাখা ব্যবস্থাপক', 'A1', '00000000-0000-4000-8000-0000000000b1', current_date - interval '900 days', current_date - interval '840 days', 'confirmed', '01811000001', 'bm.sadar@samity.test', 42000.00, '1234', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000009a2', '00000000-0000-4000-8000-0000000000aa', 'EMP-002', 'Sultana Razia', 'সুলতানা রাজিয়া', 'হিসাব কর্মকর্তা', 'A2', '00000000-0000-4000-8000-0000000000b1', current_date - interval '600 days', current_date - interval '540 days', 'confirmed', '01811000002', 'ao.sadar@samity.test', 28000.00, '2345', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000009a3', '00000000-0000-4000-8000-0000000000aa', 'EMP-003', 'Kamal Hossain', 'কামাল হোসেন', 'শাখা ব্যবস্থাপক', 'A1', '00000000-0000-4000-8000-0000000000b2', current_date - interval '200 days', null, 'probation', '01811000003', 'bm.kazla@samity.test', 38000.00, '3456', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000009a4', '00000000-0000-4000-8000-0000000000aa', 'EMP-004', 'Rokeya Begum', 'রোকেয়া বেগম', 'ফিল্ড অফিসার', 'B1', '00000000-0000-4000-8000-0000000000b2', current_date - interval '90 days', null, 'probation', '01811000004', 'fo.kazla@samity.test', 19000.00, '4567', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into salary_structures (id, org_id, grade, basic, house_rent, medical, conveyance, field_allowance, pf_employee_rate, pf_employer_rate, created_by) values
  ('00000000-0000-4000-8000-0000000009e1', '00000000-0000-4000-8000-0000000000aa', 'A1', 21000.00, 12000.00, 3000.00, 3000.00, 3000.00, 0.05, 0.05, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000009e2', '00000000-0000-4000-8000-0000000000aa', 'A2', 14000.00, 8000.00, 2000.00, 2000.00, 2000.00, 0.05, 0.05, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000009e3', '00000000-0000-4000-8000-0000000000aa', 'B1', 9500.00, 5500.00, 1500.00, 1500.00, 1000.00, 0.05, 0.05, '00000000-0000-4000-8000-000000000001')
on conflict (org_id, grade) do nothing;

insert into hr_vacancies (id, org_id, branch_id, designation, headcount, reason, status, requested_by, decided_by, decided_at, note, created_by) values
  ('00000000-0000-4000-8000-0000000009b1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'ফিল্ড অফিসার', 2, 'সদর শাখার সম্প্রসারণ', 'approved', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', now() - interval '20 days', 'ডেমো শূন্যপদ', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into hr_applicants (id, org_id, vacancy_id, name, mobile, education_level, experience_years, status, interview_scores, offered_salary) values
  ('00000000-0000-4000-8000-0000000009c1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009b1', 'নাজমুল হাসান', '01911000001', 'স্নাতক', 2, 'interviewed', '[{"panel":"BM+AO","score":74}]'::jsonb, null),
  ('00000000-0000-4000-8000-0000000009c2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009b1', 'তাসনিম আক্তার', '01911000002', 'স্নাতকোত্তর', 1, 'offered', '[{"panel":"BM+AO","score":82}]'::jsonb, 18500.00)
on conflict do nothing;

insert into hr_attendance (id, org_id, staff_id, work_date, status, check_in_at, check_in_lat, check_in_lng, mode) values
  ('00000000-0000-4000-8000-0000000009c3', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009a1', current_date - interval '1 day', 'present', now() - interval '1 day' + interval '9 hours', 24.45, 89.70, 'office'),
  ('00000000-0000-4000-8000-0000000009c4', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009a2', current_date - interval '1 day', 'present', now() - interval '1 day' + interval '10 hours', 24.46, 89.71, 'office'),
  ('00000000-0000-4000-8000-0000000009c5', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009a3', current_date - interval '1 day', 'present', now() - interval '1 day' + interval '11 hours', 24.47, 89.72, 'field'),
  ('00000000-0000-4000-8000-0000000009c6', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009a4', current_date - interval '1 day', 'late', now() - interval '1 day' + interval '12 hours', 24.48, 89.73, 'field')
on conflict (org_id, staff_id, work_date) do nothing;

insert into hr_leave_requests (id, org_id, staff_id, leave_type, start_date, end_date, days, reason, status, decided_by, decided_at) values
  ('00000000-0000-4000-8000-0000000009b2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009a4', 'casual', current_date + interval '5 days', current_date + interval '6 days', 2, 'পারিবারিক কাজ', 'pending', null, null),
  ('00000000-0000-4000-8000-0000000009b3', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009a3', 'casual', current_date - interval '15 days', current_date - interval '14 days', 2, 'পারিবারিক কাজ', 'approved', '00000000-0000-4000-8000-000000000001', now() - interval '13 days')
on conflict do nothing;

insert into hr_holidays (id, org_id, date, name, name_bn) values
  ('00000000-0000-4000-8000-0000000009b4', '00000000-0000-4000-8000-0000000000aa', current_date + interval '20 days', 'Eid-e-Miladunnabi', 'ঈদে মিলাদুন্নবী'),
  ('00000000-0000-4000-8000-0000000009b5', '00000000-0000-4000-8000-0000000000aa', current_date + interval '45 days', 'Victory Day', 'মহান বিজয় দিবস')
on conflict (org_id, date) do nothing;

insert into hr_movements (id, org_id, kind, staff_id, from_branch_id, to_branch_id, from_designation, to_designation, effective_date, reason, status, proposed_by, created_by) values
  ('00000000-0000-4000-8000-0000000009b6', '00000000-0000-4000-8000-0000000000aa', 'transfer', '00000000-0000-4000-8000-0000000009a3', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000b1', 'শাখা ব্যবস্থাপক', 'শাখা ব্যবস্থাপক', current_date + interval '15 days', 'জনবল ভারসাম্য', 'proposed', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- Payroll: draft run → lines → approve (trigger trg_payroll_totals recomputes
-- run totals from lines at UPDATE; lines must exist before the approval update).
insert into payroll_runs (id, org_id, period, status, bonus_total, prepared_by, created_by) values
  ('00000000-0000-4000-8000-0000000009e4', '00000000-0000-4000-8000-0000000000aa', '2026-09', 'draft', 0.00, '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into payroll_lines (id, org_id, payroll_id, staff_id, components, gross, deductions, total_deduction, net, bonus, working_days, present_days, attendance_ratio) values
  ('00000000-0000-4000-8000-0000000009e5', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009e4', '00000000-0000-4000-8000-0000000009a1', '{"basic":21000,"house_rent":12000,"medical":3000,"conveyance":3000,"field_allowance":3000}'::jsonb, 42000.00, '{"pf_employee":2100,"tax":840,"loan_advance":0,"other":0}'::jsonb, 2940.00, 39060.00, 0.00, 26, 25, 0.9615),
  ('00000000-0000-4000-8000-0000000009e6', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009e4', '00000000-0000-4000-8000-0000000009a2', '{"basic":14000,"house_rent":8000,"medical":2000,"conveyance":2000,"field_allowance":2000}'::jsonb, 28000.00, '{"pf_employee":1400,"tax":560,"loan_advance":0,"other":0}'::jsonb, 1960.00, 26040.00, 0.00, 26, 25, 0.9615),
  ('00000000-0000-4000-8000-0000000009e7', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009e4', '00000000-0000-4000-8000-0000000009a3', '{"basic":19000,"house_rent":10830,"medical":2700,"conveyance":2700,"field_allowance":2770}'::jsonb, 38000.00, '{"pf_employee":1900,"tax":760,"loan_advance":0,"other":0}'::jsonb, 2660.00, 35340.00, 0.00, 26, 25, 0.9615),
  ('00000000-0000-4000-8000-0000000009e8', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009e4', '00000000-0000-4000-8000-0000000009a4', '{"basic":9500,"house_rent":5500,"medical":1500,"conveyance":1500,"field_allowance":1000}'::jsonb, 19000.00, '{"pf_employee":950,"tax":380,"loan_advance":0,"other":0}'::jsonb, 1330.00, 17670.00, 0.00, 26, 25, 0.9615)
on conflict (payroll_id, staff_id) do nothing;

update payroll_runs set status = 'approved', approved_by = '00000000-0000-4000-8000-000000000001', approved_at = now()
where id = '00000000-0000-4000-8000-0000000009e4' and status = 'draft';

insert into pf_ledger (id, org_id, staff_id, period, type, employee_amount, employer_amount, balance_after, note, created_by) values
  ('00000000-0000-4000-8000-0000000009f1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009a1', '2026-09', 'contribution', 2100.00, 2100.00, 25200.00, 'সেপ্টেম্বর পিএফ কাটকুটি (ডেমো)', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000009f2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009a2', '2026-09', 'contribution', 1400.00, 1400.00, 16800.00, 'সেপ্টেম্বর পিএফ কাটকুটি (ডেমো)', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000009f3', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009a3', '2026-09', 'contribution', 1900.00, 1900.00, 22800.00, 'সেপ্টেম্বর পিএফ কাটকুটি (ডেমো)', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000009f4', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009a4', '2026-09', 'contribution', 950.00, 950.00, 11400.00, 'সেপ্টেম্বর পিএফ কাটকুটি (ডেমো)', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into kpi_scorecards (id, org_id, staff_id, period, actuals, scores, total_score, grade, created_by) values
  ('00000000-0000-4000-8000-0000000009b7', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009a1', '2026-09', '{"collection_rate":96.5,"par":4.2,"new_members":6,"meeting_attendance":91}'::jsonb, '{"collection_rate":24,"par":23,"new_members":18,"meeting_attendance":23}'::jsonb, 88, 'A', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into staff_appraisals (id, org_id, staff_id, year, scores, comments, rating, status, reviewer_id, reviewer_note, created_by) values
  ('00000000-0000-4000-8000-0000000009a9', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009a1', '2025', '{"integrity":9,"leadership":8.5,"portfolio":9,"compliance":8}'::jsonb, 'সুশৃঙ্খল ও ফলপ্রসূ কর্মদক্ষতা (ডেমো মূল্যায়ন)', 8.6, 'reviewed', '00000000-0000-4000-8000-000000000001', 'বার্ষিক মূল্যায়ন সম্পন্ন (ডেমো)', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into disciplinary_cases (id, org_id, staff_id, severity, incident_date, description, status, raised_by, created_by) values
  ('00000000-0000-4000-8000-0000000009d1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000009a4', 'written_warning', current_date - interval '6 days', 'নির্ধারিত সময়ে কেন্দ্র পরিদর্শনে অনুপস্থিত', 'open', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- L) WORK — targets, tasks, delegation, supervision, audit, escalation
-- ═════════════════════════════════════════════════════════════════════════════
insert into work_targets (id, org_id, scope, owner_branch_id, owner_staff_id, owner_name, parent_id, period, new_members, disbursement, collection, savings, par_limit, created_by) values
  ('00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-0000000000aa', 'branch', '00000000-0000-4000-8000-0000000000b1', null, 'Sadar Branch', null, '2026-10', 8, 600000.00, 500000.00, 150000.00, 5, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e02', '00000000-0000-4000-8000-0000000000aa', 'branch', '00000000-0000-4000-8000-0000000000b2', null, 'Kazla Branch', null, '2026-10', 4, 300000.00, 250000.00, 80000.00, 5, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e03', '00000000-0000-4000-8000-0000000000aa', 'officer', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000009a1', 'Md. Anisur Rahman', '00000000-0000-4000-8000-000000000e01', '2026-10', 3, 200000.00, 180000.00, 50000.00, 5, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into work_tasks (id, org_id, branch_id, type, title, description, assignee_id, assignee_name, assigner_id, assigner_name, due_date, priority, link_kind, link_id, link_label, status, comments, completed_at, created_by) values
  ('00000000-0000-4000-8000-000000000e11', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'overdue_followup', 'LA-DEMO-001 বকেয়া কিস্তি ফলো-আপ', 'ডেমো কাজ — সমন্বয়ের জন্য তৈরি', '00000000-0000-4000-8000-0000000009a1', 'Md. Anisur Rahman', '00000000-0000-4000-8000-000000000001', 'Demo Super Admin', current_date - interval '2 days', 'high', 'loan', '00000000-0000-4000-8000-000000000501', 'ঋণ LA-DEMO-001', 'in_progress', '[{"author":"Md. Anisur Rahman","text":"আগামী সভায় আদায়ের প্রতিশ্রুতি পেয়েছি","at":"2026-10-04T10:00:00Z"}]'::jsonb, null, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e12', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', 'utilization_visit', 'রাহেলা বেগমের পোলট্রি খামার পরিদর্শন', 'ডেমো কাজ — সমন্বয়ের জন্য তৈরি', '00000000-0000-4000-8000-0000000009a4', 'Rokeya Begum', '00000000-0000-4000-8000-000000000001', 'Demo Super Admin', current_date + interval '3 days', 'normal', 'member', '00000000-0000-4000-8000-000000000101', 'সদস্য MEM-DEMO-001', 'todo', '[]'::jsonb, null, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e13', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', 'kyc_pending', 'MEM-DEMO-012 কেওয়াইসি নথি সম্পূর্ণ', 'ডেমো কাজ — সমন্বয়ের জন্য তৈরি', '00000000-0000-4000-8000-0000000009a3', 'Kamal Hossain', '00000000-0000-4000-8000-000000000001', 'Demo Super Admin', current_date + interval '7 days', 'normal', 'member', '00000000-0000-4000-8000-000000000112', 'সদস্য MEM-DEMO-012', 'todo', '[]'::jsonb, null, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e14', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'report_submission', 'সেপ্টেম্বর মাসিক প্রতিবেদন জমা', 'ডেমো কাজ — সমন্বয়ের জন্য তৈরি', '00000000-0000-4000-8000-0000000009a2', 'Sultana Razia', '00000000-0000-4000-8000-000000000001', 'Demo Super Admin', current_date - interval '4 days', 'urgent', 'branch', '00000000-0000-4000-8000-0000000000b1', 'সদর শাখা', 'done', '[]'::jsonb, now() - interval '3 days', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into task_delegations (id, org_id, task_id, from_staff_id, to_staff_id, reason, note, created_by) values
  ('00000000-0000-4000-8000-000000000e21', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000e12', '00000000-0000-4000-8000-0000000009a4', '00000000-0000-4000-8000-0000000009a3', 'workload', 'নিরীক্ষা সপ্তাহে কাজ বণ্টন', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into supervision_submissions (id, org_id, branch_id, form_type, link_id, link_label, submitted_by, submitted_name, submitted_at, lat, lng, items, exceptions, note, created_by) values
  ('00000000-0000-4000-8000-000000000e31', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', 'center_visit', '00000000-0000-4000-8000-000000000c21', 'একতা সমিতি', '00000000-0000-4000-8000-000000000001', 'Demo Super Admin', now() - interval '2 days', 24.418, 89.669, '[{"label":"খাতা হালনাগাদ","ok":true},{"label":"নগদ মিলছে","ok":true},{"label":"সভা ঠিক সময়ে","ok":false}]'::jsonb, 1, 'সভা বিলম্বিত হয়েছে', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into audit_plans (id, org_id, branch_id, branch_name, title, planned_date, lead_auditor_id, lead_auditor_name, status, loan_sample, member_sample, sample_size, created_by) values
  ('00000000-0000-4000-8000-000000000e41', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'Sadar Branch', 'সদর শাখা অভ্যন্তরীণ নিরীক্ষা — সেপ্টেম্বর', current_date - interval '12 days', '00000000-0000-4000-8000-000000000001', 'Demo Super Admin', 'draft_report', array['00000000-0000-4000-8000-000000000501']::uuid[], array['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102']::uuid[], 10, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into audit_findings (id, org_id, audit_id, ref, title, detail, severity, status, response, responded_at, deadline, follow_ups, created_by) values
  ('00000000-0000-4000-8000-000000000e42', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000e41', 'F-001', 'বকেয়া কিস্তির ফলো-আপ নথিভুক্ত নয়', 'LA-DEMO-001 এর বকেয়া কিস্তির জন্য কোনো ফলো-আপ রেকর্ড পাওয়া যায়নি।', 'medium', 'open', '', null, current_date + interval '10 days', '[]'::jsonb, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e43', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000e41', 'F-002', 'খুচরা নগদ রেজিস্টার হালনাগাদ নেই', 'দুই দিনের খরচ রেজিস্টারে লেখা হয়নি।', 'low', 'responded', 'হালনাগাদ করা হয়েছে ও ভবিষ্যতে দৈনিক লেখা হবে।', now() - interval '2 days', current_date + interval '5 days', '[]'::jsonb, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into work_escalations (id, org_id, entity_type, entity_id, days_overdue, tier_role, created_by) values
  ('00000000-0000-4000-8000-000000000e52', '00000000-0000-4000-8000-0000000000aa', 'task', '00000000-0000-4000-8000-000000000e11', 2, 'branch_manager', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- M) DELINQUENCY — settings, case, follow-ups (trigger makes tasks), EWS, root cause
-- ═════════════════════════════════════════════════════════════════════════════
insert into delinquency_settings (org_id, bucket_bounds, provisioning_pct, asset_class_by_dpd, escalate_to_bm_days, escalate_to_am_days, created_by) values
  ('00000000-0000-4000-8000-0000000000aa', '{"d1_30":30,"d31_90":90,"d91_180":180}'::jsonb, '{"standard":0,"substandard":25,"doubtful":50,"bad":100}'::jsonb, '{"substandard":31,"doubtful":91,"bad":181}'::jsonb, 3, 15, '00000000-0000-4000-8000-000000000001')
on conflict (org_id) do nothing;

insert into delinquency_cases (id, org_id, application_id, branch_id, samity_id, officer_id, days_past_due, bucket, overdue_total, outstanding, assigned_level, assigned_to, status, opened_at, created_by) values
  ('00000000-0000-4000-8000-000000000d81', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000c11', '00000000-0000-4000-8000-0000000009a1', 42, 'd31_90', 4176.00, 27696.00, 'branch_manager', '00000000-0000-4000-8000-0000000009a1', 'open', current_date - interval '7 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000d82', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000c21', '00000000-0000-4000-8000-0000000009a3', 28, 'd1_30', 8520.00, 38000.00, 'field_officer', '00000000-0000-4000-8000-0000000009a3', 'open', current_date - interval '5 days', '00000000-0000-4000-8000-000000000001')
on conflict (application_id, status) do nothing;

-- Follow-ups auto-create reminder tasks via trigger trg_delinquency_follow_up_task.
insert into delinquency_follow_ups (id, org_id, case_id, type, outcome, promise_date, promise_amount, note, next_visit_date, created_by) values
  ('00000000-0000-4000-8000-000000000d11', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d81', 'phone_call', 'promise_to_pay', current_date + interval '2 days', 2620.00, 'শুক্রবারের মধ্যে কিস্তি দেবেন', current_date + interval '3 days', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000d12', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d81', 'visit', 'partial_paid', null, null, '৫০০ টাকা পরিশোধ করেছেন', current_date + interval '5 days', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into early_warning_signals (id, org_id, kind, severity, ref_id, branch_id, detail, detail_bn, metric, prior_metric, acknowledged) values
  ('00000000-0000-4000-8000-000000000d21', '00000000-0000-4000-8000-0000000000aa', 'member_missed_two', 'medium', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000b1', 'টানা ২ কিস্তি বাকি পড়েছে (ডেমো সংকেত)', 'টানা ২ কিস্তি বাকি পড়েছে — দ্রুত যোগাযোগ করুন', 2, 1, false),
  ('00000000-0000-4000-8000-000000000d22', '00000000-0000-4000-8000-0000000000aa', 'savings_drop', 'low', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000000b1', 'সঞ্চয় জমা হ্রাস (ডেমো সংকেত)', 'গত মাসে সঞ্চয় জমা অর্ধেক', 40, 90, false)
on conflict do nothing;

insert into delinquency_root_causes (id, org_id, application_id, cause, note, created_by) values
  ('00000000-0000-4000-8000-000000000d31', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000501', 'business_failure', 'পোলট্রি খামারে সাময়িক লোকসান (ডেমো)', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;
-- ═════════════════════════════════════════════════════════════════════════════
-- N) WELFARE — rules, requests (cap trigger reads rules first), ledger
-- ═════════════════════════════════════════════════════════════════════════════
insert into welfare_fund_rules (org_id, monthly_contribution, staff_contribution, grant_cap_bdt, loan_cap_bdt, loan_term_months, bm_approval_up_to, am_approval_up_to, created_by) values
  ('00000000-0000-4000-8000-0000000000aa', 10.00, 50.00, 5000.00, 20000.00, 10, 3000.00, 10000.00, '00000000-0000-4000-8000-000000000001')
on conflict (org_id) do nothing;

insert into welfare_requests (id, org_id, branch_id, fund, request_no, requester_id, requester_name, kind, type, amount, reason, status, decision_note, decided_at, created_by) values
  ('00000000-0000-4000-8000-0000000002b1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'member', 'WFR-DEMO-001', '00000000-0000-4000-8000-000000000103', 'Fatema Khatun', 'illness', 'grant', 2500.00, 'সন্তানের জরুরি চিকিৎসা (ডেমো)', 'submitted', '', null, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000002b2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'member', 'WFR-DEMO-002', '00000000-0000-4000-8000-000000000104', 'Shahjahan Mia', 'disaster', 'interest_free_loan', 12000.00, 'বন্যায় ঘরবাড়ি ক্ষতিগ্রস্ত (ডেমো)', 'bm_review', '', null, '00000000-0000-4000-8000-000000000001')
on conflict (request_no) do nothing;

insert into welfare_ledger (id, org_id, branch_id, fund, entry_type, ref_type, ref_id, amount, memo, created_by) values
  ('00000000-0000-4000-8000-0000000002c1', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'member_welfare', 'contribution', null, null, 12000.00, 'সদস্য কল্যাণ তহবিল প্রারম্ভিক অবদান (ডেমো)', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000002c2', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'member_welfare', 'contribution', null, null, 8000.00, 'অতিরিক্ত অবদান (ডেমো)', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000002c3', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'member_welfare', 'grant', 'welfare_requests', '00000000-0000-4000-8000-0000000002b1', 1500.00, 'চিকিৎসা অনুদান (ডেমো)', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000002c4', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'staff_benevolent', 'contribution', null, null, 200.00, 'কর্মী সদস্য অবদান (ডেমো)', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-0000000002c5', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'insurance', 'premium', 'micro_enrollments', '00000000-0000-4000-8000-000000000e23', 600.00, 'প্রিমিয়াম সংগ্রহ (ডেমো)', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- O) INSURANCE — credit life, claim, micro products + enrollments
-- ═════════════════════════════════════════════════════════════════════════════
insert into credit_life_policies (id, org_id, branch_id, application_id, loan_number, member_id, member_name, premium_rate_pct, premium_amount, principal, coverage_amount, start_date, end_date, nominee_name, nominee_relation, nominee_phone, status, created_by) values
  ('00000000-0000-4000-8000-000000000d41', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000501', 'LA-DEMO-001', '00000000-0000-4000-8000-000000000101', 'Rahela Begum', 0.50, 150.00, 30000.00, 30000.00,
   (current_date - interval '70 days')::date, (current_date - interval '70 days' + interval '365 days')::date, 'মোজাম্মেল হোসেন', 'স্বামী', '01712000001', 'active', '00000000-0000-4000-8000-000000000001')
on conflict (application_id) do nothing;

insert into insurance_claims (id, org_id, branch_id, policy_id, claim_no, kind, member_id, member_name, event_date, reported_date, cause, documents, assessment_note, claimed_amount, status, decision_note) values
  ('00000000-0000-4000-8000-000000000d42', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000d41', 'CLM-DEMO-001', 'death', '00000000-0000-4000-8000-000000000101', 'Rahela Begum (নমুনা দাবি)', current_date - interval '3 days', current_date - interval '2 days', 'ডেমো কারণ নথি',
   '[{"id":"death_certificate"},{"id":"nominee_nid"},{"id":"nominee_proof"}]'::jsonb, 'প্রাথমিক যাচাই চলছে (ডেমো)', 30000.00, 'submitted', '')
on conflict (claim_no) do nothing;

insert into micro_insurance_products (id, org_id, kind, name_bn, annual_premium, coverage_limit, units, active, created_by) values
  ('00000000-0000-4000-8000-000000000e21', '00000000-0000-4000-8000-0000000000aa', 'cattle', 'গরু-ছাগল বীমা', 500.00, 15000.00, 1, true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e22', '00000000-0000-4000-8000-0000000000aa', 'health', 'পরিবার স্বাস্থ্য বীমা', 1200.00, 50000.00, 4, true, '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into micro_enrollments (id, org_id, branch_id, product_id, kind, member_id, member_name, units, subject_ref, annual_premium, coverage_limit, start_date, end_date, status, created_by) values
  ('00000000-0000-4000-8000-000000000e23', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000e21', 'cattle', '00000000-0000-4000-8000-000000000106', 'Jasim Uddin', 1, 'গরু (ডেমো)', 500.00, 15000.00,
   (current_date - interval '100 days')::date, (current_date + interval '265 days')::date, 'active', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e24', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000e22', 'health', '00000000-0000-4000-8000-000000000103', 'Fatema Khatun', 2, 'পরিবার (ডেমো)', 1200.00, 50000.00,
   (current_date - interval '50 days')::date, (current_date + interval '315 days')::date, 'active', '00000000-0000-4000-8000-000000000001')
on conflict do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- P) GOVERNANCE — dividend distribution, AGM, member exit
-- ═════════════════════════════════════════════════════════════════════════════
insert into dividend_distributions (id, org_id, fiscal_year, surplus, reserve_pct, reserve_amount, rate_pct, pool_amount, total_weighted, status, declared_by, created_by) values
  ('00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-0000000000aa', '2025-26', 45000.00, 25.00, 11250.00, 8.00, 33750.00, 12.00, 'computed', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001')
on conflict (org_id) do nothing;

insert into dividend_lines (id, org_id, distribution_id, member_id, member_name, shares, months_held, weighted_shares, weight_pct, amount, destination) values
  ('00000000-0000-4000-8000-000000000f02', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-000000000101', 'Rahela Begum', 2, 12, 24.00, 33.333, 11250.00, 'savings'),
  ('00000000-0000-4000-8000-000000000f03', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-000000000102', 'Abdul Karim', 2, 12, 24.00, 33.333, 11250.00, 'savings'),
  ('00000000-0000-4000-8000-000000000f04', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000f01', '00000000-0000-4000-8000-000000000106', 'Jasim Uddin', 2, 12, 24.00, 33.334, 11250.00, 'savings')
on conflict do nothing;

insert into agm_records (id, org_id, fiscal_year, meeting_date, venue, notice_date, notice_days, agenda, attendance, quorum_required, resolutions, elections, minutes_bn, status, created_by) values
  ('00000000-0000-4000-8000-000000000f11', '00000000-0000-4000-8000-0000000000aa', '2024-25', current_date - interval '400 days', 'সিরাজগঞ্জ সদর অফিস', (current_date - interval '414 days')::date, 14,
   '[{"item":"বার্ষিক প্রতিবেদন"},{"item":"লভ্যাংশ অনুমোদন"}]'::jsonb, '[{"name":"মোঃ আনিসুর রহমান"},{"name":"রোকেয়া বেগম"}]'::jsonb, 10, '[{"text":"বার্ষিক প্রতিবেদন গৃহীত"}]'::jsonb, '[]'::jsonb, 'সভা সুষ্ঠু অনুষ্ঠিত হয় (ডেমো)', 'minutes_approved', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000f12', '00000000-0000-4000-8000-0000000000aa', '2025-26', current_date + interval '25 days', 'সিরাজগঞ্জ সদর অফিস', (current_date - interval '5 days')::date, 30,
   '[{"item":"লভ্যাংশ ঘোষণা"},{"item":"নির্বাচন"}]'::jsonb, '[]'::jsonb, 10, '[]'::jsonb, '[]'::jsonb, '', 'notice_issued', '00000000-0000-4000-8000-000000000001')
on conflict (org_id, fiscal_year) do nothing;

-- Member exit (numeric identity trigger fn_exit_net recomputes net_payable).
insert into member_exits (id, org_id, branch_id, member_id, member_name, request_date, exit_no, savings_balance, share_value, dividend_due, welfare_balance, dues_outstanding, net_payable, lines, status, decision_note, created_by) values
  ('00000000-0000-4000-8000-000000000f21', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-000000000108', 'Rafiqul Islam', current_date - interval '10 days', 'EX-DEMO-001', 400.00, 0.00, 0.00, 0.00, 0.00, 400.00, '[]'::jsonb, 'requested', '', '00000000-0000-4000-8000-000000000001')
on conflict (exit_no) do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- Q) PROGRAMS — projects, budget, logframe, beneficiaries, enrollments, services, activities
-- ═════════════════════════════════════════════════════════════════════════════
insert into projects (id, org_id, branch_id, code, name_bn, name_en, donor, grant_agreement_no, fund_code, sector, start_date, end_date, target_areas, target_beneficiaries, manager_name, status) values
  ('00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'PRJ-2026-001', 'শিক্ষা সহায়তা প্রকল্প', 'Education Support Project', 'Demo Donor Foundation', 'GA-2026-01', 'RF-EDU-01', 'education', current_date - interval '100 days', (current_date + interval '265 days')::date, '["সিরাজগঞ্জ সদর"]'::jsonb, 300, 'Demo Super Admin', 'active'),
  ('00000000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', 'PRJ-2026-002', 'স্বাস্থ্য সচেতনতা প্রকল্প', 'Health Awareness Project', 'Global Demo Fund', 'GA-2026-02', 'RF-HP-01', 'health', current_date - interval '30 days', (current_date + interval '335 days')::date, '["পাবনা ঈশ্বরদী"]'::jsonb, 150, 'Demo Super Admin', 'proposed')
on conflict (org_id, code) do nothing;

insert into project_budget_lines (id, org_id, project_id, line_item, amount, note) values
  ('00000000-0000-4000-8000-000000000a11', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a01', 'শিক্ষা উপকরণ', 120000.00, 'কিট বিতরণ (ডেমো)')
on conflict do nothing;

insert into logframe_entries (id, org_id, project_id, level, statement, parent_label, indicator_code, baseline, target_value, unit, means_of_verification) values
  ('00000000-0000-4000-8000-000000000a12', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a01', 'goal', 'সব শিশুর স্কুলে ফিরে যাওয়া নিশ্চিত (ডেমো)', null, null, '0', '300', 'জন', 'প্রকল্প রিপোর্ট'),
  ('00000000-0000-4000-8000-000000000a13', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a01', 'output', 'শিক্ষা কিট বিতরণ (ডেমো)', 'goal', null, '0', '300', 'জন', 'বিতরণ তালিকা'),
  ('00000000-0000-4000-8000-000000000a14', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a01', 'indicator', 'কিট পাওয়া শিক্ষার্থীর সংখ্যা', 'output', 'IND-1', '0', '300', 'জন', 'কিট রেজিস্টার')
on conflict do nothing;

insert into indicator_values (id, org_id, entry_id, period_start, period_end, value, evidence, note) values
  ('00000000-0000-4000-8000-000000000a15', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a14', (current_date - interval '30 days')::date, (current_date - interval '1 day')::date, '86', '[]'::jsonb, 'সেপ্টেম্বর মাসের রিপোর্ট (ডেমো)')
on conflict do nothing;

insert into beneficiaries (id, org_id, branch_id, code, member_id, name_bn, guardian_bn, phone, age, gender, village) values
  ('00000000-0000-4000-8000-000000000a31', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'BEN-001', '00000000-0000-4000-8000-000000000103', 'মিতু আক্তার', 'ফাতেমা খাতুন', '01713000001', 12, 'female', 'রামপুর'),
  ('00000000-0000-4000-8000-000000000a32', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b1', 'BEN-002', null, 'জাহিদ হাসান', 'আব্দুল করিম', '01713000002', 10, 'male', 'রামপুর'),
  ('00000000-0000-4000-8000-000000000a33', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-0000000000b2', 'BEN-003', null, 'রুমানা পারভীন', 'জসিম উদ্দিন', '01713000003', 34, 'female', 'মির্জাপুর')
on conflict (org_id, code) do nothing;

insert into program_enrollments (id, org_id, beneficiary_id, project_id, enrolled_at, note) values
  ('00000000-0000-4000-8000-000000000a41', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a31', '00000000-0000-4000-8000-000000000a01', (current_date - interval '50 days')::date, 'ডেমো ভর্তি'),
  ('00000000-0000-4000-8000-000000000a42', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a32', '00000000-0000-4000-8000-000000000a01', (current_date - interval '45 days')::date, 'ডেমো ভর্তি'),
  ('00000000-0000-4000-8000-000000000a43', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a33', '00000000-0000-4000-8000-000000000a02', (current_date - interval '10 days')::date, 'ডেমো ভর্তি')
on conflict do nothing;

insert into program_services (id, org_id, project_id, beneficiary_id, kind, service_date, details) values
  ('00000000-0000-4000-8000-000000000a51', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000a31'::uuid, 'kit_distribution', (current_date - interval '20 days')::date, 'শিক্ষা কিট (ডেমো)'),
  ('00000000-0000-4000-8000-000000000a52', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a02', '00000000-0000-4000-8000-000000000a33', 'awareness_session', (current_date - interval '8 days')::date, 'স্বাস্থ্য সচেতনতা (ডেমো)')
on conflict do nothing;

insert into program_activities (id, org_id, project_id, title_bn, kind, planned_date, venue, target_participants, status, note) values
  ('00000000-0000-4000-8000-000000000a61', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a01', 'কিট বিতরণ সপ্তাহ', 'kit_distribution', current_date - interval '20 days', 'রামপুর স্কুল', 120, 'done', 'সম্পন্ন (ডেমো)'),
  ('00000000-0000-4000-8000-000000000a62', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a01', 'স্কুল পরিদর্শন', 'awareness_session', current_date + interval '10 days', 'রামপুর স্কুল', 90, 'planned', ''),
  ('00000000-0000-4000-8000-000000000a63', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a02', 'স্বাস্থ্য ক্যাম্প', 'health_camp', current_date + interval '15 days', 'মির্জাপুর কমিউনিটি সেন্টার', 200, 'planned', ''),
  ('00000000-0000-4000-8000-000000000a64', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a01', 'অভিভাবক সচেতনতা সভা', 'awareness_session', current_date - interval '5 days', 'রামপুর স্কুল', 80, 'done', 'সম্পন্ন (ডেমো)')
on conflict do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- R) PROGRAMS OPS — expenses, field visit, sensitive case, funding tracker
-- ═════════════════════════════════════════════════════════════════════════════
insert into project_expenses (id, org_id, project_id, expense_date, budget_line, amount, voucher_no, description, recorded_by) values
  ('00000000-0000-4000-8000-000000000a71', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a01', current_date - interval '18 days', 'শিক্ষা উপকরণ', 48000.00, 'VCH-DEMO-001', 'কিট বিতরণ ব্যয় (ডেমো)', 'Demo Super Admin'),
  ('00000000-0000-4000-8000-000000000a72', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a01', current_date - interval '6 days', 'শিক্ষা উপকরণ', 12000.00, 'VCH-DEMO-002', 'পরিবহন ব্যয় (ডেমো)', 'Demo Super Admin')
on conflict do nothing;

insert into field_visits (id, org_id, project_id, visit_date, officer_id, officer_name, village, beneficiaries_met, checklist, photos, findings, follow_ups) values
  ('00000000-0000-4000-8000-000000000a81', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a01', current_date - interval '5 days', '00000000-0000-4000-8000-000000000001', 'Demo Super Admin', 'রামপুর', 24,
   '[{"item":"বিতরণ তালিকা মিলছে","passed":true},{"item":"ফলো-আপ প্রয়োজন","passed":false}]'::jsonb, '[]'::jsonb, 'কিট ব্যবহার ভালো; ফলো-আপ দরকার (ডেমো)',
   '[{"action":"ফলো-আপ পরিদর্শন","owner":"Demo Super Admin","dueDate":"2026-10-20","done":false}]'::jsonb)
on conflict do nothing;

-- Sensitive case (RLS masks restricted_details for non-privileged roles live).
insert into cases (id, org_id, case_no, type, severity, status, beneficiary_id, beneficiary_name, restricted_details, consent_given, assigned_worker_id, assigned_worker_name) values
  ('00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-0000000000aa', 'CASE-DEMO-001', 'child_marriage', 'high', 'in_progress', '00000000-0000-4000-8000-000000000a31', 'মিতু আক্তার', 'RESTRICTED ডেমো বিস্তারিত', false, '00000000-0000-4000-8000-000000000001', 'Demo Super Admin')
on conflict (org_id, case_no) do nothing;

insert into case_access_log (id, org_id, case_id, user_id, user_name, action, at) values
  ('00000000-0000-4000-8000-000000000a92', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000a91', '00000000-0000-4000-8000-000000000001', 'Demo Super Admin', 'create', now())
on conflict do nothing;

insert into funding_sources (id, org_id, code, source_name, kind, principal, interest_rate_pct, tenure_months, disbursement_date, repayment_start, purpose_project_id, lender_contact, status) values
  ('00000000-0000-4000-8000-000000000b01', '00000000-0000-4000-8000-0000000000aa', 'FS-DEMO-001', 'PKSF ঋণচক্র (ডেমো)', 'pksf', 1000000.00, 6.00, 24, (current_date - interval '200 days')::date, (current_date - interval '170 days')::date, '00000000-0000-4000-8000-000000000a01', 'demo-pksf@example.com', 'active')
on conflict (org_id, code) do nothing;

insert into funding_repayments (id, org_id, source_id, installment_no, due_date, principal, interest, total, balance, paid, paid_at) values
  ('00000000-0000-4000-8000-000000000b02', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000b01', 1, (current_date - interval '170 days')::date, 40671.00, 5000.00, 45671.00, 959329.00, true, now() - interval '170 days'),
  ('00000000-0000-4000-8000-000000000b03', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000b01', 2, (current_date - interval '140 days')::date, 40671.00, 5000.00, 45671.00, 918658.00, true, now() - interval '140 days')
on conflict (source_id, installment_no) do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- S) COMMUNICATION — templates, deliveries, opt-out, rules, spend
-- ═════════════════════════════════════════════════════════════════════════════
insert into message_templates (id, org_id, kind, name, locale, channel, subject, body, enabled, updated_by) values
  ('00000000-0000-4000-8000-000000000e01', '00000000-0000-4000-8000-0000000000aa', 'installment_reminder', 'কিস্তি স্মারক', 'bn', 'sms', '', 'প্রিয় {name}, আপনার কিস্তি {amount} টাকা {date} তারিখে বাকি। সময়মতো পরিশোধ করুন।', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e02', '00000000-0000-4000-8000-0000000000aa', 'disbursement_confirmation', 'ঋণ প্রদান নিশ্চিতকরণ', 'bn', 'in_app', '', '{name}, আপনার {amount} টাকা ঋণ প্রদান করা হয়েছে।', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e03', '00000000-0000-4000-8000-0000000000aa', 'meeting_notice', 'সভা নোটিশ', 'bn', 'in_app', '', '{samity} সমিতির সভা {date} তারিখে অনুষ্ঠিত হবে।', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e04', '00000000-0000-4000-8000-0000000000aa', 'overdue_notice', 'বকেয়া নোটিশ', 'bn', 'sms', '', '{name}, আপনার ঋণের কিস্তি বাকি রয়েছে। দয়া করে অফিসে যোগাযোগ করুন।', true, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e05', '00000000-0000-4000-8000-0000000000aa', 'receipt', 'রশিদ', 'bn', 'in_app', '', '{name}, আপনার আদায়ের রশিদ নম্বর {receipt}।', true, '00000000-0000-4000-8000-000000000001')
on conflict (org_id, kind, locale, channel) do nothing;

insert into message_deliveries (id, org_id, channel, provider, recipient_name, recipient, kind, template_id, subject, body, status, cost, sent_at) values
  ('00000000-0000-4000-8000-000000000e11', '00000000-0000-4000-8000-0000000000aa', 'sms', 'demo-sms', 'Rahela Begum', '01711000001', 'installment_reminder', '00000000-0000-4000-8000-000000000e01', '', 'প্রিয় রাহেলা, কিস্তি ২৬৯৬ টাকা ২ দিনের মধ্যে বাকি।', 'sent', 0.35, now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000e12', '00000000-0000-4000-8000-0000000000aa', 'in_app', 'internal', 'Abdul Karim', '00000000-0000-4000-8000-000000000102', 'meeting_notice', '00000000-0000-4000-8000-000000000e03', '', 'সোনালী সমিতির সভা শুক্রবার ১৭:৩০।', 'sent', 0, now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000e13', '00000000-0000-4000-8000-0000000000aa', 'sms', 'demo-sms', 'Jasim Uddin', '01711000006', 'overdue_notice', '00000000-0000-4000-8000-000000000e04', '', 'জসিম উদ্দিন, বকেয়া কিস্তি রয়েছে — অফিসে যোগাযোগ করুন।', 'queued', 0, null)
on conflict do nothing;

insert into notifications (id, org_id, user_id, title, body, kind, link, read, created_at) values
  ('00000000-0000-4000-8000-000000000e21', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'বকেয়া কিস্তি সতর্কতা', 'LA-DEMO-001 এর ৫ম কিস্তি ৪২ দিন বাকি', 'overdue', '/loans/00000000-0000-4000-8000-000000000501', false, now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000e22', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000001', 'নতুন সদস্য আবেদন', 'মরিয়ম আক্তারের যাচাই বাকি', 'member_admission', '/members/new', false, now() - interval '2 days')
on conflict do nothing;

insert into comm_opt_outs (org_id, recipient, sms, note) values
  ('00000000-0000-4000-8000-0000000000aa', '01711000008', true, 'সদস্য সম্পূর্ণ অপ্ট-আউট (ডেমো)')
on conflict do nothing;

insert into comm_rules (org_id, send_window_start, send_window_end, max_retries, retry_backoff_minutes, daily_cost_cap, monthly_cost_cap, cost_per_sms_part) values
  ('00000000-0000-4000-8000-0000000000aa', '09:00', '20:00', 3, 15, 500.00, 5000.00, 0.35)
on conflict (org_id) do nothing;

insert into comm_spend (org_id, day, month, daily_cost, monthly_cost) values
  ('00000000-0000-4000-8000-0000000000aa', (current_date - interval '1 day')::date, to_char((current_date - interval '1 day'), 'YYYY-MM'), 0.35, 30.45)
on conflict do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- T) DOCUMENTS — templates (cholito+sadhu), version, generated docs + verify codes,
--    bulk job (done, with items)
-- ═════════════════════════════════════════════════════════════════════════════
insert into doc_templates (id, org_id, kind, register, orientation, body, enabled, version, updated_by) values
  ('00000000-0000-4000-8000-000000000d01', '00000000-0000-4000-8000-0000000000aa', 'membership_form', 'cholito', 'portrait', '<h3>সদস্য ভর্তি ফরম</h3><p>নাম: {{name}}</p>', true, 1, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000d02', '00000000-0000-4000-8000-0000000000aa', 'loan_agreement', 'cholito', 'portrait', '<h3>ঋণ চুক্তিপত্র</h3><p>ঋণার্থী: {{name}}, রকম: {{amount}}</p>', true, 1, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000d03', '00000000-0000-4000-8000-0000000000aa', 'loan_agreement', 'sadhu', 'portrait', '<h3>ঋণ চুক্তিপত্র (সাধু)</h3><p>ঋণার্থী: {{name}}, রকম: {{amount}}</p>', true, 1, '00000000-0000-4000-8000-000000000001')
on conflict (org_id, kind, register) do nothing;

insert into doc_template_versions (id, org_id, template_id, version, body, orientation, updated_by) values
  ('00000000-0000-4000-8000-000000000d04', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d02', 1, '<h3>ঋণ চুক্তিপত্র</h3><p>ঋণার্থী: {{name}}, রকম: {{amount}}</p>', 'portrait', '00000000-0000-4000-8000-000000000001')
on conflict (template_id, version) do nothing;

insert into documents (id, org_id, kind, register, doc_no, verify_code, title_snippet, template_id, template_version, reference_id, payload, issued_by, html) values
  ('00000000-0000-4000-8000-000000000d11', '00000000-0000-4000-8000-0000000000aa', 'loan_agreement', 'cholito', 'DOC-DEMO-001', 'DEMO-VERIFY-0001-00000000501', 'LA-DEMO-001 ঋণ চুক্তি', '00000000-0000-4000-8000-000000000d02', 1, '00000000-0000-4000-8000-000000000501',
   '{"member":"Rahela Begum","amount":30000}'::jsonb, '00000000-0000-4000-8000-000000000001', '<h3>ঋণ চুক্তিপত্র</h3><p>ঋণার্থী: Rahela Begum (ডেমো হাতে করা নথি)</p>'),
  ('00000000-0000-4000-8000-000000000d12', '00000000-0000-4000-8000-0000000000aa', 'membership_form', 'cholito', 'DOC-DEMO-002', 'DEMO-VERIFY-0002-00000000101', 'MEM-DEMO-001 ভর্তি ফরম', '00000000-0000-4000-8000-000000000d01', 1, '00000000-0000-4000-8000-000000000101',
   '{"member":"Rahela Begum"}'::jsonb, '00000000-0000-4000-8000-000000000001', '<h3>সদস্য ভর্তি ফরম</h3><p>নাম: Rahela Begum (ডেমো)</p>')
on conflict (org_id, doc_no) do nothing;

insert into bulk_jobs (id, org_id, kind, scope, scope_id, scope_name, params, status, total, processed, failed, created_by, finished_at) values
  ('00000000-0000-4000-8000-000000000d21', '00000000-0000-4000-8000-0000000000aa', 'documents_batch', 'samity', '00000000-0000-4000-8000-000000000c11', 'সোনালী সমিতি',
   '{"docKind":"membership_form"}'::jsonb, 'done', 3, 3, 0, '00000000-0000-4000-8000-000000000001', now() - interval '0.5 day')
on conflict do nothing;

insert into bulk_job_items (id, org_id, job_id, target_id, target_name, status, ref_id) values
  ('00000000-0000-4000-8000-000000000d22', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d21', '00000000-0000-4000-8000-000000000101', 'Rahela Begum', 'done', '00000000-0000-4000-8000-000000000d12'),
  ('00000000-0000-4000-8000-000000000d23', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d21', '00000000-0000-4000-8000-000000000102', 'Abdul Karim', 'done', null),
  ('00000000-0000-4000-8000-000000000d24', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000d21', '00000000-0000-4000-8000-000000000103', 'Fatema Khatun', 'done', null)
on conflict do nothing;

-- ═════════════════════════════════════════════════════════════════════════════
-- U) SECURITY — config, retention rules, correction request
-- ═════════════════════════════════════════════════════════════════════════════
insert into security_config (org_id, password_policy, totp_config, lockout_policy, session_policy, ip_allowlist, updated_by) values
  ('00000000-0000-4000-8000-0000000000aa', '{"min_length":8,"require_digit":true,"require_upper":true,"require_special":true}'::jsonb,
   '{"enabled":false,"required_for_admins":true}'::jsonb, '{"max_failed":5,"window_minutes":15,"lock_minutes":15}'::jsonb,
   '{"absolute_hours":12,"idle_minutes":30}'::jsonb, '{"enabled":false,"cidrs":[]}'::jsonb, '00000000-0000-4000-8000-000000000001')
on conflict (org_id) do nothing;

insert into retention_rules (id, org_id, class, retain_months, legal_hold, updated_by) values
  ('00000000-0000-4000-8000-000000000e31', '00000000-0000-4000-8000-0000000000aa', 'member_core', 120, false, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e32', '00000000-0000-4000-8000-0000000000aa', 'savings_transactions', 120, false, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e33', '00000000-0000-4000-8000-0000000000aa', 'loan_records', 180, false, '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000e34', '00000000-0000-4000-8000-0000000000aa', 'audit_logs', 84, false, '00000000-0000-4000-8000-000000000001')
on conflict (org_id, class) do nothing;

insert into member_corrections (id, org_id, member_id, member_name, field, current_value, requested_value, reason, status, decision_note, created_at, updated_at) values
  ('00000000-0000-4000-8000-000000000e41', '00000000-0000-4000-8000-0000000000aa', '00000000-0000-4000-8000-000000000104', 'Shahjahan Mia', 'phone', '01711000004', '01711000014', 'নম্বরটি আর সক্রিয় নয় (ডেমো অনুরোধ)', 'submitted', '', now() - interval '2 days', now() - interval '2 days')
on conflict do nothing;

commit;
