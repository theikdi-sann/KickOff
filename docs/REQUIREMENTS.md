# REQUIREMENTS — KickOff B2B

The product requirements for KickOff, the matchday platform for football clubs.
This document is the **single source of truth for what the product must do**. It
merges the original project proposal and the early scope
brainstorm, and adds traceability: every
requirement points at the code that implements it and the test that proves it.

- **Status:** living document. Every requirement carries a state:
  `shipped`, `partial`, or `open`.
- **Owners:** product owner (requirements) · engineering (implementation).
- **Last verified:** 2026-11-13 — see `PLAN.md` for the delivery history.
- **Related:** [`ARCHITECTURE.md`](ARCHITECTURE.md) (how it is built) ·
  [`SECURITY.md`](SECURITY.md) (how it is protected) ·
  [`TESTING.md`](TESTING.md) (how it is proven).

## 1. Product definition

KickOff is a **B2B platform**: one product sold to many football clubs, each a
separate tenant with its own fixtures, staff, branding, payments and reporting.
The customer-facing product is a supporter app (Expo/React Native); the
operator-facing product is a staff console (Next.js); both sit on a shared
Supabase backend with Stripe payments and the Expo Push Service.

> **Current implementation note.** The shipped code runs **single-club**
> (one club, hard-coded branding, THB, English). Multi-tenancy is the next
> architecture phase — see `GAP-02` in §6 and the B2B hardening track in
> `PLAN.md`.

### 1.1 Actors

| Actor | Surface | Trust level |
|---|---|---|
| **Supporter** | mobile app | untrusted (own data only) |
| **Box-office staff** | admin console | elevated, scoped by role |
| **Gate staff** | admin console / scanner | elevated, scoped to assigned gates |
| **Club administrator** | admin console | full club scope |
| **Platform operator** | infrastructure | cross-tenant, audited |
| **Scheduler** | `pg_cron` | service identity, secret-guarded |

## 2. Functional requirements

### 2.1 Supporter app (mobile)

| ID | Requirement | State | Notes |
|---|---|---|---|
| REQ-01 | Register, sign in, sign out, password reset, email verification, profile management | shipped | Supabase Auth + `profiles` |
| REQ-02 | Browse upcoming fixtures and past results | shipped | `matches.status` = upcoming/live/completed |
| REQ-03 | Read club news and match reports | shipped | `news_items` + public bucket for images |
| REQ-04 | Select a seating **zone** and an **exact seat** | shipped | `zones(rows, seats_per_row)` → `seats` |
| REQ-05 | See live seat availability while choosing | shipped | 3 s polling, selection never overwritten |
| REQ-06 | Hold a seat while paying (10 minutes) | shipped | `create_hold` RPC, unique active-seat index |
| REQ-07 | Pay with Stripe (card, test mode) | shipped | Hosted Checkout, amount computed server-side |
| REQ-08 | Receive a digital pass with match, supporter and QR | shipped | `KICKOFF-V2` HMAC envelope, signed server-side |
| REQ-09 | Review order history and order detail | shipped | `orders` / `order_seats` |
| REQ-10 | Download / share a PDF receipt | shipped | `receipt` function, private bucket |
| REQ-11 | Opt in to push notifications for kickoff reminders | shipped | dev build required (Expo Go cannot receive push) |
| REQ-12 | Edit profile (name, phone) | shipped | `profiles` update, own-row RLS |
| REQ-13 | Delete the account | shipped | `delete-account` function, own data only |
| REQ-14 | Keep a digital pass usable without a network | **open** | `GAP-01` — no local cache of the signed payload yet |

### 2.2 Staff console (admin)

