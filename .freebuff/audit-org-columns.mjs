/**
 * Build a map table -> has org_id column, from the bootstrap schema, so the
 * org-scoping fix is only applied to tables that really own an org_id.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const files = ['supabase/bootstrap-fresh.sql', 'supabase/demo-seed.sql',
  ...readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).map((f) => join('supabase/migrations', f))];

const tables = new Map(); // name -> true/false

for (const f of files) {
  let sql;
  try { sql = readFileSync(f, 'utf8'); } catch { continue; }
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.|"public"\.)?["']?([a-z_][a-z0-9_]*)["']?\s*\(/gi;
  let m;
  while ((m = re.exec(sql))) {
    const name = m[1].toLowerCase();
    // find matching close paren of this table def (no nested parens in column lists except constraints? keep simple: scan to first ');' at line start)
    const rest = sql.slice(m.index);
    const end = rest.search(/\n\)\s*;/);
    const body = end > 0 ? rest.slice(0, end) : rest.slice(0, 4000);
    const hasOrg = /\borg_id\b/.test(body);
    if (!tables.has(name)) tables.set(name, hasOrg);
    else if (hasOrg) tables.set(name, true);
    // also capture ALTER TABLE ... ADD COLUMN org_id
  }
  const alter = /alter\s+table\s+(?:only\s+)?(?:public\.)?["']?([a-z_][a-z0-9_]*)["']?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?org_id/gi;
  let a;
  while ((a = alter.exec(sql))) tables.set(a[1].toLowerCase(), true);
}

const wanted = process.argv.slice(2);
if (wanted.length) {
  for (const w of wanted) console.log(`${tables.has(w) ? (tables.get(w) ? 'HAS org_id' : 'no  org_id') : 'UNKNOWN  '}  ${w}`);
} else {
  console.log(`total tables: ${tables.size}`);
  console.log('--- WITHOUT org_id ---');
  for (const [n, v] of [...tables].sort()) if (!v) console.log('  ' + n);
}
