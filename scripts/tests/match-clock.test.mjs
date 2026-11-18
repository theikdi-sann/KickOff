// The match clock — status is intent, kickoff is truth.
//
// F-24: a fixture that kicked off three days ago still said `upcoming`, and the
// home screen picked `upcoming[0]` from an ascending list, so a finished match
// was advertised as the next one. These contracts keep the read side on the
// shared classifier and keep sales closed once the whistle has gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const homeSource = read('apps/mobile/src/app/(tabs)/index.tsx');
const fixturesSource = read('apps/mobile/src/app/fixtures.tsx');
const matchesQuerySource = read('apps/mobile/src/lib/queries/matches.ts');

test('MC-3 the match clock runs every minute and owns live/completed', () => {
  const clock = read('supabase/migrations/0058_match_clock.sql');

  assert.match(
    clock,
    /cron\.schedule\(\s*'xclub-match-clock',\s*'\* \* \* \* \*'/,
    'the clock must run every minute',
  );
  assert.match(clock, /set status = 'live'/, 'kickoff opens the match');
  assert.match(clock, /set status = 'completed'/, 'kickoff + 2h closes the match');
  assert.match(
    clock,
    /status in \('upcoming', 'live'\)/,
    'only a fixture the clock owns may be closed',
  );
  assert.match(
    clock,
    /'postponed', 'cancelled'|status in \('upcoming', 'live', 'completed'\)/,
    'postponed and cancelled matches are outside the clock',
  );
  assert.match(
    clock,
    /unique \(match_id, kind\)/,
    'a moment is recorded once per match',
  );
  assert.doesNotMatch(
    clock,
    /set\s+[^;]*home_score\s*=/i,
    'scores are entered by an admin, never by the clock',
  );
});

test('MC-4 the console bell is real and a closed match asks for its result', () => {
  const layout = read('apps/admin/src/app/dashboard/layout.tsx');
  const matchesPage = read('apps/admin/src/app/dashboard/matches/page.tsx');

  assert.match(layout, /useMatchNotifications|useNotifications/, 'the bell reads the new table');
  assert.doesNotMatch(
    layout,
    /absolute right-2 top-2 h-1\.5 w-1\.5 rounded-full bg-red-500/,
    'the unread dot must be real, not decoration',
  );
  assert.match(matchesPage, /Needs result/, 'a finished fixture without a score is flagged');
  assert.match(matchesPage, /matchPhase/, 'the flag uses the shared clock');
});

test('MC-2 checkout refuses an order for a match that has kicked off', () => {
  const checkout = read('supabase/functions/stripe-checkout/index.ts');
  const errorCodes = read('packages/shared/src/error-codes.ts');

  assert.match(
    errorCodes,
    /'match_started'/,
    'the refusal needs its own code so the app can say why',
  );
  assert.match(checkout, /kickoff_at/, 'checkout must read the match kickoff');
  assert.match(
    checkout,
    /match_started/,
    'a kicked-off match must never start a new checkout',
  );
  assert.doesNotMatch(
    checkout,
    /\.eq\("status",\s*"upcoming"\)/,
    'the guard is the kickoff time, not the stored status the clock may have left behind',
  );
});

test('MC-1 the apps group fixtures with the shared clock, not the stored status', () => {
  for (const [name, source] of [
    ['home', homeSource],
    ['fixtures', fixturesSource],
  ]) {
    assert.match(source, /groupMatches/, `${name} must use the shared grouping`);
    assert.doesNotMatch(
      source,
      /match\.status === 'upcoming'/,
      `${name} must not decide "upcoming" from the stored status`,
    );
    assert.doesNotMatch(
      source,
      /status === 'completed'/,
      `${name} must not decide "result" from the stored status`,
    );
  }

  assert.doesNotMatch(
    homeSource,
    /upcoming\[0\]/,
    'the next match is the soonest scheduled fixture, never the first upcoming row',
  );
  assert.doesNotMatch(
    homeSource,
    /const nextMatch = upcoming/,
    'the next match must come from the clock grouping',
  );
});
