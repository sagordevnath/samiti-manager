# Deployment Runbook

How to put Samity Manager online: a **static web client** (Netlify), a
**Docker API** (any host), and a **Supabase** project for data.

> **Read §2 first if your deployed site loads but shows no data.** That is the
> single most common deployment mistake and it has a five-minute fix.

---

## 1. Architecture

```
browser ──► static client (Netlify)          apps/web  → dist/
                  │  HTTPS + fetch
                  ▼
            API (Docker container)           apps/api  → dist/server.js
                  │  service-role key
                  ▼
            Supabase (Postgres + Auth)       supabase/migrations
```

- The client is **static**: it has no server and no database access. Every
  number on screen comes from the API.
- The API is the **only** component that holds the `service_role` key. That key
  must never reach the browser, the client build, or git.
- The client talks to Supabase **only** through the API — it does not need
  Supabase keys at all.

---

## 2. "The site loads but shows no data" — the fix

The client gets the API's address from the first of these that is set:

| # | Source | Applies to | When to use it |
| - | ------ | ---------- | -------------- |
| 0 | `localStorage['samity.apiUrl']`, set from the red screen | **this browser only** | Emergency repair by whoever is looking at the page. Never fixes it for visitors. |
| 1 | `window.__SAMITY_CONFIG__.apiUrl` in **`/config.js`** | the deployment | Repoint a **deployed** site with **no rebuild** |
| 2 | **`VITE_API_URL`** baked in at build time | the deployment | Normal path: set it in the host's env vars |
| 3 | `/api/v1` (same origin) | build fallback | Local dev (Vite proxy) or one-origin reverse-proxy deploys |

A **production build on a static host now refuses to run without an API
address** — Netlify/Vercel/Cloudflare Pages deploys fail with *"production
build without an API address"* instead of publishing a site that renders empty
pages. When the address legitimately arrives from `/config.js` or a same-origin
reverse proxy, declare it with `SAMITY_ALLOW_UNCONFIGURED_API=1` in the same
place as the other build variables. Preview/branch deploys are never blocked.

If none of them points at your API, the browser asks **the static host** for
data. Netlify answers `200` with `index.html`, so every page renders an empty
shell. This is the failure mode you are looking at.

**Diagnose it in 10 seconds.** The app now tells you instead of showing blank
pages: when the API cannot be reached it renders a red *"Cannot reach the API
server"* screen listing the URL it tried, where that URL came from, and the
reason. Open the deployed site:

- Red screen, `Source: same-origin default "/api/v1" — nothing was configured`
  → **you never set `VITE_API_URL`.** Do step A.
- Red screen, `Source: window.__SAMITY_CONFIG__ …` pointing at a wrong host
  → edit `/config.js`. Do step B.
- Red screen, CORS or `ECONNREFUSED` → the API is down or blocks your origin.
  Do §4 step 4.
- Red screen, `Timed out after 45s` on a free-tier host → the instance was
  asleep and is still booting. It is not a misconfiguration; retry, and add the
  keep-alive ping from §4 to stop it happening.
- Red screen, `Source: this browser (localStorage)` → someone pointed *that*
  browser at a different API from the red screen itself. Clear it there to fall
  back to the deployment's address.

### A. Set the API URL and rebuild (permanent fix)

Netlify → **Site configuration → Environment variables → Add a variable**:

```
VITE_API_URL = https://YOUR-API-HOST/api/v1
```

Then **Deploys → Trigger deploy → Clear cache and deploy site**. Vite bakes the
value in at build time, so a rebuild is required. A production build without it
now fails outright rather than publishing an empty shell (opt out with
`SAMITY_ALLOW_UNCONFIGURED_API=1` when `/config.js` or a proxy supplies the
address).

### B. Edit `/config.js` on the live site (no rebuild)

Works immediately and is handy for demos or for repointing an existing deploy:

1. Netlify → **Deploys → click the live deploy → Browse published deploy**.
2. Open `config.js`, set the URL, save:

   ```js
   window.__SAMITY_CONFIG__ = { apiUrl: 'https://YOUR-API-HOST/api/v1' };
   ```

3. Hard-reload the site. `config.js` is served `no-cache` and excluded from the
   service-worker precache, so the change takes effect on the next load.

This file is **public** — never put keys in it.

---

## 3. Deploy the client (Netlify)

`netlify.toml` at the repository root already contains everything:

