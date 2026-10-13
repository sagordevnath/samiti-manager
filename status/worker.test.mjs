import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import worker from './worker.js';

/**
 * ── Status worker tests (node --test status/worker.test.mjs) ────────────────
 * Run with the Node test runner so the status service needs no build step and
 * no dependencies. D1 is stubbed with an in-memory table that mirrors the four
 * statements the worker issues; fetch is stubbed so nothing hits the network.
 */

const API_BASE = 'https://api.test/api/v1';
const TOKEN = 'test-ingest-token';

/** Minimal D1 stand-in: just enough SQL surface for worker.js. */
function stubDb(options = {}) {
  const rows = [];
  const db = {
    rows,
    prepare(sql) {
      const stmt = {
        sql,
        args: [],
        bind(...args) {
          stmt.args = args;
          return stmt;
        },
        async run() {
          if (/CREATE TABLE/i.test(sql)) return { success: true };
          if (/^INSERT INTO samples/i.test(sql)) {
            if (options.failInsert) throw new Error('D1 write failed');
            const [ts, ok, status, latency_ms, mode, source] = stmt.args;
            if (!rows.some((r) => r.ts === ts)) rows.push({ ts, ok, status, latency_ms, mode, source });
            return { success: true };
          }
          if (/^DELETE FROM samples/i.test(sql)) {
            const cutoff = stmt.args[0];
            for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i].ts < cutoff) rows.splice(i, 1);
            return { success: true };
          }
          throw new Error(`unsupported run(): ${sql}`);
        },
        async first() {
          if (/COUNT\(\*\) AS total/i.test(sql)) {
            const since = stmt.args[0];
            const inWindow = rows.filter((r) => r.ts >= since);
            return { total: inWindow.length, ok: inWindow.filter((r) => r.ok === 1).length };
          }
          if (/COUNT\(\*\) AS n/i.test(sql)) return { n: rows.length };
          if (/MIN\(ts\)/i.test(sql)) return { ts: rows.length ? Math.min(...rows.map((r) => r.ts)) : null };
          if (/ORDER BY ts DESC LIMIT 1/i.test(sql)) {
            return rows.length ? rows.slice().sort((a, b) => b.ts - a.ts)[0] : null;
          }
          throw new Error(`unsupported first(): ${sql}`);
        },
        async all() {
          if (/SELECT ts, ok, source FROM samples WHERE ts >= /i.test(sql)) {
            return { results: rows.filter((r) => r.ts >= stmt.args[0]).slice().sort((a, b) => a.ts - b.ts) };
          }
          if (/SELECT ts, source FROM samples WHERE ts >= /i.test(sql)) {
            return {
              results: rows
                .filter((r) => r.ts >= stmt.args[0])
                .sort((a, b) => a.ts - b.ts)
                .map((r) => ({ ts: r.ts, source: r.source })),
            };
          }
          throw new Error(`unsupported all(): ${sql}`);
        },
      };
      return stmt;
    },
  };
  return db;
}

function stubAssets(body = '<!doctype html><title>status page</title>') {
  const calls = [];
  return {
    calls,
    fetch(request) {
      calls.push(new URL(request.url).pathname);
      return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/html' } }));
    },
  };
}

function env(overrides = {}) {
  const DB = overrides.DB ?? stubDb();
  const ASSETS = overrides.ASSETS ?? stubAssets();
  return {
    DB,
    ASSETS,
    API_BASE_URL: overrides.API_BASE_URL ?? API_BASE,
    ...(overrides.token === null ? {} : { STATUS_INGEST_TOKEN: overrides.token ?? TOKEN }),
  };
}

/** Health payload the worker accepts as "the API is up". */
function healthResponse(body = { status: 'ok', service: 'samity-api', mode: 'demo' }, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

let realFetch;
let fetchCalls;

function stubFetch(impl) {
  fetchCalls = [];
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return impl(String(url), init);
  };
}

/** Fresh-hash the memoised schema promise between tests by importing once and
 * seeding rows directly, so tests stay independent of worker internals. */
