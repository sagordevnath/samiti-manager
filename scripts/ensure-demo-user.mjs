// ensure-demo-user.mjs — create (or repair) the demo login user
// admin@samity.test / Samity@2026 through Supabase's Admin API.
//
// Why this exists: supabase/demo-seed-full.sql inserts straight into
// auth.users. Some Supabase projects reject that insert (auth-schema NOT NULL
// columns / triggers), leaving the public tables seeded but NO login user —
// which makes the web login say "incorrect email or password". The Admin API
// always produces a GoTrue-compatible bcrypt hash plus the auth.identities row.
//
// Safe + idempotent: existing users are left alone; only the users_profile row
// is upserted. Prints status lines only — never key values.
//
//   node scripts/ensure-demo-user.mjs                 # default password
//   node scripts/ensure-demo-user.mjs 'MyNewPass1!'   # custom password
import { readFileSync, existsSync } from 'node:fs';

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
  return null;
}

const env = loadEnv();
if (!env) { console.error('No .env (or .env.example) with SUPABASE_URL found.'); process.exit(3); }
const url = env.SUPABASE_URL;
const svc = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !svc || url.includes('placeholder')) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured.');
  process.exit(3);
}

const EMAIL = 'admin@samity.test';
const PASSWORD = process.argv[2] ?? 'Samity@2026';
const ORG_ID = '00000000-0000-4000-8000-0000000000aa';
const BRANCH_ID = '00000000-0000-4000-8000-0000000000b1';
const USER_ID = '00000000-0000-4000-8000-000000000001';

const headers = { apikey: svc, Authorization: `Bearer ${svc}`, 'Content-Type': 'application/json' };

// 1) Reuse an existing account with this email if present.
let userId = null;
try {
  const r = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers });
  if (r.ok) {
    const j = await r.json();
    const found = (j.users ?? []).find((u) => u.email === EMAIL);
    if (found) { userId = found.id; console.log(`user            : existing (${userId})`); }
  }
} catch (e) { console.log(`list users      : ${e.message}`); }

// 2) Create the user with GoTrue's own hashing + identity bookkeeping.
if (!userId) {
  const r = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: USER_ID,
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      app_metadata: { provider: 'email', providers: ['email'], role: 'super_admin', org_id: ORG_ID, branch_id: null },
      user_metadata: { full_name: 'Demo Super Admin' },
    }),
  });
  const t = await r.text();
  if (!r.ok) { console.error(`create user     : HTTP ${r.status} — ${t.slice(0, 200)}`); process.exit(1); }
  userId = JSON.parse(t).id ?? USER_ID;
  console.log(`create user     : created (${userId})`);
}

// 3) Ensure the profile row the app reads (1:1 with auth.users).
const pr = await fetch(`${url}/rest/v1/users_profile`, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ id: userId, org_id: ORG_ID, branch_id: BRANCH_ID, role: 'super_admin', full_name: 'Demo Super Admin', phone: '01700000001' }),
});
console.log(`users_profile   : HTTP ${pr.status} ${pr.ok ? 'upserted' : (await pr.text()).slice(0, 160)}`);

// 4) Prove the password works through the same endpoint the browser uses.
const vr = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: env.SUPABASE_ANON_KEY ?? svc, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const vt = await vr.text();
let detail = vt.slice(0, 120);
try { const j = JSON.parse(vt); detail = j.error_description ?? j.msg ?? j.error ?? (j.access_token ? 'token issued' : detail); } catch { /* raw */ }
console.log(`login verify    : HTTP ${vr.status} — ${vr.ok ? 'SUCCESS' : detail}`);
process.exit(vr.ok ? 0 : 1);
