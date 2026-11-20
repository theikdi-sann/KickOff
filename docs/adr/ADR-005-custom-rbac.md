# ADR-005 — Per-club custom staff roles (proposed)

- **Status:** proposed · **Date:** 2026-11-20 · **Deciders:** product + engineering
- **Related:** [`../REQUIREMENTS.md`](../REQUIREMENTS.md) (REQ-046, NFR-10) ·
  [`../SECURITY.md`](../SECURITY.md) · [`../SRS.md`](../SRS.md) ·
  [`ADR-001`](ADR-001-account-model.md)

## Context

`0041` made `staff_roles` a per-club table with capability flags, but the
product still ships exactly two seeded roles and several paths test the role
name. A club that needs a box-office lead, a matchday manager or a read-only
auditor must choose between `admin` (too broad) and `gatekeeper` (too narrow).
`REQ-046` / `GAP-11` track this gap; `NFR-10` is **open**.

## Decision

1. **Roles are club-scoped data.** `staff_roles(tenant_id, code, display_name,
   is_system, sort_order)` with a unique `(tenant_id, code)`. A club may add
   roles without a migration.
2. **Capabilities are a closed catalogue**, stored per role in
   `staff_role_capabilities`: `manage_staff`, `operate_gate`, `manage_matches`,
   `manage_venues`, `publish_news`, `refund_orders`, `read_audit`,
   `manage_settings`, `export_data`, `view_reports`.
3. **Built-ins are immutable.** `admin` holds all ten; `gatekeeper` holds
   `operate_gate`; neither can be renamed, deleted or reduced.
4. **`customer` is not a row in `staff_roles`.** It remains the absence of a
   `staff_members` row, so "assign customer" deletes the membership.
5. **Authorization is capability-based.** RLS predicates and Edge guards check
   capabilities. No policy or guard may branch on the literal `admin` or
   `gatekeeper`.
6. **Two projections move together.** Assignment writes the membership and the
   claim (`app_metadata.role`, `app_metadata.capabilities`), membership first,
   with compensation on failure. The change applies at the next token refresh.
7. **Guards:** `manage_staff` is required to write roles; an actor cannot grant
   a capability it lacks; the last `manage_staff` holder cannot be removed;
   self-demotion is refused.
8. **Scope:** roles are per club. Venue-scoped roles, per-user overrides and
   role inheritance are explicitly out of scope.

## Consequences

- A club can model its own staff structure without a deployment.
- The capability catalogue and the role contract become versioned contracts:
  adding a capability is a migration + docs + test change.
- The Edge claim grows a `capabilities` array; every guard must move from role
  names to capabilities in the same release.
- `REQ-046` remains `open` until `RBAC-1…RBAC-8` pass; until then the console
  keeps the two built-in roles.

## Verification (planned)

`RBAC-1…RBAC-8` in [`../TESTING.md`](../TESTING.md) §10. The pending tests are
registered as `test.todo` so the build stays green without implying coverage.