beforeEach(() => {
  realFetch = globalThis.fetch;
  fetchCalls = [];
  // Any unstubbed call fails loudly: a test must never depend on the network,
  // and a probe that escapes the stub would otherwise pass for the wrong reason.
  globalThis.fetch = async (url) => {
    throw new Error(`unexpected network call in test: ${url}`);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const status = (envObj) => worker.fetch(new Request('https://status.test/status'), envObj);

test('serves the static page and keeps the API routes off the asset handler', async () => {
  const envObj = env();
  const res = await worker.fetch(new Request('https://status.test/'), envObj);
  assert.equal(res.status, 200);
  assert.deepEqual(envObj.ASSETS.calls, ['/']);

  const deep = await worker.fetch(new Request('https://status.test/assets/site.css'), envObj);
  assert.equal(deep.status, 200);
  assert.deepEqual(envObj.ASSETS.calls, ['/', '/assets/site.css']);

  stubFetch(() => healthResponse());
  await status(envObj);
  assert.deepEqual(envObj.ASSETS.calls, ['/', '/assets/site.css'], '/status must not fall through to assets');
});

test('probes the API when history is empty and stores the sample', async () => {
  const envObj = env();
  stubFetch(() => healthResponse({ status: 'ok', service: 'samity-api', mode: 'live' }));

  const body = await (await status(envObj)).json();

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, `${API_BASE}/health`);
  assert.equal(body.current.ok, true);
  assert.equal(body.current.mode, 'live');
  assert.equal(body.current.source, 'page');
  assert.equal(body.storage.samples, 1);
  assert.equal(body.uptime.last24h.total, 1);
  assert.equal(body.uptime.last24h.pct, 100);
  assert.equal(body.history.buckets.length, 96);
});

test('a fresh sample is reused instead of re-probing (one probe per minute max)', async () => {
  const envObj = env();
  stubFetch(() => healthResponse());
  await status(envObj);
  assert.equal(fetchCalls.length, 1);

  const second = await (await status(envObj)).json();
  assert.equal(fetchCalls.length, 1, 'a sample younger than FRESH_MS must not trigger another probe');
  assert.equal(second.storage.samples, 1);
});

test('a stale sample triggers a fresh probe', async () => {
  const envObj = env();
  const db = envObj.DB;
  db.rows.push({ ts: Date.now() - 5 * 60_000, ok: 1, status: 200, latency_ms: 42, mode: 'demo', source: 'workflow' });
  stubFetch(() => healthResponse({ status: 'ok', service: 'samity-api', mode: 'demo' }));

  const body = await (await status(envObj)).json();
  assert.equal(fetchCalls.length, 1);
  assert.equal(body.storage.samples, 2);
  assert.ok(body.current.ts >= Date.now() - 5_000, 'the stored sample is the new probe, not the stale one');
});

test('an HTML 200 (a static host answering for the API) counts as DOWN', async () => {
  const envObj = env();
  stubFetch(() => new Response('<!doctype html><html>app shell</html>', { status: 200, headers: { 'content-type': 'text/html' } }));

  const body = await (await status(envObj)).json();
  assert.equal(body.current.ok, false);
  assert.match(body.note, /unexpected payload/);
  assert.equal(body.uptime.last24h.pct, 0);
});

test('an HTTP error is recorded with its status code and reason', async () => {
  const envObj = env();
  stubFetch(() => new Response('{"error":{"code":"NOT_FOUND"}}', { status: 404 }));

  const body = await (await status(envObj)).json();
  assert.equal(body.current.ok, false);
  assert.equal(body.current.status, 404);
  assert.match(body.note, /HTTP 404/);
  assert.equal(body.storage.samples, 1);
});

test('a connection failure is a sample too, never a page error', async () => {
  const envObj = env();
  stubFetch(() => Promise.reject(new TypeError('connect ECONNREFUSED')));

  const res = await status(envObj);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.current.ok, false);
  assert.equal(body.current.status, 0);
  assert.match(body.note, /ECONNREFUSED/);
});

test('ingest is disabled when no token is configured', async () => {
  const envObj = env({ token: null });
  const res = await worker.fetch(
    new Request('https://status.test/ingest', { method: 'POST', body: JSON.stringify({ ok: true }) }),
    envObj,
  );
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'INGEST_DISABLED');
});

test('ingest rejects a wrong or missing token', async () => {
  const envObj = env();
  for (const headers of [{}, { authorization: 'Bearer nope' }]) {
    const res = await worker.fetch(
      new Request('https://status.test/ingest', { method: 'POST', headers, body: JSON.stringify({ ok: true }) }),
      envObj,
    );
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, 'UNAUTHORIZED');
  }
  assert.equal(envObj.DB.rows.length, 0);
});

test('ingest stores a workflow sample that /status then reports', async () => {
  const envObj = env();
  // Proving the freshness rule from the other side: this stub fails the test if
  // /status probes at all, because the ingested sample is already fresh.
  stubFetch(() => {
    throw new Error('the API must not be probed while a fresh sample exists');
  });
  const res = await worker.fetch(
    new Request('https://status.test/ingest', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ts: Date.now(), ok: true, status: 200, latencyMs: 321, mode: 'demo' }),
    }),
    envObj,
  );
  assert.equal(res.status, 201);
  const { sample } = await res.json();
  assert.equal(sample.source, 'workflow');
  assert.equal(sample.latencyMs, 321);

  const body = await (await status(envObj)).json();
  assert.equal(fetchCalls.length, 0, 'no probe: the ingested sample is fresh');
  assert.equal(body.current.source, 'workflow');
  assert.equal(body.current.latencyMs, 321);
});

test('a future timestamp is clamped to now (a poisoned clock cannot break windows)', async () => {
  const envObj = env();
  const now = Date.now();
  await worker.fetch(
    new Request('https://status.test/ingest', {
      method: 'POST',
      headers: { authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ ts: now + 10 * 60_000, ok: true, status: 200, latencyMs: 1 }),
    }),
    envObj,
  );
  assert.equal(envObj.DB.rows.length, 1);
  assert.ok(Math.abs(envObj.DB.rows[0].ts - now) < 5_000, `clamped ts was ${envObj.DB.rows[0].ts}`);
});

test('malformed bodies are rejected, and non-GET/HEAD on /status is a 405', async () => {
  const envObj = env();
  const bad = await worker.fetch(
    new Request('https://status.test/ingest', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: 'not json' }),
    envObj,
  );
  assert.equal(bad.status, 400);

  const wrongMethod = await worker.fetch(new Request('https://status.test/status', { method: 'POST' }), envObj);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET, HEAD');

  const wrongIngest = await worker.fetch(new Request('https://status.test/ingest'), envObj);
  assert.equal(wrongIngest.status, 405);
});

