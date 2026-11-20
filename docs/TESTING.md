# TESTING — KickOff

Every layer has one command. CI runs the same commands; if a change breaks a
gate locally it will break the build.

## Quick reference

| Layer | Command | What it proves |
|---|---|---|
| Workspace unit tests | `npm test` | shared schemas/format/i18n/greeting (Vitest), admin node tests, mobile Jest tests, repo script tests |
| Typecheck + lint | `npm run check` | TypeScript across shared/mobile/admin, ESLint |
| Database (pgTAP) | `npm run db:test` | RLS matrix, order expiry, seat holds, scan concurrency, reschedule/refund atomicity, staff-role boundary, tenant provisioning, identity split, tenancy columns, sales restructure, gate ops, tenant isolation, per-club uniques, Stripe Connect, tenant export and erase, the platform authority, observability, the match clock, venue layout, stand-level gates atomic fixture creation and the retention windows (458 assertions, 30 suites) |
| Edge Functions (unit) | `cd supabase/functions && deno test --allow-env --allow-net tests/` | HMAC, config, error mapping, metrics helpers |
| Edge Functions (integration) | `npm run test:integration` | local checkout → webhook → ticket → receipt, scan/undo, refunds |
| Functions typecheck | `npm run functions:check` | `deno check` on every `supabase/functions/*/index.ts` |
| Admin E2E | `npm run test:e2e --workspace @kickoff/admin` | Playwright: auth + full ops walkthrough |
| Mobile smoke | `maestro test maestro/flows/buy-ticket.yaml` | buy flow up to Pay + signed QR pass |
| Expo dependency check | `npm run deps:check --workspace @kickoff/mobile` | SDK 58 compatibility — no patch drift between expo and its native modules |
| MVP gate | `node scripts/mvp-gate.mjs` | 15 launch-critical facts still true |
| No-mocks guard | `npm run check:no-mocks` | the Phase A mock layer cannot return |

## 1. Workspace unit tests — `npm test`

Runs every workspace `test` script, then the repository script tests:

- `packages/shared` uses **Vitest** (`src/**/*.test.ts`): schemas, money,
  formatting, QR, the English string table (`P11-07`) and the Bangkok greeting
  (`P11-12`).
- `apps/admin` uses `node --test tests`.
- `apps/mobile` uses **Jest** with the `jest-expo` preset and React Native
  Testing Library (`src/**/__tests__/*-test.ts(x)`). Native modules are mocked
  by the preset; `jest.setup.ts` pins the Supabase env to localhost so a unit
  test can never reach a real project. CI runs this workspace too. `BOOT-1`
  renders `RootLayout` with fonts still loading — the boot splash reads the
  club locale through React Query, so it must render inside the providers
  (C10.2 shipped it outside them, and every cold start threw *No QueryClient
  set*).
- `scripts/tests/*.test.mjs` are source-level contract tests run with
  `node --test scripts/tests/`. The C10.4 push-hardware contracts
  (`PUSH-HW-1…PUSH-HW-8`) pin the client/server push configuration, the
  hardware procedure in `RUNBOOK` §11 and the recorded Android run that closed
  `GAP-06` (device, OS, token prefix, tray screenshot). The contracts cannot
  deliver a push themselves — the evidence file is what stands in for that. `BRAND-1…BRAND-5`
  pin the icon set: the app config's paths exist, the store tile is a 1024
  square with no alpha, the splash and adaptive marks keep theirs, every
  in-app logo renders the crest, and the set stays inside its size budget.
  The Phase 11 mobile contracts (Maestro flow,
  tab a11y, analytics adapters, settings confirms) are still asserted here.

Run a single file:

```bash
node --test scripts/tests/phase11.test.mjs
cd packages/shared && npx vitest run src/__tests__/i18n.test.ts
```

## 2. Typecheck and lint — `npm run check`

`npm run typecheck` runs `tsc --noEmit` in shared, mobile and admin; `npm run
lint` runs ESLint/Expo lint. The admin typecheck includes `e2e/`, so a broken
Playwright selector type fails the build.

## 3. Database — pgTAP

