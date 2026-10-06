// seed-demo.mjs — seed the LIVE Supabase database with demo data over REST.
//
//   node scripts/seed-demo.mjs            (reads .env, falls back to .env.example)
//
// WHAT IT CREATES (idempotent — safe to re-run):
//   1 org, 1 zone, 2 areas, 2 active + 1 planned branch, 3 samities, 2 groups,
//   12 members, savings account + opening deposit for EVERY member,
//   3 loan products, 4 DISBURSED (active) loans with repayment schedules
//   (one loan deliberately overdue → delinquency case/worklist data),
//   1 pending application, full accounting set (GL accounts, event mappings,
//   approved vouchers + lines, auto-postings, open cash-book day, petty cash,
//   bank reconciliation, fund requisition, budgets), full HR set (staff,
//   salary structures, recruitment, attendance, leave, holidays, movements,
//   approved payroll run + lines, PF ledger, KPI + appraisal, discipline),
//   full work set (October targets, 4 tasks incl. one overdue, delegation,
//   supervision submission, audit plan + findings, proposed branch opening,
//   escalation), and a delinquency starter set (settings, collection entries,
//   1 open case + follow-ups + reminder tasks, early-warning signal, root
//   cause), plus a login user admin@samity.test / Samity@2026 (super_admin).
//
// NOTE ON CREDENTIALS: the REST gateway authenticates with the project's
// anon/publishable key as `apikey`; the bearer JWT carries the role. If your
// .env holds the REAL service_role key, it is used directly. Never prints a
// key value — only masked fingerprints and HTTP verdicts.
import { createHash, createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

function loadEnv() {
  for (const p of ['.env', '.env.example']) {
    if (existsSync(p)) {
      const out = {};
      for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2].trim();
      }
      if (out.SUPABASE_URL) return { file: p, ...out };
    }
  }
  console.error('No .env / .env.example with SUPABASE_URL found.');
  process.exit(3);
}

const env = loadEnv();
const url = env.SUPABASE_URL;
const projectRef = url.replace(/^https:\/\/([a-z0-9]+)\..*$/, '$1');

// ── Credential resolution (bearer must carry role claim; apikey is the anon) ─
const publishable = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '';
const claimedService = env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const secret = env.SUPABASE_JWT_SECRET ?? '';

function roleOf(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).role ?? '?';
  } catch {
    return '?';
  }
}
function legacyJwt(role, extra = {}) {
  const b64u = (b) => Buffer.from(b).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify({ iss: 'supabase', ref: projectRef, role, iat: now, exp: now + 3600, ...extra }));
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

let bearer;
if (claimedService && roleOf(claimedService) === 'service_role') {
  bearer = claimedService; // real service key — best case
  console.log('bearer: real service_role key from env');
} else if (secret) {
  bearer = legacyJwt('service_role');
  console.log('bearer: minted service_role JWT (legacy secret path)');
} else {
  console.error('No usable bearer credential (need real service key or JWT secret).');
  process.exit(3);
}
// The `apikey` header must be a key the gateway recognizes: publishable key,
// or the legacy anon JWT if no publishable key is configured.
const apiKey = publishable || legacyJwt('anon');
console.log(`apikey: ${publishable ? 'publishable key from env' : 'minted legacy anon JWT'} (fingerprint ${createHash('sha256').update(apiKey).digest('hex').slice(0, 8)})`);

const REST = `${url}/rest/v1`;
const AUTH = `${url}/auth/v1`;
let failures = 0;

