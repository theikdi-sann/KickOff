// Punch list #10 — push notifications through an EAS development build.
//
// Since SDK 53 remote push is gone from Expo Go, so the app can only obtain a
// push token inside a development/standalone build with an EAS project id.
// These contracts lock in the plumbing that makes that possible and — just as
// important — that the failure modes are explained to the maintainer instead
// of surfacing as an opaque library error:
//   1. EAS_PROJECT_ID flows from the env template into extra.eas.projectId,
//   2. an eas.json with a development (dev-client) profile exists,
//   3. expo-dev-client is a dependency of the mobile app,
//   4. the push path refuses to run inside Expo Go, with a build instruction,
//   5. the "no project id" case names EAS_PROJECT_ID explicitly (distinct from
//      the Expo Go and physical-device messages),
//   6. the Settings screen shows whichever reason push is unavailable,
//   7. the token is still registered with the existing `devices` endpoint
//      (no server change), and
//   8. the README documents the login → init → build dev-build flow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('PUSH-1 EAS_PROJECT_ID is wired into extra.eas.projectId and documented', () => {
  const config = read('apps/mobile/app.config.ts');
  const envExample = read('apps/mobile/.env.example');

  assert.match(
    config,
    /eas:\s*\{\s*projectId:\s*process\.env\.EAS_PROJECT_ID/,
    'the app config must expose the EAS project id under extra.eas.projectId',
  );
  assert.match(
    envExample,
    /^EAS_PROJECT_ID=/m,
    'the env template must document EAS_PROJECT_ID so a fresh clone knows push needs it',
  );
  assert.match(
    envExample,
    /EAS_PROJECT_ID[\s\S]{0,400}push|push[\s\S]{0,400}EAS_PROJECT_ID/is,
    'the env template must say the project id is what push tokens are fetched with',
  );
});

test('PUSH-2 eas.json defines a development build profile', () => {
  const eas = JSON.parse(read('apps/mobile/eas.json'));

  const development = eas?.build?.development;
  assert.ok(development, 'a development profile is required for the dev build');
  assert.equal(
    development.developmentClient,
    true,
    'the development profile must build a dev client (expo-dev-client)',
  );
  assert.equal(
    development.distribution,
    'internal',
    'a dev build is installed directly on devices, not submitted to a store',
  );
  assert.ok(
    eas?.build?.production,
    'a production profile must exist so the same config ships a release build',
  );
  assert.equal(
    eas?.build?.production?.developmentClient,
    undefined,
    'the production profile must never build a development client',
  );
  assert.ok(eas?.cli?.version, 'the cli.version pin keeps EAS builds reproducible');
});

test('PUSH-2b every internally distributed profile produces an installable artifact', () => {
  const eas = JSON.parse(read('apps/mobile/eas.json'));

  // `distribution: "internal"` shares a direct install URL, which only works
  // for a .apk (Android) / .ipa (iOS). A `.aab` cannot be installed that way.
  for (const [name, profile] of Object.entries(eas.build)) {
    if (profile?.distribution !== 'internal') continue;
    const apk = profile.android?.buildType === 'apk';
    const devClient = profile.developmentClient === true; // assembles :app:assembleDebug
    assert.ok(
      apk || devClient,
      `build profile "${name}" is internal but would produce a .aab that cannot be installed directly`,
    );
  }
});

test('PUSH-3 the mobile app depends on expo-dev-client', () => {
  const pkg = JSON.parse(read('apps/mobile/package.json'));

  assert.ok(
    pkg.dependencies?.['expo-dev-client'],
    'expo-dev-client is required: Expo Go cannot register push tokens since SDK 53',
  );
});

test('PUSH-4 the push path refuses to run inside Expo Go', () => {
  const source = read('apps/mobile/src/lib/notifications.ts');

  assert.match(
    source,
    /import\s*\{[^}]*isRunningInExpoGo[^}]*\}\s*from\s*['"]expo['"]/,
    'the Expo Go check must come from the runtime itself (expo.isRunningInExpoGo)',
  );
  assert.match(
    source,
    /isRunningInExpoGo\(\)/,
    'the push path must ask whether it is running in Expo Go',
  );

  const guard = source.search(/isRunningInExpoGo\(\)/);
  const permission = source.indexOf('requestPermissionsAsync');
  const token = source.indexOf('getExpoPushTokenAsync');
  assert.ok(guard >= 0 && (permission < 0 || guard < permission), 'guard before permissions');
  assert.ok(guard >= 0 && (token < 0 || guard < token), 'guard before token fetch');

  assert.match(
    source,
    /Expo Go[\s\S]{0,300}development build/i,
    'the Expo Go message must tell the maintainer to use a development build',
  );
});

