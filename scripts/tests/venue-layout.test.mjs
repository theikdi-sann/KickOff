// Phase 2 — the venue is the physical ground (Option A).
//
// A venue owns its zones, generated seats and gates; capacity is derived.
// Creating a fixture clones that layout into the match-scoped inventory the
// sale path already uses, so the money model is untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const venuesPage = read('apps/admin/src/app/dashboard/venues/page.tsx');
const venueLayoutEditor = read('apps/admin/src/components/venue-layout-editor.tsx');
const venueScreen = `${venuesPage}\n${venueLayoutEditor}`;
const venuesQuery = read('apps/admin/src/lib/queries/venues.ts');
const matchesQuery = read('apps/admin/src/lib/queries/matches.ts');
const matchForm = read('apps/admin/src/components/match-form.tsx');
const seed = read('supabase/seed.sql');

test('VL-1 the venue screen owns home/away, layout and derived capacity', () => {
  assert.match(venuesPage, /isHome/, 'the venue form must offer the home badge');
  assert.match(venueScreen, /useVenueLayout/, 'the venue shows its physical zones');
  assert.match(venuesPage, /venue\.capacity/, 'capacity comes from the seat count');
  assert.match(venueScreen, /Add zone|Layout/, 'the venue manages its zones');
  assert.match(
    venuesQuery,
    /admin_save_venue_zone/,
    'zones are created through the atomic RPC, not a browser multi-insert',
  );
});

test('VL-2 a fixture is created from the venue in one call', () => {
  assert.match(
    matchesQuery,
    /admin_create_match_from_venue/,
    'fixture creation clones the venue layout atomically',
  );
  assert.match(matchesQuery, /p_gate_ids/, 'the fixture carries its gates');
  assert.match(matchesQuery, /p_prices/, 'the fixture carries its per-zone prices');
  assert.match(matchForm, /useVenueLayout/, 'the create form reads the venue layout');
  assert.match(matchForm, /useGates/, 'the create form offers the venue gates');
  assert.match(matchForm, /Add away venue/, 'an away ground can be added without leaving the form');
  assert.match(matchForm, /venueId/, 'the form sends the venue id, not a name');
});

test('VL-3 the seed gives the home venue a physical layout', () => {
  assert.match(seed, /venue_zones/, 'the home ground has zones');
  assert.match(seed, /venue_seats/, 'the home ground has generated seats');
  assert.match(seed, /is_home = true/, 'the home ground is marked home');
});
