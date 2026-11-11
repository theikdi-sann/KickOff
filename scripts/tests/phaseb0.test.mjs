// Phase B0 — checkout & seat-state hardening.
//
// Source-level contract tests (same pattern as phase11.test.mjs): the mobile
// app has no component runner, so each behaviour is asserted at the source
// level first. These lock in the walkthrough fixes:
//   1. every checkout exit gesture behaves like the X button (one handler),
//   2. no blind 90s "verifying" spinner — a pending-order panel instead,
//   3. cancel failures are visible and retryable (no silent catches),
//   4. the seat map tells the truth: "Reserved by you" + fresh data + copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('PB0-1 checkout routes every exit (X, back, swipe-down, Android back) through one handler', () => {
  const source = read('apps/mobile/src/app/checkout.tsx');

  // All removal gestures are intercepted by the navigator and funnelled into
  // a single handler; the X button just dispatches a plain back.
  assert.match(source, /usePreventRemove\(/, 'exits must be intercepted with usePreventRemove');
  assert.match(source, /const runExit = async/, 'there must be exactly one exit handler');
  assert.match(source, /onPress=\{\(\) => router\.back\(\)\}/, 'the X button dispatches back');
  assert.match(
    source,
    /releaseHold\.mutateAsync\(holdIdRef\.current\)/,
    'a pre-payment exit must release the hold so the seat is free again',
  );
  // The exit must keep a pending order's seats (auto-freed at expiry) instead
  // of releasing anything — guarded by the order id.
  assert.match(
    source,
    /if \(orderIdRef\.current \|\| !holdIdRef\.current\) return;/,
    'an exit with a pending order must keep the reservation',
  );
  // An unmount safety net retries the release if the intercepted path never ran.
  assert.match(source, /release_hold/, 'the unmount safety net must release a stray hold');
});

test('PB0-2 checkout replaces the 90s blind spinner with a pending-order panel', () => {
  const source = read('apps/mobile/src/app/checkout.tsx');

  assert.doesNotMatch(source, /VERIFY_TIMEOUT_MS/, 'the 90s verify timeout is gone');
  assert.doesNotMatch(source, /\bverifying\b/, 'no blind verifying state may remain');
  assert.match(source, /orderPending/, 'a pending order must have its own state');
  assert.match(source, /Reserved until \{/, 'the panel must show the reservation deadline');
  assert.match(source, /Resume payment/, 'the panel must offer resume');
  assert.match(source, /Cancel order/, 'the panel must offer cancel');
  assert.match(
    source,
    /setPanelError\(errorMessage\(error\)\)/,
    'cancel failures must be surfaced in the panel, not swallowed',
  );
});

test('PB0-3 orders screen surfaces auto-cancel failures with a retry', () => {
  const source = read('apps/mobile/src/app/orders.tsx');

  assert.doesNotMatch(
    source,
    /\.catch\(\(\) => undefined\)/,
    'the Stripe-cancel auto-cancel must never fail silently',
  );
  assert.match(
    source,
    /setAutoCancelError\(errorMessage\(error\)\)/,
    'an auto-cancel failure must be stored for display',
  );
  assert.match(source, /Retry/, 'the failure banner must offer a retry');
  assert.match(
    source,
    /Reserved until \{/,
    'pending orders must show their reservation deadline',
  );
});

test('PB0-4 seat map tells the truth about reserved seats', () => {
  const source = read('apps/mobile/src/app/seats/[matchId].tsx');

  assert.match(
    source,
    /useMyActiveHolds\((\s*\{\s*refetchInterval: POLL_INTERVAL_MS\s*\})?\)/,
    'own raw holds must be visible to their owner',
  );
  assert.match(
    source,
    /usePendingOrderSeats\(matchId,(\s*\{\s*refetchInterval: POLL_INTERVAL_MS\s*\})?\)/,
    'own pending-order seats must be known to the seat map',
  );
  assert.match(source, /Reserved by you/, 'own reserved seats need a distinct state');
  assert.match(source, /seatMine/, 'the reserved-by-you seat style must exist');
  assert.match(
    source,
    /just taken by someone else/,
    'the hold-conflict error must explain what happened',
  );
  assert.match(source, /useReleaseHold\(\)/, 'the seat map must be able to release own holds');
});

test('PB0-5 queries keep seat state fresh across order lifecycle events', () => {
  const orders = read('apps/mobile/src/lib/queries/orders.ts');

  const createBlock = orders.slice(orders.indexOf('useCreateOrder'), orders.indexOf('useCancelOrder'));
  assert.match(
    createBlock,
    /queryKey: \['seats'\]/,
    'creating an order must invalidate the seat map (staleTime is 60s)',
  );
  assert.match(orders, /usePendingOrderSeats/, 'the pending-order seat query must exist');

  const holds = read('apps/mobile/src/lib/queries/holds.ts');
  assert.match(holds, /useMyActiveHolds/, 'the own-active-holds query must exist');
  const releaseBlock = holds.slice(holds.indexOf('useReleaseHold'));
  assert.match(
    releaseBlock,
    /queryKey: \['my-holds'\]/,
    'releasing a hold must invalidate the own-holds query',
  );
});
