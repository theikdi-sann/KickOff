// NFR-02 — the service-role key must never reach a client.
//
// The previous defence was a documentation assertion. This contract reads the
// artifacts a phone or browser actually downloads and looks for the key's
// distinguishing feature: a JWT whose payload says `role: service_role`.
// It does not grep for the *word* `service_role` — shared logging redacts that
// word, and a source-level match would be a false positive.
//
//   SK-1  no client-visible env name carries a server secret,
//   SK-2  no client source file embeds a service-role JWT,
//   SK-3  no built client chunk embeds a service-role JWT,
//   SK-4  the configured service-role key value is absent from client artifacts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');

const CLIENT_ROOT = [
  'apps/mobile/src',
  'apps/mobile/app.json',
  'apps/mobile/public',
  'apps/admin/src',
  'apps/admin/public',
  'packages/shared/src',
];

const CLIENT_ARTIFACTS = ['apps/admin/.next/static', 'apps/mobile/dist', 'apps/mobile/dist-web'];

const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.html', '.map', '.txt']);

const walk = (path, out = []) => {
  if (!existsSync(path)) return out;
  const stat = statSync(path);
  if (!stat.isDirectory()) {
    out.push(path);
    return out;
  }
  for (const entry of readdirSync(path)) walk(join(path, entry), out);
  return out;
};

const files = (paths) =>
  paths.flatMap((path) => walk(resolve(root, path))).filter((file) => TEXT_EXT.has(extname(file)));

/** A JWT whose payload grants the service role. */
const SERVICE_JWT = (() => {
  return /eyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;
})();

const serviceRoleJwts = (source) => {
  const found = [];
  for (const match of source.matchAll(SERVICE_JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') found.push(match[0]);
    } catch {
      // Not a JWT payload; a random base64 blob is not a key.
    }
  }
  return found;
};

test('SK-1 no client-visible env name carries a server secret', () => {
  const forbidden = /SERVICE_ROLE|SECRET_KEY|STRIPE_SECRET|TICKET_HMAC|METRICS_TOKEN/i;
  const offenders = [];

  for (const file of files(['apps/mobile', 'apps/admin', 'packages/shared', 'app.json', '.env.example'])) {
    if (file.includes(`${join('apps', 'admin')}${join('.next')}`)) continue;
    if (!/\.(ts|tsx|js|mjs|json)$/.test(file) && !file.endsWith('.env.example')) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\b(EXPO_PUBLIC|NEXT_PUBLIC)_[A-Z0-9_]+\b/g)) {
      if (forbidden.test(match[0])) offenders.push(`${file.replace(`${root}/`, '')}: ${match[0]}`);
    }
  }

  assert.deepEqual(offenders, [], `client env names expose a server secret: ${offenders.join(', ')}`);
});

test('SK-2 no client source file embeds a service-role JWT', () => {
  const offenders = [];
  for (const file of files(CLIENT_ROOT)) {
    if (serviceRoleJwts(readFileSync(file, 'utf8')).length > 0) {
      offenders.push(file.replace(`${root}/`, ''));
    }
  }
  assert.deepEqual(offenders, [], `service-role JWT embedded in client source: ${offenders.join(', ')}`);
});

test('SK-3 no built client chunk embeds a service-role JWT', () => {
  const offenders = [];
  for (const file of files(CLIENT_ARTIFACTS)) {
    if (serviceRoleJwts(readFileSync(file, 'utf8')).length > 0) {
      offenders.push(file.replace(`${root}/`, ''));
    }
  }
  assert.deepEqual(offenders, [], `service-role JWT shipped in a client bundle: ${offenders.join(', ')}`);
});

test('SK-4 the configured key value is absent from client artifacts', () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.length < 20) return; // CI without the hosted secret still runs SK-1…SK-3.

  const offenders = files([...CLIENT_ROOT, ...CLIENT_ARTIFACTS]).filter((file) =>
    readFileSync(file, 'utf8').includes(key),
  );
  assert.deepEqual(
    offenders.map((file) => file.replace(`${root}/`, '')),
    [],
    'the live service-role key value appears in a client file',
  );
});
