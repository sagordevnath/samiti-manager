-- ═════════════════════════════════════════════════════════════════════════════
-- demo-seed.sql — Samity Manager demo dataset (compact)
--   NOTE: this is the COMPACT core dataset. For the FULL dataset (login user
--   admin@samity.test + every module: collection, delinquency, welfare,
--   governance, programs, comms, docs, security, meetings, working areas), use
--   supabase/demo-seed-full.sql instead — it is the recommended file.
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
