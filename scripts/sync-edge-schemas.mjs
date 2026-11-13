// Generates the Edge Function copy of a shared Zod contract.
//
// Supabase deploys only `supabase/functions/**`, so an Edge Function cannot
// import `@kickoff/shared` at deploy time. For contracts that must be enforced
// on both sides, the deployed copy is generated from the canonical source
// instead of hand-copied — a stale copy fails the contract test.
//
// Usage: node scripts/sync-edge-schemas.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The contracts that need a deployed copy. */
export const CONTRACTS = [
  {
    source: 'packages/shared/src/refund.ts',
    target: 'supabase/functions/_shared/refund.ts',
  },
  {
    source: 'packages/shared/src/logging.ts',
    target: 'supabase/functions/_shared/logger.ts',
  },
  {
    // The role vocabulary is shared by the console, the Edge guards and the
    // database constraint; the deployed copy is generated for the same reason
    // the logger is (D-13/§6.8).
    source: 'packages/shared/src/roles.ts',
    target: 'supabase/functions/_shared/roles.ts',
  },
];

/**
 * Renders the deployed copy from the canonical source.
 *
 * The canonical file deliberately has no relative imports, so the copy is the
 * source itself plus a "generated" header. Keeping it verbatim means a reader
 * can diff the two files by eye.
 *
 * @param {string} canonicalSource contents of the canonical file
 * @param {string} [sourcePath] repository path of the canonical file (for the header)
 * @returns {string} the file content for the deployed copy
 */
export function generate(canonicalSource, sourcePath = 'packages/shared/src/refund.ts') {
  return `// GENERATED FILE — do not edit.
// Source: ${sourcePath}
// Regenerate: node scripts/sync-edge-schemas.mjs
//
// Supabase deploys only \`supabase/functions/**\`, so this copy cannot be an
// import from \`@kickoff/shared\`. It is generated from the canonical source,
// and a contract test fails if it drifts.

${canonicalSource}`;
}

/**
 * Runs the generator as a command.
 *
 * Importing this module must not touch the filesystem: the contract test
 * imports `generate` to compare the copy, and a write on import would let a
 * test mutate the repository.
 */
function runAsCommand() {
  const check = process.argv.includes('--check');
  let drifted = false;

  for (const contract of CONTRACTS) {
    const source = readFileSync(resolve(root, contract.source), 'utf8');
    const expected = generate(source, contract.source);
    const target = resolve(root, contract.target);

    if (check) {
      let current = '';
      try {
        current = readFileSync(target, 'utf8');
      } catch {
        current = '';
      }
      if (current !== expected) {
        console.error(`${contract.target} is stale — run: node scripts/sync-edge-schemas.mjs`);
        drifted = true;
      }
    } else {
      writeFileSync(target, expected);
      console.log(`wrote ${contract.target}`);
    }
  }

  if (check && drifted) process.exit(1);
  if (check && !drifted) console.log('edge schemas are in sync');
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  runAsCommand();
}
