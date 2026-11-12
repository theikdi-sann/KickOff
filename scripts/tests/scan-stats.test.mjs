// Phase C3 — the dashboard must not lie about its numbers, and must not load
// an unbounded history.
//
// F-13: the overview labelled all-time scan counts as "last 30 days", and
// `useScanStats()` loaded **every** `scan_events` row in the browser — a
// payload that grows with every scan the club ever runs. Worse, the numbers
// were computed twice: the `orders-aggregate` function already counts the
// scans of its window server-side.
//
// These contracts lock the single source in place:
//   ST-1  the console's scan statistics come from the aggregate endpoint —
//          there is no second, browser-side scan query,
//   ST-2  the aggregate's window is a named constant, not a typed number,
//   ST-3  the labels state the window the numbers cover.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const aggregateSource = read('supabase/functions/orders-aggregate/index.ts');
const scanQuerySource = read('apps/admin/src/lib/queries/scan.ts');
const overviewSource = read('apps/admin/src/app/dashboard/overview.tsx');

test('ST-1 the scan statistics have one source', () => {
  // No second implementation in the browser.
  assert.doesNotMatch(
    scanQuerySource,
    /useScanStats/,
    'the console must not query scan_events itself — the aggregate counts them',
  );
  assert.doesNotMatch(
    scanQuerySource,
    /useScanStats/,
    'the console must not query scan_events itself — the aggregate counts them',
  );
  // Any remaining browser-side scan query must be bounded — by a limit, or by
  // a narrow scope such as the orders of the current page.
  for (const match of scanQuerySource.matchAll(/from\(["']scan_events["']\)/g)) {
    const after = scanQuerySource.slice(match.index, match.index + 400);
    assert.match(
      after,
      /\.limit\(|\.in\(/,
      'every browser-side scan query must be bounded',
    );
  }

  // The aggregate counts the scans of its window, server-side.
  assert.match(
    aggregateSource,
    /from\(["']scan_events["']\)/,
    'the aggregate must count the scans of its window',
  );
  assert.match(
    aggregateSource,
    /scans:\s*\{/,
    'the aggregate must return the scan counts',
  );

  // The console reads them from the aggregate.
  assert.match(
    overviewSource,
    /aggregate\.data\?\.scans/,
    'the overview must use the aggregate scan counts',
  );
});

test('ST-2 the aggregate window is a named constant', () => {
  assert.match(
    aggregateSource,
    /const AGGREGATE_WINDOW_DAYS = \d+;/,
    'the window must be a named constant',
  );
  assert.doesNotMatch(
    aggregateSource,
    /30 \* 24 \* 60 \* 60 \* 1000/,
    'the window must not be a typed-out duration',
  );
});

test('ST-3 the labels state the window the numbers cover', () => {
  assert.match(
    overviewSource,
    /last 30 days/,
    'the overview states the window it reports on',
  );
  assert.match(
    overviewSource,
    /scans\?\.(truncated|total)/,
    'the overview must show the scan counts it received',
  );
});
