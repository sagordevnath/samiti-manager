// probe-gets.mjs — probe every static GET endpoint the web app loads.
//
//   node scripts/probe-gets.mjs            # against http://localhost:4000
//   PROBE_BASE=... node scripts/probe-gets.mjs
//
// Scans apps/web/src for `api.get('...')` call sites, keeps the literal
// (non-interpolated, query-less) paths, and reports any that do not answer 2xx.
// Pure Node (no shell) so it behaves the same on Windows and POSIX.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const BASE = process.env.PROBE_BASE ?? 'http://localhost:4000';
const EMAIL = process.env.PROBE_EMAIL ?? 'admin@samity.test';
const PASS = process.env.PROBE_PASS ?? 'Samity@2026';
const SRC = 'apps/web/src';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const CALL = /api\.get(?:<[^>]*>)?\(\s*[`'"]([^`'"]+)[`'"]/g;
const found = new Set();
for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(CALL)) found.add(m[1]);
}
const paths = [...found].filter((p) => p.startsWith('/') && !p.includes('${') && !p.includes('?'));

const login = await (
  await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', Origin: BASE },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  })
).json();
if (!login?.accessToken) {
  console.error(`login failed against ${BASE}`);
  process.exit(2);
}
const headers = { Authorization: `Bearer ${login.accessToken}`, 'X-Requested-With': 'XMLHttpRequest', Origin: BASE };

const bad = [];
let ok = 0;
for (const p of paths) {
  const res = await fetch(`${BASE}/api/v1${p}`, { headers });
  if (res.status >= 400) bad.push(`${res.status} ${p} :: ${(await res.text()).replace(/\s+/g, ' ').slice(0, 140)}`);
  else ok += 1;
}
console.log(`static GET endpoints: ${paths.length}  ok=${ok}  failing=${bad.length}`);
for (const b of bad) console.log('  x ' + b);
