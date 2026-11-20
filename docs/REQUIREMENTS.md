# REQUIREMENTS — KickOff B2B

The product requirements for KickOff, the matchday platform for football clubs.
This document is the **single source of truth for what the product must do**. It
merges the original project proposal and the early scope
brainstorm, and adds traceability: every
requirement points at the code that implements it and the test that proves it.

- **Status:** living document. Every requirement carries a state:
  `shipped`, `partial`, or `open`.
- **Owners:** product owner (requirements) · engineering (implementation).
- **Last verified:** 2026-11-20 — see `PLAN.md` for the delivery history and
  [`TRUTH.md`](TRUTH.md) for the canonical facts.
- **Related:** [`ARCHITECTURE.md`](ARCHITECTURE.md) (how it is built) ·
  [`SECURITY.md`](SECURITY.md) (how it is protected) ·
  [`TESTING.md`](TESTING.md) (how it is proven).

## 1. Product definition

KickOff is a **B2B platform**: one product sold to many football clubs, each a
separate tenant with its own fixtures, staff, branding, payments and reporting.
The customer-facing product is a supporter app (Expo/React Native); the
operator-facing product is a staff console (Next.js); both sit on a shared
Supabase backend with Stripe payments and the Expo Push Service.

> **Deployment model.** The platform is multi-tenant since `0045`. One
> Supabase project serves many clubs; every tenant-scoped row carries
> `tenant_id`, composite foreign keys prevent cross-club references, and RLS
> resolves the club through `current_tenant()`. Branding, currency, locale,
> time zone and the Stripe connected account are per club. The remaining B2B
> gaps are `GAP-08` (ticket transfer), `GAP-10` (per-club release overhead)
> and `GAP-11` (custom staff roles), not tenancy.

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
| REQ-11 | Opt in to push notifications for kickoff reminders | shipped | dev build required (Expo Go cannot receive push); C10.4 wired the FCM client config and the EAS project id, and the recorded run (Xiaomi Pad 6, Android 14) delivered a reminder with the app swiped out of recents — see `RUNBOOK` §11.7 |
| REQ-12 | Edit profile (name, phone) | shipped | `profiles` update, own-row RLS |
| REQ-13 | Delete the account | shipped | `delete-account` function, own data only |
| REQ-14 | Keep a digital pass usable without a network | **shipped** | `GAP-01` closed at C10.3 — the signed payload and the ticket row are cached verbatim (`pass-cache.ts`), the screen admits when it is serving a saved pass, sign-out clears it; the scan stays server-authoritative |

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
| REQ-22 | Undo an accepted scan within 60 s | shipped | `scan-undo`; staff, same operator only, audited |
| REQ-23 | Work at the gate without connectivity (offline queue) | shipped | `offline-queue`, idempotency keys |
| REQ-24 | List, filter, refund and export orders | shipped | CSV export, refunds with used-pass override |
| REQ-25 | Publish and edit news and match results | shipped | `news_input_schema` + admin RLS |
| REQ-26 | Manage users and roles | shipped | `admin-users` function |
| REQ-27 | Read club settings (lock window, reminders) | shipped | `app_settings` |
| REQ-28 | See revenue, passes sold and scan activity | shipped | overview page + `metrics` endpoint |
| REQ-29 | See who changed what (audit trail) | shipped | `audit_logs` + admin console |
| REQ-046 | Define, edit, deactivate and assign **custom per-club staff roles** | **open** | REQ-046 below; `GAP-11`; acceptance `RBAC-1…RBAC-8` pending |

### REQ-046 — Per-club staff role definition and assignment (`open`)

**Behaviour.** An admin that holds `manage_staff` can define, rename, deactivate
and assign club-scoped staff roles beyond the two built-in roles. A role is a
named set of capabilities; every authorization decision is derived from those
capabilities, never from the role's name.

**Rules.**

1. **Vocabulary and scope.** Built-in roles are exactly `admin` and
   `gatekeeper`. They are seeded by `provision_tenant()` for every club and
   cannot be renamed, deleted or have their capability set reduced. `customer`
   is **not** a role: it is the absence of a `staff_members` row at the current
   club. Roles are scoped to one club (`tenant_id`); venue- or gate-level role
   scoping is not part of REQ-046.
2. **Definition.** A custom role is stored in
   `staff_roles(tenant_id, code, display_name, is_system, sort_order)` with a
   unique `(tenant_id, code)`. `code` matches `^[a-z][a-z0-9_]{1,31}$`;
   `display_name` is 2–40 characters. A duplicate code returns `409
   role_exists`. The reserved codes `customer`, `admin` and `gatekeeper` cannot
   be created. A deactivated role keeps its assignments readable but cannot be
   newly assigned.
