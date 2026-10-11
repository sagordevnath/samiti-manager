/** Review audit: i18n key parity + which API routers no test reaches. */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ── i18n key parity ─────────────────────────────────────────────────────────
const localeDir = 'apps/web/src/locales';
if (existsSync(localeDir)) {
  const flatten = (obj, prefix = '') =>
    Object.entries(obj).flatMap(([k, v]) =>
      v && typeof v === 'object' ? flatten(v, prefix ? `${prefix}.${k}` : k) : [`${prefix ? `${prefix}.` : ''}${k}`],
    );
  const bn = JSON.parse(readFileSync(join(localeDir, 'bn.json'), 'utf8'));
  const en = JSON.parse(readFileSync(join(localeDir, 'en.json'), 'utf8'));
  const bnKeys = new Set(flatten(bn));
  const enKeys = new Set(flatten(en));
  const missingInEn = [...bnKeys].filter((k) => !enKeys.has(k));
  const missingInBn = [...enKeys].filter((k) => !bnKeys.has(k));
  console.log(`i18n keys: bn=${bnKeys.size} en=${enKeys.size}`);
  console.log(`  missing in en (${missingInEn.length}): ${missingInEn.slice(0, 20).join(', ')}`);
  console.log(`  missing in bn (${missingInBn.length}): ${missingInBn.slice(0, 20).join(', ')}`);
}

// ── router test coverage ────────────────────────────────────────────────────
const routeDir = 'apps/api/src/routes';
const testDir = 'apps/api/src';
const testSources = readdirSync(testDir, { recursive: true })
  .filter((f) => typeof f === 'string' && f.endsWith('.test.ts'))
  .map((f) => readFileSync(join(testDir, f), 'utf8'))
  .join('\n');

const routers = readdirSync(routeDir).filter((f) => f.endsWith('.routes.ts'));
const untested = [];
const tested = [];
for (const r of routers) {
  const base = r.replace('.routes.ts', '');
  const referenced =
    testSources.includes(`routes/${base}.routes.js`) || testSources.includes(`routes/${base}.routes`);
  (referenced ? tested : untested).push(base);
}
console.log(`\nrouters: ${routers.length}, referenced by a test: ${tested.length}`);
console.log(`no test reference (${untested.length}): ${untested.join(', ')}`);
