# DOCSCHECK — KickOff documentation quality & testability review

**Review date:** 2026-11-19
**Scope:** all 17 documents listed in the request; no scope arguments were given.
**Mode:** review-only when written. **Remediation applied 2026-11-20:** the
critical contradictions, the NFR gaps, the glossary, REQ-046/GAP-11 and the
documentation contracts are now in the source docs. This file remains the
review record; where it says “proposed”, the applied text is in the named doc.
**Second remediation 2026-11-20 (verification-gap pass):** the executed Edge
integration suite (checkout → webhook → ticket → receipt, scan/undo, refunds),
the client-screen/accessibility tests, the service-key bundle scan and the
`REQTRACE.md` contract were added. The receipt's default club is `th-TH`; its
PDF now uses the documented ASCII/English fallback because a Thai font does not
fit the Edge worker heap. `REQTRACE.md` is the dated coverage register.

**Baseline verified against the repo at HEAD (`40e2f26`):**

| Fact | Verified value | How |
|---|---|---|
| Migrations | **67** | `ls supabase/migrations \| wc -l` |
| Edge Functions | **20** (excluding `_shared` and `tests`) | `supabase/functions/*/index.ts` |
| pgTAP suites | **29** | `ls supabase/tests/*.test.sql` |
| pgTAP assertions | **444** | `bash scripts/run-pgtap.sh` |
| JS/repo tests | **309** | `npm test` |
| `profiles.role` | **dropped in `0048`** | `0048_drop_legacy_role.sql` |
| `is_platform_admin()` | **exists since `0054`** | `0054_platform.sql` |
| Scan outcomes | `valid`, `used`, `invalid`, `wrong_match`, **`wrong_zone`** | `database.types.ts`, `0065` |
| Match clock | **every minute** | `0058_match_clock.sql` |
| Next migration | **`0068`** | 67 applied, `0067` is the last |

---

## 1. Scoring rubric

Each document was checked on dimensions A–G from the task. Counts are the number of **distinct** items that need a rewrite or an added criterion — not the number of sentences.

**Grade for `/testgen` readiness**

| Grade | Meaning |
|---|---|
| **A** | Every requirement has a trigger, an observable outcome and quantified bounds. A tester can write pass/fail tests with no guesswork. |
| **B** | Mostly testable; minor wording gaps, no contradictions. |
| **C** | Testable after local clarification; several untestable statements or one stale section. |
| **D** | Multiple untestable requirements and/or contradictions. Tests would encode the wrong behaviour. |
| **F** | Document is structurally unusable for test generation (major stale model, contradictory authority, or missing acceptance criteria across a whole feature area). |

---

## 2. Per-document score table

| # | Document | Ambiguity | Untestable | Missing criteria | Conflicts | Grade |
|---|---|---:|---:|---:|---:|:---:|
| 1 | `docs/adr/ADR-001-account-model.md` | 2 | 3 | 3 | 1 | **C** |
| 2 | `docs/adr/ADR-002-multi-tenancy.md` | 2 | 2 | 2 | 1 | **B** |
| 3 | `docs/adr/ADR-003-stripe-connect.md` | 2 | 2 | 2 | 1 | **B** |
| 4 | `docs/adr/ADR-004-white-label.md` | 2 | 2 | 2 | 1 | **B** |
| 5 | `docs/ARCHITECTURE.md` | 7 | 9 | 8 | 12 | **F** |
| 6 | `docs/BRAND.md` | 4 | 4 | 4 | 3 | **C** |
| 7 | `docs/FILE-INDEX.md` | 3 | 3 | 3 | 1 | **B** |
| 8 | `docs/FLOW-AUDIT.md` | 5 | 4 | 3 | 5 | **D** |
| 9 | `docs/PRIVACY.md` | 6 | 7 | 6 | 3 | **D** |
| 10 | `docs/PUSH.md` | 3 | 4 | 3 | 0 | **B** |
| 11 | `docs/REQUIREMENTS.md` | 10 | 8 | 7 | 4 | **D** |
| 12 | `docs/RUNBOOK.md` | 6 | 9 | 8 | 3 | **C** |
| 13 | `docs/SECURITY.md` | 7 | 8 | 10 | 7 | **D** |
| 14 | `docs/SRS.md` | 8 | 12 | 9 | 6 | **D** |
| 15 | `docs/TESTING.md` | 5 | 6 | 7 | 2 | **C** |
| 16 | `PLAN.md` | 5 | 4 | 5 | 2 | **C** |
| 17 | `README.md` | 4 | 3 | 3 | 6 | **D** |
| | **Total** | **77** | **88** | **83** | **58** | |

---

## 3. Readiness verdict

### **NEEDS WORK** — not ready for a whole-set `/testgen` run.

The requirements corpus is strong enough to generate tests for **one bounded slice** today: the C10.10 fixture-creation path (`admin_create_match_full`, `CF-1…CF-6`, `CMF-1…CMF-22`), because `PLAN.md` C10.10b/c and `TESTING.md` carry precise, current behaviour. The other slices are blocked by six critical contradictions that would make generated tests assert the wrong model:

1. **Multi-tenancy status is simultaneously shipped and “next phase”** (README, REQUIREMENTS §1, ARCHITECTURE §8, BRAND locale).
2. **Counts drift** — 39/16/10 in ARCHITECTURE vs 67/20/29 in reality; 308/20 in SRS vs 444/29 in TESTING.
3. **Reschedule authority contradicts itself** — client-only Zod vs database-enforced RPC.
4. **`is_platform_admin()` is described as future** although it shipped in `0054`.
5. **The account model still says `profiles.role` is mirrored** although `0048` dropped it.
6. **Privacy says tenant rows are erased at offboarding and the tenant row survives as a tombstone.**