test('PUSH-5 every push failure has its own actionable message', () => {
  const source = read('apps/mobile/src/lib/notifications.ts');

  assert.match(
    source,
    /EAS_PROJECT_ID/,
    'a missing project id must name EAS_PROJECT_ID so the fix is obvious',
  );

  // Single-line string literals only: `[^']` alone would stitch neighbouring
  // statements together and miss real duplicates.
  const messages = source.match(/'[^'\n]{20,220}'|"[^"\n]{20,220}"/g) ?? [];
  const expoGo = messages.filter((m) => /Expo Go/i.test(m));
  const project = messages.filter((m) => /EAS_PROJECT_ID/.test(m));
  const device = messages.filter((m) => /physical/i.test(m));

  assert.equal(expoGo.length, 1, 'exactly one Expo Go message');
  assert.equal(project.length, 1, 'exactly one EAS_PROJECT_ID message');
  assert.equal(device.length, 1, 'exactly one physical-device message');

  const [g, p, d] = [expoGo[0], project[0], device[0]];
  assert.notEqual(g, p, 'Expo Go and missing-project-id must be distinct errors');
  assert.notEqual(g, d, 'Expo Go and missing-device must be distinct errors');
  assert.notEqual(p, d, 'missing-project-id and missing-device must be distinct errors');
});

test('PUSH-6 the Settings screen explains why push is unavailable', () => {
  const source = read('apps/mobile/src/app/settings.tsx');
  const lib = read('apps/mobile/src/lib/notifications.ts');

  assert.match(
    lib,
    /export function pushUnavailableReason/,
    'the reason must be exported so the UI can show it',
  );
  const binding = source.match(/const\s+(\w+)\s*=\s*pushUnavailableReason\(\)/);
  assert.ok(
    binding,
    'the Settings screen must ask why push is unavailable instead of only checking the device',
  );
  assert.match(
    source,
    new RegExp(`\\{${binding[1]}\\}`),
    'the reason must be rendered as the hint under the switch',
  );
  assert.match(
    source,
    /disabled=\{\s*busy !== null \|\| unavailable !== null/,
    'the switch must be disabled for exactly the reasons push is unavailable',
  );
  // The copy lives in notifications.ts only — a second copy would drift.
  assert.doesNotMatch(
    source,
    /Push notifications need a physical/i,
    'Settings must not carry its own copy of the reason',
  );
});

test('PUSH-7 the token is registered with the existing devices endpoint', () => {
  const source = read('apps/mobile/src/lib/notifications.ts');

  assert.match(
    source,
    /api\.post\(\s*'devices'\s*,\s*\{\s*token\s*,\s*platform:/,
    'the Expo push token must still be posted to the devices endpoint with its platform',
  );
  assert.match(
    source,
    /api\.call\(\s*'devices'\s*,\s*\{\s*method:\s*'DELETE'/,
    'unregistration must keep using the same endpoint',
  );
  assert.doesNotMatch(
    source,
    /service_role|SERVICE_ROLE/,
    'the push module must never touch a privileged key',
  );
});

test('PUSH-8 the README documents the development-build flow', () => {
  const readme = read('README.md');

  for (const [pattern, why] of [
    [/\beas(?:-cli)?(?:@\S+)?\s+login\b/, 'the login step'],
    [/\beas(?:-cli)?(?:@\S+)?\s+init\b/, 'the project-linking step'],
    [/\beas(?:-cli)?(?:@\S+)?\s+build\s+--profile development/, 'the dev build command'],
    [/Expo Go[\s\S]{0,200}push|push[\s\S]{0,200}Expo Go/is, 'why Expo Go cannot receive push'],
    [/EAS_PROJECT_ID/, 'the env var the config reads'],
  ]) {
    assert.match(readme, pattern, `the README must document ${why}`);
  }
});
