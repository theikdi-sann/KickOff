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
| **C3 — Flow-by-flow audit** | 21 user flows × 6 questions (entry, trust boundary, validation, failure path, audit, test proof) → findings table, fixes as separate cycles | 🔄 in progress |
| **C4 — Clean-code standard** | Stricter compiler flags (`noUncheckedIndexedAccess`), lint rules, logging conventions, dead-code guard, dependency hygiene | ⬜ queued |
| **C5 — B2B readiness** | Multi-tenancy, staff roles, observability, locale/currency (see below) | ⬜ queued |

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
| The pgTAP gate could not be re-run in this cycle: Docker is unavailable locally, and the hosted project needs explicit consent for a production mutation. | No SQL changed in this cycle, so the database gate is unaffected — the last verified run was 61/61 pgTAP assertions across 10 suites on the hosted project with migrations 0035–0037 applied. It must be re-run before the next SQL change. |

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
| Docs | `README.md` (front door) · `docs/REQUIREMENTS.md` · `docs/ARCHITECTURE.md` · `docs/SECURITY.md` · `docs/TESTING.md` · `docs/BRAND.md` |

## Archive

- [`docs/archive/PLAN-history.md`](docs/archive/PLAN-history.md) — the full
  task-level history of Phases 0–12, A, B0 and B: every task, every TDD
  cycle, every error and note. Kept verbatim as the audit trail; superseded
  by this file for anything about current state.
