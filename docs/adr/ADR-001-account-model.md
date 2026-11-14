# ADR-001 — Account model: profiles, fans, staff_members, staff_roles

- **Status:** accepted (design) · **Date:** 2026-11-14 · **Deciders:** engineering
- **Related:** [`../REQUIREMENTS.md`](../REQUIREMENTS.md) (NFR-09, NFR-10) ·
  [`../SECURITY.md`](../SECURITY.md) · [`../../PLAN.md`](../../PLAN.md) (C6)

## Context

`profiles.role` is a single text column constrained to
`customer | admin | gatekeeper` (migrations `0002`, `0039`). It cannot express
"a person is staff at one club and a supporter at another", it cannot grow a
new role without a migration, and the vocabulary is duplicated between the
column check, `is_admin()`/`is_staff()` and the shared `roles.ts`.

## Decision

1. **Identity is global.** `auth.users` 1—1 `profiles` (no tenant column).
   One login works at every club; the account is the person.
2. **`fans(id → profiles.id)`** marks "this person buys tickets". Global by
   design; the per-club relationship lives in orders/holds.
3. **`staff_members(id → profiles.id, tenant_id)`** — authority is per tenant.
   A person can be staff at one club and a fan at another.
4. **`staff_roles(tenant_id, code)`** is a lookup with capability flags
   (`can_manage_staff`, `can_operate_gate`, `sort_order`). Roles are data, not
   an enum: adding a role or changing its powers is a row change, not a
   migration. `provision_tenant()` seeds `admin` (both flags) and `gatekeeper`
   (gate only).
5. **Predicates derive from capabilities**, not role names:
   `is_admin()` = `can_manage_staff`, `is_gate_operator()` = `can_operate_gate`.
   Both stay `security definer`, schema-pinned and revoked from `public`.
6. **JWT projection:** `app_metadata.tenant_id` + `app_metadata.staff_role`
   (absent for pure fans). The legacy `app_metadata.role` is dual-written for
   one release (`0041`), then dropped (`0048`).
7. **Invariants:** `staff_members.staff_role` is effectively immutable (one
   write path), and a last-admin guard counts rows whose role has
   `can_manage_staff`.

## Consequences

- `profiles.role` and the `profiles_role_check` constraint disappear after the
  dual-write window; every consumer reads `staff_members`/`roles.ts`.
- RLS and Edge guards stop enumerating role names — a new role works
  everywhere without touching a predicate.
- The account split lands in migration series `0040`–`0048`
  (see [`../../PLAN.md`](../../PLAN.md) C6/C7), not as a standalone refactor.
- Ticket transfer/claim (a fan holding another fan's pass) is explicitly out
  of scope; tracked as `GAP-08`.
