// C9 — the platform console, white-label binding and club onboarding.
//
// The platform surface spans three tiers that must agree on one vocabulary:
// the database (0054's `platform_admins` + `is_platform_admin()`), the Edge
// guards and the console UI all read the same claim, and every tier that
// touches a club slug validates it with the database's own pattern.
//
//   PC-1  the shared vocabulary has one source and tests cover it
//   PC-2  the deployed Edge copy is generated, never hand-edited
//   PC-3  the Edge guard requires a platform operator
//   PC-4  the console reads the claim through one helper
//   PC-5  the proxy gates the platform surface
//   PC-6  the console's platform page goes through one query module
//   PC-7  `bootstrap` binds a session to a club by slug
//   PC-8  `stripe-onboard` is platform-gated and test-mode only
//   PC-9  the mobile app binds through `bootstrap` with the built-in slug
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const PLATFORM = 'packages/shared/src/platform.ts';
const PLATFORM_TESTS = 'packages/shared/src/__tests__/platform.test.ts';
const DEPLOYED_PLATFORM = 'supabase/functions/_shared/platform.ts';
const EDGE_AUTH = 'supabase/functions/_shared/auth.ts';

test('PC-1 the platform vocabulary has one source and tests cover it', () => {
  const source = read(PLATFORM);
  assert.match(source, /export const PLATFORM_CLAIM_KEY/);
  assert.match(source, /export function isPlatformMetadata/);
  assert.match(source, /export const CLUB_SLUG_PATTERN/);
  assert.match(source, /export function isValidClubSlug/);
  assert.match(source, /export function planBootstrapClaim/);

  const tests = read(PLATFORM_TESTS);
  assert.match(tests, /refuses everything else/);
  assert.match(tests, /refuses a slug the database would refuse/);
  assert.match(tests, /refuses an id that is not a uuid/);
});

test('PC-2 the deployed Edge platform copy is generated, never hand-edited', async () => {
  const { generate } = await import('../../scripts/sync-edge-schemas.mjs');
  const source = read(PLATFORM);

  assert.equal(
    read(DEPLOYED_PLATFORM),
    generate(source, PLATFORM),
    `${DEPLOYED_PLATFORM} is stale — run: node scripts/sync-edge-schemas.mjs`,
  );
});

test('PC-3 the Edge guard requires a platform operator', () => {
  const auth = read(EDGE_AUTH);
  assert.match(
    auth,
    /export function isPlatformAdmin\(user: User\): boolean/,
    'the Edge tier reads the platform claim itself',
  );
  assert.match(
    auth,
    /export async function requirePlatformAdmin\(request: Request\)/,
    'the platform Edge surface is behind requirePlatformAdmin',
  );
  // The guard delegates to the shared predicate — not a private re-read of
  // `app_metadata`, which is how the claim key would drift.
  assert.match(
    auth,
    /isPlatformMetadata\(user\.app_metadata\)/,
    'isPlatformAdmin reads the claim through the shared vocabulary',
  );
  assert.match(
    auth,
    /if \(!isPlatformAdmin\(context\.user\)\)/,
    'requirePlatformAdmin refuses a caller the predicate refuses',
  );
});

