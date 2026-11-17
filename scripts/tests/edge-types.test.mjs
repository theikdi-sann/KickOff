// GAP-09.0 — the Edge clients are typed against the generated schema.
//
// `serviceClient()` used to return an untyped `SupabaseClient`, so a write to
// a column the database no longer had passed `deno check` and failed at
// runtime: `delete-account` kept writing `profiles.role` after `0048` dropped
// the column, and PostgREST refused the update with PGRST204 *after* the auth
// user was already soft-deleted.
//
//   ET-1  the Edge clients name the generated `Database` type
//   ET-2  the deployed schema copy is generated, never hand-edited
//   ET-3  a migration changes the schema and the generated copy together —
//         `db:types` + `sync-edge-schemas` run in the same cycle
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const CANONICAL = 'packages/shared/src/database.types.ts';
const DEPLOYED = 'supabase/functions/_shared/database.types.ts';
const CLIENTS = 'supabase/functions/_shared/supabase.ts';

test('ET-1 the Edge clients are typed against the generated schema', () => {
  const source = read(CLIENTS);

  assert.match(
    source,
    /import\s+type\s+\{\s*Database\s*\}\s+from\s+"\.\.\/_shared\/\.?\/?database\.types\.ts"|import\s+type\s+\{\s*Database\s*\}\s+from\s+"\.\/database\.types\.ts"/,
    'the Edge clients must import the generated Database type',
  );
  assert.match(
    source,
    /SupabaseClient<Database>/,
    'serviceClient() and userClient() must return SupabaseClient<Database>',
  );
  assert.match(
    source,
    /createClient<Database>/,
    'the clients must be created with the generated Database type',
  );
  // Every function's return type names the generic — no untyped
  // `SupabaseClient` left.
  const returns = source.match(/function\s+\w+\([^)]*\):\s*SupabaseClient\b[^{]*/g) ?? [];
  assert.ok(
    returns.length >= 2 && returns.every((r) => r.includes('<Database>')),
    `every client return type must be SupabaseClient<Database>, found: ${returns.join(', ')}`,
  );
});

test('ET-2 the deployed schema copy is generated, never hand-edited', async () => {
  const { generate } = await import('../../scripts/sync-edge-schemas.mjs');
  const expected = generate(read(CANONICAL), CANONICAL);

  assert.equal(
    read(DEPLOYED),
    expected,
    `${DEPLOYED} is stale — run: node scripts/sync-edge-schemas.mjs`,
  );
});

test('ET-3 the schema type names the tables the clients write', () => {
  const generated = read(DEPLOYED);

  // A guard against a placeholder: the type must actually describe the schema,
  // not merely exist. `profiles` lost `role` at 0048; these are the tables the
  // Edge functions write.
  for (const table of ['profiles', 'orders', 'tickets', 'tenants', 'stripe_events']) {
    assert.match(generated, new RegExp(`"${table}"`), `the generated type must know ${table}`);
  }
});