After fixing those six (and the ~12 High items), the set moves to **READY WITH CAVEATS**; after the missing NFRs (performance/availability/accessibility/retention SLAs) it reaches **READY**.

---

## 4. Prioritized findings

`DS-###` IDs are review-local so they do not collide with the existing `F-xx` flow-audit IDs. “Rewrite” text is paste-ready; it is **proposed**, never applied.

### 4.1 Critical (blocks test generation)

| ID | Doc & section | Issue | Proposed fix |
|---|---|---|---|
| **DS-001** | `README.md` lines 19–21; `REQUIREMENTS.md` lines 25–28; `ARCHITECTURE.md` §8; `BRAND.md` identity | Multi-tenancy is described as future in four places and shipped in five others. | Replace all four with the “shipped since `0045`” statement in §5.1 below. |
| **DS-002** | `ARCHITECTURE.md` §2.2 lines 124–128 | `migrations/ 39 ordered SQL migrations`, `functions/<name>/ (16)`, `tests/ pgTAP suites (10)` are all false. | `migrations/ 67 ordered SQL migrations`; `functions/<name>/ one directory per function (20)`; `tests/ pgTAP suites (29)`. |
| **DS-003** | `ARCHITECTURE.md` §4.4 vs SRS REQ-19 / `admin_update_match()` | §4.4 says “The rules live in the shared Zod schema … no database trigger enforces them” then says the database refuses a move without a reason. | Rewrite §4.4 as: “The *policy* (upcoming-only, future, lock window, never earlier, ≤10 days, reason) is parsed by `adminRescheduleSchema`; the *write* is `admin_update_match()`, which re-checks the reason and writes the change + audit row in one transaction. A direct PostgREST update is not a supported path and must be tested as refused.” |
| **DS-004** | `SECURITY.md` §2.1 line 85 | “`is_platform_admin()` gates the cross-tenant console and arrives with C9.” | “`is_platform_admin()` (since `0054`) gates the cross-tenant console; `platform_admins` is RLS-on with no policies and `set_platform_admin()` is the only writer.” |
| **DS-005** | `ARCHITECTURE.md` §3 line 139; SRS REQ-01 rule 3 | “role lives in the JWT claim, mirrored in `profiles`”; “role defaults to `customer`” — `profiles.role` was dropped in `0048`. | “Authority is `staff_members` + `staff_roles` per tenant; the Edge guards read `app_metadata.role`. `profiles` carries no role column since `0048`.” |
| **DS-006** | `PRIVACY.md` §The three rules line 32 vs §What a club’s exit does line 102 | `seat_holds` is “ERASE — the row is deleted” but the table says “active holds released”; `tenants` is “ERASE (at offboarding)” but the exit section says the row survives as a tombstone. | “`seat_holds`: DELETE at account deletion (not released).” / “`tenants`: retained as a tombstone with `erased_at` set; all other tenant-scoped rows are deleted.” |
| **DS-007** | `TESTING.md` §3 line 79 | “Tenant isolation (C7, planned)” contradicts the quick-reference table that already lists tenant isolation. | “Tenant isolation (C7.3, shipped): T-01…T-24.” |
| **DS-008** | `RUNBOOK.md` §3.2 line 96 | “`0050…` is the next free number.” | “`0068` is the next free number (67 applied).” |
| **DS-009** | `SRS.md` §6 line 327 | “(308 assertions / 20 suites)” | “(444 assertions across 29 suites; verified 2026-11-19).” |
| **DS-010** | `ARCHITECTURE.md` §4.2; `SECURITY.md` §6; `SRS.md` REQ-21 | Scan result sets omit `wrong_zone`, so a generated test cannot know the stand refusal exists. | Add `wrong_zone` to every result set and state: “a pass for another stand returns `wrong_zone`, records a `scan_events` row, and does **not** consume the pass.” |

### 4.2 High