async function rest(method, table, { prefer = '', body, query = '' } = {}) {
  const headers = { apikey: apiKey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(`${REST}/${table}${query}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) {
    failures += 1;
    const text = await res.text();
    console.error(`  ✗ ${method} ${table}${query} → HTTP ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }
  return res;
}

async function upsert(table, rows, conflict = 'id') {
  const res = await rest('POST', table, {
    prefer: `resolution=merge-duplicates,return=minimal`,
    body: rows,
    query: `?on_conflict=${conflict}`,
  });
  if (res) console.log(`  ✓ ${table}: ${rows.length} row(s) upserted`);
}

// ── Fixed UUIDs (mirror supabase/demo-seed.sql) ──────────────────────────────
const ORG = '00000000-0000-4000-8000-0000000000aa';
const ZONE = '00000000-0000-4000-8000-00000000a001';
const AREA1 = '00000000-0000-4000-8000-00000000a101';
const AREA2 = '00000000-0000-4000-8000-00000000a102';
const BR1 = '00000000-0000-4000-8000-0000000000b1';
const BR2 = '00000000-0000-4000-8000-0000000000b2';
const BR3 = '00000000-0000-4000-8000-0000000000b3'; // planned third branch (proposed via branch_openings)
const S11 = '00000000-0000-4000-8000-000000000c11';
const S12 = '00000000-0000-4000-8000-000000000c12';
const S21 = '00000000-0000-4000-8000-000000000c21';
const G11 = '00000000-0000-4000-8000-000000000d11';
const G12 = '00000000-0000-4000-8000-000000000d12';
const SV_GEN = '00000000-0000-4000-8000-000000000301';
const SV_DPS = '00000000-0000-4000-8000-000000000302';
const LN_GEN = '00000000-0000-4000-8000-000000000401';
const LN_AGRI = '00000000-0000-4000-8000-000000000402';
const LN_EMRG = '00000000-0000-4000-8000-000000000403';
const APP_PEND = '00000000-0000-4000-8000-000000000502';

const STAFF = [
  { id: '00000000-0000-4000-8000-0000000009a1', name: 'Md. Anisur Rahman', name_bn: 'মোঃ আনিসুর রহমান', designation: 'শাখা ব্যবস্থাপক', grade: 'A1', branch: BR1, gross: 42000, nid: '1234' },
  { id: '00000000-0000-4000-8000-0000000009a2', name: 'Sultana Razia', name_bn: 'সুলতানা রাজিয়া', designation: 'হিসাব কর্মকর্তা', grade: 'A2', branch: BR1, gross: 28000, nid: '2345' },
  { id: '00000000-0000-4000-8000-0000000009a3', name: 'Kamal Hossain', name_bn: 'কামাল হোসেন', designation: 'শাখা ব্যবস্থাপক', grade: 'A1', branch: BR2, gross: 38000, nid: '3456' },
  { id: '00000000-0000-4000-8000-0000000009a4', name: 'Rokeya Begum', name_bn: 'রোকেয়া বেগম', designation: 'ফিল্ড অফিসার', grade: 'B1', branch: BR2, gross: 19000, nid: '4567' },
];
const APP_ACTIVE = '00000000-0000-4000-8000-000000000501'; // LA-DEMO-001: 4×weekly paid, 5th overdue

const MEMBER_IDS = Array.from({ length: 12 }, (_, i) =>
  `00000000-0000-4000-8000-0000000001${String(i + 1).padStart(2, '0')}`,
);
const MEMBERS = [
  ['MEM-DEMO-001', 'PB-DEMO-001', 'Rahela Begum', 'মোছাঃ রাহেলা বেগম', '01711000001', '1990123456001', BR1, S11, 'active', 'সোনালী সমিতি', 'পোলট্রি খামার', 'রামপুর, সিরাজগঞ্জ', 380],
  ['MEM-DEMO-002', 'PB-DEMO-002', 'Abdul Karim', 'মোঃ আব্দুল করিম', '01711000002', '1985123456002', BR1, S11, 'active', 'সোনালী সমিতি', 'ক্ষুদ্র ব্যবসা', 'রামপুর, সিরাজগঞ্জ', 370],
  ['MEM-DEMO-003', 'PB-DEMO-003', 'Fatema Khatun', 'মোসাঃ ফাতেমা খাতুন', '01711000003', '1992123456003', BR1, S11, 'active', 'সোনালী সমিতি', 'তাঁত শিল্প', 'রামপুর, সিরাজগঞ্জ', 350],
  ['MEM-DEMO-004', 'PB-DEMO-004', 'Shahjahan Mia', 'মোঃ শাহজাহান মিয়া', '01711000004', '1988123456004', BR1, S12, 'active', 'রূপালী সমিতি', 'ভ্যান চালক', 'চাঁদপুর, সিরাজগঞ্জ', 320],
  ['MEM-DEMO-005', 'PB-DEMO-005', 'Salma Akter', 'মোছাঃ সালমা আক্তার', '01711000005', '1995123456005', BR1, S12, 'active', 'রূপালী সমিতি', 'মুদি দোকান', 'চাঁদপুর, সিরাজগঞ্জ', 300],
  ['MEM-DEMO-006', 'PB-DEMO-006', 'Jasim Uddin', 'মোঃ জসিম উদ্দিন', '01711000006', '1987123456006', BR2, S21, 'active', 'একতা সমিতি', 'গরু পালন', 'মির্জাপুর, পাবনা', 150],
  ['MEM-DEMO-007', 'PB-DEMO-007', 'Nazma Haque', 'মোসাঃ নাজমা হক', '01711000007', '1993123456007', BR2, S21, 'active', 'একতা সমিতি', 'সেলাই কারখানা', 'মির্জাপুর, পাবনা', 140],
  ['MEM-DEMO-008', 'PB-DEMO-008', 'Rafiqul Islam', 'মোঃ রফিকুল ইসলাম', '01711000008', null, BR2, S21, 'inactive', 'একতা সমিতি', 'কৃষি দিনমজুর', 'মির্জাপুর, পাবনা', 120],
  ['MEM-DEMO-009', 'PB-DEMO-009', 'Morium Akter', 'মোছাঃ মরিয়ম আক্তার', '01711000009', '1996123456009', BR1, S11, 'active', 'সোনালী সমিতি', 'মুরগি খামার', 'রামপুর, সিরাজগঞ্জ', 90],
  ['MEM-DEMO-010', 'PB-DEMO-010', 'Kamal Hossain', 'মোঃ কামাল হোসেন', '01711000010', '1986123456010', BR1, S12, 'active', 'রূপালী সমিতি', 'ইটভাটা শ্রমিক', 'চাঁদপুর, সিরাজগঞ্জ', 80],
  ['MEM-DEMO-011', 'PB-DEMO-011', 'Shirin Sultana', 'মোছাঃ শিরিন সুলতানা', '01711000011', '1994123456011', BR2, S21, 'active', 'একতা সমিতি', 'সেলাই কারখানা', 'মির্জাপুর, পাবনা', 60],
  ['MEM-DEMO-012', 'PB-DEMO-012', 'Alamin Sheikh', 'মোঃ আল আমিন শেখ', '01711000012', null, BR2, S21, 'active', 'একতা সমিতি', 'ভ্যান চালক', 'মির্জাপুর, পাবনা', 30],
];
const SAVINGS = [
  // [member idx, product id, product, account no, balance]
  [0, SV_GEN, 'general', 'SA-DEMO-01', 4500],
  [1, SV_GEN, 'general', 'SA-DEMO-02', 8200],
  [2, SV_DPS, 'dps', 'SA-DEMO-03', 6000],
  [3, SV_GEN, 'general', 'SA-DEMO-04', 2100],
  [4, SV_DPS, 'dps', 'SA-DEMO-05', 3000],
  [5, SV_GEN, 'general', 'SA-DEMO-06', 12000],
  [6, SV_GEN, 'general', 'SA-DEMO-07', 1500],
  [7, SV_GEN, 'general', 'SA-DEMO-08', 400],
  [8, SV_GEN, 'general', 'SA-DEMO-09', 2600],
  [9, SV_DPS, 'dps', 'SA-DEMO-10', 5200],
  [10, SV_GEN, 'general', 'SA-DEMO-11', 1900],
  [11, SV_DPS, 'dps', 'SA-DEMO-12', 800],
];
const ACCOUNT_IDS = SAVINGS.map((_, i) => `00000000-0000-4000-8000-0000000002${String(i + 1).padStart(2, '0')}`);
const NODE_HO = ORG; // org id doubles as the Head-Office node for fund flows

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const daysAhead = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

// ── Login user — created FIRST: created_by/prepared_by columns FK auth.users ─
// GoTrue assigns the id itself, so create (or fetch) the user and thread the
// REAL id through every user-referencing row below. Never prints a secret.
const USER_EMAIL = 'admin@samity.test';
let USER_ID;
{
  const res = await fetch(`${AUTH}/admin/users`, {
    method: 'POST',
    headers: { apikey: apiKey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: USER_EMAIL,
      password: 'Samity@2026',
      email_confirm: true,
      app_metadata: { role: 'super_admin', org_id: ORG, provider: 'email', providers: ['email'] },
      user_metadata: { full_name: 'Demo Super Admin' },
    }),
  });
  const text = await res.text();
  if (res.ok) {
    USER_ID = JSON.parse(text).id;
    console.log(`login user ready: ${USER_EMAIL} (${USER_ID}) — password Samity@2026`);
  } else if (/already|duplicate|422/i.test(text)) {
    const list = await fetch(`${AUTH}/admin/users?per_page=200`, {
      headers: { apikey: apiKey, Authorization: `Bearer ${bearer}` },
    });
    const data = await list.json();
    const users = Array.isArray(data) ? data : data.users ?? [];
    const found = users.find((u) => u.email === USER_EMAIL);
    if (!found) {
      console.error(`✗ login user ${USER_EMAIL} exists but could not be fetched.`);
      process.exit(3);
    }
    USER_ID = found.id;
    console.log(`login user exists: ${USER_EMAIL} (${USER_ID}) — password Samity@2026`);
  } else {
    failures += 1;
    console.error(`✗ create user → HTTP ${res.status}: ${text.slice(0, 200)}`);
    process.exit(3);
  }
}

// ── Seed ──────────────────────────────────────────────────────────────────────
console.log('\n1) Org / zones / areas / branches');
await upsert('organizations', [{ id: ORG, name: 'Samity Demo Organization', name_bn: 'সমিতি ডেমো সংস্থা', code: 'DEMO-ORG' }]);
await upsert('zones', [{ id: ZONE, org_id: ORG, code: 'Z-01', name: 'Northern Zone', name_bn: 'উত্তর অঞ্চল' }]);
await upsert('areas', [
  { id: AREA1, org_id: ORG, zone_id: ZONE, code: 'A-01', name: 'Sirajganj Area', name_bn: 'সিরাজগঞ্জ এরিয়া' },
  { id: AREA2, org_id: ORG, zone_id: ZONE, code: 'A-02', name: 'Pabna Area', name_bn: 'পাবনা এরিয়া' },
]);
await upsert('branches', [
  { id: BR1, org_id: ORG, area_id: AREA1, name: 'Sadar Branch', name_bn: 'সদর শাখা', code: 'BR-001', district: 'Sirajganj', status: 'active', opening_date: daysAgo(400), address: 'সিরাজগঞ্জ সদর, বাংলাদেশ', gps_lat: '24.453900', gps_lng: '89.700700' },
  { id: BR2, org_id: ORG, area_id: AREA2, name: 'Kazla Branch', name_bn: 'কাজলা শাখা', code: 'BR-002', district: 'Pabna', status: 'active', opening_date: daysAgo(180), address: 'পাবনা কাজলা, বাংলাদেশ', gps_lat: '24.418000', gps_lng: '89.669000' },
  // Planned third branch (no status → default 'planned'). The proposed
  // opening in section 8 needs a real branch row for its FK.
  { id: BR3, org_id: ORG, area_id: AREA1, name: 'Shahzadpur Branch', name_bn: 'শাহজাদপুর শাখা', code: 'BR-003', district: 'Sirajganj', address: 'শাহজাদপুর, সিরাজগঞ্জ', gps_lat: '24.286000', gps_lng: '89.606000' },
]);

