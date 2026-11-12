// P2 — code hygiene and a single source of truth.
//
// The Stage 0 walkthrough found a ~530 LOC dead cluster in `packages/shared`
// (deprecated UI shapes, a QR contract nobody consumes, a greeting helper and
// an English string table — all covered only by their own tests), a second
// hand-written copy of the error-code union inside the Edge Functions (with a
// comment asking to "keep the two unions in sync" and nothing enforcing it),
// business constants mirrored from SQL with zero consumers, and a redundant
// one-line re-export shim. These contracts make that state unrecoverable:
//
//   HYG-1  the dead module cluster stays deleted,
//   HYG-2  the QR contract has exactly one implementation,
//   HYG-3  the error codes have one source, and the Edge Function copy is
//          generated from it (regenerate-and-compare, so drift fails CI),
//   HYG-4  business constants match the database they mirror,
//   HYG-5  those constants are actually consumed, not decorative,
//   HYG-6  no deprecated exports and no unused helpers in the shared package,
//   HYG-7  every query module is imported by something.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const exists = (path) => existsSync(resolve(root, path));

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

test('HYG-1 the dead shared modules stay deleted', () => {
  for (const dead of [
    'packages/shared/src/types.ts',
    'packages/shared/src/qr.ts',
    'packages/shared/src/i18n/en.ts',
    'packages/shared/src/__tests__/qr.test.ts',
    'packages/shared/src/__tests__/i18n.test.ts',
  ]) {
    assert.equal(exists(dead), false, `${dead} is dead code — it must not come back`);
  }

  const index = read('packages/shared/src/index.ts');
  assert.doesNotMatch(
    index,
    /'\.\/(types|qr|i18n)/,
    'the shared package must not re-export deleted modules',
  );
});

test('HYG-1b every shared module is reachable from production code', () => {
  const sharedDir = resolve(root, 'packages/shared/src');
  const modules = readdirSync(sharedDir).filter((f) => f.endsWith('.ts') && f !== 'index.ts');

  const production = [
    ...walk(resolve(root, 'apps')),
    ...walk(resolve(root, 'supabase/functions')),
  ].filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes('/node_modules/'));

  const importsOf = (file) => {
    const source = readFileSync(file, 'utf8');
    const names = new Set();
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      names.add(match[1]);
    }
    return names;
  };

  // Reachability: a module is alive if production code imports it, or if a
  // live module imports it. This is the rule that catches "a whole module
  // nobody reads" without guessing which exports are unused.
  const alive = new Set();
  const queue = [];

  for (const file of production) {
    for (const specifier of importsOf(file)) {
      if (specifier === '@kickoff/shared') {
        for (const mod of modules) alive.add(mod);
      } else if (specifier.startsWith('@kickoff/shared/')) {
        const mod = specifier.split('/').pop();
        if (modules.includes(mod)) alive.add(mod);
      }
    }
  }

  queue.push(...alive);
  while (queue.length > 0) {
    const mod = queue.pop();
    const source = readFileSync(resolve(sharedDir, mod), 'utf8');
    for (const match of source.matchAll(/from\s+['"]\.\/([\w.-]+)['"]/g)) {
      const dependency = match[1].endsWith('.ts') ? match[1] : `${match[1]}.ts`;
      if (modules.includes(dependency) && !alive.has(dependency)) {
        alive.add(dependency);
        queue.push(dependency);
      }
    }
  }

  const unreachable = modules.filter((mod) => !alive.has(mod));
  assert.deepEqual(
    unreachable,
    [],
    `these shared modules are unreachable from production code: ${unreachable.join(', ')}`,
  );
});