| ID | Doc & section | Issue | Proposed fix |
|---|---|---|---|
| **DS-011** | `ARCHITECTURE.md` §8 | Multi-tenancy, staff roles, observability, locale/currency and tracing are listed as future work; all are delivered. | Replace §8 with a “Delivered capability” table and keep only `GAP-08`/`GAP-10` as extension points. |
| **DS-012** | `ARCHITECTURE.md` §4.5 line 238 | “`pg_cron` (hourly)” vs migration `0058` (`every minute`). | “`pg_cron` (every minute) → `xclub-match-clock` …; reminders themselves run hourly.” |
| **DS-013** | `ARCHITECTURE.md` §3.1 line 159 | “until a step lands, the current tables stay authoritative” — all steps landed. | Delete the sentence; title the table “Current model (C6–C7, `0040`–`0048`, all landed)”. |
| **DS-014** | `ARCHITECTURE.md` §3 key invariants line 152 | “Nothing but admins reads `audit_logs` / `scan_events`” contradicted by SECURITY §2 (gatekeeper reads own `scan_events`). | “Admins read `audit_logs`; admins read all `scan_events`, a gatekeeper reads only the rows it operated.” |
| **DS-015** | `ARCHITECTURE.md` §6.10 line 369 | “The database mirrors it in the `profiles_role_check` constraint.” | “The database enforces the vocabulary through `staff_roles(code)`; the legacy `profiles_role_check` was dropped in `0048`.” |
| **DS-016** | `ARCHITECTURE.md` §7 D-06 | “Reschedule rules live in shared Zod + UI, no trigger/RPC” contradicts `0038`. | “D-06 (superseded by `0038`): policy in shared Zod, write in `admin_update_match()`.” |
| **DS-017** | `SECURITY.md` §2 lines 39–55 vs §2.1 | The single-tenant matrix is presented first and then declared replaced; neither table is complete (`refunds`, `staff_*`, `error_events`, `platform_admins`, `match_notifications` missing). | Keep **one** tenant-scoped matrix; move the historical matrix under “History”. |
| **DS-018** | `SECURITY.md` §2 line 69 | “`public.is_admin()` reads the JWT claim” contradicts §2.1 (`staff_members` + `staff_roles`). | “`is_admin()` is a `security definer` membership check at `current_tenant()`; the Edge guards separately read `app_metadata.role`.” |
| **DS-019** | `SECURITY.md` §1 | Secret inventory omits `ALERT_WEBHOOK_URL`, the reminder scheduler secret, `EAS_PROJECT_ID`, the FCM V1 key, `ADMIN_APP_URL`/`ALLOWED_ORIGINS`, `E2E_*`. | Add one row per secret with owner, storage, rotation trigger and blast radius. |
| **DS-020** | `SECURITY.md` §4 / `PRIVACY.md` line 59 | `stripe_events.payload` may contain payer name/email but SECURITY never says so. | Add: “`stripe_events.payload` may contain payer PII; it is retained for post-mortems only, never re-trusted, and is covered by tenant erase.” |
| **DS-021** | `SRS.md` §1.2 line 36 vs `README.md` line 67 | “Postgres 15” vs “Postgres 17”. | Pick the deployed major version and state it once; link the other document. |
| **DS-022** | `SRS.md` §5.2 | Edge Function table lists 16 of 20 (missing `bootstrap`, `stripe-onboard`, `reconcile-payments`, `scan-demo`) and gives no error contract. | Add every function with auth, success shape, error codes and idempotency. |
| **DS-023** | `SRS.md` §5.1 | RPC list omits `admin_create_match_full`, `admin_save_venue_zone`, `admin_set_match_status/result`, `record_match_clock`, `export_tenant`, `erase_tenant`, `mark_tenant_offboarded`, `set_platform_admin`, `provision_tenant`. | Add each RPC with caller authority, inputs, outputs, refusal codes and test ID. |
| **DS-024** | `SRS.md` §4 NFR-10 vs `REQUIREMENTS.md` NFR-10 | REQUIREMENTS says `shipped`; SRS says `partial`. | Resolve to one state. Recommended: `shipped` for the two-role model; open a new `GAP-11` for custom per-club roles. |
| **DS-025** | `SRS.md` REQ-21 line 217 | Result set is `valid/used/invalid/wrong_match`; `wrong_zone` is missing. | Add `wrong_zone` and the “pass stays valid” rule. |
| **DS-026** | `SRS.md` REQ-01 rule 3 | “role defaults to `customer`.” | “A new user gets a `profiles` row through `handle_new_user`; no role is stored on `profiles`. Staff authority is a separate `staff_members` row.” |
| **DS-027** | `SRS.md` §6 definition of done | Requires `shipped` + a green proof, but no rule for `partial`/`open`; allows untestable states. | “A requirement is testable only when state is `shipped`, the traceability row names a test file and a test ID, and that test fails when the behaviour is removed.” |
| **DS-028** | `REQUIREMENTS.md` §5 traceability | NFR-02, NFR-04, NFR-05, NFR-08…NFR-12 and all SC rows have no proof entry. | Add one row per ID with implementation + a named test/contract. |
| **DS-029** | `REQUIREMENTS.md` REQ-22 vs SRS REQ-21/22 | “`scan-undo`, admin only” vs “staff (admin or gatekeeper), same operator only”. | “REQ-22: a staff member (`admin` or `gatekeeper`) may undo **their own** scan within 60 s.” |
| **DS-030** | `REQUIREMENTS.md` NFR-01/02/04/06/09/11/12; SRS §4 | Unquantified NFRs (RLS coverage, secret confinement, tamper-evidence, determinism, isolation, observability, i18n). | Replace with the measurable NFR text in §5.2. |
| **DS-031** | `REQUIREMENTS.md` SC-07 | “Free-tier hosting, limited concurrency” has no number. | “Free-tier hosting; the system must sustain 50 concurrent seat selections and 240 scans/min without a 5xx.” |
| **DS-032** | `REQUIREMENTS.md` REQ-05 | “See live seat availability” — no freshness bound in the requirement itself. | “WHEN the seat map is open, availability refreshes at most every 3 s and no stale value older than 5 s is shown as current.” |
| **DS-033** | `RUNBOOK.md` §3.5 line 129 vs §10.2 line 477 | `provision_tenant()` is called with 4 args in one place and 5 in the other; `0053` dropped the 4-arg signature. | Use the 5-arg form everywhere: `provision_tenant(name, slug, currency, locale, timezone)`. |
| **DS-034** | `RUNBOOK.md` §2/§5/§7 | “Normal”, “triage”, “quarterly” have no thresholds, severities, RPO/RTO or owners. | Adopt §5.3’s operational targets. |
| **DS-035** | `README.md` lines 385–389 | “`app_metadata.role` claims drives admin access (`is_admin()` in RLS)” is stale. | “The Edge guards read `app_metadata.role`; RLS authorises on the club membership (`staff_members` + `staff_roles`).” |
| **DS-036** | `README.md` lines 429–434 | Palette says “pitch green `#0B6B3A`, trophy gold `#F4C430`, night `#07130D`, ink `#0F172A`”; BRAND says black/blue/gold with different hexes. | Replace with the BRAND table’s `primary #000000`, `primaryBright #184794`, `accent #FFCA6F`, `night #070C17`, `ink #0A0F1A`. |
| **DS-037** | `README.md` demo script lines 255–257 | “New fixture … add a zone with rows, seats and a price” no longer matches the atomic four-section dialog. | “New fixture → Match → Venue → Zones → Gates; add the ground, stands and gates in the same draft; one Create commits all of it.” |
| **DS-038** | `BRAND.md` line 19 | “Locale — English only (Thai deferred)” contradicts NFR-12/GAP-05 closed and the Thai catalog. | “Locale — per-club (`tenants.locale`); English is the source language and Thai ships as the contracted catalog. The admin console stays English.” |
| **DS-039** | `FLOW-AUDIT.md` §2/§3 tables | Rows still describe the pre-fix state (“**silent** (F-01)”, “**none**”, “ad-hoc”) although every finding is marked fixed. | Add a “Current state” column or a header: “Tables record the state **as audited on 2026-11-13**; see §4 for fixes.” |
| **DS-040** | `FLOW-AUDIT.md` §1 line 23 vs §4 | “a source-text assertion … does not count” but several fixed findings are proven only by source-text/contract tests. | Redefine: “A contract test counts for shape/wiring; behaviour claims require a behavioural test.” |
| **DS-041** | `PRIVACY.md` §Data inventory | No retention **duration** for RETAIN rows despite “for how long”. | Add a `Retention` column: orders/tickets/refunds 7 years; `scan_events` 3 years; `audit_logs` 7 years; `stripe_events` 90 days; `error_events` 30 days. |
| **DS-042** | `PRIVACY.md` line 51 | “`device_tokens` … swept after 90 days without use” — no job, test or owner named. | Name the job and acceptance: “`xclub-prune-device-tokens` deletes rows with `last_used_at < now() - 90 days`; tested by PT-1.” |
| **DS-043** | `ARCHITECTURE.md` §4.1 line 188 | “card only, THB” — currency is now per club. | “card only; the currency is the order’s snapshotted `currency` (club default at checkout).” |
| **DS-044** | `ARCHITECTURE.md` §2.1 line 70 | “the seat map reads `seats`” — the authoritative source is `zone_availability`. | “The seat map reads `zone_availability` / `seat_availability`; it never derives availability from `seats`.” |
| **DS-045** | `ARCHITECTURE.md` / all docs | No glossary; `fixture`/`match`, `zone`/`stand`, `gate`/`turnstile`, `venue`/`ground` are used interchangeably. | Add a glossary table and use one term per concept. |
| **DS-046** | `PLAN.md` §Current status | “Phase C … in progress” with no remaining-item list or exit criteria. | Add “Remaining: none for C10.10; open: GAP-08/GAP-10; phase exits when …”. |
| **DS-047** | `PLAN.md` C10.9/C10.10b | Historical entries say 422/28 then 444/29 without an “as of” marker. | Add “(counts as of that cycle)” or a single current-count line at the top. |
| **DS-048** | `TESTING.md` §1/§2 | “Every layer has one command” is false (mobile = `npm test`, Deno = `cd …`, Playwright = workspace script, Maestro). | “Each layer has an entry point in the table; CI runs the deterministic layers, interactive layers are opt-in.” |
| **DS-049** | `TESTING.md` | No requirement→test map, no skip policy, no performance/security/load layer. | Add a traceability column keyed by `REQ-###` and an explicit skip budget. |
| **DS-050** | `ADRs` all four | No “Consequences”, “Alternatives considered” or acceptance-test section; status is “accepted (design)” while some context is historical. | Add `Consequences` and `Verified by` sections; mark historical context explicitly. |

