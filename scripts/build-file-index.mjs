// Keeps `docs/FILE-INDEX.md` in step with the repository.
//
// Every tracked file must be reviewed, and the index is where that review
// lives: one row per file with its kind, its verdict and — where it matters —
// a note. The file-coverage contract (`scripts/tests/file-coverage.test.mjs`)
// fails when a file is missing from the index, when an indexed file no longer
// exists, or when a file is still `unreviewed`.
//
// Usage:
//   node scripts/build-file-index.mjs --check   # fail if the index drifts
//   node scripts/build-file-index.mjs --sync    # add new files as unreviewed
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_PATH = resolve(root, 'docs/FILE-INDEX.md');

/** What a file *is*. */
export const KINDS = ['source', 'test', 'config', 'asset', 'doc', 'data', 'license'];

/** What was decided about a file. */
export const VERDICTS = [
  'reviewed',
  'covered',
  'generated',
  'asset',
  'template-leftover',
  'deferred',
  'unreviewed',
];

/**
 * Classifies a repository path.
 * @param {string} file repository-relative path
 * @returns {string} one of `KINDS`
 */
export function classify(file) {
  if (file.endsWith('package-lock.json') || file.endsWith('deno.lock')) return 'config';
  if (/\.(png|jpg|jpeg|gif|webp|svg|ico)$/.test(file)) return 'asset';
  if (/(^|\/)LICENSE$/i.test(file)) return 'license';
  if (/\.(md|mdx)$/.test(file)) return 'doc';
  if (/\.sql$/.test(file)) return 'data';
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file) || /^scripts\/tests\//.test(file)) return 'test';
  if (/\.(json|toml|yaml|yml|mjs|sh|js)$/.test(file)) {
    // A script that is a gate or a tool, not application code.
    return file.startsWith('scripts/') ? 'source' : 'config';
  }
  if (/\.[cm]?[jt]sx?$/.test(file)) return 'source';
  return 'config';
}

/**
 * Parses the index table.
 *
 * Only the file table is read: a row counts as a file row when its first cell
 * looks like a repository path (it contains a separator or an extension), so
 * the prose tables in the header cannot be mistaken for entries.
 *
 * @param {string} markdown contents of docs/FILE-INDEX.md
 * @returns {Map<string, Array<{kind: string, verdict: string, note: string}>>}
 */
export function parseIndex(markdown) {
  const rows = new Map();
  for (const line of markdown.split('\n')) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*([a-z-]+)\s*\|\s*([a-z-]+)\s*\|\s*(.*?)\s*\|\s*$/);
    if (!match) continue;
    const [, file, kind, verdict, note] = match;
    if (!/[./]/.test(file)) continue;
    const entries = rows.get(file) ?? [];
    entries.push({ kind, verdict, note });
    rows.set(file, entries);
  }
  return rows;
}

/**
 * The tracked files of the repository.
 * @returns {string[]} repository-relative paths
 */
export function trackedFiles() {
  try {
    return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

/** The heading of the file table — the boundary between prose and rows. */
const TABLE_MARKER = '| File | Kind | Verdict | Note |';

/**
 * Renders the index, keeping the reviewed rows and adding the new files.
 *
 * The prose above the file table is preserved; only the rows are rewritten, so
 * a file that disappears from the repository leaves the index.
 *
 * @param {string} markdown the current index
 * @param {string[]} files the tracked files
 * @returns {string} the new index
 */
export function renderIndex(markdown, files) {
  const existing = parseIndex(markdown);
  const markerIndex = markdown.indexOf(TABLE_MARKER);
  const head = (markerIndex === -1 ? markdown : markdown.slice(0, markerIndex)).trimEnd();

  const lines = files.map((file) => {
    const entry = existing.get(file)?.[0];
    const kind = entry?.kind ?? classify(file);
    const verdict = entry?.verdict ?? 'unreviewed';
    const note = entry?.note ?? '';
    return `| \`${file}\` | ${kind} | ${verdict} | ${note} |`;
  });

  return `${head}\n\n${TABLE_MARKER}\n|---|---|---|---|\n${lines.join('\n')}\n`;
}

function main() {
  const files = trackedFiles();
  if (files.length === 0) {
    console.error('build-file-index: no tracked files found (git unavailable?)');
    process.exit(1);
  }

  const current = readFileSync(INDEX_PATH, 'utf8');

  if (process.argv.includes('--sync')) {
    writeFileSync(INDEX_PATH, renderIndex(current, files));
    console.log(`file index synced (${files.length} files)`);
    return;
  }

  const indexed = parseIndex(current);
  const missing = files.filter((file) => !indexed.has(file));
  const stale = [...indexed.keys()].filter((file) => !files.includes(file));

  if (missing.length === 0 && stale.length === 0) {
    console.log(`file index is in sync (${files.length} files)`);
    return;
  }

  if (missing.length > 0) {
    console.error(`file index is missing ${missing.length} file(s): ${missing.slice(0, 10).join(', ')}`);
  }
  if (stale.length > 0) {
    console.error(`file index lists ${stale.length} file(s) that no longer exist: ${stale.slice(0, 10).join(', ')}`);
  }
  console.error('run: node scripts/build-file-index.mjs --sync');
  process.exit(1);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  main();
}
