/**
 * Statement-level audit: for every Supabase WRITE in a live router, does the
 * statement itself carry org_id (or a scopeToOrg wrapper)? Statements whose
 * org scoping is absent are candidates — a scoped read earlier in the handler
 * usually makes them safe, so the output needs one human pass.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'apps/api/src/routes';
const files = readdirSync(DIR).filter((f) => f.endsWith('.routes.ts'));

for (const file of files) {
  const src = readFileSync(join(DIR, file), 'utf8');
  if (!src.includes('supabaseAdmin')) continue;
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    const start = lines[i];
    if (!/(supabaseAdmin|\b[a-zA-Z]+Query|query)\b.*\.from\(['"]?\w+['"]?\)/.test(start)) continue;
    // Collect the statement: until a line ending with ';' or a new supabaseAdmin.
    const stmt = [];
    for (let j = i; j < Math.min(i + 30, lines.length); j += 1) {
      stmt.push(lines[j]);
      if (/;\s*$/.test(lines[j])) break;
      if (j > i && /supabaseAdmin/.test(lines[j])) break;
    }
    const text = stmt.join('\n');
    const table = /\.from\(['"]([a-z_]+)['"]\)/.exec(start)?.[1] ?? '?';
    if (!/\.[a-z]*update\(|\.delete\(\)|\.upsert\(/.test(text)) continue;
    const prev = lines.slice(Math.max(0, i - 3), i).join('\n');
    const guarded = /\borg_id\b/.test(text) || /scopeToOrg\(/.test(prev) || /scopeToOrg\(/.test(text) || /scopeToOrg\(\s*$/.test(lines[i - 1] ?? '');
    if (guarded) continue;
    // Addressed by a client-supplied id / key?
    if (!/\.eq\(['"](id|account_id|user_id|member_id|entry_id|application_id)['"]/.test(text)) continue;
    console.log(`${file}:${i + 1}  table=${table}`);
    console.log('   ' + text.split('\n').map((l) => l.trim()).join(' ').slice(0, 220));
  }
}
