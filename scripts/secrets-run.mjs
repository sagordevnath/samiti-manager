#!/usr/bin/env node
/**
 * ── Cross-platform secrets launcher ──────────────────────────────────────────
 * Runs a command through the Infisical CLI when it is installed; otherwise
 * prints a short warning and runs the command directly so the app still boots
 * (demo mode / Zod defaults) while secrets are not yet available.
 *
 * Usage:
 *   node scripts/secrets-run.mjs <command...>
 *   node scripts/secrets-run.mjs --env prod --require-infisical <command...>
 *
 * Flags:
 *   --env <slug>          Infisical environment slug (default: INFISICAL_ENV or "dev")
 *   --require-infisical   fail with install instructions instead of falling back
 *                         (used by the production start script — never boot a
 *                         production process without its secrets)
 */
import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';

const argv = process.argv.slice(2);

// ── Parse flags, collect the command ─────────────────────────────────────────
let envSlug = process.env.INFISICAL_ENV ?? 'dev';
let requireInfisical = false;
const command = [];
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '--env') {
    envSlug = argv[i + 1] ?? envSlug;
    i += 1;
  } else if (arg === '--require-infisical') {
    requireInfisical = true;
  } else if (arg === '--') {
    command.push(...argv.slice(i + 1));
    break;
  } else {
    command.push(arg);
  }
}

if (command.length === 0) {
  console.error('Usage: node scripts/secrets-run.mjs [--env <slug>] [--require-infisical] <command...>');
  process.exit(1);
}

const commandLine = command.join(' ');

/** True when the Infisical CLI resolves on PATH (shell:true covers .cmd/.exe). */
function infisicalAvailable() {
  const probe = spawnSync('infisical --version', { shell: true, stdio: 'ignore', timeout: 15_000 });
  return !probe.error && probe.status === 0;
}

/** Run with stdio inherited; propagate the child's exit code. */
function run(line) {
  const child = spawn(line, { stdio: 'inherit', shell: true });
  child.on('exit', (code) => process.exit(code ?? 1));
  child.on('error', (err) => {
    console.error(`Failed to start command: ${err.message}`);
    process.exit(1);
  });
}

if (infisicalAvailable()) {
  run(`infisical run --env=${envSlug} -- ${commandLine}`);
} else if (requireInfisical) {
  console.error('✖ Infisical CLI is required for this command but was not found on PATH.');
  console.error('  Install it:  winget install infisical      (Windows)');
  console.error('               npm install -g @infisical/cli (any OS with Node)');
  console.error('  Production authenticates with a machine identity (INFISICAL_TOKEN) —');
  console.error('  see docs/infisical.md §6. Aborting instead of running without secrets.');
  process.exit(1);
} else {
  console.warn('⚠  Infisical CLI not found — running WITHOUT injected secrets.');
  console.warn('   The app will boot in demo mode (in-memory data) until you install it:');
  console.warn('     winget install infisical            (Windows)');
  console.warn('     npm install -g @infisical/cli       (any OS with Node)');
  console.warn('   then run:');
  console.warn('     npm run secrets:login   (opens the browser; add -i on WSL/remote)');
  console.warn('     npm run secrets:init    (links this checkout to the project)');
  console.warn('   Full guide: docs/infisical.md');
  console.warn(`→ ${commandLine}`);
  run(commandLine);
}
