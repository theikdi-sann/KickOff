// Phase B — punch list #4: "See all" must reach full list screens.
//
// The home feed teases truncated content: fixtures ride a horizontal
// carousel whose "See all" wrongly opened the tickets tab, and news shows
// featured + slice(1, 4) with no action at all. Neither feed had a full
// list screen behind it. Locks in:
//   1. the fixtures heading's See all opens the fixtures list,
//   2. the news heading gains a See all opening the news list,
//   3. the fixtures list renders every fixture uncut,
//   4. the news list renders every article uncut (and README documents
//      both new routes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('SA-1 the fixtures See all opens the fixtures list', () => {
  const source = read('apps/mobile/src/app/(tabs)/index.tsx');

  assert.match(
    source,
    /title="Upcoming fixtures"[\s\S]{0,240}?router\.push\('\/fixtures'\)/,
    'the Upcoming fixtures See all must navigate to the fixtures list screen',
  );
  assert.doesNotMatch(
    source,
    /push\('\/\(tabs\)\/tickets'\)/,
    'the fixtures See all must not open the tickets tab (passes, not fixtures)',
  );
});

test('SA-2 the news heading gains a See all that opens the news list', () => {
  const source = read('apps/mobile/src/app/(tabs)/index.tsx');

  assert.match(
    source,
    /title="Latest news"[\s\S]{0,240}?action=\{[\s\S]{0,120}?router\.push\('\/news'\)/,
    'the Latest news heading must offer See all navigating to the news list',
  );
});

test('SA-3 the fixtures list screen renders every fixture uncut', () => {
  const source = read('apps/mobile/src/app/fixtures.tsx');

  assert.doesNotMatch(source, /\.slice\(/, 'a full list must never truncate its fixtures');
  assert.match(source, /upcoming\.map/, 'every upcoming fixture must be rendered');
  assert.match(source, /ResultRow/, 'recent results must be listed too');
  assert.match(
    source,
    /\/match\/\[id\]/,
    'each fixture must open its match detail screen',
  );
  assert.match(source, /router\.back\(\)/, 'the screen needs a back affordance');
});

test('SA-4 the news list screen renders every article uncut', () => {
  const source = read('apps/mobile/src/app/news.tsx');
  const readme = read('README.md');

  assert.doesNotMatch(source, /\.slice\(/, 'a full list must never truncate the feed');
  assert.match(source, /news\.map|\.map\(/, 'every published article must be rendered');
  assert.match(
    source,
    /\/news\/\[id\]/,
    'each row must open its article screen',
  );
  assert.match(source, /router\.back\(\)/, 'the screen needs a back affordance');
  assert.match(readme, /`\/fixtures`/, 'README must document the fixtures list route');
  assert.match(readme, /`\/news`/, 'README must document the news list route');
});