| Setting | Value |
| ------- | ----- |
| Build command | `npm run build:web` |
| Publish directory | `apps/web/dist` |
| Node | 22 (set by `netlify.toml`; the API image pins `node:22-alpine`) |
| SPA fallback | `/*` → `/index.html` (200) |
| Headers | no-cache for `index.html` / `config.js` / `sw.js`, plus `nosniff`, `SAMEORIGIN`, referrer policy |

Steps:

1. Netlify → **Add new site → Import an existing project** → pick the repo.
2. Leave the build settings as detected — `netlify.toml` overrides them.
3. Add `VITE_API_URL` (§2A) **before** the first deploy — a production build
   without it now fails rather than publishing an empty shell. Add
   `SAMITY_ALLOW_UNCONFIGURED_API=1` instead when the address comes from
   `/config.js` or a same-origin proxy.
4. Deploy, then confirm:
   - `/` renders the login screen or the dashboard, not a red screen;
   - a deep link (e.g. `/members`) survives a hard refresh (SPA fallback);
   - DevTools → Network shows requests going to your **API host**, not to the
     Netlify domain.

`apps/web/public/_redirects` ships the same SPA rule inside the build output, so
the artifact also works on Cloudflare Pages or any host that reads `_redirects`.

---

## 4. Deploy the API (Docker)

The image is built from the repository root because `packages/shared` is a
workspace dependency of the API.

```bash
docker build -t samity-api .
docker run -d --name samity-api -p 4000:4000 \
  -e NODE_ENV=production \
  -e PORT=4000 \
  -e DEMO_MODE=auto \
  -e CORS_ORIGINS=https://YOUR-SITE.netlify.app \
  -e SUPABASE_URL=https://YOUR-PROJECT-ref.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=… \
  -e SUPABASE_JWT_SECRET=… \
  -e MEMBER_ENC_KEY=… \
  samity-api
```

Or with compose (reads `./.env`): `cp .env.example .env`, fill it in, then
`docker compose up -d --build`.

### Free hosted option: Render Blueprint

`render.yaml` at the repository root describes the same container as a Render
web service, so the API gets a public HTTPS origin without a server to look
after:

1. Render dashboard → **New → Blueprint** → connect this repository → **Apply**.
   Render builds `./Dockerfile` at the repo root, injects `PORT` (the container
   already listens on it), probes `/api/v1/health` and sets `NODE_ENV`,
   `DEMO_MODE`, `CORS_ORIGINS` and a generated `MEMBER_ENC_KEY`.
2. Point the client at the service URL **plus `/api/v1`** —
   `https://samity-api.onrender.com/api/v1` — using §2A (rebuild) or §2B
   (`/config.js`, no rebuild).
3. If the web site is not `samity-manager.netlify.app`, put its origin in
   `CORS_ORIGINS` and redeploy the API.

The blueprint ships `DEMO_MODE=force`: sample data held in memory, no database,
and nothing real can leak. To serve the real project instead, uncomment the
`SUPABASE_*` entries, switch `DEMO_MODE` to `auto`, and enter the values in the
dashboard (`sync: false` keeps them out of the repo).

Two free-plan behaviours are worth knowing. The instance **sleeps after ~15
minutes of inactivity**, and the first request afterwards waits while it boots —
the browser client retries once for exactly this and says so if it still fails.
The filesystem is also **ephemeral**: irrelevant for `force` mode, but a live
deployment belongs on a paid instance.

#### Keeping it awake (and monitored)

`.github/workflows/keep-alive.yml` runs `scripts/keep-alive.sh` every 10 minutes —
comfortably inside that idle timer — so the deployed site never waits for a cold
start. The same run is the uptime check from `docs/go-live.md` §5: an API that is
unreachable, or that answers 200 with something other than samity-api's health
payload, fails the run. Each run also records a sample on the public status page
(§9), which is where its uptime history comes from.

- The script defaults to `https://samity-api.onrender.com/api/v1/health` — the
  service name `render.yaml` assigns. If Render gave the service a different
  subdomain, or the API lives elsewhere, add a repository **variable**
  (Settings → Secrets and variables → Actions → Variables → New repository
  variable) named `API_HEALTH_URL` with the health URL (a bare API base works too;
  `/health` is appended).
- It is free on this repository because it is **public** (GitHub-hosted minutes
  are unmetered). On a private repo the same cadence would consume ~4,300 of the
  2,000 monthly free minutes, so use an external monitor, or an entry in any
  always-on machine's crontab, instead:
  `*/10 * * * * /path/to/scripts/keep-alive.sh`