### 4.3 Medium (selected)

| ID | Doc & section | Issue | Proposed fix |
|---|---|---|---|
| **DS-051** | `ADR-002` §Context | “one deployment serves one club today (`SC-01`)” reads as current. | “At the time of this decision …; superseded by `0045`.” |
| **DS-052** | `ADR-002` §Decision 1 | `status (active \| suspended)` omits tombstones. | Add `offboarded_at`, `erased_at` and the tombstone rule. |
| **DS-053** | `ADR-003` §Decision 4 | “bridge” behaviour lets an un-onboarded club sell on the platform account, contradicting “the club is the merchant of record” for that period. | “Until onboarding, the platform is the merchant of record and charges no fee; after onboarding the club is.” |
| **DS-054** | `ADR-004` §Decision 1 | “One mobile app and one admin console per club” conflicts with the single monorepo console. | “One branded build per club from this monorepo; the admin console is deployed once and resolves the club from the session.” |
| **DS-055** | `FILE-INDEX.md` §Reading rules | “reviewed” has no required evidence (reviewer, date, what was checked). | Add `Reviewed by` and `Reviewed at` columns, or require a note that names the check. |
| **DS-056** | `FILE-INDEX.md` | `--check` proves existence only, not freshness. | Add a contract that fails when a reviewed source file's hash changes without a note update. |
| **DS-057** | `PUSH.md` §0 | “five links” has no per-link pass/fail acceptance. | Add one observable per link (file present, key uploaded, id in build, token row, valid ticket). |
| **DS-058** | `BRAND.md` §Rules | “wide tracking”, “correctly licensed”, “size budget” are unquantified. | Specify letter-spacing, licence file, and max bytes/pixels. |
| **DS-059** | `SECURITY.md` §7 | No 429 body/`Retry-After` contract or boundary test per action. | “At budget+1, return 429 with `{code:'rate_limited', retryAfterSeconds}`; tested by RL-1…RL-5.” |
| **DS-060** | `SECURITY.md` §8 | No object size/type limits or signed-URL TTL. | “receipts: PDF ≤ 2 MB; signed URL TTL 60 s; news-images: jpeg/png/webp ≤ 5 MB.” |
| **DS-061** | `REQUIREMENTS.md` §1.1 | Actors lack permission matrices; “Box-office staff” appears nowhere else. | Align actors with `admin`/`gatekeeper`/`platform operator` and cite their surfaces. |
| **DS-062** | `SRS.md` REQ-03 | No acceptance for empty category, unlicensed image, or reading-time calculation. | Add cases: missing image → placeholder; `read_minutes = ceil(words/200)`; invalid category → 400. |
| **DS-063** | `SRS.md` REQ-07/REQ-24 | No duplicate-payment, webhook-after-refund, or DB-half-failure acceptance. | Add state-machine cases and expected error codes. |
| **DS-064** | `SRS.md` REQ-23 | Offline queue has no max size, retry budget or conflict rule. | “Queue ≤ 500 entries; retries 5 with exponential backoff; a replayed scan that conflicts returns the original outcome.” |
| **DS-065** | `RUNBOOK.md` §6.4 | “within 60 s” boundary is unspecified. | “Undo is accepted while `now() - scanned_at <= 60 s`; at 60.001 s it returns `undo_window_expired`.” |
| **DS-066** | `RUNBOOK.md` §11.5 | Six checkboxes labelled “All five”. | “All six” or remove one. |
| **DS-067** | `PUSH.md` §3 | `npx eas-cli@latest` is unpinned; builds are not reproducible. | Pin `eas-cli` in `devDependencies` and call the local binary. |
| **DS-068** | `PLAN.md` Open work | Duplicates `REQUIREMENTS.md` §6 and can drift. | Make PLAN link to §6 and keep only sequencing. |
| **DS-069** | `FLOW-AUDIT.md` §2/§3 | New flows (create-fixture dialog, platform console, venue layout) are absent from the 29. | Add M15/A16/A17 and re-state the scope count. |
| **DS-070** | `FILE-INDEX.md` line 12 | “Last verified 2026-11-15” predates `0067`. | Update to 2026-11-19. |
| **DS-071** | `ARCHITECTURE.md` §6.10 line 376; `FILE-INDEX.md` roles row; `SRS.md` REQ-01/REQ-26; `RUNBOOK.md` §6.6; `ADR-001` lines 10/31/34 | `customer` is described as a staff role (“vocabulary is exactly customer/gatekeeper/admin”), and role changes are described as writing the “profile row”. | “Staff roles are exactly `admin` and `gatekeeper`; `customer` is the absence of a `staff_members` row. A change writes the membership and the `app_metadata.role` claim; `profiles.role` was dropped in `0048`.” |
| **DS-072** | `REQUIREMENTS.md` NFR-10/GAP-03; `SRS.md` NFR-10 | NFR-10 claims fine-grained roles are **shipped**, SRS says **partial**, and GAP-03 is closed although a club still cannot add a role. | “Built-in `admin`/`gatekeeper` shipped; **custom role definition is open** (`REQ-046`, `GAP-11`, `NFR-10`). Acceptance `RBAC-1…RBAC-8` pending.” |