3. **Capabilities.** A role's capabilities are a subset of one closed
   catalogue, stored in
   `staff_role_capabilities(tenant_id, role_code, capability)`:

   | Capability | Grants |
   |---|---|
   | `manage_staff` | create/edit/deactivate roles; invite, assign and demote staff; read the staff list |
   | `operate_gate` | scan a pass, undo **own** scan within 60 s, read `gates`, `match_gates` and own `scan_events` |
   | `manage_matches` | create/edit/postpone/cancel fixtures, match clock, results |
   | `manage_venues` | venues, zones, seats, prices, gates and `match_gates` |
   | `publish_news` | news items and match reports |
   | `refund_orders` | list, refund and export orders |
   | `read_audit` | read `audit_logs` |
   | `manage_settings` | read/write `app_settings` |
   | `export_data` | CSV, fan export and tenant export |
   | `view_reports` | overview and aggregate reports |

   An unknown capability returns `422 unknown_capability`. Adding a capability
   is a schema + docs change guarded by a contract test; the list above is
   closed for REQ-046.
4. **Seeded capability sets.** `admin` = all ten capabilities. `gatekeeper` =
   `operate_gate` only. This preserves today's behaviour exactly.
5. **Who may write.** Defining, editing, deactivating or assigning a role
   requires `manage_staff` at the caller's club. An actor may not grant a
   capability it does not itself hold (`403 capability_escalation`). A role
   holding `manage_staff` may not be deactivated, emptied of `manage_staff`, or
   have its last holder demoted while it is the only role at the club with
   `manage_staff` (`409 last_manager`). An actor cannot demote or deactivate
   its own role (`409 self_demotion`).
6. **Assignment is two projections.** Assigning a role writes
   `staff_members(id, tenant_id, staff_role)` **and** the JWT claim
   `app_metadata.role = code`, `app_metadata.capabilities = [...]`, in that
   order. If the claim write fails the membership is restored and nothing
   changes. Assigning `customer` deletes the membership and writes
   `role = 'customer'`, `capabilities = []`. `profiles.role` is never written
   (dropped in `0048`).
7. **Authorization.** RLS predicates and Edge guards check capabilities only.
   No policy, guard, query or UI branch may hard-code `admin` or `gatekeeper`
   as an authority test. The database reads the membership +
   `staff_role_capabilities` at `current_tenant()`; Edge Functions read the
   capability claim. A role change is audited as `admin.role.create`,
   `admin.role.update`, `admin.role.deactivate` or `admin.user.update`.
8. **Apply window.** A changed role reaches an existing session at the next
   access-token refresh; the console says so. The old token keeps the old
   capabilities until then. This window is documented, not silently accepted.
