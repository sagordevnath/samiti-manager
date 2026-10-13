/**
 * ── Samity Manager — public API status page ─────────────────────────────────
 * A small, read-only page that answers "is the API up?" for the deployed site,
 * with real uptime history rather than a single instantaneous probe:
 *
 *   GET  /         the page (static asset in ./public)
 *   GET  /status   JSON: the current state plus 24h/7d uptime and a 48h strip
 *   POST /ingest   append one sample — token-gated, used by the keep-alive
 *                  workflow (.github/workflows/keep-alive.yml)
 *
 * Why the samples live here rather than in the API: a status page whose history
 * is stored by the service it monitors cannot report that service being down.
 * Samples come from two independent sources —
 *
 *   1. the keep-alive workflow, every 10 minutes, whatever else is happening;
 *   2. a visitor loading the page, if the newest sample is older than FRESH_MS,
 *      so a page view is never staler than one minute.
 *
 * Storage is D1 (env.DB), pruned to RETENTION_DAYS. No secrets are ever sent to
 * the browser: /status is public and read-only, /ingest requires a bearer token
 * that only exists as a Worker secret and a GitHub secret.
 *
 * ── Watching the watcher ────────────────────────────────────────────────────
 * Every sample is written through the very Worker this page reports on, so an
 * outage of the page's own host does not store a wrong row — it stores no row at
 * all, and absent rows used to read as "nothing happened". "How much of this
 * window did we actually watch?" is therefore answered too (observation.*): the
 * workflow's cadence says how many samples a window should hold, and intervals
 * holding none are reported as this page's own blind spots.
 *
 * ── Two observers, only one of them a promise ───────────────────────────────
 * The two sample sources are not interchangeable and are never averaged into one
 * number. The workflow is a promise kept on a clock; a visit is opportunistic
 * and stops when the tab closes. So observation.windows.* counts the workflow's
 * samples alone for `coveragePct` and reports visits separately — a tab left
 * open all day, probing every minute, cannot make a window look watched while
 * the workflow has been dead for hours. observation.schedule carries that
 * observer's own record (its gaps, its last sample, whether it is stale), while
 * observation.gaps keeps the older and genuinely ambiguous case: an interval
 * with no sample of any kind.
 */

/** The deployed API this page monitors — override with the API_BASE_URL var. */
const DEFAULT_API_BASE = 'https://samity-api.onrender.com/api/v1';

/** A page view re-probes only when the newest sample is older than this. */
const FRESH_MS = 60_000;

/** Per-probe timeout for the API health check. */
const PROBE_TIMEOUT_MS = 10_000;

/** Samples older than this are deleted; 30 days of 10-minute samples is small. */
const RETENTION_DAYS = 30;

/** Strip resolution and width: 96 bars × 30 minutes = 48 hours. */
const BUCKET_MS = 30 * 60_000;
const BUCKET_COUNT = 96;

/**
 * The keep-alive workflow's cadence (.github/workflows/keep-alive.yml), used as
 * the yardstick for "was anyone watching?". Change one and change the other.
 */
const EXPECTED_INTERVAL_MS = 10 * 60_000;

/**
 * A blind spot is only claimed past this. GitHub's scheduler delays runs by up
 * to ~15 minutes under load and a single run can spend minutes in retries, so a
 * shorter gap cannot be told apart from a late run — and a page that cried
 * outage every time cron slipped would be worth less than no page at all.
 */
const GAP_INTERVAL_MS = 25 * 60_000;

/** D1 row → the sample shape used everywhere else. */
function toSample(row) {
  return {
    ts: Number(row.ts),
    ok: Number(row.ok) === 1,
    status: Number(row.status) || 0,
    latencyMs: Number(row.latency_ms) || 0,
    mode: row.mode ?? null,
    source: row.source ?? null,
  };
}

/**
 * Create the table on first use. Memoised per isolate, and the memo is dropped
 * on failure so a transient D1 error is retried by the next request.
 */
let schemaReady;
function ensureSchema(db) {
  schemaReady ??= db
    .prepare(
      `CREATE TABLE IF NOT EXISTS samples (
         ts INTEGER PRIMARY KEY,
         ok INTEGER NOT NULL,
         status INTEGER,
         latency_ms INTEGER,
         mode TEXT,
         source TEXT
       )`,
    )
    .run()
    .catch((err) => {
      schemaReady = undefined;
      throw err;
    });
  return schemaReady;
}

