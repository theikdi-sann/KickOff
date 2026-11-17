// GAP-09.3 — fan erasure implements docs/PRIVACY.md's schedule exactly.
//
// `delete-account` predates the schedule and did three things the locked
// decisions refuse: it voided *used* passes (the gate record must stay), it
// nulled the order's payment reference (financial rows are retained with
// their reconciliation data), and it *released* the fan's holds instead of
// erasing the rows.
//
//   EC-1  unused passes are voided — a used pass's record stays
//   EC-2  the fan's seat holds are erased, not released
//   EC-3  device tokens are erased
//   EC-4  financial rows keep their payment references (RETAIN)
//   EC-5  the profile scrub matches the schedule
//   EC-6  the erasure is audited
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const FN = 'supabase/functions/delete-account/index.ts';

test('EC-1 unused passes are voided — a used pass keeps its record', () => {
  const fn = read(FN);
  // The tickets update must target exactly the still-valid passes: voiding a
  // used pass would contradict the gate record the schedule retains.
  assert.match(
    fn,
    /\.from\("tickets"\)[\s\S]*?\.eq\("status",\s*"valid"\)/,
    'delete-account must void only the still-valid passes',
  );
  // And the update's own payload must only set the status.
  const ticketUpdate = fn.match(/\.from\("tickets"\)[\s\S]*?\.eq\("id", targetId\)/) ??
    fn.match(/\.from\("tickets"\)[\s\S]*?\.eq\("user_id", targetId\)/);
  assert.ok(ticketUpdate, 'the tickets update must be a plain statement');
  assert.match(ticketUpdate[0], /status:\s*"void"/);
  assert.doesNotMatch(ticketUpdate[0], /user_id:/, 'the holder reference must not be rewritten');
});

test('EC-2 the fan seat holds are erased, not released', () => {
  const fn = read(FN);
  const holds = fn.match(/\.from\("seat_holds"\)([\s\S]*?);/) ?? [];
  assert.match(
    fn,
    /\.from\("seat_holds"\)\s*\n?\s*\.delete\(\)/,
    'seat holds must be deleted — a released hold row still exists',
  );
  if (holds[1]) {
    assert.doesNotMatch(holds[1], /update|released_at/, 'no in-place release may remain');
  }
});

test('EC-3 device tokens are erased', () => {
  const fn = read(FN);
  assert.match(fn, /\.from\("device_tokens"\)[\s\S]{0,120}\.delete\(\)/);
});

test('EC-4 financial rows keep their payment references', () => {
  const fn = read(FN);
  // RETAIN: an order row stays exactly as it was — its payment reference is
  // reconciliation data, not personal data.
  assert.doesNotMatch(fn, /payment_ref/, 'delete-account must not touch payment_ref');
});

test('EC-5 the profile scrub matches the schedule', () => {
  const fn = read(FN);
  const scrub = fn.match(/\.from\("profiles"\)\s*\n\s*\.update\(([\s\S]*?)\)\s*\n\s*\.eq/);
  assert.ok(scrub, 'delete-account must scrub the profile row');
  assert.match(scrub[1], /deleted\+/, 'the email must be replaced by the invalid address');
  assert.match(scrub[1], /Deleted account/, 'the name must be replaced');
  assert.match(scrub[1], /phone:\s*null/, 'the phone must be removed');
  // The scrub stays a scrub: no delete of the row other tables reference.
  assert.doesNotMatch(fn, /\.from\("profiles"\)[\s\S]{0,80}\.delete\(\)/);
});

test('EC-6 the erasure is audited', () => {
  const fn = read(FN);
  assert.match(fn, /account\.delete/);
  assert.match(fn, /writeAudit/);
});