---

## 5. Paste-ready rewrites

### 5.1 Canonical multi-tenancy statement (replaces `README.md` 19–21, `REQUIREMENTS.md` 25–28, `ARCHITECTURE.md` §8, `BRAND.md` locale)

> **Deployment model.** The platform is multi-tenant since `0045`. One Supabase project serves many clubs; every tenant-scoped row carries `tenant_id`, composite foreign keys prevent cross-club references, and RLS resolves the club through `current_tenant()`. Branding, currency, locale, time zone and the Stripe connected account are per club. The remaining B2B gaps are `GAP-08` (ticket transfer) and `GAP-10` (per-club release overhead), not tenancy.

### 5.2 Measurable NFRs (replace `REQUIREMENTS.md` §3 rows and mirror in `SRS.md` §4)

| ID | Rewrite |
|---|---|
| **NFR-01** | “Every table in schema `public` has `relrowsecurity = true` and at least one policy for each API role that may touch it. A new table without RLS fails `pgTAP NFR-01`. Exception: `platform_admins` has RLS enabled and **zero** policies (deny-all).” |
| **NFR-02** | “No client bundle contains `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TICKET_HMAC_KEY` or `METRICS_TOKEN`. A CI scan of every built bundle fails on any of those literals; `EXPO_PUBLIC_*`/`NEXT_PUBLIC_*` may contain only the URL, anon key and boolean flags.” |
| **NFR-04** | “Every pass payload matches `KICKOFF-V2:` + HMAC-SHA256 over `v2\|ticket_id\|match_id\|order_id\|qr_nonce`. A payload with a modified field, an unknown nonce, or a signature computed with another key returns `invalid`; verification is constant-time.” |
| **NFR-06** | “Every push to `main` runs these jobs and fails the build on any non-zero exit: typecheck, lint, unit (309), no-mocks, pgTAP (444), Edge `deno check`, executed edge integration, admin build. The job list itself is asserted by `CI-1`.” |
| **NFR-09** | “For every tenant-scoped table, a session with club A's claim reads 0 rows of club B and a write referencing club B fails with `23503`/`42501`. Asserted by T-01…T-24 for all 13 scoped tables.” |
| **NFR-10** | “Per-club role definition: a club can add staff roles without a migration; each role is a tenant-scoped row with a subset of the closed capability catalogue; no authorization path names a role; cross-tenant role reads/writes return zero rows or `23503`/`42501`; every role write is audited. Built-in `admin`/`gatekeeper` shipped; custom roles are `REQ-046` / `GAP-11`, acceptance `RBAC-1…RBAC-8` pending.” |
| **NFR-11** | “Every 5xx writes one `error_events` row sharing the response `x-request-id`; rows are pruned at 30 days. An alert fires at most once per function+code per 30 minutes. `metrics` exposes `errors.total` and `reconciliation.unsettled`.” |
| **NFR-12** | “The supporter app renders every user-facing string through `translate()`; the Thai catalog covers 100 % of used keys and contains 0 orphan keys. Every on-screen date and money value renders with `tenants.locale`, `tenants.currency` and `tenants.timezone`. The PDF receipt is the documented exception: it uses English copy and ISO money because the standard PDF font cannot encode Thai or `฿` (REQTRACE §10).” |
| **NFR-13 (new)** | “Seat availability: p95 read-to-render ≤ 300 ms; the map polls every 3 s; a value older than 5 s is marked stale, never shown as current.” |
| **NFR-14 (new)** | “Availability: monthly p95 API availability ≥ 99.5 %, measured by `health`; a 5xx burst of >5 in 5 minutes pages.” |
| **NFR-15 (new)** | “Accessibility: every interactive control has an accessible name; text contrast ≥ 4.5:1; the seat grid is operable by keyboard and screen reader.” |
| **NFR-16 (new)** | “Retention: orders/tickets/refunds/audit 7 years; `scan_events` 3 years; `stripe_events` 90 days; `error_events` 30 days; `device_tokens` 90 days unused. Erasure completes within 30 days of request.” |
| **NFR-17 (new)** | “Backup: RPO ≤ 24 h, RTO ≤ 4 h; a quarterly restore drill must restore into a scratch project and pass the pgTAP suite before sign-off.” |