test('the 48-hour strip buckets by 30 minutes and counts down/up inside them', async () => {
  const envObj = env();
  const db = envObj.DB;
  const now = Date.now();
  // Two samples in the bucket one hour ago: one up, one down → partial.
  const bucketStart = (Math.floor(now / 1_800_000) - 2) * 1_800_000;
  db.rows.push(
    { ts: bucketStart + 60_000, ok: 1, status: 200, latency_ms: 10, mode: 'demo', source: 'workflow' },
    { ts: bucketStart + 120_000, ok: 0, status: 0, latency_ms: 0, mode: null, source: 'workflow' },
    { ts: now - 40 * 86_400_000, ok: 0, status: 0, latency_ms: 0, mode: null, source: 'workflow' }, // outside strip + retention
  );
  stubFetch(() => healthResponse());

  const body = await (await status(envObj)).json();
  assert.equal(body.history.buckets.length, 96);
  assert.equal(body.history.bucketMs, 1_800_000);

  const partial = body.history.buckets.find((b) => b.startTs === bucketStart);
  assert.equal(partial.total, 2);
  assert.equal(partial.ok, 1);
  assert.equal(partial.scheduled, 2, 'both of those came from the workflow');
  assert.equal(partial.visitsOnly, false);

  // The newest bucket is the probe this request just made.
  const newest = body.history.buckets[body.history.buckets.length - 1];
  assert.equal(newest.total, 1);
  assert.equal(newest.ok, 1);
  // A running bucket has no scheduled sample yet and must not be marked for it:
  // the run may still arrive, and a marker that lit up on every page load would
  // be noise.
  assert.equal(newest.complete, false);
  assert.equal(newest.scheduled, 0);
  assert.equal(newest.visitsOnly, false);
});

test('samples past retention are pruned when a new one is stored', async () => {
  const envObj = env();
  const db = envObj.DB;
  db.rows.push({ ts: Date.now() - 40 * 86_400_000, ok: 1, status: 200, latency_ms: 5, mode: 'demo', source: 'workflow' });
  stubFetch(() => healthResponse());

  const body = await (await status(envObj)).json();
  assert.equal(db.rows.length, 1, 'the 40-day-old row must be deleted');
  assert.equal(body.storage.retentionDays, 30);
  assert.equal(body.storage.samples, 1);
});

test('a storage failure is reported as an error instead of a fake green status', async () => {
  const envObj = env({ DB: { prepare: () => { throw new Error('D1 binding missing'); } } });
  const res = await status(envObj);
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.current, null);
  assert.match(body.error, /D1 binding missing/);
});

const MIN = 60_000;
const CADENCE = 10 * MIN;

/** `count` samples ending at `endTs`, one per cadence interval, oldest first. */
function seedCadence(db, count, endTs = Date.now()) {
  for (let i = count - 1; i >= 0; i -= 1) {
    db.rows.push({ ts: endTs - i * CADENCE, ok: 1, status: 200, latency_ms: 12, mode: 'demo', source: 'workflow' });
  }
}

/**
 * `count` page-visit samples ending at `endTs`, one every `stepMs`, oldest
 * first. The shape of a dashboard tab somebody left open: probes on a timer that
 * has nothing to do with the workflow's schedule.
 */
function seedVisits(db, count, endTs = Date.now(), stepMs = 2 * MIN) {
  for (let i = count - 1; i >= 0; i -= 1) {
    db.rows.push({ ts: endTs - i * stepMs, ok: 1, status: 200, latency_ms: 11, mode: 'demo', source: 'page' });
  }
}

/**
 * Selector lists in a <style> block. Braces are tracked by hand so that each
 * rule's prelude cannot swallow the previous rule's declarations — the mistake
 * that made the first version of the collision guard pass vacuously.
 */
function cssSelectors(css) {
  // Comments first: one of them names `.gap`, and text is not a selector.
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const preludes = [];
  let from = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '{') {
      preludes.push(source.slice(from, i));
      from = i + 1;
    } else if (source[i] === '}') {
      from = i + 1;
    }
  }
  return preludes.flatMap((prelude) => prelude.split(',').map((selector) => selector.trim()).filter(Boolean));
}

/**
 * ── Self-observation ────────────────────────────────────────────────────────
 * An outage of this page's own host is invisible to every other number here: no
 * sample is stored, so no row is wrong, and `ok/total` over stored samples gets
 * *better* the fewer samples there are. These tests pin the coverage and gap
 * arithmetic that makes the page report its own absence.
 */
test('a twelve-hour blind spot is reported as a gap, not as good uptime', async () => {
  const envObj = env();
  const now = Date.now();
  // Watched for the first half of the day, then nothing — the shape of a hosting
  // flap that swallowed both the workflow's writes and the page's.
  seedCadence(envObj.DB, 72, now - 12 * 60 * MIN);
  stubFetch(() => healthResponse());

  const body = await (await status(envObj)).json();
  const obs = body.observation;
  const day = obs.windows.last24h;

  assert.equal(obs.cadenceMs, CADENCE);
  assert.equal(obs.gapThresholdMs, 25 * MIN);
  assert.equal(day.stored, 73, '72 seeded samples plus the probe this request made');
  assert.equal(day.scheduled, 72, 'all 72 came from the workflow');
  assert.equal(day.visits, 1, 'the probe this request made');
  assert.equal(day.expected, 143, 'counted from the first sample, not from midnight');
  // Scheduled coverage, so the one page visit neither helps nor hurts it.
  assert.equal(day.coveragePct, 50.3);
  assert.ok(day.unobservedMs > 11 * 60 * MIN, `unobservedMs was ${day.unobservedMs}`);

  assert.equal(obs.gaps.length, 1);
  assert.ok(Math.abs(obs.gaps[0].durationMs - 12 * 60 * MIN) < 2 * MIN);
  assert.equal(obs.gaps[0].missing, 71);
  // Closed, not open: this request probes and stores, so observation has resumed
  // and the blind spot is history. It is still a gap — it is not uptime.
  assert.equal(obs.gaps[0].open, false);
  assert.equal(obs.openGap, null);

  // The whole point: the API percentage is "while observed", and it is the
  // coverage figure beside it that stops that from reading as a healthy day.
  assert.equal(body.uptime.last24h.pct, 100);
  assert.ok(day.coveragePct < 60);
});

