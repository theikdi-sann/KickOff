#!/usr/bin/env bash
# Runs the pgTAP suite. Prefers the local Supabase stack (what CI uses); falls
# back to the linked hosted project when Docker is unavailable.
#
# Hosted runs set kickoff.dblink_password so the dblink concurrency tests can
# open their worker sessions (local Docker uses trust auth and needs no password).
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

run_psql() {
  # $1 = extra preamble (may be empty), $2 = test file
  local preamble="$1" file="$2"
  if [ -n "$preamble" ]; then
    # The preamble carries kickoff.dblink_password — keep it out of any
    # other user's reach (umask 077 + mktemp = 0600 file).
    local tmp
    tmp="$(umask 077 && mktemp "${TMPDIR:-/tmp}/pgtap-run.XXXXXX")" || return 1
    { echo "$preamble"; echo "\\i $file"; } > "$tmp"
    psql "$PGURL" -v ON_ERROR_STOP=1 -f "$tmp"
    local rc=$?
    rm -f "$tmp"
    return $rc
  else
    psql "$PGURL" -v ON_ERROR_STOP=1 -f "$file"
  fi
}

if npx supabase status >/dev/null 2>&1; then
  echo "pgtap: using local Supabase stack"
  PGURL="$(npx supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
  PREAMBLE=""
else
  echo "pgtap: local stack unavailable (no Docker) — using linked hosted project"
  set -a; [ -f .env ] && . ./.env; set +a
  PGURL="host=aws-0-ap-southeast-1.pooler.supabase.com dbname=postgres user=postgres.cvebikawynavfyfbjnzu sslmode=require"
  export PGPASSWORD="${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
  PREAMBLE="set kickoff.dblink_password = '${SUPABASE_DB_PASSWORD}';"
  psql "$PGURL" -v ON_ERROR_STOP=1 -c "create extension if not exists pgtap; create extension if not exists dblink;" >/dev/null
fi

fail=0
for file in supabase/tests/*.test.sql; do
  printf '── %s\n' "$file"
  out="$(run_psql "$PREAMBLE" "$file" 2>&1)"
  rc=$?
  echo "$out" | grep -E '^\s+(ok|not ok)|ERROR' || true
  if [ "$rc" -ne 0 ] || echo "$out" | grep -qE 'not ok|ERROR'; then
    echo "$out" | grep -E 'Failed test|ERROR' || true
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "pgtap: FAILED" >&2
  exit 1
fi
echo "pgtap: all suites passed"
