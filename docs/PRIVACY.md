# PRIVACY — the data inventory and the retention/erasure schedule

What personal data KickOff holds, where, for how long, and what a fan's
export and erasure cover. This document is the **schedule of record**: the
erasure code (GAP-09.3) implements the rules here, and the fan export
(GAP-09.2) covers exactly the tables listed here. A contract test keeps the
document registered; the erasure cycle keeps the code honest against it.

- **Owner:** engineering · **Status:** active · **Last verified:** 2026-11-17
- **Related:** [`SECURITY.md`](SECURITY.md) · [`RUNBOOK.md`](RUNBOOK.md) ·
  [`REQUIREMENTS.md`](REQUIREMENTS.md) (GAP-09) · ADR-001 (account model)

---

## Principles

1. **Collect the minimum.** A fan account is name, email and phone; a gate
   record is the scan outcome and who operated the scanner. Nothing else.
2. **Identity is global; records belong to clubs.** A fan is one `profiles`
   row across every club; their orders, tickets and scans live in each club's
   tenant. Export and erasure follow the data, not the deployment.
3. **Erasure scrubs the identity, not the ledger.** Financial and safety
   records are retained under a legal obligation (accounting law; stadium
   safety), with the personal identity removed. See the rules below.
4. **The server stays authoritative.** Nothing on a device is a copy of
   another person's data.

## The three rules

| Rule | Means | Applied to |
|---|---|---|
| **ERASE** | the row is deleted | `device_tokens`, `seat_holds` (active holds released) |
| **SCRUB** | the row stays, the personal values are replaced | `profiles` (email → `deleted+<id>@kickoff.invalid`, name → `Deleted account`, phone → null), `auth.users` (soft-deleted by the admin API) |
| **RETAIN** | the row stays as it is | financial and safety records (below) |

`RETAIN` is deliberate and is what makes the schedule honest: an order or a
scan event is a financial/safety record the club must be able to show. The
fan's identity inside those rows is an opaque `user_id`/`actor_id` that
points at a scrubbed profile — after SCRUB, the linkage is gone and the id is
a pseudonym no longer resolvable to a person.

## Data inventory

Personal data by table (the columns that name or reach a person):

| Table | Personal data | Rule | Notes |
|---|---|---|---|
| `profiles` | `email`, `full_name`, `phone` | **SCRUB** | the identity every other row points at; scrubbed in place, never deleted (rows reference it) |
| `auth.users` | email, metadata | **SCRUB** | soft-deleted via the admin API at account deletion |
| `fans` | — (a link to `profiles`) | **RETAIN** | carries no data of its own |
| `device_tokens` | Expo push token | **ERASE** | also swept after 90 days without use |
| `seat_holds` | `user_id` | **ERASE** | erased at deletion — no other row references a hold |
| `orders` | `user_id`; `stripe_session_id`/`payment_intent_id`/`payment_ref` | **RETAIN** | financial record; the buyer reference becomes a pseudonym once the profile is scrubbed |
| `order_seats` | — | **RETAIN** | financial record |
| `tickets` | `user_id` | **RETAIN** | the pass is the safety record at the gate; holder reference pseudonymous after SCRUB |
| `refunds` | ledger row | **RETAIN** | financial record |
| `scan_events` | `admin_id`, `operator_id`, `undone_by` (all ids, no names) | **RETAIN** | append-only gate log (stadium safety); person references pseudonymous after SCRUB |
| `audit_logs` | `actor_id`, `metadata` | **RETAIN** | the platform's own audit trail; metadata holds ids and reasons, never secrets |
| `stripe_events.payload` | the raw Stripe event — **may carry the payer's name/email** as Stripe recorded them | **RETAIN, bounded** | post-mortem only, never trusted as data; covered by the offboarding erase |
| `staff_members` / `staff_roles` | membership of a person | **ERASE** (per club at offboarding) | authority rows; erased with the tenant |
| `tenants` | club branding, Connect account id | **ERASE** (at offboarding) | the club's own row |
| `venues`, `matches`, `zones`, `seats`, `match_zone_prices`, `match_gates`, `gates`, `news_items`, `app_settings` | — | **ERASE** (at offboarding) | no personal data; erased as part of the tenant |
| `rate_limits`, `app_secrets` | operational only | **RETAIN** | no fan or club identity |

`order_receipt_view` and the CSV export are projections of `profiles` +
`orders`/`tickets` — they hold no data the inventory does not, and they
inherit SCRUB automatically.

## What a fan gets (GAP-09.2 — export)

A data subject's export covers, across **every** club their account touches:
their profile row, their orders with seat lines, their tickets, their active
holds and their device tokens. The export is one JSON document, delivered
signed-in, and recorded in `audit_logs`. It is generated from the tables
above — a table added to the inventory later must join the export, which the
export's contract test enforces.

## What a fan's erasure does (GAP-09.3)

Account deletion applies exactly the rules column above:
`device_tokens` and `seat_holds` **ERASE**; `profiles`/`auth.users` **SCRUB**;
everything else **RETAIN**, with its person references becoming pseudonymous
by pointing at the scrubbed profile. Unused passes are voided; a used pass's
gate record stays — that is the safety record. The in-app privacy notice
("deletion voids unused passes and removes personal details from active
records") describes exactly this schedule.

## What a club's exit does (GAP-09.4/09.5 — offboarding)

A club leaving the platform gets, in order:

1. **Export** — `export_tenant()` returns the club's full data archive
   (every tenant-scoped table above), keyed by table with row counts, and
   writes a `tenant.export` audit row.
2. **The money hand-back** — the final payout on the club's connected account
   is confirmed and the account is disconnected. **A human signs this off**
   by setting `tenants.offboarded_at` through `mark_tenant_offboarded()`;
   `erase_tenant()` refuses until that mark exists, which only the
   signed-off procedure sets.
3. **Erase** — `erase_tenant()` deletes every tenant-scoped row for the club
   (children first; `scan_events` through its maintenance-flag purge path),
   and the `tenants` row survives as the tombstone (`erased_at`, name and
   slug kept, branding and Connect account gone) — the erase happened, and
   that is provable without keeping the data.

Until a club is onboarded onto its own Stripe account (C9), the platform is
the merchant of record for its sales — which is why the exit procedure must
exist **before** the first onboarding (GAP-09 gates C8.2/C9).

## Verification

- `scripts/tests/edge-types.test.mjs` — the Edge clients cannot write a
  column the schema does not have (the GAP-09.0 guard).
- The erasure/export cycles (09.2/09.3) pin each table's treatment in their
  own tests, against this document.
- The offboarding cycles (09.4/09.5) prove zero rows remain per scoped table
  and that erase refuses an active tenant.
