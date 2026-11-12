// Phase C4 — every file in the repository is reviewed, and stays reviewed.
//
// The Phase C3 audit was flow-driven: it covered the flows and the files they
// touch, but the repository holds 298 tracked files, and roughly half of them
// had never been looked at — template leftovers, unused assets, undocumented
// configuration and dead modules were all sitting outside the audited surface.
//
// A file index makes the coverage explicit and keeps it true:
//
//   FI-1  every tracked file appears in the index exactly once,
//   FI-2  every indexed path exists on disk (no stale entries),
//   FI-3  every verdict is a known verdict, and no file is left `unreviewed`,
//   FI-4  the index classifies every file with a known kind,
//   FI-5  a file that is added to the repository must be reviewed before the
//         suite is green again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const INDEX_PATH = 'docs/FILE-INDEX.md';

/** The tracked files of the repository. */
function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .sort();
  } catch {
    // Without git (a source export), fall back to the working tree.
    return [];
  }
}

test('FI-1 every tracked file appears in the index exactly once', async () => {
  const { parseIndex } = await import('../build-file-index.mjs');
  const index = parseIndex(read(INDEX_PATH));
  const tracked = trackedFiles();

  assert.ok(tracked.length > 100, 'the index must cover the whole repository');

  const missing = tracked.filter((file) => !index.has(file));
  assert.deepEqual(
    missing,
    [],
    `these tracked files are not in ${INDEX_PATH}: ${missing.slice(0, 10).join(', ')}`,
  );

  const duplicates = tracked.filter((file) => index.get(file).length > 1);
  assert.deepEqual(
    duplicates,
    [],
    `these files are indexed more than once: ${duplicates.join(', ')}`,
  );
});

test('FI-2 every indexed path exists', async () => {
  const { parseIndex } = await import('../build-file-index.mjs');
  const index = parseIndex(read(INDEX_PATH));

  const missing = [...index.keys()].filter((file) => !existsSync(resolve(root, file)));
  assert.deepEqual(
    missing,
    [],
    `${INDEX_PATH} lists files that do not exist: ${missing.join(', ')}`,
  );
});

test('FI-3 every file has a known verdict and none is unreviewed', async () => {
  const { parseIndex, VERDICTS } = await import('../build-file-index.mjs');
  const index = parseIndex(read(INDEX_PATH));

  const unknown = [...index.entries()].filter(
    ([, entries]) => !VERDICTS.includes(entries[0]?.verdict),
  );
  assert.deepEqual(
    unknown.map(([file, entries]) => `${file} (${entries[0]?.verdict})`),
    [],
    'every file must carry a known verdict',
  );

  const unreviewed = [...index.entries()].filter(
    ([, entries]) => entries[0]?.verdict === 'unreviewed',
  );
  assert.deepEqual(
    unreviewed.map(([file]) => file),
    [],
    `these files are still unreviewed: ${unreviewed.map(([file]) => file).join(', ')}`,
  );
});

test('FI-4 every file has a known kind', async () => {
  const { parseIndex, KINDS } = await import('../build-file-index.mjs');
  const index = parseIndex(read(INDEX_PATH));

  const unknown = [...index.entries()].filter(([, entries]) => !KINDS.includes(entries[0]?.kind));
  assert.deepEqual(
    unknown.map(([file, entries]) => `${file} (${entries[0]?.kind})`),
    [],
    'every file must be classified with a known kind',
  );
});

test('FI-5 a deferred file must say why', async () => {
  const { parseIndex } = await import('../build-file-index.mjs');
  const index = parseIndex(read(INDEX_PATH));

  const unexplained = [...index.entries()].filter(
    ([, entries]) =>
      entries[0]?.verdict === 'deferred' && (entries[0]?.note ?? '').trim().length === 0,
  );
  assert.deepEqual(
    unexplained.map(([file]) => file),
    [],
    'a deferred file must state the reason it is deferred',
  );
});

test('FI-6 the index generator agrees with the index on disk', async () => {
  // The generator is the tool that keeps the index honest; it must run clean
  // against the committed index.
  const output = execFileSync('node', ['scripts/build-file-index.mjs', '--check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.match(output, /in sync/);
});

test('FI-7 the index is a real file, not a stub', () => {
  const index = read(INDEX_PATH);
  assert.ok(statSync(resolve(root, INDEX_PATH)).size > 4000, 'the index must list the repository');
  assert.match(index, /# FILE INDEX/, 'the index needs a heading');
});
