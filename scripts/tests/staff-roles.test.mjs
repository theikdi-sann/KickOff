// The staff role contract.
//
// Two findings shaped this file. The first (Phase C3): `admin-users` wrote
// only `profiles.role`, while every privilege check authorises on the JWT
// claim `auth.users.app_metadata.role` — a promotion changed what the console
// *displayed* and nothing about what the account could do. The second
// (C7.4 / 0045): the database stopped reading the claim too. `is_admin()`,
// `is_staff()` and `is_gate_operator()` now read the **membership**
// (`staff_members` + `staff_roles`), so `profiles.role` is a legacy
// projection that `0048` drops.
//
// The role therefore lives in two places that must move together (D-23):
//
//   - `public.staff_members` — the authority the *database* reads;
//   - `auth.users.app_metadata.role` — the claim every *Edge Function* guard
//     reads.
//
// These contracts lock that model in place:
//   SR-1  a role change updates the membership and the JWT claim together,
//   SR-2  the claim write is compensated when it fails (no half-applied role),
//   SR-3  the role vocabulary has one owner and is unit-tested,
//   SR-4  "at least one admin must remain" counts admins that can act,
//   SR-5  only the gate surface accepts a gatekeeper,
//   SR-6  every demotion is guarded,
//   SR-7  the users screen manages the full role vocabulary,
//   SR-8  no second copy of the role vocabulary survives,
//   SR-9  no application code reads the legacy column any more,
//   SR-10 the service-role promotion helper grants the membership,
//   SR-11 the Edge deploy config carries no legacy import-map flag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const functionSource = read('supabase/functions/admin-users/index.ts');

test('SR-1 a role change updates the membership and the JWT claim together', () => {
  assert.match(
    functionSource,
    /planStaffRoleUpdate/,
    'the function must plan the role change through the shared role contract',
  );
  assert.match(
    functionSource,
    /staff_members/,
    'the membership is the authority the database reads — the role change must write it',
  );
  assert.match(
    functionSource,
    /auth\.admin\.updateUserById/,
    'the function must update the JWT claim — the membership alone does not reach the Edge guards',
  );
  assert.match(
    functionSource,
    /app_metadata/,
    'the claim update must write app_metadata.role',
  );
});

