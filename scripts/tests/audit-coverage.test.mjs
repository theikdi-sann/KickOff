// Phase C3 — every privileged admin change is audited.
//
// NFR-05 states that privileged mutations are audited. The flow audit found
// that 17 of the 19 direct writes in the staff console wrote no `audit_logs`
// row at all: fixtures, zones, seats, venues, gates, news, club settings and
// the CSV export of supporter data were all unlogged.
//
// These contracts lock the coverage in place:
//   AC-1  the audit vocabulary has one owner and is used consistently,
//   AC-2  every privileged mutation in the staff console records an action,
//   AC-3  the audit rows carry the actor, the entity and what changed,
//   AC-4  no action is defined but never used (no dead vocabulary).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const auditSource = read('apps/admin/src/lib/audit.ts');

/** Every privileged write in the staff console and the action it must record. */
const REQUIRED_AUDITS = [
  { file: 'apps/admin/src/lib/queries/matches.ts', action: 'matchCreate' },
  { file: 'apps/admin/src/lib/queries/matches.ts', action: 'matchUpdate' },
  { file: 'apps/admin/src/lib/queries/matches.ts', action: 'matchDelete' },
  { file: 'apps/admin/src/lib/queries/matches.ts', action: 'zoneCreate' },
  { file: 'apps/admin/src/lib/queries/matches.ts', action: 'zoneUpdate' },
  { file: 'apps/admin/src/lib/queries/matches.ts', action: 'zoneDelete' },
  { file: 'apps/admin/src/lib/queries/venues.ts', action: 'venueCreate' },
  { file: 'apps/admin/src/lib/queries/venues.ts', action: 'venueDelete' },
  { file: 'apps/admin/src/lib/queries/gates.ts', action: 'gateCreate' },
  { file: 'apps/admin/src/lib/queries/gates.ts', action: 'gateUpdate' },
  { file: 'apps/admin/src/lib/queries/gates.ts', action: 'gateDelete' },
  { file: 'apps/admin/src/lib/queries/news.ts', action: 'newsCreate' },
  { file: 'apps/admin/src/lib/queries/news.ts', action: 'newsUpdate' },
  { file: 'apps/admin/src/lib/queries/news.ts', action: 'newsDelete' },
  { file: 'apps/admin/src/lib/queries/settings.ts', action: 'settingsUpdate' },
  { file: 'apps/admin/src/app/dashboard/tickets/page.tsx', action: 'ordersExport' },
];

test('AC-1 the audit vocabulary has one owner', () => {
  assert.match(
    auditSource,
    /export const AUDIT_ACTIONS = \{/,
    'the action names live in one module',
  );
  assert.match(
    auditSource,
    /export async function recordAudit/,
    'one writer writes every audit row',
  );
  assert.match(
    auditSource,
    /actor_id: userData\.user\?\.id \?\? null/,
    'every row must carry the actor',
  );
});

test('AC-2 every privileged mutation records an action', () => {
  for (const { file, action } of REQUIRED_AUDITS) {
    const source = read(file);
    assert.match(
      source,
      new RegExp(`AUDIT_ACTIONS\\.${action}\\b`),
      `${file} must record the "${action}" action`,
    );
    assert.match(
      source,
      /recordAudit\(/,
      `${file} must write an audit row`,
    );
  }
});

test('AC-3 the audit rows carry the entity and what changed', () => {
  for (const { file, action } of REQUIRED_AUDITS) {
    const source = read(file);
    const call = source.slice(source.indexOf(`AUDIT_ACTIONS.${action}`));
    const end = call.indexOf('});');
    const body = call.slice(0, end === -1 ? call.length : end);

    assert.match(body, /entity: "/, `${file}: the "${action}" row must name its entity`);
    // The scope of the change is named: the row it changed, the settings keys
    // it touched, or — for an export — how many rows left the building.
    assert.match(
      body,
      /entityId: |keys: |rows: /,
      `${file}: the "${action}" row must identify what it changed`,
    );
  }
});

test('AC-4 no action is defined but never used', () => {
  const vocabulary = [...auditSource.matchAll(/^\s{2}(\w+): '([a-z.]+)',$/gm)].map(
    (match) => ({ key: match[1], value: match[2] }),
  );
  assert.ok(vocabulary.length >= 15, `expected the full vocabulary, found ${vocabulary.length}`);

  const consumers = [
    'apps/admin/src/lib/queries/matches.ts',
    'apps/admin/src/lib/queries/venues.ts',
    'apps/admin/src/lib/queries/gates.ts',
    'apps/admin/src/lib/queries/news.ts',
    'apps/admin/src/lib/queries/settings.ts',
    'apps/admin/src/app/dashboard/tickets/page.tsx',
    'apps/admin/src/lib/audit.ts',
  ]
    .map((file) => read(file))
    .join('\n');

  // Since F-07 one action is written by the database itself, in the same
  // transaction as the change it records. A value counts as used when the
  // console records it through the vocabulary *or* a migration writes it.
  const databaseWriters = ['supabase/migrations/0038_atomic_reschedule_refund.sql']
    .map((file) => (existsSync(resolve(root, file)) ? read(file) : ''))
    .join('\n');

  for (const { key, value } of vocabulary) {
    const usedInConsole = new RegExp(`AUDIT_ACTIONS\\.${key}\\b`).test(consumers);
    const usedInDatabase = new RegExp(`'${value}'`).test(databaseWriters);
    assert.ok(
      usedInConsole || usedInDatabase,
      `AUDIT_ACTIONS.${key} ('${value}') is defined but never used — remove it or record it in the database`,
    );
  }
});
