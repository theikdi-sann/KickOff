// Phase C3 — the staff role contract.
//
// The flow audit found a Critical defect: `admin-users` wrote only
// `profiles.role`, while every privilege check in the product authorises on
// the JWT claim `auth.users.app_metadata.role` (`public.is_admin()` and the
// Edge Function guards). Promoting a staff member therefore changed what the
// console *displayed* and nothing about what the account could do.
//
// These contracts lock the fix in place:
//   SR-1  a role change updates the profile row and the JWT claim together,
//   SR-2  the claim write is compensated when it fails (no half-applied role),
//   SR-3  the role vocabulary has one owner and is unit-tested.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const functionSource = read('supabase/functions/admin-users/index.ts');

test('SR-1 a role change updates the profile row and the JWT claim together', () => {
  assert.match(
    functionSource,
    /planStaffRoleUpdate/,
    'the function must plan the role change through the shared role contract',
  );
  assert.match(
    functionSource,
    /auth\.admin\.updateUserById/,
    'the function must update the JWT claim — the profile row alone grants nothing',
  );
  assert.match(
    functionSource,
    /app_metadata/,
    'the claim update must write app_metadata.role',
  );
});

test('SR-2 a failed claim write is compensated, never left half-applied', () => {
  // The profile row is written first and restored when the claim write fails,
  // so an account can never carry more access than its profile advertises.
  assert.match(
    functionSource,
    /if \(claimError\)[\s\S]*?update\(\{ role: target\.role \}\)/,
    'a failed claim write must restore the previous profile role',
  );
  assert.match(
    functionSource,
    /if \(claimError\)[\s\S]*?throw new AppError\("internal"/,
    'a failed claim write must fail the request, not pretend it succeeded',
  );
});

test('SR-3 the role vocabulary has one owner and is unit-tested', () => {
  const roles = read('supabase/functions/_shared/roles.ts');
  assert.match(roles, /export const STAFF_ROLES = \["customer", "admin"\] as const/);
  assert.match(roles, /export function planStaffRoleUpdate/);

  const unitTest = read('supabase/functions/tests/roles.test.ts');
  assert.match(
    unitTest,
    /planStaffRoleUpdate/,
    'the role plan must be covered by a unit test',
  );
  assert.match(
    unitTest,
    /app_metadata/,
    'the unit test must assert that the claim is part of the plan',
  );
});

test('SR-4 "at least one admin must remain" counts admins that can act', () => {
  assert.match(
    functionSource,
    /countUsableAdmins/,
    'the guard must count admins whose JWT claim is admin',
  );
  assert.match(
    functionSource,
    /getUserById[\s\S]*?app_metadata/,
    'the guard must read the JWT claim, not only the profile row',
  );
  assert.doesNotMatch(
    functionSource,
    /\.select\("id", \{ head: true, count: "exact" \}\)[\s\S]*?\.eq\("role", "admin"\)[\s\S]*?count/,
    'counting profile rows alone can demote the last admin that can actually act',
  );
});
