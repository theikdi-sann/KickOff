// Phase C3 — the supporter app must never fail silently.
//
// The flow audit found three silent failures in the supporter app:
//   F-01  the fixtures and news lists render their *empty* state when the
//         query fails, so a network error looks like "no upcoming fixtures",
//   F-02  the pass screen replaces the server error with a fixed "Tap to
//         reload your QR", so the real reason is never shown,
//   F-03  signing out from the profile screen swallows the failure, leaving
//         the supporter signed in with no message.
//
// A silent failure is worse than an error: the user acts on a wrong belief.
// These contracts make each of them fail the build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('MR-1 the fixtures list surfaces a failed query instead of an empty state', () => {
  const fixtures = read('apps/mobile/src/app/fixtures.tsx');

  assert.match(
    fixtures,
    /matchesQuery\.error/,
    'the fixtures list must branch on a failed query',
  );
  assert.doesNotMatch(
    fixtures,
    /matchesQuery\.isLoading\s*\?\s*[\s\S]{0,400}?:\s*\(\s*<>/,
    'the empty state must not be the only branch after loading — a failure must have its own',
  );
  assert.match(
    fixtures,
    /Could not load (the )?fixtures/i,
    'the fixtures list must tell the supporter what went wrong',
  );
});

test('MR-2 the news list surfaces a failed query instead of an empty state', () => {
  const news = read('apps/mobile/src/app/news.tsx');

  assert.match(news, /newsQuery\.error/, 'the news list must branch on a failed query');
  assert.match(
    news,
    /Could not load (the )?news/i,
    'the news list must tell the supporter what went wrong',
  );
});

test('MR-3 the pass screen shows the reason the QR could not be loaded', () => {
  const ticket = read('apps/mobile/src/app/ticket/[id].tsx');

  assert.match(
    ticket,
    /qrQuery\.error\.message/,
    'the pass screen must render the server message, not a fixed hint',
  );
  assert.doesNotMatch(
    ticket,
    /Tap to reload your QR/,
    'the fixed hint replaces the real reason — it must go',
  );
});

test('MR-4 signing out from the profile screen reports a failure', () => {
  const profile = read('apps/mobile/src/app/(tabs)/profile.tsx');

  assert.doesNotMatch(
    profile,
    /signOut\(\)\.catch\(\(\) => undefined\)/,
    'a failed sign-out must be reported, not swallowed',
  );
  assert.match(
    profile,
    /Sign out failed/i,
    'the profile screen must tell the supporter that the sign-out failed',
  );
});
