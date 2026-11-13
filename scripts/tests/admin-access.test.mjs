// Phase C3 + GAP-03a — the staff console must refuse a non-staff account at
// the edge, and a gatekeeper must reach the gate surface and nothing else.
//
// F-09: the Next proxy proved only "signed in" and "MFA level". Any signed-in
// account could request `/dashboard/*`, and the dashboard layout rendered the
// whole console for a non-admin until the client-side redirect fired. The
// database still refused the writes (RLS `is_admin()`), but the console
// itself was reachable by any account.
//
// GAP-03a adds a second staff role. A gatekeeper is not an admin: the proxy
// must let them into `/dashboard/scan`, send them there from anywhere else,
// and the shell must not render the admin navigation for them.
//
// These contracts lock the boundary in place:
//   AA-1  the proxy checks the staff role on the server,
//   AA-2  the dashboard shell is not rendered for a non-staff account,
//   AA-3  the operator is told why they were refused,
//   AA-4  a gatekeeper is confined to the gate surface,
//   AA-5  the navigation is filtered by role,
//   AA-6  sign-in accepts a gatekeeper,
//   AA-7  the scan screen hides admin-only tools from a gatekeeper.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const proxySource = read('apps/admin/src/proxy.ts');
const layoutSource = read('apps/admin/src/app/dashboard/layout.tsx');
const loginSource = read('apps/admin/src/app/login/page.tsx');
const scanSource = read('apps/admin/src/app/dashboard/scan/page.tsx');

test('AA-1 the proxy checks the staff role on the server', () => {
  assert.match(
    proxySource,
    /app_metadata/,
    'the proxy must read the role claim from the validated user',
  );
  assert.match(
    proxySource,
    /isStaffRole/,
    'the proxy must use the shared staff predicate, not a second role comparison',
  );
  assert.match(
    proxySource,
    /!isStaff[\s\S]{0,240}?\/dashboard/,
    'a non-staff account must be redirected away from the dashboard',
  );
});

test('AA-2 the dashboard shell is not rendered for a non-staff account', () => {
  assert.match(
    layoutSource,
    /session\.isStaff/,
    'the layout must check the staff role before rendering the console',
  );
  assert.match(
    layoutSource,
    /!session\.isStaff[\s\S]{0,400}?return/,
    'a non-staff account must not reach the console shell',
  );
  // The shell must be behind the check, not beside it.
  const guardIndex = layoutSource.indexOf('!session.isStaff');
  const shellIndex = layoutSource.indexOf('<AdminShell');
  assert.ok(guardIndex !== -1 && shellIndex !== -1, 'the layout must have both the guard and the shell');
  assert.ok(guardIndex < shellIndex, 'the role guard must come before the console shell');
});

test('AA-3 the operator is told why they were refused', () => {
  assert.match(loginSource, /not-staff/, 'the login page must read the refusal reason');
  assert.match(
    loginSource,
    /does not have staff access/i,
    'the login page must explain the refusal',
  );
});

test('AA-4 a gatekeeper is confined to the gate surface', () => {
  assert.match(
    proxySource,
    /isAdmin[\s\S]{0,400}?\/dashboard\/scan/,
    'a gatekeeper must be sent to the gate surface',
  );
  assert.match(
    proxySource,
    /isGateSurface/,
    'the gate surface must be matched by one named predicate, not a loose prefix',
  );
  assert.match(
    proxySource,
    /GATE_SURFACE = ['"]\/dashboard\/scan['"]/,
    'the gate surface must be the gatekeeper allowlist',
  );
  assert.match(
    proxySource,
    /not-staff/,
    'the proxy must distinguish a staff refusal from an admin-only refusal',
  );
});

test('AA-5 the navigation is filtered by role', () => {
  assert.match(
    layoutSource,
    /navItems\.filter/,
    'the shell must filter the navigation instead of rendering every link',
  );
  assert.match(
    layoutSource,
    /\/dashboard\/scan/,
    'the gate surface must remain visible to a gatekeeper',
  );
});

test('AA-6 sign-in accepts a gatekeeper', () => {
  assert.match(
    loginSource,
    /isStaffUser/,
    'sign-in must accept either staff role',
  );
});

test('AA-7 the scan screen hides admin-only tools from a gatekeeper', () => {
  assert.match(scanSource, /useSession/, 'the scan screen must read the caller role');
  assert.match(scanSource, /canManage/, 'the role must gate the admin-only tools');
  assert.match(
    scanSource,
    /enabled:\s*canManage|canManage\s*\?\s*\{?\s*enabled/s,
    'the admin-only aggregate/demo queries must be disabled for a gatekeeper',
  );
});
