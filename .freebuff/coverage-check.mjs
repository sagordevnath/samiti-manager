#!/usr/bin/env node
/** Scratch: scan-coverage diagnostics — what did the secret scan skip, and why. Never committed. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  maxBuffer: 5e8,
})
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

let ok = 0;
const bin = [];
const big = [];
const missing = [];
for (const f of files) {
  if (f.startsWith('.freebuff/')) continue;
  let b;
  try {
    b = readFileSync(f);
  } catch {
    missing.push(f);
    continue;
  }
  if (b.length > 3 * 1024 * 1024) big.push([b.length, f]);
  else if (b.includes(0)) bin.push(f);
  else ok++;
}
console.log(`total=${files.length} scanned-ok=${ok} binary=${bin.length} big=${big.length} missing=${missing.length}`);
console.log('\nmissing:');
missing.forEach((f) => console.log('  ', f));
console.log('\nbig:');
big
  .sort((a, b) => b[0] - a[0])
  .forEach(([s, f]) => console.log('  ', s, f));
console.log('\nbinary by top dir:');
const dirs = {};
for (const f of bin) {
  const d = f.split('/').slice(0, 2).join('/');
  dirs[d] = (dirs[d] ?? 0) + 1;
}
Object.entries(dirs)
  .sort((a, b) => b[1] - a[1])
  .forEach(([d, n]) => console.log('  ', n, d));
console.log('\nnon-media binary sample (extensions worth a look):');
bin
  .filter((f) => !/\.(png|jpg|jpeg|gif|ico|webp|woff2?|ttf|otf|eot|pdf|zip|mp4|svg)$/i.test(f))
  .slice(0, 80)
  .forEach((f) => console.log('  ', f));
