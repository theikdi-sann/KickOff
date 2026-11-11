// Phase B — punch list #3: post-auth deep links.
//
// The confirmation email must open the app: signUp/resend pass
// emailRedirectTo kickoff://auth/callback (already allow-listed in
// supabase/config.toml and verified against the hosted project), and a
// dedicated route consumes the implicit-flow tokens — or surfaces
// GoTrue's #error payload — instead of dead-ending in a browser pointed
// at localhost:3000. Locks in:
//   1. every emailed auth link targets an allow-listed app deep link,
//   2. the callback route applies the session and lands signed-in on '/',
//   3. invalid/expired links explain themselves and offer a way back,
//      with no code or password entry (link-only).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('RD-1 every emailed auth link targets an allow-listed app deep link', () => {
  const source = read('apps/mobile/src/lib/auth.ts');

  const redirects = source.match(/emailRedirectTo: 'kickoff:\/\/auth\/callback'/g) ?? [];
  assert.equal(
    redirects.length,
    2,
    'signUp and resendConfirmation must both target the app callback',
  );
  assert.match(
    source,
    /redirectTo: 'kickoff:\/\/reset-password'/,
    'password recovery keeps its deep link',
  );
});

test('RD-2 the callback route applies the session and lands on the app root', () => {
  const source = read('apps/mobile/src/app/(auth)/auth/callback.tsx');

  assert.match(source, /Linking\.getInitialURL/, 'must read the cold-start deep link');
  assert.match(source, /addEventListener\('url'/, 'must read warm-open deep links');
  assert.match(source, /\.remove\(\)/, 'the url listener must be cleaned up on unmount');
  assert.match(source, /access_token/, 'must read the implicit-flow tokens');
  assert.match(source, /refresh_token/, 'must read the refresh token too');
  assert.match(source, /applyLinkSession/, 'must establish the session');
  assert.match(
    source,
    /Redirect href="\/"/,
    'a confirmed session lands signed-in on the app root',
  );
  assert.match(source, /error_description/, "must surface GoTrue's error payload");
});

test('RD-3 broken links explain themselves and stay link-only', () => {
  const source = read('apps/mobile/src/app/(auth)/auth/callback.tsx');
  const config = read('supabase/config.toml');

  assert.match(source, /Back to sign in/, 'a way back to sign-in must exist');
  assert.doesNotMatch(source, /TextInput/, 'link-only: no code/OTP/password field');
  assert.doesNotMatch(
    source,
    /signIn\(/,
    'the route must not attempt a password sign-in',
  );
  assert.match(
    config,
    /kickoff:\/\/auth\/callback/,
    'config.toml must keep the callback allow-listed',
  );
  assert.match(
    config,
    /kickoff:\/\/reset-password/,
    'config.toml must keep recovery allow-listed',
  );
});
