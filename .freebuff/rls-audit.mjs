/** Compare tables created across supabase/*.sql with those that enable RLS. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dirs = ['supabase/migrations'];
const extra = ['supabase/bootstrap-fresh.sql', 'supabase/demo-seed.sql'];
const files = [];
for (const d of dirs) {
  for (const f of readdirSync(d)) if (f.endsWith('.sql')) files.push(join(d, f));
}
for (const f of extra) {
  try {
    readFileSync(f);
    files.push(f);
  } catch {
    /* absent is fine */
  }
}

const created = new Set();
const rls = new Set();
const createRe = /create table (?:if not exists )?(?:public\.)?["`]?([a-z0-9_]+)["`]?/gi;
const rlsRe = /alter table (?:if exists )?(?:public\.)?["`]?([a-z0-9_]+)["`]?\s+enable row level security/gi;

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(createRe)) created.add(m[1]);
  for (const m of src.matchAll(rlsRe)) rls.add(m[1]);
}

const missing = [...created].filter((t) => !rls.has(t)).sort();
console.log(`tables created: ${created.size}, rls-enabled: ${rls.size}`);
console.log(`\n=== created but never RLS-enabled (${missing.length}) ===`);
for (const t of missing) console.log(`  ${t}`);
