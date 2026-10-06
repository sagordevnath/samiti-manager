// mint-jwt.mjs — print a locally-minted super_admin JWT for live API testing.
// Uses SUPABASE_JWT_SECRET from .env (never prints the secret itself).
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

function loadEnv() {
  for (const p of ['.env', '.env.example']) {
    if (existsSync(p)) {
      const out = {};
      for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2].trim();
      }
      if (out.SUPABASE_URL) return out;
    }
  }
  console.error('No .env / .env.example found.');
  process.exit(3);
}

const env = loadEnv();
const url = env.SUPABASE_URL ?? '';
const ref = url.replace(/^https:\/\/([a-z0-9]+)\..*$/, '$1');
const b64u = (b) => Buffer.from(b).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const payload = b64u(
  JSON.stringify({
    iss: 'supabase',
    ref,
    role: 'super_admin',
    sub: '00000000-0000-4000-8000-0000000000ad',
    email: 'dev@samity.test',
    org_id: '00000000-0000-4000-8000-0000000000aa',
    iat: now,
    exp: now + 3600,
  }),
);
const sig = createHmac('sha256', env.SUPABASE_JWT_SECRET ?? '').update(`${header}.${payload}`).digest('base64url');
console.log(`${header}.${payload}.${sig}`);
