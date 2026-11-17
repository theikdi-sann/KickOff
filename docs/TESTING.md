# TESTING — KickOff

Every layer has one command. CI runs the same commands; if a change breaks a
gate locally it will break the build.

## Quick reference

| Layer | Command | What it proves |
|---|---|---|
| Workspace unit tests | `npm test` | shared schemas/format/i18n/greeting (Vitest), admin node tests, mobile Jest tests, repo script tests |
| Typecheck + lint | `npm run check` | TypeScript across shared/mobile/admin, ESLint |
| Database (pgTAP) | `npm run db:test` | RLS matrix, order expiry, seat holds, scan concurrency, reschedule/refund atomicity, staff-role boundary, tenant provisioning, identity split, tenancy columns, sales restructure, gate ops, tenant isolation, per-club uniques, Stripe Connect, tenant export (320 assertions, 21 suites) |
| Edge Functions (unit) | `cd supabase/functions && deno test --allow-env --allow-net tests/` | HMAC, config, error mapping, metrics helpers |
| Edge Functions (integration) | `RUN_INTEGRATION=1 deno test --allow-env --allow-net tests/` | real checkout → webhook → ticket → receipt, scan/undo |
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
  test can never reach a real project. CI runs this workspace too.
- `scripts/tests/*.test.mjs` are source-level contract tests run with
  `node --test scripts/tests/`. The Phase 11 mobile contracts (Maestro flow,
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

**320 assertions across 21 suites**, verified against the local stack on
2026-11-17: constraints, hold concurrency, hold TTL, order expiry, reschedule
audit, RLS (auth + anonymous), scan concurrency, seat reservation, venues, the
F-07 atomicity suite (reschedule and refund), the GAP-03a staff-role suite
(`admin` / `gatekeeper` authority and the gate RLS boundary), the C6.1 tenant
suite (`tenants`, `current_tenant()`, `minor_units()`,
`provision_tenant()`), the C6.2 identity suite (`fans`, per-tenant
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
the seed write) and the C8.1 Connect suite (CN-1…CN-13 — the platform fee in
minor units, the club a connected account belongs to, and the event ledger).

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

## 4. Edge Functions

Unit tests (no network required for most suites):

```bash
cd supabase/functions
deno test --allow-env --allow-net tests/
```

Integration tests are opt-in and hit a real project:

```bash
cd supabase/functions
set -a && . ../../.env && set +a
RUN_INTEGRATION=1 deno test --allow-env --allow-net tests/orders.test.ts
```

They create and then delete their own orders/scan events (`tests/_commerce.ts`,
`tests/scan.test.ts`).

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

- `e2e/auth.spec.ts` — wrong password, sign in/out, optional TOTP.
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
and script tests → local Supabase stack → DB lint → pgTAP → Deno function checks
→ admin build → Playwright (`auth` and `ops`) when the `E2E_ADMIN_*` secrets
exist → MVP gate.

E2E and integration suites skip themselves when their secrets are absent, so
pull requests without secrets still pass the deterministic layers.

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
