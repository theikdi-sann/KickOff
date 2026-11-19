// C10.10 commit 1 — the editors are components, not page-local markup.
//
// The fixture dialog will need to build a venue, its zones and its gates
// without leaving the dialog. Before any of that can be wired, the three
// pieces of UI that already know how to edit those things must leave the
// pages they grew up on:
//
//   ED-1  the venue zone form owns the zone fields and the geometry lock,
//   ED-2  the venue layout editor owns the zone list and its dialogs,
//   ED-3  the gate form owns the gate fields and the venue/stand rules,
//   ED-4  each form has exactly one implementation — the pages only render it.
//
// This is a refactor contract: it pins the shape, not new behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const has = (path) => existsSync(resolve(root, path));

const venuesPage = read('apps/admin/src/app/dashboard/venues/page.tsx');
const gatesPage = read('apps/admin/src/app/dashboard/gates/page.tsx');

test('ED-1 the venue zone form is its own component', () => {
  const path = 'apps/admin/src/components/venue-zone-form.tsx';
  assert.ok(has(path), 'the venue zone form must be a component');
  const form = read(path);
  assert.match(form, /export function VenueZoneForm/, 'it exports a named component');
  assert.match(form, /VenueZoneInput/, 'it emits the venue-zone input shape');
  assert.match(form, /zone\??:/, 'it works in create and edit mode');
  assert.match(form, /rows/, 'create mode collects the rows');
  assert.match(form, /seatsPerRow/, 'create mode collects the seats per row');
});

test('ED-2 the venue layout editor is its own component', () => {
  const path = 'apps/admin/src/components/venue-layout-editor.tsx';
  assert.ok(has(path), 'the venue layout editor must be a component');
  const editor = read(path);
  assert.match(editor, /export function VenueLayoutEditor/, 'it exports a named component');
  assert.match(editor, /useVenueLayout/, 'it reads the physical layout');
  assert.match(editor, /VenueZoneForm/, 'it uses the zone form rather than a second copy');
  assert.match(venuesPage, /VenueLayoutEditor/, 'the venues page renders the editor');
  assert.doesNotMatch(
    venuesPage,
    /function VenueLayoutDialog/,
    'the page no longer carries its own layout dialog',
  );
});

test('ED-3 the gate form is its own component', () => {
  const path = 'apps/admin/src/components/gate-form.tsx';
  assert.ok(has(path), 'the gate form must be a component');
  const form = read(path);
  assert.match(form, /export function GateForm/, 'it exports a named component');
  assert.match(form, /useVenueLayout/, 'it offers the venue stands');
  assert.match(form, /Whole ground/i, 'a gate may still serve the whole ground');
  assert.match(form, /isGateFixtureOpen/, 'it filters the fixture list by the clock');
  assert.match(form, /venueId/, 'it filters fixtures by the gate venue');
  assert.match(gatesPage, /GateForm/, 'the gates page renders the form');
  assert.doesNotMatch(gatesPage, /Gate code/, 'the page no longer carries the gate fields');
});

test('ED-4 each form has one implementation', () => {
  assert.doesNotMatch(
    venuesPage,
    /Default price \(THB\)/,
    'the venue zone fields live only in the form component',
  );
  assert.match(
    read('apps/admin/src/components/venue-zone-form.tsx'),
    /Default price \(THB\)/,
    'the venue zone form carries the fields',
  );
  assert.match(
    read('apps/admin/src/components/gate-form.tsx'),
    /Gate code/,
    'the gate form carries the fields',
  );
});
