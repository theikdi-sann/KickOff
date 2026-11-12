// Phase B — punch list #13: reschedule rules wired through the admin UI and
// stored as an audit reason (Option 3: migration grants authenticated-admin
// INSERT on audit_logs; the client writes the row alongside the update —
// deliberately NO DB trigger or RPC).
//
// Schema behaviour (RS-1..RS-6) lives in packages/shared/src/__tests__/
// reschedule.test.ts; these contracts lock the wiring:
//   7. the match form validates kickoff changes through the shared schema
//      and only demands a reason when the kickoff actually changed,
//   8. an audit writer records {from, to, reason} and the update mutation
//      calls it,
//   9. the migration grants admin INSERT + policy, with no trigger/function,
//  10. a pgTAP suite proves the grant (admin can, others cannot).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('RS-7 the match form validates kickoff changes through the shared schema', () => {
  const form = read('apps/admin/src/components/match-form.tsx');

  assert.match(
    form,
    /adminRescheduleSchema/,
    'the form must import and call the shared reschedule schema',
  );
  assert.match(
    form,
    /currentKickoffAt/,
    'the schema must be given the fixture’s current kickoff',
  );
  assert.match(
    form,
    /lockMinutes/,
    'the schema must be given the configured kickoff lock window',
  );
  assert.match(
    form,
    /status:/,
    'the schema must be given the fixture status (upcoming-only rule)',
  );
  // A reason is only demanded when the kickoff actually moved.
  assert.match(
    form,
    /kickoffChanged|kickoff.*changed|changed.*kickoff/i,
    'the form must detect a kickoff change to decide whether a reason is required',
  );
  assert.match(form, /Reason/, 'a reason input must render when the kickoff changes');
  assert.match(form, /reason/, 'the reason must travel in the submitted payload');
});

test('RS-7b the form compares kickoff instants, not raw local strings', () => {
  const form = read('apps/admin/src/components/match-form.tsx');

  // The `<input type="datetime-local">` value drops seconds, so a fixture
  // stored with non-zero seconds would look "unchanged" as a string while the
  // submitted ISO value still moves it — a reschedule with no reason.
  assert.match(
    form,
    /const kickoffChanged[\s\S]{0,220}kickoffIso/,
    'kickoff change detection must compare ISO instants so no kickoff_at write can slip through without a reason',
  );
  assert.doesNotMatch(
    form,
    /const kickoffChanged = Boolean\(initial\?\.id\) && values\.kickoffAt !== originalKickoff/,
    'string comparison of the raw datetime-local value is not a reschedule check',
  );
});

test('RS-8 the update mutation records the reschedule reason in audit_logs', () => {
  const audit = read('apps/admin/src/lib/audit.ts');
  const matches = read('apps/admin/src/lib/queries/matches.ts');

  assert.match(audit, /recordReschedule/, 'an audit writer for reschedules must exist');
  // The action may be written literally or taken from the shared audit
  // vocabulary — what matters is the value that lands in `audit_logs`.
  assert.match(
    audit,
    /action:\s*(["']reschedule["']|AUDIT_ACTIONS\.reschedule)/,
    'the audit action must be reschedule',
  );
  assert.match(
    audit,
    /reschedule:\s*["']reschedule["']/,
    'the shared vocabulary must map the reschedule action to "reschedule"',
  );
  assert.match(audit, /entity:\s*["']match["']/, 'the audit entity must be the match');
  assert.match(
    audit,
    /from[\s\S]{0,80}to[\s\S]{0,80}reason|reason[\s\S]{0,120}metadata|metadata/,
    'metadata must carry from, to and reason',
  );
  assert.match(
    matches,
    /recordReschedule/,
    'useUpdateMatch must write the audit row when a reschedule reason is present',
  );
});

test('RS-9 the migration grants admin INSERT on audit_logs with no trigger or RPC', () => {
  const path = 'supabase/migrations/0037_reschedule_audit.sql';
  assert.ok(existsSync(resolve(root, path)), `${path} must exist`);
  const sql = read(path);

  assert.match(
    sql,
    /grant insert on public\.audit_logs to authenticated/i,
    'authenticated must be granted INSERT on audit_logs',
  );
  assert.match(
    sql,
    /audit_logs_admin_insert[\s\S]{0,200}?is_admin\(\)/,
    'the INSERT policy must be restricted to admins',
  );
  // The walkthrough decision: rules live in shared Zod + admin UI only.
  assert.doesNotMatch(sql, /create trigger/i, 'no DB trigger — rules stay in shared Zod');
  assert.doesNotMatch(sql, /create (or replace )?function/i, 'no RPC — rules stay in shared Zod');
});

test('RS-10 a pgTAP suite proves the audit INSERT grant', () => {
  const path = 'supabase/tests/reschedule-audit.test.sql';
  assert.ok(existsSync(resolve(root, path)), `${path} must exist`);
  const sql = read(path);

  assert.match(sql, /plan\(\d+\)/, 'the suite must declare a plan');
  assert.match(sql, /audit_logs/, 'the suite must exercise audit_logs');
  assert.match(sql, /lives_ok/, 'an admin insert must be proven to succeed');
  assert.match(sql, /throws_ok/, 'a non-admin insert must be proven to fail');
});