| ID | Requirement | State | Notes |
|---|---|---|---|
| REQ-15 | Staff sign-in with TOTP MFA | shipped | `app_metadata.role` claim |
| REQ-16 | Create, edit and delete fixtures | shipped | incl. kickoff, competition, home/away, scores |
| REQ-17 | Configure zones, rows, seats and prices | shipped | `zone-editor`, per-zone pricing |
| REQ-18 | Manage venues (add/delete grounds) | shipped | normalized `venues` table |
| REQ-19 | Move a kickoff with reschedule rules and a stored reason | shipped | upcoming-only, future, outside lock window, never earlier, ≤10 days, reason required |
| REQ-20 | Register gates and assign them to fixtures | shipped | `gates` (venue-bound) + `match_gates` |
| REQ-21 | Validate a pass by camera scan or manual code | shipped | `scan-ticket`, signed payload, fixture + window checks |
| REQ-22 | Undo an accepted scan within 60 s | shipped | `scan-undo`, admin only, audited |
| REQ-23 | Work at the gate without connectivity (offline queue) | shipped | `offline-queue`, idempotency keys |
| REQ-24 | List, filter, refund and export orders | shipped | CSV export, refunds with used-pass override |
| REQ-25 | Publish and edit news and match results | shipped | `news_input_schema` + admin RLS |
| REQ-26 | Manage users and roles | shipped | `admin-users` function |
| REQ-27 | Read club settings (lock window, reminders) | shipped | `app_settings` |
| REQ-28 | See revenue, passes sold and scan activity | shipped | overview page + `metrics` endpoint |
| REQ-29 | See who changed what (audit trail) | shipped | `audit_logs` + admin console |

## 3. Non-functional requirements

| ID | Requirement | State | Evidence |
|---|---|---|---|
| NFR-01 | Row-level security on every table | shipped | `docs/SECURITY.md` matrix, pgTAP suites |
| NFR-02 | Service-role key never reaches a client bundle | shipped | env layout, `check:no-mocks` + review |
| NFR-03 | Stripe test mode only | shipped | `_shared/config.ts` refuses non-`sk_test_` keys |
| NFR-04 | QR payloads are HMAC-signed and tamper-evident | shipped | `KICKOFF-V2` + `_shared/hmac.ts` |
| NFR-05 | Privileged mutations are audited | shipped | `audit_logs` writes on refund, settings, reschedule, scan |
| NFR-06 | Deterministic CI gates on every push | shipped | `.github/workflows/ci.yml` |
| NFR-07 | Type safety: strict TS, no `any` | shipped | `tsconfig.base.json`, ESLint `no-explicit-any` |
| NFR-08 | Offline entry verification without a network | **open** | `GAP-01` |
| NFR-09 | Multi-tenant isolation | **shipped** | `GAP-02` closed at `0045` — ADR-002; C6–C7 (`0040`–`0045`), isolation suite green |
| NFR-10 | Fine-grained staff roles beyond owner/admin | **shipped** | `GAP-03a` delivered `admin` / `gatekeeper` (`0039`, `roles.ts`); `0041` made roles per-tenant with capability flags (`staff_roles`, `staff_members`), closing GAP-03; `0047` moved every reader onto the membership and made the promotion helper write membership and claim together; `0048` dropped the legacy column and its bridge |
| NFR-11 | Observability: structured logs, metrics, error tracking | **open** | `GAP-04` — B2B blocker |
| NFR-12 | Multi-language and multi-currency | **open** | `GAP-05` — schema (`tenants.locale`/`currency`) in C6/C7, UX in C10.2 |

## 4. Scope constraints (from the proposal)

| ID | Constraint | Honoured |
|---|---|---|
| SC-01 | Single club (no multi-tenancy) | yes — lifted for B2B at `0045` (`GAP-02`) |
| SC-02 | Stripe test mode, mock credentials only | yes, enforced in code |
| SC-03 | Seat allocation is a grid, not a 3D stadium map | yes |
| SC-04 | No season tickets — single-match only | yes |
| SC-05 | No membership/loyalty tiers | yes |
| SC-06 | Simulated QR entry — no turnstile hardware | yes |
| SC-07 | Free-tier hosting, limited concurrency | yes — hold/unique index, rate limits |
| SC-08 | Offline use is limited to already-issued passes | **partially** — see `GAP-01` |

## 5. Traceability

Requirement → implementation → the test that proves it. Tests live in
`scripts/tests/` (repo contracts), `packages/shared/src/__tests__/` (unit),
`supabase/tests/` (pgTAP) and `supabase/functions/tests/` (Deno).

