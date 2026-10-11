// Cross-reference: API write endpoints vs. web UI callers (mount-aware).
// Any write route with no UI caller is strong evidence of a missing
// create/edit/remove path in the UI.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES_DIR = 'apps/api/src/routes';
const PAGES_DIR = 'apps/web/src/pages';

// Router file → mount prefix (from apps/api/src/app.ts; '/api/v1' stripped so
// paths line up with the web client's relative calls).
const MOUNTS = {
  'auth.routes.ts': '/auth',
  'members.routes.ts': '/members',
  'members.demo.routes.ts': '/members',
  'dashboard.routes.ts': '/dashboard',
  'samity.routes.ts': '/samities',
  'nav.routes.ts': '/nav',
  'users.routes.ts': '/users',
  'users.demo.routes.ts': '/users',
  'org.routes.ts': '/org',
  'tree.routes.ts': '/org',
  'savings.routes.ts': '/savings',
  'savings.demo.routes.ts': '/savings',
  'loans.routes.ts': '/loans',
  'loans.demo.routes.ts': '/loans',
  'collection.routes.ts': '/collection',
  'collection.demo.routes.ts': '/collection',
  'delinquency.routes.ts': '/delinquency',
  'delinquency-recovery.routes.ts': '/delinquency',
  'delinquency-live.routes.ts': '/delinquency',
  'accounting.routes.ts': '/accounting',
  'accounting.demo.routes.ts': '/accounting',
  'hr.routes.ts': '/hr',
  'hr.demo.routes.ts': '/hr',
  'work.routes.ts': '/work',
  'work.demo.routes.ts': '/work',
  'insurance-welfare.routes.ts': '/insurance',
  'insurance-welfare-live.routes.ts': '/insurance',
  'coop-governance.routes.ts': '/coop',
  'coop-governance-live.routes.ts': '/coop',
  'programs.routes.ts': '/programs',
  'programs-live.routes.ts': '/programs',
  'mis.routes.ts': '/mis',
  'mis-live.routes.ts': '/mis',
  'mis-ops.routes.ts': '/mis-ops',
  'mis-ops-live.routes.ts': '/mis-ops',
  'comm.routes.ts': '/comms',
  'comms-live.routes.ts': '/comms',
  'documents.routes.ts': '/documents',
  'documents-live.routes.ts': '/documents',
  'security.routes.ts': '/security',
  'security-live.routes.ts': '/security',
  'privacy.routes.ts': '/privacy',
  'privacy-live.routes.ts': '/privacy',
  'health.routes.ts': '/health',
};

const ROUTE = /\b[A-Za-z_$][\w$]*\.(post|patch|put|delete)\(\s*['"`]([^'"`]+)['"`]/g;

const apiRoutes = [];
for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
  const mount = MOUNTS[file] ?? '';
  const text = readFileSync(join(ROUTES_DIR, file), 'utf8');
  for (const m of text.matchAll(ROUTE)) {
    const full = (mount + m[2]).replace(/\/{2,}/g, '/');
    apiRoutes.push({ file, method: m[1].toUpperCase(), path: full });
  }
}

const CALL = /api\.(get|post|patch|put|delete)(?:<[^>]*>)?\(\s*[`'"]([^`'"]+)[`'"]/g;
const norm = (p) => p.replace(/\$\{[^}]*\}/g, ':x').split('?')[0].replace(/\/{2,}/g, '/');

const ui = { POST: new Set(), PATCH: new Set(), PUT: new Set(), DELETE: new Set() };
const scan = (dir) => {
  for (const f of readdirSync(dir, { recursive: true })) {
    const s = String(f);
    if (!s.endsWith('.ts') && !s.endsWith('.tsx')) continue;
    const text = readFileSync(join(dir, s), 'utf8');
    for (const m of text.matchAll(CALL)) {
      const method = m[1].toUpperCase();
      if (ui[method]) ui[method].add(norm(m[2]));
    }
  }
};
scan(PAGES_DIR);
scan('apps/web/src/lib');
scan('apps/web/src/stores');
scan('apps/web/src/components');

const samePath = (a, b) => {
  const A = a.split('/').filter(Boolean);
  const B = b.split('/').filter(Boolean);
  if (A.length !== B.length) return false;
  return A.every((s, i) => s.startsWith(':') || B[i].startsWith(':') || s === B[i]);
};
const covered = (method, path) => [...ui[method]].some((u) => samePath(path, u));

// Demo and live routers mirror each other; treat a route as covered if EITHER
// variant has a UI caller (otherwise every live endpoint looks like a gap).
const key = (r) => `${r.method} ${r.path}`;
const byKey = new Map();
for (const r of apiRoutes) {
  const k = key(r);
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(r);
}

const gaps = [];
for (const [k, group] of byKey) {
  if (!group.some((r) => covered(r.method, r.path))) gaps.push(group[0]);
}

console.log(`\nAPI write routes (deduped): ${byKey.size}   NO UI caller: ${gaps.length}\n`);
console.log('── WRITE ENDPOINTS WITH NO UI CALLER ──');
const byMount = {};
for (const g of gaps) {
  const mount = g.path.split('/').filter(Boolean)[0] ?? g.path;
  (byMount[mount] ??= []).push(g);
}
for (const mount of Object.keys(byMount).sort()) {
  console.log(`\n  [${mount}]`);
  for (const g of byMount[mount].sort((a, b) => a.path.localeCompare(b.path))) {
    console.log(`    ${g.method.padEnd(6)} ${g.path.padEnd(46)} (${g.file})`);
  }
}
