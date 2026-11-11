// Phase B — punch list #7: README setup/run docs + ALLOWED_ORIGINS reminder.
//
// The setup/run flow (install → env → db → functions → run → LAN) landed
// across #1 and the original README; what remained was that the demo
// hosted project still carries ALLOWED_ORIGINS=http(s)://192.168.88.64:3000
// from the LAN walkthrough and nothing recorded the unset step. Locks in:
//   1. the Edge Functions section documents ALLOWED_ORIGINS and its
//      localhost fallback,
//   2. the unset reminder carries the exact CLI command,
//   3. the setup/run flow stays documented end to end.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const readme = readFileSync(resolve(root, 'README.md'), 'utf8');

test('DO-1 README documents ALLOWED_ORIGINS and its fallback', () => {
  assert.match(readme, /ALLOWED_ORIGINS/, 'the function secrets section must name the variable');
  assert.match(
    readme,
    /localhost:3000/,
    'the docs must state the fallback origins when the variable is unset',
  );
});

test('DO-2 README carries the unset reminder with the exact command', () => {
  assert.match(
    readme,
    /npx supabase secrets unset ALLOWED_ORIGINS/,
    'the reminder must show the exact CLI command',
  );
  assert.match(
    readme,
    /192\.168\.88\.64/,
    'the reminder must name the LAN value the demo project still carries',
  );
});

test('DO-3 the setup/run flow stays documented end to end', () => {
  for (const heading of [
    '### 1. Install',
    '### 2. Configure the environment',
    '### 3. Database',
    '### 4. Edge Functions',
    '### 5. Run',
    '#### Run on a phone over the LAN',
  ]) {
    assert.ok(readme.includes(heading), `README must keep the "${heading}" section`);
  }
  assert.match(readme, /npm run mobile:lan/, 'the LAN run command must stay documented');
});
