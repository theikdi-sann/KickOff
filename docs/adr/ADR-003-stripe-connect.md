# ADR-003 — Payments on Stripe Connect

- **Status:** accepted — implemented in C8.1 (`0049`) · **Date:** 2026-11-14
  (amended 2026-11-17) · **Deciders:** engineering
- **Related:** [`ADR-002`](ADR-002-multi-tenancy.md) ·
  [`../SECURITY.md`](../SECURITY.md) §4 · [`../../PLAN.md`](../../PLAN.md) (C8)

## Context

The platform sells to many clubs. Money must reach the club that sold the
ticket, with the platform's fee taken at the same time. A single platform
Stripe account would make the platform the merchant of record for every club
and force manual payouts and reconciliation.

## Decision

1. **Stripe Connect, one connected account per tenant**
   (`tenants.stripe_account_id`). The club is the merchant of record.
2. **Checkout runs on the connected account** with
   `application_fee_amount` computed from `tenants.application_fee_bps` and
   snapshotted to `orders.application_fee_amount` at session creation. The
   charge type is a **direct charge**: the session is created on the club's
   account, so the club is the merchant of record and the platform's fee
   travels with the charge (`payment_intent_data.application_fee_amount`).
   The fee is the database's rule (`application_fee_minor_units()`), rounded
   to the nearest minor unit.
3. **Webhooks** verify the signature on the platform endpoint and resolve the
   tenant from the Connect event's `account` (`stripe_events.tenant_id` /
   `account_id`). Events for suspended tenants are acknowledged and ignored.
   The event ledger stays idempotent by event id; `payload` is stored for
   post-mortems only and is never re-trusted.
4. **Refunds** run against the connected account, are recorded in the
   `refunds` ledger (amount, reason, `refunded_by`, order-scoped idempotency
   key), and keep the existing atomic database half
   (`mark_order_refunded()`).
5. **Money is integer minor units** plus a `currency` snapshot on the order
   (`minor_units(currency)` decides the scale; THB = 2, JPY = 0).
6. **The bridge.** A club without a connected account is not onboarded yet: it
   keeps selling on the platform account with no platform fee, exactly as it
   did before Connect — the platform is the merchant of record for it. The
   onboarding in C9 gives it an account. The event ledger resolves a club
   from the account when there is one, and the order carries the club when
   there is not.

## Consequences

- Onboarding a club now includes Connect account creation and verification;
  the platform console owns the fee rate.
- A suspended club's events are acknowledged and ignored. The reconciliation
  sweep (GAP-04) is what catches a payment that arrived after the
  suspension — the order stays unpaid until then.
- Stripe test mode stays enforced (`getEnv()` rejects non-`sk_test_` keys)
  until going live is a deliberate key rotation.
- Reconciliation and payout reporting belong with GAP-04 observability.