test('a late workflow run is not reported as an outage of this page', async () => {
  const envObj = env();
  const now = Date.now();
  // GitHub delays scheduled runs by up to ~15 minutes and one run can spend
  // minutes in retries. A page that called that a blind spot would be noise, and
  // noise is indistinguishable from silence.
  for (let i = 3; i >= 0; i -= 1) {
    envObj.DB.rows.push({ ts: now - i * 20 * MIN, ok: 1, status: 200, latency_ms: 9, mode: 'demo', source: 'workflow' });
  }
  stubFetch(() => healthResponse());

  const body = await (await status(envObj)).json();
  assert.deepEqual(body.observation.gaps, []);
  assert.equal(body.observation.openGap, null);
  assert.deepEqual(body.observation.schedule.gaps, []);
  assert.equal(body.observation.schedule.stale, false);
  // Coverage still moves on its own: thinly watched is reported as thinly
  // watched, without accusing anyone of an outage.
  assert.equal(body.observation.windows.last24h.expected, 6);
  assert.equal(body.observation.windows.last24h.scheduled, 4);
  assert.equal(body.observation.windows.last24h.visits, 0, 'no probe: the newest workflow sample is fresh');
  assert.equal(body.observation.windows.last24h.coveragePct, 66.7);
});

test('a page that serves but cannot store a sample says so, and its history reads as stalled', async () => {
  const envObj = env({ DB: stubDb({ failInsert: true }) });
  const now = Date.now();
  // The page's own body is up (it answers this request) while every write to its
  // history fails: the state in which it would otherwise look perfectly healthy
  // and quietly stop recording anything at all.
  envObj.DB.rows.push({ ts: now - 3 * 60 * MIN, ok: 1, status: 200, latency_ms: 7, mode: 'demo', source: 'workflow' });
  stubFetch(() => healthResponse());

  const body = await (await status(envObj)).json();

  assert.equal(body.current.ok, true, 'the live probe still answers');
  assert.match(body.note, /not stored/);
  assert.equal(body.observation.gaps.length, 1);
  assert.equal(body.observation.gaps[0].open, true, 'samples stopped and have not resumed');
  assert.equal(body.observation.openGap.missing, 17);
});

test('a 30-minute window with no samples is flagged, with the ticks it was due', async () => {
  const envObj = env();
  const now = Date.now();
  envObj.DB.rows.push({ ts: now - 3 * 60 * MIN, ok: 1, status: 200, latency_ms: 8, mode: 'demo', source: 'workflow' });
  stubFetch(() => healthResponse());

  const body = await (await status(envObj)).json();
  const buckets = body.history.buckets;
  const bucketStart = (ts) => Math.floor(ts / 1_800_000) * 1_800_000;

  const watched = buckets.find((b) => b.startTs === bucketStart(now - 3 * 60 * MIN));
  assert.equal(watched.total, 1);
  assert.equal(watched.expected, 3, 'a completed bucket owes three samples, not four');
  assert.equal(watched.gap, false);

  const empty = buckets.find((b) => b.startTs === bucketStart(now - 2 * 60 * MIN));
  assert.equal(empty.total, 0);
  assert.equal(empty.expected, 3);
  assert.equal(empty.gap, true, 'a window nobody watched must be marked, not drawn as a quiet period');

  // The bucket the clock is still inside owes only the ticks that have passed. It
  // is legitimately short, so it must never be flagged as a blind spot.
  const newest = buckets[buckets.length - 1];
  assert.ok(newest.total >= 1, 'this request probes, so the running bucket is never empty');
  assert.ok(newest.expected >= 1 && newest.expected <= 3);
  assert.equal(newest.gap, false);
});

/**
 * ── Two observers, one of them a promise ────────────────────────────────────
 * The workflow samples on a clock and a visitor samples when a tab happens to be
 * open. Counting them into one "watched" figure is how a permanently open tab
 * reports a dead workflow as a perfectly watched window: the visits keep filling
 * the timeline, so coverage saturates and the gaps never form.
 */
test('a tab left open all day cannot make a dead workflow look watched', async () => {
  const envObj = env();
  const now = Date.now();
  // The workflow stopped six hours ago...
  seedCadence(envObj.DB, 108, now - 6 * 60 * MIN);
  // ...while somebody's dashboard tab kept probing every two minutes. Kept a
  // few minutes clear of both ends of the hole so nothing here turns on whether
  // a boundary sample counts: the newest one is stale, so this request probes
  // too, and that probe lands on the far edge.
  seedVisits(envObj.DB, 176, now - 5 * MIN, 2 * MIN);
  stubFetch(() => healthResponse());

  const body = await (await status(envObj)).json();
  const obs = body.observation;
  const day = obs.windows.last24h;

  assert.equal(day.visits, 177, 'the tab kept sampling, plus the probe this request made');
  assert.equal(day.scheduled, 108, 'the workflow stopped six hours ago');
  assert.equal(day.expected, 143);

  // The whole point. 288 samples against a promise of 143 would be a saturated
  // 100% under one blended figure; counting the workflow's samples alone and
  // reporting the visits beside them cannot say anything but 75.5%.
  assert.ok(day.stored > day.expected, 'a blended figure would have beaten the promise and sat at a capped 100%');
  assert.notEqual(day.coveragePct, 100);
  assert.equal(day.coveragePct, 75.5);
  assert.equal(day.coveragePct, Math.round((day.scheduled / day.expected) * 1000) / 10, 'exactly the scheduled ratio');

  // And the sharper half: the tab was answering the whole time, so this page has
  // no blind spot of its own — while the scheduled observer has six hours of one.
  assert.equal(obs.gaps.length, 0, 'no interval is completely unsampled: the tab was answering');
  assert.equal(day.gapCount, 0);
  assert.equal(obs.schedule.gaps.length, 1, 'but the promised observer has a hole');
  assert.equal(day.scheduleGapCount, 1);
  assert.ok(day.scheduleUnobservedMs > 350 * MIN, `scheduleUnobservedMs was ${day.scheduleUnobservedMs}`);

  const gap = obs.schedule.gaps[0];
  assert.equal(gap.open, true, 'the workflow has not come back');
  assert.equal(gap.missing, 35);
  assert.ok(Math.abs(gap.durationMs - 6 * 60 * MIN) < 3 * MIN);
  assert.equal(gap.visits, 176, 'and the visits are the evidence that this page was not the missing part');
  assert.equal(obs.schedule.openGap.visits, 176);
  assert.equal(obs.schedule.stale, true);
  assert.ok(obs.schedule.ageMs >= 6 * 60 * MIN);
});

