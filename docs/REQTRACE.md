# REQTRACE — requirements → test coverage matrix

Audit of [`REQUIREMENTS.md`](REQUIREMENTS.md) against every test in the
repository. This is a **dated snapshot**, not authoritative coverage:
[`REQUIREMENTS.md`](REQUIREMENTS.md) §5 remains the requirement → implementation
map, and the test suites remain the proof.

- **Baseline:** `40e2f26` plus the uncommitted Full-A documentation working tree.
- **Last verified:** 2026-11-20 · **Owner:** engineering · **Refresh:** every
  release and whenever a requirement or test layer is added.
- **Requirement scheme:** `REQ-01…REQ-29`, `REQ-046` (3-digit new ID), `NFR-01…NFR-17`, `SC-01…SC-08`. No `/testgen` report exists, so the docs are the only scheme; `REQ-030…REQ-045` are reserved in `DOCSCHECK.md` §5.7.
- **Test inventory:** 117 files / 537 named tests + 458 pgTAP assertions across 30 suites, 20 Edge Function tests, 4 mobile Jest files at the audit; this revision adds 8 test files and the executed local integration layer.
- **Enforced by:** `scripts/tests/reqtrace.test.mjs` (RT-1 … RT-5): every
  requirement ID appears once, `full` rows name existing non-skipped tests, the
  coverage vocabulary is closed, and every non-full row carries a decision.

## Coverage legend

| Rating | Meaning |
|---|---|
| **full** | An executable test (not skipped by default) exercises the behaviour and asserts the outcome. |
| **partial** | A test exists but only asserts source text/config, runs only behind an integration secret, skips by default, or covers a minority of the requirement's rules. |
| **none** | No test maps to the requirement. |

A source-text assertion is **never** `full`: it proves a string exists, not that the behaviour works.

---

## 1. Functional requirements — supporter app

| REQ ID | Description (short) | Source | Tests | Coverage | Risk if untested |
|---|---|---|---|---|---|
| REQ-01 | Register, sign in/out, password reset, email verification, profile management | REQUIREMENTS §2.1 | `account-lifecycle.test.ts` (sign-up, sign-out, reset + confirmation mail, profile edit), `signup.test.mjs` SU-1…4 | **full** | Locked-out users; broken verification silently strands new accounts |
| REQ-02 | Browse upcoming fixtures and past results | §2.1 | `fixtures-test.tsx` (upcoming/postponed/results render), `seeall.test.mjs` SA-1/SA-3, `match-phase.test.ts` MP-1…7 | **full** | Past fixtures shown as upcoming; wrong "next match" |
| REQ-03 | Read club news and match reports | §2.1 | `news-test.tsx` (render, empty, error), `seeall.test.mjs` SA-2/SA-4, `mobile-resilience.test.mjs` MR-2 | **full** | Empty or stale news with no error state |
| REQ-04 | Select a seating zone and an exact seat | §2.1 | `seat-grid-test.tsx` (select → hold call), `venues.test.mjs` VEN-1…8, `availability.test.mjs` AV-1…4 | **full** | Double-booked / unselectable seats |
| REQ-05 | Live seat availability (3 s poll, selection preserved) | §2.1 | `phaseb.test.mjs` PB1-1…4, `availability.test.mjs` AV-1…4 | **full** | Stale map; selection wiped by polling |
| REQ-06 | Hold a seat while paying (10 min TTL, one active hold) | §2.1 | `hold-ttl.test.sql` (3), `hold-concurrency.test.sql` (1), `constraints.test.sql`, `seat-reservation.test.sql` (16) | **full** | Double-sold seats |
| REQ-07 | Pay with Stripe (server-computed amount) | §2.1 | `orders.test.ts`, `webhook.test.ts` (executed by `run-integration.sh` in default CI), `connect.test.sql` CN-1…9, `connect.test.mjs` CN-1…7 | **full** | Revenue loss; wrong amount; unfulfilled order |
| REQ-08 | Digital pass with match, supporter and signed QR | §2.1 | `hmac.test.ts` (8), `orders.test.ts` (issuance + QR v2), `scan.test.ts`, `scan-concurrency.test.sql` (3) | **full** | Forged/invalid pass; no entry |
| REQ-09 | Order history and order detail | §2.1 | `orders-test.tsx` (render + lifetime spend), `phaseb0.test.mjs` PB0-1…5, `mappers.test.ts` `toOrderDto` (4) | **full** | Missing/incorrect order |
| REQ-10 | Download / share a PDF receipt | §2.1 | `orders.test.ts` (executed PDF bytes), `money-format.test.mjs` MF-6/7, `share.test.mjs` SH-1…3 | **full** | No receipt / wrong currency-locale |
| REQ-11 | Push opt-in for kickoff reminders | §2.1 | `push-delivery.test.ts` (executed fan-out through a local Expo stub), `push.test.mjs` PUSH-1…8, `push-hardware.test.mjs` | **full** | Reminders silently never arrive |
| REQ-12 | Edit profile (name, phone) | §2.1 | `profile-edit-test.tsx` (validation + payload), `rls-auth.test.sql` (own-row RLS) | **full** | Users cannot correct their data |
| REQ-13 | Delete the account | §2.1 | `account-lifecycle.test.ts` (executed erase/retain + audit), `erasure.test.mjs` EC-1…6 | **full** | Data-retention breach; half-erased account |
| REQ-14 | Pass usable without a network | §2.1 | `pass-cache-test.ts` (9), `offline-pass.test.mjs` PASS-1…6, `offline-queue.test.ts` (8) | **full** | Dead pass at the gate |

