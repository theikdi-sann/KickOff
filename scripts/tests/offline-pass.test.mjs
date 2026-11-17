// C10.3 — the offline pass (GAP-01).
//
// A venue with poor signal is the deferral GAP-01 records: the fan's pass
// must still render at the gate, while the *scan* stays server-authoritative
// (the gate refuses a used or void pass no matter what the screen shows).
// So the screen caches what it already received — the signed payload
// verbatim, and the ticket row beside it — and says so when it serves them.
//
//   PASS-1  the pass cache exists and its tests cover read/write/clear
//   PASS-2  the signed payload is cached on success and served from the
//           cache when the network fails, flagged `fromCache`
//   PASS-3  the ticket row falls back the same way — otherwise offline is
//           a "Pass not found" screen, not a pass
//   PASS-4  a cached payload is the verbatim signed bytes: the QR contract
//           has exactly one implementation and it is not in the app
//   PASS-5  sign-out clears the cache — a shared device keeps no passes
//   PASS-6  the screen admits when it is showing a saved pass
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const CACHE = 'apps/mobile/src/lib/pass-cache.ts';
const CACHE_TESTS = 'apps/mobile/src/lib/__tests__/pass-cache-test.ts';
const QUERIES = 'apps/mobile/src/lib/queries/tickets.ts';
const TICKETS_QUERY = 'apps/mobile/src/lib/queries/tickets.ts';
const SCREEN = 'apps/mobile/src/app/ticket/[id].tsx';
const AUTH = 'apps/mobile/src/lib/auth.ts';

test('PASS-1 the pass cache exists and its tests cover read/write/clear', () => {
  assert.ok(existsSync(resolve(root, CACHE)), `${CACHE} must exist`);
  const source = read(CACHE);
  assert.match(source, /export async function cachePass\(/, 'writing a pass');
  assert.match(source, /export async function readPass\(/, 'reading a pass');
  assert.match(source, /export async function clearPasses\(/, 'clearing them all');

  const tests = read(CACHE_TESTS);
  assert.match(tests, /round-?trip|writes and reads/i, 'the round trip is tested');
  assert.match(tests, /clear/i, 'clearing is tested');
  assert.match(tests, /null/, 'a miss reads as null, not a crash');
});

test('PASS-2 the signed payload is cached and served back when offline', () => {
  const source = read(QUERIES);
  assert.match(source, /cachePass\(/, 'a fetched payload is written to the cache');
  assert.match(source, /readPass\(/, 'the failure path reads the cache back');
  assert.match(
    source,
    /fromCache:\s*true/,
    'a cached payload says it is cached — the UI must be able to admit it',
  );
});

test('PASS-3 the ticket row falls back the same way', () => {
  const source = read(TICKETS_QUERY);
  // Both queries live in one module: the screen needs the row (holder,
  // venue, status) as much as it needs the payload.
  assert.match(source, /cacheTicket\(/, 'the fetched row is written to the cache');
  assert.match(source, /readTicket(<[^>]*>)?\(/, 'the failure path reads the row back');
});

test('PASS-4 a cached payload is the verbatim signed bytes', () => {
  const source = read(CACHE);
  assert.doesNotMatch(
    source,
    /from ['"].*(qr|hmac)['"]/i,
    'the cache never re-encodes or re-signs: the QR contract has one implementation, and it lives in the Edge tier',
  );
});

test('PASS-5 sign-out clears the cache', () => {
  const source = read(AUTH);
  assert.match(
    source,
    /clearPasses\(/,
    'a shared device must not keep passes after the account leaves',
  );
});

test('PASS-6 the screen admits when it is showing a saved pass', () => {
  const source = read(SCREEN);
  assert.match(
    source,
    /fromCache/,
    'the pass screen renders the offline hint instead of pretending it is live',
  );
});
