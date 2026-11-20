# GLOSSARY — KickOff

One term, one meaning. When a document uses a word below, it means this.

## Matchday

| Term | Meaning |
|---|---|
| **Club / tenant** | A football club on the platform. `tenants` is the row; `tenant_id` is the isolation boundary. |
| **Venue / ground** | The physical place a fixture is played, with its stands and gates. `venues` holds it; a club can have several. |
| **Stand / venue zone** | A physical seating block inside a venue (`venue_zones`). A gate may serve one stand or the whole ground. |
| **Zone** | The sellable seating area of one fixture (`zones`), cloned from a stand. **Zone** is the pricing/availability unit; **stand** is the physical unit. |
| **Fixture / match** | One scheduled game (`matches`). The two words are interchangeable; `fixture` is preferred in product copy, `match` in code. |
| **Gate / turnstile** | A physical entry point at a venue (`gates`). A turnstile is the hardware; the product does not integrate one — scanning is simulated (`SC-06`). |
| **`match_gates`** | The per-fixture assignment of a gate. A gate with no assignment does not admit anyone. |
| **Pass / ticket** | The digital entry credential (`tickets`). **Pass** is the user-facing word; **ticket** is the table and the domain word. |

## Commerce

| Term | Meaning |
|---|---|
| **Hold** | A 10-minute reservation of specific seats (`seat_holds`) while checkout runs. |
| **Order** | The purchase header (`orders`); owns seat lines and, once paid, tickets. |
| **Minor units** | Integer money (satang, cents, yen). Never a float; scale comes from `minor_units()`. |
| **Refund ledger** | `refunds` — refunds are rows, not a status on the order. |
| **Connected account** | The club's Stripe account; charges run on it directly (ADR-003). |

## Identity and authority

| Term | Meaning |
|---|---|
| **Profile** | The global person row (`profiles`), 1—1 with `auth.users`. No tenant, no role. |
| **Fan** | A person who buys tickets (`fans`). A fan at one club may be staff at another. |
| **Membership** | A `staff_members` row `(id, tenant_id, staff_role)`; the database's authority at that club. |
| **Role** | A named set of capabilities (`staff_roles`). Built-ins are `admin` and `gatekeeper`. |
| **Built-in role** | `admin` (all capabilities) or `gatekeeper` (`operate_gate`); seeded per club and immutable. |
| **Custom role** | A club-defined role with a subset of the capability catalogue. **Not implemented** (`REQ-046`, `GAP-11`). |
| **Customer** | **Not a staff role.** The absence of a `staff_members` row at the club. Selecting it in the console removes staff authority. |
| **Capability** | One permission key from the closed catalogue (`manage_staff`, `operate_gate`, …). Authorization derives from capabilities, not role names. |
| **Claim** | `auth.users.app_metadata` values copied into the access token (`role`, `tenant_id`, and later `capabilities`). |
| **Platform operator** | Cross-tenant staff (`platform_admins`, `is_platform_admin()`), not a club role. |

## Documentation and tests

| Term | Meaning |
|---|---|
| **Requirement state** | `shipped`, `partial`, or `open`. An `open` requirement is testable but not built. |
| **Acceptance ID** | A stable test ID (`RBAC-1`, `DOC-12`, `T-01`) that names one pass/fail behaviour. |
| **Pending test** | An acceptance test registered as `test.todo`; it proves nothing until the feature lands. |
| **Contract test** | A source-level test in `scripts/tests/` that fails when two parts of the repo drift apart. |
