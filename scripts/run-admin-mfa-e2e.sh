#!/usr/bin/env bash
# MFA UI acceptance: build the admin against the local stack, enrol TOTP for
# the demo admin, start Next, and run the auth Playwright spec with E2E_MFA=1.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

tmpdir="$(mktemp -d)"

if ! npx supabase status >/dev/null 2>&1; then
  echo "mfa-e2e: the local Supabase stack is required" >&2
  exit 1
fi

set -a
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^[A-Z0-9_]+=')"
set +a

export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export NEXT_PUBLIC_FUNCTIONS_URL="$API_URL/functions/v1"
export E2E_ADMIN_EMAIL="admin@kickoff.app"
export E2E_ADMIN_PASSWORD="kickoffadmin"
export E2E_MFA=1
export PLAYWRIGHT_BASE_URL="http://127.0.0.1:3000"

echo "mfa-e2e: seeding the demo admin"
SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node scripts/seed-demo.mjs >/dev/null

echo "mfa-e2e: creating a fresh admin and enrolling TOTP"
creds="$(SUPABASE_URL="$API_URL" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" node scripts/enroll-admin-mfa.mjs)"
export E2E_ADMIN_EMAIL="$(printf '%s' "$creds" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).email))")"
export E2E_ADMIN_PASSWORD="$(printf '%s' "$creds" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).password))")"
mfa_user_id="$(printf '%s' "$creds" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).userId))")"

echo "mfa-e2e: building the admin against the local stack"
npm run build:admin >/dev/null

echo "mfa-e2e: starting Next"
(
  cd apps/admin
  npm run start >"$tmpdir/admin.log" 2>&1
) &
server_pid=$!
cleanup() {
  kill "$server_pid" 2>/dev/null || true
  curl -s -o /dev/null -X DELETE "$API_URL/auth/v1/admin/users/$mfa_user_id" \
    -H "apikey: $SERVICE_ROLE_KEY" -H "authorization: Bearer $SERVICE_ROLE_KEY" || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT

ready=""
for _ in $(seq 1 90); do
  if curl -sf "$PLAYWRIGHT_BASE_URL/login" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ -z "$ready" ]; then
  echo "mfa-e2e: the admin did not become ready" >&2
  tail -40 "$tmpdir/admin.log" >&2
  exit 1
fi

echo "mfa-e2e: running the auth spec"
(
  cd apps/admin
  npx playwright test e2e/auth.spec.ts
)

echo "mfa-e2e: PASS"
