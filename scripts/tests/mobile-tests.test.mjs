// Phase C4 — F-14: the supporter app has a real unit-test harness.
//
// The mobile workspace used to run `echo ... && exit 0`, so `npm test` was
// green while proving nothing. That is worse than having no tests: CI cannot
// tell the difference between "all mobile behaviour is correct" and "no
// mobile behaviour was ever checked".
//
// The harness is only real if:
//
//   MT-1  `npm test` in the mobile workspace runs Jest, not an echo
//   MT-2  the jest-expo preset is configured (native modules are mocked)
//   MT-3  at least one test file exists, so the harness is never green empty
//   MT-4  the tests cannot reach a real Supabase project
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

/**
 * Finds the test files under a directory.
 * @param {string} directory repository-relative directory
 * @returns {string[]} repository-relative test files
 */
function findTests(directory) {
  const absolute = resolve(root, directory);
  if (!existsSync(absolute)) return [];

  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return findTests(relative);
    return /-test\.(ts|tsx)$/.test(entry.name) ? [relative] : [];
  });
}

test('MT-1 the mobile test script runs a real test runner', () => {
  const manifest = JSON.parse(read('apps/mobile/package.json'));

  assert.match(manifest.scripts.test, /\bjest\b/);
  assert.doesNotMatch(
    manifest.scripts.test,
    /\becho\b/,
    'the test script must not succeed with an echo',
  );
});

test('MT-2 the mobile workspace uses the jest-expo preset', () => {
  const manifest = JSON.parse(read('apps/mobile/package.json'));

  assert.equal(manifest.jest?.preset, 'jest-expo');
  assert.ok(
    Object.keys(manifest.devDependencies ?? {}).includes('jest-expo'),
    'jest-expo must be a declared dev dependency',
  );
});

test('MT-3 the mobile harness has at least one test file', () => {
  const tests = findTests('apps/mobile/src').filter((file) => file.includes('__tests__'));

  assert.ok(tests.length > 0, 'no mobile test file exists');
});

test('MT-4 the mobile tests cannot reach a real Supabase project', () => {
  const setup = read('apps/mobile/jest.setup.ts');

  // The client asserts its env at import time; the setup must supply values
  // that point at localhost, never at a hosted project.
  assert.match(setup, /EXPO_PUBLIC_SUPABASE_URL\s*=/);
  assert.match(setup, /127\.0\.0\.1|localhost/);
});

test('MT-5 CI runs the mobile unit tests', () => {
  const workflow = read('.github/workflows/ci.yml');

  assert.match(
    workflow,
    /npm run test --workspace @kickoff\/mobile/,
    'CI must run the mobile workspace tests, or the harness proves nothing on a pull request',
  );
});
