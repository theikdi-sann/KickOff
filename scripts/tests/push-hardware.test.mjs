// C10.4 — push on hardware (GAP-06).
//
// The plumbing was already contract-tested by PUSH-1…PUSH-9: an `eas.json`
// development profile, `expo-dev-client`, three actionable refusal messages,
// and a README for the dev-build flow. What was never proven is the round
// trip on a real device — and this cycle found three silent gaps between the
// contract and a device that actually receives a push:
//
//   * `google-services.json` was downloaded but never referenced, so Expo's
//     config plugin never copied it, the Gradle plugin was never applied and
//     `FirebaseMessaging.getInstance()` would throw on first registration
//     ("Did you configure `googleServicesFile` path in app config?");
//   * `.env` is gitignored, so the EAS build server — which uploads the
//     project respecting `.gitignore` — evaluated `app.config.ts` without
//     `EAS_PROJECT_ID`, baking `extra.eas.projectId: undefined` into the APK;
//   * nothing recorded how the hardware proof is performed or what "green"
//     means, so the gap could only be closed by memory.
//
//   PUSH-HW-1  the Firebase config is wired, and the file it names exists
//   PUSH-HW-2  the Firebase project's package matches the app's package
//   PUSH-HW-3  the build server can see the EAS project id
//   PUSH-HW-4  the service-account private key can never be committed
//   PUSH-HW-5  the hardware procedure and its pass criteria are documented
//   PUSH-HW-6  google-services.json ships with the build (it is not a secret)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const APP_CONFIG = 'apps/mobile/app.config.ts';
const EAS = 'apps/mobile/eas.json';
const FIREBASE_CONFIG = 'apps/mobile/google-services.json';
const MOBILE_GITIGNORE = 'apps/mobile/.gitignore';
const RUNBOOK = 'docs/RUNBOOK.md';

