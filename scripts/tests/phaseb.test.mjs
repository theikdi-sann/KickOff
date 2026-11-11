// Phase B — PB-01: 3-second seat availability polling.
//
// Source-level contract tests (same pattern as phaseb0.test.mjs). Locks in:
//   1. a 3s React Query refetchInterval on the seat map and both of its
//      "reserved by you" overlays (a freed seat must not stay gold/locked),
//   2. state separation — server seats live in the query cache only, and the
//      local selection is never written by any fetch path,
//   3. silent background refresh — no hand-rolled intervals (React Query
//      cleans up on unmount) and no refetch-driven loading UI,
//   4. conflicts are flagged and block Continue, never silently deselected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('PB1-1 the seat map and its overlays poll every 3 seconds', () => {
  const source = read('apps/mobile/src/app/seats/[matchId].tsx');
  const seats = read('apps/mobile/src/lib/queries/seats.ts');
  const holds = read('apps/mobile/src/lib/queries/holds.ts');
  const orders = read('apps/mobile/src/lib/queries/orders.ts');

  assert.match(source, /POLL_INTERVAL_MS = 3000/, 'the poll cadence must be 3000ms');
  assert.match(
    source,
    /useSeatMap\(\s*zone\?\.id,\s*\{\s*refetchInterval: POLL_INTERVAL_MS\s*\}\)/,
    'the seat map query must poll',
  );
  assert.match(
    source,
    /useMyActiveHolds\(\s*\{\s*refetchInterval: POLL_INTERVAL_MS\s*\}\)/,
    'the own-holds overlay must poll (stale gold seats would stay locked)',
  );
  assert.match(
    source,
    /usePendingOrderSeats\(\s*matchId,\s*\{\s*refetchInterval: POLL_INTERVAL_MS\s*\}\)/,
    'the pending-order overlay must poll (a freed seat must not stay "Reserved by you")',
  );
  assert.match(seats, /refetchInterval/, 'useSeatMap must accept a refetchInterval option');
  assert.match(holds, /refetchInterval/, 'useMyActiveHolds must accept a refetchInterval option');
  assert.match(
    orders,
    /refetchInterval/,
    'usePendingOrderSeats must accept a refetchInterval option',
  );
});

test('PB1-2 polling never clears or overwrites the selection', () => {
  const source = read('apps/mobile/src/app/seats/[matchId].tsx');

  // State separation: server seats stay in React Query, selection is ids only.
  assert.doesNotMatch(
    source,
    /useState<SeatDto/,
    'server seat data must never be copied into component state',
  );
  assert.match(
    source,
    /selected\.includes\(seat\.id\)/,
    'selection must be cross-referenced against server data at render time',
  );
  // The only two places selection may be emptied: zone switch, Continue failure.
  const clears = source.match(/setSelected\(\[\]\)/g) ?? [];
  assert.equal(
    clears.length,
    2,
    'selection may only be cleared on zone switch and Continue failure — never by polling',
  );
});

test('PB1-3 polling is silent: React Query owns the interval, no refetch loading UI', () => {
  const source = read('apps/mobile/src/app/seats/[matchId].tsx');

  // React Query clears refetchInterval on unmount and pauses it when the app
  // is backgrounded — a hand-rolled interval would leak or run in the dark.
  assert.doesNotMatch(source, /setInterval/, 'no hand-rolled interval — use refetchInterval');
  assert.doesNotMatch(
    source,
    /isFetching|isRefetching/,
    'background refetches must not drive any loading UI',
  );
  assert.match(source, /matchQuery\.isLoading/, 'the initial skeleton must remain');
});

test('PB1-4 a selected seat taken by someone else is flagged, kept, and blocks Continue', () => {
  const source = read('apps/mobile/src/app/seats/[matchId].tsx');

  assert.match(source, /selectedConflictIds/, 'a conflict cross-reference must exist');
  assert.match(source, /seatConflict/, 'conflicted seats need a distinct visual flag');
  assert.match(
    source,
    /disabled=\{isTaken && !isSelected\}/,
    'a selected seat must stay tappable so it can be deselected',
  );
  assert.match(
    source,
    /no longer available/,
    'the conflict notice must explain what happened',
  );
  assert.match(
    source,
    /disabled=\{selected\.length === 0 \|\| selectedConflictIds\.length > 0\}/,
    'Continue must be blocked while a conflict exists',
  );
});
