// F-07 — atomicity contracts (source level; the behaviour itself is proven
// by `supabase/tests/atomicity.test.sql` against the local stack).
//
// Before this cycle the console wrote the fixture and *then* two audit rows
// from the browser, and `refund-order` refunded in Stripe and *then* made
// four separate database writes: any failure in between left a moved kickoff
// with no record, or a refunded Stripe payment on an order still marked
// `paid`.
//
//   AT-1  the reschedule RPC writes the audit row in the same transaction
//   AT-2  the refund state change is one database call, service-role only
//   AT-3  refund-order no longer performs the state changes step by step
//   AT-4  the Stripe refund is idempotent per order, so a retry cannot
//         refund twice after a partial failure
//   AT-5  the console reschedules through the RPC, never a bare update
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const MIGRATION = 'supabase/migrations/0038_atomic_reschedule_refund.sql';

test('AT-1 the reschedule RPC writes the audit row in the same transaction', () => {
  const sql = read(MIGRATION);

  assert.match(sql, /create or replace function public\.admin_update_match/);
  assert.match(sql, /security definer/, 'the RPC must run elevated to write both rows');
  assert.match(sql, /is_admin\(\)/, 'the RPC must be admin-gated');
  assert.match(
    sql,
    /A reschedule must carry a reason/,
    'a kickoff move without a reason must be refused by the database',
  );
  assert.match(
    sql,
    /insert into public\.audit_logs[\s\S]{0,200}?'reschedule'/,
    'the reschedule row must be written by the RPC, in the update transaction',
  );
  assert.doesNotMatch(sql, /create trigger/i, 'no DB trigger — rules stay in shared Zod (D-06)');
});

test('AT-2 the refund state change is one database call, service-role only', () => {
  const sql = read(MIGRATION);

  assert.match(sql, /create or replace function public\.mark_order_refunded/);
  assert.match(sql, /for update/, 'the order row must be locked against a concurrent refund');
  assert.match(
    sql,
    /insert into public\.audit_logs[\s\S]{0,200}?'order\.refund'/,
    'the refund audit row must be written by the same function',
  );
  assert.match(
    sql,
    /revoke execute on function public\.mark_order_refunded[\s\S]{0,120}?from public, anon, authenticated/,
    'no user session may call the refund state change directly',
  );
  assert.match(
    sql,
    /grant execute on function public\.mark_order_refunded[^\n]*to service_role/,
    'the Edge Functions service role is the only caller',
  );
});

test('AT-3 refund-order no longer performs the state changes step by step', () => {
  const fn = read('supabase/functions/refund-order/index.ts');

  assert.match(fn, /mark_order_refunded/, 'the function must call the atomic RPC');
  assert.doesNotMatch(
    fn,
    /\.update\(\{ status: "refunded" \}\)/,
    'the order status must not be updated directly',
  );
  assert.doesNotMatch(
    fn,
    /\.update\(\{ status: "void" \}\)/,
    'tickets must not be voided directly',
  );
  assert.doesNotMatch(fn, /writeAudit/, 'the audit row belongs to the RPC');
  assert.doesNotMatch(fn, /free_seats_for_order/, 'seat release belongs to the RPC');
});

test('AT-4 the Stripe refund is idempotent per order', () => {
  const fn = read('supabase/functions/refund-order/index.ts');
  const stripe = read('supabase/functions/_shared/stripe.ts');

  assert.match(
    fn,
    /idempotencyKey/,
    'a retry after a partial failure must not refund the same order twice',
  );
  assert.match(fn, /order\.id/, 'the idempotency key must be scoped to the order');
  assert.match(
    stripe,
    /idempotencyKey/,
    'createRefund must accept and forward the idempotency key',
  );
});

test('AT-5 the console reschedules through the RPC, never a bare update', () => {
  const matches = read('apps/admin/src/lib/queries/matches.ts');
  const audit = read('apps/admin/src/lib/audit.ts');

  assert.match(
    matches,
    /rpc\("admin_update_match"/,
    'the console must reschedule through the atomic RPC',
  );
  assert.doesNotMatch(
    matches,
    /recordReschedule/,
    'the browser must not write the reschedule row itself',
  );
  assert.doesNotMatch(
    audit,
    /recordReschedule/,
    'the superseded client-side writer must be deleted, not left to rot',
  );
});