## 2. Functional requirements — staff console

| REQ ID | Description (short) | Source | Tests | Coverage | Risk if untested |
|---|---|---|---|---|---|
| REQ-15 | Staff sign-in with TOTP MFA | §2.2 | `run-admin-mfa-e2e.sh` (real browser redirect to `/login/mfa`), `mfa.test.ts` (enrol → challenge → aal2), `admin-access.test.mjs` AA-1…7 | **full** | Console reachable without the second factor |
| REQ-16 | Create, edit and delete fixtures | §2.2 | `fixture-admin.test.ts` (create → edit → reschedule → blocked delete → delete), `create-match-full.test.sql` (22), `venue-layout.test.sql` (11) | **full** | Orphaned / unremovable fixtures |
| REQ-17 | Configure zones, rows, seats and prices | §2.2 | `venues.test.mjs`, `create-match-full.test.sql`, `seating-lock.test.sql` (6), `editor-extraction.test.mjs` ED-1…4 | **full** | Bad inventory, wrong prices |
| REQ-18 | Manage venues (add/delete) | §2.2 | `venues.test.sql` (8), `venues.test.mjs` VEN-1…8, `venue-layout.test.sql` (11) | **full** | Cross-club venue leakage |
| REQ-19 | Reschedule with rules + stored reason | §2.2 | `reschedule.test.ts` RS-1…6, `reschedule.test.mjs` RS-7…10, `atomicity.test.mjs` AT-1/AT-5, `reschedule-audit.test.sql` (4), `atomicity.test.sql` (30) | **full** | Illegal kickoff moves; missing audit |
| REQ-20 | Register gates and assign to fixtures | §2.2 | `gate-ops.test.sql` (38), `gate-zone.test.sql` (12), `admin-gates.test.mjs` AG-1…9, `venues.test.sql` | **full** | Gate admits the wrong fixture / stand |
| REQ-21 | Validate a pass by scan or manual code | §2.2 | `scan.test.ts` (7 cases in default CI), `scan-concurrency.test.sql` (3), `gate-ops.test.sql`, `admin-gates.test.mjs` AG-3/AG-9 | **full** | Gate admits forged/duplicate/wrong-fixture pass |
| REQ-22 | Undo an accepted scan within 60 s | §2.2 | `scan.test.ts` case "valid → replay → duplicate → undo" (default CI), `gate-ops.test.sql` | **full** | Fan wrongly denied re-entry; operator cannot correct |
| REQ-23 | Gate works without connectivity (offline queue) | §2.2 | `offline-queue.test.ts` (8 — corruption/quarantine/clear, retry key, no double-admit) | **full** | Duplicate admissions after reconnect |
| REQ-24 | List, filter, refund and export orders | §2.2 | `refund-order.test.ts` (executed refund + audit + retry), `export.test.ts` (CSV/BOM/escaping), `atomicity.test.mjs` AT-2…4, `search.test.ts` | **full** | Wrong refund, no audit, PII export |
| REQ-25 | Publish and edit news and results | §2.2 | `news-admin.test.ts` (publish → edit → block fan write → unpublish → public read), `audit-coverage.test.mjs` | **full** | Unpublished/unaudited content |
| REQ-26 | Manage users and roles (built-in `admin` / `gatekeeper` pair) | §2.2 | `roles.test.ts` (9), `staff-roles.test.mjs` SR-1…12, `staff-roles.test.sql` (26), `identity.test.sql` (28), `rls-auth.test.sql` | **full** — custom roles are tracked separately as REQ-046 | Privilege escalation; stale claim |
| REQ-27 | Read club settings (lock window, reminders) | §2.2 | `settings.test.ts` (admin round-trip, fan write refused), `phase9.test.mjs` P9a-05/06, `audit-coverage.test.mjs` | **full** | Wrong lock window; unaudited setting change |
| REQ-28 | See revenue, passes sold and scan activity | §2.2 | `metrics-integration.test.ts` (live order/counters), `metrics.test.ts` (3), `scan-stats.test.mjs` ST-1…3 | **full** | Wrong revenue / scan counts |
| REQ-29 | See who changed what (audit trail) | §2.2 | `audit-coverage.test.mjs` AC-1…4, `atomicity.test.mjs`, `reschedule-audit.test.sql`, `rls.test.sql` | **full** | Unattributable privileged changes |
| REQ-046 | Custom per-club staff roles (define/edit/deactivate/assign) | §2.2 + REQ-046 | `rbac.test.sql` RBAC-1…6 (registry, capabilities, guards), `rbac-acceptance.test.mjs` RBAC-7/8 pending | **partial** — database registry and guards exist; Edge claim/UI and assignment flow remain | Clubs cannot model staff end to end |

