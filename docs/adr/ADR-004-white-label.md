# ADR-004 — White-label delivery and the platform console

- **Status:** accepted — implemented in C9 (`0054`, `bootstrap`, `stripe-onboard`, the platform console) · **Date:** 2026-11-14 · **Deciders:** engineering
- **Related:** [`ADR-002`](ADR-002-multi-tenancy.md) ·
  [`ADR-003`](ADR-003-stripe-connect.md) · [`../RUNBOOK.md`](../RUNBOOK.md) ·
  [`../../PLAN.md`](../../PLAN.md) (C9)

## Context

Clubs buy a branded product. The supporter app and the staff console must
carry each club's identity, and the operator (KickOff) needs a cross-tenant
console to provision clubs, set fee rates and suspend a tenant.

## Decision

1. **One mobile app and one admin console per club** (white-label), built from
   this monorepo with per-tenant configuration (`tenants.slug`, branding,
   `currency`, `locale`). `bootstrap` (an Edge Function) validates the app's
   slug at sign-in and writes `app_metadata.tenant_id` for the session.
2. **Global identity, per-tenant authority** (ADR-001): a fan signs in once
   and uses any club's app; staff authority remains scoped by
   `staff_members(id, tenant_id)`.
3. **Platform console** for KickOff staff, gated by `is_platform_admin()`:
   provision tenants (`provision_tenant()`), edit `application_fee_bps`,
   suspend/restore (`tenants.status`), and read the tenant **registry** —
   the control columns of `tenants`, suspended clubs included (restoring one
   is the console's job). Cross-tenant *aggregates* stay with the ops
   checklist (`GAP-10`). It never bypasses tenant RLS for row-level club
   data.
4. **Delivery is ops, not schema:** per-club EAS project/bundle id, Expo push
   credentials, store listings and release cadence. Tracked as `GAP-10` with
   an onboarding checklist (provision → venue/zones/seats → staff invites →
   Connect onboarding → app build).

## Consequences

- Public catalogue reads stay open (ADR-002 §6) because the claim is per
  user; commerce and ops data stay strictly scoped.
- The platform console is a new surface with its own threat model: it must
  never expose another club's row-level data, only aggregates and control
  operations.
- White-label multiplies release overhead; the checklist is the control.
