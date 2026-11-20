// C8.2a — one money formatter, one owner.
//
// `formatTHB` was the only formatter and hardcoded ฿ and /100 — a JPY club
// (0 decimals) or KWD club (3 decimals) would render wrong prices in both
// apps, and the receipt PDF carried a second private copy (`thb()`). The
// sweep: `formatMoney(minorUnits, currency, locale?)` in a self-contained
// `money.ts`, and the satang-branded helpers renamed to neutral minor-unit
// names — "satang" lies for every currency that is not THB.
//
//   MF-1  money.ts is self-contained (portable to the Edge copy, C8.2b)
//   MF-2  format.ts holds no second money-formatting implementation —
//         formatTHB delegates to formatMoney
//   MF-3  the satang vocabulary is gone from the source
//   MF-4  the formatter's tests cover the three scales
//   MF-5  the deployed Edge money copy is generated, never hand-edited
//   MF-6  the receipt formats with formatMoney and the order's own currency —
//         no private `thb()` and no hardcoded THB
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const MONEY = 'packages/shared/src/money.ts';
const FORMAT = 'packages/shared/src/format.ts';
const TESTS = 'packages/shared/src/__tests__/money.test.ts';
const DEPLOYED_MONEY = 'supabase/functions/_shared/money.ts';
const RECEIPT = 'supabase/functions/receipt/index.ts';

test('MF-1 money.ts is self-contained so the Edge copy can be generated', () => {
  const source = read(MONEY);
  assert.doesNotMatch(
    source,
    /^import\s/m,
    'money.ts must not import anything — the generated Edge copy cannot resolve relative imports',
  );
});

test('MF-2 format.ts holds no second money-formatting implementation', () => {
  const source = read(FORMAT);

  assert.match(
    source,
    /import \{ formatMoney \} from '\.\/money';/,
    'format.ts must import the one formatter',
  );
  // formatTHB is THB's coat over formatMoney, not a second implementation.
  assert.match(
    source,
    /export function formatTHB[\s\S]{0,120}return formatMoney\(satang, 'THB'\);/,
    'formatTHB must delegate to formatMoney',
  );
  // No private arithmetic left: no division by a hardcoded scale, no ฿
  // template, no toFixed in the formatter path.
  assert.doesNotMatch(source, /\/ *100|\/ *SATANG|toFixed/);
  assert.doesNotMatch(source, /`฿\$\{/);
});

test('MF-3 the satang vocabulary is gone from the source', () => {
  for (const gone of [
    'bahtToSatang',
    'satangToBaht',
    'sumSatang',
    'assertSatang',
    'isSatang',
    'SATANG_PER_BAHT',
  ]) {
    for (const file of [MONEY, FORMAT, 'packages/shared/src/constants.ts']) {
      assert.ok(
        !read(file).includes(gone),
        `${file} must not contain the THB-only name ${gone}`,
      );
    }
  }
});

test('MF-4 the formatter tests cover the three scales', () => {
  const tests = read(TESTS);
  assert.match(tests, /formatMoney\(150000, 'THB'\)/, 'THB (scale 2)');
  assert.match(tests, /formatMoney\(1500, 'JPY'\)/, 'JPY (scale 0)');
  assert.match(tests, /formatMoney\(1500500, 'KWD'\)/, 'KWD (scale 3)');
});

test('MF-5 the deployed Edge money copy is generated, never hand-edited', async () => {
  const { generate } = await import('../../scripts/sync-edge-schemas.mjs');
  const expected = generate(read(MONEY), MONEY);

  assert.equal(
    read(DEPLOYED_MONEY),
    expected,
    `${DEPLOYED_MONEY} is stale — run: node scripts/sync-edge-schemas.mjs`,
  );
});

test('MF-6 the receipt formats money from the order currency with an ASCII scale', () => {
  const receipt = read(RECEIPT);

  assert.match(
    receipt,
    /import \{ minorUnitScale \} from "\.\.\/_shared\/money\.ts";/,
    'the receipt must take the scale from the generated money module',
  );
  assert.match(receipt, /currency: string/, 'the receipt row must carry the order currency');
  assert.match(
    receipt,
    /pdfMoney\([^,]+,\s*receipt\.currency\)/,
    'the receipt must format with the order currency',
  );
  assert.match(receipt, /currency\.toUpperCase\(\).*formatted/s, 'the PDF uses the ISO code');
  assert.doesNotMatch(receipt, /function thb\(/, 'the private thb() formatter is gone');
  assert.doesNotMatch(receipt, /\/ *100\b/, 'no hardcoded scale division');
});

test('MF-7 the receipt renders dates in the club time zone', () => {
  const receipt = read(RECEIPT);

  assert.match(
    receipt,
    /from\("tenants"\)[\s\S]{0,120}timezone/,
    'the receipt must read the club time zone',
  );
  assert.match(
    receipt,
    /longDate\([^)]*timezone/,
    'the receipt must format its dates in the club time zone',
  );
  assert.doesNotMatch(
    receipt,
    /timeZone: "Asia\/Bangkok"/,
    'the receipt must not pin Bangkok — the club says where it lives',
  );
});
