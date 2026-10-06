// verify-members.mjs — live-mode smoke test for GET /api/v1/members.
// Run: node scripts/secrets-run.mjs --env dev -- node scripts/verify-members.mjs [baseUrl]
// Mints a short-lived super_admin JWT from the injected SUPABASE_JWT_SECRET
// (never printed), calls the members endpoint, and asserts the seeded demo
// members come back with samity + branch names resolved.
import jwt from 'jsonwebtoken';

const baseUrl = process.argv[2] ?? 'http://localhost:4000/api/v1';
const secret = process.env.SUPABASE_JWT_SECRET;
const url = process.env.SUPABASE_URL;

if (!secret) {
  console.error('FAIL: SUPABASE_JWT_SECRET not injected (run via scripts/secrets-run.mjs)');
  process.exit(2);
}
if (url?.includes('placeholder') || secret.includes('placeholder')) {
  console.error('SKIP: API env is placeholder — live mode not configured yet.');
  console.error('      Fill apps/api/.env (or Infisical) with real SUPABASE_URL /');
  console.error('      SUPABASE_SERVICE_ROLE_KEY / SUPABASE_JWT_SECRET, restart npm run dev, re-run.');
  process.exit(3);
}

const token = jwt.sign(
  {
    sub: '00000000-0000-4000-8000-000000000001',
    email: 'verify@samity.test',
    role: 'super_admin',
    org_id: '00000000-0000-4000-8000-0000000000aa',
  },
  secret,
  { expiresIn: '5m' },
);

const res = await fetch(`${baseUrl}/members?pageSize=50`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`FAIL: GET /members -> ${res.status}`);
  console.error((await res.text()).slice(0, 400));
  process.exit(1);
}

const body = await res.json();
const items = body.items ?? [];
const codes = items.map((m) => m.member_code).filter(Boolean);
const expected = Array.from({ length: 12 }, (_, i) => `MEM-DEMO-${String(i + 1).padStart(3, '0')}`);
const missing = expected.filter((c) => !codes.includes(c));
const unnamed = items.filter((m) => !m.samities?.name || !m.branches?.code);

console.log(`total=${body.total} returned=${items.length}`);
for (const m of items) {
  console.log(
    `  ${m.member_code ?? '??'}  ${(m.full_name_bn ?? m.full_name ?? '—').padEnd(22)}  samity=${m.samities?.name ?? '—'}  branch=${m.branches?.code ?? '—'}  lifecycle=${m.lifecycle}`,
  );
}

let ok = true;
if (items.length < 12) { console.error(`FAIL: expected >= 12 members, got ${items.length}`); ok = false; }
if (missing.length) { console.error(`FAIL: missing seeded members: ${missing.join(', ')}`); ok = false; }
if (unnamed.length) {
  console.error(`FAIL: ${unnamed.length} row(s) missing samity/branch embed: ${unnamed.map((m) => m.member_code).join(', ')}`);
  ok = false;
}
console.log(ok ? '\nPASS: all 12 demo members with samity + branch names ✅' : '\nFAIL ❌');
process.exit(ok ? 0 : 1);
