// Phase 11 — remaining quality & polish tasks.
//
// Source-level contract tests (same pattern as ci.test.mjs / ui.test.mjs):
// apps/mobile has no component runner, the Maestro CLI is not installed here,
// and Playwright E2E needs a live server — so each artifact is asserted at the
// source level first, with real runners used where they exist (vitest for
// shared, deno test for Edge Functions, playwright --list for e2e specs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('P11-04 playwright.config.ts provides a webServer and baseURL', () => {
  const source = read('apps/admin/playwright.config.ts');

  assert.match(source, /webServer:/, 'playwright.config.ts must define a webServer');
  assert.match(source, /baseURL/, 'playwright.config.ts must define a baseURL');
  assert.match(source, /testDir:\s*["']\.\/e2e["']/, 'testDir must point at ./e2e');
});

test('P11-21 docs/SECURITY.md documents RLS, secrets and payment hardening', () => {
  const source = read('docs/SECURITY.md');

  assert.match(source, /RLS/i, 'must explain the row-level security model');
  for (const table of ['orders', 'tickets', 'scan_events', 'audit_logs', 'seat_holds']) {
    assert.match(source, new RegExp(table), `must cover the ${table} table`);
  }
  assert.match(source, /SERVICE_ROLE_KEY|service role/i, 'must state where the service role may live');
  assert.match(source, /TICKET_HMAC_KEY/, 'must document QR signing');
  assert.match(source, /METRICS_TOKEN/, 'must document the metrics token');
  assert.match(source, /stripe-signature|webhook signature/i, 'must document webhook verification');
  assert.match(source, /rate limit/i, 'must document throttling');
  assert.match(source, /test.mode|sk_test_/i, 'must restate the Stripe test-mode guard');
});

test('P11-22 docs/TESTING.md lists every test layer', () => {
  const source = read('docs/TESTING.md');

  for (const command of [
    'npm test',
    'scripts/run-pgtap.sh',
    'deno test',
    'npm run test:e2e',
    'maestro test',
    'npm run functions:check',
    'node scripts/mvp-gate.mjs',
  ]) {
    assert.ok(source.includes(command), `TESTING.md must document \`${command}\``);
  }
});

