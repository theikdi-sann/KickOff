// Option A of the colour-theme pass — one status language for both apps.
//
// The console had six chip tones plus two strays (`amber` duplicating `gold`,
// `violet` on a stat tile). The app had its own five, with `green` rendering as
// a pale blue surface and black text, and no borders anywhere. The same word
// therefore looked different depending on which product you were in.
//
// `packages/shared/src/theme.ts` is now the owner of the six status tones and
// both apps read it. These contracts hold the two ends together:
//   ST-1  the shared package defines exactly the six tones, each with bg/fg/border,
//   ST-2  the console badge map is exactly those six (no amber, no violet),
//   ST-3  the app's Pill carries the same six and draws a border,
//   ST-4  the app's tinted surfaces are the shared tints, not a pale blue,
//   ST-5  no screen asks for a tone that no longer exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { status } from '../../packages/shared/src/theme.ts';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const EXPECTED = {
  green: ['#ECFDF5', '#047857', '#A7F3D0'],
  gold: ['#FFFBEB', '#B45309', '#FDE68A'],
  red: ['#FEF2F2', '#B91C1C', '#FECACA'],
  muted: ['#F1F5F9', '#475569', '#E2E8F0'],
  blue: ['#F0F9FF', '#0369A1', '#BAE6FD'],
  dark: ['rgba(255,255,255,0.10)', '#FFFFFF', 'rgba(255,255,255,0.15)'],
};

const adminUi = read('apps/admin/src/components/ui.tsx');
const mobileTheme = read('apps/mobile/src/lib/theme.ts');
const mobileUi = read('apps/mobile/src/components/ui.tsx');

test('ST-1 the shared package defines the six status tones', () => {
  assert.deepEqual(Object.keys(status).sort(), Object.keys(EXPECTED).sort());
  for (const [tone, [bg, fg, border]] of Object.entries(EXPECTED)) {
    assert.deepEqual(
      { bg: status[tone].bg, fg: status[tone].fg, border: status[tone].border },
      { bg, fg, border },
      `the ${tone} tone must be the agreed colour`,
    );
  }
});

test('ST-2 the console badge map is exactly those six', () => {
  const union = adminUi.match(/type Tone =([^;]+);/);
  assert.ok(union, 'the console must declare one Tone union');
  const names = [...union[1].matchAll(/"([a-z]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(names, Object.keys(EXPECTED).sort(), 'no extra or missing console tone');

  const map = adminUi.slice(adminUi.indexOf('const tones'));
  const entries = [...map.slice(0, map.indexOf('};')).matchAll(/(\w+):\s*"([^"]+)"/g)];
  assert.deepEqual(
    Object.fromEntries(entries.map((entry) => [entry[1], entry[2]])),
    {
      green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      gold: 'bg-amber-50 text-amber-700 border-amber-200',
      red: 'bg-red-50 text-red-700 border-red-200',
      muted: 'bg-slate-100 text-slate-600 border-slate-200',
      blue: 'bg-sky-50 text-sky-700 border-sky-200',
      dark: 'bg-white/10 text-white border-white/15',
    },
    'the console chip classes must be the six agreed recipes',
  );
});

test('ST-3 the app Pill carries the same six tones and draws a border', () => {
  const pill = mobileUi.slice(mobileUi.indexOf('export function Pill'));
  const tones = pill.slice(0, pill.indexOf('})')).match(/tone\?:([^,}]+)/);
  assert.ok(tones, 'Pill must declare its tone union');
  const names = [...tones[1].matchAll(/'([a-z]+)'/g)]
    .map((match) => match[1])
    .filter((name) => name !== 'primary')
    .sort();
  assert.deepEqual(names, Object.keys(EXPECTED).sort(), 'the app must offer the same six tones');
  assert.match(mobileUi, /borderWidth: 1/, 'a chip needs the console border');
  assert.match(mobileUi, /borderColor:\s*\w+\.border/, 'the border comes from the tone');
});

test('ST-4 the app tinted surfaces are the shared status tints', () => {
  assert.match(mobileTheme, /status/, 'the app theme must read the shared status scale');
  assert.match(mobileTheme, /softGreen:\s*status\.green\.bg/, 'softGreen is the emerald tint');
  assert.match(mobileTheme, /softGold:\s*status\.gold\.bg/, 'softGold is the amber tint');
});

test('ST-5 no screen asks for a tone that no longer exists', () => {
  const files = [
    'apps/admin/src/app/dashboard/matches/page.tsx',
    'apps/admin/src/app/dashboard/matches/[id]/page.tsx',
    'apps/admin/src/app/dashboard/overview.tsx',
    'apps/admin/src/app/dashboard/platform/page.tsx',
  ];
  for (const file of files) {
    assert.doesNotMatch(read(file), /<Badge tone="(amber|violet)"|tone="violet"/, `${file} uses a retired badge tone`);
  }
});
