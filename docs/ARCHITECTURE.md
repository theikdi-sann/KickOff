# ARCHITECTURE — KickOff B2B

How KickOff is put together: the runtime, the data model, the flows that carry
money and admits, the trust boundaries, and the conventions every module must
follow. This is the document an engineer reads on day one.

- **Audience:** engineers, technical reviewers, new hires.
- **Scope:** the shipped system. Forward-looking work is labelled.
- **Last verified:** 2026-11-13 · **Owner:** engineering
- **Related:** [`REQUIREMENTS.md`](REQUIREMENTS.md) (what it must do) ·
  [`SECURITY.md`](SECURITY.md) (how it is protected) ·
  [`TESTING.md`](TESTING.md) (how it is proven) ·
  [`BRAND.md`](BRAND.md) (visual tokens)

---

## 1. System context

KickOff is sold to football clubs. Each club is a tenant with its own
fixtures, staff, supporters and payments.

```text
        ┌───────────────┐            ┌────────────────┐
        │ Supporter app │            │  Staff console │
        │  (Expo/RN)    │            │   (Next.js)    │
        └───────┬───────┘            └────────┬───────┘
                │  user JWT (supabase auth)     │  user JWT (role claim)
                │                              │
                │      ┌───────────────────────┼──────────────────────┐
                │      ▼                       ▼                      │
                │ ┌──────────────────────────────────────────────┐      │
                │ │            Supabase (Postgres + Deno)        │      │
                │ │                                              │      │
                │ │  PostgREST ── RLS ── tables / views / RPCs   │      │
                │ │  Edge Functions ── service role ── Stripe    │      │
                │ │  Storage buckets ── receipts / news images  │      │
                │ │  pg_cron ── reminders / retention            │      │
                │ └──────────────────────────────────────────────┘      │
                │                              │                      │
                ▼                              ▼                      ▼
        ┌───────────────┐            ┌────────────────┐      ┌────────────────┐
        │ Stripe (test) │            │ Expo Push Svc  │      │  Storage (S3)  │
        └───────────────┘            └────────────────┘      └────────────────┘
```

**The one architectural rule that explains the whole codebase:**

> Anything a user can reach runs under **Row-Level Security** with their own
> JWT. Anything that moves money, issues a pass, or admits a supporter runs
> in an **Edge Function** with the service role, which *bypasses* RLS and must
> therefore enforce authorization itself.

Every Edge Function is a deliberate RLS bypass. That is where security review
concentrates, and why every function starts with the same three steps:
authenticate → authorize → validate.

## 2. Runtime layers

| Layer | Location | Responsibility | Trust |
|---|---|---|---|
| Presentation | `apps/mobile/src/app`, `apps/admin/src/app` | routes, screens, forms | untrusted input |
| Domain/contract | `packages/shared` | Zod schemas, DTOs, mappers, money, format, theme, QR-adjacent types | pure, framework-free |
| Client data access | `apps/*/src/lib/queries/*` | React Query hooks, polling, cache policy | user JWT |
| Client edge access | `apps/mobile/src/lib/api.ts`, `apps/admin/src/lib/functions.ts` | edge-function client + error envelope | user JWT |
| Serverless API | `supabase/functions/*` | privileged operations | service role |
| Database | `supabase/migrations` | schema, RLS, RPCs, views, cron | Postgres |

### 2.1 The three request paths

1. **Catalogue read** — client → PostgREST → RLS `select` policy → rows.
   Example: the seat map reads `seats` for one fixture.
2. **Privileged write** — client → Edge Function → auth check → service-role
   write. Example: `stripe-checkout` computes the amount from the database,
   never from the client payload.
3. **Scheduled work** — `pg_cron` → Edge Function with the scheduler secret.
   Example: `send-kickoff-reminders` fans out Expo push notifications.

### 2.2 Component map

