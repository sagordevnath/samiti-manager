import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * ── keep-alive script tests (node --test scripts/keep-alive.test.mjs) ────────
 * The status page's own history cannot record a sample it never received, so the
 * run log is the only place a lost sample is adjudicated — see docs/deploy.md
 * §9 and the observation block in status/worker.js. These tests drive the real
 * script against a local stub API so the report path, its retry and its warning
 * annotation keep working, and so the exit code keeps meaning exactly one thing:
 * whether the API answered like samity-api.
 */

const SCRIPT = fileURLToPath(new URL('./keep-alive.sh', import.meta.url));

/** Stub API: a healthy /api/health, a static-host-looking /down/health, and two ingest endpoints. */
function startStub() {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, auth: req.headers.authorization ?? null, body });
      if (req.url === '/api/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'samity-api', mode: 'demo' }));
        return;
      }
      if (req.url === '/down/health') {
        // A static host answering 200 with a page for an unknown path: the exact
        // signature the script must refuse to call healthy.
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end('<!doctype html><html>app shell</html>');
        return;
      }
      if (req.url === '/ingest') {
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ stored: true }));
        return;
      }
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'HOST_DOWN' } }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, requests, port: server.address().port }));
  });
}

/** Run the script with the ambient ingest configuration removed, so a developer's
 * own environment cannot decide what these tests assert. */
function runKeepAlive(args) {
  return new Promise((resolve) => {
    const child = spawn('bash', [SCRIPT, ...args], {
      env: { ...process.env, API_HEALTH_URL: '', STATUS_INGEST_URL: '', STATUS_INGEST_TOKEN: '' },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (data) => {
      out += data;
    });
    child.stderr.on('data', (data) => {
      err += data;
    });
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

test('a delivered sample is reported as stored, with the token and the ping verdict', async () => {
  const { server, requests, port } = await startStub();
  try {
    const result = await runKeepAlive([
      '--attempts',
      '1',
      '--timeout',
      '5',
      `http://127.0.0.1:${port}/api/health`,
      '--report-url',
      `http://127.0.0.1:${port}/ingest`,
      '--report-token',
      'test-token',
    ]);

    assert.equal(result.code, 0, result.err);
    assert.match(result.out, /→ status page sample stored \(HTTP 201\)/);
    const ingest = requests.filter((request) => request.url === '/ingest');
    assert.equal(ingest.length, 1);
    assert.equal(ingest[0].auth, 'Bearer test-token');

    // The worker's /ingest contract: a millisecond ts, the verdict, and a mode it
    // can store. A body the worker would reject is a sample silently lost.
    const payload = JSON.parse(ingest[0].body);
    assert.equal(payload.ok, true);
    assert.equal(payload.status, 200);
    assert.equal(payload.mode, 'demo');
    assert.ok(Number.isInteger(payload.ts) && payload.ts > 1_600_000_000_000, `ts was ${payload.ts}`);
    assert.equal(String(payload.ts).slice(-3), '000', 'ts is seconds scaled to milliseconds');
  } finally {
    server.close();
  }
});

test(
  'a rejected sample is retried and annotated, and still never fails the run',
  { timeout: 30_000 },
  async () => {
    const { server, requests, port } = await startStub();
    try {
      const result = await runKeepAlive([
        '--attempts',
        '1',
        '--timeout',
        '5',
        `http://127.0.0.1:${port}/api/health`,
        '--report-url',
        `http://127.0.0.1:${port}/ingest-rejected`,
        '--report-token',
        'test-token',
        '--report-attempts',
        '2',
      ]);

      // The ping worked, so the run is green: the page's problem is the page's.
      assert.equal(result.code, 0, result.err);
      assert.match(result.out, /✓ keep-alive OK/);
      assert.equal(requests.filter((r) => r.url === '/ingest-rejected').length, 2, 'the sample is retried');
      assert.match(result.err, /rejected the sample \(HTTP 503\), attempt 1\/2/);
      assert.match(result.err, /rejected the sample \(HTTP 503\), attempt 2\/2/);
      assert.match(result.err, /no sample stored for this run/);
      // The annotation is the out-of-band record: it says the ping ran, so a
      // status page that is missing this window was itself the unreachable one.
      assert.match(result.out, /::warning title=Status page sample lost::/);
      assert.match(result.out, /HTTP 503/);
    } finally {
      server.close();
    }
  },
);

test('an API that answers 200 without samity-api in the body still fails the run', async () => {
  const { server, port } = await startStub();
  try {
    // No --report-url: this run has nowhere to report to, which must not change
    // the verdict either.
    const result = await runKeepAlive([
      '--attempts',
      '1',
      '--timeout',
      '5',
      `http://127.0.0.1:${port}/down/health`,
    ]);

    assert.equal(result.code, 1);
    assert.match(result.err, /not samity-api's health payload/);
    assert.doesNotMatch(result.err, /status page/, 'an unset report URL must stay silent');
  } finally {
    server.close();
  }
});
