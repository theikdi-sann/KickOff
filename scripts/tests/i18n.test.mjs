// C10.2 — the translation layer (GAP-05).
//
// Formatting already speaks the club's language (C8.2); this cycle is the
// copy. The model is the white-label one: one app per club speaks the
// club's language, so the locale comes from `tenants.locale`, and the
// **English source string is the key** — no English catalog to drift, a
// missing Thai entry degrades to the English string instead of a hole.
//
//   I18N-1  the shared core exists and its tests cover it
//   I18N-2  every key the apps and the receipt use exists in the Thai
//           catalog, and nothing unused lingers
//   I18N-3  the apps render dates and money in the club's locale (the
//           decision C8.2d parked for exactly this cycle)
//   I18N-4  the receipt renders in the club's locale, labels included
//   I18N-5  the Edge copies of i18n and the catalog are generated
//   I18N-6  t() is called with literal keys — a variable key cannot be
//           checked against the catalog
//   I18N-7  the greeting travels through the same layer
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const CORE = 'packages/shared/src/i18n.ts';
const CATALOG = 'packages/shared/src/messages.th.ts';
const CORE_TESTS = 'packages/shared/src/__tests__/i18n.test.ts';
const RECEIPT = 'supabase/functions/receipt/index.ts';
const DEPLOYED_I18N = 'supabase/functions/_shared/i18n.ts';
const DEPLOYED_CATALOG = 'supabase/functions/_shared/messages.th.ts';

/** Every mobile source file, as [relative path, source]. */
function mobileSources() {
  const base = resolve(root, 'apps/mobile/src');
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry)) {
        out.push([full.slice(root.length + 1), readFileSync(full, 'utf8')]);
      }
    }
  };
  walk(base);
  return out;
}