```
apps/mobile/src/
  app/                 Expo Router screens (auth group, tabs group, feature routes)
  components/          UI kit (ui.tsx) + domain cards (match, news, ticket)
  lib/queries/         React Query hooks, one file per domain
  lib/api.ts           Edge-function client, ApiClientError, error envelope
  lib/auth.ts          Supabase session → AppProfile, sign in/out/up
  lib/store.tsx        AppProvider: profile state + demo-account entry
  lib/notifications.ts Push registration + Expo-Go / project-id guards
  lib/storage.ts       SecureStore adapter for the Supabase auth session
  lib/receipt.ts       PDF receipt fetch + share

apps/admin/src/
  app/dashboard/*      staff screens (overview, matches, venues, gates, scan,
                       tickets, news, users, settings)
  app/login/*          sign-in + TOTP MFA challenge
  lib/queries/*        React Query hooks, one file per domain
  lib/audit.ts         privileged audit writes (fixture fields, settings)
  lib/offline-queue.ts gate scans recorded without connectivity
  lib/scan-api.ts      scan/undo transport
  lib/export.ts        CSV export
  proxy.ts             server-side route protection

packages/shared/src/
  schemas.ts           Zod contracts at the trust boundary
  dto.ts / entities.ts domain DTOs and DB row types
  mappers.ts           row → DTO
  error-codes.ts       the error vocabulary (one source for every tier)
  http.ts              the shared error shape
  money.ts             money in integer minor units: the scale, the arithmetic,
                       the one formatter (`formatMoney`), self-contained
  format.ts            dates, and `formatTHB` as THB's coat over `formatMoney`
  greeting.ts          club-timezone greeting
  theme.ts             brand tokens

supabase/
  migrations/          39 ordered SQL migrations: schema, RLS, RPCs, views, cron
  functions/_shared/   auth, config, validate, hmac, stripe, rate-limit,
                       metrics, audit, http envelope, logger, qr
  functions/<name>/    one directory per function (16)
  tests/               pgTAP suites (10)
```

## 3. Data model

| Group | Tables | Invariant |
|---|---|---|
| Catalogue | `matches`, `zones`, `seats`, `venues` | a seat belongs to exactly one zone of one fixture; a fixture plays at one venue |
| Availability | `seat_holds` | one *active* hold per seat (partial unique index) |
| Commerce | `orders`, `order_seats` | an order holds seats for a TTL, then is paid/cancelled/expired |
| Fulfilment | `tickets` | one ticket per `order_seats` row, issued exactly once |
| Access | `profiles`, `app_settings`, `app_secrets` | role lives in the JWT claim, mirrored in `profiles`; vocabulary is `customer` / `gatekeeper` / `admin` |
| Operations | `scan_events`, `audit_logs`, `stripe_events`, `rate_limits` | append-only history except `stripe_events` dedupe |
| Engagement | `news_items`, `device_tokens` | device tokens are per user, revocable |

**Key invariants (each has a test):**

| Invariant | Enforced by | Test |
|---|---|---|
| One active hold per seat | partial unique index | `hold-concurrency.test.sql` |
| A ticket is issued exactly once | `mark_order_paid` + `stripe_events` dedupe | `order-expiry.test.sql` |
| A seat leaves `available` only via hold/order | RPC-only transitions | `seat-reservation.test.sql` |
| A pass is accepted only within kickoff −2h…+2h | `scan-ticket` | `scan.test.sql` |
| A scan can be undone for 60 s | `scan-undo` | `scan.test.sql` |
| Nothing but admins reads `audit_logs` / `scan_events` | RLS policies | `rls.test.sql` |
| Only admins write `audit_logs` | `0037` grant + policy; `0038` RPCs write their own rows atomically | `reschedule-audit.test.sql` + `atomicity.test.sql` |

### 3.1 Target model (C6–C7 — `0040`–`0048` landed, `0049` landed)

The B2B account and tenancy model agreed on 2026-11-14 replaces the
single-tenant shape above. It is delivered as the migration series
`0040`–`0048`; until a step lands, the current tables stay authoritative.

| Group | Tables | Invariant |
|---|---|---|
| Tenancy | `tenants` | one row per club; `slug` binds the white-label app; `status = 'active'` gates every predicate |
| Identity | `profiles`, `fans`, `staff_members`, `staff_roles` | identity is global; authority is per `(tenant, profile)`; capability flags (`can_manage_staff`, `can_operate_gate`) drive every predicate |
| Catalogue | `venues`, `matches`, `zones`, `seats`, `match_zone_prices` | seats are physical inventory (no status); price is per `(match, zone)` |
| Commerce | `orders`, `order_seats`, `seat_holds`, `refunds` | occupancy is per `(match, seat)`; one ticket per seat; refunds are a ledger, not a status |
| Access | `gates`, `match_gates`, `scan_events` | a gate is physical per venue and assigned per matchday; the scan log is append-only |
| Engagement | `news_items`, `device_tokens` | published-only reads; a device token belongs to a person, not a club |