| ID | Implementation | Proof |
|---|---|---|
| REQ-01 | `apps/mobile/src/app/(auth)/*`, `lib/auth.ts` | `scripts/tests/signup.test.mjs`, `redirects.test.mjs` |
| REQ-02 | `apps/mobile/src/app/fixtures.tsx`, `lib/queries/matches.ts` | `scripts/tests/seeall.test.mjs` |
| REQ-03 | `apps/mobile/src/app/news.tsx`, `lib/queries/news.ts` | `scripts/tests/phase11.test.mjs` |
| REQ-04 | `apps/mobile/src/app/seats/[matchId].tsx` | `scripts/tests/venues.test.mjs` |
| REQ-05 | `apps/mobile/src/lib/queries/seats.ts` (3 s poll) | `scripts/tests/phaseb.test.mjs` (PB1-1..4) |
| REQ-06 | `supabase/migrations/0019_hold_functions.sql` | `supabase/tests/hold-ttl.test.sql`, `hold-concurrency.test.sql` |
| REQ-07 | `supabase/functions/stripe-checkout`, `stripe-webhook` | `supabase/functions/tests/*`, `supabase/tests/order-expiry.test.sql` |
| REQ-08 | `supabase/functions/ticket-qr`, `_shared/qr.ts` | `supabase/tests/scan.test.sql`, `supabase/functions/tests/scan.test.ts` |
| REQ-09 | `apps/mobile/src/app/orders.tsx` | `scripts/tests/phaseb0.test.mjs` |
| REQ-10 | `apps/mobile/src/lib/receipt.ts`, `functions/receipt` | `scripts/tests/phase11.test.mjs` |
| REQ-11 | `apps/mobile/src/lib/notifications.ts`, `apps/mobile/eas.json` | `scripts/tests/push.test.mjs` |
| REQ-12 | `apps/mobile/src/app/profile/edit.tsx` | `scripts/tests/rls` (pgTAP `rls-auth.test.sql`) |
| REQ-13 | `supabase/functions/delete-account` | `scripts/tests/phase11.test.mjs` |
| REQ-14 | — | `GAP-01` (no test: no implementation) |
| REQ-15 | `apps/admin/src/app/login/*`, `lib/auth.ts` | `apps/admin/e2e/*` (Playwright) |
| REQ-16 | `apps/admin/src/app/dashboard/matches/*` | `scripts/tests/venues.test.mjs` |
| REQ-17 | `apps/admin/src/components/zone-editor.tsx` | `scripts/tests/venues.test.mjs` |
| REQ-18 | `apps/admin/src/app/dashboard/venues/page.tsx` | `scripts/tests/venues.test.mjs` (VEN-1..8) |
| REQ-19 | `packages/shared/src/schemas.ts`, `apps/admin/src/lib/audit.ts` | `scripts/tests/reschedule.test.mjs` (RS-1..RS-10) |
| REQ-20 | `apps/admin/src/app/dashboard/gates/page.tsx` | `supabase/tests/rls.test.sql` |
| REQ-21 | `apps/admin/src/app/dashboard/scan/page.tsx`, `functions/scan-ticket` | `supabase/tests/scan.test.sql`, `functions/tests/scan.test.ts` |
| REQ-22 | `supabase/functions/scan-undo` | `supabase/tests/scan.test.sql` |
| REQ-23 | `apps/admin/src/lib/offline-queue.ts` | `scripts/tests/phase11.test.mjs` |
| REQ-24 | `apps/admin/src/app/dashboard/tickets/*`, `functions/refund-order` | `supabase/tests/order-expiry.test.sql` |
| REQ-25 | `apps/admin/src/app/dashboard/news/page.tsx` | `scripts/tests/phase11.test.mjs` |
| REQ-26 | `supabase/functions/admin-users` | `supabase/tests/rls-auth.test.sql` |
| REQ-27 | `apps/admin/src/app/dashboard/settings/page.tsx` | `scripts/tests/reschedule.test.mjs` (RS-7) |
| REQ-28 | `apps/admin/src/app/dashboard/page.tsx`, `functions/metrics` | `scripts/tests/phase11.test.mjs` |
| REQ-29 | `apps/admin/src/lib/audit.ts`, `supabase/migrations/0012_audit_logs.sql` | `supabase/tests/reschedule-audit.test.sql` |
| NFR-01 | `supabase/migrations/0016–0018`, `0035–0037` | `supabase/tests/rls*.test.sql` |
| NFR-03 | `supabase/functions/_shared/config.ts` | `scripts/tests/ci.test.mjs` |
| NFR-06 | `.github/workflows/ci.yml` | `scripts/tests/ci.test.mjs` |
| NFR-07 | `tsconfig.base.json`, `apps/*/eslint.config.*` | `npm run check` |

