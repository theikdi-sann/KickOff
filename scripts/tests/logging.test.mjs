// Phase C4 — C4.11: one logging convention, one owner.
//
// The Edge Functions shipped a structured JSON logger with a redaction list;
// the staff console logged with bare `console.error`. Two conventions, and a
// secrets list that existed on exactly one side — so a secret could be
// redacted in a function and printed by a screen.
//
//   LG-1  the canonical logger lives in the shared package, is portable
//         (no imports — the Edge copy must stay self-contained) and is
//         unit-tested
//   LG-2  the deployed Edge copy is generated from it, never hand-edited
//   LG-3  no first-party app source calls console.* directly anymore
//   LG-4  lint forbids raw console in both apps and in the Edge Functions
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const CANONICAL = 'packages/shared/src/logging.ts';
const DEPLOYED = 'supabase/functions/_shared/logger.ts';

test('LG-1 the canonical logger lives in the shared package, portable and tested', () => {
  const source = read(CANONICAL);

  // No imports: the deployed copy must remain valid under Deno's module
  // resolution, which cannot reach `@kickoff/shared`.
  assert.doesNotMatch(
    source,
    /^import\s/m,
    'the canonical logger must be self-contained so the generated Edge copy has no unresolved imports',
  );
  assert.match(source, /export function redact/);
  assert.match(source, /export function createLogger/);
  assert.match(source, /export const logger/);

  const tests = read('packages/shared/src/__tests__/logging.test.ts');
  assert.match(tests, /redact/, 'the redaction rules must be unit-tested');
  assert.match(tests, /createLogger/, 'the scoped logger must be unit-tested');
  assert.match(tests, /logger\.warn/, 'the default logger shape must be pinned for the Edge Functions');
});

test('LG-2 the deployed Edge logger is generated, never hand-edited', async () => {
  const { generate } = await import('../../scripts/sync-edge-schemas.mjs');
  const expected = generate(read(CANONICAL), CANONICAL);

  assert.equal(
    read(DEPLOYED),
    expected,
    `${DEPLOYED} is stale — run: node scripts/sync-edge-schemas.mjs`,
  );
  // No file-level lint ignore: the logger declares its own module-scoped
  // `console` (the shared library compiles against a pure ES lib), so deno's
  // `no-console` produces no diagnostic here — and `ban-unused-ignore` would
  // fail the lint for a dead directive. Every other function still trips the
  // rule on the global `console`.
  assert.doesNotMatch(read(DEPLOYED), /deno-lint-ignore-file/);
});

test('LG-3 no first-party app source calls console directly', () => {
  /** `console.x(` at a statement boundary — never inside prose or a string. */
  const CALL = /(^|[^.\w])console\.(log|info|warn|error|debug|trace|dir|table)\s*\(/;

  /** Walks a source tree for TypeScript files. */
  const walk = (dir) =>
    readdirSync(resolve(root, dir)).flatMap((entry) => {
      const rel = `${dir}/${entry}`;
      if (statSync(resolve(root, rel)).isDirectory()) return walk(rel);
      return /\.tsx?$/.test(entry) && !rel.includes('__tests__') && !rel.includes('/tests/') ? [rel] : [];
    });

  const offenders = [...walk('apps/admin/src'), ...walk('apps/mobile/src')].filter((file) =>
    CALL.test(read(file)),
  );

  assert.deepEqual(
    offenders,
    [],
    `use createLogger('<scope>') from @kickoff/shared instead of console:\n${offenders.join('\n')}`,
  );
});

test('LG-4 lint forbids raw console in both apps and in the Edge Functions', () => {
  for (const config of ['apps/admin/eslint.config.mjs', 'apps/mobile/eslint.config.js']) {
    const source = read(config);
    const rule = source.match(/["']no-console["']:\s*\[([^\]]*)\]/);
    assert.ok(rule, `${config} must declare the no-console rule`);
    assert.doesNotMatch(
      rule[1],
      /allow/,
      `${config} may not allow any console method — the logger is the only way to emit`,
    );
  }

  // The Edge keeps its own guard: every function may reach `console` only
  // through the generated logger, which is why the deny rule stays on.
  const deno = JSON.parse(read('supabase/functions/deno.json'));
  assert.ok(
    (deno.lint?.rules?.include ?? []).includes('no-console'),
    'deno lint must keep enforcing no-console in the Edge Functions',
  );
});
