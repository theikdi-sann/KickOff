// P11-15 — the mobile UI kit must expose all three state primitives.
//
// apps/mobile has no component test runner yet (its `test` script is a stub and
// Maestro smoke arrives later in Phase 11), so this asserts the source-level
// contract the plan asks for: Skeleton, EmptyState and ErrorState are all
// exported from the shared UI kit, and ErrorState carries the retry affordance
// screens need to recover from a failed query (risk R-04).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const source = readFileSync(resolve(root, 'apps/mobile/src/components/ui.tsx'), 'utf8');

test('P11-15 UI kit exports Skeleton, EmptyState and ErrorState', () => {
  for (const name of ['Skeleton', 'EmptyState', 'ErrorState']) {
    assert.match(
      source,
      new RegExp(`export function ${name}\\s*\\(`),
      `apps/mobile/src/components/ui.tsx must export \`${name}\``,
    );
  }
});

test('P11-15 ErrorState offers a retry affordance', () => {
  const match = source.match(/export function ErrorState\s*\(([^]*?)\)\s*\{/);
  assert.ok(match, 'ErrorState signature not found');
  const signature = match[1];
  assert.match(signature, /onRetry/, 'ErrorState must accept an `onRetry` callback');
  assert.match(signature, /title/, 'ErrorState must accept a `title`');
});
