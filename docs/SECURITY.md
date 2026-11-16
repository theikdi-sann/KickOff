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
| `venues` | read | read | full write |
| `orders` | — | read own orders | read all |
| `order_seats` | — | read rows of own orders | read all |
| `tickets` | — | read own passes | read all |
| `seat_holds` | — | read own holds | read all |
| `device_tokens` | — | CRUD own rows | — |
| `gates` | — | — | read/write |
| `match_gates` | — | read (staff) | read/write |
| `scan_events` | — | — | read |
| `audit_logs` | — | — | read |
| `app_settings` | — | read | full write |
| `stripe_events` | — | — | read |
| `rate_limits` | — | — | — (service role only; RLS with no policies) |

Writes to commerce data do not happen from clients at all: holds, orders,
tickets and scans are created through `security definer` functions
(`create_hold`, `create_order_from_hold`, `scan_ticket`, …) or Edge Functions.
`supabase/tests/rls.test.sql` asserts the matrix above (pgTAP).

A second staff role, `gatekeeper` (GAP-03a), is narrower than `admin`: it may
read `gates`, the fixture assignments on `match_gates` (the scanner console
shows which fixtures a gate serves), its **own** `scan_events`, and the
`tickets` rows of passes it scanned; every other row marked admin-only above
stays closed. It may not read the audit trail, other profiles, or write the
gate registry or the assignments.

Helpers: `public.is_admin()` reads the JWT claim and is the single predicate
used by every admin policy; `public.is_staff()` is the broader predicate for
the gate surface (admin or gatekeeper). Both read `app_metadata.role`, so a
role change is applied everywhere at once. `supabase/tests/staff-roles.test.sql`
asserts the boundary.

### 2.1 Multi-tenant model (C6–C7 — `0040`–`0048` landed)

The single-tenant matrix above is replaced by the tenant-scoped one below,
live since `0045` (ADR-001, ADR-002):

- **Helpers:** `current_tenant()` reads `app_metadata.tenant_id` and resolves
  only `status = 'active'` tenants — a missing or empty claim falls back to
  the default club (the single-club bridge), a present claim stays strict;
  `is_admin()` / `is_staff()` / `is_gate_operator()` are tenant-scoped
  capability checks on `staff_members` + `staff_roles`; `is_platform_admin()`
  gates the cross-tenant console and arrives with C9.
- **Scoped tables** (`orders`, `order_seats`, `tickets`, `seat_holds`,
  `refunds`, `scan_events`, `staff_members`, `staff_roles`, `app_settings`,
  `audit_logs`) require `tenant_id = current_tenant()` **and** the row
  ownership/staff predicate.
- **Commerce writes stay RPC-only.** A table with no INSERT/UPDATE policy is
  deny-by-default; `create_hold`, `create_order_from_hold`,
  `mark_order_paid`, `mark_order_refunded`, `scan_ticket` and `undo_scan`
  remain the only writers.
- **Append-only evidence:** insert/update/delete are revoked from the API
  roles on `scan_events`, update/delete on `audit_logs`; the undo columns
  change only inside `undo_scan()`.
- **Views:** `order_receipt_view` and `match_sales_summary` run with
  `security_invoker = true` so the underlying RLS applies per row (the
  receipt carries holder PII); `zone_availability` and `seat_availability`
  stay `SECURITY DEFINER` for the public seat map, each scoped by
  `current_tenant()` instead.
- **Public catalogue** (`venues`, `matches`, `zones`, `seats`,
  `match_zone_prices`, published `news_items`) is open for SELECT, writes
  remain tenant-scoped (ADR-002 §6). Names are per-club keys since `0046`
  (`venues.name`, `gates.name`, the `app_settings` primary key), so one
  club's "Main Gate" never collides with another's. `tenants` exposes its
  branding columns only (`id`, `name`, `slug`, `currency`, `locale`,
  `logo_url`, `primary_color`, `status`); the platform fee and the Connect
  account stay service-role.
- **Connect:** `stripe_events` resolves its tenant from the Connect event's
  `account`; the platform Stripe secret stays the only payment secret.

The isolation suite (pgTAP T-01…T-24) asserts, per scoped table, that a
cross-tenant read returns 0 rows and a cross-tenant write errors.

## 3. Edge Function authorization