Every tenant-scoped table carries `tenant_id` and composite FKs
`(id, tenant_id)` — a cross-tenant reference is impossible at the database
level. Decisions: [`ADR-001`](adr/ADR-001-account-model.md),
[`ADR-002`](adr/ADR-002-multi-tenancy.md),
[`ADR-003`](adr/ADR-003-stripe-connect.md),
[`ADR-004`](adr/ADR-004-white-label.md).

## 4. The flows that matter

### 4.1 Buy → pay → pass

```text
seats screen ──create_hold──▶ seat_holds (10 min, unique index)
      │  Continue
      ▼
checkout ──create_order_from_hold──▶ orders (pending, 15 min TTL) + order_seats
      │  Pay
      ▼
stripe-checkout ──▶ Stripe Checkout Session (amount from DB, card only, THB)
      │  webhook (stripe-signature verified)
      ▼
stripe-webhook ──stripe_events (idempotent)──▶ mark_order_paid ──▶ tickets
      │
      ▼
ticket screen ──ticket-qr──▶ KICKOFF-V2 signed payload ──▶ QR rendered
```

Failure paths that must never leave a seat stuck: payment abandoned → order
expires → seats released; app dismissed mid-payment → hold survives until TTL;
webhook retried → `stripe_events` dedupe → one ticket.

The charge runs on the **club's own Stripe account** (Stripe Connect,
[ADR-003](adr/ADR-003-stripe-connect.md)): the club is the merchant of record
and the platform keeps its fee from the same charge. A club that is not
onboarded yet keeps selling on the platform account — the bridge.

### 4.2 Gate scan

`scan-ticket` verifies: signature → ticket exists → ticket's fixture is
assigned to the gate (`match_gates`) → ticket is `valid` → kickoff window →
mark used → write `scan_events`. `Idempotency-Key` makes offline replays safe;
`scan-undo` reverses an accepted scan for 60 s. A scan result code set
(`valid`, `used`, `invalid`, `wrong_match`) is a shared contract.

### 4.3 Refund

`refund-order` (admin JWT) → Stripe refund (**idempotent per order**) →
`mark_order_refunded()` — **one transaction**: order `refunded`, tickets
voided, seats released, audit row. A used pass requires an explicit
override. If the database half fails, the retry returns the same Stripe
refund instead of creating a second one.

### 4.4 Reschedule a kickoff

The rules live in the **shared Zod schema** (`adminRescheduleSchema`), enforced
in the admin UI — no database trigger enforces them (walkthrough decision).
Upcoming-only, future, outside the lock window, never earlier, at most +10
days, reason required. Since migration `0038` the *write* goes through
`admin_update_match()`: the kickoff change and its `{from, to, reason}` audit
row are one transaction, and the database itself refuses a kickoff move
without a reason.

> Known limitation (documented, not hidden): because the rules are client-side,
> a direct PostgREST write could still move a kickoff. Recorded in
> `PLAN.md` → `PB-RESCHEDULE` → Errors / Notes.

### 4.5 Kickoff reminders

`pg_cron` (hourly) → `send-kickoff-reminders` (scheduler secret) → fixtures
starting in 24 h / 2 h → `device_tokens` → Expo Push Service.

## 5. Trust boundaries

| Boundary | Enforcement |
|---|---|
| Browser/app → Postgres | RLS + grants on every table |
| Browser/app → Edge Function | JWT verification + staff/admin role check (`_shared/auth.ts`) |
| Edge Function → Postgres | service role — **no RLS**; authorization is the function's job |
| Scheduler → Edge Function | shared secret, constant-time compare |
| QR payload → gate | HMAC signature over `ticket|match|order|nonce` |
| Payments → Stripe | `stripe-signature` verification + idempotent event ledger |

Full matrix and secrets layout: [`SECURITY.md`](SECURITY.md).

### 5.2 Where the QR contract lives

The signed pass format `KICKOFF-V2:{…}` is implemented **once**, in
`supabase/functions/_shared/qr.ts`. That module owns the prefix, the field
set, the canonical signing string (`v2|tid|mid|oid|n`) and the encoder; every
function that issues or verifies a pass imports it (`ticket-qr`, `scan-demo`,
`scan-ticket`). Nothing assembles the format inline — the hygiene contract
(`scripts/tests/hygiene.test.mjs`) fails the build if a second implementation
appears.

The supporter app never parses or signs a payload — it renders the string the
server returns — so the signing contract cannot drift between tiers.

### 5.3 Where the error vocabulary lives

