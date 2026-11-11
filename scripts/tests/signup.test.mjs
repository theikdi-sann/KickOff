// Phase B — punch list #2: link-only "Check your email" signup screen.
//
// With email confirmation enabled, supabase.auth.signUp returns no session.
// The old code then attempted a sign-in that could only fail ("Email not
// confirmed"), dead-ending a successfully created account. Locks in:
//   1. signUp reports confirmation-required instead of a doomed sign-in,
//   2. the store only sets the profile for a signed-in result,
//   3. register routes a pending confirmation to the check-email screen
//      with the address (and still auto-logs-in when a session exists),
//   4. the screen is link-only — no code entry — with resend + sign-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('SU-1 signUp reports confirmation-required instead of a doomed sign-in', () => {
  const source = read('apps/mobile/src/lib/auth.ts');

  assert.match(
    source,
    /if \(!data\.session\) \{[\s\S]*?status: 'confirmation-required'/,
    'a missing session must become a confirmation-required result',
  );
  assert.doesNotMatch(
    source,
    /return signIn\(email, password\)/,
    'never sign in with a password right after signUp — it fails while the email is unconfirmed',
  );
});

test('SU-2 the store sets the profile only for a signed-in result', () => {
  const source = read('apps/mobile/src/lib/store.tsx');

  assert.match(
    source,
    /result\.status === 'signed-in'/,
    'profile must be set only when a session came back',
  );
  assert.match(source, /SignUpResult/, 'the result type must flow through the context');
});

test('SU-3 register routes a pending confirmation to the check-email screen', () => {
  const source = read('apps/mobile/src/app/(auth)/register.tsx');

  assert.match(
    source,
    /confirmation-required'[\s\S]*?check-email/,
    'a pending confirmation must land on the check-email screen with the address',
  );
  assert.match(
    source,
    /pathname: '\/check-email',\s*params: \{ email/,
    'the address must be passed along for display',
  );
  assert.match(
    source,
    /router\.replace\('\/'\)/,
    'a returned session must still auto-login to the app root',
  );
});

test('SU-4 check-email is link-only: address, resend, back to sign-in', () => {
  const source = read('apps/mobile/src/app/(auth)/check-email.tsx');

  assert.match(source, /CHECK YOUR/, 'the screen must say check your email');
  assert.match(
    source,
    /useLocalSearchParams/,
    'the screen must display the address it mailed',
  );
  assert.doesNotMatch(
    source,
    /TextInput/,
    'link-only: no code/OTP entry field',
  );
  assert.doesNotMatch(
    source,
    /signIn\(/,
    'the screen must not sign anyone in — confirmation comes from the emailed link',
  );
  assert.match(source, /resendConfirmation/, 'a resend action must exist');
  assert.match(source, /Back to sign in/, 'the way back to sign-in must exist');
});
