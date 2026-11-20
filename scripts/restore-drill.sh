#!/usr/bin/env bash
# NFR-17 — an executable restore drill.
#
# Takes a real dump of the local database, restores it into a scratch database,
# compares the counts the runbook names, and runs the full pgTAP suite against
# the restored copy. The scratch database is dropped afterwards.
#
# `--fresh` resets the local stack first, so the drill starts from the seed
# rather than from test residue. Use it in CI; omit it to drill the current
# working database.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

fresh=""
if [ "${1:-}" = "--fresh" ]; then fresh=1; fi

if ! npx supabase status >/dev/null 2>&1; then
  echo "restore-drill: the local Supabase stack is required" >&2
  exit 1
fi

if [ -n "$fresh" ]; then
  echo "restore-drill: resetting the local database to a known seed"
  npx supabase db reset >/dev/null
fi

DB_URL="$(npx supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
URL_PARTS="$(node "$root/scripts/pg-url-parts.mjs" "$DB_URL")"
PGURL="$(printf '%s\n' "$URL_PARTS" | sed -n '1p')"
DB_PASSWORD="$(printf '%s\n' "$URL_PARTS" | sed -n '2p')"
export PGPASSWORD="$DB_PASSWORD"

scratch="kickoff_restore_drill_$$"
tmpdir="$(mktemp -d)"
started="$(date +%s)"

cleanup() {
  psql "$PGURL" -v ON_ERROR_STOP=0 -c "drop database if exists $scratch" >/dev/null 2>&1 || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT

echo "restore-drill: dumping the database"
pg_dump "$PGURL" --format=custom --no-owner --file "$tmpdir/db.dump"

echo "restore-drill: creating scratch database $scratch"
psql "$PGURL" -v ON_ERROR_STOP=1 -c "drop database if exists $scratch" >/dev/null
psql "$PGURL" -v ON_ERROR_STOP=1 -c "create database $scratch template template0" >/dev/null
SCRATCH_PGURL="${PGURL/dbname=postgres/dbname=$scratch}"

echo "restore-drill: restoring the dump"
# Restoring into a fresh database still reports a few ignorable notices; the
# count comparison below is what proves the restore, not pg_restore's exit.
pg_restore --dbname "$SCRATCH_PGURL" --no-owner "$tmpdir/db.dump" \
  >"$tmpdir/restore.log" 2>&1 || true

query_counts() {
  psql "$1" -Atc "select
    (select count(*) from public.profiles) || ',' ||
    (select count(*) from public.orders) || ',' ||
    (select count(*) from public.tickets) || ',' ||
    (select count(*) from public.audit_logs)"
}

source_counts="$(query_counts "$PGURL")"
restored_counts="$(query_counts "$SCRATCH_PGURL")"
if [ "$source_counts" != "$restored_counts" ]; then
  echo "restore-drill: count mismatch — source=$source_counts restored=$restored_counts" >&2
  tail -30 "$tmpdir/restore.log" >&2
  exit 1
fi

echo "restore-drill: counts match ($restored_counts)"

psql "$SCRATCH_PGURL" -v ON_ERROR_STOP=1 \
  -c "create extension if not exists pgtap; create extension if not exists dblink;" >/dev/null

echo "restore-drill: running the pgTAP suite against the restored database"
# `pg_cron` can only live in the cluster's configured database, so the
# observability suite's job assertions cannot run in a scratch database. The
# cron jobs themselves are migration-owned and re-created on the target.
if ! KICKOFF_PGTAP_DB_URL="$SCRATCH_PGURL" PGPASSWORD="$DB_PASSWORD" \
  KICKOFF_PGTAP_SKIP='observability\.test\.sql' \
  KICKOFF_PGTAP_SKIP_REASON='pg_cron is cluster-database-bound; jobs are migration-owned' \
  bash scripts/run-pgtap.sh >"$tmpdir/pgtap.log" 2>&1; then
  echo "restore-drill: the restored database failed pgTAP" >&2
  grep -E "not ok|ERROR|Failed test|──" "$tmpdir/pgtap.log" >&2 || tail -120 "$tmpdir/pgtap.log" >&2
  exit 1
fi

elapsed="$(( $(date +%s) - started ))"
if [ "$elapsed" -gt 14400 ]; then
  echo "restore-drill: RTO exceeded — ${elapsed}s > 4h" >&2
  exit 1
fi

echo "restore-drill: PASS ${elapsed}s (RTO target 4h) — counts $restored_counts; pgTAP green (observability suite skipped: pg_cron is cluster-bound)"
echo "restore-drill: record this result in the quarterly release ticket (RPO is the managed backup schedule, <= 24h)"
