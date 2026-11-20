#!/usr/bin/env bash
# Run the opt-in Edge Function integration suites against the local Supabase
# stack, with a local Stripe stub.
#
# These tests used to run only when RUN_INTEGRATION=1 and a hosted project's
# secrets were supplied, so the default pipeline never proved checkout,
# webhooks, scanning, undo or refunds. This script makes that path local and
# deterministic: CI runs it on every push.
#
# Requirements: Docker (for `supabase start`), Deno, Node and `curl`.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

stub_port="${STRIPE_STUB_PORT:-12111}"
webhook_secret="whsec_local_integration_only"

tmpdir="$(mktemp -d)"
stub_pid=""
push_stub_pid=""
push_port="${PUSH_STUB_PORT:-12112}"
functions_pid=""

cleanup() {
  status=$?
  if [ "$status" -ne 0 ] && [ -f "$tmpdir/functions.log" ]; then
    echo "integration: Edge Function log (last 80 lines)" >&2
    tail -80 "$tmpdir/functions.log" >&2 || true
  fi
  [ -n "$functions_pid" ] && kill "$functions_pid" 2>/dev/null || true
  [ "$stub_pid" = "docker" ] && docker rm -f kickoff-stripe-stub >/dev/null 2>&1 || true
  [ "$push_stub_pid" = "docker" ] && docker rm -f kickoff-push-stub >/dev/null 2>&1 || true
  rm -rf "$tmpdir"
}
trap cleanup EXIT

echo "integration: starting the local Supabase stack"
npx supabase start >/dev/null

# A deterministic database: leftovers from a previous failed run (holds, used
# passes, refunded orders) must not change what these tests prove.
echo "integration: resetting the local database"
npx supabase db reset >/dev/null

# `supabase status -o env` prints shell-safe KEY="value" assignments.
set -a
# shellcheck disable=SC1090
eval "$(npx supabase status -o env 2>/dev/null | grep -E '^[A-Z0-9_]+=')"
set +a

api_url="${API_URL:?API_URL missing from supabase status}"
anon_key="${ANON_KEY:?ANON_KEY missing from supabase status}"
service_key="${SERVICE_ROLE_KEY:?SERVICE_ROLE_KEY missing from supabase status}"

# The Edge runtime is a container, so the stub must live on the same Docker
# network. It is reachable by name (`stripe-stub`) from the functions; the
# loopback publish is only for this script's readiness check.
stub_image="${STRIPE_STUB_IMAGE:-node:22-alpine}"
docker rm -f kickoff-stripe-stub >/dev/null 2>&1 || true
echo "integration: starting the Stripe stub container"
docker run --rm -d \
  --name kickoff-stripe-stub \
  --network supabase_network_kickoff \
  -p "127.0.0.1:$stub_port:12111" \
  -v "$root/scripts/stripe-stub.mjs:/app/stripe-stub.mjs:ro" \
  -e STRIPE_STUB_PORT=12111 \
  "$stub_image" node /app/stripe-stub.mjs >/dev/null
stub_pid="docker"
stub_ip="$(docker inspect kickoff-stripe-stub \
  --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
if [ -z "$stub_ip" ]; then
  echo "integration: could not read the Stripe stub's address" >&2
  exit 1
fi

# Wait for the stub before the Edge Functions make their first call.
stub_ready=""
for _ in $(seq 1 30); do
  if curl -s -o /dev/null "http://127.0.0.1:$stub_port/" 2>/dev/null; then stub_ready=1; break; fi
  sleep 1
done
if [ -z "$stub_ready" ]; then
  echo "integration: the Stripe stub did not become ready" >&2
  docker logs kickoff-stripe-stub >&2 || true
  exit 1
fi

docker rm -f kickoff-push-stub >/dev/null 2>&1 || true
echo "integration: starting the Expo push stub container"
docker run --rm -d \
  --name kickoff-push-stub \
  --network supabase_network_kickoff \
  -p "127.0.0.1:$push_port:12112" \
  -v "$root/scripts/push-stub.mjs:/app/push-stub.mjs:ro" \
  -e PUSH_STUB_PORT=12112 \
  node:22-alpine node /app/push-stub.mjs >/dev/null
push_stub_pid="docker"
push_ip="$(docker inspect kickoff-push-stub \
  --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')"
if [ -z "$push_ip" ]; then
  echo "integration: could not read the push stub's address" >&2
  exit 1
fi
for _ in $(seq 1 30); do
  curl -s -o /dev/null "http://127.0.0.1:$push_port/__batches" && break
  sleep 1
done

