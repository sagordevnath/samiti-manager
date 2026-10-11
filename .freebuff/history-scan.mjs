#!/usr/bin/env node
/** Scratch: decode every JWT ever committed in .env.example across all refs. Never committed. */
import { execFileSync } from 'node:child_process';

const commits = execFileSync('git', ['rev-list', '--all', '--', '.env.example'], { maxBuffer: 1e9 })
  .toString('utf8')
  .trim()
  .split('\n')
  .filter(Boolean);

const seen = new Set();
for (const c of commits) {
  let content = '';
  try {
    content = execFileSync('git', ['show', `${c}:.env.example`], { maxBuffer: 1e8 }).toString('utf8');
  } catch {
    continue;
  }
  for (const m of content.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g)) {
    const tok = m[0];
    let role = '(unparsable)';
    try {
      role = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString('utf8')).role ?? '(none)';
    } catch {}
    const key = `${c.slice(0, 7)} JWT role=${role} len=${tok.length}`;
    if (!seen.has(key)) {
      seen.add(key);
      console.log(key);
    }
  }
  for (const line of content.split(/\r?\n/)) {
    if (/^SUPABASE_(URL|ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET)=/.test(line)) {
      const [k, v = ''] = line.split('=');
      const key = `${c.slice(0, 7)} ${k} => ${v.length <= 12 ? v : `${v.slice(0, 8)}…(${v.length})`}`;
      if (!seen.has(key)) {
        seen.add(key);
        console.log(key);
      }
    }
  }
}