```bash
npm run db:test          # or: bash scripts/run-pgtap.sh
```

The script prefers a local Supabase/Docker instance and falls back to running
the same SQL against the hosted project when Docker is unavailable. It applies
the `supabase/tests/*.sql` suites and reports pass/fail per assertion.

**458 assertions across 30 suites**, verified against the local stack on
2026-11-19: constraints, hold concurrency, hold TTL, order expiry, reschedule
audit, RLS (auth + anonymous), scan concurrency, seat reservation, venues, the
F-07 atomicity suite (reschedule and refund), the GAP-03a staff-role suite
(`admin` / `gatekeeper` authority and the gate RLS boundary), the C6.1 tenant
suite (`tenants`, `current_tenant()`, `minor_units()`,
`provision_tenant()` and its club time zone), the C6.2 identity suite (`fans`, per-tenant
`staff_roles`, `staff_members`, the membership as the authority and the
service-role promotion helper), the C6.3
tenancy suite (`tenant_id` columns, composite foreign keys, tenant-led
indexes), the C7.1 sales suite (derived seat occupancy without
`seats.status`, `match_zone_prices`, the refund ledger, order snapshots),
the C7.2 gate-ops suite (venue-bound gates, the `match_gates` assignment
join, the scan/undo audit columns and the append-only scan log), the C7.3
isolation suite (T-01…T-24 — a cross-tenant read and a cross-tenant write
per scoped table) and the C7.4 uniques suite (U-1…U-13 — the same name may
exist in two clubs, never twice in one, in the exact shape the console and
the seed write), the C8.1 Connect suite (CN-1…CN-16 — the platform fee in
minor units, the club a connected account belongs to, the event ledger and
the parameters that accept null), the GAP-09 tenant-export suite (EX-0,
ER-1…ER-7 — a club's archive covers every tenant-scoped table in the schema,
structurally) and the GAP-09 tenant-erase suite (EE-0…EE-7 — the human money
gate, the purge and the tombstone) and the C9 platform suite (PF-1…PF-32 —
the platform authority's two projections, the guarded registry/status/fee
RPCs, provisioning and the tombstone rules) and the C10.1 observability
suite (OE-1…OE-9 — the durable error record's lockdown and its two
scheduled jobs), the C10.5 match-clock suite (the enum values, the clock
transitions and the result RPC), the C10.6 seating-lock suite (inventory is
frozen once a fixture starts), the C10.9 gate-zone suite (GZ-1…GZ-12 —
stand-level gates, the `wrong_zone` refusal that does not consume a pass,
and the clone provenance) and the C10.10 create-match-full suite
(CMF-1…CMF-22 — one atomic call builds a fixture with a new or existing
venue, generated stands, inline gates and per-fixture prices, and rolls the
whole draft back on refusal).

Read assertions run under `set local role authenticated`: the runner's
`postgres` session bypasses RLS, so a policy can only be proven from a role
it applies to. The claims in the pre-existing suites carry no `tenant_id`,
which is exactly what exercises `current_tenant()`'s default-club fallback;
only the isolation suite sets a tenant claim.

**Why the runner exists.** The two concurrency suites open their worker
sessions through `dblink`, which reconnects over the network. Both the local
stack and the hosted project map that path to `scram-sha-256`, so the workers
need a password; without one every worker is refused with *"password or
GSSAPI delegated credentials required"* and the suites fail before their
first assertion. The runner therefore sets `kickoff.dblink_password`, which
the suites read. Locally the password comes from the stack's own `DB_URL`; on
the hosted project from `SUPABASE_DB_PASSWORD`. It is read at runtime and is
never committed.

**How the password is handled.** It never reaches a SQL literal, a file or
the command line: the runner keeps it in the environment, `psql` reads it
itself (`\getenv`) and quotes it (`:'name'`), and the connection string the
runner hands to `psql` carries no password at all. A password containing a
quote therefore cannot break the statement.