console.log('\n2) Samities + groups');
await upsert('samities', [
  { id: S11, org_id: ORG, branch_id: BR1, code: 'S-101', name: 'সোনালী সমিতি', village: 'রামপুর', meeting_day: 'friday', meeting_time: '17:30', meeting_place: 'রামপুর সরকারি প্রাথমিক বিদ্যালয়', status: 'active', formation_stage: 'active' },
  { id: S12, org_id: ORG, branch_id: BR1, code: 'S-102', name: 'রূপালী সমিতি', village: 'চাঁদপুর', meeting_day: 'saturday', meeting_time: '16:00', meeting_place: 'চাঁদপুর মহিলা ক্লাব', status: 'active', formation_stage: 'active' },
  { id: S21, org_id: ORG, branch_id: BR2, code: 'S-201', name: 'একতা সমিতি', village: 'মির্জাপুর', meeting_day: 'sunday', meeting_time: '17:00', meeting_place: 'মির্জাপুর কমিউনিটি সেন্টার', status: 'active', formation_stage: 'active' },
]);
await upsert('groups', [
  { id: G11, org_id: ORG, samity_id: S11, name: 'ক দল', status: 'active', member_count: 4 },
  { id: G12, org_id: ORG, samity_id: S12, name: 'খ দল', status: 'active', member_count: 2 },
]);