### 5.3 Testable functional requirements (replace the listed rows)

**REQ-05 — live availability**

> **WHEN** the supporter opens `/seats/[matchId]`, **THEN** availability is read from `zone_availability` and refreshed every 3 s. **IF** a poll is in flight, the current selection is not overwritten. **IF** the read fails, the screen shows “Couldn’t load availability — Retry” and never “SOLD OUT” or 0. **Acceptance:** a seat held by another session is shown unavailable within 5 s of the hold; a forced query error renders the error state (test `AV-1…AV-4`).

**REQ-06 — seat hold**

> **WHEN** a supporter selects N available seats and confirms, **THEN** `create_hold` creates exactly one active hold per seat for 600 s. A second hold on the same seat returns `seat_taken` and creates no row. At `expires_at + 1 s`, the seat is available again and a checkout on the expired hold returns `hold_expired`. **Acceptance:** `hold-concurrency.test.sql`, `hold-ttl.test.sql`.

**REQ-07 — Stripe payment**

> **WHEN** checkout starts, **THEN** the server computes the total from `order_seats` and rejects any client amount. A duplicate `POST /stripe-checkout` for the same order returns the same session URL (idempotent) and creates at most one `stripe_events` fulfilment per event id. **IF** the webhook arrives after a refund, the order stays `refunded` and no ticket is issued. **Acceptance:** `checkout-idempotency` (new), `order-expiry.test.sql`, `stripe-webhook` Deno tests.

**REQ-21/22 — scanning and undo**

> **WHEN** a staff member scans a pass, **THEN** the result is exactly one of `valid`, `used`, `invalid`, `wrong_match`, `wrong_zone`. `wrong_zone` means the gate serves another stand; the pass stays `valid` and a `scan_events` row records the attempt. **WHEN** the same operator undoes within 60.000 s, **THEN** the ticket returns to `valid` and `undone_at`/`undone_by` are set. At 60.001 s the call returns `undo_window_expired` and changes nothing. **Acceptance:** GZ-1…GZ-12, `scan.test.sql`.

**REQ-23 — offline queue**

> **WHEN** the scanner loses connectivity, **THEN** attempts are queued in `localStorage` with an idempotency key, at most 500 entries, retried 5 times with exponential backoff (1, 2, 4, 8, 16 s). A replay that conflicts returns the original outcome, never a second admission. An unreadable entry is quarantined and the operator sees “N scans could not be read”. **Acceptance:** `offline-queue.test.ts` (QF-1…QF-5).

**REQ-24 — refunds**

> **WHEN** an admin refunds a paid order, **THEN** `refund-order` requires `payment_intent_id`; a used ticket requires `overrideUsedTickets: true`; the Stripe call carries the order-scoped idempotency key; `mark_order_refunded()` flips order → `refunded`, voids valid tickets, releases seats and writes `order.refund` in one transaction. **IF** the database half fails, a retry returns the same Stripe refund and completes the database half once. **Acceptance:** `atomicity.test.sql` F07-1…F07-4.

### 5.4 Operational targets (replace `RUNBOOK.md` §2, §5, §7)

| Area | Rewrite |
|---|---|
| Normal health | “`health` 200 in ≤ 500 ms p95; deep check includes Stripe and completes ≤ 2 s.” |
| Alerts | “Page when: `scans.failed` > 5 in 5 min; `holds.conflicts` > 20 in 5 min; any 5xx burst > 5 in 5 min; `reconciliation.unsettled` > 0 for 30 min.” |
| Incident severities | “SEV-1 (money or admissions down): acknowledge 5 min, update every 15 min, postmortem 48 h. SEV-2 (degraded): acknowledge 30 min, postmortem 5 days. SEV-3: next business day.” |
| Backup | “RPO ≤ 24 h; RTO ≤ 4 h. Quarterly drill: restore latest backup to a scratch project, run `npm run db:test` (444 assertions) and compare `profiles`/`orders`/`tickets` counts; record the result in the release ticket.” |
| Key rotation | “Rotate `TICKET_HMAC_KEY` only between matchdays; record the rotation date, operator and the first successful scan in the release ticket. Rotate the FCM key before the next build if compromised.” |