`packages/shared/src/error-codes.ts` is the canonical error vocabulary.
Supabase deploys only `supabase/functions/**`, so the Edge Functions cannot
import the package at runtime; instead `scripts/sync-error-codes.mjs`
**generates** `supabase/functions/_shared/error-codes.ts` from the canonical
file, and the hygiene contract regenerates and compares, so a hand-edit or a
stale copy fails CI. One source, one generator, no drift.

## 6. Conventions (clean-code standard)

These are the rules a change is expected to follow. They are enforced where a
tool can enforce them (ESLint, `tsc`, CI), and reviewed where it cannot.

### 6.1 Type safety
- `strict: true` plus `noImplicitOverride`, `noFallthroughCasesInSwitch`,
  `noUncheckedIndexedAccess` (an indexed read is `T | undefined`; contracts
  TS-4/TS-5 keep it on).
- **No `any`** — ESLint `@typescript-eslint/no-explicit-any: error`. Use
  `unknown` and narrow, or a Zod schema.
- **No non-null assertions** (`!`) outside generated types — narrow explicitly.
- Database types are **generated**, never hand-written:
  `npx supabase gen types typescript --remote > packages/shared/src/database.types.ts`.

### 6.2 Boundaries and validation
- Every value crossing a trust boundary is parsed by a **Zod schema** in
  `packages/shared/src/schemas.ts` (clients) or `_shared/validate.ts`
  (functions). No ad-hoc `if (!x) throw` for structured input.
- Errors crossing the wire use the **error envelope** (`ErrorCode` +
  `ApiError`), never a raw string or a stack.

### 6.3 Naming and structure
- Files are kebab-case; components are PascalCase; hooks are `useX`.
- One domain per file: a screen owns its screen, a query module owns its
  entity.
- Queries live in `lib/queries/<domain>.ts` and are the **only** place that
  touches Supabase tables from a client.
- Money is **integer minor units** everywhere; formatting goes through
  `shared/money.ts` (`formatMoney`, scale from `minorUnitScale()`). No floats,
  no `/100` at call sites.
- No `console.log` — ESLint `no-console` allows only `warn`/`error`; use the
  function logger.

### 6.4 State and effects
- Server state lives in React Query, never in local component state.
- Mutations invalidate the queries they affect and surface failures to the
  user (no silent `catch`).
- Local persistence is only for: the auth session (SecureStore) and, in
  future, cached pass payloads (`GAP-01`).

### 6.5 Database
- Schema changes are **migrations only** — never manual edits on a database.
- Every new table ships with RLS enabled, a policy per role, matching
  grants, and a pgTAP assertion.
- Every privileged SQL function is `security definer` with
  `set search_path = public`.
- Anything money-bearing is idempotent and audit-logged.

### 6.6 Testing
- One behaviour per test; the test name states the behaviour.
- Contract tests live in `scripts/tests/` and assert *shape* across the repo
  (a README count, a route table, a migration shape).
- Behaviour tests live with the code they cover
  (`packages/shared/src/__tests__/`) or in the database (`supabase/tests/`).
- A bug fix starts with a failing test that reproduces it.

### 6.7 Documentation
- One fact, one home. The README never restates what a linked document owns.
- Documentation drift fails CI (`scripts/tests/docs.test.mjs`).
- Decisions that change the shape of the system are recorded in
  `PLAN.md` → Decision index, with the reasoning.

### 6.8 Single source of truth
- A value that more than one tier needs lives in exactly one place: the
  shared package for client-visible constants, SQL for server-computed ones,
  `_shared/` for the server contract.
- When a runtime boundary makes sharing impossible (Supabase deploys only
  `supabase/functions/**`), the deployed copy is **generated**, never
  hand-written, and CI compares it with the source.
- Drift between two copies of the same fact is a failing test, not a code
  review comment.