test('PC-7 `bootstrap` binds a session to a club by slug', () => {
  const bootstrap = read('supabase/functions/bootstrap/index.ts');
  // Any signed-in user may bind their own session: the white-label app calls
  // this at sign-in with the slug it was built with (ADR-004 §1).
  assert.match(bootstrap, /await requireUser\(request\)/, 'bootstrap takes a signed-in user');
  // The slug is validated with the database's pattern before it is sent.
  assert.match(
    bootstrap,
    /isValidClubSlug\(body\.slug\)/,
    'the slug is validated with the shared pattern (0040)',
  );
  // The claim itself comes from the shared plan (D-29) — never a literal.
  assert.match(
    bootstrap,
    /planBootstrapClaim\(/,
    'the tenant claim is planned by the shared vocabulary',
  );
  // Only an active club binds, and the lookup names the miss.
  assert.match(bootstrap, /from\("tenants"\)/, 'the club is looked up in the registry');
  assert.match(bootstrap, /\.eq\("slug", body\.slug\)/, 'the lookup is by slug');
  assert.match(bootstrap, /\.eq\("status", "active"\)/, 'only an active club binds');
  assert.match(
    bootstrap,
    /new AppError\("not_found"/,
    'an unknown slug is a named 404, not a null crash',
  );
  // The claim is merged, never replaced: another tier's key (the platform
  // claim) must survive a sign-in — GAP-09.0 taught what a replace costs.
  assert.match(
    bootstrap,
    /app_metadata:\s*\{\s*\.\.\.context\.user\.app_metadata/,
    'the claim is merged into the existing app metadata',
  );
  // A user-scoped client cannot write app_metadata; the admin API can.
  assert.match(
    bootstrap,
    /auth\.admin\.updateUserById/,
    'the claim is written through the admin API',
  );
});

test('PC-8 `stripe-onboard` is platform-gated and test-mode only', () => {
  const onboard = read('supabase/functions/stripe-onboard/index.ts');
  // Cross-club money configuration is platform work, never club work
  // (ADR-004 §3): the guard is the platform one, not `requireAdmin`.
  assert.match(
    onboard,
    /await requirePlatformAdmin\(request\)/,
    'stripe-onboard is behind requirePlatformAdmin',
  );
  assert.doesNotMatch(
    onboard,
    /requireAdmin\(request\)/,
    'club staff authority must never satisfy the platform guard',
  );
  // The country decides Stripe's onboarding fields (D-08): an ISO code, or
  // nothing — a free-text country would reach Stripe unvalidated.
  assert.match(
    onboard,
    /country: z\.string\(\)\.regex/,
    'the country is validated as an ISO-3166 code',
  );
  // Only an active club onboards, and the miss is named.
  assert.match(onboard, /from\("tenants"\)/, 'the club row is read');
  assert.match(onboard, /\.eq\("status", "active"\)/, 'a suspended club does not onboard');
  // A tombstone (0052) is not a club: onboarding one would open a Stripe
  // account for a club that no longer exists.
  assert.match(onboard, /\.is\("erased_at", null\)/, 'an erased club does not onboard');
  assert.match(onboard, /new AppError\("not_found"/, 'an unknown club is a named 404');
  // The account is created once and recorded on the club row (ADR-003):
  // an already-onboarded club must not spawn a second account.
  assert.match(
    onboard,
    /club\.stripe_account_id \?\?/,
    'an existing connected account is reused, never replaced',
  );
  // A double-click must not create a second account: the create carries the
  // tenant as its Stripe idempotency key.
  assert.match(onboard, /idempotencyKey/, 'account creation is idempotent per tenant');
  assert.match(onboard, /stripe_account_id/, 'the account id is written to the club row');
  // The club completes onboarding through a Stripe-hosted link, with a way
  // back to the console on both exits.
  assert.match(onboard, /type: "account_onboarding"/, 'the link is an onboarding link');
  assert.match(onboard, /refresh_url/, 'the link can be refreshed');
  assert.match(onboard, /return_url/, 'the link returns to the console');
  // The action is audited, like every other platform write (0054).
  assert.match(onboard, /writeAudit\(/, 'the onboarding is audited');
  // D-08: the platform key is test-mode only — enforced by config, pinned
  // here because a live key in a dev environment is not recoverable.
  const config = read('supabase/functions/_shared/config.ts');
  assert.match(config, /sk_test_/, 'the Stripe key is test-mode only (D-08)');
});

test('PC-4 the console reads the platform claim through one helper', () => {
  const auth = read('apps/admin/src/lib/auth.ts');
  assert.match(
    auth,
    /export function isPlatformUser\(user: User \| null \| undefined\): boolean/,
    'lib/auth owns the console-side claim reader',
  );
  assert.match(
    auth,
    /isPlatformMetadata\(user\?\.app_metadata\)/,
    'the reader delegates to the shared vocabulary — never re-reads the key',
  );

  const session = read('apps/admin/src/lib/use-session.ts');
  assert.match(session, /isPlatform: boolean/, 'the session exposes the platform authority');
  assert.match(
    session,
    /isPlatform: isPlatformUser\(user\)/,
    'the session derives it from the same helper',
  );
});

test('PC-5 the proxy gates the platform surface', () => {
  const proxy = read('apps/admin/src/proxy.ts');
  assert.match(proxy, /const PLATFORM_SURFACE = ['"]\/dashboard\/platform['"]/,
    'the surface is named once');
  assert.match(
    proxy,
    /isPlatformMetadata\(/,
    'the proxy reads the shared claim, not a private key',
  );
  // The platform surface refuses anyone without the claim — a club account
  // included: the two surfaces never overlap (ADR-004 §3).
  assert.match(proxy, /not-platform/, 'a club account is turned away with a named error');
  // A gatekeeper's confinement rule must not swallow the platform surface.
  assert.match(
    proxy,
    /!isGateSurface\(pathname\)\s*&&\s*!onPlatformSurface/,
    'the gatekeeper rule exempts the platform surface',
  );
  // A platform-only operator belongs on their surface, not on login.
  assert.match(
    proxy,
    /\/dashboard\/platform/,
    'a platform-only operator is routed to the platform surface',
  );
});

test('PC-6 the platform page goes through one query module', () => {
  const queries = read('apps/admin/src/lib/queries/platform.ts');
  assert.match(queries, /rpc\("platform_tenants"\)/, 'the registry read is the RPC');
  assert.match(queries, /rpc\("set_tenant_status"/, 'suspend/restore is the RPC');
  assert.match(queries, /rpc\("set_application_fee_bps"/, 'the fee rate is the RPC');
  assert.match(queries, /rpc\("provision_tenant"/, 'provisioning is the RPC');
  assert.match(
    queries,
    /invokeFunction(<[^>]*>)?\("stripe-onboard"/,
    'onboarding goes through the Edge function',
  );

  const page = read('apps/admin/src/app/dashboard/platform/page.tsx');
  assert.match(page, /@\/lib\/queries\/platform/, 'the page uses the one query module');
  assert.match(page, /isPlatform/, 'the page refuses a session without the claim (client boundary)');

  const layout = read('apps/admin/src/app/dashboard/layout.tsx');
  assert.match(
    layout,
    /href: (PLATFORM_SURFACE|['"]\/dashboard\/platform['"])/,
    'the nav knows the surface',
  );
  assert.match(
    layout,
    /session\.isPlatform/,
    'the platform nav item is gated on the claim',
  );
});

test('PC-9 the mobile app binds through `bootstrap` with the built-in slug', () => {
  const auth = read('apps/mobile/src/lib/auth.ts');
  // The club a white-label build serves is build-time configuration
  // (ADR-004 §1): one binary, one slug, no club picker for a fan to get
  // wrong.
  assert.match(auth, /EXPO_PUBLIC_CLUB_SLUG/, 'the club slug is build-time configuration');
  // The binding is the Edge function, never a client claim write.
  assert.match(auth, /'bootstrap'/, 'the binding is the bootstrap function');
  assert.match(auth, /invokeFunction/, 'the binding goes through the typed Edge client');
  // The claim lives in the JWT: after a bind that changed it, the session
  // must be rotated or `current_tenant()` keeps reading the old token.
  assert.match(
    auth,
    /refreshSession\(\)/,
    'a changed claim rotates the session so the new token carries it',
  );
  // A failed binding is recorded, never swallowed silently.
  assert.match(auth, /log\.(warn|error)\(/, 'a failed binding is logged');

  const store = read('apps/mobile/src/lib/store.tsx');
  assert.match(
    store,
    /bindClubToSession/,
    'every session establishment binds — sign-in and restore alike',
  );
  assert.match(
    store,
    /event === ['"]SIGNED_IN['"]/,
    'a fresh sign-in binds (a token refresh does not re-bind)',
  );
});