### 5.5 Privacy schedule (replace `PRIVACY.md` table rows)

| Table | Rewrite |
|---|---|
| `seat_holds` | “**ERASE** — every row for the fan is deleted at account deletion. Holds are never ‘released’ as a deletion mechanism.” |
| `tenants` | “**RETAIN as tombstone** — at offboarding the row survives with `erased_at`, name and slug; branding, Connect account and all tenant-scoped child rows are deleted.” |
| `orders`/`tickets`/`refunds` | “**RETAIN 7 years** from the order date (accounting law), with person references pseudonymised after profile SCRUB.” |
| `scan_events` | “**RETAIN 3 years** (stadium safety), append-only.” |
| `audit_logs` | “**RETAIN 7 years**; metadata may contain ids and reasons, never secrets or payment data.” |
| `stripe_events` | “**RETAIN 90 days**, then delete; may contain payer name/email — never re-trusted.” |
| `device_tokens` | “**ERASE** at deletion, and prune rows unused for 90 days through `xclub-prune-device-tokens` (PT-1).” |

### 5.6 Architecture corrections (paste into the named sections)

- **§2.2:** `migrations/ 67 ordered SQL migrations`; `functions/<name>/ 20 functions`; `tests/ 29 pgTAP suites (444 assertions)`.
- **§3 Access row:** `profiles`, `app_settings`, `app_secrets`, `staff_members`, `staff_roles` | “identity is global; authority is the per-club membership; the legacy `profiles.role` is gone since `0048`.”
- **§3.1 heading:** “Current model (C6–C7 delivered in `0040`–`0048`)”.
- **§4.2:** add `wrong_zone`; add “the gate’s stand is compared with the ticket’s venue zone; a mismatch does not consume the pass.”
- **§4.4:** replace the “no database trigger” claim with the `admin_update_match()` transaction statement and explicitly test that a direct PostgREST kickoff update is refused.
- **§4.5:** `pg_cron` (every minute) for the match clock; reminders hourly.
- **§8:** replace the roadmap with “Delivered: multi-tenancy, staff roles, observability, locale/currency. Open: GAP-08, GAP-10.”

### 5.7 Stable requirement IDs

The corpus already uses **`REQ-01`…`REQ-29`** in `REQUIREMENTS.md` and `SRS.md`. Renumbering to `REQ-001` would break every existing reference in `PLAN.md`, `FLOW-AUDIT.md` and the tests. Recommended:

1. Keep `REQ-01`…`REQ-29` as the canonical IDs.
2. If `/testgen` requires three digits, add an explicit alias table: `REQ-001 = REQ-01` … `REQ-029 = REQ-29`. Do not rewrite the source docs.
3. Add the new IDs below for currently untracked behaviour:

| New ID | Requirement |
|---|---|
| REQ-030 | Tenant provisioning (`provision_tenant`, idempotent by slug) |
| REQ-031 | Platform status change and fee change (audited, bounded) |
| REQ-032 | White-label bootstrap binds `app_metadata.tenant_id` |
| REQ-033 | Stripe Connect onboarding is idempotent per club |
| REQ-034 | Atomic fixture creation (`admin_create_match_full`) |
| REQ-035 | Stand-level gate admission (`wrong_zone`, pass not consumed) |
| REQ-036 | Match clock transitions and bells |
| REQ-037 | Postpone/cancel/restore semantics |
| REQ-038 | Seating lock after kickoff |
| REQ-039 | Fan data export |
| REQ-040 | Fan erasure |
| REQ-041 | Tenant export |
| REQ-042 | Tenant erase behind the money gate |
| REQ-043 | Platform console access boundary |
| REQ-044 | Observability request-id correlation |
| REQ-045 | Payment reconciliation sweep |
| REQ-046 | Per-club custom staff role definition and assignment (**open**, `GAP-11`, `RBAC-1…RBAC-8` pending) |

---

## 6. Cross-document contradiction register

| # | Fact | Conflicting statements | Correct value |
|---|---|---|---|
| X-01 | Tenancy state | README “one club per deployment … next architecture phase”; REQUIREMENTS §1 same; ARCHITECTURE §8 “needs a data-migration plan”; vs NFR-09 “shipped”, GAP-02 “closed”, SRS §1.1 “enforces per-club isolation” | **Shipped since `0045`** |
| X-02 | Migration count | ARCHITECTURE “39”; README/PLAN “67” | **67** |
| X-03 | Function count | ARCHITECTURE “16”; README “20”; SRS table 16 | **20** |
| X-04 | pgTAP count | ARCHITECTURE “10 suites”; SRS “308 / 20”; PLAN C10.9 “422 / 28”; TESTING “444 / 29” | **444 / 29** |
| X-05 | Role authority | ARCHITECTURE “mirrored in profiles”, “profiles_role_check”; SECURITY §2 “JWT claim”; SECURITY §2.1/ADR-001 “membership” | **Membership, JWT claim for Edge guards only** |
| X-06 | Reschedule enforcement | ARCHITECTURE §4.4 “no trigger/RPC”; SRS REQ-19 “reason required by the database”; `0038` RPC exists | **`admin_update_match()` enforces** |
| X-07 | Scan results | ARCHITECTURE/SECURITY/SRS omit `wrong_zone`; schema has it | **Five outcomes including `wrong_zone`** |
| X-08 | Platform admin | SECURITY “arrives with C9”; `0054` exists; PLAN C9 delivered | **Shipped** |
| X-09 | Locale | BRAND “English only”; NFR-12 shipped; Thai catalog exists | **Per-club; English source, Thai catalog** |
| X-10 | Postgres version | SRS “15”; README “17” | **Verify deployment, then one value** |
| X-11 | Privacy tenant row | PRIVACY table “ERASE”; PRIVACY exit “tombstone survives” | **Tombstone survives** |
| X-12 | Privacy holds | PRIVACY “row deleted” vs “holds released”; PLAN “deleted outright” | **Deleted** |
| X-13 | Brand palette | README green/gold; BRAND black/blue/gold | **BRAND is the source of truth** |
| X-14 | Undo authority | REQUIREMENTS REQ-22 “admin only”; SRS “staff, same operator” | **Staff, same operator, 60 s** |
| X-15 | NFR-10 state | REQUIREMENTS “shipped”; SRS “partial” | **Built-in `admin`/`gatekeeper` shipped; custom role definition open (REQ-046 / GAP-11)** |
| X-16 | Demo flow | README “add a zone”; RUNBOOK/PLAN draft-first dialog | **Draft-first, one atomic call** |