test('a workflow that stops while visitors keep arriving is the workflow\'s absence, not this page\'s', async () => {
  const envObj = env();
  const now = Date.now();
  seedCadence(envObj.DB, 72, now - 4 * 60 * MIN);
  // A visitor's tab, probing every five minutes right across the hole, so the
  // page's own host is demonstrably answering from the first missed run to now.
  seedVisits(envObj.DB, 47, now - 2 * MIN, 5 * MIN);
  stubFetch(() => healthResponse());

  const body = await (await status(envObj)).json();
  const obs = body.observation;
  const gap = obs.schedule.openGap;

  assert.ok(gap, 'four silent hours is an open workflow gap');
  assert.equal(gap.visits, 47, '47 visits landed inside the hole');
  assert.equal(obs.windows.last24h.visits, 48, 'plus this request\'s own probe, at the edge');
  assert.equal(obs.windows.last24h.scheduled, 72, 'and not one of them counted as a scheduled sample');
  assert.equal(obs.windows.last24h.scheduled, 72);
  // The tab was there: this page's own outage is ruled out for that interval, so
  // the banner can say which observer failed instead of shrugging.
  assert.ok(obs.windows.last24h.coveragePct < 90, `coverage was ${obs.windows.last24h.coveragePct}`);
  // A *host* gap cannot exist while samples exist, so the ambiguity — and the
  // banner's "cause uncertain" wording — belongs to the other case only.
  assert.equal(obs.gaps.length, 0);
});

test('total silence stays ambiguous: an unreachable host and a dead cron look alike', async () => {
  const envObj = env();
  const now = Date.now();
  // Ten hours of workflow samples, then two hours with not one sample of any
  // kind. An unreachable host takes both writers out at once, so nothing here
  // distinguishes the page's own outage from a workflow that was absent while
  // nobody opened the page.
  seedCadence(envObj.DB, 60, now - 2 * 60 * MIN);
  stubFetch(() => healthResponse());

  const body = await (await status(envObj)).json();
  const obs = body.observation;

  assert.equal(obs.gaps.length, 1, 'the host gap');
  assert.equal(obs.schedule.gaps.length, 1, 'the same interval, seen from the promise');
  assert.equal(obs.schedule.gaps[0].visits, 0, 'no visit inside it, so the cause stays unknown');
  // Identical bounds are what let the banner collapse them into one item rather
  // than listing the same two hours twice; the page keys its dedupe on these.
  assert.equal(obs.schedule.gaps[0].fromTs, obs.gaps[0].fromTs);
  assert.equal(obs.schedule.gaps[0].toTs, obs.gaps[0].toTs);
  assert.ok(obs.gaps[0].durationMs > 110 * MIN);
  assert.ok(obs.windows.last24h.unobservedMs > 110 * MIN);
  assert.ok(obs.windows.last24h.scheduleUnobservedMs > 110 * MIN);
  // Two readings of the same hole, and they differ honestly: this request stored
  // a sample, so from the host's side observation resumed and the gap is closed,
  // while from the schedule's side no run has come since and it is still open.
  assert.equal(obs.gaps[0].open, false);
  assert.equal(obs.schedule.openGap.open, true);
  assert.equal(obs.schedule.stale, true);
});

test('a probe at the edge of a hole is not evidence the page was up during it', async () => {
  const envObj = env();
  const now = Date.now();
  // Three hours of nothing, and the only sample at the far end is the probe this
  // very request makes, because the newest sample is stale.
  seedCadence(envObj.DB, 6, now - 3 * 60 * MIN);
  stubFetch(() => healthResponse());

  const body = await (await status(envObj)).json();
  const obs = body.observation;
  const gap = obs.schedule.openGap;

  assert.ok(gap, 'the workflow has been silent since its last run');
  // That sample proves the host was up *now*, not for the three hours of missing
  // runs, so it is not counted as a visit inside the hole...
  assert.equal(gap.visits, 0);
  assert.equal(obs.windows.last24h.visits, 1, 'though it is still a visit in the window');
  // ...and the hole keeps its honest reading. Identical bounds are what the page
  // collapses into one item, so this is never listed twice and never attributed
  // to the workflow alone.
  assert.equal(obs.gaps.length, 1);
  assert.equal(obs.gaps[0].fromTs, gap.fromTs);
  assert.equal(obs.gaps[0].toTs, gap.toTs);
});

