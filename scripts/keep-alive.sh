#!/usr/bin/env bash
# ── Samity Manager — API keep-alive ping ─────────────────────────────────────
# Pings the deployed API's health endpoint on a schedule so a free-tier host
# stays warm. Render (and similar hosts) stop the instance after ~15 minutes
# without traffic and hold the next request while it boots, so without this the
# first visitor after a quiet period waits ~a minute for the dashboard.
#
# The same run is the uptime check from docs/go-live.md §5: an unreachable host,
# a non-200 response, or a 200 whose body is not samity-api's health payload
# (the signature of a static host answering for the API) exits non-zero and
# turns the GitHub Actions run red.
#
# Schedule:
#   cron:    */10 * * * *  /path/to/scripts/keep-alive.sh >> /var/log/samity-keepalive.log 2>&1
#   Actions: see .github/workflows/keep-alive.yml
#
# Target (first one that is set wins):
#   $1 or API_HEALTH_URL  the API, with or without the /api/v1/health suffix
#   default               https://samity-api.onrender.com/api/v1/health
#
# Options:
#   --attempts N   total attempts, default 3 — a sleeping instance often takes
#                  ~a minute to answer, so a later attempt is what succeeds
#   --timeout S    per-attempt timeout in seconds, default 60
#
# Status-page reporting (optional, best-effort — never changes the exit code):
#   STATUS_INGEST_URL     POST endpoint of the status page, e.g. https://x/ingest
#   STATUS_INGEST_TOKEN   bearer token it expects (Worker secret + GitHub secret)
#   --report-url URL / --report-token TOKEN   the same two values as flags
#   --report-attempts N   report tries before giving up, default 2
#
# A sample that cannot be delivered is retried, and on final failure the run
# says so with a GitHub warning annotation. No status page can record its own
# absence, so this log is where "the page was down" is settled against "the ping
# never ran" — the page itself can only report the gap (docs/deploy.md §9).
#
# Exit codes: 0 pinged, 1 the API did not answer like samity-api, 2 usage error.
set -euo pipefail

ATTEMPTS=3
TIMEOUT=60
RETRY_DELAY=5
REPORT_ATTEMPTS=2
REPORT_RETRY_DELAY=5
URL=""
REPORT_URL=""
REPORT_TOKEN=""

while [ $# -gt 0 ]; do
  case "$1" in
    --attempts) ATTEMPTS="${2:?--attempts needs a value}" ; shift 2 ;;
    --attempts=*) ATTEMPTS="${1#*=}" ; shift ;;
    --timeout) TIMEOUT="${2:?--timeout needs a value}" ; shift 2 ;;
    --timeout=*) TIMEOUT="${1#*=}" ; shift ;;
    --report-url) REPORT_URL="${2:?--report-url needs a value}" ; shift 2 ;;
    --report-url=*) REPORT_URL="${1#*=}" ; shift ;;
    --report-token) REPORT_TOKEN="${2:?--report-token needs a value}" ; shift 2 ;;
    --report-token=*) REPORT_TOKEN="${1#*=}" ; shift ;;
    --report-attempts) REPORT_ATTEMPTS="${2:?--report-attempts needs a value}" ; shift 2 ;;
    --report-attempts=*) REPORT_ATTEMPTS="${1#*=}" ; shift ;;
    -h|--help) awk 'NR==1{next} /^set -euo pipefail/{exit} {print}' "$0"; exit 0 ;;
    -*) echo "✗ unknown option: $1 (try --help)" >&2 ; exit 2 ;;
    *) URL="$1" ; shift ;;
  esac
done

for pair in "attempts:$ATTEMPTS" "timeout:$TIMEOUT" "report-attempts:$REPORT_ATTEMPTS"; do
  name="${pair%%:*}"; value="${pair#*:}"
  case "$value" in
    ''|*[!0-9]*) echo "✗ --$name must be a positive integer (got '$value')" >&2 ; exit 2 ;;
  esac
  [ "$value" -gt 0 ] || { echo "✗ --$name must be greater than 0" >&2 ; exit 2 ; }
done

URL="${URL:-${API_HEALTH_URL:-https://samity-api.onrender.com/api/v1/health}}"
# Accept a bare API base as well: "${base}/health" is what the app itself probes,
# and a base-only value would otherwise 404 on every run.
URL="${URL%/}"
case "$URL" in
  http://*|https://*) ;;
  *) echo "✗ not an http(s) URL: '$URL'" >&2 ; exit 2 ;;
esac
case "$URL" in
  */health) ;;
  *) URL="$URL/health" ;;
esac

REPORT_URL="${REPORT_URL:-${STATUS_INGEST_URL:-}}"
REPORT_TOKEN="${REPORT_TOKEN:-${STATUS_INGEST_TOKEN:-}}"