test('PUSH-HW-1 the Firebase config is wired, and the file it names exists', () => {
  const config = read(APP_CONFIG);

  assert.match(
    config,
    /googleServicesFile:/,
    'android.googleServicesFile must point at google-services.json, or Expo never copies it and Firebase never initialises',
  );

  // The path may be overridden per club (ADR-004 white-label), so the default
  // is what must exist in the repository. `||`, not `??`: the template ships
  // an empty assignment, and an empty path is not a path.
  const wired = config.match(
    /googleServicesFile:\s*process\.env\.\w+\s*(\?\?|\|\|)\s*['"]([^'"]+)['"]/,
  );
  assert.ok(wired, 'the wiring must fall back to a committed default path');
  const defaultPath = wired[2].replace(/^\.\//, 'apps/mobile/');
  assert.ok(
    existsSync(resolve(root, defaultPath)),
    `${defaultPath} must exist — the config points at it`,
  );
});

test('PUSH-HW-2 the Firebase project package matches the app package', () => {
  const config = read(APP_CONFIG);
  const packageName = config.match(/package:\s*['"]([^'"]+)['"]/);
  assert.ok(packageName, 'app.config.ts must declare android.package');

  const firebase = JSON.parse(read(FIREBASE_CONFIG));
  const clients = firebase?.client ?? [];
  assert.ok(clients.length > 0, `${FIREBASE_CONFIG} must declare at least one client`);

  const packages = clients.map((client) => client?.client_info?.android_client_info?.package_name);
  assert.ok(
    packages.includes(packageName[1]),
    `google-services.json registers [${packages.join(', ')}] but the app builds ${packageName[1]} — Firebase returns PERMISSION_DENIED and no token is ever issued`,
  );
});

test('PUSH-HW-3 the build server can see the EAS project id', () => {
  const eas = JSON.parse(read(EAS));

  // `.env` is gitignored, and EAS uploads the project respecting `.gitignore`
  // — so a value that only exists in `.env` is absent on the build server.
  // The profile env is how the APK gets a project id at all.
  for (const profile of ['development', 'preview']) {
    const projectId = eas?.build?.[profile]?.env?.EAS_PROJECT_ID;
    assert.match(
      String(projectId ?? ''),
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      `build.${profile}.env.EAS_PROJECT_ID must carry the uuid — .env never reaches the build server`,
    );
  }
});

test('PUSH-HW-4 the service-account private key can never be committed', () => {
  const gitignore = read(MOBILE_GITIGNORE);

  assert.match(
    gitignore,
    /firebase-adminsdk/,
    'the FCM v1 service-account key is a real secret — it must be ignored, not committed',
  );

  // The key is not a build input: EAS stores it as a credential, so nothing in
  // the repository may reference it by path.
  const eas = read(EAS);
  assert.doesNotMatch(
    eas,
    /firebase-adminsdk/,
    'eas.json must never point at the downloaded key — upload it with `eas credentials`',
  );
});

test('PUSH-HW-5 the hardware procedure and its pass criteria are documented', () => {
  const runbook = read(RUNBOOK);
  const start = runbook.indexOf('## 11.');
  assert.ok(start !== -1, 'RUNBOOK must carry the hardware push procedure as §11');

  const section = runbook.slice(start);

  // The invocation spelling varies (`npx eas`, `npx eas-cli@latest eas`), so
  // the contract pins the profile and the subcommand, not the CLI prefix.
  assert.match(section, /build --profile development/, 'the build command is named');
  assert.match(section, /FCM V1/i, 'the server-side credential is named');
  assert.match(section, /expo\.dev\/notifications/, 'the delivery check is named');
  assert.match(section, /google-services\.json/, 'the client-side config is named');
  assert.match(
    section,
    /expo go/i,
    'the procedure must warn that Expo Go cannot receive the push',
  );
  assert.match(section, /green|pass/i, 'the procedure must say what success looks like');
});

test('PUSH-HW-6 google-services.json ships with the build', () => {
  const gitignore = read(MOBILE_GITIGNORE);

  // Expo's guidance is explicit: this file is required for the Android app to
  // register with FCM, and it holds public-facing identifiers only.
  assert.doesNotMatch(
    gitignore,
    /^google-services\.json$/m,
    'google-services.json is build input, not a secret — ignoring it would break every clone and every EAS build',
  );
});

// PUSH-HW-7 — the gap closes on evidence, not on the procedure existing.
//
// The run below is the one thing no gate in this repository can execute: a
// development build installed on physical hardware, a token registered against
// the hosted project, and a push delivered to the tray while the app was not
// running. The record is what lets REQUIREMENTS say `GAP-06` closed without
// asking anyone to trust a memory, and the screenshot is what "delivered"
// means when the count comes back from `exp.host`.
test('PUSH-HW-7 the hardware run is recorded, with its evidence', () => {
  const runbook = read(RUNBOOK);
  const start = runbook.indexOf('### 11.7');
  assert.ok(start !== -1, 'RUNBOOK §11.7 must record the device run that closed GAP-06');

  const record = runbook.slice(start);

  assert.match(record, /Xiaomi Pad 6/, 'the device model is recorded');
  assert.match(record, /Android 14/, 'the OS version is recorded');
  assert.match(
    record,
    /ExponentPushToken\[-u895ZPCd6/,
    'the token prefix is recorded — enough to prove a real token, not enough to push to the device',
  );
  assert.doesNotMatch(
    record,
    /ExponentPushToken\[[A-Za-z0-9_-]{18,}\]/,
    'the full push token is a live credential: record the prefix only',
  );
  assert.match(record, /docs\/evidence\/push-hardware-xiaomi-pad-6-2026-11-19\.jpg/);
  assert.match(
    record,
    /recents|swiped away|not running/i,
    'the record must say the app was not running when the notification arrived',
  );
  assert.ok(
    existsSync(resolve(root, 'docs/evidence/push-hardware-xiaomi-pad-6-2026-11-19.jpg')),
    'the tray screenshot is the evidence the record cites',
  );
});

test('PUSH-HW-8 the gap is reported as closed where the project tracks it', () => {
  const requirements = read('docs/REQUIREMENTS.md');
  const row = requirements.split('\n').find((line) => line.startsWith('| **GAP-06**'));

  assert.ok(row, 'REQUIREMENTS must keep the GAP-06 row');
  assert.match(row, /closed/i, 'GAP-06 closes on the recorded run');
  assert.doesNotMatch(row, /\*\*Still open:\*\*/, 'the row must no longer say the device run is pending');
  assert.match(row, /Xiaomi Pad 6/, 'the closing evidence is named in the row itself');
});

// PUSH-HW-9 — the hardware proof is one run; the guide is what an operator
// follows on the next project, the next club build, or the next incident.
// Every step that has silently bitten this project is named in it.
const PUSH_GUIDE = 'docs/PUSH.md';

test('PUSH-HW-9 the end-to-end push guide carries every step', () => {
  assert.ok(existsSync(resolve(root, PUSH_GUIDE)), `${PUSH_GUIDE} is the operator guide`);

  const guide = read(PUSH_GUIDE);

  for (const [pattern, step] of [
    [/Settings\s*→\s*Service accounts/i, 'the Firebase service-account key is created in the console'],
    [/Generate new private key/i, 'the key generation step is named'],
    [/credentials/, 'the EAS credential upload is named'],
    [/FCM V1/i, 'the FCM V1 credential type is named'],
    [/google-services\.json/, 'the client config file is named'],
    [/getExpoPushTokenAsync/, 'how the token is obtained is shown'],
    [/device_tokens/, 'where the token is stored is named'],
    [/app_secrets[\s\S]{0,120}reminders_secret/, 'the cron secret is read from app_settings/app_secrets'],
    [/exp\.host\/--\/api\/v2\/push\/send/, 'the send endpoint is shown'],
    [/exp\.host\/--\/api\/v2\/push\/getReceipts/, 'the receipt check is shown'],
    [/send-kickoff-reminders/, 'the real reminder path is shown'],
    [/SQL editor/i, 'the SQL steps say where to run them'],
  ]) {
    assert.match(guide, pattern, `the push guide must document ${step}`);
  }

  // It is a public document: a full token is a live credential.
  assert.doesNotMatch(
    guide,
    /ExponentPushToken\[[A-Za-z0-9_-]{18,}\]/,
    'never paste a full push token into the guide',
  );
});

test('PUSH-HW-10 the runbook links the guide instead of repeating it', () => {
  assert.match(read(RUNBOOK), /docs\/PUSH\.md/, 'RUNBOOK §11 must point at the full guide');
});


