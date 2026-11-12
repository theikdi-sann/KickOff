// Phase C4 — the bugs the repository-wide sweep found.
//
// The file-index sweep (Phase C4) read the layers the flow audit never
// touched. Six real defects came out of it:
//
//   SW-1  the health probe is unauthenticated and its readiness path called
//         the live Stripe API — anyone could spend the account's API budget
//         and hit the rate limit that checkout depends on,
//   SW-2  the supporter app's analytics module had no importer at all — a
//         whole module, a dependency and two documented env variables for a
//         feature that never ran,
//   SW-3  five unreferenced Next.js template SVGs and Expo's template
//         licence were still in the repository,
//   SW-4  the admin env template did not document `ADMIN_APP_URL`, which the
//         admin layout reads — a silent fallback to localhost,
//   SW-5  the gate scanner treated *every* TypeError as a network failure, so
//         a programming bug was reported to the operator as "saved offline",
//   SW-6  the order search interpolated a user-supplied term into a
//         PostgREST `or` filter with only partial sanitising.
//
// These contracts keep the fixes in place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const exists = (path) => existsSync(resolve(root, path));

test('SW-1 the unauthenticated probe never calls Stripe', () => {
  const health = read('supabase/functions/health/index.ts');

  // The deep checks (Stripe) must be behind the metrics token.
  assert.match(
    health,
    /probeDepth|metricsTokenMatches/,
    'the probe must decide its depth from the metrics token',
  );
  assert.match(
    health,
    /checkStripe\(/,
    'the Stripe check must still exist for an authorised caller',
  );

  // Every call site of the Stripe check must be guarded by the depth check.
  const callSites = [...health.matchAll(/await checkStripe\(\)/g)].map((match) => match.index);
  assert.ok(callSites.length > 0, 'the Stripe check must still be called somewhere');
  for (const index of callSites) {
    const guard = health.slice(Math.max(0, index - 600), index);
    assert.match(
      guard,
      /depth === "deep"/,
      'the Stripe check must only run for a deep (token-authenticated) probe',
    );
  }
});

test('SW-2 the dead supporter analytics module is gone', () => {
  assert.equal(
    exists('apps/mobile/src/lib/analytics.ts'),
    false,
    'the module had no importer — it must not come back',
  );

  const envTemplate = read('apps/mobile/.env.example');
  assert.doesNotMatch(
    envTemplate,
    /POSTHOG/,
    'the mobile env template must not document a feature that does not exist',
  );
});

test('SW-3 no unreferenced template assets remain', () => {
  for (const asset of ['file.svg', 'globe.svg', 'next.svg', 'vercel.svg', 'window.svg']) {
    assert.equal(
      exists(`apps/admin/public/${asset}`),
      false,
      `apps/admin/public/${asset} is an unreferenced template asset`,
    );
  }

  assert.equal(
    exists('apps/mobile/LICENSE'),
    false,
    "Expo's template licence does not belong in a private commercial app",
  );

  // Every remaining asset must be referenced by the app that ships it.
  const references = [
    read('apps/mobile/app.config.ts'),
    ...readdirSync(resolve(root, 'apps/mobile/src'), { recursive: true })
      .filter((entry) => typeof entry === 'string' && /\.(ts|tsx)$/.test(entry))
      .map((entry) => read(join('apps/mobile/src', entry))),
  ].join('\n');

  for (const asset of readdirSync(resolve(root, 'apps/mobile/assets/images'))) {
    assert.match(
      references,
      new RegExp(asset.replace(/\./g, '\\.')),
      `apps/mobile/assets/images/${asset} is never referenced`,
    );
  }
});

test('SW-4 the env templates document every variable the apps read', () => {
  const adminTemplate = read('apps/admin/.env.local.example');
  const adminSources = [
    'apps/admin/src/app/layout.tsx',
    'apps/admin/src/lib/supabase/client.ts',
    'apps/admin/src/lib/analytics.ts',
  ]
    .map((file) => read(file))
    .join('\n');

  const used = new Set(
    [...adminSources.matchAll(/process\.env\.([A-Z_0-9]+)/g)].map((match) => match[1]),
  );
  for (const variable of used) {
    assert.match(
      adminTemplate,
      new RegExp(variable),
      `the admin env template must document ${variable}`,
    );
  }
});

test('SW-5 a programming error is not reported as a network failure', () => {
  const scanApi = read('apps/admin/src/lib/scan-api.ts');

  assert.doesNotMatch(
    scanApi,
    /name === "TypeError"/,
    'every TypeError is a network failure — a bug would be queued as "offline"',
  );
  assert.match(
    scanApi,
    /failed to fetch|networkerror|load failed/i,
    'the network check must look at the actual failure',
  );
});

test('SW-6 the order search cannot inject a PostgREST filter', () => {
  const orders = read('apps/admin/src/lib/queries/orders.ts');
  const search = read('apps/admin/src/lib/search.ts');

  assert.match(
    orders,
    /sanitizeSearchTerm/,
    'the search term must be sanitised by a named helper',
  );
  assert.match(
    orders,
    /\.or\(`id\.ilike\.%\$\{term\}%/,
    'the filter must use the sanitised term',
  );

  // The helper must strip every PostgREST filter metacharacter.
  const characterClass = search.match(/const [A-Z_]*METACHARACTERS[^=]*=\s*(?:\/)?(\[[^\]]*\])/);
  assert.ok(characterClass, 'sanitizeSearchTerm must declare the characters it strips');
  for (const character of ['%', ',', '(', ')', '*', ':', '"', "'"]) {
    assert.ok(
      characterClass[1].includes(character),
      `sanitizeSearchTerm must strip "${character}"`,
    );
  }
});
