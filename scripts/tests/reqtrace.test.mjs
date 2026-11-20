// RT-1…RT-5 — the coverage snapshot must stay honest.
//
// `docs/REQTRACE.md` is a dated audit, not an authority. These contracts stop
// it rotting into a green-looking document:
//   RT-1  every requirement ID from docs/REQUIREMENTS.md appears exactly once,
//   RT-2  every `full` row names test files that exist,
//   RT-3  no `full` row relies only on skipped/todo tests,
//   RT-4  coverage is one of full / partial / none / n/a,
//   RT-5  every non-full row carries a close / accept / reclassify decision.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const MATRIX_PATH = 'docs/REQTRACE.md';
const REQUIREMENTS_PATH = 'docs/REQUIREMENTS.md';
const matrix = read(MATRIX_PATH);
const requirements = read(REQUIREMENTS_PATH);

const ID_PATTERN = /^(REQ-\d{2,3}|NFR-\d{2}|SC-\d{2})$/;
const DECISION_PATTERN = /^(close|accept|reclassify)\b/;

/** Split a markdown table row into trimmed cells, dropping the outer pipes. */
const cellsOf = (line) =>
  line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());

/** The audit tables and the decisions table are separate sections. */
const [matrixBody, decisionsBody = ''] = matrix.split(/^##\s+\d+\.\s+Coverage decisions\s*$/m);

const rowsOf = (body) =>
  body
    .split('\n')
    .filter((line) => ID_PATTERN.test(cellsOf(line)[0] ?? ''))
    .map(cellsOf);

/** Matrix rows only: the audit sections before the decisions table. */
const matrixRows = rowsOf(matrixBody).map((cells) => ({
  id: cells[0],
  tests: cells[3] ?? '',
  coverageCell: cells[4] ?? '',
  coverage: (cells[4] ?? '').replace(/\*/g, '').match(/^(full|partial|none|n\/a)\b/)?.[1],
}));

const decisionRows = rowsOf(decisionsBody).filter((cells) =>
  DECISION_PATTERN.test(cells[2] ?? ''),
);

/** Repository files indexed by basename, for matrix references without a path. */
const fileIndex = (() => {
  const byBasename = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        const list = byBasename.get(basename(full)) ?? [];
        list.push(relative(root, full));
        byBasename.set(basename(full), list);
      }
    }
  };
  walk(root);
  return byBasename;
})();

const TEST_FILE = /\.(?:mjs|js|ts|tsx|sql)$/;
const referencedFiles = (text) =>
  [...text.matchAll(/`([^`\n]+)`/g)]
    .map((match) => match[1])
    .filter((span) => TEST_FILE.test(span));

/** Total test declarations and the subset that cannot run by default. */
const testCounts = (source) => {
  const deno = (source.match(/\bDeno\.test\s*\(/g) ?? []).length;
  const node = (source.match(/^\s*(?:test|it)(?:\.(?:skip|todo|only))?\s*\(/gm) ?? []).length;
  const denoSkipped = (source.match(/ignore:\s*(?:!RUN|true)/g) ?? []).length;
  const nodeSkipped = (source.match(/^\s*(?:test|it)\.(?:skip|todo)\s*\(/gm) ?? []).length;
  return { total: deno + node, skipped: denoSkipped + nodeSkipped };
};

test('RT-1 every requirement ID appears exactly once in the matrix', () => {
  const expected = new Set(
    [...requirements.matchAll(/\b(REQ-\d{2,3}|NFR-\d{2}|SC-\d{2})\b/g)].map((match) => match[1]),
  );
  const seen = matrixRows.map((row) => row.id);
  const duplicates = seen.filter((id, index) => seen.indexOf(id) !== index);
  const missing = [...expected].filter((id) => !seen.includes(id));
  const extra = seen.filter((id) => !expected.has(id));

  assert.deepEqual(duplicates, [], `requirement IDs appear more than once: ${duplicates.join(', ')}`);
  assert.deepEqual(missing.sort(), [], `requirements missing from ${MATRIX_PATH}: ${missing.join(', ')}`);
  assert.deepEqual(extra.sort(), [], `${MATRIX_PATH} invents requirement IDs: ${extra.join(', ')}`);
  assert.ok(seen.length >= 50, 'the matrix must cover the whole requirement set');
});

test('RT-2 every full row names test files that exist', () => {
  const missing = [];
  for (const row of matrixRows.filter((entry) => entry.coverage === 'full')) {
    const refs = referencedFiles(row.tests);
    assert.ok(refs.length > 0, `${row.id} is marked full but names no test file`);
    for (const ref of refs) {
      const candidates = ref.includes('/') ? [ref] : fileIndex.get(basename(ref)) ?? [];
      if (candidates.length === 0) missing.push(`${row.id}: ${ref}`);
    }
  }
  assert.deepEqual(missing, [], `full rows point at files that do not exist: ${missing.join(', ')}`);
});

test('RT-3 no full row relies only on skipped or todo tests', () => {
  const falseGreens = [];
  for (const row of matrixRows.filter((entry) => entry.coverage === 'full')) {
    const refs = referencedFiles(row.tests);
    if (refs.length === 0) continue;

    const executable = refs.some((ref) => {
      const candidates = ref.includes('/') ? [ref] : fileIndex.get(basename(ref)) ?? [];
      const path = candidates[0];
      if (!path) return false;
      if (path.endsWith('.sql')) return true;
      const { total, skipped } = testCounts(read(path));
      return total === 0 || skipped < total;
    });

    if (!executable) falseGreens.push(`${row.id}: ${refs.join(', ')}`);
  }
  assert.deepEqual(
    falseGreens,
    [],
    `full rows whose only tests skip by default: ${falseGreens.join('; ')}`,
  );
});

test('RT-4 coverage uses only the closed vocabulary', () => {
  const allowed = new Set(['full', 'partial', 'none', 'n/a']);
  const invalid = matrixRows
    .filter((row) => !allowed.has(row.coverage))
    .map((row) => `${row.id}: ${row.coverageCell}`);
  assert.deepEqual(invalid, [], `invalid coverage values: ${invalid.join(', ')}`);
});

test('RT-5 every non-full row carries a decision', () => {
  const decisions = new Map(
    decisionRows.map((cells) => [cells[0], { coverage: cells[1], decision: cells[2], detail: cells[3] }]),
  );
  const problems = [];

  for (const row of matrixRows.filter((entry) => entry.coverage !== 'full')) {
    const entry = decisions.get(row.id);
    if (!entry) {
      problems.push(`${row.id} has no decision`);
      continue;
    }
    if (!DECISION_PATTERN.test(entry.decision)) {
      problems.push(`${row.id} decision must start with close, accept or reclassify`);
    }
    if (entry.coverage !== row.coverage) {
      problems.push(`${row.id} decision says ${entry.coverage} but the matrix says ${row.coverage}`);
    }
    if (/^accept/.test(entry.decision)) {
      if (!entry.detail.includes('Owner:') || !/Review:\s*\d{4}-\d{2}-\d{2}/.test(entry.detail)) {
        problems.push(`${row.id} accepts a risk without an owner and a review date`);
      }
    }
  }

  assert.deepEqual(problems, [], problems.join('; '));
});
