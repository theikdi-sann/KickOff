# PLAN — KickOff B2B

The delivery plan and decision record for KickOff. This file is the **single
source of truth for project state**: what is done, what is open, and why we
built it that way. The task-level history of the original build lives in
[`docs/archive/PLAN-history.md`](docs/archive/PLAN-history.md).

- **Status:** active — Phase C (production hardening) in progress.
- **Product direction:** B2B — one platform, many football clubs.
- **Last verified:** 2026-11-13 · **Owner:** engineering
- **Related:** [`REQUIREMENTS.md`](docs/REQUIREMENTS.md) ·
  [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) ·
  [`SECURITY.md`](docs/SECURITY.md) ·
  [`TESTING.md`](docs/TESTING.md)

---

## Current status

| Phase | Scope | Status |
|---|---|---|
| 0–12 | Foundations, data layer, edge functions, identity, catalogue, commerce, verification, admin console, mobile, quality | ✅ complete — [`docs/archive/PLAN-history.md`](docs/archive/PLAN-history.md) |
| A | Walkthrough fixes — commerce integrity | ✅ complete |
| B0 | Walkthrough fixes — checkout & seat-state hardening | ✅ complete |
| B | Walkthrough fixes — remaining punch list (#1–#13) | ✅ complete |
| **C** | **Production hardening — cleanup, enterprise standards, B2B readiness** | 🔄 **in progress** |

### Phase C — Production hardening (active)

Goal: take a working prototype to a **B2B enterprise product** — one source of
truth in the code, documentation that cannot drift, and the multi-tenant
capability the business model requires.

| Workstream | Scope | Status |
|---|---|---|
| **C1 — Documentation baseline** | Merge proposal + brainstorm into `REQUIREMENTS.md`; add `ARCHITECTURE.md`; delete stale/duplicate docs; make doc drift a failing test | ✅ complete |
| **C2 — Code hygiene & single source of truth** | Delete the dead contract cluster in `packages/shared`; one implementation of the QR contract, the error envelope and business constants; remove redundant files | ✅ complete |
| **C3 — Flow-by-flow audit** | 29 user flows × 6 questions (entry, trust boundary, validation, failure path, audit, test proof) → findings table in [`docs/FLOW-AUDIT.md`](docs/FLOW-AUDIT.md), fixes as separate cycles | 🔄 in progress — audit done (F-01…F-23); only F-07 remains |
| **C4 — Clean-code standard** | Stricter compiler flags (`noUncheckedIndexedAccess`), lint rules, logging conventions, dead-code guard, dependency hygiene | 🔄 in progress — C4.1–C4.7 done (file coverage, sweep fixes, the type-safety standard, the local database gate, the authoritative availability view, the mobile test harness, the shared validation contracts); the compiler flags, logging conventions and dependency hygiene remain |
| **C5 — B2B readiness** | Multi-tenancy, staff roles, observability, locale/currency (see below) | ⬜ queued |

### Phase C delivery log

One line per cycle, newest last. The detail lives in the commit history and in
[`docs/FLOW-AUDIT.md`](docs/FLOW-AUDIT.md).

| Cycle | Summary | Files |
|---|---|---|
| **C2** | Dead contract cluster deleted; the QR contract, the error vocabulary and the business constants each got exactly one owner (the deployed error-code copy is generated, not hand-written). | `packages/shared/src/{error-codes,http,constants,mappers}.ts`, `supabase/functions/_shared/{error-codes,qr}.ts`, `supabase/functions/ticket-qr/index.ts`, `scripts/sync-error-codes.mjs`, `scripts/tests/hygiene.test.mjs` |
| **C3.1** | Plan truthfulness enforced: PLAN.md may not point at files that do not exist, may not call a delivered workstream pending, and keeps an Errors / Notes section. | `scripts/tests/docs.test.mjs`, `PLAN.md` |
| **C3.2** | Row→DTO mapping has one owner — the shared package — and the order/ticket mappers are unit-tested; the apps stopped mapping rows themselves. | `packages/shared/src/mappers.ts`, `packages/shared/src/__tests__/mappers.test.ts`, `apps/mobile/src/lib/queries/{orders,tickets}.ts`, `apps/admin/src/lib/queries/orders.ts` |
| **C3.3** | **F-10 (Critical)** — a staff role change now writes the profile row *and* the JWT claim together, the last-admin guard counts admins that can act, and the console says when the new role applies. | `supabase/functions/_shared/roles.ts`, `supabase/functions/admin-users/index.ts`, `supabase/functions/tests/roles.test.ts`, `scripts/tests/staff-roles.test.mjs`, `apps/admin/src/lib/queries/users.ts`, `apps/admin/src/app/dashboard/users/page.tsx` |
| **C3.4** | The flow-by-flow audit is documented: 29 flows × 6 questions, 17 findings with severities and a fix order. | `docs/FLOW-AUDIT.md`, `README.md` |
| **C3.5** | The supporter app fails loudly: the fixtures and news lists have their own error state, the pass screen shows the real reason, and a failed sign-out is reported. | `apps/mobile/src/app/{fixtures,news}.tsx`, `apps/mobile/src/app/ticket/[id].tsx`, `apps/mobile/src/app/(tabs)/profile.tsx`, `scripts/tests/mobile-resilience.test.mjs` |
| **C3.6** | The offline scan queue can no longer lose a pass silently: unreadable entries are quarantined and reported to the gate operator, and the admin console gained a real unit-test harness (Node runs the TypeScript tests directly). | `apps/admin/src/lib/offline-queue.ts`, `apps/admin/src/lib/queries/scan.ts`, `apps/admin/src/app/dashboard/scan/page.tsx`, `apps/admin/tests/offline-queue.test.ts`, `apps/admin/tsconfig.json` |
| **C3.7** | **F-05, F-06, F-08, F-16** — every privileged admin change (fixture, zone, seat, venue, gate, news, settings, CSV export) is recorded in `audit_logs` from one shared vocabulary, and the zone rollback no longer hides a failed delete. | `apps/admin/src/lib/audit.ts`, `apps/admin/src/lib/queries/{matches,venues,gates,news,settings}.ts`, `apps/admin/src/app/dashboard/{tickets,settings}/page.tsx`, `scripts/tests/audit-coverage.test.mjs` |
| **C3.8** | **F-09** — the staff console is gated server-side: the proxy refuses a signed-in non-admin, the layout never renders the console shell for one, and the operator is told why. | `apps/admin/src/proxy.ts`, `apps/admin/src/app/dashboard/layout.tsx`, `apps/admin/src/app/login/page.tsx`, `scripts/tests/admin-access.test.mjs`, `docs/SECURITY.md` |
| **C3.9** | **F-13** — the scan statistics have one source: the aggregate counts its window server-side, the browser no longer pulls the scan history, and every label states the window it covers. | `supabase/functions/orders-aggregate/index.ts`, `apps/admin/src/lib/queries/scan.ts`, `apps/admin/src/lib/queries/orders.ts`, `apps/admin/src/app/dashboard/overview.tsx`, `apps/admin/src/app/dashboard/scan/page.tsx`, `apps/admin/src/app/dashboard/tickets/page.tsx`, `scripts/tests/scan-stats.test.mjs` |
| **C4.1** | **File coverage for the whole repository** — every tracked file now carries a verdict (kind, verdict, note) in `docs/FILE-INDEX.md`, and a new file must be reviewed before the suite is green again. | `docs/FILE-INDEX.md`, `scripts/build-file-index.mjs`, `scripts/tests/file-coverage.test.mjs` |
| **C4.2** | **F-18 … F-23** — the sweep's six real bugs are fixed: the unauthenticated Stripe probe, the dead analytics module, the template leftovers, the undocumented env variable, the misclassified `TypeError` and the PostgREST filter injection. | `supabase/functions/health/index.ts`, `supabase/functions/_shared/probe.ts`, `apps/mobile/src/lib/analytics.ts` (deleted), `apps/admin/public/*.svg` (deleted), `apps/mobile/LICENSE` (deleted), `apps/admin/src/lib/scan-api.ts`, `apps/admin/src/lib/search.ts`, `apps/admin/src/lib/queries/orders.ts`, `apps/admin/.env.local.example`, `apps/mobile/.env.example`, `scripts/tests/sweep-fixes.test.mjs` |
| **C4.3** | **F-15** — the type-safety standard is now enforced: every non-null assertion is replaced by an explicit narrowing through `requireDefined`, and ESLint forbids the assertion from returning. | `packages/shared/src/require.ts`, `packages/shared/src/index.ts`, `apps/admin/eslint.config.mjs`, `apps/mobile/eslint.config.js`, `apps/admin/src/lib/queries/{matches,orders,scan}.ts`, `apps/mobile/src/lib/queries/{holds,matches,news,orders,seats,tickets}.ts`, `apps/admin/src/app/dashboard/scan/page.tsx`, `apps/mobile/src/app/{legal/[doc],orders,seats/[matchId]}.tsx`, `supabase/functions/devices/index.ts`, `supabase/functions/tests/{scan,orders}.test.ts`, `apps/admin/e2e/ops.spec.ts`, `scripts/tests/type-safety.test.mjs` |
| **C4.4** | The database gate runs locally and automatically: the runner supplies the dblink workers' password, so both concurrency suites pass on the local stack — 61/61 assertions across 10 suites. | `scripts/run-pgtap.sh`, `scripts/pg-url-parts.mjs`, `package.json`, `.github/workflows/ci.yml`, `docs/TESTING.md`, `README.md`, `scripts/tests/db-gate.test.mjs` |
| **C4.5** | **F-17** — capacity, free seats and sell-through now come from the authoritative `zone_availability` view, never from the browser-side zone layout: a seat reserved by a pending order is not available, and the layout cannot know that. The shared package owns the mapping and the arithmetic, both apps read the same view, and loading or failed counts are no longer rendered as "SOLD OUT" or zero. | `packages/shared/src/availability.ts`, `packages/shared/src/__tests__/availability.test.ts`, `apps/admin/src/lib/queries/matches.ts`, `apps/admin/src/app/dashboard/{overview.tsx,matches/page.tsx,matches/[id]/page.tsx}`, `apps/mobile/src/lib/queries/seats.ts`, `apps/mobile/src/app/{match/[id].tsx,(tabs)/index.tsx}`, `scripts/tests/availability.test.mjs` |
| **C4.6** | **F-14** — the supporter app has a real unit-test harness: `jest-expo` and React Native Testing Library run under `npm test`, CI runs the mobile workspace, the first tests prove the profile mapping (`initialsFor`, `profileFromUser`) and render a component through React Native Testing Library, instead of an `echo` that was green while proving nothing. | `apps/mobile/package.json`, `apps/mobile/tsconfig.json`, `apps/mobile/jest.setup.ts`, `apps/mobile/src/lib/__tests__/auth-test.ts`, `apps/mobile/src/components/__tests__/ui-test.tsx`, `.github/workflows/ci.yml`, `scripts/tests/mobile-tests.test.mjs` |
| **C4.7** | **F-11** — the shared Zod contracts are now the validation every consumer uses: the mobile auth screens parse through `signInSchema`/`signUpSchema`/`emailSchema`/`passwordSchema` and the profile editor through `profileUpdateSchema` (the ad-hoc `includes('@')` checks are gone), the staff order pager through `paginationSchema`, and `refund-order` consumes the generated copy of the canonical refund schema instead of a hand-typed duplicate. Schemas with no consumer were deleted, and the register screen's two-character name rule moved into `signUpSchema` so every client enforces it. | `packages/shared/src/schemas.ts`, `packages/shared/src/refund.ts`, `packages/shared/src/__tests__/schemas.test.ts`, `scripts/sync-edge-schemas.mjs`, `supabase/functions/_shared/refund.ts`, `supabase/functions/refund-order/index.ts`, `apps/mobile/src/app/(auth)/{login,register,forgot-password,reset-password}.tsx`, `apps/mobile/src/app/profile/edit.tsx`, `apps/admin/src/lib/queries/orders.ts`, `scripts/tests/schema-usage.test.mjs` |

## Open work

### B2B hardening track (in `REQUIREMENTS.md` §6 as gaps)

| Gap | What it needs | Why it blocks B2B | Order |
|---|---|---|---|
| **GAP-02** Multi-tenancy | `clubs` table, `club_id` on tenant tables, `is_club_member()` RLS helper, per-club settings/branding/currency, data migration, RLS rewrite | Every club must be isolated; one deployment = one customer today | 1 |
| **GAP-03** Staff roles | `roles` + `permissions`, `user_roles(club_id, user_id, role)`, function-level authorization | Today every staff member is a full admin (can refund, reschedule, edit settings) | 2 |
| **GAP-04** Observability | structured logger with request IDs, error tracking, metrics push, alerting | Incidents are currently found by users | 3 |
| **GAP-05** Locale & currency | per-club locale/currency, `money.ts` takes a currency | Multi-country clubs | 4 |
| **GAP-01** Offline pass | cache the signed payload locally; server stays authoritative at scan time | Deferral decision — a venue with poor signal | 5 |
| **GAP-06** Push on hardware | `eas build --profile development` + a real device test | Push is contract-tested but unproven on hardware | 5 |
| **GAP-07** Dependency drift | `npx expo install --check` (17 patch bumps) | SDK drift | 5 |

### Deliberate non-goals

| Item | Why not |
|---|---|
| Interactive 3D seat map | scope constraint `SC-03`; a grid is the agreed UX |
| Season tickets, membership, merch | out of the MVP scope (`SC-04`, `SC-05`) |
| Database triggers for reschedule | walkthrough decision — the rules live in shared Zod + UI and the reason in `audit_logs` |

## Decision index

Decisions that shape the system. The engineering detail lives in
[`ARCHITECTURE.md`](docs/ARCHITECTURE.md) §7 and, for the original build, in
the archived history.

| # | Decision | Rationale | Status |
|---|---|---|---|
| D-01 | Holds and orders are RPCs, not client-side transactions | seat integrity under concurrency | active |
| D-02 | Amounts are computed server-side from the database | the client must never price a ticket | active |
| D-03 | Stripe webhooks are idempotent via `stripe_events` | Stripe retries deliveries | active |
| D-04 | QR payloads are HMAC-signed and generated server-side | tamper-evident entry | active |
| D-05 | Admin authorization is a JWT claim (`app_metadata.role`) | RLS cannot read the app JWT | active — **replaced by GAP-03** for fine-grained roles |
| D-06 | Reschedule rules live in shared Zod + UI — **no trigger, no RPC** | walkthrough decision; the reason is stored in `audit_logs` | active |
| D-07 | Venues are a normalized table with a FK | free-text venues could not be managed | active |
| D-08 | Edge Functions refuse non-`sk_test_` Stripe keys | Stripe test mode only, enforced in code | active |
| D-09 | `packages/shared` holds contracts, not UI state | one place for schemas/DTOs | active — **C2 applied** (dead modules removed, reachability enforced) |
| D-10 | The QR contract has exactly one implementation, in `supabase/functions/_shared/qr.ts` | the app renders payloads, never parses them | active — **C2 applied** (it owns the prefix, the signing string and the encoder) |
| D-11 | Documentation is enforced by contracts in CI | doc drift was found in review, not by tooling | active — **C1 applied** (`scripts/tests/docs.test.mjs`) |
| D-12 | Business constants live in `packages/shared/src/constants.ts` and are asserted against the database | one source of truth for TTLs and lock windows | active — **C2 applied** |
| D-13 | The deployed error-code copy is **generated**, never hand-written | Supabase deploys only `supabase/functions/**`, so the Edge Functions cannot import the shared package | active — **C2 applied** (`scripts/sync-error-codes.mjs`) |
| D-14 | Every constant has exactly one owner: clients own what they display, SQL owns what it computes | two owners means two truths that drift | active — **C2 applied** (the pending-order TTL moved back into SQL) |
| D-15 | `packages/shared/src/schemas.ts` is a deliberately retained contract surface | the Zod schemas are the trust boundary for both apps and are covered by their own contract tests | active — **retained on purpose in C2** |
| D-16 | A staff role change writes the profile row **and** the JWT claim together | `public.is_admin()` and every Edge Function guard authorise on `app_metadata.role`; the profile row alone is display only | active — **C3 applied** (`supabase/functions/_shared/roles.ts`) |
| D-17 | Row→DTO mapping has one owner, in the shared package | two implementations of the same mapping drift, and the app copies had no tests | active — **C3 applied** (`HYG-8`) |
| D-18 | The scanner's offline queue is **kept** | it is the gate operator's safety net; the server decides every replayed scan, so a queued scan can never grant entry on its own | active |
| D-19 | GAP-01 is a **device cache only**: the customer keeps the already-issued signed payload; staff verification stays online | offline *verification* would need a trusted revocation list, which cannot be made sound without the server | active |
| D-20 | Staff roles are exactly two for now — `admin` and `gatekeeper` | a gatekeeper may only scan and undo their own scans; anything richer belongs to GAP-03a, before multi-tenancy | active |
| D-21 | F-11 keeps the wire DTO and the auth schemas and deletes the rest | an unused contract is a contract that drifts; the shared package is the one source of truth | active |
| D-22 | The pgTAP gate runs against the **local** stack, not the hosted project | a hosted run needs explicit consent for a production mutation; the local stack proves the same SQL with no production risk | active — **C4.4 applied** |

## Errors / Notes

Findings that are recorded but deliberately **not** fixed in this cycle. Nothing
here is silently dropped.

| Note | Why it is not fixed now |
|---|---|
| The reschedule rules live only in shared Zod + the admin UI (D-06) — a direct PostgREST write can still move a kickoff. | A database trigger/RPC was explicitly rejected during the walkthrough. The reason is stored in `audit_logs`; the rules move server-side in the C5 hardening cycle. |
| `packages/shared/src/greeting.ts` was almost deleted by a coarse "whole module" sweep in C2; the typecheck proved `bangkokGreeting` is live on the home screen. | Fixed in C2 (restored, trimmed to the used export). Recorded because the lesson is general: **delete by export reachability, never by module**. The reachability contract (`HYG-1b`) now enforces this. |
| The first version of the error-code generator scraped every quoted word in the source and emitted a bogus `"string"` code. | Fixed in C2 — the generator now parses the `ERROR_CODES` array only. Recorded because a generator is code and needs its own guard. |
| `apps/admin/next.config.ts` carries a LAN origin for the local walkthrough. | A local developer change, deliberately excluded from commits. |
| GAP-01 (offline pass verification) is still open. | Deferred by decision — the server stays authoritative at scan time; only the payload needs caching. |
| GAP-06 / GAP-07 (EAS build on hardware, 17 Expo patch bumps) are still open. | They need a device and a separate dependency cycle; mixing them into feature work is how drift starts. |
| The pgTAP gate could not be re-run in this cycle: Docker is unavailable locally, and the hosted project needs explicit consent for a production mutation. | **Resolved in C4.4**: Docker and the local stack are available, and the gate now runs locally — 61/61 assertions across 10 suites, verified on 2026-11-13 with migrations 0001–0037 applied. The hosted path remains available as a fallback. |
| The flow audit (C3) found **17 findings** — F-01…F-17 in [`docs/FLOW-AUDIT.md`](docs/FLOW-AUDIT.md); only F-07 remains open, and the later sweep findings F-18…F-23 are all fixed. | Each finding is fixed as its own TDD cycle in severity order. The findings table is the tracking record; nothing is dropped silently. |
| The flow audit counted **15** non-null assertions (F-15); the repository actually held **24** — 12 in the apps, the rest in an Edge Function, two Deno test files and the Playwright spec. | The audit's number was an under-count, so the finding was under-scoped. Recorded because an audit that names a count must be re-counted mechanically — the contract `scripts/tests/type-safety.test.mjs` now does that on every run. |
| The local pgTAP gate failed its two concurrency suites with *"password or GSSAPI delegated credentials required"*. | The local stack maps the container network to `scram-sha-256`, so the `dblink` workers need a password — the stack is **not** trust-authenticated on that path, as the runner's old comment claimed. Fixed in C4.4: the runner reads the password from the stack's own `DB_URL` at runtime and sets `kickoff.dblink_password`; the credential is never committed. |
| The adversarial review of C4.7 found the profile editor answering a rejected **phone** number with "Enter your name." — the validation had moved into `profileUpdateSchema` but the copy still assumed the name was the only thing that could fail. | Fixed in the same cycle: the message is now chosen from the issue that actually failed. Recorded because a shared schema makes per-field messages *easier* to get wrong, not harder — the rules unify, the copy still has to be wired. |
| The SDK 58 `jest-expo` preset requires **Jest 30**, not the Jest 29 that older Expo guides assume. | Recorded because a mismatched major fails at the preset boundary with an opaque transform error; `apps/mobile/package.json` pins Jest 30 and jest-expo 58 together, and `scripts/tests/mobile-tests.test.mjs` keeps the harness declared. |
| The first version of the local runner interpolated the password into a SQL literal (`set kickoff.dblink_password = '${DB_PASSWORD}';`). | Found in the adversarial review of C4.4: a password containing a quote breaks the statement and is an injection vector into the preamble that runs before every suite. Fixed in the same cycle — psql now reads the password from the environment (`\getenv`) and quotes it itself (`:'name'`), so the value never reaches a SQL literal and never touches a file. The same review found the password in the `psql` command line; the runner now hands psql a connection string without it. |
| The admin audit trail is written **from the browser**, like the reschedule row before it. | A crash between the mutation and the audit row leaves an unlogged change, and an admin JWT could skip the call. The tamper-proof version (a database trigger or server-side function) belongs to the GAP-03/GAP-04 hardening track. |
| The file index (`docs/FILE-INDEX.md`) is a **snapshot**: it lists what was true when it was written, and the contract only proves that every tracked file has a verdict. | The verdicts are review outcomes, not facts that can be re-derived — a machine cannot tell whether a file was actually read. The contract keeps the *coverage* honest (nothing unreviewed, no stale entries); the honesty of a verdict stays a reviewer's responsibility. |
| The `check:no-mocks` gate test used to write its probe into `apps/mobile/src`, which raced every other test reading the tree. | Fixed in C4.2: the gate now accepts an extra scan directory (`CHECK_NO_MOCKS_EXTRA_DIR`) and the test probes a temporary directory, so a test never mutates the source tree. |
| The pgTAP gate could not be re-run in this cycle (Docker unavailable; the hosted project needs consent for a production mutation). | No SQL changed in these cycles, so the database gate is unaffected — the last verified run was 61/61 pgTAP assertions across 10 suites on the hosted project with migrations 0035–0037 applied. |
| After a role change the new claim reaches the account **at the next token refresh** (or sign-in). A demoted staff member keeps their old access until then. | Inherent to JWTs: the claim travels in the access token. `admin-users` now says so in the UI. A server-side role check (reading `profiles.role` inside `is_admin()`) removes the window — it belongs to the GAP-03 staff-role work, because it changes the authorisation model. |

## Working method

Every change follows the same cycle, and the cycle is the quality guarantee:

1. **RED** — write the failing test first; show the failure.
2. **GREEN** — the smallest change that makes it pass.
3. **Verify** — re-run the suite, then the full gate set:
   `npm test` · `npm run check` · `npm run check:no-mocks` ·
   `npm run functions:check` · `npm run build:admin` · `npm run db:test`.
4. **Review** — read the full diff adversarially; fix Critical/High findings
   with their own cycle.
5. **Document** — update `PLAN.md` (this file) and the affected docs.
6. **Commit** — one commit per cycle, message
   `Phase <X>: TDD cycle complete and plan updated`.

Rules that never bend: no failing test is forced on behaviour that already
works; no behaviour ships without a test; a fix is not merged with a
refactor; the plan is updated in the same commit as the code.

## Key file index

Where to look for what — the map that replaces reading the 1,100-line history.

| Concern | Files |
|---|---|
| Shared contracts | `packages/shared/src/{schemas,dto,entities,mappers,money,format,error-codes,http,greeting,theme}.ts` |
| Supporter app | `apps/mobile/src/app/**`, `apps/mobile/src/lib/**` |
| Staff console | `apps/admin/src/app/dashboard/**`, `apps/admin/src/lib/**` |
| Database | `supabase/migrations/*.sql` (schema → RLS → RPCs → views → cron → hardening) |
| Edge functions | `supabase/functions/_shared/*`, `supabase/functions/<name>/index.ts` |
| Gates | `scripts/check-functions.sh`, `scripts/check-no-mocks.sh`, `scripts/run-pgtap.sh`, `scripts/mvp-gate.mjs` |
| Tests | `packages/shared/src/__tests__/` · `scripts/tests/` · `supabase/tests/` · `supabase/functions/tests/` · `apps/admin/e2e/` · `maestro/flows/` |
| Docs | `README.md` (front door) · `docs/REQUIREMENTS.md` · `docs/ARCHITECTURE.md` · `docs/FLOW-AUDIT.md` · `docs/FILE-INDEX.md` · `docs/SECURITY.md` · `docs/TESTING.md` · `docs/BRAND.md` |

## Archive

- [`docs/archive/PLAN-history.md`](docs/archive/PLAN-history.md) — the full
  task-level history of Phases 0–12, A, B0 and B: every task, every TDD
  cycle, every error and note. Kept verbatim as the audit trail; superseded
  by this file for anything about current state.