**Tenant isolation (C7, planned).** The multi-tenant series adds a pgTAP
suite (T-01…T-24): for every tenant-scoped table, a second club's user must
read 0 rows and its write must affect 0 rows or raise; a cross-tenant
composite-FK insert must raise a foreign-key error even as the service role.
The harness sets `request.jwt.claims` per simulated user, exactly as
`rls-auth.test.sql` already does.

## 3b. Availability and restore drill

```bash
# Seat-map p95 (20 reads, 300 ms budget).
npm run perf:seat-latency

# One availability probe; records a row and exits 1 below 99.5 %.
npm run availability:probe

# Dump → scratch restore → count check → pgTAP against the restored copy.
bash scripts/restore-drill.sh --fresh
```

`availability_probes` is a platform-only table; `availability_monthly` is the
SLO view, and `metrics` exposes `availability.pct`/`met`. The probe runs in the
integration suite, so a broken health endpoint fails the build. The restore
drill is a CI step; the observability suite is skipped there because `pg_cron`
only exists in the cluster's configured database (its jobs are migration-owned).

## 4. Edge Functions

Unit tests (no network required for most suites):

```bash
cd supabase/functions
deno test --allow-env --allow-net tests/
```

The executed integration suite runs on every push against the local stack:

```bash
npm run test:integration
```

`scripts/run-integration.sh` resets the local database, starts Stripe and Expo
push stub containers, serves the functions, seeds the demo fan/admin, moves the demo
fixtures into the future and runs `orders`, `webhook`, `scan`, `refund-order`,
`account-lifecycle`, `mfa`, `fixture-admin`, `settings`, `metrics-integration`, `news-admin` and `push-delivery`. The Stripe stub
accepts `sk_test_` keys only and the webhook is signed locally, so no live
money can move. Push is sent to the local Expo stub, which records the batch
for assertions. Password-reset and signup-confirmation mail is read from
Mailpit; TOTP is enabled in the local `[auth.mfa.totp]` config for `mfa.test.ts`.
To run a single suite against a hosted project instead, export
`RUN_INTEGRATION=1` plus the Supabase, Stripe and demo credentials and use
`deno test` directly.

The suites create and then delete their own users, orders, fixtures, articles
and scan events (`tests/_commerce.ts`, `tests/scan.test.ts`).

Typecheck every function:

```bash
npm run functions:check
```

## 5. Admin E2E — Playwright

```bash
npm run test:e2e --workspace @kickoff/admin
```

`playwright.config.ts` starts `next start` automatically unless
`PLAYWRIGHT_BASE_URL` is exported. Credentials come from `E2E_ADMIN_EMAIL` /
`E2E_ADMIN_PASSWORD` (falling back to `NEXT_PUBLIC_DEMO_*`); the suite skips
itself when neither is set.

- `e2e/auth.spec.ts` — wrong password, sign in/out, TOTP challenge. Run the
  local MFA redirect against the real browser with
  `bash scripts/run-admin-mfa-e2e.sh` (builds the admin against the local
  stack, creates a fresh admin, enrols TOTP and deletes it afterwards).