## 3. Non-functional requirements

| NFR ID | Description (short) | Source | Tests | Coverage | Risk if untested |
|---|---|---|---|---|---|
| NFR-01 | RLS on every table | §3 | `rls.test.sql` (7), `rls-auth.test.sql` (5), `tenancy.test.sql` (24), `isolation.test.sql` (24), `staff-roles.test.sql` (26) | **full** | Cross-tenant / cross-user read |
| NFR-02 | Service-role key never reaches a client | §3 | `service-key.test.mjs` SK-1…4 (JWT scan of source + static chunks), `phase11.test.mjs` P11-21 | **full** | Full database takeover from a shipped key |
| NFR-03 | Stripe test mode only | §3 | `config.test.ts` (refuses non-`sk_test_`), `mvp-gate.test.mjs` MG-4, `platform-console.test.mjs` PC-8 | **full** | Real money charged in test |
| NFR-04 | QR payloads HMAC-signed, tamper-evident | §3 | `hmac.test.ts` (8), `scan.test.ts` tamper + void cases (default CI), `hygiene.test.mjs` HYG-2 | **full** | Forged pass |
| NFR-05 | Privileged mutations audited | §3 | `audit-coverage.test.mjs` AC-1…4, `atomicity.test.mjs`, `reschedule-audit.test.sql`, `observability.test.sql` | **full** | Untraceable admin action |
| NFR-06 | Deterministic CI gates every push | §3 | `ci.test.mjs` P11-13/RBAC-D7, `phase11.test.mjs` P11-04/21/22, `dep-drift.test.mjs` DD-1/2 | **full** | Broken code merges |
| NFR-07 | Strict TS, no `any` | §3 | `type-safety.test.mjs` TS-1…5, `schema-usage.test.mjs` SU-1…6 | **full** | Runtime type holes |
| NFR-08 | Offline entry verification | §3 | `pass-cache-test.ts`, `offline-pass.test.mjs` PASS-1…6 | **full** | Gate stops when the network does |
| NFR-09 | Multi-tenant isolation | §3 | `tenancy.test.sql`, `isolation.test.sql`, `uniques.test.sql` (13), `tenants.test.sql` (27) | **full** | Club A reads club B |
| NFR-10 | Per-club role definition | §3 | `rbac.test.sql` (capability catalogue, built-ins, cross-tenant), `staff-roles.test.sql`; Edge/UI pending | **partial** — the database contract is shipped; the assignment UI/claim is not | Same as REQ-046 |
| NFR-11 | Observability: logs, metrics, error tracking | §3 | `observability.test.mjs` OBS-1…7, `observability.test.ts` (7), `observability.test.sql` (9), `logging.test.mjs` | **full** | Blind to production failure |
| NFR-12 | Multi-language and multi-currency | §3 | `i18n.test.ts` (9), `i18n.test.mjs` I18N-1…8, `money.test.ts` (20), `orders.test.ts` (Thai receipt PDF), `display-config.test.mjs` DC-1…6 | **full** | Wrong currency/locale on money |
| NFR-13 | Seat availability p95 ≤ 300 ms, 3 s poll | §3 | `seat-latency.mjs` (p95 over 20 reads), `phaseb.test.mjs` PB1-1 (poll interval), `availability.test.mjs` | **full** | Slow map; stale availability |
| NFR-14 | 99.5 % monthly availability, 5xx alert | §3 | `availability.test.ts` (probe + SLO + burst page), `availability-probe.mjs`, `metrics.test.ts`, `observability` | **full** | Outage unnoticed; SLO unproven |
| NFR-15 | Accessibility: names, contrast, keyboard/SR seat grid | §3 | `seat-grid-test.tsx` (button names, selected/sold state), `theme.test.ts` THEME-1 (contrast), `phase11.test.mjs` P11-14/24, `admin-access.test.mjs` AA-3 | **full** | Unusable for assistive-tech fans |
| NFR-16 | Retention: 7 y / 3 y / 90 d / 30 d / erasure ≤30 d | §3 | `retention.test.sql` RET-1…14 (7y/3y/90d/cascade), `observability.test.mjs` OBS-7 (30d), `erasure.test.mjs` EC-1…6 | **full** | Compliance / data-hoarding breach |
| NFR-17 | RPO ≤24 h, RTO ≤4 h, quarterly restore drill | §3 | `restore-drill.sh` (dump → restore → counts → pgTAP), `run-pgtap.sh` | **full** | Unrecoverable data loss |

