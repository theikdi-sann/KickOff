// C8.1 / 0049 — Stripe Connect.
//
// ADR-003 puts every club on its own connected account: the club is the
// merchant of record, the platform takes its fee from the same charge, and
// the webhook resolves the club from the Connect account the event carries.
//
// The pgTAP suite pins the database rules (the fee, the account resolver, the
// event ledger). These contracts pin the wiring the suite cannot see — the
// Stripe calls themselves, which only run against a live account:
//
//   CN-1  the checkout runs on the club's connected account and carries the fee
//   CN-2  the fee comes from the database and is snapshotted onto the order
//   CN-3  the webhook resolves the club from the event's account
//   CN-4  a suspended club's events are acknowledged and ignored
//   CN-5  the refund runs against the club's account
//   CN-6  the shared Stripe helper can act on a connected account
//   CN-7  the migration carries the schema the wiring needs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const checkout = read('supabase/functions/stripe-checkout/index.ts');
const webhook = read('supabase/functions/stripe-webhook/index.ts');
const refund = read('supabase/functions/refund-order/index.ts');
const stripe = read('supabase/functions/_shared/stripe.ts');

test("CN-1 the checkout runs on the club's connected account", () => {
  assert.match(
    checkout,
    /stripe_account_id/,
    "the checkout must read the club's connected account",
  );
  assert.match(
    checkout,
    /stripeAccount/,
    'the session must be created on that account — the club is the merchant of record',
  );
  assert.match(
    checkout,
    /application_fee_amount/,
    'the charge must carry the platform fee (a direct charge pays it to the platform)',
  );
  assert.match(
    checkout,
    /payment_intent_data/,
    'the fee belongs to the payment intent the session creates',
  );
});

test('CN-2 the fee comes from the database and is snapped to the order', () => {
  assert.match(
    checkout,
    /application_fee_minor_units/,
    "the fee is the database's rule — the function must not re-implement it",
  );
  assert.match(
    checkout,
    /application_fee_amount/,
    'the fee must be snapshotted onto the order, not read from the club at refund time',
  );
});

test("CN-3 the webhook resolves the club from the event's account", () => {
  assert.match(
    webhook,
    /tenant_for_stripe_account/,
    'the tenant must come from the database rule',
  );
  assert.match(webhook, /event\.account/, 'the Connect account on the event names the club');
  assert.match(webhook, /account_id/, 'the ledger records the account the event came from');
  assert.match(webhook, /payload/, 'the ledger keeps the payload for post-mortems');
});

test("CN-4 a suspended club's events are acknowledged and ignored", () => {
  assert.match(webhook, /status/, "the club's status must be read");
  assert.match(
    webhook,
    /suspended/,
    "a suspended club's events must be ignored — acknowledged, not processed",
  );
});

test("CN-5 the refund runs against the club's account", () => {
  assert.match(
    refund,
    /stripeAccount/,
    'a refund must debit the account the charge lives on, or the club pays for it',
  );
});

test('CN-6 the shared Stripe helper can act on a connected account', () => {
  assert.match(
    stripe,
    /stripeAccount/,
    'the helper must pass the connected account through to the Stripe SDK',
  );
});

test('CN-7 the migration carries the schema the wiring needs', () => {
  const migration = read('supabase/migrations/0049_stripe_connect.sql');

  assert.match(
    migration,
    /stripe_events[\s\S]{0,120}?add column if not exists tenant_id/,
    'the event ledger must learn its club',
  );
  assert.match(
    migration,
    /stripe_events[\s\S]{0,200}?add column if not exists account_id/,
    'the event ledger must record the Connect account',
  );
  assert.match(
    migration,
    /stripe_events[\s\S]{0,240}?add column if not exists payload/,
    'the event ledger must keep the payload for post-mortems',
  );
  assert.match(
    migration,
    /unique[\s\S]{0,120}?stripe_account_id/,
    'one connected account belongs to one club',
  );
  assert.match(migration, /application_fee_minor_units/, 'the fee rule must live in the database');
  assert.match(migration, /tenant_for_stripe_account/, 'the account resolver must live in the database');
});