/** Probe the API health endpoint. Never throws: a failure is a sample too. */
async function probeOnce(apiBase) {
  const started = Date.now();
  try {
    const res = await fetch(`${apiBase}/health`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;
    const body = await res.json().catch(() => undefined);
    if (!res.ok) {
      return { ok: false, status: res.status, latencyMs, mode: null, error: `HTTP ${res.status} from ${apiBase}/health` };
    }
    // A static host answers 200 with index.html, so the payload decides: only a
    // body that says samity-api counts as up (same rule as the web client).
    if (!body || body.service !== 'samity-api') {
      return { ok: false, status: res.status, latencyMs, mode: null, error: `unexpected payload from ${apiBase}/health` };
    }
    return { ok: true, status: res.status, latencyMs, mode: typeof body.mode === 'string' ? body.mode : null, error: null };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      mode: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Store one sample and drop anything past retention. */
async function storeSample(db, sample) {
  await db
    .prepare(
      `INSERT INTO samples (ts, ok, status, latency_ms, mode, source)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)
       ON CONFLICT(ts) DO NOTHING`,
    )
    .bind(sample.ts, sample.ok ? 1 : 0, sample.status, sample.latencyMs, sample.mode, sample.source)
    .run();
  await db.prepare('DELETE FROM samples WHERE ts < ?1').bind(Date.now() - RETENTION_DAYS * 86_400_000).run();
}

/** Oldest → newest buckets covering the last BUCKET_COUNT × BUCKET_MS. */
function bucketize(rows, nowMs) {
  const start = (Math.floor(nowMs / BUCKET_MS) - (BUCKET_COUNT - 1)) * BUCKET_MS;
  const buckets = Array.from({ length: BUCKET_COUNT }, (_, index) => {
    const startTs = start + index * BUCKET_MS;
    // Ticks due inside this window by now. The newest bucket is still running,
    // so it is legitimately short and must not be drawn as a blind spot.
    const elapsed = Math.min(startTs + BUCKET_MS, nowMs) - startTs;
    return {
      startTs,
      ok: 0,
      total: 0,
      // Samples contributed by the workflow, as against those contributed by
      // page visits, so a bar full of visits cannot pass for a watched window.
      scheduled: 0,
      // Whether this bucket's window has finished. A running bucket is short by
      // definition, so it must not be judged against a full quota.
      complete: startTs + BUCKET_MS <= nowMs,
      // Ticks in [startTs, startTs + elapsed): a completed bucket owes three at
      // the 10-minute cadence, not four — the tick on its far edge is the next
      // bucket's. Never zero, so a bucket the clock has just entered does not
      // read as "nothing was due".
      expected: Math.max(1, Math.ceil(elapsed / EXPECTED_INTERVAL_MS)),
      gap: false,
    };
  });
  for (const row of rows) {
    const index = Math.floor((Number(row.ts) - start) / BUCKET_MS);
    if (index < 0 || index >= BUCKET_COUNT) continue;
    buckets[index].total += 1;
    if (Number(row.ok) === 1) buckets[index].ok += 1;
    if (row.source === 'workflow') buckets[index].scheduled += 1;
  }
  for (const bucket of buckets) {
    // A window with no sample in it is not "state unknown" — it is a window
    // nobody watched, which is exactly what this page's own outage looks like.
    bucket.gap = bucket.total === 0;
    // Visits but no scheduled sample: the page answered and the workflow did
    // not. Only claimed for a completed window, because a bucket the clock is
    // still inside may well get its run before it ends — and a marker that lit
    // up on every page load would be noise, which is indistinguishable from
    // silence.
    bucket.visitsOnly = bucket.complete && bucket.total > 0 && bucket.scheduled === 0;
  }
  return { bucketMs: BUCKET_MS, startTs: start, buckets };
}

function pct(ok, total) {
  return total === 0 ? null : Math.round((ok / total) * 1000) / 10;
}

/**
 * ── Self-observation ────────────────────────────────────────────────────────
 * Intervals between samples (plus the interval from the newest sample to now)
 * that are too long to be a late workflow run.
 */
function findGaps(stamps, nowMs) {
  const edges = [...stamps].sort((a, b) => a - b).concat(nowMs);
  const gaps = [];
  for (let i = 1; i < edges.length; i += 1) {
    const fromTs = edges[i - 1];
    const toTs = edges[i];
    const durationMs = toTs - fromTs;
    if (durationMs <= GAP_INTERVAL_MS) continue;
    gaps.push({
      fromTs,
      toTs,
      durationMs,
      // Samples that should have been taken and were not. Half an hour of
      // lateness is one missing sample, not three.
      missing: Math.max(0, Math.round(durationMs / EXPECTED_INTERVAL_MS) - 1),
      // The trailing edge is `now`: a blind spot that has not ended yet is
      // usually the flap that just ended, since this request is the first thing
      // back. It is the one worth shouting about, so it is flagged.
      open: i === edges.length - 1,
    });
  }
  return gaps;
}

/**
 * Gaps in the *scheduled* observer's own timeline: the workflow's runs, with
 * page visits excluded. This is the number a long-open tab cannot flatter — a
 * visit stores a sample and proves the page's host answered, but it is not the
 * promise, so it cannot fill in a run that never happened.
 *
 * `visits` is how many page samples landed *during* the hole, and it is what
 * turns "somebody was missing" into "the workflow was the missing one": if this
 * page answered while runs were due and no run came, the absence is the
 * workflow's. Boundaries are excluded, which is not a detail — a sample sitting
 * on the trailing edge is this request's own probe, and it says the host was up
 * at the end of the hole, not that it was up while runs were being missed.
 *
 * That exclusion also gives the page a clean rule: a gap with 0 visits is one
 * whose bounds are identical to a host gap. Nothing can sit strictly between two
 * consecutive workflow samples except a visit, and nothing can share a
 * timestamp with one (ts is the primary key), so an empty hole is the *same*
 * hole. The page uses exactly that to keep the two causes apart.
 */
function findScheduleGaps(scheduledStamps, visitStamps, nowMs) {
  return findGaps(scheduledStamps, nowMs).map((gap) => ({
    ...gap,
    visits: visitStamps.filter((ts) => ts > gap.fromTs && ts < gap.toTs).length,
  }));
}

/**
 * Coverage for one window, in two layers rather than one blended number.
 *
 * `expected` is the workflow's promise — the ticks its cadence says should have
 * happened — and `scheduled` counts only the samples that kept it, so a window
 * stuffed with page visits still reads as unwatched. That matters because a
 * visit is opportunistic: it happens when a human has the page open, stops when
 * they close it, and says nothing about whether a scheduled run happened. `from`
 * counts from when observation began (firstTs) rather than from the window
 * start, so a page that has existed for an hour is not accused of missing the
 * twenty-three before it.
 */
function windowStats({ samples, gaps, scheduleGaps, nowMs, sinceMs, firstTs }) {
  const from = Math.max(sinceMs, Math.min(firstTs ?? nowMs, nowMs));
  const expected = Math.max(0, Math.round((nowMs - from) / EXPECTED_INTERVAL_MS));
  const inWindow = samples.filter((sample) => sample.ts >= sinceMs);
  const scheduled = inWindow.filter((sample) => sample.scheduled).length;
  const visits = inWindow.length - scheduled;
  const hostGaps = gaps.filter((gap) => gap.toTs > sinceMs);
  const missedRuns = scheduleGaps.filter((gap) => gap.toTs > sinceMs);
  // Only the part inside this window: a nine-hour gap straddling midnight is two
  // hours of this day and seven of the one before.
  const overlapMs = (list) =>
    list.reduce((sum, gap) => sum + (Math.min(gap.toTs, nowMs) - Math.max(gap.fromTs, sinceMs)), 0);
  return {
    expected,
    scheduled,
    visits,
    stored: inWindow.length,
    /*
     * How much of the promise was kept. Visits deliberately do not count: a tab
     * open for a day probes every minute and can only raise `visits`, never this.
     * Capped at 100 because a late run can land in a window that already met its
     * quota, and a percentage over 100 would read as a bug rather than a bonus.
     */
    coveragePct: expected > 0 ? Math.min(100, Math.round((scheduled / expected) * 1000) / 10) : null,
    gapCount: hostGaps.length,
    longestGapMs: hostGaps.reduce((max, gap) => Math.max(max, gap.durationMs), 0),
    // No sample of any kind: this page's own host was unreachable, or the
    // workflow was absent and nobody happened to be looking.
    unobservedMs: overlapMs(hostGaps),
    // No *scheduled* sample: the workflow's absence, whether or not the page was
    // up to notice it.
    scheduleGapCount: missedRuns.length,
    scheduleUnobservedMs: overlapMs(missedRuns),
  };
}

function analyseObservation(rows, nowMs, firstTs) {
  const samples = (rows ?? []).map((row) => ({
    ts: Number(row.ts),
    // Only the token-gated /ingest route writes `workflow`, so no visitor can
    // claim it; everything else — a page probe, or a row written before the
    // column existed — is opportunistic by definition and is counted as a visit.
    scheduled: row.source === 'workflow',
  }));
  const stamps = samples.map((sample) => sample.ts);
  const scheduledStamps = samples.filter((sample) => sample.scheduled).map((sample) => sample.ts);
  const visitStamps = samples.filter((sample) => !sample.scheduled).map((sample) => sample.ts);

  const gaps = findGaps(stamps, nowMs);
  const scheduleGaps = findScheduleGaps(scheduledStamps, visitStamps, nowMs);
  const windowsAt = (sinceMs) => windowStats({ samples, gaps, scheduleGaps, nowMs, sinceMs, firstTs });
  const lastScheduledTs = scheduledStamps.length ? Math.max(...scheduledStamps) : null;

  return {
    cadenceMs: EXPECTED_INTERVAL_MS,
    gapThresholdMs: GAP_INTERVAL_MS,
    windows: {
      last24h: windowsAt(nowMs - 86_400_000),
      last7d: windowsAt(nowMs - 7 * 86_400_000),
    },
    // Newest first and capped: the page names a few, and an unbounded list would
    // grow with retention for no reader's benefit.
    gaps: gaps.slice(-20).reverse(),
    // An unfinished blind spot means samples stopped and have not resumed. Its
    // cause is genuinely ambiguous — see `schedule` for the half that is not.
    openGap: gaps.filter((gap) => gap.open && gap.toTs > nowMs - 86_400_000).pop() ?? null,
    /*
     * The scheduled observer's own record. Page visits cannot flatter it, because
     * its timeline is the workflow's samples alone: a run that never happened
     * leaves a hole no amount of page traffic can fill.
     */
    schedule: {
      lastSampleTs: lastScheduledTs,
      ageMs: lastScheduledTs === null ? null : nowMs - lastScheduledTs,
      // Null means it has never reported at all, which is not the same as having
      // stopped: a deployment that never wired the workflow up (see
      // docs/deploy.md §9) is a configuration choice, and a page that called it
      // an outage would be lying about what it knows.
      stale: lastScheduledTs !== null && nowMs - lastScheduledTs > GAP_INTERVAL_MS,
      // Newest first, each with the visits that landed inside it.
      gaps: scheduleGaps.slice(-20).reverse(),
      openGap: scheduleGaps.filter((gap) => gap.open && gap.toTs > nowMs - 86_400_000).pop() ?? null,
    },
  };
}

/** uptime percentage over a window, straight from SQL. */
async function uptimeWindow(db, sinceMs) {
  const row = await db
    .prepare('SELECT COUNT(*) AS total, SUM(ok) AS ok FROM samples WHERE ts >= ?1')
    .bind(sinceMs)
    .first();
  const total = Number(row?.total) || 0;
  const ok = Number(row?.ok) || 0;
  return { ok, total, pct: pct(ok, total) };
}

/** Constant-time-ish compare so the ingest token cannot be probed by timing. */
function tokenMatches(given, expected) {
  if (!given || !expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i += 1) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });
}

/** GET /status — public. Serves the freshest sample, probing if it is stale. */
async function handleStatus(env) {
  const db = env.DB;
  const apiBaseUrl = (env.API_BASE_URL || DEFAULT_API_BASE).replace(/\/+$/, '');
  const nowMs = Date.now();

  await ensureSchema(db);

  const newestRow = await db
    .prepare('SELECT ts, ok, status, latency_ms, mode, source FROM samples ORDER BY ts DESC LIMIT 1')
    .first();
  let current = newestRow ? toSample(newestRow) : null;

  // Only the page's own view triggers an extra probe: the keep-alive workflow
  // supplies the regular cadence, and this keeps a visitor from hammering the
  // API. Failures here must not break the page, so they degrade to the stored
  // sample with a note.
  let note = null;
  if (!current || nowMs - current.ts > FRESH_MS) {
    const probed = await probeOnce(apiBaseUrl);
    const sample = { ts: nowMs, ...probed, source: 'page' };
    try {
      await storeSample(db, sample);
    } catch (err) {
      note = `sample not stored: ${err instanceof Error ? err.message : String(err)}`;
    }
    current = { ts: sample.ts, ok: sample.ok, status: sample.status, latencyMs: sample.latencyMs, mode: sample.mode, source: 'page' };
    // A probe failure is the explanation the page needs; a storage warning is
    // only worth showing when the probe itself succeeded.
    note = probed.error ?? note;
  }

  const [day, week, totalRow, firstRow, strip, stamps] = await Promise.all([
    uptimeWindow(db, nowMs - 86_400_000),
    uptimeWindow(db, nowMs - 7 * 86_400_000),
    db.prepare('SELECT COUNT(*) AS n FROM samples').first(),
    db.prepare('SELECT MIN(ts) AS ts FROM samples').first(),
    db
      .prepare('SELECT ts, ok, source FROM samples WHERE ts >= ?1 ORDER BY ts ASC')
      .bind((Math.floor(nowMs / BUCKET_MS) - (BUCKET_COUNT - 1)) * BUCKET_MS)
      .all(),
    // Timestamps and sources only: the gap analysis needs the whole week's
    // timeline split by who took each sample, and a week of pairs is far cheaper
    // to carry than a week of rows.
    db
      .prepare('SELECT ts, source FROM samples WHERE ts >= ?1 ORDER BY ts ASC')
      .bind(nowMs - 7 * 86_400_000)
      .all(),
  ]);

  const firstTs = firstRow?.ts ? Number(firstRow.ts) : null;
  const observation = analyseObservation(stamps?.results ?? [], nowMs, firstTs);

  return json({
    service: 'samity-api-status',
    apiBaseUrl,
    checkedAt: nowMs,
    current,
    note,
    /* Uptime is "while observed": these percentages cannot speak for a window
       with no samples in it, so the coverage numbers travel with them. */
    uptime: { last24h: day, last7d: week },
    observation,
    history: bucketize(strip?.results ?? [], nowMs),
    storage: {
      samples: Number(totalRow?.n) || 0,
      firstSampleTs: firstRow?.ts ? Number(firstRow.ts) : null,
      retentionDays: RETENTION_DAYS,
      freshMs: FRESH_MS,
      probeTimeoutMs: PROBE_TIMEOUT_MS,
    },
  });
}

/** POST /ingest — one sample from the keep-alive workflow. Token required. */
async function handleIngest(request, env) {
  const expected = env.STATUS_INGEST_TOKEN;
  if (!expected) {
    // No token configured means no write endpoint at all, rather than an open
    // one: the page still works off its own probe.
    return json({ error: { code: 'INGEST_DISABLED', message: 'Ingest is not configured on this deployment.' } }, 503);
  }
  const header = request.headers.get('authorization') ?? '';
  const given = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!tokenMatches(given, expected)) {
    return json({ error: { code: 'UNAUTHORIZED', message: 'Invalid ingest token.' } }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: { code: 'VALIDATION_ERROR', message: 'Body must be JSON.' } }, 400);
  }

  const db = env.DB;
  await ensureSchema(db);

  const nowMs = Date.now();
  // Trust the caller's timestamp only slightly: a poisoned future value would
  // break every window query, and the workflow runs on the same clock.
  const rawTs = Number(body?.ts);
  const ts = Number.isFinite(rawTs) && Math.abs(nowMs - rawTs) < 300_000 ? Math.round(rawTs) : nowMs;
  const status = Number(body?.status);
  const latency = Number(body?.latencyMs);

  const sample = {
    ts,
    ok: body?.ok === true || body?.ok === 'true' || body?.ok === 1,
    status: Number.isFinite(status) ? Math.round(status) : 0,
    latencyMs: Number.isFinite(latency) ? Math.max(0, Math.round(latency)) : 0,
    mode: typeof body?.mode === 'string' ? body.mode.slice(0, 16) : null,
    source: 'workflow',
  };

  try {
    await storeSample(db, sample);
  } catch (err) {
    return json(
      { error: { code: 'STORAGE_ERROR', message: err instanceof Error ? err.message : String(err) } },
      500,
    );
  }
  return json({ stored: true, sample }, 201);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/status') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET /status.' } }, 405, { allow: 'GET, HEAD' });
      }
      try {
        return await handleStatus(env);
      } catch (err) {
        // Storage or binding failure: report it as an error (the page renders an
        // explicit "history unavailable" state) rather than pretending to be up.
        return json(
          {
            service: 'samity-api-status',
            checkedAt: Date.now(),
            current: null,
            error: err instanceof Error ? err.message : String(err),
          },
          500,
        );
      }
    }

    if (pathname === '/ingest') {
      if (request.method !== 'POST') {
        return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST /ingest.' } }, 405, { allow: 'POST' });
      }
      return handleIngest(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
