/**
 * Scratch mutation check for the workflow-vs-visit source split.
 * Reverts one piece of the fix at a time and requires the *named* test to fail:
 * a test that stays green while the fix is gone was never testing the fix.
 *   node .freebuff/mutate-status-sources.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const files = ['status/worker.js', 'status/public/index.html', 'status/worker.test.mjs'];
const backup = new Map(files.map((file) => [file, readFileSync(file, 'utf8')]));

const W = 'status/worker.js';
const H = 'status/public/index.html';
const HATCH = 'repeating-linear-gradient(45deg, var(--none) 0 2px, transparent 2px 5px)';

const mutations = [
  {
    name: 'coverage counts visits again (one blended figure)',
    file: W,
    from: 'Math.round((scheduled / expected) * 1000)',
    to: 'Math.round((inWindow.length / expected) * 1000)',
    expect: 'a tab left open all day',
  },
  {
    name: 'schedule gaps computed over every sample',
    file: W,
    from: 'findScheduleGaps(scheduledStamps, visitStamps, nowMs)',
    to: 'findScheduleGaps(stamps, visitStamps, nowMs)',
    expect: 'a tab left open all day',
  },
  {
    name: 'gap visits count the boundary probe as evidence',
    file: W,
    from: 'visitStamps.filter((ts) => ts > gap.fromTs && ts < gap.toTs)',
    to: 'visitStamps.filter((ts) => ts >= gap.fromTs && ts <= gap.toTs)',
    expect: 'a probe at the edge of a hole',
  },
  {
    name: 'a bucket is marked visits-only even while it is still running',
    file: W,
    from: 'bucket.visitsOnly = bucket.complete && bucket.total > 0 && bucket.scheduled === 0;',
    to: 'bucket.visitsOnly = bucket.total > 0 && bucket.scheduled === 0;',
    expect: 'the 48-hour strip buckets',
  },
  {
    name: 'buckets stop telling the two sources apart',
    file: W,
    from: "if (row.source === 'workflow') buckets[index].scheduled += 1;",
    to: 'buckets[index].scheduled += 1;',
    expect: 'the 48-hour strip buckets',
  },
  {
    name: 'stale is true even for a workflow that never ran',
    file: W,
    from: 'stale: lastScheduledTs !== null && nowMs - lastScheduledTs > GAP_INTERVAL_MS,',
    to: 'stale: lastScheduledTs === null || nowMs - lastScheduledTs > GAP_INTERVAL_MS,',
    expect: 'visits alone never claim the schedule',
  },
  {
    name: 'visits-only bars lose their mark',
    file: H,
    from: "              bar.classList.add('visits-only');\n",
    to: '',
    expect: 'the page counts the workflow',
  },
  {
    name: 'the visits-only rule is written as a shorthand (colour erased)',
    file: H,
    from: '.bar.visits-only {\n        background-image:',
    to: '.bar.visits-only {\n        background:',
    expect: 'the page counts the workflow',
  },
  {
    name: 'the visits-only rule moves above the colour rules',
    file: H,
    from: '      .bar.partial { background: var(--warn); }',
    to: '      .bar.visits-only { background-image: ' + HATCH + '; }\n      .bar.partial { background: var(--warn); }',
    expect: 'the page counts the workflow',
  },
  {
    name: 'banner drops the bound dedupe',
    file: H,
    from: ' && !hostKeys.has(`${gap.fromTs}:${gap.toTs}`)',
    to: '',
    expect: 'the page counts the workflow',
  },
  {
    name: 'banner admits holes with no visits as the workflow\'s fault',
    file: H,
    from: 'gap.visits > 0 && !hostKeys.has',
    to: 'gap.visits >= 0 && !hostKeys.has',
    expect: 'the page counts the workflow',
  },
  {
    name: 'the coverage figure shows all samples again',
    file: H,
    from: '(${obs.scheduled}/${obs.expected})',
    to: '(${obs.stored}/${obs.expected})',
    expect: 'the page counts the workflow',
  },
  {
    name: 'the detail row shows all samples again',
    file: H,
    from: 'scheduled coverage ${obs.scheduled}/${obs.expected}',
    to: 'scheduled coverage ${obs.stored}/${obs.expected}',
    expect: 'the page counts the workflow',
  },
  {
    name: 'the page trusts the visitor\'s clock again',
    file: H,
    from: '        syncClock(data);\n',
    to: '',
    expect: "the page's figures are measured on the server's clock",
  },
  {
    name: 'a left-sample age measured against the visitor\'s clock',
    file: H,
    from: "relative(sched.lastSampleTs)) : null)",
    to: "relative(sched.lastSampleTs, Date.now())) : null)",
    expect: "the page's figures are measured on the server's clock",
  },
  {
    name: 'the banner cutoff back on the visitor\'s clock',
    file: H,
    from: 'const cutoff = serverNow() - 48 * 3_600_000;',
    to: 'const cutoff = Date.now() - 48 * 3_600_000;',
    expect: "the page's figures are measured on the server's clock",
  },
  {
    name: 'the rendered bar stops being marked visits-only',
    file: H,
    from: "              bar.classList.add('visits-only');\n",
    to: '',
    expect: 'the page draws a window only visits covered',
  },
];

let missed = 0;
for (const mutation of mutations) {
  const original = backup.get(mutation.file);
  if (!original.includes(mutation.from)) {
    console.log(`SKIP    ${mutation.name} — pattern not found (test would be vacuous)`);
    missed += 1;
    continue;
  }
  writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
  let output = '';
  let code = 0;
  try {
    output = execFileSync('node', ['--test', 'status/worker.test.mjs'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    code = typeof err.status === 'number' ? err.status : 1;
    output = String(err.stdout ?? '') + String(err.stderr ?? '');
  } finally {
    writeFileSync(mutation.file, original);
  }
  const failing = output.split('✖ failing tests:')[1] ?? '';
  const caught = code !== 0 && failing.includes(mutation.expect);
  if (!caught) missed += 1;
  console.log(`${caught ? 'CAUGHT ' : 'MISSED '} ${mutation.name} (exit ${code})`);
  if (!caught && failing) console.log(`        failed instead: ${failing.split('\n')[1]?.trim() ?? '—'}`);
}

for (const [file, text] of backup) {
  if (readFileSync(file, 'utf8') !== text) throw new Error(`restore failed: ${file}`);
}
console.log(missed ? `\n${missed} of ${mutations.length} mutations not caught` : `\nall ${mutations.length} mutations caught; files restored byte-for-byte`);
process.exit(missed ? 1 : 0);
