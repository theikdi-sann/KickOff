// Phase C3 — the staff console must refuse a non-admin at the edge.
//
// F-09: the Next proxy proved only "signed in" and "MFA level". Any signed-in
// account could request `/dashboard/*`, and the dashboard layout rendered the
// whole console for a non-admin until the client-side redirect fired. The
// database still refused the writes (RLS `is_admin()`), but the console
// itself was reachable by any account.
//
// These contracts lock the boundary in place:
//   AA-1  the proxy checks the admin role on the server,
//   AA-2  the dashboard shell is not rendered for a non-admin,
//   AA-3  the operator is told why they were refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const proxySource = read('apps/admin/src/proxy.ts');
const layoutSource = read('apps/admin/src/app/dashboard/layout.tsx');
const loginSource = read('apps/admin/src/app/login/page.tsx');

test('AA-1 the proxy refuses a non-admin on the server', () => {
  assert.match(
    proxySource,
    /app_metadata/,
    'the proxy must read the role claim from the validated user',
  );
  assert.match(
    proxySource,
    /role\s*===\s*["']admin["']/,
    'the proxy must compare the claim with "admin"',
  );
  assert.match(
    proxySource,
    /!isAdmin[\s\S]{0,200}?\/dashboard/,
    'a non-admin must be redirected away from the dashboard',
  );
});

test('AA-2 the dashboard shell is not rendered for a non-admin', () => {
  assert.match(
    layoutSource,
    /session\.isAdmin/,
    'the layout must check the role before rendering the console',
  );
  assert.match(
    layoutSource,
    /!session\.isAdmin[\s\S]{0,400}?return/,
    'a non-admin must not reach the console shell',
  );
  // The shell must be behind the check, not beside it.
  const guardIndex = layoutSource.indexOf('!session.isAdmin');
  const shellIndex = layoutSource.indexOf('<AdminShell');
  assert.ok(guardIndex !== -1 && shellIndex !== -1, 'the layout must have both the guard and the shell');
  assert.ok(guardIndex < shellIndex, 'the role guard must come before the console shell');
});

test('AA-3 the operator is told why they were refused', () => {
  assert.match(
    loginSource,
    /not-admin/,
    'the login page must read the refusal reason',
  );
  assert.match(
    loginSource,
    /does not have admin access/i,
    'the login page must explain the refusal',
  );
});