test('HYG-2 the QR contract has exactly one implementation', () => {
  assert.ok(
    exists('supabase/functions/_shared/qr.ts'),
    'the QR contract lives with the functions that sign and verify it',
  );

  const sources = [
    ...walk(resolve(root, 'apps')),
    ...walk(resolve(root, 'supabase/functions')),
  ].filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes('/tests/') && !file.endsWith('.test.ts'));

  const formatCarriers = sources.filter((file) =>
    readFileSync(file, 'utf8').includes('KICKOFF-V2:'),
  );
  assert.deepEqual(
    formatCarriers.map((f) => f.replace(`${root}/`, '')),
    ['supabase/functions/_shared/qr.ts'],
    'the pass format literal must exist in exactly one implementation',
  );

  // The canonical signing string is equally load-bearing: issuer and verifier
  // must sign over the same bytes.
  const signingCarriers = sources.filter((file) => /`v2\|/.test(readFileSync(file, 'utf8')));
  assert.deepEqual(
    signingCarriers.map((f) => f.replace(`${root}/`, '')),
    ['supabase/functions/_shared/qr.ts'],
    'the canonical signing string must be assembled in exactly one place',
  );

  // Every function that issues a pass must use the shared helpers.
  for (const issuer of ['supabase/functions/ticket-qr/index.ts', 'supabase/functions/scan-demo/index.ts']) {
    const source = read(issuer);
    assert.match(
      source,
      /ticketQrSigningPayload/,
      `${issuer} must sign through the shared canonical signing string`,
    );
    assert.doesNotMatch(
      source,
      /`v2\|/,
      `${issuer} must not assemble the signing string inline`,
    );
  }
});

test('HYG-3 the error codes have one source and the function copy is generated', async () => {
  assert.ok(
    exists('packages/shared/src/error-codes.ts'),
    'the error-code contract needs a canonical home in the shared package',
  );
  assert.ok(
    exists('supabase/functions/_shared/error-codes.ts'),
    'the Edge Functions need their own copy — only `supabase/functions/**` is deployed',
  );

  const canonical = read('packages/shared/src/error-codes.ts');
  const codes = [...canonical.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(codes.length >= 8, `expected the full error-code list, found ${codes.join(', ')}`);

  // The deployed copy must be exactly what the generator produces — no
  // hand-edits, no drift.
  const { generate } = await import('../sync-error-codes.mjs');
  assert.equal(
    read('supabase/functions/_shared/error-codes.ts'),
    generate(canonical),
    'supabase/functions/_shared/error-codes.ts is stale — run `node scripts/sync-error-codes.mjs`',
  );

  const errors = read('supabase/functions/_shared/errors.ts');
  assert.doesNotMatch(
    errors,
    /export type ErrorCode\s*=/,
    'the Edge Function must import the error-code union, not redeclare it',
  );
  assert.match(errors, /from "\.\/error-codes\.ts"/, 'the Edge Function must import the generated union');
});

test('HYG-4 the business constants match the database they mirror', () => {
  const constants = read('packages/shared/src/constants.ts');
  const value = (name) => {
    const match = constants.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
    assert.ok(match, `${name} must exist in packages/shared/src/constants.ts`);
    return Number(match[1]);
  };

  const hold = read('supabase/migrations/0019_hold_functions.sql');
  const integrity = read('supabase/migrations/0034_phase_a_seat_integrity.sql');
  const scan = read('supabase/migrations/0021_scan_functions.sql');

  assert.match(
    hold,
    new RegExp(`interval '${value('SEAT_HOLD_TTL_SECONDS')} seconds'`),
    'the seat-hold TTL in SQL must equal SEAT_HOLD_TTL_SECONDS',
  );
  assert.match(
    hold,
    new RegExp(`interval '${value('KICKOFF_LOCK_MINUTES')} minutes'`),
    'the kick-off lock window in SQL must equal KICKOFF_LOCK_MINUTES',
  );
  assert.match(
    integrity,
    new RegExp(`'seat_hold_ttl_seconds'\\),\\s*${value('SEAT_HOLD_TTL_SECONDS')}\\)`),
    'the seat-hold TTL fallback in SQL must equal SEAT_HOLD_TTL_SECONDS',
  );
  assert.match(
    integrity,
    new RegExp(`'kickoff_lock_minutes'\\),\\s*${value('KICKOFF_LOCK_MINUTES')}\\)`),
    'the kick-off lock fallback in SQL must equal KICKOFF_LOCK_MINUTES',
  );
  assert.match(
    scan,
    new RegExp(`interval '${value('GATE_UNDO_SECONDS')} seconds'`),
    'the scan-undo window in SQL must equal GATE_UNDO_SECONDS',
  );
});

test('HYG-5 the shared constants are consumed, not decorative', () => {
  const scanPage = read('apps/admin/src/app/dashboard/scan/page.tsx');
  assert.match(
    scanPage,
    /GATE_UNDO_SECONDS/,
    'the scan screen must show the undo window from the shared constant',
  );
  assert.doesNotMatch(
    scanPage,
    /undo within 60s|undone for 60 seconds/,
    'the undo window must not be hardcoded in the copy',
  );

  // The admin settings fallbacks must read the shared constants instead of
  // repeating their values.
  const settings = read('apps/admin/src/lib/queries/settings.ts');
  for (const name of [
    'CLUB_NAME',
    'CLUB_TIMEZONE',
    'CURRENCY',
    'MAX_SEATS_PER_ORDER',
    'SEAT_HOLD_TTL_SECONDS',
    'KICKOFF_LOCK_MINUTES',
    'GATE_UNDO_SECONDS',
    'QR_VERSION',
  ]) {
    assert.match(settings, new RegExp(name), `the admin settings must use ${name}`);
  }
  assert.doesNotMatch(
    settings,
    /seatHoldTtlSeconds:\s*600|kickoffLockMinutes:\s*15|gateUndoSeconds:\s*60/,
    'the admin settings must not repeat the constant values',
  );

  const shared = read('packages/shared/src/constants.ts');
  for (const name of [
    'SEAT_HOLD_TTL_SECONDS',
    'KICKOFF_LOCK_MINUTES',
    'GATE_UNDO_SECONDS',
    'MAX_SEATS_PER_ORDER',
  ]) {
    const consumers = [
      ...walk(resolve(root, 'apps')),
      ...walk(resolve(root, 'supabase/functions')),
    ].filter((file) => /\.tsx?$/.test(file) && readFileSync(file, 'utf8').includes(name));
    assert.ok(
      consumers.length > 0,
      `${name} has no consumer — a constant nobody reads is a second source of truth waiting to drift`,
    );
  }
  assert.ok(shared.includes('SEAT_HOLD_TTL_SECONDS'));
});

test('HYG-6 no deprecated exports and no unused helpers in the shared package', () => {
  for (const file of walk(resolve(root, 'packages/shared/src'))) {
    if (!file.endsWith('.ts')) continue;
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /@deprecated/,
      `${file.replace(`${root}/`, '')} still carries deprecated exports`,
    );
  }

  const http = read('packages/shared/src/http.ts');
  for (const dead of ['apiOk', 'apiFail', 'ApiResponse']) {
    assert.doesNotMatch(
      http,
      new RegExp(`export (const|function|type|interface) ${dead}\\b`),
      `${dead} has no consumer — remove it from the shared package`,
    );
  }
});

