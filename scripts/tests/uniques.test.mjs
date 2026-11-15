// C7.4 / 0046 — per-club uniques stay wired end to end.
//
// The pgTAP suite proves the database rule; these contracts pin the writers
// that must speak it, because a stale conflict target is a runtime 42P10 the
// suite cannot see:
//   UNI-1  migration 0046 moves the three keys under `tenant_id`,
//   UNI-2  the seed replays against the composite conflict targets,
//   UNI-3  the admin resolves names against its own club (`current_tenant()`)
//          and upserts on the composite keys,
//   UNI-4  mvp-gate names its gate per run — a club-scoped unique refuses a
//          fixed name left behind by a run that died before cleanup.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('UNI-1 migration 0046 moves the three keys under tenant_id', () => {
  const sql = read('supabase/migrations/0046_per_club_uniques.sql');

  assert.match(
    sql,
    /drop constraint if exists venues_name_key/,
    'the global venues.name unique must be dropped',
  );
  assert.match(
    sql,
    /venues_tenant_name_key unique \(tenant_id, name\)/,
    'venues.name must become unique per club',
  );
  assert.match(
    sql,
    /gates_tenant_name_key unique \(tenant_id, name\)/,
    'gates.name must become unique per club',
  );
  assert.match(
    sql,
    /drop constraint if exists app_settings_pkey/,
    'the app_settings key primary key must go',
  );
  assert.match(
    sql,
    /primary key \(tenant_id, key\)/,
    'app_settings must be keyed per club',
  );
  assert.match(
    sql,
    /raise exception/i,
    'a duplicate gate name inside one club must refuse the migration loudly, not lose rows',
  );
});

test('UNI-2 the seed replays against the composite conflict targets', () => {
  const seed = read('supabase/seed.sql');

  assert.match(
    seed,
    /on conflict \(tenant_id, name\) do nothing/,
    'the venues seed must conflict on the per-club key — on conflict (name) matches no index after 0046',
  );
  assert.match(
    seed,
    /on conflict \(tenant_id, key\) do nothing/,
    'the settings seed must conflict on the per-club key — on conflict (key) matches no index after 0046',
  );
});

test('UNI-3 the admin resolves names against its own club', () => {
  const tenant = read('apps/admin/src/lib/queries/tenant.ts');
  const matches = read('apps/admin/src/lib/queries/matches.ts');
  const settings = read('apps/admin/src/lib/queries/settings.ts');
  const venues = read('apps/admin/src/lib/queries/venues.ts');

  assert.match(
    tenant,
    /\.rpc\("current_tenant"\)/,
    'the admin must ask the database which club it writes to — the JWT carries no tenant claim',
  );
  assert.match(matches, /currentTenantId\(/, 'resolveVenueId must scope by club');
  assert.match(
    matches,
    /onConflict: "tenant_id,name"/,
    'the venue upsert must target the per-club key',
  );
  assert.match(
    settings,
    /onConflict: "tenant_id,key"/,
    'the settings upsert must target the per-club key',
  );
  assert.match(
    venues,
    /currentTenantId\(/,
    'the venue list (management page + match picker) must show the own club only',
  );
});

test("UNI-4 mvp-gate names its gate per run", () => {
  const gate = read('scripts/mvp-gate.mjs');

  assert.doesNotMatch(
    gate,
    /name: 'Gate One'/,
    'a fixed gate name dies on gates_tenant_name_key when a dead run leaves its gate behind',
  );
  assert.match(
    gate,
    /name: `\$\{fixtureId\}-gate`/,
    'the gate name must carry the run-scoped fixture id, like the gate id does',
  );
});
