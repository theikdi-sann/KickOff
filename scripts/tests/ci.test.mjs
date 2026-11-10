// P11-13 — the mock-deletion gate must be enforced by CI.
//
// DoD: CI fails if a mock import returns. This asserts both halves:
//   1. .github/workflows/ci.yml actually invokes `npm run check:no-mocks`.
//   2. The script itself is not a no-op — it exits non-zero on a mock reference.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');

test('P11-13 CI runs the no-mocks gate', () => {
  assert.match(
    workflow,
    /npm run check:no-mocks/,
    '.github/workflows/ci.yml must run `npm run check:no-mocks` so a returning mock import fails CI',
  );
});

test('P11-13 the no-mocks gate actually fails on a mock reference', () => {
  const probe = resolve(root, 'apps/mobile/src/__ci_no_mocks_probe__.ts');
  writeFileSync(probe, "import { mockMatches } from '@kickoff/shared';\n");
  try {
    assert.throws(
      () => execFileSync('bash', ['scripts/check-no-mocks.sh'], { cwd: root, stdio: 'pipe' }),
      'check-no-mocks.sh must exit non-zero while a mock symbol is referenced',
    );
  } finally {
    if (existsSync(probe)) rmSync(probe);
  }
});