test('visits alone never claim the schedule, and a workflow that never ran is not an outage', async () => {
  const envObj = env();
  const now = Date.now();
  // A deployment that never wired the workflow up (docs/deploy.md §9 calls it
  // optional): nothing but page visits, ever.
  seedVisits(envObj.DB, 60, now, MIN);
  stubFetch(() => healthResponse());

  const body = await (await status(envObj)).json();
  const obs = body.observation;

  assert.equal(obs.windows.last24h.visits, 60);
  assert.equal(obs.windows.last24h.scheduled, 0);
  assert.equal(obs.windows.last24h.coveragePct, 0, 'not one scheduled sample was taken');
  assert.equal(obs.schedule.lastSampleTs, null);
  assert.equal(obs.schedule.ageMs, null);
  // Never having reported is not the same as having stopped: a page that called
  // this an outage would be claiming to know more than it does.
  assert.equal(obs.schedule.gaps.length, 0);
  assert.equal(obs.schedule.openGap, null);
  assert.equal(obs.schedule.stale, false);
});

/**
 * Regression guard for the other half of watching the watcher: the page must not
 * be able to present a hosting flap as a quiet period. The API has to publish the
 * coverage numbers, an unsampled window has to be drawn differently from an
 * unknown one, and the banner that names this page itself as a possible cause has
 * to exist and actually be fed.
 */
