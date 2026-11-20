// RBAC-1…RBAC-8 — acceptance wiring for REQ-046 (custom per-club roles).
//
// The behaviour lives in `rbac.test.sql` (database), `rbac-api.test.ts`
// (Edge/claim) and the admin screens. This contract keeps each ID mapped so a
// deletion cannot silently drop one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const sql = read('supabase/tests/rbac.test.sql');
const api = read('supabase/functions/tests/rbac-api.test.ts');
const roles = read('supabase/functions/admin-roles/index.ts');
const adminUsers = read('supabase/functions/admin-users/index.ts');
const migration = read('supabase/migrations/0071_capability_rbac.sql');

test('RBAC-1…RBAC-6 run in the database acceptance suite', () => {
  for (const id of ['RBAC-1', 'RBAC-2', 'RBAC-3', 'RBAC-4', 'RBAC-5', 'RBAC-6']) {
    assert.match(sql, new RegExp(id), `${id} must run in rbac.test.sql`);
  }
});

test('RBAC-3/7/8 have an Edge/claim acceptance suite', () => {
  assert.match(api, /RBAC-8/);
  assert.match(api, /RBAC-3/);
  assert.match(adminUsers, /capabilities/);
  assert.match(adminUsers, /Could not update the staff role/);
  assert.match(adminUsers, /writeMembership\(db, tenantId, targetId/);
});

test('RBAC-6 authorization is capability-driven', () => {
  assert.match(migration, /has_capability\('manage_matches'\)/);
  assert.match(migration, /has_capability\('manage_venues'\)/);
  assert.match(migration, /has_capability\('publish_news'\)/);
  assert.match(migration, /has_capability\('manage_settings'\)/);
  assert.doesNotMatch(migration, /role\s*=\s*'admin'/i);
});

test('RBAC-8 the console exposes Roles and capability roles in Users', () => {
  assert.ok(existsSync(resolve(root, 'apps/admin/src/app/dashboard/settings/roles/page.tsx')));
  assert.match(read('apps/admin/src/app/dashboard/settings/roles/page.tsx'), /useRoles/);
  assert.match(read('apps/admin/src/app/dashboard/users/page.tsx'), /useRoles/);
  assert.match(roles, /admin_create_role/);
  assert.match(roles, /admin_update_role/);
  assert.match(roles, /admin_delete_role/);
});