test('SR-2 a failed claim write is compensated, never left half-applied', () => {
  // The membership is written first and restored when the claim write fails,
  // so an account can never carry more access than its claim advertises.
  assert.match(
    functionSource,
    /if \(claimError\)[\s\S]*?restoreMembership\(/,
    'a failed claim write must restore the previous membership',
  );
  assert.match(
    functionSource,
    /if \(claimError\)[\s\S]*?throw new AppError\("internal"/,
    'a failed claim write must fail the request, not pretend it succeeded',
  );
});

test('SR-3 the role vocabulary has one owner and the Edge copy is generated', async () => {
  // GAP-03a: the vocabulary grew to `admin | gatekeeper`, and it is needed by
  // the console, the Edge guards and the database. It now lives in the shared
  // package; the deployed copy is generated, never hand-edited (§6.8).
  const canonical = read('packages/shared/src/roles.ts');
  assert.match(
    canonical,
    /export const STAFF_ROLES = \['customer', 'admin', 'gatekeeper'\] as const/,
    'the shared package must own the full role vocabulary',
  );
  assert.match(canonical, /export function planStaffRoleUpdate/);
  assert.match(canonical, /export function isStaffRole/);
  assert.match(canonical, /export function isAdminRole/);
  assert.match(
    canonical,
    /staff_members/,
    'the role contract must name the membership — it is where the authority lives now',
  );

  const { generate } = await import('../../scripts/sync-edge-schemas.mjs');
  assert.equal(
    read('supabase/functions/_shared/roles.ts'),
    generate(canonical, 'packages/shared/src/roles.ts'),
    'the Edge role contract is stale — run: node scripts/sync-edge-schemas.mjs',
  );

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
  assert.match(
    unitTest,
    /staff_members|membership/,
    'the unit test must assert that the membership is part of the plan',
  );
  assert.match(
    unitTest,
    /gatekeeper/,
    'the unit test must prove a gatekeeper is a staff role and not an admin',
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
    'the guard must read the JWT claim, not only the membership',
  );
  assert.match(
    functionSource,
    /staff_role[\s\S]{0,40}?admin|admin[\s\S]{0,40}?staff_role/,
    'the guard must count the club\'s admin memberships',
  );
  assert.doesNotMatch(
    functionSource,
    /\.eq\("role", "admin"\)/,
    'counting legacy profile rows can demote the last admin that can actually act',
  );
});

test('SR-5 only the gate surface accepts a gatekeeper', () => {
  // A gatekeeper's authority is exactly "scan and undo your own scan". The
  // gate functions therefore use requireStaff; every other privileged
  // function keeps requireAdmin, so the narrower role cannot leak into
  // refunds, user management, aggregates or the demo pass.
  for (const path of [
    'supabase/functions/scan-ticket/index.ts',
    'supabase/functions/scan-undo/index.ts',
  ]) {
    const source = read(path);
    assert.match(source, /requireStaff/, `${path} must accept a gatekeeper`);
    assert.doesNotMatch(source, /requireAdmin/, `${path} must not require an admin`);
  }

  for (const path of [
    'supabase/functions/refund-order/index.ts',
    'supabase/functions/admin-users/index.ts',
    'supabase/functions/orders-aggregate/index.ts',
    'supabase/functions/scan-demo/index.ts',
  ]) {
    const source = read(path);
    assert.match(source, /requireAdmin/, `${path} must stay admin-only`);
    assert.doesNotMatch(source, /requireStaff/, `${path} must not accept a gatekeeper`);
  }
});

test('SR-6 admin-users consumes the shared vocabulary and guards every demotion', () => {
  assert.match(
    functionSource,
    /staffRoleSchema/,
    'the role input must be parsed by the shared schema, not a local enum',
  );
  assert.doesNotMatch(
    functionSource,
    /z\.enum\(\["customer", "admin"\]\)/,
    'a second role vocabulary drifts from the database constraint',
  );
  // Demoting an admin to a gatekeeper must still trip "at least one admin must
  // remain" — the old guard only looked for `customer`.
  assert.match(
    functionSource,
    /"admin" && body\.role !== undefined && body\.role !== "admin"/,
    'every move away from admin must be guarded, not only customer demotions',
  );
});

test('SR-7 the users screen manages the full role vocabulary', () => {
  const queries = read('apps/admin/src/lib/queries/users.ts');
  const users = read('apps/admin/src/app/dashboard/users/page.tsx');

  // One role type, owned by the shared package — not a second local union
  // that would drift the moment a role is added.
  assert.match(queries, /StaffRole/, 'the users query must use the shared role type');
  assert.doesNotMatch(
    queries,
    /export type UserRole = "customer" \| "admin"/,
    'the local two-role union must be gone',
  );

  assert.match(users, /gatekeeper/i, 'the screen must offer the gatekeeper role');
  assert.match(users, /<select/, 'a three-role choice needs a selector, not a toggle');
  assert.match(users, /StaffRole/, 'the screen must use the shared role type');
});

test('SR-8 no second copy of the role vocabulary survives', () => {
  // `profiles.role` now accepts `gatekeeper`, so any union that still says
  // `'customer' | 'admin'` is wrong — it would let a gatekeeper row be typed
  // as a customer. The canonical vocabulary is `packages/shared/src/roles.ts`.
  const entities = read('packages/shared/src/entities.ts');
  assert.doesNotMatch(
    entities,
    /export type Role = 'customer' \| 'admin'/,
    'entities.ts must not declare its own role union',
  );
  assert.match(
    entities,
    /StaffRole/,
    'the profile row must use the shared staff role type',
  );

  const mobileAuth = read('apps/mobile/src/lib/auth.ts');
  assert.doesNotMatch(
    mobileAuth,
    /'customer' \| 'admin'/,
    'the mobile profile must not declare its own role union',
  );
  assert.match(mobileAuth, /StaffRole/, 'the mobile profile must use the shared staff role type');

  const schemas = read('packages/shared/src/schemas.ts');
  assert.doesNotMatch(
    schemas,
    /z\.enum\(\['customer', 'admin'\]\)/,
    'the DTO schema must not redeclare the role vocabulary',
  );
  assert.match(schemas, /staffRoleSchema/, 'the DTO schema must use the canonical role schema');
});

test('SR-9 no application code reads the legacy role column any more', () => {
  // The legacy column is dropped in 0048. Every reader must have moved to the
  // membership (database authority) or the JWT claim (Edge authority) first.
  const queries = read('apps/admin/src/lib/queries/users.ts');
  assert.match(
    queries,
    /staff_members/,
    'the console must read the club\'s memberships for the displayed role',
  );
  assert.doesNotMatch(
    queries,
    /full_name,role,/,
    'the console must not select the legacy role column any more',
  );

  const mobileAuth = read('apps/mobile/src/lib/auth.ts');
  assert.doesNotMatch(
    mobileAuth,
    /full_name,role,/,
    'the app must not select the legacy role column any more',
  );
  assert.match(
    mobileAuth,
    /staffRoleOf/,
    'the app reads its role from the JWT claim through the shared helper',
  );

  assert.doesNotMatch(
    functionSource,
    /full_name,role,/,
    'the admin-users function must not select the legacy role column any more',
  );
  assert.doesNotMatch(
    functionSource,
    /patch\.role\s*=/,
    'the admin-users function must not write the legacy role column any more',
  );
});

test('SR-10 the service-role promotion helper grants the membership', () => {
  const migration = read('supabase/migrations/0047_role_bridge_sweep.sql');

  assert.match(
    migration,
    /grant_admin/,
    'the promotion helper must be rewritten in this migration',
  );
  assert.match(
    migration,
    /staff_members/,
    'the promotion helper must grant the membership the database reads',
  );
  assert.match(
    migration,
    /raw_app_meta_data/,
    'the promotion helper must merge the JWT claim the Edge guards read',
  );
  assert.doesNotMatch(
    migration,
    /set role = 'admin'/,
    'the promotion helper must not write the legacy column any more',
  );
});

test('SR-11 the Edge deploy config carries no legacy import-map flag', () => {
  // The CLI no longer accepts an import map passed as a flag and warns on
  // every deploy; `supabase/functions/deno.json` is the supported place.
  const config = read('supabase/config.toml');

  assert.doesNotMatch(
    config,
    /import_map\s*=/,
    'the stale import_map flag must be gone from supabase/config.toml',
  );
  assert.match(
    read('supabase/functions/deno.json'),
    /"imports"/,
    'the functions keep their import map in deno.json',
  );
});
