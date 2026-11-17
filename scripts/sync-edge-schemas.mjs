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
  {
    // The generated database types are what makes an Edge write to a column
    // that no longer exists a compile error instead of a runtime PGRST204 —
    // the delete-account bug (GAP-09.0). The canonical source is the output of
    // `npm run db:types`; the deployed copy keeps the Edge tree self-contained.
    source: 'packages/shared/src/database.types.ts',
    target: 'supabase/functions/_shared/database.types.ts',
  },
  {
    // The money formatter is one owner across the apps and the Edge
    // functions (C8.2b): `money.ts` is deliberately self-contained so this
    // copy stays valid under Deno's module resolution — the receipt PDF must
    // format the order's currency exactly as the apps do (MF-1/MF-5).
    source: 'packages/shared/src/money.ts',
    target: 'supabase/functions/_shared/money.ts',
  },
  {
    // The club's display config travels with it (C8.2d): the receipt's
    // defensive timezone fallback must be the same default the apps use,
    // not a second literal — the copy keeps its one relative import
    // (rewritten to `./money.ts` for Deno), which resolves to the generated
    // money copy beside it.
    source: 'packages/shared/src/display.ts',
    target: 'supabase/functions/_shared/display.ts',
  },
  {
    // The platform vocabulary travels with the Edge guards (C9.2): the
    // `bootstrap` slug check and the `requirePlatformAdmin` claim read must
    // be the ones the console and the database use, never a re-derivation.
    source: 'packages/shared/src/platform.ts',
    target: 'supabase/functions/_shared/platform.ts',
  },
  {
    // The translation layer travels with the receipt (C10.2): the PDF speaks
    // the club's language exactly as the apps do. `i18n.ts` keeps one
    // relative import (`./messages.th`), rewritten for Deno like display's.
    source: 'packages/shared/src/i18n.ts',
    target: 'supabase/functions/_shared/i18n.ts',
  },
  {
    // The Thai catalog is data the receipt renders with — generated so a new
    // app string and the PDF's translation cannot drift apart.
    source: 'packages/shared/src/messages.th.ts',
    target: 'supabase/functions/_shared/messages.th.ts',
  },
];

/**
 * Renders the deployed copy from the canonical source.
 *
 * The canonical file must stay portable: no import that cannot resolve
 * inside `supabase/functions/_shared` — either no imports at all (money) or
 * a relative import to another generated copy (display → `./money`). Two
 * rewrites make the copy Deno's, and only two: the header, and a relative
 * import's missing `.ts` extension (Deno requires it; TypeScript through the
 * apps' `paths` does not accept it). Everything else stays verbatim, so a
 * reader can diff the two files by eye.
 *
 * @param {string} canonicalSource contents of the canonical file
 * @param {string} [sourcePath] repository path of the canonical file (for the header)
 * @returns {string} the file content for the deployed copy
 */
export function generate(canonicalSource, sourcePath = 'packages/shared/src/refund.ts') {
  const denoImports = canonicalSource.replace(
    /from '(\.\/[^']+?)(\.ts)?'/g,
    (_match, spec) => `from '${spec}.ts'`,
  );

  return `// GENERATED FILE — do not edit.
// Source: ${sourcePath}
// Regenerate: node scripts/sync-edge-schemas.mjs
//
// Supabase deploys only \`supabase/functions/**\`, so this copy cannot be an
// import from \`@kickoff/shared\`. It is generated from the canonical source,
// and a contract test fails if it drifts.

${denoImports}`;
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