- `e2e/ops.spec.ts` — signs in, creates a fixture through the UI, provisions a
  stable `e2e-gate` on the seeded pass, scans the demo pass, exports the orders
  CSV and (when keys are available) refunds a paid order.
  - The fixture is created and deleted by the spec. The gate is created once and
    reused: gates with scan history are `ON DELETE RESTRICT` to protect the audit
    trail, so the spec never deletes it.
  - The refund case provisions its own order: it needs
    `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
    `STRIPE_SECRET_KEY` exported; otherwise that test is skipped, not failed.
  - The scan stage accepts a valid admission **or** a documented gate-window
    rejection, because the seeded fixture may be outside kick-off ±2h.

List tests without running them:

```bash
cd apps/admin && npx playwright test --list
```

## 6. Mobile smoke — Maestro

`maestro/flows/buy-ticket.yaml` (P11-06) walks: launch → demo sign-in → home →
fixture → zone → seat → hold → Checkout → back out → My tickets → signed QR.

```bash
maestro test maestro/flows/buy-ticket.yaml
```

Prerequisites: a development build (app id `app.kickoff.fan`) or Expo Go, the
demo-account env vars exported, and seeded demo data (`npm run db:seed-demo`).
The flow stops at Pay on purpose — Stripe Checkout opens in a Custom Tab, and
card completion is covered by the Playwright refund walkthrough instead.

> The Maestro CLI is not installed in this repository's default toolchain. Add
> it with `curl -Ls "https://get.maestro.mobile.dev" | bash` before running the
> flow locally; CI does not run it yet.

## 7. Launch gates

```bash
node scripts/mvp-gate.mjs       # 15/15 launch facts
npm run check:no-mocks          # mock layer cannot be re-imported
npm run functions:check         # every Edge Function typechecks
```

## 8. CI

`.github/workflows/ci.yml` runs, in order: install → typecheck/lint → workspace
and script tests → local Supabase stack → DB lint → pgTAP → Deno function
checks → executed Edge integration suite (local Stripe/Expo stubs) → restore drill → admin build → local MFA redirect E2E →
Playwright (`auth` and `ops`) when the `E2E_ADMIN_*` secrets exist → MVP gate.

The Edge integration suite needs no repository secrets; the hosted E2E suites
still skip themselves when their secrets are absent.

## 9. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Playwright cannot start `next start` | run `npm run build:admin` first, or set `PLAYWRIGHT_BASE_URL` |
| `ops.spec.ts` refund test skipped | `SUPABASE_SERVICE_ROLE_KEY` / `STRIPE_SECRET_KEY` not exported |
| Scan E2E shows “gate window has closed” | expected outside kick-off ±2h; the spec accepts it |
| pgTAP falls back to hosted | Docker/podman not running — the fallback is the supported path here |
| pgTAP: “password or GSSAPI delegated credentials required” | the runner could not set `kickoff.dblink_password` — check that the stack is up and `SUPABASE_DB_PASSWORD` is exported on the hosted path |
| Deno integration tests ignored | set `RUN_INTEGRATION=1` plus the Supabase/Stripe/demo env vars |
| `functions deploy` fails with `Relative import path "zod" not prefixed` | Docker is absent, so the API bundler needs the import map: `npx supabase functions deploy --import-map supabase/functions/deno.json --yes --remote=<ref>` |

## 10. Pending acceptance — REQ-046 (custom staff roles)

`REQ-046` / `GAP-11` / `NFR-10` are **open**: a club cannot define its own
staff roles yet. The tests below are the definition of done. They are listed
here and registered in `scripts/tests/rbac-acceptance.test.mjs` as
`test.todo`, so `npm test` stays green without pretending the behaviour exists.

| ID | Acceptance | Status |
|---|---|---|
| `RBAC-1` | Create a custom role with a capability subset; duplicate code `409`, reserved code `422`; one audit row. | **pending** |
| `RBAC-2` | `admin` seeds all ten capabilities; `gatekeeper` seeds `operate_gate`; built-ins are immutable; unknown capability `422`. | **pending** |
| `RBAC-3` | Assign a custom role: membership + claim agree and access equals the capability set; assign Customer removes the membership. | **pending** |
| `RBAC-4` | No privilege escalation, no self-demotion, last `manage_staff` holder protected. | **pending** |
| `RBAC-5` | Cross-tenant role read/write returns `404`/`23503`/`42501` and leaks no row. | **pending** |
| `RBAC-6` | Authorization is capability-driven; no literal `admin`/`gatekeeper` branch. | **pending** |
| `RBAC-7` | Claim-write failure restores the membership; change applies at the next token refresh and the console says so. | **pending** |
| `RBAC-8` | Users screen lists club roles + Customer; Roles screen validates; docs stay `open` until 1–7 pass. | **pending** |

**/testgen convention.** Emit each ID with `status: "pending"` and the
requirement ID `REQ-046`. A generated test is `todo` with the reason
`REQ-046 not implemented`. `scripts/tests/rbac-docs.test.mjs`
(`RBAC-D1…RBAC-D6`) fails if a pending ID is removed or a document claims the
feature shipped while it is open. When the feature lands, the requirement flips
to `shipped`, the `todo` becomes a real test, and this table is deleted in the
same change.