## 4. Scope constraints

| SC ID | Constraint | Honoured | Evidence | Coverage |
|---|---|---|---|---|
| SC-01 | Single club | lifted at `0045` | `tenancy.test.sql`, `isolation.test.sql` | n/a (superseded) |
| SC-02 | Stripe test mode | yes | `config.test.ts`, MG-4 | **full** |
| SC-03 | Grid seating, not 3D | yes | `venues.test.sql`, `venue-layout.test.sql` | **full** |
| SC-04 | No season tickets | yes | schema has single-match orders; no explicit test | **none** (low risk) |
| SC-05 | No loyalty tiers | yes | no code; no test | **none** (low risk) |
| SC-06 | Simulated QR, no turnstile hardware | yes | `scan.test.ts`, `scan-concurrency.test.sql` | **full** |
| SC-07 | Free-tier limits / concurrency | yes | `rate-limit.test.ts` (11th request 429), `hold-concurrency.test.sql`, `scan-concurrency.test.sql` | **full** |
| SC-08 | Offline limited to issued passes | yes | `offline-pass.test.mjs` PASS-1…6 | **full** |

---

## 5. Coverage decisions

Every row that is not `full` carries one of three decisions: **close** (add the
test), **accept** (keep the risk, with a reason, owner and review date) or
**reclassify** (the row is not a testable requirement). Acceptances are the only
deferrals; anything else must move to `full` before the next release.