cat >"$tmpdir/functions.env" <<EOF
SUPABASE_URL=$api_url
SUPABASE_ANON_KEY=$anon_key
SUPABASE_SERVICE_ROLE_KEY=$service_key
STRIPE_SECRET_KEY=sk_test_local_integration
STRIPE_WEBHOOK_SECRET=$webhook_secret
STRIPE_API_BASE=http://$stub_ip:12111
EXPO_PUSH_URL=http://$push_ip:12112/--/api/v2/push/send
TICKET_HMAC_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
METRICS_TOKEN=local-integration-metrics-token
ADMIN_APP_URL=http://localhost:3000
MOBILE_DEEP_LINK=kickoff://
EOF

echo "integration: serving Edge Functions"
npx supabase functions serve --env-file "$tmpdir/functions.env" >"$tmpdir/functions.log" 2>&1 &
functions_pid=$!

ready=""
for _ in $(seq 1 90); do
  if curl -sf "$api_url/functions/v1/health" >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
if [ -z "$ready" ]; then
  echo "integration: the Edge runtime did not become ready" >&2
  cat "$tmpdir/functions.log" >&2
  exit 1
fi

# The first request to each function compiles its module graph. A cold
# compile can outrun the gateway timeout and surface as a 502 in the first
# test, so warm every function the suites use and ignore the auth result.
echo "integration: warming the Edge Functions"
for fn in stripe-checkout stripe-webhook scan-ticket scan-undo ticket-qr receipt refund-order delete-account send-kickoff-reminders; do
  curl -s -o /dev/null -X POST "$api_url/functions/v1/$fn" \
    -H "apikey: $anon_key" \
    -H "content-type: application/json" \
    --data '{}' || true
done

echo "integration: seeding the demo fan and admin"
SUPABASE_URL="$api_url" \
SUPABASE_SERVICE_ROLE_KEY="$service_key" \
DEMO_EMAIL="fan@kickoff.app" \
DEMO_PASSWORD="kickoffdemo" \
ADMIN_DEMO_EMAIL="admin@kickoff.app" \
ADMIN_DEMO_PASSWORD="kickoffadmin" \
node scripts/seed-demo.mjs

# The checked-in seed dates the demo fixtures in the past; sales stop at the
# whistle. Move the two fixtures the suites buy from into the future so the
# run is independent of the calendar.
kickoff="$(node -e 'console.log(new Date(Date.now() + 3 * 864e5).toISOString())')"
curl -sS -X PATCH "$api_url/rest/v1/matches?id=in.(m-bkk,m-cmi)" \
  -H "apikey: $service_key" \
  -H "authorization: Bearer $service_key" \
  -H "content-type: application/json" \
  -H "prefer: return=minimal" \
  -d "{\"kickoff_at\":\"$kickoff\"}" >/dev/null

# Rate limits are per client IP and survive the DB reset seed; clear them so
# the suites do not depend on how many checkout calls ran in the last minute.
curl -sS -X DELETE "$api_url/rest/v1/rate_limits?key=neq.__never__" \
  -H "apikey: $service_key" \
  -H "authorization: Bearer $service_key" >/dev/null || true

# NFR-13: the seat-map query budget at the seeded seat count.
SUPABASE_URL="$api_url" \
SUPABASE_SERVICE_ROLE_KEY="$service_key" \
node scripts/seat-latency.mjs >/dev/null

# Exercise the scheduled probe against the running stack before the suites.
SUPABASE_URL="$api_url" \
SUPABASE_SERVICE_ROLE_KEY="$service_key" \
METRICS_TOKEN="local-integration-metrics-token" \
node scripts/availability-probe.mjs >/dev/null

echo "integration: running the Edge Function suites"
export RUN_INTEGRATION=1
export SUPABASE_URL="$api_url"
export SUPABASE_ANON_KEY="$anon_key"
export SUPABASE_SERVICE_ROLE_KEY="$service_key"
export STRIPE_WEBHOOK_SECRET="$webhook_secret"
export DEMO_EMAIL="fan@kickoff.app"
export DEMO_PASSWORD="kickoffdemo"
export ADMIN_EMAIL="admin@kickoff.app"
export ADMIN_PASSWORD="kickoffadmin"
export MAILPIT_URL="${MAILPIT_URL:-}"
export PUSH_STUB_URL="http://127.0.0.1:$push_port"
export METRICS_TOKEN="local-integration-metrics-token"

(
  cd supabase/functions
  deno test --allow-env --allow-net \
    tests/orders.test.ts \
    tests/webhook.test.ts \
    tests/scan.test.ts \
    tests/refund-order.test.ts \
    tests/account-lifecycle.test.ts \
    tests/mfa.test.ts \
    tests/fixture-admin.test.ts \
    tests/settings.test.ts \
    tests/metrics-integration.test.ts \
    tests/news-admin.test.ts \
    tests/rate-limit.test.ts \
    tests/push-delivery.test.ts \
    tests/availability.test.ts
)

echo "integration: all executed suites passed"
