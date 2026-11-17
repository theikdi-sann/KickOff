// C8.2d — the apps learn the club's display config.
//
// `tenants` has carried `currency`/`locale` since 0040 and `timezone` since
// 0053, but the apps still rendered with platform constants: prices through
// `formatTHB` (hardcoded THB) and kickoffs in Asia/Bangkok. The rule this
// contract pins: money renders in the club's currency, times in the club's
// time zone, from one shared mapping (`displayFromTenant`) — the snapshotted
// order/receipt currency stays the exception (an order's price never changes
// with the club's settings).
//
//   DC-1  the shared mapping exists and its tests cover the validation
//   DC-2  both apps read the tenants row through one hook
//   DC-3  no formatTHB call remains in the apps — every price carries the
//         club currency
//   DC-4  every app file that formats a date uses the display hook
//   DC-5  the greeting follows the club clock — no bangkokGreeting remains
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

/** Every app source file (excluding build output). */
function appSources(app) {
  const base = resolve(root, 'apps', app, 'src');
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
  };
  walk(base);
  return out;
}

const DATE_FORMATTERS = [
  'formatMatchDate(',
  'formatMatchTime(',
  'formatShortDate(',
  'formatFullDate(',
  'formatMatchDateTimeRange(',
];

test('DC-1 the shared mapping exists and its tests cover the validation', () => {
  const source = read('packages/shared/src/display.ts');
  assert.match(source, /export function displayFromTenant/);
  assert.match(source, /export const PLATFORM_DISPLAY/);

  const tests = read('packages/shared/src/__tests__/display.test.ts');
  assert.match(tests, /rejects a malformed currency code/);
  assert.match(tests, /rejects a time zone/);
  assert.match(tests, /rejects an empty locale/);
});

test('DC-2 both apps read the tenants row through one hook', () => {
  for (const app of ['mobile', 'admin']) {
    const files = appSources(app);
    const hook = files
      .map((f) => read(f))
      .filter((s) => /useTenantDisplay/.test(s));
    assert.ok(hook.length > 0, `${app} must expose useTenantDisplay`);

    const query = hook.find((s) => /from\(["']tenants["']\)/.test(s));
    assert.ok(query, `${app}'s useTenantDisplay must read the tenants row`);
    assert.match(
      query,
      /currency/,
      `${app}'s useTenantDisplay must select the currency`,
    );
    assert.match(
      query,
      /timezone/,
      `${app}'s useTenantDisplay must select the timezone`,
    );
    // One owner of the mapping: through the shared helper, never re-derived.
    const mapping = files.map((f) => read(f)).filter((s) => /displayFromTenant/.test(s));
    assert.ok(
      mapping.length > 0,
      `${app} must map the row through displayFromTenant — not pick fields itself`,
    );
  }
});

test('DC-3 no formatTHB call remains in the apps', () => {
  for (const app of ['mobile', 'admin']) {
    for (const file of appSources(app)) {
      assert.ok(
        !read(file).includes('formatTHB('),
        `${file} formats with the platform currency — use the club currency`,
      );
    }
  }
});

test('DC-4 every app file that formats a date uses the display hook', () => {
  for (const app of ['mobile', 'admin']) {
    for (const file of appSources(app)) {
      const source = read(file);
      const formatsDate = DATE_FORMATTERS.some((fn) => source.includes(fn));
      if (!formatsDate) continue;
      assert.match(
        source,
        /useTenantDisplay/,
        `${file} formats dates — it must take the club time zone from useTenantDisplay`,
      );
    }
  }
});

test('DC-5 the greeting follows the club clock', () => {
  for (const app of ['mobile', 'admin']) {
    for (const file of appSources(app)) {
      assert.ok(
        !read(file).includes('bangkokGreeting'),
        `${file} still greets by Bangkok — the club's clock is the club's`,
      );
    }
  }
  const shared = read('packages/shared/src/greeting.ts');
  assert.match(shared, /export function clubGreeting\(date: Date, timezone: string/);
  assert.doesNotMatch(shared, /bangkokGreeting/);
});

test('DC-6 the deployed Edge display copy is generated, never hand-edited', async () => {
  // The receipt's timezone fallback must be the same default the apps use —
  // a second literal would be the drift D-14 exists to prevent.
  const { generate } = await import('../../scripts/sync-edge-schemas.mjs');
  const source = read('packages/shared/src/display.ts');
  const deployed = read('supabase/functions/_shared/display.ts');

  assert.equal(
    deployed,
    generate(source, 'packages/shared/src/display.ts'),
    'supabase/functions/_shared/display.ts is stale — run: node scripts/sync-edge-schemas.mjs',
  );
  // The copy's one relative import resolves to the generated money copy
  // (with the `.ts` extension Deno requires).
  assert.match(deployed, /from '\.\/money(\.ts)?';/);
});