- A schedule only fires from the **default branch** (`main`): a copy on a feature
  branch never runs on a timer, and neither does an unpushed repository.
- GitHub delays scheduled runs under load and **disables them after 60 days
  without repository activity**, so keep an external monitor as the belt to this
  braces for a production deployment.

### Environment variables

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `NODE_ENV` | yes | `production` — enables the strict CORS allow-list |
| `PORT` | yes | The port the container listens on (default `4000`) |
| `CORS_ORIGINS` | **yes** | Comma-separated browser origins, **no trailing slash**, e.g. `https://your-site.netlify.app` |
| `DEMO_MODE` | no | `auto` (default), `force`, `off` — see §5 |
| `SUPABASE_URL` | live only | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | live only | **service_role** secret, not the anon key |
| `SUPABASE_JWT_SECRET` | live only | Verifies legacy HS256 tokens; ES256 tokens use JWKS instead |
| `MEMBER_ENC_KEY` | yes | Master key for NID/birth-registration encryption — any secret of 8+ chars works (a 32-byte base64 value is the recommended shape; a host-generated random secret is fine). **Changing it later makes existing member fields unreadable.** |
| `LOG_LEVEL` | no | `info` by default |

### Deploy checklist

1. The container is reachable and healthy:
   `curl -fsS https://YOUR-API-HOST/api/v1/health`
   → `{"status":"ok","service":"samity-api","mode":"live",…}`
   (`mode` is `demo` when it is serving sample data.)
2. `CORS_ORIGINS` contains the **exact** origin of the deployed client
   (`https://x.netlify.app` and `https://x.netlify.app/` are not the same).
3. The health endpoint is wired to an uptime monitor — the `API keep-alive`
   workflow above, or an external one (see `docs/go-live.md` §5).
4. The boot log is checked once: it prints the data mode, the CORS allow-list,
   and warns loudly if the service-role slot contains the **anon** key (which
   makes every read return 0 rows) or if `CORS_ORIGINS` is still loopback-only.

---

## 5. Demo mode vs live mode

`DEMO_MODE` decides where the API's data comes from:

| Value | Behaviour | Use for |
| ----- | --------- | ------- |
| `auto` *(default)* | Sample data until real Supabase credentials are present, live data afterwards | Staging, dev |
| `force` | Always the in-memory sample store. **No database, no Supabase keys needed** | A public sales demo |
| `off` | Live only. The API **refuses to boot** while the Supabase values are placeholders, so a production deploy can never silently show fake data | Production |

A zero-infrastructure public demo:

```bash
docker run -d -p 4000:4000 \
  -e NODE_ENV=production -e DEMO_MODE=force \
  -e CORS_ORIGINS=https://YOUR-SITE.netlify.app \
  samity-api
```

The in-memory store resets on restart and is not shared between instances —
never treat it as storage.

---

## 6. Database

```bash
# one-off, from a machine that can reach the database
SUPABASE_DB='postgresql://…' npm run db:migrate
SUPABASE_DB='postgresql://…' npm run db:seed     # dev only — never prod
```

For a **live** deployment that already has real members, do **not** run the
demo seed. `supabase/demo-seed-full.sql` (SQL editor) loads the sample dataset
plus the `admin@samity.test / Samity@2026` login for demos and staging only.
See `docs/demo-data.md`.

---

## 7. Verify the deployment end to end

```bash
# 1. API is up and reports its mode
curl -fsS https://YOUR-API-HOST/api/v1/health

# 2. CORS allows your client origin (expect Access-Control-Allow-Origin back)
curl -s -D - -o /dev/null -H "Origin: https://YOUR-SITE.netlify.app" \
  https://YOUR-API-HOST/api/v1/health | grep -i access-control-allow-origin

# 3. A foreign origin is NOT allowed (expect no header)
curl -s -D - -o /dev/null -H "Origin: https://evil.example" \
  https://YOUR-API-HOST/api/v1/health | grep -i access-control-allow-origin || echo "blocked ✔"

# 4. Authenticated data flows
curl -fsS -H "Authorization: Bearer <access token>" \
  https://YOUR-API-HOST/api/v1/members?pageSize=1
```

