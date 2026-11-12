#!/usr/bin/env bash
# Runs the pgTAP suite. Prefers the local Supabase stack (what CI uses); falls
# back to the linked hosted project when Docker is unavailable.
#
# Both paths set `kickoff.dblink_password`, which the two concurrency suites
# read to open their dblink worker sessions. The workers reconnect over the
# network, where `pg_hba` demands a SCRAM password — without it every worker
# is refused with "password or GSSAPI delegated credentials required" and the
# suites fail before their first assertion.
#
# The password is read from the environment at runtime; it is never written
# into this repository.
set -uo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

# The preamble that gives the dblink workers their password.
#
# The password is read from the environment by psql itself (`\getenv`) and
# quoted by psql (`:'name'`), so it is never interpolated into a SQL literal
# and never written to disk. A password containing a quote therefore cannot
# break the statement or inject SQL into the preamble that runs before every
# suite.
readonly PREAMBLE="\getenv dblink_password KICKOFF_DBLINK_PASSWORD
set kickoff.dblink_password = :'dblink_password';"

run_psql() {
  # $1 = extra preamble (may be empty), $2 = test file
  local preamble="$1" file="$2"
  if [ -n "$preamble" ]; then
    # The preamble is a fixed, secret-free script; the password travels in the
    # environment. The file is still kept private (umask 077 + mktemp = 0600).
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
  DB_URL="$(npx supabase status -o env 2>/dev/null | grep '^DB_URL=' | cut -d= -f2- | tr -d '"')"
  # The stack publishes its own connection URL. The password is taken out of
  # it and kept in the environment: a URL with the password in it would show
  # up in `ps` for every user on the machine.
  URL_PARTS="$(node "$root/scripts/pg-url-parts.mjs" "$DB_URL")" || {
    echo "pgtap: could not read the database password from the stack's DB_URL" >&2
    exit 1
  }
  PGURL="$(printf '%s\n' "$URL_PARTS" | sed -n '1p')"
  DB_PASSWORD="$(printf '%s\n' "$URL_PARTS" | sed -n '2p')"
  if [ -z "$DB_PASSWORD" ]; then
    echo "pgtap: could not read the database password from the stack's DB_URL" >&2
    exit 1
  fi
  export PGPASSWORD="$DB_PASSWORD"
  # The suites read the worker password from this GUC; psql picks the value up
  # from the environment.
  export KICKOFF_DBLINK_PASSWORD="$DB_PASSWORD"
else
  echo "pgtap: local stack unavailable (no Docker) — using linked hosted project"
  set -a; [ -f .env ] && . ./.env; set +a
  PGURL="host=aws-0-ap-southeast-1.pooler.supabase.com dbname=postgres user=postgres.cvebikawynavfyfbjnzu sslmode=require"
  export PGPASSWORD="${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD is required}"
  export KICKOFF_DBLINK_PASSWORD="$SUPABASE_DB_PASSWORD"
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
