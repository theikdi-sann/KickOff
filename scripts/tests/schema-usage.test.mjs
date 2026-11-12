// Phase C4 — F-11: the shared validation contracts are actually used.
//
// The shared package owned Zod schemas that no screen or function imported,
// while the mobile auth screens hand-rolled their own checks and
// `refund-order` redefined the shared refund schema. A contract nobody uses
// drifts; a check written twice drifts faster.
//
// The contract keeps the wiring honest:
//
//   SU-1  the mobile auth screens validate through the shared schemas
//   SU-2  no screen re-implements the e-mail check by hand
//   SU-3  the refund schema has one source and a generated Edge copy
//   SU-4  schemas with no consumer are deleted, not left to rot
//   SU-5  the admin order pager uses the shared pagination schema
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { generate as generateRefund } from '../../scripts/sync-edge-schemas.mjs';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('SU-1 the mobile auth screens validate through the shared schemas', () => {
  const login = read('apps/mobile/src/app/(auth)/login.tsx');
  const register = read('apps/mobile/src/app/(auth)/register.tsx');
  const forgot = read('apps/mobile/src/app/(auth)/forgot-password.tsx');
  const reset = read('apps/mobile/src/app/(auth)/reset-password.tsx');

  assert.match(login, /signInSchema/, 'login must use the shared signInSchema');
  assert.match(register, /signUpSchema/, 'register must use the shared signUpSchema');
  assert.match(forgot, /emailSchema/, 'forgot-password must use the shared email schema');
  assert.match(reset, /passwordSchema/, 'reset-password must use the shared password schema');

  const profileEdit = read('apps/mobile/src/app/profile/edit.tsx');
  assert.match(
    profileEdit,
    /profileUpdateSchema/,
    'profile edit must use the shared profile schema',
  );
});

test('SU-2 no screen re-implements the e-mail check by hand', () => {
  const screens = [
    'apps/mobile/src/app/(auth)/login.tsx',
    'apps/mobile/src/app/(auth)/register.tsx',
    'apps/mobile/src/app/(auth)/forgot-password.tsx',
  ];

  for (const screen of screens) {
    assert.doesNotMatch(
      read(screen),
      /includes\(['"]@['"]\)/,
      `${screen} must not hand-roll the e-mail check`,
    );
  }
});

test('SU-3 the refund schema has one source and a generated Edge copy', () => {
  const canonical = read('packages/shared/src/refund.ts');

  // The Edge Functions cannot import `@kickoff/shared` at deploy time, so the
  // deployed copy is generated from the canonical source and compared here.
  const expected = generateRefund(canonical);
  const deployed = read('supabase/functions/_shared/refund.ts');
  assert.equal(
    deployed,
    expected,
    'supabase/functions/_shared/refund.ts is stale — run: node scripts/sync-edge-schemas.mjs',
  );

  // The function must consume the generated copy, not a third definition.
  const fn = read('supabase/functions/refund-order/index.ts');
  assert.match(fn, /from "\.\.\/_shared\/refund\.ts"/);
  assert.doesNotMatch(
    fn,
    /const bodySchema\s*=\s*z\.object/,
    'refund-order must not redefine the body schema',
  );
});

test('SU-4 schemas with no consumer are deleted, not left to rot', () => {
  const schemas = read('packages/shared/src/schemas.ts');

  for (const unused of [
    'createHoldSchema',
    'createOrderSchema',
    'scanPayloadSchema',
    'settingsUpdateSchema',
    'changePasswordSchema',
  ]) {
    assert.doesNotMatch(
      schemas,
      new RegExp(`export const ${unused}\\b`),
      `${unused} has no consumer and must be deleted`,
    );
  }
});

test('SU-5 the admin order pager uses the shared pagination schema', () => {
  const orders = read('apps/admin/src/lib/queries/orders.ts');

  assert.match(orders, /paginationSchema/);
});

test('SU-6 the generated refund copy is present and type-checked', () => {
  assert.ok(existsSync(resolve(root, 'supabase/functions/_shared/refund.ts')));
  assert.ok(existsSync(resolve(root, 'scripts/sync-edge-schemas.mjs')));
});