- `requireUser(request)` validates the bearer JWT with Supabase Auth and returns
  a token-scoped client.
- `requireAdmin(request)` additionally requires
  `app_metadata.role === 'admin'`; every operation except the gate surface
  uses it.
- `requireStaff(request)` requires `admin` or `gatekeeper` and is used **only**
  by `scan-ticket` and `scan-undo`. A gatekeeper's authority is exactly the
  gate; a broader guard would quietly widen it.
- **Two authorities, one role.** The database authorises on the *membership*
  (`staff_members` + `staff_roles`, §2.1); the Edge guards authorise on the
  *JWT claim* (`app_metadata.role`). Since `0047` the console and the
  `admin-users` function read and write the membership, and every promotion
  writes both. The legacy `profiles.role` column, its dual-write trigger and
  its guard are gone since `0048` — the column had no reader left.
- `metrics` is the only machine endpoint. It requires
  `x-metrics-token: <METRICS_TOKEN>` and compares in constant time
  (`_shared/metrics.ts`); it is `GET` only and returns aggregates, never rows.
- `health` is the only unauthenticated endpoint (a load balancer cannot
  present a user JWT). Its public readiness path runs a **cheap database check
  only** — the live Stripe API call is a *deep* check and runs only for a
  caller that presents `x-metrics-token` (`_shared/probe.ts`). An anonymous
  caller therefore cannot spend the Stripe API budget or hit the rate limit
  that checkout depends on.
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
  undone for 60 seconds (`scan-undo`, staff only, and only the operator who
  recorded it).

## 6. Gate scanning & audit

- `scan_ticket` enforces: gate exists and is active, the gate admits at least
  one fixture and is assigned to the ticket's fixture through `match_gates`
  (`wrong_match`), the fixture has not completed, and the
  current time is within **kick-off −2h … +2h**.
- Every attempt — valid, used, invalid, wrong fixture — writes a `scan_events`
  row with the gate id, the fixture it admitted for (`match_id`), the
  operator's membership row (`operator_id`, null when the account holds none —
  `admin_id` stays the accountable account identity) and an
  `idempotency_key`. The SQL function refuses a caller whose `p_admin_id` is
  not their own `auth.uid()`, so a scan cannot be filed under another
  operator's name.
- The log is **append-only** (`scan_events_append_only`): a row may be
  inserted and may take its undo stamp (`undone_at`, `undone_by`) — nothing
  else, and nothing at all once undone. Two exceptions are deliberate:
  foreign-key cascades fire the trigger at depth ≥ 2 (the database is acting,
  not an editor), and a maintenance purge requires the session flag
  `kickoff.scan_events_maintenance = on` **and** a member of the table
  owner's role — the flag alone is meaningless, since any session can set a
  custom GUC.
- `Idempotency-Key` (8–64 URL-safe characters) makes offline replays safe: the
  same key returns the original outcome instead of admitting twice.
- `audit_logs` records privileged actions (refunds, account deletion, admin
  user changes, settings writes, and every privileged change the staff console
  makes — fixtures, zones, venues, gates, news, settings and CSV exports).
  The admin console is read-only over audit data.
- The staff console is gated **server-side** by the Next proxy: a request to
  `/dashboard/*` must carry a session whose JWT claim `app_metadata.role` is a
  staff role. A signed-in non-staff account is redirected to the sign-in form
  with the reason; a gatekeeper is confined to `/dashboard/scan` and sent back
  there from every other dashboard path. The dashboard layout repeats the
  check and filters the navigation. The database remains the final authority —
  every write is filtered by RLS `public.is_admin()` (or `public.is_staff()`
  for the gate surface).
- The admin console ships `robots: { index: false, follow: false }` and
  `nocache: true` (P11-19) so staff screens are not indexed or cached.

## 7. Rate limits

`consume_rate_limit(key, window_seconds, max_hits)` is a fixed-window counter
keyed by action + client IP (or admin user id). It fails closed: if the
database call errors, the request is rejected with 429 rather than allowed.

| Action | Key | Budget |
|---|---|---|
| `stripe-checkout` | `checkout:<ip>` | 10 / 60s |
| `scan-ticket` | `scan:<staff id>` | 240 / 60s |
| `scan-undo` | `scan-undo:<staff id>` | 60 / 60s |
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
