#!/usr/bin/env node
/**
 * Scratch controlled liveness probe v2 (never committed).
 * Adds a wrong-secret negative control, a real table endpoint, and full
 * short bodies. Never prints secret values.
 */
import https from 'node:https';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const parse = (t) => {
  const out = {};
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.replace(/\r$/, '');
    const m = line.match(/^(\s*)(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[3];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[2]] = v;
  }
  return out;
};

const blob = execFileSync('git', ['show', '6041f4a:.env.example']).toString('utf8');
const cand = parse(blob);
const env = parse(readFileSync('.env', 'utf8'));
const host = new URL(cand.SUPABASE_URL).host;
const pub = cand.SUPABASE_ANON_KEY;
const secret = cand.SUPABASE_JWT_SECRET;
const wrong = 'definitely-not-the-project-secret-000000000000';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const mint = (key) => {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ role: 'anon', iss: 'supabase', sub: '00000000-0000-4000-8000-000000000001', iat: now, exp: now + 600 });
  return h + '.' + p + '.' + crypto.createHmac('sha256', key).update(h + '.' + p).digest('base64url');
};
const tCand = mint(secret);
const tWrong = mint(wrong);

function req(label, path, headers) {
  return new Promise((resolve) => {
    const r = https.request({ host, path, method: 'GET', headers, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        const snippet = body.replace(/\s+/g, ' ').slice(0, 200);
        console.log(label, '->', res.statusCode, '|', snippet);
        resolve();
      });
    });
    r.on('timeout', () => {
      console.log(label, '-> TIMEOUT');
      r.destroy();
      resolve();
    });
    r.on('error', (e) => {
      console.log(label, '-> NETWORK ERROR', e.code || e.message);
      resolve();
    });
    r.end();
  });
}

const t1 = '/rest/v1/members?select=id&limit=0';
await req(`T1 table  pub + candidate-JWT `, t1, { apikey: pub, Authorization: 'Bearer ' + tCand });
await req(`T2 table  pub + wrong-JWT     `, t1, { apikey: pub, Authorization: 'Bearer ' + tWrong });
await req(`T3 table  pub only            `, t1, { apikey: pub });
await req(`T4 table  envAnon + envAnon   `, t1, { apikey: env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + env.SUPABASE_ANON_KEY });
await req(`T5 user   pub + candidate-JWT `, '/auth/v1/user', { apikey: pub, Authorization: 'Bearer ' + tCand });
await req(`T6 user   pub + wrong-JWT     `, '/auth/v1/user', { apikey: pub, Authorization: 'Bearer ' + tWrong });
