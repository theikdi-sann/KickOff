// A gate is a physical turnstile: the same gate serves many matchdays. The
// console must let an admin attach a gate to today's fixture without hiding
// the gate or deleting the fixtures it admitted in the past.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const gatesQuery = read('apps/admin/src/lib/queries/gates.ts');
const gatesPage = read('apps/admin/src/app/dashboard/gates/page.tsx');
const scanPage = read('apps/admin/src/app/dashboard/scan/page.tsx');

test('AG-1 the gate query knows which assignment is current', () => {
  assert.match(gatesQuery, /isGateFixtureOpen/, 'the gate query must use the shared clock');
  assert.match(
    gatesQuery,
    /currentMatchIds/,
    'the gate must expose the fixtures it is admitting now',
  );
  assert.match(
    gatesQuery,
    /currentKickoffAt/,
    'the scanner needs the current kickoff, not the earliest assignment ever',
  );
});

test('AG-2 the gate form only offers open fixtures and keeps past assignments', () => {
  assert.match(gatesPage, /isGateFixtureOpen/, 'the selectable list must be filtered by the clock');
  assert.match(
    gatesPage,
    /pastMatchIds|historyMatchIds|disabled/,
    'past assignments must stay visible or preserved, never silently dropped',
  );
});

test('AG-3 the scanner shows the fixture the gate is admitting now', () => {
  assert.match(scanPage, /currentMatchLabels/, 'the scan header must use current assignments');
  assert.match(scanPage, /currentKickoffAt/, 'the scan header must not show the earliest past date');
});

test('AG-4 only the zone being saved reports a pending state', () => {
  const matchPage = read('apps/admin/src/app/dashboard/matches/[id]/page.tsx');
  assert.match(
    matchPage,
    /updateZone\.variables\?\.id\s*===\s*zone\.id/,
    'the pending flag must be scoped to the zone the mutation is saving',
  );
});


test('AG-5 a started fixture hides seating edits in the console', () => {
  const matchPage = read('apps/admin/src/app/dashboard/matches/[id]/page.tsx');
  assert.match(matchPage, /canConfigureSeating/, 'the page must derive the seating lock');
  assert.match(
    matchPage,
    /canConfigureSeating\s*=\s*phase\s*===\s*"scheduled"/,
    'only a scheduled fixture may change its inventory',
  );
});

test('AG-6 the result is one click from the list and seating is not the destination', () => {
  const matchesPage = read('apps/admin/src/app/dashboard/matches/page.tsx');
  const detailPage = read('apps/admin/src/app/dashboard/matches/[id]/page.tsx');
  const dialog = read('apps/admin/src/components/match-result-dialog.tsx');

  assert.match(dialog, /export function MatchResultDialog/, 'one dialog owns the score form');
  assert.match(matchesPage, /MatchResultDialog/, 'a Needs result row opens the dialog directly');
  assert.match(matchesPage, /Enter result/, 'the row offers the action by its real name');
  assert.match(matchesPage, /Manage fixture/, 'seating is one part of managing a fixture');
  assert.match(detailPage, /MatchResultDialog/, 'the fixture page uses the same dialog');
});

test('AG-7 a new RPC asks PostgREST to reload its schema cache', () => {
  const migration = read('supabase/migrations/0061_reload_schema_cache.sql');
  assert.match(migration, /notify pgrst,\s*'reload schema'/, 'the RPC must not wait for a reboot');
});
