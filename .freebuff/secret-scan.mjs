#!/usr/bin/env node
/**
 * Scratch secret scan over every file eligible for commit
 * (tracked + untracked, non-ignored). Never committed; lives in .freebuff/.
 * Usage: node .freebuff/secret-scan.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MAX_BYTES = 3 * 1024 * 1024;

const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
  maxBuffer: 512 * 1024 * 1024,
})
  .toString('utf8')
  .split('\0')
  .filter(Boolean)
  .filter((f) => !f.startsWith('.freebuff/'));

const findings = [];
const add = (sev, file, line, label, detail) => findings.push({ sev, file, line, label, detail });

const mask = (s) => (s.length <= 14 ? s : `${s.slice(0, 8)}…${s.slice(-4)} (${s.length} chars)`);

const decodeJwt = (tok) => {
  try {
    const p = tok.split('.')[1];
    return p ? JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) : null;
  } catch {
    return null;
  }
};

const RULES = [
  {
    id: 'jwt',
    re: /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g,
    classify: (m) => {
      const payload = decodeJwt(m[0]);
      const role = payload?.role ?? '(no role)';
      if (role === 'service_role') return ['CRITICAL', 'legacy JWT with role=service_role'];
      if (role === 'anon') return ['INFO', 'legacy JWT with role=anon (public by design)'];
      return ['MEDIUM', `legacy JWT with role=${role}`];
    },
  },
  { id: 'sb_secret', re: /sb_secret_[A-Za-z0-9_-]{10,}/g, sev: 'CRITICAL', label: 'Supabase secret key' },
  { id: 'sb_publishable', re: /sb_publishable_[A-Za-z0-9_-]{10,}/g, sev: 'INFO', label: 'Supabase publishable/anon key (public)' },
  { id: 'sbp', re: /sbp_[a-f0-9]{20,}/g, sev: 'CRITICAL', label: 'Supabase personal access token' },
  { id: 'stripe', re: /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/g, sev: 'CRITICAL', label: 'Stripe secret key' },
  { id: 'sk', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/g, sev: 'CRITICAL', label: 'API key (sk-…)' },
  { id: 'github', re: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}/g, sev: 'CRITICAL', label: 'GitHub token' },
  { id: 'aws', re: /\bAKIA[0-9A-Z]{16}\b/g, sev: 'CRITICAL', label: 'AWS access key id' },
  { id: 'slack', re: /xox[bpoa]-[A-Za-z0-9-]{10,}/g, sev: 'CRITICAL', label: 'Slack token' },
  { id: 'gcp', re: /\bAIza[0-9A-Za-z_-]{35}\b/g, sev: 'HIGH', label: 'Google API key' },
  { id: 'private', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, sev: 'CRITICAL', label: 'private key block' },
  { id: 'dburl', re: /postgres(?:ql)?:\/\/[^\s:/@]+:[^\s@/]+@/g, sev: 'HIGH', label: 'DB URL with inline password' },
  {
    id: 'assign',
    re: /(?:secret|passwd|password|token|api[_-]?key)[A-Za-z0-9_]*\s*[:=]\s*["'`]([^"'`\s]{10,})["'`]/gi,
    sev: 'MEDIUM',
    label: 'credential-looking assignment',
    filter: (v) => {
      const s = v.toLowerCase();
      const allow = [
        'placeholder', 'your-', 'replace-', 'example', 'dummy', 'fake', 'test-', 'demo', 'dev-only',
        'not-for-production', 'samity@2026', 'admin@samity.test', 'officer@samity.test', 'xxx',
        'changeme', 'sample',
      ];
      return !allow.some((a) => s.includes(a));
    },
  },
];

for (const file of files) {
  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    continue;
  }
  if (buf.length > MAX_BYTES || buf.includes(0)) continue;
  const lines = buf.toString('utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m;
      while ((m = rule.re.exec(line))) {
        if (rule.classify) {
          const [sev, label] = rule.classify(m);
          add(sev, file, i + 1, label, mask(m[0]));
        } else if (rule.filter && !rule.filter(m[1] ?? '')) {
          continue;
        } else {
          add(rule.sev, file, i + 1, rule.label, mask(m[1] ?? m[0]));
        }
      }
    }
  }
}

const SUSPECTS = ['foojozvoaeqeupwowild', '604a7af8', 'sb_publishable_j7Ys', 'g5Y4cDtE81GVaS7R'];
for (const file of files) {
  let text;
  try {
    const buf = readFileSync(file);
    if (buf.length > MAX_BYTES || buf.includes(0)) continue;
    text = buf.toString('utf8');
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const s of SUSPECTS) {
      if (lines[i].includes(s)) add('SUSPECT', file, i + 1, `known project value "${s}"`, '');
    }
  }
}

const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, SUSPECT: 3, INFO: 4 };
findings.sort((a, b) => order[a.sev] - order[b.sev] || a.file.localeCompare(b.file));

console.log(`Scanned ${files.length} commit-eligible files; ${findings.length} findings\n`);
const counts = {};
for (const f of findings) counts[f.sev] = (counts[f.sev] ?? 0) + 1;
console.log('By severity:', counts, '\n');
for (const f of findings) {
  console.log(`${f.sev.padEnd(8)} ${f.file}:${f.line}  ${f.label}${f.detail ? `  [${f.detail}]` : ''}`);
}
