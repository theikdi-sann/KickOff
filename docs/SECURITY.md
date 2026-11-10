# SECURITY — KickOff

How the KickOff platform keeps supporter data, money and match passes safe.
This document is the reference for reviewers and on-call engineers; every
claim below maps to a migration, an Edge Function or a CI check in this repo.

Scope: `apps/mobile` (Expo), `apps/admin` (Next.js), `packages/shared`,
`supabase/migrations` and `supabase/functions`.

## 1. Secret handling

| Secret | Lives in | Never appears in |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `supabase/.env` (Edge Functions), CI secrets, local root `.env` | mobile bundle, admin browser bundle, `EXPO_PUBLIC_*`, `NEXT_PUBLIC_*` |
| `STRIPE_SECRET_KEY` | Edge Functions / CI / local root `.env` | any client bundle |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` environment | clients |
| `TICKET_HMAC_KEY` | Edge Functions (`ticket-qr`, `scan-ticket`, `scan-demo`) | clients |
| `METRICS_TOKEN` | `metrics` function env + monitoring caller | clients |
| `SUPABASE_ANON_KEY` / `SUPABASE_URL` | client env (`NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`) | — (public by design) |

Rules:

- Only `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` values may reach a client, and they may
  only hold the Supabase URL, anon key and non-secret feature flags.
- `getEnv()` (`supabase/functions/_shared/config.ts`) validates the whole Edge
  Function environment on first use; a missing or malformed secret fails the
  request instead of silently degrading.
- Stripe is **test mode only** for this build: `getEnv()` rejects any
  `STRIPE_SECRET_KEY` that does not start with `sk_test_` (guardrail 14).
  Going live is a key rotation, not a code change.
- `.env.local`, `.env` and `supabase/.env` are gitignored; only
  `*.env.example` templates are committed.

## 2. Row-level security (RLS)

RLS is enabled on every table in `public`. Policies are additive; the service
role bypasses RLS and is used only inside Edge Functions.

| Table | anon | authenticated supporter | admin (`app_metadata.role = 'admin'`) |
|---|---|---|---|
| `profiles` | — | read/update own row | read via policies |
| `matches`, `zones`, `seats`, `news_items` | read | read | full write |
| `orders` | — | read own orders | read all |
| `order_seats` | — | read rows of own orders | read all |
| `tickets` | — | read own passes | read all |
| `seat_holds` | — | read own holds | read all |
| `device_tokens` | — | CRUD own rows | — |
| `gates` | — | — | read/write |
| `scan_events` | — | — | read |
| `audit_logs` | — | — | read |
| `app_settings` | — | read | full write |
| `stripe_events` | — | — | read |
| `rate_limits` | — | — | — (service role only; RLS with no policies) |

Writes to commerce data do not happen from clients at all: holds, orders,
tickets and scans are created through `security definer` functions
(`create_hold`, `create_order_from_hold`, `scan_ticket`, …) or Edge Functions.
`supabase/tests/rls.test.sql` asserts the matrix above (pgTAP).

Helper: `public.is_admin()` reads the JWT claim and is the single predicate used
by every admin policy, so a role change is applied everywhere at once.

## 3. Edge Function authorization

- `requireUser(request)` validates the bearer JWT with Supabase Auth and returns
  a token-scoped client.
- `requireAdmin(request)` additionally requires
  `app_metadata.role === 'admin'`; all admin operations use it.
- `metrics` is the only machine endpoint. It requires
  `x-metrics-token: <METRICS_TOKEN>` and compares in constant time
  (`_shared/metrics.ts`); it is `GET` only and returns aggregates, never rows.
- Errors are normalised by `toApiError` (`_shared/errors.ts`): database error
  codes are mapped to `conflict`/`not_found`/`validation` without leaking
  Postgres messages to clients.
- CORS is an allowlist (`ALLOWED_ORIGINS`, `ADMIN_APP_URL`), not `*`. The
  allowed *headers* mirror `@supabase/supabase-js/cors` (`authorization`,
  `apikey`, `content-type`, `x-client-info`, retry/trace headers) plus this
  API's `x-request-id` and `idempotency-key`; a missing header fails the browser
  preflight before the function is even called.

## 4. Payments (Stripe)

- Checkout is created server-side (`stripe-checkout`) with **card only**
  (`allowed_payment_method_types: ["card"]`) and the configured price from the
  database — never from client input.
- `stripe-webhook` verifies the raw body with `stripe-signature` via
  `constructWebhookEvent` before parsing; unsigned or tampered payloads are
  rejected with 401.
- Webhook processing is idempotent: `stripe_events.id` is the primary key, so a
  replayed event is acknowledged without issuing duplicate tickets. Failed
  processing removes the marker so Stripe can retry.
- Refunds (`refund-order`) require an admin JWT, refuse orders without a
  `payment_intent_id`, and refuse orders with used tickets unless
  `overrideUsedTickets` is explicitly set. Every refund is written to
  `audit_logs`.
- The client never sees a secret key; success is confirmed by the webhook, not
  by the return URL.

## 5. QR pass security

- Passes are HMAC-signed (`KICKOFF-V2:{…}`) over
  `v2|ticket_id|match_id|order_id|qr_nonce` with `TICKET_HMAC_KEY`
  (`_shared/qr.ts`, `ticket-qr`).
- The `qr_nonce` is unique per ticket and checked against the database on every
  scan, so a modified payload, a copied ticket id or a stale nonce is rejected.
- Comparison is constant-time in `_shared/hmac.ts`; the payload carries no
  personal data beyond ids.
- A pass is valid once. Re-scanning returns `used`; an accepted scan can be
  undone for 60 seconds (`scan-undo`, admin only).

## 6. Gate scanning & audit

- `scan_ticket` enforces: gate exists and is active, gate is assigned to the
  ticket's fixture (`wrong_match`), the fixture has not completed, and the
  current time is within **kick-off −2h … +2h**.
- Every attempt — valid, used, invalid, wrong fixture — writes a `scan_events`
  row with the admin id, gate id and an `idempotency_key`.
- `Idempotency-Key` (8–64 URL-safe characters) makes offline replays safe: the
  same key returns the original outcome instead of admitting twice.
- `audit_logs` records privileged actions (refunds, account deletion, admin
  user changes, settings writes). The admin console is read-only over audit
  data.
- The admin console ships `robots: { index: false, follow: false }` and
  `nocache: true` (P11-19) so staff screens are not indexed or cached.

## 7. Rate limits

`consume_rate_limit(key, window_seconds, max_hits)` is a fixed-window counter
keyed by action + client IP (or admin user id). It fails closed: if the
database call errors, the request is rejected with 429 rather than allowed.

| Action | Key | Budget |
|---|---|---|
| `stripe-checkout` | `checkout:<ip>` | 10 / 60s |
| `scan-ticket` | `scan:<admin id>` | 240 / 60s |
| `scan-undo` | `scan-undo:<admin id>` | 60 / 60s |
| `devices` | `devices:<ip>` | 60 / 60s |
| `send-kickoff-reminders` | `reminders:<ip>` | 12 / 60s |

## 8. Storage buckets

| Bucket | Public | Read | Write |
|---|---|---|---|
| `receipts` | no | owner of the order (`receipts_read_own`) | admin only |
| `news-images` | yes | anyone | admin only |

## 9. Operational checklist

- Rotate `TICKET_HMAC_KEY`, `METRICS_TOKEN` and the Stripe keys through
  Supabase secrets; never commit them.
- Set `ALLOWED_ORIGINS`/`ADMIN_APP_URL` to the production admin origin before
  launch (CORS otherwise falls back to localhost defaults).
- Keep `E2E_*` and `SUPABASE_SERVICE_ROLE_KEY` in CI secrets only.
- Monitor `metrics` for `scans.failed`, `holds.conflicts` and order status
  drift; alert on 5xx/429 spikes.
- Review `audit_logs` after any refund override or account deletion request.