9. **Tenant isolation.** A club cannot read, create, edit, deactivate or
   assign another club's role. A cross-club role id or code returns `404
   role_not_found`; a cross-club assignment is refused by the composite foreign
   key (`23503`).
10. **Surfaces.** The admin console provides a Roles screen (list/create/edit/
    deactivate) and the Users screen lists the caller club's active roles plus
    **Customer**. Selecting **Customer** removes staff authority. Both screens
    show the capabilities of a role before it is saved or assigned.

**Non-goals.** Venue-scoped roles, per-user capability overrides, role
inheritance, and delegated role administration below `manage_staff`.

**Acceptance.** `RBAC-1…RBAC-8` (pending — the feature is not built). The
pending tests are listed in [`TESTING.md`](TESTING.md) §10 and registered as
`test.todo` until the implementation lands.

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
| NFR-08 | Offline entry verification without a network | **shipped** | `GAP-01` closed at C10.3 — `useTicketQr`/`useTicket` fall back to the cache with `fromCache`, proven by PASS-1…PASS-6 and the cache unit tests |
| NFR-09 | Multi-tenant isolation | **shipped** | `GAP-02` closed at `0045` — ADR-002; C6–C7 (`0040`–`0045`), isolation suite green |
| NFR-10 | Per-club role definition | a club can add staff roles without a migration; each role is a tenant-scoped row with a subset of the closed capability catalogue; no authorization path names a role; cross-tenant role reads/writes return zero rows or `23503`/`42501`; every role write is audited | **open** — built-in `admin` / `gatekeeper` and per-club capability flags shipped in `0039`/`0041`/`0047`/`0048`; custom definitions are REQ-046 / GAP-11, acceptance `RBAC-1…RBAC-8` pending |
| NFR-11 | Observability: structured logs, metrics, error tracking | **shipped** | `GAP-04` closed at C10.1 — `error_events` (durable, one request id across response, log and record), the optional `ALERT_WEBHOOK_URL` channel with a per-function cooldown, and `xclub-reconcile-payments` finding the C8.1 unsettled payments |
| NFR-12 | Multi-language and multi-currency | **shipped with a documented residual** | `GAP-05` closed at C10.2 for on-screen surfaces — schema (`tenants.locale`/`currency`/`timezone`) in C6/C7, formatting in C8.2, the translation layer in C10.2: source-as-key `translate()`, a contract-enforced Thai catalog, `useTranslator()` in the app, and the club locale on every on-screen date and money call. **The PDF receipt is the exception:** the PDF's standard font is ASCII-only and a Thai font does not fit the Edge worker's memory budget, so the receipt uses English copy and `THB 350`-style money. Tracked in `REQTRACE.md` §10. |
| NFR-13 | Seat availability performance | p95 read-to-render ≤ 300 ms; the map polls every 3 s; a value older than 5 s is marked stale, never shown as current | `zone_availability`, `scripts/tests/availability.test.mjs`; enforced by review until a load test lands |
| NFR-14 | Availability | monthly p95 API availability ≥ **99.5 %**, measured by `health`; a 5xx burst of >5 in 5 minutes pages | `availability-probe.mjs`, `availability_probes`, `metrics`, the alert channel |
| NFR-15 | Accessibility | every interactive control has an accessible name; text contrast ≥ 4.5:1; the seat grid is operable by keyboard and screen reader | mobile a11y tests + admin Playwright; `scripts/tests/ui.test.mjs` |
| NFR-16 | Retention | orders/tickets/refunds/audit **7 years**; `scan_events` **3 years**; `stripe_events` **90 days**; `error_events` **30 days**; `device_tokens` 90 days unused; erasure within **30 days** of request | `PRIVACY.md` §Retention; scheduled prune jobs |
| NFR-17 | Backup and recovery | RPO ≤ **24 h**, RTO ≤ **4 h**; a quarterly restore drill restores into a scratch project and passes the pgTAP suite before sign-off | `scripts/restore-drill.sh`, `RUNBOOK.md` §7; release ticket |

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
| SC-08 | Offline use is limited to already-issued passes | **shipped** — only payloads the server already issued are cached, byte for byte; nothing is minted or re-signed locally |

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
| REQ-11 | `apps/mobile/src/lib/notifications.ts`, `apps/mobile/eas.json`, `apps/mobile/app.config.ts`, `apps/mobile/google-services.json` | `scripts/tests/push.test.mjs` (PUSH-1…PUSH-9), `scripts/tests/push-hardware.test.mjs` (PUSH-HW-1…PUSH-HW-6) |
| REQ-12 | `apps/mobile/src/app/profile/edit.tsx` | `scripts/tests/rls` (pgTAP `rls-auth.test.sql`) |
| REQ-13 | `supabase/functions/delete-account` | `scripts/tests/phase11.test.mjs` |
| REQ-14 | `apps/mobile/src/lib/{pass-cache.ts,queries/tickets.ts}` | `scripts/tests/offline-pass.test.mjs` (PASS-1…PASS-6), `pass-cache-test.ts` |
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
| REQ-046 | none — **open** (`GAP-11`) | `RBAC-1…RBAC-8` (pending, `TESTING.md` §10) |
| NFR-01 | `supabase/migrations/0016–0018`, `0035–0037` | `supabase/tests/rls*.test.sql` |
| NFR-03 | `supabase/functions/_shared/config.ts` | `scripts/tests/ci.test.mjs` |
| NFR-06 | `.github/workflows/ci.yml` | `scripts/tests/ci.test.mjs` |
| NFR-07 | `tsconfig.base.json`, `apps/*/eslint.config.*` | `npm run check` |

## 6. Known gaps

Open items with an owner. Nothing here is silently dropped — each one is a
tracked decision, not an accident.

| ID | Gap | Impact | Plan |
|---|---|---|---|
| **GAP-01** | **Offline pass verification.** The signed QR payload is fetched over the network, so a pass cannot be presented without connectivity. The proposal's SC-08 wants issued passes cached locally. | Supporter at a venue with poor signal cannot show the pass. | ✅ **closed at C10.3** — `pass-cache.ts` records the signed payload and the ticket row verbatim (no local re-signing: PASS-4), both queries fall back with `fromCache`, the screen shows an offline hint, sign-out clears the cache, and the scan stays server-authoritative — the gate refuses a used pass regardless of what the screen shows. |
| **GAP-02** | **No multi-tenancy.** One club per deployment; branding, currency and staff are global. | Blocks the B2B model. | ✅ closed by C7.3 — ADR-002; `0045` ships the tenant-isolation pgTAP suite (T-01…T-24) green. |
| **GAP-03** | **Staff roles are a fixed built-in pair.** `GAP-03a` delivered the two-role scope (`admin` \| `gatekeeper`, migration `0039`): a gatekeeper may scan and undo only their own scans and is confined to the gate surface. | Gate staff no longer hold refund/user authority. A club still cannot define its own roles — that is `GAP-11`. | ✅ closed by C6.2 — `0041` ships per-tenant `staff_roles` with capability flags and `staff_members(id, tenant_id)` (ADR-001). |
| **GAP-04** | **Observability is thin.** Structured logs and metrics exist, but there is no error tracking, tracing or alerting. | Incidents are found by users, not by monitoring. | ✅ **closed at C10.1** — every 5xx is recorded with its request id (30-day retention), an optional Slack-compatible webhook pages with a 30-minute per-function cooldown, `metrics` scrapes `errors.total` and `reconciliation.unsettled`, and the cron sweep finds a paid Stripe session on an order that never settled (it records for a human; it never moves money). |
| **GAP-05** | **One locale, one currency.** English + THB only; the unused English string table was removed in Phase C2, so localization has to be rebuilt per tenant. | Multi-country clubs need per-tenant locale/currency. | ✅ **closed at C10.2** — schema (C6/C7), formatting (C8.2 a–d), and the translation layer (C10.2): the English source string is the key, the Thai catalog is coverage-contracted (no missing key, no orphan), `useTranslator()` drives both apps' copy, every date and money call carries the club locale, and the receipt renders through generated Edge copies — **with one documented residual:** the PDF uses ASCII/English copy and ISO money because the standard PDF font cannot encode Thai or `฿`. Deliberate lines: the admin console stays English (operator tooling) and the legal documents need a reviewed translation, not a codemod. |
| **GAP-06** | **The EAS dev build has never been exercised end to end.** Push code is contract-tested, but no APK has been built and no push delivered on a device. | **Closed 2026-11-19 (Android).** The `development` build installed on a Xiaomi Pad 6 (Android 14) registered `ExponentPushToken[-u895ZPCd6…`, and `send-kickoff-reminders` returned `{"sent":1,"devices":1}`; the reminder landed in the tray with the app swiped out of recents, so delivery came from FCM through the OS rather than the JS runtime. | Evidence: `docs/evidence/push-hardware-xiaomi-pad-6-2026-11-19.jpg`, procedure `RUNBOOK` §11, contracts `PUSH-HW-1…PUSH-HW-8`. The config half was C10.4: `android.googleServicesFile` wired to the committed `google-services.json`, and `EAS_PROJECT_ID` in `eas.json`'s profile env because `.env` never reaches the build server. iOS has not been run (same procedure, APNs key instead of FCM). |
| **GAP-07** | **Closed in C4.12.** 17 packages were one patch behind the Expo SDK's expected versions and the `expo-doctor` check failed. | The risk was upgrade friction and SDK drift. | ✅ closed in C4.12 (`deps:check` is a CI gate). |
| **GAP-08** | **No ticket transfer/claim.** A fan who buys four seats holds all four passes in their own account; friends cannot claim their own pass. | Buying for friends works at the gate (four QRs) but not in the app. | Out of scope now — revisit after C9; needs buyer/holder split on `tickets`. |
| **GAP-09** | **Closed at GAP-09.6 — before the first club is onboarded (C8.2/C9).** A club leaving the platform now gets a clean, auditable exit: the schedule ([`docs/PRIVACY.md`](PRIVACY.md)), the fan export (`export-user`) and erasure (the `delete-account` repair plus the schedule), the club archive (`export_tenant()`), and the erase behind the human money gate (`mark_tenant_offboarded()` / `erase_tenant()`), with the exit runbook (RUNBOOK §9) and fan-rights procedure (§6.8). | The platform must not hold a club's money with no agreed way to hand it back (ADR-003 §6). The Connect *plumbing* (C8.1) shipped first — it changes nothing while no club holds a connected account, and the exit procedure now lands before the platform could hold a club's money on its own account. | ✅ closed at GAP-09.6 |
| **GAP-10** | **White-label release overhead is unproven.** One app per club means per-club EAS projects, bundle ids, Expo push credentials and store listings. | The delivery model multiplies release work. | Onboarding checklist delivered in C9 (`RUNBOOK` §10 — provision → fee → Connect → build → verify); the first second-tenant build remains open. |
| **GAP-11** | **A club cannot define its own staff roles.** `staff_roles` is per club but the code still ships exactly two seeded roles, the shared `STAFF_ROLES` union, and Edge guards that read a role name. | A club with a box-office lead, a matchday manager or a read-only auditor must reuse `admin` (too broad) or `gatekeeper` (too narrow). | **Open** — REQ-046. Owner: engineering. Definition of done: `RBAC-1…RBAC-8` pass and NFR-10 flips to `shipped`. |

## 7. Change control

- Requirements change through this document: add/retire a `REQ-*` row, update
  the traceability map, and record the decision in `PLAN.md`.
- Scope decisions that remove a requirement must move it to §6 Known gaps with
  a reason — nothing is deleted silently.
- Documentation drift is a test failure (`scripts/tests/docs.test.mjs`), not a
  review comment.
