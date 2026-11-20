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
- **Last verified:** 2026-11-20 · **Owner:** engineering
- **Related:** [`REQUIREMENTS.md`](REQUIREMENTS.md) (state + traceability) ·
  [`ARCHITECTURE.md`](ARCHITECTURE.md) (how it is built) ·
  [`SECURITY.md`](SECURITY.md) (controls) · [`TESTING.md`](TESTING.md)
  (proof) · [`FLOW-AUDIT.md`](FLOW-AUDIT.md) (flow findings)

## 1. System context

### 1.1 Purpose

KickOff lets a football club sell match tickets online, issue tamper-evident
digital passes and run gate entry, while supporters use a mobile app and club
staff use a web console. As a **B2B platform** it will be sold to many clubs
(each a tenant); since `0045` the build enforces per-club isolation
(`SC-01` lifted, `GAP-02` closed).

### 1.2 System boundaries

| Component | Technology | Boundary |
|---|---|---|
| Supporter app | Expo / React Native (`apps/mobile`) | talks to Supabase (PostgREST, Auth, Realtime polling, Storage) and Edge Functions |
| Staff console | Next.js (`apps/admin`) | same Supabase project; browser never holds service-role or Stripe keys |
| Shared contracts | TypeScript (`packages/shared`) | Zod schemas, DTOs, mappers, logging — one owner per contract |
| Backend | Supabase (Postgres 17 + Auth + Storage + pg_cron) | RLS on every table; clients never write commerce rows directly |
| Edge Functions | Deno (`supabase/functions/*`) | the only holders of `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `TICKET_HMAC_KEY` |
| Payments | Stripe (test mode, `SC-02`) | Hosted Checkout; confirmation by webhook, never by return URL |
| Push | Expo Push Service | kickoff reminders; dev build required (REQ-11) |

### 1.3 Actors

| Actor | Surface | Trust level | Authority |
|---|---|---|---|
| Supporter | mobile app | untrusted | own profile, own orders/tickets/holds only |
| Gate staff (`gatekeeper`) | console scanner | elevated, scoped | `gates` + `match_gates` read, own `scan_events`, tickets they scanned |
| Club administrator (`admin`) | console | elevated | full staff surface incl. fixtures, refunds, users |
| Platform operator | infrastructure | cross-tenant | service role only via Edge Functions / migrations |
| Scheduler | `pg_cron` | service identity | reminder fan-out only; guarded by secret |

### 1.4 Assumptions and constraints

| ID | Statement |
|---|---|
| A-01 | One Supabase project serves many clubs; tenancy is live since `0045` (`GAP-02` closed, [`ADR-002`](adr/ADR-002-multi-tenancy.md)). |
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
3. A new user gets a `profiles` row via the `handle_new_user` trigger; no role
   is stored on `profiles`. Staff authority is a separate `staff_members` row.
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

**Locale residual:** the PDF uses the built-in Helvetica face, which covers
ASCII only. A Thai club's receipt therefore uses English copy and ISO money
(`THB 350`) rather than Thai glyphs or `฿`. On-screen surfaces still use the
club locale. Replacing this needs a Unicode font that fits the Edge worker's
memory budget; see `REQTRACE.md` §10.

### REQ-11 — Push notifications (`shipped`)

Kickoff reminders for opted-in supporters via Expo Push; requires a dev build
(Expo Go cannot receive push). Proven on hardware 2026-11-19: a Xiaomi Pad 6 on
Android 14 received a reminder in the tray with the app swiped out of recents —
`RUNBOOK` §11.7.

### REQ-12/REQ-13 — Profile edit and account deletion (`shipped`)

Profile updates are constrained by `profileUpdateSchema` and own-row RLS.
Account deletion runs through the `delete-account` Edge Function, applies the
retention/erasure schedule (`docs/PRIVACY.md`), and is audited. The
data-subject export (GAP-09.2, `export-user`) returns the subject's own rows
across every club their account touches, from the inventory the schedule
lists, and is audit-logged like the deletion.

### REQ-14 — Offline pass (`shipped`)

Cache the signed payload locally so a pass stays presentable without a network;
the server remains authoritative at scan time. Implemented in C10.3: the
payload and the ticket row are recorded verbatim on fetch, served back with
`fromCache` when the network fails, admitted by an offline hint on the pass
screen, and cleared on sign-out (PASS-1…PASS-6).

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
attempt (`valid`, `used`, `invalid`, `wrong_match`, `wrong_zone`) writes a
`scan_events` row with the outcome; `wrong_zone` does not consume the pass.
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

User and role management (`admin-users`: a role change writes the **membership**
and the JWT claim together, the last-admin guard counts admins that can act, and
the console shows when the new role applies; assigning **Customer** deletes the
membership). Settings are read by staff, written by admin.
Overview metrics via `orders-aggregate` and the `metrics` machine endpoint
(token-guarded). `audit_logs` readable by admin, console is read-only over it.

### REQ-046 — Per-club staff role definition and assignment (`open`)

**Behaviour.** An admin holding `manage_staff` can create, rename, deactivate
and assign club-scoped staff roles beyond the two built-in roles. Authority is
the role's capability set, never its name.

**Rules.** Built-ins are exactly `admin` and `gatekeeper`, seeded per club and
immutable; `customer` is the absence of a `staff_members` row, not a role.
Custom roles live in `staff_roles(tenant_id, code, …)` with capabilities in
`staff_role_capabilities`, drawn from the closed catalogue `manage_staff`,
`operate_gate`, `manage_matches`, `manage_venues`, `publish_news`,
`refund_orders`, `read_audit`, `manage_settings`, `export_data`,
`view_reports`. `admin` = all ten; `gatekeeper` = `operate_gate`. Assignment
writes the membership and the claim (`role`, `capabilities`) together, with
compensation on failure; assigning **Customer** deletes the membership. Guards:
`manage_staff` required, no capability escalation, no self-demotion, last
manager protected, cross-tenant access refused. RLS and Edge guards check
capabilities only. The full rules and error codes are normative in
[`REQUIREMENTS.md`](REQUIREMENTS.md) REQ-046.

**Verified by.** `RBAC-1…RBAC-8` — **pending** (`TESTING.md` §10). The feature
is not built; NFR-10 and `GAP-11` are **open**.

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
| NFR-08 | Offline entry verification | cached signed payload; server authoritative | **shipped** — `GAP-01` closed at C10.3 |
| NFR-09 | Multi-tenant isolation | per-club data isolation, branding, currency | **shipped** — `GAP-02` closed at `0045` (isolation suite green); ADR-002, C6–C7 |
| NFR-10 | Per-club role definition | beyond `admin`/`gatekeeper`: a club may add roles | **open** — built-in pair shipped (`0039`, `0041`, `0047`, `0048`); custom roles are REQ-046 / GAP-11, `RBAC-1…RBAC-8` pending |
| NFR-11 | Observability | structured logs (single JSON line, redacted), request IDs, error tracking, alerting | **shipped** — C10.1: `error_events` carries the same request id as the envelope and the log line, `ALERT_WEBHOOK_URL` pages (optional, cooldown-gated), and the reconciliation sweep finds unsettled payments; the logger itself landed in C4.11 |
| NFR-12 | Multi-language/currency | per-tenant locale and currency | **shipped with a documented residual** — `GAP-05` closed at C10.2: schema (C6/C7), formatting (C8.2), the translation layer with a coverage-contracted Thai catalog (C10.2). The PDF receipt stays ASCII/English until a Thai font fits the Edge worker (REQ-10). |
| NFR-13 | Seat availability performance | p95 read-to-render ≤ 300 ms; 3 s poll; >5 s marked stale | `zone_availability`; `availability.test.mjs` |
| NFR-14 | Availability | monthly p95 API availability ≥ 99.5 %; >5 5xx in 5 min pages | `health`, `availability-probe.mjs`, `availability_probes`, `metrics`, alert channel |
| NFR-15 | Accessibility | accessible name on every control; contrast ≥ 4.5:1; keyboard/screen-reader seat grid | a11y tests, Playwright |
| NFR-16 | Retention | 7 y orders/tickets/refunds/audit; 3 y `scan_events`; 90 d `stripe_events`/unused tokens; 30 d `error_events`; erasure ≤ 30 d | `PRIVACY.md`, prune jobs |
| NFR-17 | Backup / recovery | RPO ≤ 24 h; RTO ≤ 4 h; quarterly restore drill | `scripts/restore-drill.sh`, `RUNBOOK.md` §7 |

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
| `admin-users` | admin JWT | staff list and role assignment (membership + claim atomic) |
| `admin-roles` (**planned, REQ-046**) | admin JWT with `manage_staff` | custom role CRUD (not built) |
| `receipt` | user JWT | PDF receipt |
| `delete-account` | user JWT | account deletion |
| `devices` | user JWT | push token registration |
| `send-kickoff-reminders` | scheduler secret | reminder fan-out |
| `orders-aggregate` | admin JWT | scan/sales aggregates |
| `cancel-order` | user JWT | cancel own pending order |
| `export-user` | user JWT | data-subject export (GAP-09.2) — own data; another person's requires an admin |

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
| Database | pgTAP via `scripts/run-pgtap.sh` (458 assertions / 30 suites) | `db:test` |
| Edge Functions | Deno lint + tests | `functions:check`, CI |
| Browser demo gate | `scripts/mvp-gate.mjs` (15/15) | manual/CI |
| Auth E2E | Playwright against hosted project | manual `workflow_dispatch` |
| Mobile smoke | Maestro flow | manual |

**Definition of done for any requirement:** the requirement's state in
`REQUIREMENTS.md` is `shipped` **and** its traceability row names the
implementation and a green proof (test/contract).

## 7. Open items

The gaps section of `REQUIREMENTS.md` §6 is normative: `GAP-01`…`GAP-11` with
the execution order fixed in `PLAN.md`:

- **C6–C7 (GAP-02, GAP-03)** — the account model and multi-tenancy series
  `0040`–`0048`: per-tenant `staff_roles` with capability flags, global
  identity, `tenant_id` + composite FKs, the RLS rewrite and the isolation
  suite. Design: [`ADR-001`](adr/ADR-001-account-model.md),
  [`ADR-002`](adr/ADR-002-multi-tenancy.md). `0040` (the `tenants` row,
  `current_tenant()`, `minor_units()` and `provision_tenant()`), `0041`
  (global `fans`, per-tenant `staff_roles` with capability flags,
  `staff_members`, and the legacy `profiles.role` dual-write bridge), `0042`
  (`tenant_id` on every scoped table, composite foreign keys, tenant-led
  indexes), `0043` (the commerce restructure in minor units), `0044`
  (venue-bound gates and the append-only scan log), `0045` (the RLS
  rewrite: capability-gated helpers, the tenant-scoped policy matrix and the
  T-01…T-24 isolation suite), `0046` (per-club uniques — `venues.name`,
  `gates.name` and the `app_settings` primary key move under `tenant_id`,
  and the console/seed conflict targets move with them), `0047` (the role
  sweep — every reader moved off the legacy `profiles.role` column onto the
  membership, and the promotion helper writes membership and claim together)
  and `0048` (the legacy column, its dual-write trigger and its guard are
  dropped) have landed — the C6–C7 series is complete, and the bridge rows
  above are gone with it.
- **C8 (GAP-09)** — Stripe Connect (per-club connected accounts, platform fee,
  per-account webhooks, refund ledger): [`ADR-003`](adr/ADR-003-stripe-connect.md).
  The plumbing (C8.1) landed first — it changes nothing while no club holds a
  connected account. **GAP-09 closed at GAP-09.6**: the schedule
  ([`PRIVACY.md`](PRIVACY.md)), the fan export/erasure, the club export and
  the erase behind the human money gate all landed, so a club can now be
  onboarded onto its own account with a clean exit available (the onboarding
  itself belongs to C9).
- **C9 (GAP-10)** — delivered: the cross-tenant platform console (registry,
  suspend/restore, platform fee, provisioning — `0054`), the white-label
  `bootstrap` binding and Stripe Connect onboarding:
  [`ADR-004`](adr/ADR-004-white-label.md). The per-club release overhead
  itself remains `GAP-10`.
- **C10 (GAP-04, GAP-05, GAP-01, GAP-06)** — observability, i18n/currency UX,
  the offline pass cache and the hardware push proof (Android run recorded
  2026-11-19; iOS uses the same procedure with an APNs key and is unrun).
- **GAP-08** — ticket transfer/claim is explicitly out of scope; a buyer holds
  every pass for their order until it is designed as its own feature.
- **GAP-11 (REQ-046, NFR-10)** — a club cannot define its own staff roles yet.
  The built-in pair ships; custom role CRUD, capability assignment and the
  `RBAC-1…RBAC-8` acceptance suite are **pending**. Design:
  [`ADR-005`](adr/ADR-005-custom-rbac.md).