test('the page can report its own outage instead of passing it off as uptime', async () => {
  const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');

  assert.match(html, /\.bar\.gap\s*\{[^}]*repeating-linear-gradient/, '.bar.gap needs the hatched fill');
  const renderStrip = html.slice(html.indexOf('function renderStrip'), html.indexOf('function renderGaps'));
  assert.match(renderStrip, /bar\.classList\.add\('gap'\)/, 'unsampled buckets need the gap class');
  assert.match(renderStrip, /bucket\.expected/, 'the running bucket needs its due-sample count');

  // Class names must not collide with anything else on the page. The hatched
  // bars were `gap` and the banner was `.gap` too in the first draft, and its
  // padding and border inflated every 8px stub to 21px — a defect the class-name
  // assertions would not have seen, only a measured height.
  const selectors = cssSelectors(html.slice(0, html.indexOf('</style>')));
  for (const state of ['ok', 'partial', 'down', 'gap']) {
    assert.ok(selectors.includes(`.bar.${state}`), `.bar.${state} needs a rule`);
    assert.ok(!selectors.includes(`.${state}`), `.${state} is a bare selector too, so it leaks onto ${state} bars`);
  }
  assert.ok(selectors.includes('.gap-note'), 'the banner needs its own namespaced rule');
  assert.match(html, /id="gap-note" class="gap-note"/, 'the banner element carries that rule');

  const renderGaps = html.slice(html.indexOf('function renderGaps'), html.indexOf('function renderError'));
  assert.match(renderGaps, /observation\?\.gaps/, 'the banner reads the gap list');
  assert.match(renderGaps, /\$\('gap-note'\)/, 'the banner is found by its own id');
  assert.match(renderGaps, /workflow/, 'the banner names the other possible cause');
  assert.match(renderGaps, /openGap/, 'an unfinished blind spot is called out');

  const render = html.slice(html.indexOf('function render(data)'), html.indexOf('async function load'));
  assert.match(render, /renderGaps\(data\.observation\)/, 'render() must feed the banner');
  assert.match(render, /setStat\('observed'/, 'coverage needs its own figure');
  assert.match(render, /observation-detail/, 'the observation row needs filling');
});

/**
 * Regression guard for the source split's display half: the page has to *show*
 * that the workflow and the visits are counted apart — a hatched-over-colour bar
 * for a window only visits covered, a scheduled-only coverage figure, and a
 * banner that says which observer was missing rather than leaving both causes on
 * the table.
 */
test('the page counts the workflow and the page visits apart', async () => {
  const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
  const css = html.slice(0, html.indexOf('</style>'));

  assert.match(
    css,
    /\.bar\.visits-only\s*\{[^}]*background-image:\s*repeating-linear-gradient/,
    'a visits-only bar needs the hatch over its verdict colour',
  );
  // Rule order is load-bearing here. The colour rules set `background` as a
  // shorthand, which resets the image, so the hatch only survives if this rule
  // comes after them — and only if it overrides the image alone, leaving the
  // colour underneath. Moved up, or written as a shorthand, every visits-only
  // bar would silently lose its mark while the DOM still looked correct.
  assert.ok(
    css.indexOf('.bar.visits-only') > css.indexOf('.bar.down'),
    '.bar.visits-only must come after the colour rules it overrides',
  );
  assert.ok(
    !/\.bar\.visits-only\s*\{[^}]*\bbackground:/.test(css),
    'a shorthand there would erase the verdict colour underneath the hatch',
  );

  const selectors = cssSelectors(css);
  assert.ok(selectors.includes('.bar.visits-only'), '.bar.visits-only needs a rule');
  assert.ok(!selectors.includes('.visits-only'), '.visits-only must not be a bare selector');
  assert.ok(
    (html.match(/visits only/gi) ?? []).length >= 3,
    'the legend, the hint and the tooltip all have to explain the visits-only state',
  );

  const renderStrip = html.slice(html.indexOf('function renderStrip'), html.indexOf('function renderGaps'));
  assert.match(renderStrip, /bar\.classList\.add\('visits-only'\)/, 'renderStrip must mark visits-only buckets');
  assert.match(renderStrip, /bucket\.visitsOnly/, 'and read the flag from the API rather than recomputing it');
  assert.match(renderStrip, /bucket\.scheduled/, 'the tooltip must name the scheduled count');
  // The two states are mutually exclusive by construction: a bucket holding
  // nothing at all is the older `gap`, and marking it as visits-only too would
  // make one attribute carry two meanings.
  const elseBranch = renderStrip.slice(renderStrip.indexOf('} else {'), renderStrip.indexOf('} else {') + 400);
  assert.match(elseBranch, /bar\.classList\.add\('gap'\)/, 'an empty bucket is still the plain gap');
  assert.ok(
    renderStrip.indexOf("add('visits-only')") < renderStrip.indexOf('} else {'),
    'and it is marked in the sampled branch, never the empty one',
  );

  const renderGaps = html.slice(html.indexOf('function renderGaps'), html.indexOf('function renderError'));
  assert.match(renderGaps, /observation\?\.schedule/, 'the banner reads the workflow\'s own record');
  assert.match(renderGaps, /gap\.visits > 0/, 'only a hole with visits inside it proves which observer was missing');
  // Belt and braces on purpose: the same interval can be both a host gap and a
  // workflow hole, and listing two hours of silence twice reads as four hours.
  // Not `hostKeys` alone — the declaration would satisfy that with the check
  // deleted from the filter, which is exactly the regression being guarded.
  assert.match(renderGaps, /!hostKeys\.has\(/, 'the same interval must not be listed twice');
  assert.match(renderGaps, /gap\.visits/, 'and the count of visits is what the wording reports');
  assert.match(renderGaps, /কারণ অনিশ্চিত \/ cause uncertain/, 'a completely unsampled window keeps its honest ambiguity');

  const render = html.slice(html.indexOf('function render(data)'), html.indexOf('async function load'));
  const at = (needle) => render.slice(render.indexOf(needle), render.indexOf(needle) + 220);
  // Scoped to the one line each figure is written on: the scheduled pair also
  // appears in the detail row, so a page-wide match would stay green while the
  // headline figure quietly went back to counting every sample.
  assert.match(at("setStat('observed'"), /obs\.scheduled}\/\$\{obs\.expected\}/, 'the coverage figure counts scheduled samples only');
  assert.match(at('observation-detail'), /scheduled coverage \$\{obs\.scheduled\}\/\$\{obs\.expected\}/, 'as does the detail row');
  assert.match(at("setStat('workflow'"), /sched\.lastSampleTs === null/, "the workflow's last sample needs its own figure, and has to distinguish \"never reported\" from \"stopped\"");
  assert.match(render, /scheduleUnobservedMs/, 'the detail row carries the unscheduled time too');
  assert.match(html, /<div class="value na" id="workflow">/, 'the stat exists in the markup it is written into');
  assert.match(html, /scheduled 24h/, 'and its label says which observer it is counting');
});

/**
 * Regression guard for a defect that only a screenshot caught: .strip is a flex
 * row with align-items: flex-end, so a .bar without a height collapses to 0 and
 * the entire 48-hour graphic silently disappears — the page still returned 200,
 * the DOM still held 96 coloured bars, and every other test below stayed green.
 */
test('the history strip cannot render as invisible zero-height bars', async () => {
  const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
  const css = html.slice(0, html.indexOf('</style>'));
  assert.match(css, /\.bar\s*\{[^}]*min-height:\s*\d+px/, '.bar needs a min-height floor');

  const start = html.indexOf('function renderStrip');
  assert.ok(start > -1, 'renderStrip must exist');
  const renderStrip = html.slice(start, html.indexOf('function renderError'));
  assert.match(renderStrip, /bar\.style\.height\s*=/, 'each bar needs an explicit height');
  assert.match(renderStrip, /bucket\.total === 0 \? STUB_PX/, 'an unsampled bucket needs a visible stub');
  // Colour is the only signal in the strip, so it needs a text equivalent.
  assert.match(renderStrip, /strip\.setAttribute\(\s*'role',\s*'img'/, 'the strip needs role=img');
  assert.match(renderStrip, /'aria-label'/, 'the strip needs an aria-label');
});

/**
 * ── The page's own rendering, against real payloads ─────────────────────────
 * The guards above read index.html as text, which cannot see a defect that only
 * exists once the script has run — and both defects found here so far were of
 * that kind: bars collapsed to zero height by a flex rule, and a class name that
 * inflated every hatched bar. So the page's script is executed here, against the
 * real /status payload, with this stand-in for the browser.
 */
class ShimNode {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attrs = {};
    this.style = {};
    this.hidden = true;
    this.title = '';
    this.innerHTML = '';
    this._text = '';
    this._classes = new Set();
    const self = this;
    this.classList = {
      add: (...names) => names.forEach((name) => self._classes.add(name)),
      contains: (name) => self._classes.has(name),
      get list() {
        return [...self._classes];
      },
    };
  }
  set className(value) {
    this._classes = new Set(String(value).split(/\s+/).filter(Boolean));
  }
  get className() {
    return [...this._classes].join(' ');
  }
  set textContent(value) {
    this._text = String(value);
    if (value === '') this.children = []; // as the DOM: clearing text empties it
  }
  get textContent() {
    return this._text;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }
  getAttribute(name) {
    return this.attrs[name];
  }
}

/**
 * Load the real page with one /status payload and let it render. `skewMs` shifts
 * the clock the page sees, standing in for a visitor whose device clock is wrong.
 */
async function renderPage(payload, { skewMs = 0 } = {}) {
  const nodes = new Map();
  const document = {
    getElementById: (id) => {
      if (!nodes.has(id)) nodes.set(id, new ShimNode(id));
      return nodes.get(id);
    },
    createElement: (tag) => new ShimNode(tag),
  };
  const RealDate = Date;
  class PageDate extends RealDate {
    static now() {
      return RealDate.now() + skewMs;
    }
  }
  const context = vm.createContext({
    document,
    Date: PageDate,
    console,
    setInterval: () => 0,
    fetch: async () => ({ ok: true, status: 200, json: async () => payload }),
  });
  const html = await readFile(new URL('./public/index.html', import.meta.url), 'utf8');
  const from = html.indexOf('<script>') + '<script>'.length;
  vm.runInContext(html.slice(from, html.indexOf('</script>', from)), context);
  // The script loads itself; two macrotask turns let its promises settle.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  return nodes;
}

/** The scenario the source split exists for: the workflow is dead, a tab is not. */
async function tabStillOpenPayload() {
  const envObj = env();
  const now = Date.now();
  seedCadence(envObj.DB, 108, now - 6 * 60 * MIN);
  seedVisits(envObj.DB, 176, now - 5 * MIN, 2 * MIN);
  stubFetch(() => healthResponse());
  return (await status(envObj)).json();
}

test('the page draws a window only visits covered, with its verdict colour kept', async () => {
  const nodes = await renderPage(await tabStillOpenPayload());
  const bars = nodes.get('strip').children;
  const visitsOnly = bars.filter((bar) => bar.classList.contains('visits-only'));

  assert.equal(bars.length, 96, 'the strip is still 48 hours wide');
  assert.ok(
    visitsOnly.length >= 10 && visitsOnly.length <= 12,
    `the six missing hours should be marked, got ${visitsOnly.length}`,
  );
  for (const bar of visitsOnly) {
    assert.ok(
      ['ok', 'partial', 'down'].some((state) => bar.classList.contains(state)),
      `a visits-only bar lost its verdict colour: ${bar.className}`,
    );
    assert.ok(!bar.classList.contains('gap'), 'it must not also be the caught-nothing state');
  }
  assert.match(visitsOnly[0].title, /no scheduled sample/, 'and its tooltip has to say why it is hatched');
  assert.match(nodes.get('strip').getAttribute('aria-label'), /only page visits/);
  // The strip's left edge hatches the hours before this page existed — a separate
  // statement, and pre-existing. What matters here: inside the observed period
  // nothing is drawn as an outage, because the tab was answering.
  assert.equal(
    bars.slice(-48).filter((bar) => bar.classList.contains('gap')).length,
    0,
    'a window the page answered must not be drawn as the page being gone',
  );
  assert.equal(nodes.get('observed').textContent, '75.5% (108/143)', 'scheduled coverage counts the workflow alone');
  assert.equal(nodes.get('workflow').textContent, '6 h ago', 'and the workflow has its own last-sample figure');
});

test('the rendered banner names the observer that could be identified, and only once', async () => {
  const nodes = await renderPage(await tabStillOpenPayload());
  const banner = nodes.get('gap-note');

  assert.equal(banner.hidden, false, 'a six-hour hole is worth a banner');
  assert.equal((banner.innerHTML.match(/<li>/g) ?? []).length, 1, 'and it is one interval, not two');
  assert.match(banner.innerHTML, /visits arrived/, 'the visits are named as the evidence');
  assert.doesNotMatch(banner.innerHTML, /cause uncertain/, 'so this hole is not hedged about');
});

test('the rendered banner keeps its ambiguity when not one sample was stored', async () => {
  const envObj = env();
  const now = Date.now();
  seedCadence(envObj.DB, 60, now - 2 * 60 * MIN);
  stubFetch(() => healthResponse());
  const nodes = await renderPage(await (await status(envObj)).json());

  const banner = nodes.get('gap-note');
  const bars = nodes.get('strip').children;
  assert.equal(banner.hidden, false);
  assert.equal((banner.innerHTML.match(/<li>/g) ?? []).length, 1, 'the same interval is not listed twice');
  assert.match(banner.innerHTML, /cause uncertain/);
  assert.doesNotMatch(banner.innerHTML, /visits arrived/);
  assert.ok(bars.filter((bar) => bar.classList.contains('gap')).length >= 3, 'the empty hours are drawn as empty');
  assert.equal(bars.filter((bar) => bar.classList.contains('visits-only')).length, 0, 'and not as visits-only');
});

test("the page's figures are measured on the server's clock, not the visitor's", async () => {
  const payload = await tabStillOpenPayload();
  const trusting = await renderPage(payload);
  // A phone set by hand, or a renderer whose clock drifts: the timestamps are all
  // the server's, so the visitor's clock must not enter into what they mean. This
  // was a real defect before `checkedAt` was used to measure the offset — the
  // figure read "0s ago" for a sample four hours old, and a recent gap could fall
  // outside the banner's 48-hour cutoff and disappear.
  const skewed = await renderPage(payload, { skewMs: -11.5 * 3_600_000 });

  assert.equal(skewed.get('workflow').textContent, trusting.get('workflow').textContent);
  assert.equal(skewed.get('observed').textContent, trusting.get('observed').textContent);
  assert.equal(skewed.get('checked').textContent, trusting.get('checked').textContent);
  assert.equal(skewed.get('gap-note').hidden, false, 'a clock behind must not silence the banner');
  assert.match(skewed.get('gap-note').innerHTML, /visits arrived/);

  // And a clock running fast, where a client-time cutoff would push today's gap
  // past the banner's 48-hour window and hide the only thing it had to say.
  const fast = await renderPage(payload, { skewMs: 3 * 86_400_000 });
  assert.equal(fast.get('workflow').textContent, trusting.get('workflow').textContent);
  assert.equal(fast.get('gap-note').hidden, false, 'nor may a clock ahead hide it');
  assert.match(fast.get('gap-note').innerHTML, /visits arrived/);
});
