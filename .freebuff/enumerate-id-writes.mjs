/** Enumerate every id-addressed WRITE chain per live router, joined chain-aware. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'apps/api/src/routes';
const files = readdirSync(DIR).filter((f) => f.endsWith('.routes.ts'));

const ID_KEYS = [
  'id', 'account_id', 'user_id', 'member_id', 'entry_id', 'application_id', 'staff_id',
  'voucher_id', 'payroll_id', 'distribution_id', 'template_id', 'claim_id', 'request_id', 'product_id',
];
const WRITE = /\.(update|delete|upsert)\s*\(/;

function idAddressed(text) {
  for (const k of ID_KEYS) {
    if (
      text.includes(`.eq('${k}'`) || text.includes(`.eq("${k}"`) ||
      text.includes(`.in('${k}'`) || text.includes(`.in("${k}"`) ||
      text.includes(`.neq('${k}'`) || text.includes(`.neq("${k}"`)
    ) return true;
  }
  return /\.match\(\s*\{[^}]*\bid\s*:/.test(text);
}

for (const file of files) {
  const src = readFileSync(join(DIR, file), 'utf8');
  if (!src.includes('supabaseAdmin')) continue;
  const lines = src.split('\n');
  const hits = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/\.from\(\s*['"`][a-z_]+['"`]\s*\)/.test(lines[i])) continue;
    const chain = [];
    for (let j = i; j < Math.min(i + 40, lines.length); j += 1) {
      chain.push(lines[j]);
      if (/;/.test(lines[j].replace(/\/\/.*$/, ''))) break;
    }
    const text = chain.join('\n');
    if (!WRITE.test(text)) continue;
    if (!idAddressed(text.replace(/\s+/g, ' '))) continue;
    const table = /\.from\(\s*['"`]([a-z_]+)['"`]/.exec(text)?.[1] ?? '?';
    const op = /\.(update|delete|upsert)\s*\(/.exec(text)?.[1] ?? '?';
    hits.push(`  L${i + 1} ${op} ${table}`);
  }
  if (hits.length) console.log(`\n${file}\n${hits.join('\n')}`);
}