## 6. Known gaps

Open items with an owner. Nothing here is silently dropped — each one is a
tracked decision, not an accident.

| ID | Gap | Impact | Plan |
|---|---|---|---|
| **GAP-01** | **Offline pass verification.** The signed QR payload is fetched over the network, so a pass cannot be presented without connectivity. The proposal's SC-08 wants issued passes cached locally. | Supporter at a venue with poor signal cannot show the pass. | C10.3 — deliberately deferred; the system is otherwise sound. Implementation must keep the server authoritative at scan time and only cache the *payload*. |
| **GAP-02** | **No multi-tenancy.** One club per deployment; branding, currency and staff are global. | Blocks the B2B model. | ✅ closed by C7.3 — ADR-002; `0045` ships the tenant-isolation pgTAP suite (T-01…T-24) green. |
| **GAP-03** | **Staff roles are a fixed pair.** `GAP-03a` delivered the two-role scope (`admin` \| `gatekeeper`, migration `0039`): a gatekeeper may scan and undo only their own scans and is confined to the gate surface. | Gate staff no longer hold refund/user authority, but a club cannot define its own roles or scope a staff member to one venue/tenant. | ✅ closed by C6.2 — `0041` ships per-tenant `staff_roles` with capability flags and `staff_members(id, tenant_id)` (ADR-001). |
| **GAP-04** | **Observability is thin.** Structured logs and metrics exist, but there is no error tracking, tracing or alerting. | Incidents are found by users, not by monitoring. | C10.1. |
| **GAP-05** | **One locale, one currency.** English + THB only; the unused English string table was removed in Phase C2, so localization has to be rebuilt per tenant. | Multi-country clubs need per-tenant locale/currency. | Schema (`tenants.locale`/`currency`) in C6/C7; UX in C10.2. |
| **GAP-06** | **The EAS dev build has never been exercised end to end.** Push code is contract-tested, but no APK has been built and no push delivered on a device. | Push is unproven on hardware. | C10.4 — `eas build --profile development` + `expo.dev/notifications`. |
| **GAP-07** | **Closed in C4.12.** 17 packages were one patch behind the Expo SDK's expected versions and the `expo-doctor` check failed. | The risk was upgrade friction and SDK drift. | ✅ closed in C4.12 (`deps:check` is a CI gate). |
| **GAP-08** | **No ticket transfer/claim.** A fan who buys four seats holds all four passes in their own account; friends cannot claim their own pass. | Buying for friends works at the gate (four QRs) but not in the app. | Out of scope now — revisit after C9; needs buyer/holder split on `tickets`. |
| **GAP-09** | **No GDPR export or tenant offboarding.** `delete-account` wipes one user's rows; a club leaving the platform has no export/erase procedure. | Enterprise clubs require a clean, auditable exit. | Before a club is **onboarded** (C8.2/C9). The schedule exists — [`docs/PRIVACY.md`](PRIVACY.md) (GAP-09.1, after the 09.0 repair that fixed `delete-account`); the export, the erasure schedule and the club exit procedure are GAP-09.2–09.6. The Connect *plumbing* (C8.1) ships first: it changes nothing while no club holds a connected account, and the exit procedure must land before the platform holds a club's money on its own account. |
| **GAP-10** | **White-label release overhead is unproven.** One app per club means per-club EAS projects, bundle ids, Expo push credentials and store listings. | The delivery model multiplies release work. | C9.2 — onboarding checklist + first second-tenant build. |

## 7. Change control

- Requirements change through this document: add/retire a `REQ-*` row, update
  the traceability map, and record the decision in `PLAN.md`.
- Scope decisions that remove a requirement must move it to §6 Known gaps with
  a reason — nothing is deleted silently.
- Documentation drift is a test failure (`scripts/tests/docs.test.mjs`), not a
  review comment.
