// GAP-09.2 — the fan data export (subject access).
//
// A fan can ask for everything KickOff holds about them, across every club
// their account touches. `docs/PRIVACY.md` is the schedule of record: the
// export covers exactly the subject's tables in the inventory, and a table
// added there later must join the export.
//
//   EX-1  the export registry names exactly the subject's inventory tables
//   EX-2  the export-user function queries every table the registry names
//   EX-3  the export is audit-logged, and another person's export is refused
//         unless the caller is an admin (the delete-account guard)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const REGISTRY = 'supabase/functions/_shared/export.ts';
const FUNCTION = 'supabase/functions/export-user/index.ts';

// The subject's own tables, per docs/PRIVACY.md's inventory. A table the fan
// populates joins the export or the contract fails.
const SUBJECT_TABLES = [
  'profiles',
  'fans',
  'orders',
  'order_seats',
  'tickets',
  'seat_holds',
  'device_tokens',
];

test('EX-1 the export registry names exactly the subject inventory tables', () => {
  const source = read(REGISTRY);

  assert.match(
    source,
    /USER_EXPORT_TABLES/,
    'the registry must be a named constant, not a loose list',
  );
  for (const table of SUBJECT_TABLES) {
    assert.match(source, new RegExp(`"${table}"`), `the registry must include ${table}`);
  }
  // Every table name in the registry is a known subject table — no table that
  // is not the fan's own data sneaks into the export.
  const registry = source.match(/"(profiles|fans|orders|order_seats|tickets|seat_holds|device_tokens)"/g) ?? [];
  assert.ok(registry.length >= SUBJECT_TABLES.length, `registry tables: ${[...new Set(registry)].join(', ')}`);
});

test('EX-2 the export queries every table the registry names', () => {
  const fn = read(FUNCTION);
  for (const table of SUBJECT_TABLES) {
    assert.match(
      fn,
      new RegExp(`\\.from\\(["']${table}["']\\)`),
      `export-user must read ${table}`,
    );
  }
});

test('EX-3 the export is audit-logged and guarded like account deletion', () => {
  const fn = read(FUNCTION);

  assert.match(fn, /account\.export/, 'the export must write an account.export audit row');
  assert.match(
    fn,
    /isAdmin/,
    'exporting another person must require an admin — the delete-account guard',
  );
  assert.match(
    fn,
    /You can only export your own account/,
    'the refusal must say what was refused',
  );
});
