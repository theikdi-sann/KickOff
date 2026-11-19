// C10.10 commit 3 — the create fixture dialog builds its own ground.
//
// Creating a fixture used to mean leaving the dialog: add the venue on the
// Venues page, add its zones there, add gates on the Gates page, then come
// back. The dialog now keeps a draft of the whole ground and sends it in the
// same atomic call that creates the fixture.
//
//   CF-1  one dialog, four ordered sections, no nested Modal
//   CF-2  one atomic RPC carries match, venue, zones, gates and assignment
//   CF-3  a new venue (away always, home only when the club has none) and its
//         generated seating are built inline
//   CF-4  an existing venue can gain stands; created geometry is locked
//   CF-5  inline gates are permanent, may serve a draft stand, and are assigned
//   CF-6  the page uses the new form for creation and keeps MatchForm for edits
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const maybe = (path) => (existsSync(resolve(root, path)) ? read(path) : '');

const formPath = 'apps/admin/src/components/create-fixture-form.tsx';
const createForm = maybe(formPath);
const matchesPage = read('apps/admin/src/app/dashboard/matches/page.tsx');
const matchesQuery = read('apps/admin/src/lib/queries/matches.ts');
const editForm = read('apps/admin/src/components/match-form.tsx');
const zoneForm = read('apps/admin/src/components/venue-zone-form.tsx');

test('CF-1 the create dialog is one draft with four ordered sections', () => {
  assert.ok(existsSync(resolve(root, formPath)), 'the create form must be its own component');
  assert.match(createForm, /export function CreateFixtureForm/, 'it exports a named component');
  assert.doesNotMatch(createForm, /<Modal/, 'sections are stacked in the one dialog, never nested');

  const order = ['match', 'venue', 'zones', 'gates'].map((section) =>
    createForm.indexOf(`section="${section}"`),
  );
  assert.ok(order.every((index) => index >= 0), 'every section is present');
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
    'the draft reads Match → Venue → Zones → Gates',
  );
  assert.match(matchesPage, /CreateFixtureForm/, 'the matches page renders the form');
});

test('CF-2 one atomic RPC carries the whole draft', () => {
  assert.match(matchesQuery, /admin_create_match_full/, 'creation uses the atomic call');
  assert.doesNotMatch(
    matchesQuery,
    /admin_create_match_from_venue/,
    'the old clone-only call is no longer the create path',
  );
  for (const parameter of [
    'p_match',
    'p_venue',
    'p_zones',
    'p_gates',
    'p_gate_ids',
    'p_prices',
  ]) {
    assert.match(matchesQuery, new RegExp(parameter), `the call sends ${parameter}`);
  }
  assert.doesNotMatch(
    createForm,
    /useCreateVenue|useSaveVenueZone|useCreateGate/,
    'creation must not perform separate venue, zone or gate writes',
  );
});

test('CF-3 a new venue and its generated seating are built inline', () => {
  assert.match(createForm, /newVenue/, 'the draft carries the new ground fields');
  assert.match(createForm, /isHome/, 'home/away decides the kind of ground');
  assert.match(createForm, /homeAway/, 'the match section still chooses home or away');
  assert.match(createForm, /VenueZoneForm/, 'a stand is added with the shared zone form');
  assert.match(createForm, /rows/, 'the stand collects its rows');
  assert.match(createForm, /seatsPerRow/, 'the stand collects seats per row');
  assert.match(
    createForm,
    /Add (a )?new (away )?venue|Create the home venue/i,
    'a ground can be added without leaving the dialog',
  );
});

test('CF-4 an existing venue can gain stands; created geometry is locked', () => {
  assert.match(createForm, /homeVenue/, 'the draft knows the club home ground');
  assert.match(createForm, /Venues page/, 'a second home ground points back to the Venues page');
  assert.match(createForm, /defaultPriceMinorUnits/, 'existing stands keep their default price');
  assert.match(createForm, /locked/i, 'the draft says geometry is locked once created');
  assert.match(
    zoneForm,
    /!editing/,
    'the shared zone form only offers rows and seats while creating',
  );
});

test('CF-5 inline gates are permanent and may serve a draft stand', () => {
  assert.match(createForm, /zoneKey/, 'a gate can name a stand created in the same draft');
  assert.match(createForm, /zoneId/, 'a gate can name an existing stand');
  assert.match(createForm, /Whole ground/i, 'a gate may still serve the whole ground');
  assert.match(createForm, /permanent|Gates page/i, 'inline gates are venue-level turnstiles');
  assert.match(createForm, /draftGates|draftGate/, 'the draft carries the gates it would create');
});

test('CF-6 creation uses the new form; MatchForm is edit-only', () => {
  assert.match(matchesPage, /CreateFixtureForm/, 'the page imports the create form');
  assert.match(
    matchesPage,
    /creating[\s\S]{0,500}CreateFixtureForm/,
    'the create dialog renders it',
  );
  assert.match(matchesPage, /editing[\s\S]{0,500}MatchForm/, 'the edit dialog keeps MatchForm');
  assert.doesNotMatch(editForm, /isCreate/, 'the edit form no longer carries a create path');
  assert.doesNotMatch(editForm, /Create fixture/, 'the create button lives in the create form');
});
