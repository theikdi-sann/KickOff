// Phase C4 — dependency hygiene (GAP-07): the Expo SDK's own compatibility
// list is the contract, and CI is where it has to fail.
//
// `npx expo install --check` compares every installed `expo*` package against
// the versions the installed SDK expects. It found 18 drifted packages
// (patch bumps) — harmless once, invisible forever if nothing runs it.
//
//   DD-1  the mobile workspace declares the check as a script
//   DD-2  CI runs it on every push, so drift fails a build instead of
//         waiting for a device to misbehave
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('DD-1 the mobile workspace declares the Expo compatibility check', () => {
  const manifest = JSON.parse(read('apps/mobile/package.json'));

  assert.match(
    manifest.scripts?.['deps:check'] ?? '',
    /expo install --check/,
    'apps/mobile must expose `deps:check` so a developer and CI run the same command',
  );
});

test('DD-2 CI runs the Expo compatibility check', () => {
  const workflow = read('.github/workflows/ci.yml');

  assert.match(
    workflow,
    /deps:check --workspace @kickoff\/mobile/,
    'CI must run the Expo SDK compatibility check, or dependency drift ships silently',
  );
});
