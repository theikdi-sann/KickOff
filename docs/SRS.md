# SRS — Software Requirements Specification — KickOff B2B

The formal requirements specification for KickOff, the matchday platform for
football clubs. This document is the **detailed elaboration** of
[`REQUIREMENTS.md`](REQUIREMENTS.md): every REQ/NFR/SC identifier from that
document is expanded here into a verifiable specification with acceptance
criteria. Where the two documents disagree, `REQUIREMENTS.md` wins (it carries
the state and traceability); this document carries the detail.

- **Standard:** lightweight IEEE-830-style (what + how verified, no boilerplate).
- **Status:** living document; states mirror `REQUIREMENTS.md`
  (`shipped` / `partial` / `open`).
- **Last verified:** 2026-11-14 · **Owner:** engineering
- **Related:** [`REQUIREMENTS.md`](REQUIREMENTS.md) (state + traceability) ·
  [`ARCHITECTURE.md`](ARCHITECTURE.md) (how it is built) ·
  [`SECURITY.md`](SECURITY.md) (controls) · [`TESTING.md`](TESTING.md)
  (proof) · [`FLOW-AUDIT.md`](FLOW-AUDIT.md) (flow findings)

## 1. System context

### 1.1 Purpose

KickOff lets a football club sell match tickets online, issue tamper-evident
digital passes and run gate entry, while supporters use a mobile app and club
staff use a web console. As a **B2B platform** it will be sold to many clubs
(each a tenant); the current build is single-club (`SC-01`, `GAP-02`).

### 1.2 System boundaries

