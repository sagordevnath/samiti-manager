/**
 * Authoritative audit: for every Supabase WRITE chain in a live router, does the
 * chain (or the immediately-following scopeToOrg() wrapping) carry org_id?
 *
 * Supabase chains are single expressions ending in ';', so we join continuation
 * lines from the `.from('table')` line to the terminating ';' and inspect the
 * whole chain. This catches the multi-line `const up = await supabaseAdmin\n
 * .from(...).update(...).eq('id', row.id)` shape that the line-based audit misses.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'apps/api/src/routes';
const files = readdirSync(DIR).filter((f) => f.endsWith('.routes.ts'));

/** `.eq('id', ...)` / `.in('id', ...)` / `.match({ id: ... })` on a row key. */
const ID_KEY = "(?:id|account_id|user_id|member_id|entry_id|application_id|staff_id|voucher_id|payroll_id|distribution_id|template_id|claim_id|request_id)";
const ID_ADDRESSED = new RegExp(`\\.(?:eq|neq|in|match)\\(\\s*['"\`]${ID_KEY}['"\`]|\\.match\\(\\s*\\{[^}]*['"\`]?${ID_KEY}['"\`]?\\s*:`);
const WRITE = /\.(update|delete|upsert)\s*\(/;

let flagged = 0;

for (const file of files) {
  const src = readFileSync(join(DIR, file), 'utf8');
  if (!src.includes('supabaseAdmin')) continue;
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    if (!/\.from\(\s*['"`][a-z_]+['"`]\s*\)/.test(lines[i])) continue;
    // Join the whole chain up to the terminating ';'.
    const chain = [];
    for (let j = i; j < Math.min(i + 40, lines.length); j += 1) {
      chain.push(lines[j]);
      const noComment = lines[j].replace(/\/\/.*$/, '');
      if (/;/.test(noComment)) break;
    }
    const text = chain.join('\n');
    if (!WRITE.test(text)) continue;
    if (!ID_ADDRESSED.test(text.replace(/\s+/g, ' '))) continue;
    // Tenant guard, in any of the shapes this codebase uses:
    //  1. org_id written into the chain itself      (.eq('org_id', orgOf(req)))
    //  2. the chain wrapped by scopeToOrg/scopeOrg
    //  3. `query = query.eq('org_id', ...)` applied to the just-built query
    // org_id is only searched from the chain onward, so a scoped read earlier
    // in the handler cannot mask an unguarded write.
    const around = lines.slice(Math.max(0, i - 3), Math.min(i + chain.length + 3, lines.length)).join('\n');
    const afterChain = lines.slice(i, Math.min(i + chain.length + 3, lines.length)).join('\n');
    const guarded =
      /\borg_id\b/.test(text) ||
      /scopeToOrg\s*\(/.test(around) ||
      /scopeOrg\s*\(/.test(around) ||
      /\.eq\(\s*['"]org_id['"]/.test(afterChain);
    if (guarded) continue;
    const table = /\.from\(\s*['"`]([a-z_]+)['"`]/.exec(text)?.[1] ?? '?';
    flagged += 1;
    console.log(`\n${file}:${i + 1}  table=${table}`);
    console.log('   ' + text.replace(/\s+/g, ' ').trim().slice(0, 240));
  }
}
console.log(`\n=== ${flagged} id-addressed write chain(s) without an org_id predicate ===`);