test('P11-25 settings confirms destructive actions and explains the audit trail', () => {
  const source = read('apps/mobile/src/app/settings.tsx');

  assert.match(source, /Alert\.alert\(\s*['"]Sign out\?['"]/, 'signing out needs a confirmation');
  assert.match(source, /Alert\.alert\(\s*['"]Delete account\?['"]/, 'deleting the account needs a confirmation');
  assert.match(source, /style: ['"]destructive['"]/, 'destructive buttons must be marked as such');
  assert.match(source, /audit/i, 'the copy must explain that deletion is recorded for audit');
  assert.match(source, /cannot be undone/i, 'the copy must state the deletion is irreversible');
});

test('P11-24 scan page announces results and labels its controls', () => {
  const source = read('apps/admin/src/app/dashboard/scan/page.tsx');

  assert.match(source, /aria-live=/, 'the result panel must be announced to screen readers');
  assert.match(source, /role=\{result\.ok \? ["']status["'] : ["']alert["']\}/, 'valid and invalid scans need distinct live-region roles');
  assert.match(source, /htmlFor="gate-manual-payload"/, 'the manual payload label must be associated');
  assert.match(source, /id="gate-manual-payload"/, 'the textarea needs the matching id');
  assert.match(source, /aria-label="Validation gate"/, 'the gate picker needs an accessible name');
  assert.match(source, /resultRef\.current\?\.focus\(\)/, 'focus must move to the result after a scan');
  assert.match(source, /tabIndex=\{-1\}/, 'the result container must be programmatically focusable');
  assert.match(source, /role="img"/, 'the demo QR must expose an image role');
});

test('P11-20 dashboard page is a server boundary that forces dynamic rendering', () => {
  const page = read('apps/admin/src/app/dashboard/page.tsx');
  const view = read('apps/admin/src/app/dashboard/overview.tsx');

  assert.doesNotMatch(page, /^["']use client["'];/m, 'the route segment cannot be a client component');
  assert.match(page, /export const dynamic = ["']force-dynamic["']/, 'must force dynamic rendering');
  assert.match(page, /from ["']\.\/overview["']/, 'must render the client overview view');
  assert.match(view, /^["']use client["'];/m, 'the interactive overview stays a client component');
});

test('P11-19 admin layout expands metadata and viewport without touching <html className>', () => {
  const source = read('apps/admin/src/app/layout.tsx');

  assert.match(source, /openGraph:/, 'must publish Open Graph metadata');
  assert.match(source, /robots:\s*{[^}]*index:\s*false/s, 'the admin must stay out of search indexes');
  assert.match(source, /icons:/, 'must declare the favicon');
  assert.match(source, /import type \{ Metadata, Viewport \}|Viewport/, 'must type the viewport export');
  assert.match(source, /export const viewport/, 'Next 16 reads themeColor from the viewport export');
  assert.match(source, /themeColor:/, 'must set the browser theme colour');
  assert.match(
    source,
    /className=\{`\$\{inter\.variable\} \$\{barlow\.variable\} h-full`\}/,
    'the <html> class list (fonts) must remain byte-identical',
  );
});

test('P11-18 metrics function guards x-metrics-token and reports ops counts', () => {
  const source = read('supabase/functions/metrics/index.ts');

  assert.match(source, /x-metrics-token/, 'must read the shared metrics header');
  assert.match(source, /METRICS_TOKEN/, 'must compare against the configured token');
  assert.match(source, /metricsTokenMatches/, 'must use the constant-time comparison helper');
  assert.match(source, /serviceClient\(\)/, 'must read counts with the service role');
  assert.match(source, /from\(["']orders["']\)/, 'must report order counts');
  assert.match(source, /from\(["']scan_events["']\)/, 'must report scan counts');
  assert.match(source, /from\(["']seat_holds["']\)/, 'must report hold contention');
  assert.match(source, /failedScans/, 'must report failed scans');
  assert.match(source, /serveJson\(handler, \["GET"\]\)/, 'must be a GET endpoint');

  const config = read('supabase/config.toml');
  assert.match(
    config,
    /\[functions\.metrics\][\s\S]*?verify_jwt = false/,
    'the platform JWT gate must stand aside; metrics authenticates with x-metrics-token',
  );
});

test('P11-16 mobile analytics is a PostHog adapter with a dev no-op', () => {
  const source = read('apps/mobile/src/lib/analytics.ts');

  assert.match(source, /from ['"]posthog-react-native['"]/, 'must use the React Native SDK');
  assert.match(source, /EXPO_PUBLIC_POSTHOG_KEY/, 'must read the public project token');
  assert.match(source, /__DEV__/, 'dev builds must be detected');
  assert.match(source, /new PostHog\(/, 'must construct the client lazily');
  assert.match(source, /export function track/, 'must expose track()');
  assert.match(source, /export function identify/, 'must expose identify()');
  assert.match(source, /export function reset/, 'must expose reset()');
  assert.match(source, /if \(!analyticsEnabled\) return/, 'tracking must short-circuit when disabled');
});

test('P11-17 admin analytics is a PostHog client guarded for SSR', () => {
  const source = read('apps/admin/src/lib/analytics.ts');

  assert.match(source, /from ["']posthog-js["']/, 'must use the browser SDK');
  assert.match(source, /NEXT_PUBLIC_POSTHOG_KEY/, 'must read the public project token');
  assert.match(source, /typeof window/, 'must not initialise during SSR');
  assert.match(source, /posthog\.init\(/, 'must initialise the browser client');
  assert.match(source, /export function track/, 'must expose track()');
  assert.match(source, /export function identify/, 'must expose identify()');
  assert.match(source, /export function reset/, 'must expose reset()');
});

test('P11-23 tab bar adapts to font scale and safe-area insets', () => {
  const source = read('apps/mobile/src/app/(tabs)/_layout.tsx');

  assert.match(source, /useSafeAreaInsets/, 'the tab bar must read the safe-area insets');
  assert.match(source, /insets\.bottom/, 'the bottom inset must drive the bar padding');
  assert.match(source, /useWindowDimensions/, 'the bar must react to the font scale');
  assert.match(source, /fontScale/, 'dynamic type must grow the bar instead of clipping labels');
  assert.match(source, /tabBarStyle: \[/, 'the dynamic height must merge with the base bar style');
});

test('P11-14 tab bar exposes labels, test ids and 44pt+ targets', () => {
  const source = read('apps/mobile/src/app/(tabs)/_layout.tsx');

  for (const label of ['Home', 'Tickets', 'Profile']) {
    assert.match(
      source,
      new RegExp(`tabBarAccessibilityLabel: '[^']*${label}[^']*'`),
      `${label} needs an explicit tab accessibility label`,
    );
    assert.match(source, new RegExp(`tabBarButtonTestID: '[^']+${label.toLowerCase()}[^']*'`), `${label} needs a stable test id`);
  }
  assert.match(source, /minHeight: 48/, 'tab items must be at least 48pt tall');
  assert.match(source, /minWidth: 48/, 'tab items must be at least 48pt wide');
});

test('P11-06 maestro flow covers buy → checkout → QR pass', () => {
  const source = read('maestro/flows/buy-ticket.yaml');

  assert.match(source, /^appId:\s*\S+/m, 'the flow must name the app under test');
  assert.match(source, /launchApp/, 'the flow must launch the app');
  assert.match(source, /Get tickets/, 'the flow must open a fixture');
  assert.match(source, /Continue/, 'the flow must hold seats and continue');
  assert.match(source, /Checkout/, 'the flow must reach checkout');
  assert.match(source, /My tickets/, 'the flow must open the pass wallet');
  assert.match(source, /Refresh signed QR code/, 'the flow must assert the signed QR is rendered');
});

test('P11-05 ops.spec.ts walks login → match → scan demo → CSV → refund', () => {
  const source = read('apps/admin/e2e/ops.spec.ts');

  // Each stage of the operations walkthrough must appear as a real step.
  for (const [label, pattern] of [
    ['login', /getByLabel\(["']Email address["']\)/],
    ['create match', /New fixture/],
    ['scan demo', /Test pass|scan demo|Demo pass/i],
    ['export CSV', /Export CSV/],
    ['refund', /refund/i],
  ]) {
    assert.match(source, pattern, `ops.spec.ts must cover the ${label} step`);
  }
});
