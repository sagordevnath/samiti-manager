// Audit: what write paths does each web page actually use?
// For every page, collect the api.<method>('/path') calls it makes. A page that
// only ever GETs is a read-only surface — either intentionally (reports,
// dashboards) or a missing create/edit/remove path.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'apps/web/src/pages';
const CALL = /api\.(get|post|patch|put|delete)(?:<[^>]*>)?\(\s*[`'"]([^`'"]+)[`'"]/g;

const rows = [];
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.tsx'))) {
  const text = readFileSync(join(DIR, file), 'utf8');
  const methods = new Set();
  const paths = new Set();
  for (const m of text.matchAll(CALL)) {
    methods.add(m[1]);
    // Normalise interpolations so `${id}` collapses to `:id`.
    paths.add(m[2].replace(/\$\{[^}]*\}/g, ':x').split('?')[0]);
  }
  // window.confirm / downloadFile / openFileInTab are not CRUD writers.
  rows.push({
    file,
    methods: [...methods].sort(),
    writes: ['post', 'patch', 'put', 'delete'].filter((w) => methods.has(w)),
    paths: [...paths].sort(),
  });
}

const readOnly = rows.filter((r) => r.writes.length === 0 && r.paths.length > 0);
const writers = rows.filter((r) => r.writes.length > 0);

console.log(`\npages scanned: ${rows.length}  (with write calls: ${writers.length}, read-only: ${readOnly.length})\n`);
console.log('── READ-ONLY PAGES (no create/edit/delete in the UI) ──');
for (const r of readOnly.sort((a, b) => a.file.localeCompare(b.file))) {
  console.log(`  ${r.file.padEnd(34)} ${r.paths.length} endpoints  e.g. ${r.paths.slice(0, 3).join(', ')}`);
}
console.log('\n── PAGES WITH WRITE PATHS ──');
for (const r of writers.sort((a, b) => a.file.localeCompare(b.file))) {
  console.log(`  ${r.file.padEnd(34)} [${r.writes.join(',')}]`);
}
