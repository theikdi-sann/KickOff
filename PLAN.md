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
| **C1 — Documentation baseline** | Merge proposal + brainstorm into `REQUIREMENTS.md`; add `ARCHITECTURE.md`; delete stale/duplicate docs; make doc drift a failing test | 🔄 in progress |
| **C2 — Code hygiene & single source of truth** | Delete the dead contract cluster in `packages/shared`; one implementation of the QR contract, the error envelope and business constants; remove redundant files | ⬜ next |
| **C3 — Flow-by-flow audit** | 21 user flows × 6 questions (entry, trust boundary, validation, failure path, audit, test proof) → findings table, fixes as separate cycles | ⬜ queued |
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
| D-09 | `packages/shared` holds contracts, not UI state | one place for schemas/DTOs | active — **being slimmed in C2** |
| D-10 | The QR contract has exactly one implementation, in `_shared` | the app renders payloads, never parses them | active — **C2** |
| D-11 | Documentation is enforced by contracts in CI | doc drift was found in review, not by tooling | active — **C1** |
| D-12 | Business constants live in `shared/constants.ts` and are asserted against the database | one source of truth for TTLs and lock windows | **C2** |

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
| Shared contracts | `packages/shared/src/{schemas,dto,entities,mappers,money,format,qr,theme}.ts` |
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