# ── Status-page reporting ────────────────────────────────────────────────────
# One sample per run, so the public status page has gap-free history even when
# nobody visits it. A rejected sample is a warning, never a failed ping: the
# API's health is what this script's exit code means.
report_sample() { # ok status latency_ms mode
  [ -n "$REPORT_URL" ] || return 0
  local ok="$1" status="$2" latency="$3" mode_json=null payload response auth=() attempt=1
  # curl's "000" placeholder (no HTTP response at all) is not valid JSON and
  # would make the worker reject the whole sample, so anything that is not a
  # real status code becomes 0 — which is how "the API did not answer" is stored.
  case "$status" in ''|*[!0-9]*) status=0 ;; esac
  [ "$status" -gt 0 ] || status=0
  case "$latency" in ''|*[!0-9]*) latency=0 ;; esac
  [ -n "$4" ] && mode_json="\"$4\""
  [ -n "$REPORT_TOKEN" ] && auth=(-H "Authorization: Bearer $REPORT_TOKEN")
  payload=$(printf '{"ts":%s000,"ok":%s,"status":%s,"latencyMs":%s,"mode":%s}' \
    "$(date -u +%s)" "$ok" "$status" "$latency" "$mode_json")
  # Retried because one lost sample is a 10-minute hole in the page's history,
  # and the difference between a blip and an outage is a few seconds.
  while [ "$attempt" -le "$REPORT_ATTEMPTS" ]; do
    if response=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' -X POST \
      -H 'content-type: application/json' ${auth[@]+"${auth[@]}"} -d "$payload" "$REPORT_URL" 2>&1); then
      case "$response" in
        2*) echo "→ status page sample stored (HTTP $response)" ; return 0 ;;
        *) echo "⚠ status page rejected the sample (HTTP $response), attempt $attempt/$REPORT_ATTEMPTS" >&2 ;;
      esac
    else
      echo "⚠ status page unreachable ($response), attempt $attempt/$REPORT_ATTEMPTS" >&2
    fi
    attempt=$((attempt + 1))
    [ "$attempt" -le "$REPORT_ATTEMPTS" ] && sleep "$REPORT_RETRY_DELAY"
  done
  echo "⚠ no sample stored for this run — the status page will show it as a blind spot, not as downtime" >&2
  # An annotation rather than a failure: this run's red X means the API is
  # unwell, and mixing the two would make neither trustworthy.
  echo "::warning title=Status page sample lost::No sample was stored at $(date -u +%Y-%m-%dT%H:%MZ) (HTTP ${response}). The ping ran, so if it succeeded above the status page itself was unreachable; check status/ and docs/deploy.md §9."
  return 0
}

echo "→ keep-alive: $URL (up to $ATTEMPTS attempts, ${TIMEOUT}s each, $(date -u +%Y-%m-%dT%H:%M:%SZ))"
[ -n "$REPORT_URL" ] && echo "→ status page: $REPORT_URL"
STARTED_AT=$(date -u +%s)
LAST_STATUS=0
LAST_LATENCY=0
LAST_MODE=""

attempt=1
while [ "$attempt" -le "$ATTEMPTS" ]; do
  body="$(mktemp)"
  errtxt="$(mktemp)"
  attempt_started=$(date -u +%s)
  attempt_started_ms=$(date -u +%s%3N)

  # `|| true` keeps a connection failure (curl exits 7) inside the substitution
  # instead of aborting the script under set -e; an empty code means no HTTP.
  code="$( { curl -sS --max-time "$TIMEOUT" -o "$body" -w '%{http_code}' \
    -H 'Accept: application/json' "$URL" 2>"$errtxt"; } || true )"
  [ -n "$code" ] || code=000
  elapsed=$(( $(date -u +%s) - attempt_started ))
  LAST_LATENCY=$(( $(date -u +%s%3N) - attempt_started_ms ))
  [ "$LAST_LATENCY" -ge 0 ] 2>/dev/null || LAST_LATENCY=0
  LAST_STATUS="$code"
  # The health body carries the data mode, which the status page shows. Absent
  # on any non-samity-api answer, hence the empty default.
  LAST_MODE=$(head -c 200 "$body" | sed -nE 's/.*"mode"[[:space:]]*:[[:space:]]*"([a-z]+)".*/\1/p')

  if [ "$code" = "200" ] && grep -q '"service"[[:space:]]*:[[:space:]]*"samity-api"' "$body"; then
    echo "✓ attempt $attempt/$ATTEMPTS: HTTP 200 in ${elapsed}s — $(head -c 160 "$body")"
    echo "✓ keep-alive OK after $(( $(date -u +%s) - STARTED_AT ))s total"
    rm -f "$body" "$errtxt"
    report_sample true "$LAST_STATUS" "$LAST_LATENCY" "$LAST_MODE"
    exit 0
  fi

  if [ "$code" = "200" ]; then
    echo "✗ attempt $attempt/$ATTEMPTS: HTTP 200 but the body is not samity-api's health payload (${elapsed}s)" >&2
    echo "  body: $(head -c 160 "$body")" >&2
    echo "  A static host answers 200 with index.html for unknown paths — check that API_HEALTH_URL points at the API, not the web site." >&2
  elif [ "$code" = "000" ]; then
    echo "✗ attempt $attempt/$ATTEMPTS: no response within ${TIMEOUT}s (${elapsed}s elapsed) — $(head -c 200 "$errtxt")" >&2
  else
    echo "✗ attempt $attempt/$ATTEMPTS: HTTP $code in ${elapsed}s" >&2
  fi

  rm -f "$body" "$errtxt"
  attempt=$((attempt + 1))
  [ "$attempt" -le "$ATTEMPTS" ] && sleep "$RETRY_DELAY"
done

report_sample false "$LAST_STATUS" "$LAST_LATENCY" "$LAST_MODE"

echo "✗ keep-alive FAILED after $ATTEMPTS attempts ($(( $(date -u +%s) - STARTED_AT ))s): $URL" >&2
echo "  Check docs/deploy.md §4: the API service is running, /api/v1/health returns {\"service\":\"samity-api\"}," >&2
echo "  and this host/URL is the deployed API rather than the static web site." >&2
exit 1