| ID | Coverage | Decision | Action / rationale |
|---|---|---|---|
| REQ-046 | partial | close | Database registry/guards shipped; finish the Edge capability claim and the Roles/Users UI. |
| NFR-10 | partial | close | Same remaining work as REQ-046: Edge claim and console UI. |
| SC-01 | n/a | reclassify | Superseded by multi-tenancy at migration `0045`; the tenancy suites are the real guard. |
| SC-04 | none | reclassify | A scope exclusion: the absence of season-ticket code is the evidence; no behaviour to test. |
| SC-05 | none | reclassify | A scope exclusion: no loyalty code exists; no behaviour to test. |

## 6. Uncovered / high-risk requirements

These carry **partial** or **none** and are on the money, entry, identity or compliance path.

| Requirement | Coverage | Why it is P0/P1 |
|---|---|---|
| **REQ-046 / NFR-10** | none | Whole feature unbuilt; 8 acceptance IDs are `todo`. Documentation correctly says open, but there is zero executable proof. |

## 7. Partially covered requirements (summary)

All of: REQ-046, NFR-10.

The previously deceptive rows were **REQ-21/22/24**: the tests existed and were good, but skipped; they now run in the default pipeline through `scripts/run-integration.sh`.

## 8. Orphan tests (map to no requirement)

| Test file | What it protects | Why orphan |
|---|---|---|
| `brand-assets.test.mjs` (BRAND-1…5) | icon/splash assets | no REQ/NFR/SC ID |
| `status-tone.test.mjs` (ST-1…5) | UI tone vocabulary | presentation only |
| `hygiene.test.mjs` (HYG-1…8) | dead code / single-source rules | engineering hygiene |
| `docs.test.mjs` (DOC-1…13) | documentation drift | process, not product |
| `reqtrace.test.mjs` (RT-1…5) | this matrix stays true | meta, not behaviour |
| `file-coverage.test.mjs` (FI-1…7) | FILE-INDEX | process |
| `readme.test.mjs`, `lan.test.mjs` | setup docs | developer experience |
| `editor-extraction.test.mjs` (ED-1…4) | component extraction | refactor guard |
| `create-fixture-dialog.test.mjs` (CF-1…6) | create-dialog structure | architecture guard (loosely REQ-16) |
| `mobile-tests.test.mjs` (MT-1…5) | harness exists | meta-test |
| `mvp-gate.test.mjs` (MG-1…5) | launch script | launch tooling |
| `language.test.mjs` (LANG-1…3) | English-only copy | historical guard (loosely NFR-12) |
| `sweep-fixes.test.mjs` (SW-1…6) | dead code / injection | mixed; SW-6 loosely REQ-24 |
| `ci.test.mjs`, `dep-drift.test.mjs` | CI plumbing | loosely NFR-06 |
| `rbac-docs.test.mjs` (RBAC-D1…6) | REQ-046 documentation state | meta, not behaviour |

Orphans are not waste — they defend engineering standards — but they must not be counted as requirement coverage.

## 9. Minimum new tests to close the biggest gaps

Closed since the audit: executed checkout → webhook → ticket → receipt,
scan/undo, refunds, CSV export, service-key bundle scanning, the seat-grid
accessibility contract, profile/orders/news screens, push fan-out, the availability SLO/restore drill, retention windows, Thai receipt rendering, sign-up/sign-out, the seat-map latency budget and the offline retry key.
The remaining list is ranked by risk removed per test added.

1. **RBAC Edge + UI** — write the capability claim on assignment, add the Roles screen and dynamic Users dropdown, then make RBAC-7/8 pass. Closes REQ-046/NFR-10.

## 10. Top 10 risks

1. **Custom RBAC is database-only** (`REQ-046`, `NFR-10`): the role registry, capabilities and guards pass `rbac.test.sql`; the Edge claim and console UI are still pending.

Honourable mentions: **SC-04/SC-05** rely on absence rather than a guard; the platform-side free-tier caps in SC-07 are configuration, while the repository proves the concurrency and rate-limit guards.