Then in the browser: sign in, open the dashboard, and confirm the KPI numbers
match the database. A red *"Cannot reach the API server"* screen means §2 is
still unfinished; an empty dashboard with a 200 API means the credentials in
step 4 of §4 are wrong (most often the anon key in the service-role slot).

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| Red *"Cannot reach the API server"*, source = *same-origin default* | `VITE_API_URL` was never set for the build | §2A (or §2B for no rebuild) |
| Red screen, source = *this browser (localStorage)* | A browser override set from the red screen is shadowing the deployment's address | Clear it on that screen |
| Red screen, `Timed out after 45s` after a quiet period | Free-tier instance was asleep and is still booting | Retry; the keep-alive workflow (§4) prevents it |
| Deploy fails: *"production build without an API address"* | The static-host build guard | Set `VITE_API_URL` (§2A), or `SAMITY_ALLOW_UNCONFIGURED_API=1` if `/config.js` or a proxy supplies the address |
| Status page red while the API answers fine elsewhere | The page probes its own configured API host | Check `apiBaseUrl` in §9, and the `API_BASE_URL` Worker variable |
| Status page shows *no data* for hours | No samples: the keep-alive workflow is disabled (60 days idle) or was never wired in | §9, step 2–3 |
| Console shows `404`/HTML for `/api/v1/…` on the site's own domain | Same as above — the static host is answering | §2A |
| `CORS` error in the console, API healthy | Deployed origin missing from `CORS_ORIGINS` | Add the exact origin, restart the API |
| Login succeeds but every table is empty | **anon** key in the service-role slot (RLS blocks it) | Paste the `service_role` key; the boot log warns about this |
| `401 Invalid or expired token` | `SUPABASE_JWT_SECRET` mismatch, or the client holds a stale session | Fix the secret, then sign in again |
| Deep links 404 on refresh | SPA fallback not applied | `netlify.toml` must be at the repo root; `publish` must be `apps/web/dist` |
| Container starts then exits | Boot-time validation failed (watch the log line) | Fix the reported variable — the API never starts with invalid config |

---

## 9. Public status page (uptime history)

`status/` is a small Worker that answers "is the API up?" for anyone with the
link, with real history rather than one instantaneous probe:

| Route | What it does |
| ----- | ------------ |
| `GET /` | the page: current state, 24h/7d uptime, and a 48-hour strip of 30-minute buckets |
| `GET /status` | the same data as JSON (public, read-only, `no-store`) |
| `POST /ingest` | appends one sample; requires `STATUS_INGEST_TOKEN`, and is **disabled** (503) when no token is configured |

Deployed as the Freebuff Sites project **Samity API Status** — preview
`https://site-3ad39ce4749841978f30f449ffa47559.freebuff.page`, production a separate
deploy of the same Worker. Storage is that project's D1 database (binding `DB`);
the table is created on first use and samples are pruned after 30 days.

In the 48-hour strip the colour is the verdict and the bar height is how many
samples that 30-minute window actually holds (3 = full at the cadence), so a
window nobody watched cannot look like a monitored one; the strip also carries an
`aria-label` with the same counts, because colour alone is not readable. Two
states are drawn apart from an ordinary bar. A window holding no sample at all is
hatched: that is not "state unknown", it is this page's own absence. A window
holding only page visits is hatched *over* its verdict colour: this page answered
the request while the scheduled workflow did not sample, which must not pass for
a watched window either. The one state is not claimed for the window the clock is
still inside, because a run may yet arrive in it.

**Watching the watcher.** Samples are written by this page's own server, so a
hosting flap does not store a wrong row — it stores no row at all, and an absent
row used to read as "nothing to report". Worse, `ok/total` over stored samples
gets *better* the fewer there are: nine hours of downtime shrinks the denominator
and can only raise the percentage. So `/status` reports its own coverage too:

| Field | Meaning |
| ----- | ------- |
| `observation.windows.last24h` / `.last7d` | `expected` samples at the workflow's cadence, `scheduled`, `visits`, `stored` (`scheduled + visits`), `coveragePct`, `gapCount`, `longestGapMs`, `unobservedMs`, `scheduleGapCount`, `scheduleUnobservedMs` |
| `observation.gaps[]` | intervals with no sample *of any kind* — `fromTs`, `toTs`, `durationMs`, `missing`, `open` (newest first, capped at 20) |
| `observation.openGap` | a blind spot that has not ended: samples stopped and have not resumed |
| `observation.schedule` | the workflow's own record — `lastSampleTs`, `ageMs`, `stale`, `gaps[]` (each with the `visits` that landed inside it), `openGap` |
| `observation.cadenceMs` / `.gapThresholdMs` | 10 minutes, and the 25-minute floor below which a gap cannot be told from a late run |