| Component | Technology | Boundary |
|---|---|---|
| Supporter app | Expo / React Native (`apps/mobile`) | talks to Supabase (PostgREST, Auth, Realtime polling, Storage) and Edge Functions |
| Staff console | Next.js (`apps/admin`) | same Supabase project; browser never holds service-role or Stripe keys |
| Shared contracts | TypeScript (`packages/shared`) | Zod schemas, DTOs, mappers, logging — one owner per contract |
| Backend | Supabase (Postgres 15 + Auth + Storage + pg_cron) | RLS on every table; clients never write commerce rows directly |
| Edge Functions | Deno (`supabase/functions/*`) | the only holders of `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `TICKET_HMAC_KEY` |
| Payments | Stripe (test mode, `SC-02`) | Hosted Checkout; confirmation by webhook, never by return URL |
| Push | Expo Push Service | kickoff reminders; dev build required (REQ-11) |

### 1.3 Actors

| Actor | Surface | Trust level | Authority |
|---|---|---|---|
| Supporter | mobile app | untrusted | own profile, own orders/tickets/holds only |
| Gate staff (`gatekeeper`) | console scanner | elevated, scoped | `gates` read, own `scan_events`, tickets they scanned |
| Club administrator (`admin`) | console | elevated | full staff surface incl. fixtures, refunds, users |
| Platform operator | infrastructure | cross-tenant | service role only via Edge Functions / migrations |
| Scheduler | `pg_cron` | service identity | reminder fan-out only; guarded by secret |

### 1.4 Assumptions and constraints

| ID | Statement |
|---|---|
| A-01 | One Supabase project per deployment; multi-tenancy is designed in [`ADR-002`](adr/ADR-002-multi-tenancy.md) and delivered in C6–C7 (`GAP-02`). |
| A-02 | Stripe stays in test mode (`SC-02`); going live is a key rotation, not a code change. |
| A-03 | Seat allocation is a rectangular grid per zone (`SC-03`); no 3D map. |
| A-04 | Single-match tickets only; no season tickets or membership tiers (`SC-04`, `SC-05`). |
| A-05 | Entry verification is simulated QR scan (`SC-06`); no turnstile hardware integration. |
| A-06 | Free-tier hosting with limited concurrency (`SC-07`); holds, unique indexes and rate limits absorb load. |
| A-07 | Offline use is limited to already-issued passes (`SC-08`); the server stays authoritative at scan time. |

## 2. Functional requirements — supporter app (mobile)

Each requirement lists: the user-visible behaviour, the rules it must enforce,
and how it is verified. States mirror `REQUIREMENTS.md`.

### REQ-01 — Account lifecycle (`shipped`)

**Behaviour.** A supporter can register (email + password + name), sign in,
sign out, reset a forgotten password, verify email, and manage their profile.

**Rules.**
1. Credentials are parsed through the shared schemas (`signUpSchema`,
   `signInSchema`, `emailSchema`, `passwordSchema`) — no ad-hoc validation.
2. The registration name rule (≥ 2 characters) is enforced in `signUpSchema`,
   so every client enforces the same rule.
3. A new user gets a `profiles` row via the `handle_new_user` trigger; role
   defaults to `customer`.
4. The app fails loudly: auth screens render the real error reason, never a
   silent retry.

**Verified by.** `scripts/tests/signup.test.mjs`, `scripts/tests/redirects.test.mjs`,
shared schema unit tests.

### REQ-02 — Fixtures and results (`shipped`)

**Behaviour.** Browse upcoming fixtures and past results with scores.

**Rules.** `matches.status` ∈ {upcoming, live, completed}; the list surfaces its
own error state (C3.5) and distinguishes "empty" from "failed".

**Verified by.** `scripts/tests/mobile-resilience.test.mjs`; pgTAP suites on
`matches`.

### REQ-03 — Club news (`shipped`)

**Behaviour.** Read club news and match reports with category, published date
and reading time; images from the public `news-images` bucket.

**Rules.** `news_items.category` ∈ {Club News, Match Report, Announcement};
`read_minutes > 0`; writes are admin-only.

### REQ-04/REQ-05 — Zone → seat selection with live availability (`shipped`)

**Behaviour.** Pick a zone, then exact seats; availability is shown live while
choosing.

**Rules.**
1. Availability comes from the **authoritative `zone_availability` view**, never
   from client-side layout arithmetic (F-17, C4.5): a seat in a pending order
   is not available.
2. Poll interval 3 s; an in-flight selection is never overwritten by a poll.
3. Loading or failed counts are never rendered as "SOLD OUT" or 0.

**Verified by.** `packages/shared/src/__tests__/availability.test.ts`,
`scripts/tests/availability.test.mjs`.

### REQ-06 — Seat hold (`shipped`)

**Behaviour.** Selected seats are held for 10 minutes while the supporter pays.

**Rules.**
1. Holds are created only by the `create_hold` RPC — never client-side.
2. A unique partial index admits at most one active hold per seat.
3. Expired holds release automatically; a released hold cannot be paid.

**Verified by.** pgTAP concurrency suites (dblink workers, `run-pgtap.sh`).

### REQ-07 — Stripe payment (`shipped`)

**Behaviour.** Pay by card through Stripe Hosted Checkout (test mode).

**Rules.**
1. The amount is computed **server-side** from the database — the client never
   prices a ticket (D-02).
2. Checkout sessions are card-only (`allowed_payment_method_types`).
3. Success is confirmed by the webhook, not the return URL.
4. Rate limit: 10 checkout starts / 60 s / IP; fails closed.

**Verified by.** `scripts/mvp-gate.mjs` (browser gate, 15/15); Deno tests.

### REQ-08 — Digital pass (`shipped`)

**Behaviour.** After payment the supporter holds a digital pass with match,
supporter and QR code.

**Rules.**
1. Payload is HMAC-signed server-side: `KICKOFF-V2:{…}` over
   `v2|ticket_id|match_id|order_id|qr_nonce` with `TICKET_HMAC_KEY`.
2. `qr_nonce` is unique per ticket and re-checked against the database at scan.
3. Constant-time comparison; no personal data beyond ids in the payload.

**Verified by.** `scripts/tests/qr.test.mjs`, Deno `scan` tests.

### REQ-09 — Orders (`shipped`)

Order history and order detail from `orders`/`order_seats`; row→DTO mapping has
one owner (`packages/shared/src/mappers.ts`, unit-tested, C3.2).

### REQ-10 — PDF receipt (`shipped`)

Download/share a PDF receipt generated by the `receipt` function; stored in the
private `receipts` bucket readable only by the order's owner.

### REQ-11 — Push notifications (`shipped`)

Kickoff reminders for opted-in supporters via Expo Push; requires a dev build
(Expo Go cannot receive push; `GAP-06` proves it on hardware).

### REQ-12/REQ-13 — Profile edit and account deletion (`shipped`)

Profile updates are constrained by `profileUpdateSchema` and own-row RLS.
Account deletion runs through the `delete-account` Edge Function, wipes own
data only, and is audited.

### REQ-14 — Offline pass (`open` — `GAP-01`)

Cache the signed payload locally so a pass stays presentable without a network;
the server remains authoritative at scan time. Not yet implemented.

## 3. Functional requirements — staff console (admin)

### REQ-15 — Staff sign-in with MFA (`shipped`)

Staff sign in with TOTP MFA; authority derives from the `app_metadata.role`
JWT claim. The console is gated **server-side** by the Next proxy (C3.8): a
`/dashboard/*` request without a staff claim is redirected with the reason; a
`gatekeeper` is confined to `/dashboard/scan`.

### REQ-16..REQ-20 — Catalogue management (`shipped`)

Fixtures (create/edit/delete incl. kickoff, competition, home/away, scores),
zones/rows/seats/prices, venues, reschedule-with-reason, gates assigned to
fixtures. Every privileged change is audited from one shared vocabulary
(`apps/admin/src/lib/audit.ts`, C3.7).

### REQ-19 detail — reschedule rules (`shipped`)

Upcoming fixtures only; move to the future; outside the lock window; never
earlier than now; ≤ 10 days; a **reason is required by the database**
(`admin_update_match()`, migration `0038` — change and audit row written
atomically).

### REQ-21/REQ-22 — Scanning and undo (`shipped`)

`scan_ticket` enforces: gate exists and active, gate assigned to the ticket's
fixture, fixture not completed, time within kick-off −2h … +2h. **Every**
attempt (valid/used/invalid/wrong_match) writes a `scan_events` row with
operator id, gate id and `idempotency_key`; a caller cannot file a scan under
another operator's id. Undo within 60 s, same operator only, audited.
`requireStaff` (admin | gatekeeper) is used **only** by these two functions.

### REQ-23 — Offline queue at the gate (`shipped`)

The scanner queues offline attempts with idempotency keys; unreadable entries
are quarantined and reported to the operator (C3.6), never dropped silently.

### REQ-24/REQ-25 — Orders, refunds, news (`shipped`)

List/filter/refund/export orders (CSV). Refund requires an admin JWT, an
existing `payment_intent_id`, and explicit override for orders with used
tickets; carries an order-scoped idempotency key; runs atomically in the
database (`mark_order_refunded()`); audited. News publishing via
`news_input_schema` + admin RLS.

### REQ-26..REQ-29 — Users, settings, reporting, audit (`shipped`)

User and role management (`admin-users`: role change writes profile row **and**
JWT claim together, last-admin guard counts admins that can act, console shows
when the new role applies). Settings are read by staff, written by admin.
Overview metrics via `orders-aggregate` and the `metrics` machine endpoint
(token-guarded). `audit_logs` readable by admin, console is read-only over it.

## 4. Non-functional requirements

Each NFR states the measurable target and the enforcement mechanism.

| ID | Requirement | Target / rule | Enforcement |
|---|---|---|---|
| NFR-01 | RLS on every table | every `public` table has RLS enabled; policies additive; service role bypasses only inside Edge Functions | pgTAP `rls*.test.sql`; `SECURITY.md` matrix |
| NFR-02 | Secret confinement | only `EXPO_PUBLIC_*` / `NEXT_PUBLIC_*` reach clients and only carry URL/anon key/flags | `check:no-mocks` + review |
| NFR-03 | Stripe test mode only | `getEnv()` rejects non-`sk_test_` keys | `_shared/config.ts`, CI |
| NFR-04 | Tamper-evident passes | HMAC envelope + nonce DB check | `_shared/qr.ts`, `hmac.ts` |
| NFR-05 | Audited privileged mutations | refunds, settings, reschedule, scans, user changes, fixture/zone/venue/gate/news/CSV writes | `audit_logs`; `scripts/tests/audit-coverage.test.mjs` |
| NFR-06 | Deterministic CI on every push | the CI job list is itself contract-tested | `.github/workflows/ci.yml`; `scripts/tests/ci.test.mjs` |
| NFR-07 | Type safety | strict TS, `noUncheckedIndexedAccess` on, no `any`, no non-null assertions | `tsconfig.base.json`, ESLint, `scripts/tests/type-safety.test.mjs` |
| NFR-08 | Offline entry verification | cached signed payload; server authoritative | **open** — `GAP-01` |
| NFR-09 | Multi-tenant isolation | per-club data isolation, branding, currency | **open** — `GAP-02`; ADR-002, C6–C7 |
| NFR-10 | Fine-grained staff roles | beyond `admin`/`gatekeeper`: per-club RBAC | **partial** — `GAP-03a` shipped; `0041` made roles per-tenant with capability flags (C6.2) |
| NFR-11 | Observability | structured logs (single JSON line, redacted), request IDs, error tracking, alerting | **open** — `GAP-04`; logger exists (`createLogger`, C4.11) |
| NFR-12 | Multi-language/currency | per-tenant locale and currency | **open** — `GAP-05`; schema in C6/C7, UX in C10.2 |

### 4.1 Cross-cutting quality rules

- **One owner per contract:** QR contract, error vocabulary, business constants,
  row→DTO mapping, validation schemas, logging/redaction — each has exactly one
  implementation, and Edge Functions consume **generated copies**
  (`scripts/sync-edge-schemas.mjs`, `sync-error-codes.mjs`).
- **Error envelope:** Edge errors are normalised by `toApiError`; database codes
  map to `conflict`/`not_found`/`validation` without leaking Postgres messages.
- **Rate limits fail closed:** on database error the request is rejected 429.
- **Documentation cannot drift:** `PLAN.md` may not point at missing files or
  call a delivered workstream pending (`scripts/tests/docs.test.mjs`); every
  tracked file must carry a verdict in `FILE-INDEX.md`
  (`file-coverage.test.mjs`).
- **Dependency hygiene:** `expo install --check` gates CI (`GAP-07`).

## 5. External interfaces

### 5.1 Supabase (PostgREST)

REST over `public` tables/views (`match_sales_summary`, `order_receipt_view`,
`zone_availability`) and `security definer` RPCs (`create_hold`,
`create_order_from_hold`, `scan_ticket`, `undo_scan`, `consume_rate_limit`,
`admin_update_match`, `mark_order_refunded`). Clients authenticate with the
anon key + user JWT.

### 5.2 Edge Functions (`/functions/v1/<name>`)

| Function | Auth | Purpose |
|---|---|---|
| `health` | none (cheap check); deep check with `x-metrics-token` | readiness/liveness |
| `metrics` | `x-metrics-token` | aggregates for monitoring |
| `stripe-checkout` | user JWT | create Hosted Checkout session |
| `stripe-webhook` | Stripe signature | fulfilment, idempotent |
| `refund-order` | admin JWT | atomic refund + audit |
| `ticket-qr` | user JWT | signed pass payload |
| `scan-ticket` / `scan-undo` | staff JWT | gate surface |
| `admin-users` | admin JWT | role writes (row + claim atomic) |
| `receipt` | user JWT | PDF receipt |
| `delete-account` | user JWT | account deletion |
| `devices` | user JWT | push token registration |
| `send-kickoff-reminders` | scheduler secret | reminder fan-out |
| `orders-aggregate` | admin JWT | scan/sales aggregates |
| `cancel-order` | user JWT | cancel own pending order |

CORS is an allowlist (`ALLOWED_ORIGINS`, `ADMIN_APP_URL`); allowed headers
mirror supabase-js plus `x-request-id` and `idempotency-key`.

### 5.3 Stripe

Hosted Checkout (card only) + webhook with signature verification; refunds via
the Stripe API with an order-scoped idempotency key.

### 5.4 Expo Push Service

Push tokens registered through `devices`; reminders sent by the scheduler.

## 6. Verification

Layered per [`TESTING.md`](TESTING.md):

| Layer | Tool | Gate |
|---|---|---|
| Repo contracts | `node --test scripts/tests/` | `npm test` |
| Shared + mobile unit | Vitest / jest-expo | `npm test` |
| Database | pgTAP via `scripts/run-pgtap.sh` (183 assertions / 15 suites) | `db:test` |
| Edge Functions | Deno lint + tests | `functions:check`, CI |
| Browser demo gate | `scripts/mvp-gate.mjs` (15/15) | manual/CI |
| Auth E2E | Playwright against hosted project | manual `workflow_dispatch` |
| Mobile smoke | Maestro flow | manual |

**Definition of done for any requirement:** the requirement's state in
`REQUIREMENTS.md` is `shipped` **and** its traceability row names the
implementation and a green proof (test/contract).

## 7. Open items

The gaps section of `REQUIREMENTS.md` §6 is normative: `GAP-01`…`GAP-10` with
the execution order fixed in `PLAN.md`:

- **C6–C7 (GAP-02, GAP-03)** — the account model and multi-tenancy series
  `0040`–`0048`: per-tenant `staff_roles` with capability flags, global
  identity, `tenant_id` + composite FKs, the RLS rewrite and the isolation
  suite. Design: [`ADR-001`](adr/ADR-001-account-model.md),
  [`ADR-002`](adr/ADR-002-multi-tenancy.md). `0040` (the `tenants` row,
  `current_tenant()`, `minor_units()` and `provision_tenant()`), `0041`
  (global `fans`, per-tenant `staff_roles` with capability flags,
  `staff_members`, and the legacy `profiles.role` dual-write bridge) and `0042`
  (`tenant_id` on every scoped table, composite foreign keys, tenant-led
  indexes) have landed; the rest is not yet implemented, so the current
  single-tenant behaviour above remains authoritative until each step lands.
- **C8 (GAP-09)** — Stripe Connect (per-club connected accounts, platform fee,
  per-account webhooks, refund ledger): [`ADR-003`](adr/ADR-003-stripe-connect.md).
  GDPR export and tenant offboarding land before this cycle.
- **C9 (GAP-10)** — the cross-tenant platform console and white-label app
  delivery: [`ADR-004`](adr/ADR-004-white-label.md).
- **C10 (GAP-04, GAP-05, GAP-01, GAP-06)** — observability, i18n/currency UX,
  the offline pass cache and the hardware push proof.
- **GAP-08** — ticket transfer/claim is explicitly out of scope; a buyer holds
  every pass for their order until it is designed as its own feature.
