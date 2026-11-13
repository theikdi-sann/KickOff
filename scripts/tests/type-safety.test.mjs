// Phase C4 — F-15: the type-safety standard, enforced.
//
// `docs/ARCHITECTURE.md` §6.1 says: "**No non-null assertions** (`!`) outside
// generated types — narrow explicitly."
//
// The repository had 24 of them, spread over both apps, an Edge Function and
// an E2E spec. Most of them are the same shape — a React Query hook that is
// `enabled: Boolean(id)` and then asserts `id!` inside the fetcher:
//
//   .eq('id', id!)
//
// That is a lie told to the compiler: the query is skipped while the id is
// missing, so the assertion can never fail — but nothing says so, and the
// type is silently wrong the moment the guard changes.
//
// The fix is a named, tested narrowing helper (`requireDefined`) instead of an
// assertion, and a lint rule so the standard cannot regress.
//
//   TS-1  no non-null assertion survives in first-party source
//   TS-2  the narrowing helper exists and behaves
//   TS-3  both app lint configs forbid the assertion
//   TS-4  the base compiler options enable `noUncheckedIndexedAccess`, so an
//         index read is `T | undefined` and cannot be swallowed by an `!`
//   TS-5  no workspace opts back out of the flag
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

/** Source directories that hold first-party code. */
const SOURCE_ROOTS = ['apps', 'packages', 'supabase/functions'];

/** Files whose assertions are generated or deliberately exempt. */
const EXEMPT = ['packages/shared/src/database.types.ts'];

/**
 * Strips strings, template literals and comments so a `!` inside text is
 * never mistaken for an assertion.
 * @param {string} source
 * @returns {string}
 */
function stripLiterals(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

/**
 * Finds the non-null assertions in a source file.
 * @param {string} file repository-relative path
 * @returns {string[]} `file:line` markers
 */
function findAssertions(file) {
  const lines = read(file).split('\n');
  const found = [];
  lines.forEach((line, index) => {
    const code = stripLiterals(line);
    // `!` that follows an expression and is not `!=` / `!==`.
    if (/[A-Za-z_0-9$)\]]!(?!=)/.test(code)) {
      found.push(`${file}:${index + 1}: ${line.trim()}`);
    }
  });
  return found;
}

/**
 * The first-party source files of the repository.
 * @returns {string[]}
 */
function sourceFiles() {
  const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => SOURCE_ROOTS.some((prefix) => file.startsWith(prefix)))
    .filter((file) => !EXEMPT.includes(file));
  return files;
}

test('TS-1 no non-null assertion survives in first-party source', () => {
  const offenders = sourceFiles().flatMap(findAssertions);

  assert.deepEqual(
    offenders,
    [],
    `narrow explicitly instead of asserting:\n${offenders.join('\n')}`,
  );
});

test('TS-2 the narrowing helper exists and behaves', async () => {
  const { requireDefined } = await import('../../packages/shared/src/require.ts');

  assert.equal(requireDefined('value', 'ticket id'), 'value');
  assert.throws(() => requireDefined(undefined, 'ticket id'), /ticket id/);
  assert.throws(() => requireDefined(null, 'ticket id'), /ticket id/);
  assert.throws(() => requireDefined('', 'ticket id'), /ticket id/);
});

test('TS-3 both app lint configs forbid the assertion', () => {
  for (const config of ['apps/admin/eslint.config.mjs', 'apps/mobile/eslint.config.js']) {
    assert.match(
      read(config),
      /no-non-null-assertion/,
      `${config} must forbid the non-null assertion`,
    );
  }
});

test('TS-4 the base compiler options enable noUncheckedIndexedAccess', () => {
  const base = JSON.parse(read('tsconfig.base.json'));

  assert.equal(
    base.compilerOptions?.noUncheckedIndexedAccess,
    true,
    'tsconfig.base.json must enable noUncheckedIndexedAccess — an indexed read may be undefined',
  );
});

test('TS-5 no workspace opts back out of the flag', () => {
  const configs = [
    'apps/admin/tsconfig.json',
    'apps/mobile/tsconfig.json',
    'packages/shared/tsconfig.json',
  ];

  for (const config of configs) {
    const parsed = JSON.parse(read(config));
    assert.notEqual(
      parsed.compilerOptions?.noUncheckedIndexedAccess,
      false,
      `${config} must not disable noUncheckedIndexedAccess`,
    );
    assert.match(
      parsed.extends ?? '',
      /tsconfig\.base\.json/,
      `${config} must extend the base compiler options`,
    );
  }
});
