// P11-13 — the mock-deletion gate must be enforced by CI.
//
// DoD: CI fails if a mock import returns. This asserts both halves:
//   1. .github/workflows/ci.yml actually invokes `npm run check:no-mocks`.
//   2. The script itself is not a no-op — it exits non-zero on a mock reference.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

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
  // The probe lives in a temporary directory, never in the source tree: a
  // test that writes into `apps/*/src` races every other test that reads it.
  const probeDir = mkdtempSync(join(tmpdir(), 'kickoff-no-mocks-'));
  const probe = join(probeDir, 'mock-probe.ts');
  writeFileSync(probe, "import { mockMatches } from '@kickoff/shared';\n");
  try {
    assert.throws(
      () =>
        execFileSync('bash', ['scripts/check-no-mocks.sh'], {
          cwd: root,
          stdio: 'pipe',
          env: { ...process.env, CHECK_NO_MOCKS_EXTRA_DIR: probeDir },
        }),
      'check-no-mocks.sh must exit non-zero while a mock symbol is referenced',
    );
  } finally {
    rmSync(probeDir, { recursive: true, force: true });
  }
});
