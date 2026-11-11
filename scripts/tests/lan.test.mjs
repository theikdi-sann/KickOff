// Phase B — punch list #1: LAN dev for phones (mobile:lan + ufw docs).
//
// The admin half landed in 6651921 (allowedDevOrigins + certificates
// gitignore). This locks in the mobile half and the firewall docs the
// walkthrough needed:
//   1. a `mobile:lan` script that starts Expo bound to the LAN,
//   2. README documents running it,
//   3. README documents the ufw ports (8081 Metro for the phone,
//      3000 admin dev for gate-scanner tablets).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const readJson = (path) => JSON.parse(read(path));

test('LAN-1 mobile:lan starts Expo bound to the LAN', () => {
  const rootPkg = readJson('package.json');
  const mobilePkg = readJson('apps/mobile/package.json');

  assert.ok(rootPkg.scripts['mobile:lan'], 'root must expose a mobile:lan script');
  assert.match(
    rootPkg.scripts['mobile:lan'],
    /--workspace @kickoff\/mobile/,
    'mobile:lan must run in the mobile workspace',
  );
  assert.ok(mobilePkg.scripts['start:lan'], 'apps/mobile must expose start:lan');
  assert.match(
    mobilePkg.scripts['start:lan'],
    /expo start --lan/,
    'start:lan must bind the Expo dev server to the LAN (not localhost/tunnel)',
  );
});

test('LAN-2 README documents the LAN dev workflow', () => {
  const readme = read('README.md');

  assert.match(readme, /npm run mobile:lan/, 'README must show the mobile:lan command');
  assert.match(
    readme,
    /Expo Go/,
    'README must say how a phone connects (Expo Go on the same Wi-Fi)',
  );
});

test('LAN-3 README documents the ufw ports for LAN dev', () => {
  const readme = read('README.md');

  assert.match(
    readme,
    /ufw allow 8081\/tcp/,
    'README must document opening 8081 (Metro bundler) for phones',
  );
  assert.match(
    readme,
    /ufw allow 3000\/tcp/,
    'README must document opening 3000 (admin dev over LAN HTTPS) for tablets',
  );
});