/** Every key the product uses: mobile `t('…')` and the receipt's `translate`. */
function usedKeys() {
  const keys = new Set();
  for (const [, src] of mobileSources()) {
    // Every literal inside a t(...) call is a key — including ternary
    // branches (`t(cond ? 'a' : 'b')`) that never follow t( directly.
    for (const match of src.matchAll(/\bt\(/g)) {
      // The opening paren is part of the match: start one level deep so the
      // call's own closing paren ends the scan instead of running to EOF.
      let depth = 1;
      let quote = null;
      let currentKey = null;
      for (let i = match.index + 't('.length; i < src.length; i++) {
        const c = src[i];
        if (quote) {
          if (c === '\\') {
            currentKey += src[i + 1] ?? '';
            i++;
          } else if (c === quote) {
            quote = null;
            if (currentKey) keys.add(currentKey);
            currentKey = null;
          } else if (currentKey !== null) {
            currentKey += c;
          }
          continue;
        }
        if (c === "'" || c === '"') {
          // A comparison operand (`tab === 'active'`) is a value, not a key.
          let back = i;
          while (back > 0 && /\s/.test(src[back - 1])) back--;
          const operand = src.slice(Math.max(0, back - 2), back) === '==';
          quote = c;
          currentKey = operand ? null : '';
          continue;
        }
        if (c === '(') depth++;
        else if (c === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
    }
  }
  // The greeting's phrases are keys too — greeting.ts resolves them through
  // translate() rather than through a t() call in the apps.
  const greetings = read('packages/shared/src/greeting.ts');
  const greetingsBlock = greetings.split('const GREETINGS')[1]?.split('};')[0] ?? '';
  for (const match of greetingsBlock.matchAll(/:\s*'([^']+)'/g)) keys.add(match[1]);
  const receipt = read(RECEIPT);
  for (const match of receipt.matchAll(/translate\([^,]+,\s*'([^']+)'/g)) keys.add(match[1]);
  for (const match of receipt.matchAll(/translate\([^,]+,\s*"([^"]+)"/g)) keys.add(match[1]);
  return keys;
}

/** The catalog's keys, parsed from its own object literal. */
function catalogKeys() {
  const src = read(CATALOG);
  const start = src.indexOf('= {');
  const end = src.lastIndexOf('};');
  assert.ok(start !== -1 && end > start, `${CATALOG} must hold one object literal`);
  const body = src.slice(start + 3, end);

  const keys = new Set();
  let i = 0;
  const readString = (at) => {
    const quote = body[at];
    assert.ok(quote === "'" || quote === '"', `${CATALOG}: expected a quoted key at ${at}`);
    let value = '';
    let j = at + 1;
    while (j < body.length && body[j] !== quote) {
      if (body[j] === '\\') {
        value += body[j + 1];
        j += 2;
        continue;
      }
      value += body[j];
      j += 1;
    }
    return { value, next: j + 1 };
  };

  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) i += 1;
    if (body.startsWith('//', i)) {
      i = body.indexOf('\n', i) === -1 ? body.length : body.indexOf('\n', i) + 1;
      continue;
    }
    if (i >= body.length) break;
    const key = readString(i);
    keys.add(key.value);
    // Skip the value: find its opening quote after the colon, then its end.
    const colon = body.indexOf(':', key.next);
    assert.ok(colon !== -1, `${CATALOG}: entry ${key.value} has no value`);
    const value = readString(body.indexOf("'", colon) === -1 ? body.indexOf('"', colon) : body.indexOf("'", colon));
    i = value.next;
  }
  return keys;
}

test('I18N-1 the shared core exists and its tests cover it', () => {
  const core = read(CORE);
  assert.match(core, /export function translate/);
  assert.match(core, /export function localeFromTag/);

  const tests = read(CORE_TESTS);
  assert.match(tests, /degrades to the English key/);
  assert.match(tests, /interpolates named parameters/);
  assert.match(tests, /leaves the placeholder visible/);
});

test('I18N-2 every key the apps and the receipt use exists in the Thai catalog', () => {
  const used = usedKeys();
  const catalog = catalogKeys();

  const missing = [...used].filter((key) => !catalog.has(key));
  assert.deepEqual(
    missing,
    [],
    `keys used but not translated — add them to ${CATALOG}:\n  ${missing.join('\n  ')}`,
  );

  const orphans = [...catalog].filter((key) => !used.has(key));
  assert.deepEqual(
    orphans,
    [],
    `translated but unused — remove them from ${CATALOG}:\n  ${orphans.join('\n  ')}`,
  );
});

test('I18N-3 the apps render dates and money in the club locale', () => {
  for (const [file, src] of mobileSources()) {
    if (src.includes('formatMoney(')) {
      assert.doesNotMatch(
        src,
        /formatMoney\([^)\n]*,\s*display\.currency\)/,
        `${file} formats money without the club locale`,
      );
      assert.match(
        src,
        /display\.currency,\s*display\.locale/,
        `${file} must pass display.locale to formatMoney`,
      );
    }
    assert.doesNotMatch(
      src,
      /\{\s*timezone:\s*display\.timezone\s*\}/,
      `${file} formats a date in the club timezone but the platform locale`,
    );
  }
});

test('I18N-4 the receipt renders in the club locale, labels included', () => {
  const receipt = read(RECEIPT);
  assert.match(
    receipt,
    /from "\.\.\/_shared\/i18n\.ts"/,
    'the receipt translates through the shared layer',
  );
  assert.match(receipt, /localeFromTag\(/, 'the club tag becomes a catalog locale');
  assert.match(
    receipt,
    /\.select\("timezone, locale"\)/,
    'the club lookup carries the locale',
  );
  assert.doesNotMatch(
    receipt,
    /Intl\.DateTimeFormat\("en-GB"/,
    'no pinned display locale — the club says how dates are spelled',
  );
  assert.match(
    receipt,
    /translate\(locale, "/,
    'the receipt labels go through translate()',
  );
});

test('I18N-5 the Edge copies of i18n and the catalog are generated', async () => {
  const { generate, CONTRACTS } = await import('../../scripts/sync-edge-schemas.mjs');

  for (const [source, target] of [
    [CORE, DEPLOYED_I18N],
    [CATALOG, DEPLOYED_CATALOG],
  ]) {
    assert.ok(
      CONTRACTS.some((contract) => contract.source === source && contract.target === target),
      `${source} must be registered in scripts/sync-edge-schemas.mjs`,
    );
    assert.equal(
      read(target),
      generate(read(source), source),
      `${target} is stale — run: node scripts/sync-edge-schemas.mjs`,
    );
  }

  // The copy's one relative import resolves to the generated catalog beside it.
  assert.match(read(DEPLOYED_I18N), /from '\.\/messages\.th(\.ts)?'/);
});

test('I18N-6 t() is called with literal keys', () => {
  // A bare variable (or a function call's result) as the key cannot be
  // checked against the catalog; a ternary of literals can — both branches
  // are right there in the source for I18N-2 to verify.
  const DYNAMIC = [
    /\bt\(\s*[A-Za-z_$][\w$]*\s*[,)]/,
    /\bt\(\s*[A-Za-z_$][\w$]*\(/,
  ];
  for (const [file, src] of mobileSources()) {
    for (const pattern of DYNAMIC) {
      const match = src.match(pattern);
      assert.equal(
        match,
        null,
        `${file} calls t() with a dynamic key (${JSON.stringify(match?.[0] ?? '')}) — it cannot be checked against the catalog`,
      );
    }
  }
});

test('I18N-7 the greeting travels through the same layer', () => {
  const home = read('apps/mobile/src/app/(tabs)/index.tsx');
  assert.match(
    home,
    /clubGreeting\([\s\S]{0,60}display\.locale/,
    'the greeting takes the club locale into the translation layer',
  );

  // The four phrases are English copy like any other: each must have a Thai
  // entry (greeting.ts resolves them through translate()).
  const catalog = catalogKeys();
  for (const phrase of ['Good morning', 'Good afternoon', 'Good evening', 'Good night']) {
    assert.ok(
      catalog.has(phrase),
      `the greeting "${phrase}" must be translated in ${CATALOG}`,
    );
  }
});

test('I18N-8 no user-facing copy in the apps is left unwrapped', () => {
  // The counterpart of I18N-2: a string nobody wrapped never reaches the
  // catalog, so a Thai club would render it in English. The patterns are
  // deliberately conservative — they flag what is unmistakably copy (props,
  // alert titles, single-line JSX text, ternary branches) and leave content
  // (legal documents, club-authored news) and code alone.
  const RAW = [
    [/\b(label|title|placeholder|description)="[A-Za-z]/, 'a copy prop with a raw string'],
    [/Alert\.alert\(\s*'[A-Za-z]/, 'an alert title with a raw string'],
    [/\btext:\s*'[A-Za-z][^']*[ ]/, 'an alert button with a raw string'],
    [
      />\s*([A-Za-z][A-Za-z0-9'’,.!?\-]*(?: [A-Za-z0-9'’,.!?\-]+)+|[A-Z]{3,})\s*</,
      'JSX text with a raw string',
    ],
    [/\?\s*'[A-Z][a-z]+ [^']+'/, 'a ternary branch with raw copy'],

  ];
  const failures = [];
  for (const [file, src] of mobileSources()) {
    // UI code only: legal documents are content (a reviewed translation, not
    // a codemod), tests assert what they assert, and `lib/` holds the error
    // vocabulary, whose messages are English across every tier (PLAN's note).
    if (/\/legal\//.test(file) || /__tests__\//.test(file) || /\/lib\//.test(file)) continue;
    for (const [pattern, why] of RAW) {
      const match = src.match(pattern);
      if (!match) continue;
      if (pattern.source.startsWith('\\?')) {
        // A ternary *inside* a t() call is already wrapped — both branches
        // are literal keys, which is exactly what the catalog can check.
        const before = src.slice(Math.max(0, match.index - 40), match.index);
        if (before.includes('t(')) continue;
      }
      failures.push(`${file}: ${why} — ${JSON.stringify(match[0].slice(0, 60))}`);
    }
  }
  // Copy before an expression, inside a tag: `>Copy {value}<` — the braces
  // break every alphabet above, so it gets its own anchored rule.
  const BEFORE_EXPR = /(?<!=)>\s*\n?\s*[A-Za-z][^<>{}=\n]*\{\s*[A-Za-z]/g;
  for (const [file, src] of mobileSources()) {
    if (/\/legal\//.test(file) || /__tests__\//.test(file) || /\/lib\//.test(file)) continue;
    const match = src.match(BEFORE_EXPR);
    if (match) failures.push(`${file}: copy before an expression, unwrapped — ${JSON.stringify(match[0].slice(0, 60))}`);
  }

  assert.deepEqual(failures, [], `unwrapped copy:\n  ${failures.join('\n  ')}`);
});
