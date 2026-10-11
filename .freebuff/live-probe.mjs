#!/usr/bin/env node
/**
 * Scratch liveness probe for the committed Supabase values (never committed).
 * Prints statuses/messages only — never secret values.
 */
import https from 'node:https';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const blob = execFileSync('git', ['show', '6041f4a:.env.example']).toString('utf8');
const grab = (t, k) => {
  const m = t.match(new RegExp('^' + k + '=(.*)', 'm'));
  return m ? m[1].trim() : null;
};
const url = grab(blob, 'SUPABASE_URL');
const pub = grab(blob, 'SUPABASE_ANON_KEY');
const legacyAnonJwt = grab(blob, 'SUPABASE_SERVICE_ROLE_KEY'); // 208-char role=anon JWT
const secret = grab(blob, 'SUPABASE_JWT_SECRET');
console.log('value lengths:', JSON.stringify({ url: url?.length, pub: pub?.length, legacyAnonJwt: legacyAnonJwt?.length, secret: secret?.length }));

// 1) local: does the candidate secret verify the legacy anon JWT's signature?
const [h, p, s] = (legacyAnonJwt || '').split('.');
const expect = crypto.createHmac('sha256', secret).update(h + '.' + p).digest('base64url');
console.log('legacy anon JWT signature verifies with candidate secret:', expect === s);

// 2) synthetic short-lived token signed with the candidate secret
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const header = b64({ alg: 'HS256', typ: 'JWT' });
const payload = b64({ role: 'anon', iss: 'supabase', sub: '00000000-0000-4000-8000-000000000001', iat: now, exp: now + 600 });
const token = header + '.' + payload + '.' + crypto.createHmac('sha256', secret).update(header + '.' + payload).digest('base64url');

const host = new URL(url).host;

function req(label, path, headers) {
  return new Promise((resolve) => {
    const r = https.request({ host, path, method: 'GET', headers, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        const msg = (body.match(/"message":"([^"]{0,140})"/) || [])[1] || '';
        console.log(label, '->', res.statusCode, msg ? '| ' + msg : '');
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

await req('V1 /auth/v1/settings  pub only          ', '/auth/v1/settings', { apikey: pub });
await req('V2 /rest/v1/           legacy anon key   ', '/rest/v1/', { apikey: legacyAnonJwt });
await req('V3 /rest/v1/           pub + legacy anon ', '/rest/v1/', { apikey: pub, Authorization: 'Bearer ' + legacyAnonJwt });
await req('V4 /auth/v1/user       pub + synthetic   ', '/auth/v1/user', { apikey: pub, Authorization: 'Bearer ' + token });
await req('V5 /auth/v1/user       pub + legacy anon ', '/auth/v1/user', { apikey: pub, Authorization: 'Bearer ' + legacyAnonJwt });
await req('V6 /rest/v1/           pub + synthetic   ', '/rest/v1/', { apikey: pub, Authorization: 'Bearer ' + token });
await req('V7 /rest/v1/           pub only          ', '/rest/v1/', { apikey: pub });