### 6.9 Logging
- One convention, one owner: `createLogger('<scope>')` from
  `packages/shared/src/logging.ts` — exactly one JSON line per event
  (`level`, `message`, `time`, `scope`, then the caller's context).
- Every value passes the redactor before it is emitted: secret-looking keys
  become `[redacted]`, `Error` values serialise to `{ name, message, stack }`
  (plain `JSON.stringify` would print `{}`), and recursion is capped.
- The Edge Functions receive a **generated copy** (`_shared/logger.ts`),
  because they cannot import `@kickoff/shared` at deploy time (§6.8); the
  copy is drift-checked by contract.
- Raw `console.*` is banned everywhere else: ESLint `no-console: ["error"]`
  with no `allow` in both apps, and deno `no-console` in the functions (the
  generated logger emits through its own module-scoped `console`, so it needs
  no ignore directive — every other function trips the rule on the global).
  Contract: `scripts/tests/logging.test.mjs` (LG-1…LG-4).

### 6.10 Authorization
- The role vocabulary is exactly `customer` | `gatekeeper` | `admin`
  (D-20), owned by `packages/shared/src/roles.ts` and generated into
  `supabase/functions/_shared/roles.ts` (§6.8). The database mirrors it in the
  `profiles_role_check` constraint.
- Two SQL predicates read the JWT claim and nothing else:
  `public.is_admin()` (admin only) and `public.is_staff()` (admin or
  gatekeeper). RLS keeps every operational table behind `is_admin()`; only
  `gates` (read), the caller's own `scan_events`, and tickets the caller
  scanned open to a gatekeeper.
- Edge Functions use `requireAdmin` everywhere except `scan-ticket` and
  `scan-undo`, which use `requireStaff`. The SQL gate functions repeat the
  check and refuse a scan filed under another user's id.
- The console applies the same boundary twice: the Next proxy admits staff and
  confines a gatekeeper to `/dashboard/scan`, and the dashboard layout filters
  the navigation. The database remains the final authority.
- Contract: `scripts/tests/staff-roles.test.mjs` (SR-1…SR-7),
  `scripts/tests/admin-access.test.mjs` (AA-1…AA-7), and
  `supabase/tests/staff-roles.test.sql`.

## 7. Decision index

| # | Decision | Why | Where |
|---|---|---|---|
| D-01 | Holds and orders are RPCs, not client-side transactions | seat integrity under concurrency | `0019`, `0020` |
| D-02 | Amounts computed server-side from the database | the client must never price a ticket | `stripe-checkout` |
| D-03 | Stripe webhooks are idempotent via `stripe_events` | Stripe retries | `0015`, `stripe-webhook` |
| D-04 | QR payload is HMAC-signed and server-generated | tamper-evident entry | `_shared/qr.ts` |
| D-05 | Staff authorization is a JWT claim (`app_metadata.role`) | RLS cannot read the app JWT | `0001`, `0018`, `0039` |
| D-06 | Reschedule rules live in shared Zod + UI, **no trigger/RPC** | walkthrough decision; the audit trail carries the reason | `0037`, `PB-RESCHEDULE` |
| D-07 | Venues normalized into a table with a FK | free-text venues could not be managed | `0035`, `0036` |
| D-08 | Edge Functions refuse non-`sk_test_` Stripe keys | Stripe test mode only, enforced | `_shared/config.ts` |
| D-09 | Shared package holds contracts, not UI state | one place for schemas/DTOs | `packages/shared` |
| D-10 | The QR contract lives only in `_shared` | the app renders, never parses, payloads | §5.2 |

## 8. Extension points (B2B roadmap)

| Workstream | Shape of the change | Notes |
|---|---|---|
| Multi-tenancy (`GAP-02`) | `clubs` table + `club_id` on every tenant table, `is_club_member(club_id)` RLS helper, per-club settings/branding/currency | the single biggest change; needs a data-migration plan and an RLS rewrite |
| Staff roles (`GAP-03`) | `roles`/`permissions` tables, `user_roles(club_id, user_id, role)`, function-level checks | **GAP-03a delivered** the two-role scope (`admin` \| `gatekeeper`, migration `0039`); richer per-club RBAC remains |
| Observability (`GAP-04`) | structured logger with request IDs, error tracking, metrics push, alerts | the `_shared/logger.ts` seam already exists |
| Locale & currency (`GAP-05`) | per-club locale + currency columns, `money.ts` gains a currency argument | the unused English string table was removed in Phase C2; localization must be rebuilt per tenant |
| Error tracking & tracing | request id propagation from client → function → logs | `ApiError.requestId` already carries it |

## 9. Operational pointers

| Task | Where |
|---|---|
| Local stack | `npx supabase start` · `npm run db:reset` · `npm run db:seed-demo` |
| Database tests | `npm run db:test` (local) · `bash scripts/run-pgtap.sh` (hosted) |
| Edge function checks | `npm run functions:check` · `cd supabase/functions && deno lint && deno test` |
| Gates | `npm test` · `npm run check` · `npm run check:no-mocks` · `npm run build:admin` |
| Deploy | `npx supabase db push --remote` · `npx supabase functions deploy <name>` |
| Demo walkthrough | `README.md` → *Demo script* |
