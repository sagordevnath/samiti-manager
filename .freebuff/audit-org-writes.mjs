/**
 * Audit: find id-addressed writes (update/delete/upsert) in live routers whose
 * statement chain has no org_id predicate AND whose enclosing handler never
 * scopes by org_id either. Those are the cross-tenant write leaks.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'apps/api/src/routes';
const files = readdirSync(DIR).filter((f) => f.endsWith('.routes.ts'));

/** Handler blocks start at a route registration line. */
const ROUTE_RE = /^(?:\w+Router)\.(get|post|patch|put|delete)\(/m;

for (const file of files) {
  const src = readFileSync(join(DIR, file), 'utf8');
  if (!src.includes('supabaseAdmin')) continue;

  const lines = src.split('\n');
  // Split into handler blocks at route registrations.
  const starts = [];
  lines.forEach((l, i) => {
    if (/^\w+Router\.(get|post|patch|put|delete)\(/.test(l)) starts.push(i);
  });
  starts.push(lines.length);

  for (let s = 0; s < starts.length - 1; s += 1) {
    const from = starts[s];
    const to = starts[s + 1];
    const block = lines.slice(from, to);
    const joined = block.join('\n');
    if (joined.includes('org_id') || joined.includes('scopeToOrg(')) continue; // handler scopes somewhere
    // Find writes in this block.
    const writes = [];
    block.forEach((l, i) => {
      if (/\.(update|delete|upsert)\(/.test(l)) writes.push(i);
    });
    if (writes.length === 0) continue;
    // Only report if the handler addresses a row by an id (param / body id).
    const idAddressed = /\.eq\(['"]id['"]/.test(joined) || /\.eq\(['"]account_id['"]/.test(joined) || /\.eq\(['"]user_id['"]/.test(joined);
    if (!idAddressed) continue;
    console.log(`\n${file}:${from + 1}  ${block[0].trim()}`);
    console.log(`   (no org_id anywhere in handler; ${writes.length} write stmt(s))`);
    for (const w of writes) console.log(`   L${from + w + 1}: ${block[w].trim()}`);
  }
}