---

## 7. Incompleteness / missing acceptance criteria

These are gaps where **no** requirement exists, so `/testgen` cannot produce anything:

1. **Performance NFR** — no latency, throughput or concurrency target anywhere (DS-030, NFR-13).
2. **Availability/SLO** — no uptime target, error budget or alert threshold (NFR-14).
3. **Accessibility** — no WCAG level, keyboard/screen-reader acceptance (NFR-15).
4. **Retention durations** — PRIVACY promises “for how long” but gives none (DS-041).
5. **Backup RPO/RTO** — RUNBOOK says “verify” and “quarterly” without targets (DS-034).
6. **API versioning** — no compatibility policy for Edge Functions/RPCs.
7. **Data dictionary** — no per-column validation/consistency rules for `venues`, `venue_zones`, `match_zone_prices`, `match_gates`, `refund`.
8. **Error catalogue** — `error-codes.ts` exists, but no doc lists which endpoint returns which code.
9. **Platform console flows** — provisioning, suspend/restore, fee change have no SRS requirement IDs (REQ-030…033).
10. **New fixture dialog** — only `PLAN.md`/`TESTING.md` describe it; `REQUIREMENTS.md` has no REQ row (REQ-034).
11. **Match clock/postpone/cancel** — implemented in C10.5, absent from REQUIREMENTS (REQ-036…038).
12. **Fan/tenant export/erase** — described in PRIVACY/RUNBOOK but not as numbered requirements (REQ-039…042).
13. **Observability/reconciliation** — NFR-11 is one sentence for four mechanisms (REQ-044/045).
14. **Glossary** — no definition of `fixture` vs `match`, `stand` vs `zone`, `gate` vs `turnstile`, `venue` vs `ground`.
15. **Threat model** — SECURITY lists controls but no assets/actors/attack surface table.
16. **Sub-processors / data residency** — Supabase, Stripe, Expo, PostHog are used; PRIVACY never names them.
17. **Custom staff roles** — `REQ-046` / `GAP-11` / `NFR-10` now carry the full requirement and `RBAC-1…RBAC-8`, but the feature is **open**. `/testgen` must emit those IDs as pending, never as passing coverage.

---

## 8. Recommended remediation order

**Before any `/testgen` run (blocks correctness):**

1. Fix X-01 (tenancy statement) in README, REQUIREMENTS §1, ARCHITECTURE §8, BRAND.
2. Fix X-02/X-03/X-04 counts in ARCHITECTURE and SRS.
3. Fix X-05/X-15 authority model in ARCHITECTURE §3/§6.10, SRS REQ-01/REQ-15, SECURITY §2.
4. Fix X-06 reschedule contradiction in ARCHITECTURE §4.4.
5. Fix X-08 platform admin and X-07 `wrong_zone`.
6. Fix X-11/X-12 privacy contradictions.

**Then (High):**

7. Replace all NFR rows with §5.2 text.
8. Add the missing RPC/Edge Function contracts (§5 SRS-22/23).
9. Add `RUNBOOK` targets (§5.4) and `PRIVACY` retention table (§5.5).
10. Add REQ-030…046 and the `REQ-01`↔`REQ-001` alias table.
11. Add the REQ-046 custom-RBAC contract, `RBAC-1…RBAC-8` as pending in `TESTING.md` §10, and `ADR-005` (proposed).

**Then (Medium):**

12. Add the glossary, data dictionary, error catalogue.
13. Split FLOW-AUDIT into “as audited” vs “current”, add the new flows.
14. Add ADR `Consequences`/`Verified by` sections.
15. Add FILE-INDEX review evidence.

---

## 9. What is already good

- `PLAN.md` C10.10a/b/c and `TESTING.md` are precise, current and testable; the `CF-1…CF-6` and `CMF-1…CMF-22` contracts are a model for the rest.
- `PRIVACY.md` has an explicit ERASE/SCRUB/RETAIN decision per table — it only needs the contradictions and durations fixed.
- `PUSH.md` and `RUNBOOK.md` §11 describe a real hardware proof with observable greens; that is the right standard for operational docs.
- `BRAND.md` ties tokens to named tests (`THEME-1`, `THEME-2`, `BRAND-1…5`) — the rest of the corpus should copy that pattern.
- The repo already enforces doc drift (`scripts/tests/docs.test.mjs`, `file-coverage.test.mjs`), so the fixes above can be made permanent with new contracts rather than review discipline.
