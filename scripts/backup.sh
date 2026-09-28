#!/usr/bin/env bash
# ── Samity Manager — nightly database backup (Module 17, req 6) ──────────────
# Dumps the Supabase Postgres database to dated files with retention cleanup.
# Schedule with cron (free VPS) or GitHub Actions (free tier):
#
#   cron:    0 18 * * *  /path/to/samity-manager/scripts/backup.sh >> /var/log/samity-backup.log 2>&1
#   Actions: see .github/workflows/backup.yml
#
# Required environment:
#   SUPABASE_DB  postgres connection string (Session pooler URI works from CI;
#                find it under Supabase → Project Settings → Database)
#   BACKUP_DIR   optional, default ./backups
#   RETAIN_DAYS  optional, default 30
set -euo pipefail

: "${SUPABASE_DB:?SUPABASE_DB is required — never hardcode it, keep it in Infisical or the platform secret store}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/samity-$STAMP.dump"

mkdir -p "$BACKUP_DIR"

echo "→ dumping to $OUT"
pg_dump "$SUPABASE_DB" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$OUT"

# Keep sizes small on free storage: gzip the custom dump.
gzip -f "$OUT"
echo "✓ wrote $OUT.gz ($(du -h "$OUT.gz" | cut -f1))"

# Retention: delete dumps older than RETAIN_DAYS.
find "$BACKUP_DIR" -name 'samity-*.dump.gz' -mtime "+$RETAIN_DAYS" -print -delete

# ── Restore (run manually, never scheduled) ──────────────────────────────────
#   gunzip samity-YYYYMMDD-HHMMSS.dump.gz
#   pg_restore --clean --if-exists --no-owner --dbname "$SUPABASE_DB" samity-YYYYMMDD-HHMMSS.dump
#
# Monthly restore test (req 6): restore the newest dump into a THROWAWAY
# Supabase project and compare row counts:
#   psql "$TEST_DB" -c "select 'members', count(*) from members union all select 'loans', count(*) from loan_applications;"
