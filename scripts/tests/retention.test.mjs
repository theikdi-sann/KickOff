// NFR-16 — the retention sweep is scheduled and covers every promised window.
//
// The pgTAP suite proves the deletes; this contract proves the schedule and
// the window constants, because `cron.job` only exists in the cluster's
// configured database and cannot be read from a restore-drill scratch copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/0069_retention_windows.sql'),
  'utf8',
);

test('RET-S1 the daily retention sweep is scheduled', () => {
  assert.match(migration, /cron\.schedule\(\s*'xclub-retention-sweep'/);
  assert.match(migration, /'27 4 \* \* \*'/);
  assert.match(migration, /prune_retention_windows\(\)/);
});

test('RET-S2 every promised window is present', () => {
  assert.match(migration, /interval '7 years'/);
  assert.match(migration, /interval '3 years'/);
  assert.match(migration, /interval '90 days'/);
  assert.match(migration, /last_seen_at/);
  assert.doesNotMatch(migration, /interval '30 days'/, 'error_events keeps its own job');
});

test('RET-S3 the append-only scan log is purged through its maintenance flag', () => {
  assert.match(migration, /kickoff\.scan_events_maintenance', 'on'/);
  assert.match(migration, /delete from public\.scan_events/);
});
