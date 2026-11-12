// Generates the Edge Function copy of the error-code contract.
//
// Supabase deploys only `supabase/functions/**`, so the Edge Functions cannot
// import `@kickoff/shared` at runtime. Instead of hand-copying the union (and
// hoping it stays in sync), this script generates the deployed copy from the
// canonical source in `packages/shared/src/error-codes.ts`. The hygiene
// contract (`scripts/tests/hygiene.test.mjs`) regenerates and compares, so a
// stale copy fails CI.
//
// Usage: node scripts/sync-error-codes.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = resolve(root, 'packages/shared/src/error-codes.ts');
const TARGET = resolve(root, 'supabase/functions/_shared/error-codes.ts');

/**
 * Renders the deployed copy from the canonical source.
 * @param {string} canonicalSource contents of packages/shared/src/error-codes.ts
 * @returns {string} the file content for supabase/functions/_shared/error-codes.ts
 */
export function generate(canonicalSource) {
  // Read the ERROR_CODES array only — scanning every quoted word in the file
  // would also pick up unrelated literals such as 'string'.
  const array = canonicalSource.match(/ERROR_CODES\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!array) {
    throw new Error('ERROR_CODES array not found in packages/shared/src/error-codes.ts');
  }
  const codes = [...array[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  if (codes.length === 0) {
    throw new Error('no error codes found in packages/shared/src/error-codes.ts');
  }
  const union = codes.map((code) => `  | "${code}"`).join('\n');

  return `// GENERATED FILE — do not edit.
// Source: packages/shared/src/error-codes.ts
// Regenerate: node scripts/sync-error-codes.mjs
//
// Supabase deploys only \`supabase/functions/**\`, so this copy cannot be an
// import from \`@kickoff/shared\`. It is generated instead of hand-written, and
// \`scripts/tests/hygiene.test.mjs\` fails if it drifts from the source.

/** Error codes returned by every Edge Function. */
export type ErrorCode =
${union};
`;
}

/**
 * Runs the generator as a command.
 *
 * Importing this module must not touch the filesystem: the hygiene contract
 * imports `generate` to compare the deployed copy, and a write on import would
 * let a test mutate the repository — and could be observed half-written by a
 * concurrent reader.
 */
function runAsCommand() {
  const source = readFileSync(SOURCE, 'utf8');
  const expected = generate(source);

  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(TARGET, 'utf8');
    } catch {
      current = '';
    }
    if (current !== expected) {
      console.error(
        'supabase/functions/_shared/error-codes.ts is stale — run: node scripts/sync-error-codes.mjs',
      );
      process.exit(1);
    }
    console.log('error codes are in sync');
    return;
  }

  writeFileSync(TARGET, expected);
  console.log(`wrote ${TARGET.replace(`${root}/`, '')}`);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  runAsCommand();
}
