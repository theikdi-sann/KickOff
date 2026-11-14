# ADR-002 — Multi-tenancy: `tenants`, `tenant_id`, composite foreign keys

- **Status:** accepted (design) · **Date:** 2026-11-14 · **Deciders:** engineering
- **Related:** [`ADR-001`](ADR-001-account-model.md) ·
  [`../SECURITY.md`](../SECURITY.md) · [`../ARCHITECTURE.md`](../ARCHITECTURE.md) ·
  [`../../PLAN.md`](../../PLAN.md) (C6/C7)

## Context

The product is sold per football club (tenant), but one deployment serves one
club today (`SC-01`). GAP-02 requires every club's data to be isolated. Two
shapes were possible: derive the tenant by joining through membership tables,
or store `tenant_id` on each row.

## Decision

1. **`tenants`** (a club) carries `slug` (white-label app binding), `currency`,
   `locale`, branding, `status` (`active | suspended`), `stripe_account_id`
   and `application_fee_bps`.
2. **`tenant_id NOT NULL` on every tenant-scoped table**, indexed leading, so
   every RLS predicate is one equality (`tenant_id = current_tenant()`), never
   a multi-table join.
3. **Composite foreign keys** `(child_id, tenant_id) → parent (id, tenant_id)`,
   with `UNIQUE (id, tenant_id)` on every parent. A cross-tenant reference
   (a match pointing at another club's venue) is then impossible at the
   database level, independent of RLS.
4. **Identity stays global** (ADR-001); authority (`staff_members`) is
   per tenant. `staff_roles` is per tenant.
5. **RLS helpers:** `current_tenant()` reads `app_metadata.tenant_id` and
   resolves only `status = 'active'` tenants; `is_admin()` /
   `is_gate_operator()` are tenant-scoped capability checks;
   `is_platform_admin()` gates the cross-tenant console.
6. **Public catalogue reads are open** (`USING (true)` on SELECT for venues,
   matches, zones, seats, prices and published news). Rationale: the data is
   public by nature, and JWT claims are per user, so a fan with accounts at
   two clubs must not see the wrong club's feed after a token refresh.
   Writes stay strictly tenant-scoped; commerce, identity and ops data are
   strictly tenant + user scoped.
7. **Tenant lifecycle:** `provision_tenant()` (idempotent) seeds roles and
   settings; suspension is enforced in `current_tenant()`; offboarding is an
   export + erase procedure (GAP-09).

## Consequences

- Every migration after `0042` must add `tenant_id` and the composite FK —
  the schema test suite (pgTAP T-01…T-24) enforces isolation per table.
- Global uniques become `(tenant_id, …)` (`venues.name`, `app_settings.key`,
  `gates.name`). `device_tokens.token` and Stripe ids stay globally unique.
- A hosted backfill on `scan_events` is the one lock-window risk (`0042`).