The page turns that into a scheduled-coverage figure beside the uptime ones
("scheduled 24h", `scheduled/expected`) plus the age of the workflow's last sample,
a banner naming the recent gaps with the cause each one supports, and the two
hatched bar states.

**Two observers, and only one of them is a promise.** The workflow samples on a
clock; a visit samples when somebody happens to have the page open. Counting both
into one "watched" total is how a tab left open overnight reports a dead workflow
as a perfectly watched window — the visits keep the timeline full, so coverage
saturates and no gap ever forms. So `coveragePct` counts `scheduled` samples alone
against the promise, visits are reported beside it, and `observation.schedule` is
derived from the workflow's samples only. A tab can raise `visits` and nothing
else.

**What this can and cannot say.** A hole in the timeline has two possible causes,
and they separate only when the hole is not total:

- **Visits inside the hole.** The page answered while runs were due and none
  arrived, so the missing observer was the workflow, and the banner says so. (A
  sample on the trailing edge does not count as being inside it — that is this
  request's own probe, and the hole keeps its ambiguity, which the page collapses
  into one item rather than listing twice.)
- **No sample at all in the hole.** Genuinely ambiguous: the page's own host was
  unreachable, or the workflow was absent and nobody was looking. An unreachable
  host takes both writers out at once, so nothing stored can distinguish them.
  The run log is the adjudicator — `scripts/keep-alive.sh` retries a rejected
  sample and, when it finally cannot deliver one, prints a `::warning` annotation
  recording that the ping ran and the page did not answer, which rules the
  workflow out. It never fails the run: a red X on that workflow has to mean the
  API is unwell, and mixing the two would make neither trustworthy.

The API's state during a gap is unknown, so the uptime percentages speak only for
the time actually observed.

**Where the samples come from.** Two independent sources, so the history stays
complete and honest. Neither can be relabelled as the other: the sample's source
is set by the route that stored it, and only the token-gated `/ingest` writes
`workflow`.

1. `.github/workflows/keep-alive.yml` records one sample per run (every 10
   minutes), through the reporting block in `scripts/keep-alive.sh`;
2. any visit to the page re-probes when the newest sample is older than 60
   seconds, so a visitor never sees a stale verdict and the API is never hit
   more than once a minute.

History lives in the status page's own database rather than in the API, so an
API outage cannot erase the record of that outage. The host it watches is the
Worker's `API_BASE_URL` variable (set it like any other Sites secret); it
defaults to the `https://samity-api.onrender.com/api/v1` that `render.yaml`
assigns, and `GET /status` always reports the resolved `apiBaseUrl`.

**Wiring the workflow in** (optional: without it the page still works, but it is
only sampled while someone is looking):

1. Generate a token — `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
   — keep it in a file that git ignores (this project keeps one at
   `.freebuff/status-ingest-token.txt`) and register it as the Worker secret
   `STATUS_INGEST_TOKEN`.
2. In GitHub: **Settings → Secrets and variables → Actions** → variable
   `STATUS_INGEST_URL` = `<status-page-url>/ingest`, secret
   `STATUS_INGEST_TOKEN` = the same value.
3. Run the `API keep-alive` workflow once by hand (`workflow_dispatch`) and check
   the log says `→ status page sample stored (HTTP 201)`.

**Redeploying** after a change to `status/worker.js` or `status/public/`: deploy
`status/` (manifest `status/manifest.json`) to the same Sites project — one ES
module plus static assets, no build step and no dependencies.

Tests: `node --test status/worker.test.mjs scripts/keep-alive.test.mjs` — a
stubbed D1 and fetch plus a local stub API, no network. The gap, coverage,
source-split and hatched-bar tests are the ones that keep a hosting flap from
reading as uptime and a dead cron from reading as a watched window. Some of them
execute the page's own script against a real `/status` payload through a small DOM
shim, because two defects found here — bars collapsed to zero height, and a class
name that inflated every hatched bar — passed every text assertion and existed
only once the page had run. One of those shim tests pins the clock: all the
timestamps are the server's, so the page measures them against the server's clock
(`checkedAt`) rather than the visitor's, which a wrong device clock would otherwise
turn into `0s ago` for a four-hour-old sample. This covers
the uptime half of `docs/go-live.md` §5 and of backlog P1-3; the
error-monitoring half (Sentry or a log drain) is still open, as is an observer
outside this stack — for a hole with not one sample in it, nothing here can tell
the page's own outage from a workflow that never ran. Until §4 is done the API does not exist, so the page is expected
to be **red** — with the reason shown, which is the point of it.