test('HYG-7 every query module is imported by something', () => {
  const queryDirs = [
    resolve(root, 'apps/mobile/src/lib/queries'),
    resolve(root, 'apps/admin/src/lib/queries'),
  ];

  for (const dir of queryDirs) {
    for (const file of walk(dir)) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const name = file.split('/').pop().replace(/\.tsx?$/, '');
      const users = walk(resolve(root, 'apps')).filter(
        (other) => other !== file && /\.tsx?$/.test(other) && readFileSync(other, 'utf8').includes(name),
      );
      assert.ok(
        users.length > 0,
        `${file.replace(`${root}/`, '')} is never imported — a module nobody uses is dead code`,
      );
    }
  }
});

test('HYG-8 row→DTO mapping has one owner', () => {
  // The shared package owns every row→DTO mapper (and tests them). An app
  // that maps rows itself is a second implementation waiting to drift.
  const apps = walk(resolve(root, 'apps')).filter((file) => /\.tsx?$/.test(file));

  for (const file of apps) {
    const source = readFileSync(file, 'utf8');
    const relative = file.replace(`${root}/`, '');

    for (const mapper of ['mapOrder', 'mapTicket', 'mapMatch', 'mapSeat', 'mapZone', 'mapNews']) {
      assert.doesNotMatch(
        source,
        new RegExp(`(function|const)\\s+${mapper}\\b`),
        `${relative} defines its own ${mapper} — the shared package owns the mappers`,
      );
    }
  }

  const sharedMappers = read('packages/shared/src/mappers.ts');
  for (const mapper of ['toOrderDto', 'toTicketDto', 'toMatchDto', 'toSeatDto', 'toZoneDto']) {
    assert.match(
      sharedMappers,
      new RegExp(`export function ${mapper}\\b`),
      `${mapper} must be implemented in packages/shared/src/mappers.ts`,
    );
  }

  // The apps must actually use the shared mappers.
  const mobileTickets = read('apps/mobile/src/lib/queries/tickets.ts');
  assert.match(mobileTickets, /toTicketDto/, 'the mobile app must use the shared ticket mapper');
  const mobileOrders = read('apps/mobile/src/lib/queries/orders.ts');
  assert.match(mobileOrders, /toOrderDto/, 'the mobile app must use the shared order mapper');
});
