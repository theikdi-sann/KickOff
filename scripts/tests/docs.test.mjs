// P1 — documentation baseline: the docs must describe *this* repository.
//
// Drift found in the Stage 0 walkthrough: the root README claimed 15 Edge
// Functions (there are 16) and 33 migrations (there are 37); the mobile and
// admin sub-READMEs described a mock-store prototype that no longer exists;
// the proposal and its raw brainstorm sat at the repo root. These contracts
// make documentation drift a *failing test* instead of a review comment:
//   DOC-1  the README's Edge Function count equals the real count,
//   DOC-2  the README's migration count equals the real count,
//   DOC-3  every mobile and admin route file is documented,
//   DOC-4  the README links every file in docs/ and every link resolves,
//   DOC-5  there is exactly one front door — no per-app README files,
//   DOC-6  the requirements document carries REQ ids and a traceability map,
//   DOC-7  known gaps stay visible (offline pass verification is still open),
//   DOC-8  PLAN.md is the index and the task history lives in docs/archive/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const readme = read('README.md');

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

/** Route path for an Expo Router / Next.js route file, with group dirs removed. */
const routeOf = (file, appDir) => {
  const rel = relative(appDir, file).replace(/\.(tsx|ts|jsx|js)$/, '');
  const parts = rel.split('/').filter((p) => p && !p.startsWith('(') && p !== 'page' && p !== 'index');
  return `/${parts.join('/')}`.replace(/\/$/, '') || '/';
};

test('DOC-1 the README counts the Edge Functions that exist', () => {
  const fnDir = resolve(root, 'supabase/functions');
  const functions = readdirSync(fnDir).filter(
    (name) => statSync(join(fnDir, name)).isDirectory() && !name.startsWith('_') && name !== 'tests',
  );

  const claimed = readme.match(/(\d+)\s+Edge Functions/);
  assert.ok(claimed, 'the README must state how many Edge Functions there are');
  assert.equal(
    Number(claimed[1]),
    functions.length,
    `the README claims ${claimed[1]} Edge Functions but supabase/functions has ${functions.length}: ${functions.join(', ')}`,
  );
});

test('DOC-2 the README counts the migrations that exist', () => {
  const migrations = readdirSync(resolve(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql'));
  const claimed = readme.match(/(\d+)\s+migrations/);
  assert.ok(claimed, 'the README must state how many migrations there are');
  assert.equal(
    Number(claimed[1]),
    migrations.length,
    `the README claims ${claimed[1]} migrations but supabase/migrations has ${migrations.length}`,
  );
});

test('DOC-3 every route is documented', () => {
  const mobileApp = resolve(root, 'apps/mobile/src/app');
  const adminApp = resolve(root, 'apps/admin/src/app');

  const mobile = walk(mobileApp)
    .filter((f) => /\.(tsx|ts)$/.test(f) && !f.endsWith('_layout.tsx'))
    .map((f) => routeOf(f, mobileApp));
  const admin = walk(adminApp)
    .filter((f) => /page\.tsx$/.test(f))
    .map((f) => routeOf(f, adminApp));

  const missing = [...mobile, ...admin].filter((route) => {
    // Dynamic segments are documented with the segment name in brackets.
    const needle = route === '/' ? '`/`' : `\`${route}\``;
    return !readme.includes(needle);
  });

  assert.deepEqual(
    missing,
    [],
    `these routes exist but are not in the README route tables: ${missing.join(', ')}`,
  );
});

test('DOC-4 the README documents every doc, and every doc link resolves', () => {
  const docsDir = resolve(root, 'docs');
  const onDisk = readdirSync(docsDir).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`);

  for (const doc of onDisk) {
    assert.ok(readme.includes(doc), `the README must link ${doc}`);
  }

  for (const match of readme.matchAll(/\]\((docs\/[^)#]+\.md)\)/g)) {
    const target = resolve(root, match[1]);
    assert.ok(
      statSync(target, { throwIfNoEntry: false }) !== undefined,
      `the README links ${match[1]} but the file does not exist`,
    );
  }
});

test('DOC-5 there is one front door — no per-app README files', () => {
  for (const app of ['admin', 'mobile']) {
    const path = `apps/${app}/README.md`;
    assert.equal(
      statSync(resolve(root, path), { throwIfNoEntry: false }),
      undefined,
      `${path} duplicates the root README and goes stale — fold its content in and delete it`,
    );
  }
});

test('DOC-6 the requirements document is traceable', () => {
  const requirements = read('docs/REQUIREMENTS.md');

  const ids = [...requirements.matchAll(/\bREQ-\d{2}\b/g)].map((m) => m[0]);
  assert.ok(new Set(ids).size >= 12, 'every MVP requirement needs a REQ id');
  assert.match(
    requirements,
    /^##\s+(?:\d+\.\s*)?Traceability/m,
    'the requirements need a traceability table',
  );

  // Every requirement row must point at real code — a requirement without an
  // implementation pointer is a claim, not a requirement. Scoped to the
  // traceability section, not the requirement tables further up.
  const section = requirements.split(/^##\s+(?:\d+\.\s*)?Traceability/m)[1]?.split(/^##\s+/m)[0] ?? '';
  const rows = section.split('\n').filter((line) => /^\|\s*REQ-\d{2}\s*\|/.test(line));
  assert.ok(rows.length >= 12, `expected a traceability row per requirement, found ${rows.length}`);
  for (const row of rows) {
    // A requirement is either implemented (pointer to code) or explicitly
    // open (a GAP id). Anything else is an untracked claim.
    assert.match(
      row,
      /(apps|packages|supabase)\/|GAP-\d{2}/,
      `traceability row without an implementation pointer or a GAP id: ${row}`,
    );
  }

  assert.match(
    requirements,
    /^##\s+(?:\d+\.\s*)?Scope constraints/m,
    'the scope constraints from the proposal must survive the merge',
  );
});

test('DOC-7 known gaps stay visible', () => {
  const requirements = read('docs/REQUIREMENTS.md');
  assert.match(
    requirements,
    /^##\s+(?:\d+\.\s*)?Known gaps/m,
    'the requirements need an explicit known-gaps section',
  );
  assert.match(
    requirements,
    /offline/i,
    'the open offline pass-verification gap must stay documented until it is implemented',
  );
});

test('DOC-8 PLAN.md is the index and the task history is archived', () => {
  const plan = read('PLAN.md');
  assert.match(plan, /docs\/archive\/PLAN-history\.md/, 'PLAN.md must link the archived history');
  assert.match(plan, /## Current status/, 'PLAN.md must open with the current status');
  assert.match(plan, /## Decision index/, 'PLAN.md must keep a decision index');

  const archived = read('docs/archive/PLAN-history.md');
  assert.ok(
    archived.length > 20000,
    'the archived history must actually contain the old task history',
  );
  assert.match(archived, /Phase 12|Phase B/, 'the archive must keep the phase records');
});
