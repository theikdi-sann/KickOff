// Phase B — punch list #11: language picker shows a button but changing
// language "basically does not work at all" — nothing reads the stored
// value. Walkthrough decision: remove the other-language options entirely,
// keep English only for now (more languages may arrive later). Locks in:
//   1. no non-English option survives anywhere in the mobile sources,
//   2. the Settings language row is a static English display (no chooser),
//   3. no dead persistence code remains for a language nobody can pick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('LANG-1 no non-English language option survives in the app', () => {
  const source = read('apps/mobile/src/app/settings.tsx');

  assert.doesNotMatch(source, /ไทย/, 'Thai must be removed — English only for now');
  assert.doesNotMatch(source, /LANGUAGES\s*=/, 'the language option list must be gone');
});

test('LANG-2 the language row is a static English display, not a chooser', () => {
  const source = read('apps/mobile/src/app/settings.tsx');

  assert.match(
    source,
    /Language[\s\S]{0,600}English/,
    'the Language row must still render with English as its value',
  );
  assert.doesNotMatch(
    source,
    /chooseLanguage/,
    'the chooser (Alert with language options) must be removed',
  );
  assert.doesNotMatch(
    source,
    /Alert\.alert\(\s*'Language'/,
    'tapping the row must no longer open a language alert',
  );
});

test('LANG-3 dead language persistence code is gone', () => {
  const source = read('apps/mobile/src/app/settings.tsx');

  assert.doesNotMatch(
    source,
    /LANGUAGE_KEY/,
    'SecureStore language persistence must be removed — nothing ever read it for display',
  );
  assert.doesNotMatch(
    source,
    /kickoff\.language/,
    'the stored language key must be gone',
  );
});