console.log('\n3) Members (12)');
// `samity_name` exists only when the guarded ALTER from demo-seed.sql ran.
// Pre-flight it so a fresh migrations-only database still seeds cleanly.
let samityNameOk = true;
{
  const probe = await fetch(`${REST}/members?select=samity_name&limit=1`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${bearer}` },
  });
  samityNameOk = probe.ok;
  if (!samityNameOk) console.log('  • members.samity_name not present — skipping that column');
}
await upsert(
  'members',
  MEMBERS.map((m, i) => ({
    id: MEMBER_IDS[i],
    org_id: ORG,
    branch_id: m[6],
    samity_id: m[7],
    member_code: m[0],
    passbook_no: m[1],
    full_name: m[2],
    full_name_bn: m[3],
    phone: m[4],
    national_id: m[5],
    status: m[8],
    lifecycle: m[8] === 'active' ? 'active' : 'dormant',
    join_date: daysAgo(m[13]),
    ...(samityNameOk ? { samity_name: m[9] } : {}),
    occupation: m[10],
    address: m[11],
  })),
);

console.log('\n4) Savings — product + account + opening deposit for every member');
await upsert('savings_products', [
  { id: SV_GEN, org_id: ORG, code: 'SV-GEN', name: 'সাধারণ সঞ্চয়', name_bn: 'সাধারণ সঞ্চয় হিসাব', product_type: 'voluntary', interest_rate: 8.0, compounding: 'simple', min_balance: 50, withdrawal_limit: 5000, withdrawal_limit_period: 'per_tx', maturity_months: 0, is_active: true },
  { id: SV_DPS, org_id: ORG, code: 'SV-DPS', name: 'মাসিক সঞ্চয় (ডিপিএস)', name_bn: 'ডিপিএস হিসাব', product_type: 'dps', interest_rate: 11.0, compounding: 'monthly', min_balance: 500, withdrawal_limit: 0, withdrawal_limit_period: 'per_tx', maturity_months: 60, is_active: true },
]);
await upsert(
  'savings_accounts',
  SAVINGS.map((s, i) => ({
    id: ACCOUNT_IDS[i],
    org_id: ORG,
    branch_id: MEMBERS[s[0]][6],
    member_id: MEMBER_IDS[s[0]],
    product_id: s[1],
    product: s[2],
    account_number: s[3],
    balance: s[4],
    status: 'active',
    opening_date: daysAgo(MEMBERS[s[0]][13]),
  })),
);
await upsert(
  'savings_transactions',
  SAVINGS.map((s, i) => ({
    id: `00000000-0000-4000-8000-${String(2101 + i).padStart(12, '0')}`,
    org_id: ORG,
    account_id: ACCOUNT_IDS[i],
    transaction_type: 'deposit',
    amount: s[4],
    balance_after: s[4],
    reference: 'ডেমো প্রারম্ভিক জমা',
  })),
  'id',
);

console.log('\n5) Loans — policy, products, 4 ACTIVE disbursed loans, 1 pending application');
await upsert('loan_policies', [{ id: '00000000-0000-4000-8000-000000000311', org_id: ORG, rate_cap_percent: 27, bm_approval_limit_bdt: 30000, guarantors_required: 1, max_active_loans_per_member: 2, min_days_between_loans: 90 }]);
await upsert('loan_products', [
  { id: LN_GEN, org_id: ORG, code: 'LN-GEN', name: 'সাধারণ ঋণ', name_bn: 'সাধারণ মৌসুমি-বিহীন ঋণ', product_type: 'general', min_amount: 5000, max_amount: 50000, term_months: 12, installment_frequency: 'weekly', interest_method: 'declining_balance', interest_rate: 24, service_charge: 1, processing_fee_rate: 1, insurance_premium_rate: 0.5, guarantors_required: 1, is_active: true },
  { id: LN_AGRI, org_id: ORG, code: 'LN-AGRI', name: 'কৃষি ঋণ', name_bn: 'মৌসুমি কৃষি ঋণ', product_type: 'seasonal_agri', min_amount: 10000, max_amount: 80000, term_months: 10, installment_frequency: 'monthly', interest_method: 'flat', interest_rate: 12.5, service_charge: 0.5, processing_fee_rate: 1, insurance_premium_rate: 0.5, guarantors_required: 1, is_active: true },
  { id: LN_EMRG, org_id: ORG, code: 'LN-EMRG', name: 'জরুরি ঋণ', name_bn: 'দ্রুত জরুরি ঋণ', product_type: 'emergency', min_amount: 1000, max_amount: 10000, term_months: 6, installment_frequency: 'weekly', interest_method: 'flat', interest_rate: 13, service_charge: 0, processing_fee_rate: 0, insurance_premium_rate: 0, guarantors_required: 0, is_active: true },
]);

// Active loans: [application id, member idx, product, number, amount, term, weekly-installment principal, weekly interest, installments already paid]
const ACTIVE = [
  ['00000000-0000-4000-8000-000000000501', 0, LN_GEN, 'LA-DEMO-001', 30000, 12, 2500, 120, 4],
  ['00000000-0000-4000-8000-000000000503', 5, LN_AGRI, 'LA-DEMO-003', 40000, 10, 4000, 420, 2],
  ['00000000-0000-4000-8000-000000000504', 1, LN_GEN, 'LA-DEMO-004', 20000, 12, 1650, 80, 3],
  ['00000000-0000-4000-8000-000000000505', 6, LN_EMRG, 'LA-DEMO-005', 8000, 6, 1300, 90, 1],
];
const loanApps = ACTIVE.map((l) => ({
  id: l[0],
  org_id: ORG,
  branch_id: MEMBERS[l[1]][6],
  member_id: MEMBER_IDS[l[1]],
  product_id: l[2],
  application_number: l[3],
  requested_amount: l[4],
  purpose: 'ডেমো ঋণ (সক্রিয়)',
  status: 'disbursed',
  term_months: l[5],
}));
loanApps.push({
  id: APP_PEND,
  org_id: ORG,
  branch_id: MEMBERS[10][6],
  member_id: MEMBER_IDS[10],
  product_id: LN_GEN,
  application_number: 'LA-DEMO-002',
  requested_amount: 25000,
  purpose: 'দোকানের মজুত বৃদ্ধি',
  status: 'bm_review',
  term_months: 12,
});
await upsert('loan_applications', loanApps);

// Disbursements (completed) for the 4 active loans.
await upsert(
  'loan_disbursements',
  ACTIVE.map((l, i) => ({
    id: `00000000-0000-4000-8000-0000000006${String(i + 1).padStart(2, '0')}`,
    org_id: ORG,
    branch_id: MEMBERS[l[1]][6],
    application_id: l[0],
    samity_id: MEMBERS[l[1]][7],
    status: 'completed',
    planned_date: daysAgo(70 - i * 7),
    mode: 'cash',
    disbursement_date: daysAgo(70 - i * 7),
    cash_received_by_name: MEMBERS[l[1]][2],
    disbursed_at: new Date(Date.now() - (70 - i * 7) * 86_400_000).toISOString(),
  })),
);

// Repayment schedules: weekly rows; `paid` installments in the past, the rest
// due. The DB trigger (0016) requires sum(principal) == requested_amount, so
// the final installment absorbs the rounding remainder.
const schedules = [];
ACTIVE.forEach((l, i) => {
  const [, , , , amount, , , interest, paidCount] = l;
  const weeks = l[5] === 6 ? 26 : l[5] === 10 ? 40 : 52;
  const principalPer = Math.floor(amount / weeks);
  let cumulative = 0;
  for (let seq = 1; seq <= weeks; seq += 1) {
    const due = daysAgo(70 - i * 7 - (seq - 1) * 7);
    const paid = seq <= paidCount;
    const principal = seq === weeks ? amount - cumulative : principalPer;
    cumulative += principal;
    schedules.push({
      id: `00000000-0000-4000-8000-${String(900000 + i * 1000 + seq).padStart(12, '0')}`,
      org_id: ORG,
      application_id: l[0],
      seq,
      original_due_date: due,
      due_date: due,
      principal,
      interest,
      total: principal + interest,
      balance_after: Math.max(0, amount - cumulative),
      paid_amount: paid ? principal + interest : 0,
      paid_at: paid ? due : null,
    });
  }
});
await upsert('loan_repayment_schedule', schedules, 'id');
console.log(`  • schedule rows: ${schedules.length} (paid + future installments across 4 active loans)`);

// Wizard step trail for the pending application.
await upsert(
  'loan_application_steps',
  [
    ['00000000-0000-4000-8000-0000000007a1', APP_PEND, 'member_request', 'done', 'account_officer', 'আবেদন গ্রহণ'],
    ['00000000-0000-4000-8000-0000000007a2', APP_PEND, 'officer_visit', 'done', 'account_officer', 'মাঠ পরিদর্শন সম্পন্ন'],
    ['00000000-0000-4000-8000-0000000007a3', APP_PEND, 'household_check', 'done', 'account_officer', 'পরিবার যাচাই সম্পন্ন'],
  ].map(([id, appId, stage, action, actorRole, note]) => ({
    id,
    org_id: ORG,
    application_id: appId,
    stage,
    action,
    actor_role: actorRole,
    note,
  })),
);

console.log('\n6) Accounting — chart of accounts, mappings, vouchers, cash book, petty cash, requisitions, budgets');
// 0028 backfills the default chart once at migration time (for orgs existing
// back then only). Upsert keyed on org_id+code (code has a global unique
// index) so this works on both fresh and backfilled databases.
await upsert(
  'gl_accounts',
  [
    ['1010', 'Cash in Vault', 'নগদ তহবিল', 'asset', 'cash'],
    ['1020', 'Bank Account', 'ব্যাংক হিসাব', 'asset', 'bank'],
    ['1200', 'Loan Portfolio', 'ঋণ পোর্টফোলিও', 'asset', 'control'],
    ['2100', 'Member Savings Deposits', 'সদস্য সঞ্চয় আমানত', 'liability', 'control'],
    ['4100', 'Interest Income', 'সুদ আয়', 'income', 'income'],
    ['4200', 'Fees & Commission Income', 'ফি ও কমিশন আয়', 'income', 'income'],
    ['6100', 'Salaries & Allowances', 'বেতন ও ভাতা', 'expense', 'expense'],
    ['6110', 'Office Rent', 'অফিস ভাড়া', 'expense', 'expense'],
    ['7100', 'Loan Loss Provision Expense', 'ঋণ ক্ষতি সঞ্চিতি ব্যয়', 'expense', 'expense'],
  ].map(([code, name, nameBn, type, category]) => ({ org_id: ORG, code, name, name_bn: nameBn, type, category, is_active: true })),
  'org_id,code',
);
// One mapping per event key (unique org+event) so auto-posting works out of the box.
await upsert(
  'event_journal_mappings',
  [
    ['savings_deposit', '1010', '2100'],
    ['savings_withdrawal', '2100', '1010'],
    ['loan_disbursement', '1200', '1010'],
    ['loan_collection', '1010', '1200'],
    ['fee_collected', '1010', '4200'],
    ['salary_payment', '6100', '1010'],
  ].map(([event, settlement, counter], i) => ({
    id: `00000000-0000-4000-8000-0000000008e${String(i + 1).padStart(2, '0')}`,
    org_id: ORG,
    event,
    settlement_code: settlement,
    counter_code: counter,
    is_active: true,
  })),
  'org_id,event',
);

// Approved vouchers (balanced): collection receipt + salary payment + rent.
const voucherRows = [
  { id: '00000000-0000-4000-8000-0000000008d1', branch_id: BR1, number: 'VCH-DEMO-001', type: 'cash_receipt', date: daysAgo(7), payee: 'সোনালী সমিতি', memo: 'সাপ্তাহিক আদায় (ডেমো)', lines: [['1010', 5000, 0, 'নগদ গৃহীত'], ['4100', 0, 5000, 'ঋণ সুদ ও কিস্তি']] },
  { id: '00000000-0000-4000-8000-0000000008d2', branch_id: BR1, number: 'VCH-DEMO-002', type: 'cash_payment', date: daysAgo(5), payee: 'বেতন বিল', memo: 'সেপ্টেম্বর বেতন পরিশোধ', lines: [['6100', 28000, 0, 'বেতন'], ['1010', 0, 28000, 'নগদ পরিশোধ']] },
  { id: '00000000-0000-4000-8000-0000000008d3', branch_id: BR2, number: 'VCH-DEMO-003', type: 'cash_payment', date: daysAgo(3), payee: 'বাড়িওয়ালা', memo: 'অক্টোবর অফিস ভাড়া', lines: [['6110', 8000, 0, 'ভাড়া'], ['1010', 0, 8000, 'নগদ পরিশোধ']] },
];
await upsert(
  'vouchers',
  voucherRows.map((v) => ({
    id: v.id,
    org_id: ORG,
    branch_id: v.branch_id,
    voucher_number: v.number,
    voucher_type: v.type,
    voucher_date: v.date,
    payee_payer: v.payee,
    memo: v.memo,
    status: 'approved',
    amount_total: v.lines.reduce((s, l) => s + Math.max(l[1], l[2]), 0),
    prepared_by: USER_ID,
    checked_by: USER_ID,
    checked_at: new Date().toISOString(),
    approved_by: USER_ID,
    approved_at: new Date().toISOString(),
    created_by: USER_ID,
  })),
  'id',
);
await upsert(
  'voucher_lines',
  voucherRows.flatMap((v, vi) =>
    v.lines.map((l, li) => ({
      id: `00000000-0000-4000-8000-0000000008${String(31 + vi * 2 + li).padStart(2, '0')}`,
      voucher_id: v.id,
      org_id: ORG,
      account_code: l[0],
      party_name: v.payee,
      note: l[3],
      debit: l[1].toFixed(2),
      credit: l[2].toFixed(2),
    })),
  ),
  'id',
);

// Two collection auto-postings (idempotency_key unique).
await upsert(
  'journal_postings',
  [0, 1].map((i) => ({
    id: `00000000-0000-4000-8000-0000000008f${i + 1}`,
    org_id: ORG,
    branch_id: BR1,
    event: 'loan_collection',
    source_table: 'collection_entries',
    source_id: `00000000-0000-4000-8000-0000000008c${i + 7}`,
    amount: 4000 - i * 500,
    entry_date: daysAgo(7),
    memo: 'সাপ্তাহিক আদায় (অটো পোস্টিং ডেমো)',
    voucher_id: voucherRows[0].id,
    idempotency_key: `seed:collection:${i + 1}`,
    created_by: USER_ID,
  })),
  'id',
);

// Cash book: one OPEN day at Sadar with lines. Fields are totals-only here;
// the live close endpoint computes real totals from vouchers.
await upsert(
  'cash_book_days',
  [{
    id: '00000000-0000-4000-8000-0000000008cb',
    org_id: ORG,
    branch_id: BR1,
    book_date: daysAgo(1),
    status: 'open',
    opening_balance: 25000,
    total_cash_in: 5000,
    total_cash_out: 0,
    expected_closing: 30000,
  }],
  'id',
);
await upsert(
  'cash_book_lines',
  [{
    id: '00000000-0000-4000-8000-0000000008c1',
    cash_book_id: '00000000-0000-4000-8000-0000000008cb',
    voucher_id: voucherRows[0].id,
    voucher_number: voucherRows[0].number,
    voucher_type: 'cash_receipt',
    memo: 'সাপ্তাহিক আদায়',
    cash_in: 5000,
    cash_out: 0,
  }],
  'id',
);

// Petty cash: Sadar holds ৳2,500 with one top-up movement.
await upsert(
  'petty_cash_accounts',
  [{ id: '00000000-0000-4000-8000-0000000008c2', org_id: ORG, branch_id: BR1, balance: 2500, spend_limit: 2000 }],
  'id',
);
await upsert(
  'petty_cash_movements',
  [{
    id: '00000000-0000-4000-8000-0000000008c3',
    org_id: ORG,
    branch_id: BR1,
    kind: 'top_up',
    amount: 2500,
    note: 'খুচরা নগদ প্রারম্ভ (ডেমো)',
    balance_after: 2500,
    created_by: USER_ID,
  }],
  'id',
);

// Bank reconciliation for September with one uncleared statement line.
await upsert(
  'bank_reconciliations',
  [{
    id: '00000000-0000-4000-8000-0000000008c4',
    org_id: ORG,
    branch_id: BR1,
    bank_code: '1020',
    period_start: daysAgo(32),
    period_end: daysAgo(2),
    book_balance: 148000,
    statement_balance: 146200,
    status: 'pending',
    prepared_by: USER_ID,
  }],
  'id',
);
await upsert(
  'bank_statement_lines',
  [{
    id: '00000000-0000-4000-8000-0000000008c5',
    reconciliation_id: '00000000-0000-4000-8000-0000000008c4',
    value_date: daysAgo(10),
    narration: 'SMS চার্জ',
    amount: -1800,
    cleared: false,
  }],
  'id',
);

// Fund requisition: branch → HO top-up, approved.
await upsert(
  'fund_requisitions',
  [{
    id: '00000000-0000-4000-8000-0000000008c6',
    org_id: ORG,
    kind: 'branch_to_ho',
    from_node_id: BR1,
    to_node_id: NODE_HO,
    amount: 50000,
    purpose: 'সদর শাখার নগদ সংরক্ষণ বৃদ্ধি',
    status: 'approved',
    settlement_code: '1010',
    requested_by: USER_ID,
    decided_by: USER_ID,
    decided_at: new Date().toISOString(),
    note: 'ডেমো রিকুইজিশন',
    created_by: USER_ID,
  }],
  'id',
);

// October budgets for the budget-vs-actual report.
await upsert(
  'gl_budgets',
  [
    ['6100', 120000],
    ['6110', 24000],
    ['4100', 180000],
  ].map(([code, amount], i) => ({
    id: `00000000-0000-4000-8000-0000000008b${i + 1}`,
    org_id: ORG,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    account_code: code,
    amount: amount.toFixed(2),
    created_by: USER_ID,
  })),
  'id',
);

console.log('\n7) HR — staff, salaries, recruitment, attendance, leave, payroll, PF, KPI');
await upsert(
  'hr_staff',
  STAFF.map((s, i) => ({
    id: s.id,
    org_id: ORG,
    employee_code: `EMP-00${i + 1}`,
    name: s.name,
    name_bn: s.name_bn,
    designation: s.designation,
    grade: s.grade,
    branch_id: s.branch,
    joining_date: daysAgo(900 - i * 270),
    confirmation_date: i < 2 ? daysAgo(840 - i * 270) : null,
    status: i < 2 ? 'confirmed' : 'probation',
    mobile: `0181100000${i + 1}`,
    email: ['bm.sadar@samity.test', 'ao.sadar@samity.test', 'bm.kazla@samity.test', 'fo.kazla@samity.test'][i],
    monthly_gross: s.gross,
    nid_masked: s.nid,
  })),
  'id',
);
await upsert(
  'salary_structures',
  [
    ['A1', 21000, 12000, 3000, 3000, 3000],
    ['A2', 14000, 8000, 2000, 2000, 2000],
    ['B1', 9500, 5500, 1500, 1500, 1000],
  ].map(([grade, basic, rent, med, conv, field], i) => ({
    id: `00000000-0000-4000-8000-0000000009e${i + 1}`,
    org_id: ORG,
    grade,
    basic,
    house_rent: rent,
    medical: med,
    conveyance: conv,
    field_allowance: field,
    pf_employee_rate: 0.05,
    pf_employer_rate: 0.05,
    created_by: USER_ID,
  })),
  'org_id,grade',
);
// Recruitment: one approved vacancy with an offered applicant.
await upsert(
  'hr_vacancies',
  [{
    id: '00000000-0000-4000-8000-0000000009b1',
    org_id: ORG,
    branch_id: BR1,
    designation: 'ফিল্ড অফিসার',
    headcount: 2,
    reason: 'সদর শাখার সম্প্রসারণ',
    status: 'approved',
    requested_by: USER_ID,
    decided_by: USER_ID,
    decided_at: new Date().toISOString(),
    note: 'ডেমো শূন্যপদ',
    created_by: USER_ID,
  }],
  'id',
);
await upsert(
  'hr_applicants',
  [
    ['নাজমুল হাসান', '01911000001', 'স্নাতক', 2, 'interviewed', []],
    ['তাসনিম আক্তার', '01911000002', 'স্নাতকোত্তর', 1, 'offered', [{ panel: 'BM+AO', score: 82 }]],
  ].map(([name, mobile, edu, exp, status, scores], i) => ({
    id: `00000000-0000-4000-8000-0000000009c${i + 1}`,
    org_id: ORG,
    vacancy_id: '00000000-0000-4000-8000-0000000009b1',
    name,
    mobile,
    education_level: edu,
    experience_years: exp,
    status,
    interview_scores: scores,
    offered_salary: status === 'offered' ? 18500 : null,
  })),
  'id',
);
// Attendance: yesterday — 3 present (office/field), 1 late.
await upsert(
  'hr_attendance',
  STAFF.map((s, i) => ({
    id: `00000000-0000-4000-8000-0000000009c${i + 3}`,
    org_id: ORG,
    staff_id: s.id,
    work_date: daysAgo(1),
    status: i === 3 ? 'late' : 'present',
    check_in_at: new Date(Date.now() - 86_400_000 + (9 + i) * 3_600_000).toISOString(),
    check_in_lat: 24.45 + i * 0.01,
    check_in_lng: 89.7 + i * 0.01,
    mode: i >= 2 ? 'field' : 'office',
    note: null,
  })),
  'org_id,staff_id,work_date',
);
// Leave: one pending (shows in the Work inbox) + one approved.
await upsert(
  'hr_leave_requests',
  [
    { id: '00000000-0000-4000-8000-0000000009b2', staff_id: STAFF[3].id, status: 'pending', start: daysAhead(5), end: daysAhead(6) },
    { id: '00000000-0000-4000-8000-0000000009b3', staff_id: STAFF[2].id, status: 'approved', start: daysAgo(15), end: daysAgo(14) },
  ].map((l) => ({
    id: l.id,
    org_id: ORG,
    staff_id: l.staff_id,
    leave_type: 'casual',
    start_date: l.start,
    end_date: l.end,
    days: 2,
    reason: 'পারিবারিক কাজ',
    status: l.status,
    decided_by: l.status === 'approved' ? USER_ID : null,
    decided_at: l.status === 'approved' ? new Date().toISOString() : null,
  })),
  'id',
);
await upsert(
  'hr_holidays',
  [
    [daysAhead(20), 'Eid-e-Miladunnabi', 'ঈদে মিলাদুন্নবী'],
    [daysAhead(45), 'Victory Day', 'মহান বিজয় দিবস'],
  ].map(([date, name, nameBn], i) => ({
    id: `00000000-0000-4000-8000-0000000009b${i + 4}`,
    org_id: ORG,
    date,
    name,
    name_bn: nameBn,
  })),
  'org_id,date',
);
// Transfer order (proposed) for the Kazla BM.
await upsert(
  'hr_movements',
  [{
    id: '00000000-0000-4000-8000-0000000009b6',
    org_id: ORG,
    kind: 'transfer',
    staff_id: STAFF[2].id,
    from_branch_id: BR2,
    to_branch_id: BR1,
    from_designation: STAFF[2].designation,
    to_designation: STAFF[2].designation,
    effective_date: daysAhead(15),
    reason: 'জনবল ভারসাম্য',
    status: 'proposed',
    proposed_by: USER_ID,
    created_by: USER_ID,
  }],
  'id',
);
// September payroll: approved run with per-staff lines (totals match the
// fn_payroll_totals_check trigger: lines sum == run totals).
const PAY_PERIOD = '2026-09';
const payStaff = STAFF.map((s, i) => {
  const gross = s.gross;
  const pf = Math.round(gross * 0.05);
  const tax = Math.round(gross * 0.02);
  return { staff: s, gross, pf, tax, deduction: pf + tax, net: gross - pf - tax };
});
const payTotals = payStaff.reduce(
  (t, p) => ({ gross: t.gross + p.gross, ded: t.ded + p.deduction, net: t.net + p.net }),
  { gross: 0, ded: 0, net: 0 },
);
// Draft first: trg_payroll_totals (BEFORE insert or update on payroll_runs)
// recomputes run totals from the lines, so lines must exist before the
// approving UPDATE below — inserting an already-approved run would leave
// zeroed totals (no lines yet at insert time).
const PAYROLL_RUN_ID = '00000000-0000-4000-8000-0000000009e4';
await upsert(
  'payroll_runs',
  [{
    id: PAYROLL_RUN_ID,
    org_id: ORG,
    period: PAY_PERIOD,
    status: 'draft',
    bonus_total: 0,
    prepared_by: USER_ID,
    created_by: USER_ID,
  }],
  'id',
);
// ignore-duplicates (not merge): trg_payroll_immutable lives on payroll_lines
// and rejects any line UPDATE after approval, so re-runs must skip existing
// lines instead of merging them.
{
  const lineRows = payStaff.map((p, i) => ({
    id: `00000000-0000-4000-8000-0000000009e${i + 5}`,
    org_id: ORG,
    payroll_id: PAYROLL_RUN_ID,
    staff_id: p.staff.id,
    components: { basic: Math.round(p.gross * 0.5), house_rent: Math.round(p.gross * 0.29), medical: Math.round(p.gross * 0.07), conveyance: Math.round(p.gross * 0.07), field_allowance: p.gross - Math.round(p.gross * 0.5) - Math.round(p.gross * 0.29) - Math.round(p.gross * 0.07) - Math.round(p.gross * 0.07) },
    gross: p.gross.toFixed(2),
    deductions: { pf_employee: p.pf, tax: p.tax, loan_advance: 0, other: 0 },
    total_deduction: p.deduction.toFixed(2),
    net: p.net.toFixed(2),
    bonus: 0,
    working_days: 26,
    present_days: 25,
    attendance_ratio: '0.9615',
  }));
  const lines = await rest('POST', 'payroll_lines', {
    prefer: 'resolution=ignore-duplicates,return=minimal',
    body: lineRows,
    query: '?on_conflict=payroll_id,staff_id',
  });
  if (lines) console.log(`  ✓ payroll_lines: ${lineRows.length} row(s) (gross ${payTotals.gross} / ded ${payTotals.ded} / net ${payTotals.net})`);
  const ap = await rest('PATCH', 'payroll_runs', {
    prefer: 'return=minimal',
    body: { status: 'approved', approved_by: USER_ID, approved_at: new Date().toISOString() },
    query: `?id=eq.${PAYROLL_RUN_ID}`,
  });
  if (ap) console.log('  ✓ payroll run approved — totals recomputed from lines by trigger');
}
// PF opening balances (one contribution row per staff).
await upsert(
  'pf_ledger',
  payStaff.map((p, i) => ({
    id: `00000000-0000-4000-8000-0000000009f${i + 1}`,
    org_id: ORG,
    staff_id: p.staff.id,
    period: PAY_PERIOD,
    type: 'contribution',
    employee_amount: p.pf.toFixed(2),
    employer_amount: p.pf.toFixed(2),
    balance_after: (p.pf * 2 * (i + 6)).toFixed(2),
    note: 'সেপ্টেম্বর পিএফ কাটকুটি (ডেমো)',
    created_by: USER_ID,
  })),
  'id',
);
// KPI scorecard for the Sadar BM + annual appraisal.
await upsert(
  'kpi_scorecards',
  [{
    id: '00000000-0000-4000-8000-0000000009b7',
    org_id: ORG,
    staff_id: STAFF[0].id,
    period: PAY_PERIOD,
    actuals: { collection_rate: 96.5, par: 4.2, new_members: 6, meeting_attendance: 91 },
    scores: { collection_rate: 24, par: 23, new_members: 18, meeting_attendance: 23 },
    total_score: 88,
    grade: 'A',
    created_by: USER_ID,
  }],
  'id',
);
await upsert(
  'staff_appraisals',
  [{
    id: '00000000-0000-4000-8000-0000000009a9',
    org_id: ORG,
    staff_id: STAFF[0].id,
    year: '2025',
    scores: { integrity: 9, leadership: 8.5, portfolio: 9, compliance: 8 },
    comments: 'সুশৃঙ্খল ও ফলপ্রসূ কর্মদক্ষতা (ডেমো মূল্যায়ন)',
    rating: 8.6,
    status: 'reviewed',
    reviewer_id: USER_ID,
    reviewer_note: 'বার্ষিক মূল্যায়ন সম্পন্ন (ডেমো)',
    created_by: USER_ID,
  }],
  'id',
);
// One open disciplinary case (show-cause).
await upsert(
  'disciplinary_cases',
  [{
    id: '00000000-0000-4000-8000-0000000009d1',
    org_id: ORG,
    staff_id: STAFF[3].id,
    severity: 'written_warning',
    incident_date: daysAgo(6),
    description: 'নির্ধারিত সময়ে কেন্দ্র পরিদর্শনে অনুপস্থিত',
    status: 'open',
    raised_by: USER_ID,
    created_by: USER_ID,
  }],
  'id',
);

console.log('\n8) Work — targets, tasks, delegation, supervision, audit plan + findings');
// October targets: branch + one officer split each (splits ≤ parent).
await upsert(
  'work_targets',
  [
    { id: '00000000-0000-4000-8000-000000000e01', scope: 'branch', owner_branch_id: BR1, owner_staff_id: null, owner_name: 'Sadar Branch', parent_id: null },
    { id: '00000000-0000-4000-8000-000000000e02', scope: 'branch', owner_branch_id: BR2, owner_staff_id: null, owner_name: 'Kazla Branch', parent_id: null },
    { id: '00000000-0000-4000-8000-000000000e03', scope: 'officer', owner_branch_id: BR1, owner_staff_id: STAFF[0].id, owner_name: STAFF[0].name, parent_id: '00000000-0000-4000-8000-000000000e01' },
  ].map((t, i) => ({
    id: t.id,
    org_id: ORG,
    scope: t.scope,
    owner_branch_id: t.owner_branch_id,
    owner_staff_id: t.owner_staff_id,
    owner_name: t.owner_name,
    parent_id: t.parent_id,
    period: '2026-10',
    new_members: i === 2 ? 3 : i === 0 ? 8 : 4,
    disbursement: (i === 2 ? 200000 : i === 0 ? 600000 : 300000).toFixed(2),
    collection: (i === 2 ? 180000 : i === 0 ? 500000 : 250000).toFixed(2),
    savings: (i === 2 ? 50000 : i === 0 ? 150000 : 80000).toFixed(2),
    par_limit: 5,
    created_by: USER_ID,
  })),
  'id',
);
// Tasks: overdue follow-up (assignee = Sadar BM), utilization visit, KYC, done report.
await upsert(
  'work_tasks',
  [
    { id: '00000000-0000-4000-8000-000000000e11', type: 'overdue_followup', title: 'LA-DEMO-001 বকেয়া কিস্তি ফলো-আপ', assignee: 0, due: daysAgo(2), priority: 'high', status: 'in_progress', link: ['loan', APP_ACTIVE, 'ঋণ LA-DEMO-001'] },
    { id: '00000000-0000-4000-8000-000000000e12', type: 'utilization_visit', title: 'রাহেলা বেগমের পোলট্রি খামার পরিদর্শন', assignee: 3, due: daysAhead(3), priority: 'normal', status: 'todo', link: ['member', MEMBER_IDS[0], 'সদস্য MEM-DEMO-001'] },
    { id: '00000000-0000-4000-8000-000000000e13', type: 'kyc_pending', title: 'MEM-DEMO-012 কেওয়াইসি নথি সম্পূর্ণ', assignee: 2, due: daysAhead(7), priority: 'normal', status: 'todo', link: ['member', MEMBER_IDS[11], 'সদস্য MEM-DEMO-012'] },
    { id: '00000000-0000-4000-8000-000000000e14', type: 'report_submission', title: 'সেপ্টেম্বর মাসিক প্রতিবেদন জমা', assignee: 1, due: daysAgo(4), priority: 'urgent', status: 'done', link: ['branch', BR1, 'সদর শাখা'] },
  ].map((t) => ({
    id: t.id,
    org_id: ORG,
    branch_id: STAFF[t.assignee].branch,
    type: t.type,
    title: t.title,
    description: 'ডেমো কাজ — সমন্বয়ের জন্য তৈরি',
    assignee_id: STAFF[t.assignee].id,
    assignee_name: STAFF[t.assignee].name,
    assigner_id: USER_ID,
    assigner_name: 'Demo Super Admin',
    due_date: t.due,
    priority: t.priority,
    link_kind: t.link[0],
    link_id: t.link[1],
    link_label: t.link[2],
    status: t.status,
    comments: t.status === 'in_progress' ? [{ author: STAFF[t.assignee].name, text: 'আগামী সভায় আদায়ের প্রতিশ্রুতি পেয়েছি', at: new Date(Date.now() - 86_400_000).toISOString() }] : [],
    completed_at: t.status === 'done' ? new Date(Date.now() - 3 * 86_400_000).toISOString() : null,
    created_by: USER_ID,
  })),
  'id',
);
// Delegation history: field officer covered the audit week.
await upsert(
  'task_delegations',
  [{
    id: '00000000-0000-4000-8000-000000000e21',
    org_id: ORG,
    task_id: '00000000-0000-4000-8000-000000000e12',
    from_staff_id: STAFF[3].id,
    to_staff_id: STAFF[2].id,
    reason: 'workload',
    note: 'নিরীক্ষা সপ্তাহে কাজ বণ্টন',
    created_by: USER_ID,
  }],
  'id',
);
// Supervision: a center-visit submission at Kazla.
await upsert(
  'supervision_submissions',
  [{
    id: '00000000-0000-4000-8000-000000000e31',
    org_id: ORG,
    branch_id: BR2,
    form_type: 'center_visit',
    link_id: S21,
    link_label: 'একতা সমিতি',
    submitted_by: USER_ID,
    submitted_name: 'Demo Super Admin',
    submitted_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    lat: 24.418,
    lng: 89.669,
    items: [{ label: 'খাতা হালনাগাদ', ok: true }, { label: 'নগদ মিলছে', ok: true }, { label: 'সভা ঠিক সময়ে', ok: false }],
    exceptions: 1,
    note: 'সভা বিলম্বিত হয়েছে',
    created_by: USER_ID,
  }],
  'id',
);
// Internal audit: closed plan at Sadar with two findings (one open).
await upsert(
  'audit_plans',
  [{
    id: '00000000-0000-4000-8000-000000000e41',
    org_id: ORG,
    branch_id: BR1,
    branch_name: 'Sadar Branch',
    title: 'সদর শাখা অভ্যন্তরীণ নিরীক্ষা — সেপ্টেম্বর',
    planned_date: daysAgo(12),
    lead_auditor_id: USER_ID,
    lead_auditor_name: 'Demo Super Admin',
    status: 'draft_report',
    loan_sample: [APP_ACTIVE],
    member_sample: [MEMBER_IDS[0], MEMBER_IDS[1]],
    sample_size: 10,
    created_by: USER_ID,
  }],
  'id',
);
await upsert(
  'audit_findings',
  [
    { id: '00000000-0000-4000-8000-000000000e42', ref: 'F-001', title: 'বকেয়া কিস্তির ফলো-আপ নথিভুক্ত নয়', severity: 'medium', status: 'open', detail: 'LA-DEMO-001 এর বকেয়া কিস্তির জন্য কোনো ফলো-আপ রেকর্ড পাওয়া যায়নি।', deadline: daysAhead(10) },
    { id: '00000000-0000-4000-8000-000000000e43', ref: 'F-002', title: 'খুচরা নগদ রেজিস্টার হালনাগাদ নেই', severity: 'low', status: 'responded', detail: 'দুই দিনের খরচ রেজিস্টারে লেখা হয়নি।', response: 'হালনাগাদ করা হয়েছে ও ভবিষ্যতে দৈনিক লেখা হবে।', responded_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), deadline: daysAhead(5) },
  ].map((f) => ({
    id: f.id,
    org_id: ORG,
    audit_id: '00000000-0000-4000-8000-000000000e41',
    ref: f.ref,
    title: f.title,
    detail: f.detail,
    severity: f.severity,
    status: f.status,
    response: f.response ?? '',
    responded_at: f.responded_at ?? null,
    deadline: f.deadline,
    follow_ups: [],
    created_by: USER_ID,
  })),
  'id',
);
// Proposed branch opening for a third branch.
await upsert(
  'branch_openings',
  [{
    id: '00000000-0000-4000-8000-000000000e51',
    org_id: ORG,
    branch_id: BR3,
    stage: 'proposed',
    proposal_note: 'শাহজাদপুরে নতুন শাখার প্রস্তাব — জরিপ সম্পন্ন (ডেমো)',
    proposed_by: USER_ID,
    created_by: USER_ID,
  }],
  'id',
);
// One overdue escalation row (task Wt1 → branch_manager tier).
await upsert(
  'work_escalations',
  [{
    id: '00000000-0000-4000-8000-000000000e52',
    org_id: ORG,
    entity_type: 'task',
    entity_id: '00000000-0000-4000-8000-000000000e11',
    days_overdue: 2,
    tier_role: 'branch_manager',
    created_by: USER_ID,
  }],
  'id',
);

console.log('\n9) Delinquency — settings, collection entries, case, follow-ups, tasks, EWS, root causes');
await upsert(
  'delinquency_settings',
  [{
    org_id: ORG,
    bucket_bounds: { d1_30: 30, d31_90: 90, d91_180: 180 },
    provisioning_pct: { standard: 0, substandard: 25, doubtful: 50, bad: 100 },
    asset_class_by_dpd: { substandard: 31, doubtful: 91, bad: 181 },
    escalate_to_bm_days: 3,
    escalate_to_am_days: 15,
    created_by: USER_ID,
  }],
  'org_id',
);
// Two weekly collection entries for Sadar (visible in Collection Sheet + targets).
await upsert(
  'collection_entries',
  [0, 1].map((i) => ({
    id: `00000000-0000-4000-8000-0000000008c${i + 7}`,
    org_id: ORG,
    branch_id: BR1,
    idempotency_key: `00000000-0000-4000-8000-0000000008c${i + 7}`,
    member_id: MEMBER_IDS[i],
    application_id: APP_ACTIVE,
    meeting_date: daysAgo(7 - i),
    loan_paid: (2600 - i * 100).toFixed(2),
    savings_paid: (400 - i * 100).toFixed(2),
    extra_paid: '0.00',
    allocation: { installments: [{ applicationId: APP_ACTIVE, amount: 2600 - i * 100 }], savings: 400 - i * 100, extra: 0 },
    receipt_no: `RCT-DEMO-${String(i + 1).padStart(4, '0')}`,
    collected_by: USER_ID,
    captured_at: new Date(Date.now() - (7 - i) * 86_400_000).toISOString(),
    note: 'ডেমো সাপ্তাহিক আদায়',
    created_by: USER_ID,
  })),
  'id',
);
// Case for the overdue loan (run/loan_classifications are computed live by the
// classify endpoint — seeded cases give the worklist/follow-ups data at once).
await upsert(
  'delinquency_cases',
  [{
    id: '00000000-0000-4000-8000-000000000d01',
    org_id: ORG,
    application_id: APP_ACTIVE,
    branch_id: BR1,
    samity_id: S11,
    officer_id: STAFF[0].id,
    // Numbers match the seeded schedule: LA-DEMO-001 paid 4 of 52 weeks →
    // seq 5 fell due 42 days ago; 6 unpaid weeks × (576 + 120) = 4176 overdue,
    // outstanding = 30000 − 4×576 principal = 27696. The live classify endpoint
    // recomputes these from loan_repayment_schedule on every run.
    days_past_due: 42,
    bucket: 'd31_90',
    overdue_total: 4176,
    outstanding: 27696,
    assigned_level: 'branch_manager',
    assigned_to: STAFF[0].id,
    status: 'open',
    opened_at: daysAgo(7),
    created_by: USER_ID,
  }],
  'id',
);
await upsert(
  'delinquency_follow_ups',
  [
    { id: '00000000-0000-4000-8000-000000000d11', type: 'phone_call', outcome: 'promise_to_pay', promise: daysAhead(2), note: 'শুক্রবারের মধ্যে কিস্তি দেবেন', next: daysAhead(3) },
    { id: '00000000-0000-4000-8000-000000000d12', type: 'visit', outcome: 'partial_paid', promise: null, note: '৫০০ টাকা পরিশোধ করেছেন', next: daysAhead(5) },
  ].map((f) => ({
    id: f.id,
    org_id: ORG,
    case_id: '00000000-0000-4000-8000-000000000d01',
    type: f.type,
    outcome: f.outcome,
    promise_date: f.promise,
    promise_amount: f.promise ? 2620 : null,
    note: f.note,
    next_visit_date: f.next,
    created_by: USER_ID,
  })),
  'id',
);
// Reminder tasks are NOT seeded by hand: trigger trg_delinquency_follow_up_task
// (0024, AFTER insert) auto-creates one delinquency_tasks row per follow-up
// that carries a promise_date / next_visit_date — both seeded follow-ups do.
// Early-warning: member 1 (LA-DEMO-001) has six unpaid installments — the
// live scan (countConsecutiveMissed ≥ 2) would raise the same signal.
// early_warning_signals.ref_id is a generic reference, no FK.
await upsert(
  'early_warning_signals',
  [{
    id: '00000000-0000-4000-8000-000000000d21',
    org_id: ORG,
    kind: 'member_missed_two',
    severity: 'medium',
    ref_id: MEMBER_IDS[0],
    branch_id: BR1,
    detail: 'টানা ২ কিস্তি বাকি পড়েছে (ডেমো সংকেত)',
    detail_bn: 'টানা ২ কিস্তি বাকি পড়েছে — দ্রুত যোগাযোগ করুন',
    metric: 2,
    prior_metric: 1,
    acknowledged: false,
  }],
  'id',
);
// Root-cause note on the overdue loan.
await upsert(
  'delinquency_root_causes',
  [{
    id: '00000000-0000-4000-8000-000000000d31',
    org_id: ORG,
    application_id: APP_ACTIVE,
    cause: 'business_failure',
    note: 'পোলট্রি খামারে সাময়িক লোকসান (ডেমো)',
    created_by: USER_ID,
  }],
  'id',
);

console.log(failures === 0 ? '\nSEED COMPLETE — no errors.' : `\nSEED FINISHED WITH ${failures} ERROR(S) — see ✗ lines above.`);
process.exit(failures === 0 ? 0 : 1);
