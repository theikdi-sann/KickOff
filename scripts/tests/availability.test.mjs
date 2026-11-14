// Phase C4 — F-17: sell-through comes from the database, not the browser.
//
// The staff console used to compute a match's capacity and free seats from
// the zone layout (`rows.length * seatsPerRow`) and to subtract the sold
// tickets. That number is a *request*, not a fact:
//
//   * the view `public.zone_availability` counts the seats that exist,
//   * a seat reserved by a pending order is not available — and the browser
//     cannot know that a seat is reserved.
//
// So the console could tell the operator that a match had free seats when
// the database had already reserved them.
//
// The contract keeps the number where it belongs:
//
//   AV-1  the shared package owns the mapping and the arithmetic
//   AV-2  the staff console reads the availability view
//   AV-3  no screen recomputes the capacity from the zone layout
//   AV-4  the mobile app reads the same view through the same mapping
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

/** The screens that show how many seats a match has. */
const SCREENS = [
  'apps/admin/src/app/dashboard/overview.tsx',
  'apps/admin/src/app/dashboard/matches/[id]/page.tsx',
  'apps/mobile/src/app/match/[id].tsx',
];

test('AV-1 the shared package owns the availability mapping', () => {
  const shared = read('packages/shared/src/availability.ts');

  for (const exported of [
    'toZoneAvailabilityDto',
    'summariseAvailability',
    'sellThroughPercent',
    'potentialRevenueMinorUnits',
  ]) {
    assert.match(
      shared,
      new RegExp(`export function ${exported}\\b`),
      `the shared package must own ${exported}`,
    );
  }

  // The shared package must be the only place that knows the view's shape.
  assert.match(shared, /zone_availability/);
});

test('AV-2 the staff console reads the availability view', () => {
  const queries = read('apps/admin/src/lib/queries/matches.ts');

  assert.match(queries, /from\("zone_availability"\)/);
  assert.match(queries, /total_seats/);
  assert.match(queries, /available_seats/);
});

test('AV-3 no screen recomputes the capacity from the zone layout', () => {
  for (const screen of SCREENS) {
    const source = read(screen);

    // `rows.length * seatsPerRow` is the layout the club asked for, not the
    // seats the club has. It must not reach a capacity or an availability.
    assert.doesNotMatch(
      source,
      /rows\.length\s*\*\s*\w+\.seatsPerRow/,
      `${screen} must not derive the capacity from the zone layout`,
    );
    assert.doesNotMatch(
      source,
      /rows\.length\s*\*\s*\w+\.seatsPerRow/,
      `${screen} must not derive the availability from the zone layout`,
    );
  }

  // The overview must use the shared arithmetic, not its own.
  const overview = read('apps/admin/src/app/dashboard/overview.tsx');
  assert.match(overview, /sellThroughPercent\(/);
  assert.match(overview, /summariseAvailability\(/);
});

test('AV-4 the mobile app reads the same view through the same mapping', () => {
  const queries = read('apps/mobile/src/lib/queries/seats.ts');

  assert.match(queries, /from\('zone_availability'\)/);
  assert.match(queries, /toZoneAvailabilityDto\(/);
});
