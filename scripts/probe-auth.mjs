// probe-auth.mjs — determine which credential path can READ + WRITE the live DB.
// Prints verdicts, counts, and HTTP status only — never key values.
// Reads credentials from .env (preferred) or .env.example fallback.
import { createHmac } from 'node:crypto';

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
if (!env) {
  console.log('No .env/.env.example with SUPABASE_URL found.');
  process.exit(3);
}
console.log(`creds file : ${env.file}`);
const url = env.SUPABASE_URL;
const mask = (k) => (k ? `${k.slice(0, 6)}…(${k.length} chars)` : 'MISSING');
console.log(`URL        : ${url}`);
console.log(`anon       : ${mask(env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY)}`);
console.log(`service    : ${mask(env.SUPABASE_SERVICE_ROLE_KEY)}`);
console.log(`jwt secret : ${mask(env.SUPABASE_JWT_SECRET)}`);

function jwtRole(token) {
  if (!token || !token.includes('.')) return 'not-a-jwt';
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.role ?? '(no role claim)';
  } catch {
    return 'unparseable';
  }
}
console.log(`service key role claim: ${jwtRole(env.SUPABASE_SERVICE_ROLE_KEY)}`);

const secret = env.SUPABASE_JWT_SECRET ?? '';
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function mintServiceJwt() {
  if (!secret) return null;
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64u(
    JSON.stringify({ iss: 'supabase', ref: url.replace(/^https:\/\/([a-z0-9]+)\..*$/, '$1'), role: 'service_role', iat: now, exp: now + 315_360_000 }),
  );
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}
const minted = mintServiceJwt();
console.log(`minted service_role JWT: ${minted ? 'yes (secret accepted format)' : 'no secret'}`);

async function probe(label, apiKey, bearer, path = 'members?select=*', preferCount = false) {
  try {
    const headers = { apikey: apiKey };
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (preferCount) {
      headers.Prefer = 'count=exact';
      headers.Range = '0-0';
    }
    const res = await fetch(`${url}/rest/v1/${path}`, { headers });
    const body = await res.text();
    let detail = body.slice(0, 110);
    try {
      const j = JSON.parse(body);
      detail = j.message ?? j.error ?? j.hint ?? detail;
    } catch { /* raw */ }
    let count = '';
    if (preferCount) {
      const range = res.headers.get('content-range') ?? '*/?';
      count = ` count=${range.split('/')[1]}`;
    }
    console.log(`${label}: HTTP ${res.status}${count} — ${res.ok ? 'OK' : detail}`);
    return res.ok;
  } catch (err) {
    console.log(`${label}: network error — ${err.message}`);
    return false;
  }
}

const anon = env.SUPABASE_ANON_KEY ?? env.VITE_SUPABASE_ANON_KEY ?? '';
const svc = env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const combos = [
  ['A service-key as apikey+bearer        ', svc, svc],
  ['B minted JWT as apikey+bearer         ', minted, minted],
  ['C publishable apikey + minted bearer  ', anon, minted],
  ['D service apikey + minted bearer      ', svc, minted],
  ['E legacy-anon apikey + minted bearer  ', svc, minted],
  ['F publishable apikey + legacy bearer  ', anon, svc],
];

for (const [label, apiKey, bearer] of combos) {
  if (!apiKey || !bearer) {
    console.log(`${label}: skipped (missing piece)`);
    continue;
  }
  const ok = await probe(label, apiKey, bearer, 'branches?select=*', true);
  if (ok) {
    // WRITE test: idempotent insert of the demo org row.
    try {
      const res = await fetch(`${url}/rest/v1/organizations`, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({ id: '00000000-0000-4000-8000-0000000000aa', name: 'Samity Demo Organization', code: 'DEMO-ORG' }),
      });
      const body = await res.text();
      console.log(`${label} WRITE org: HTTP ${res.status} ${res.ok ? 'OK' : body.slice(0, 140)}`);
    } catch (err) {
      console.log(`${label} WRITE org: network error — ${err.message}`);
    }
  }
}
