// BRAND-1 — the app icons are the house mark, not the Expo template.
//
// The artwork lives in two forms: the full lockup (`splash-icon.png`, crest
// plus wordmark) and the crest alone (`brand-mark.png`), which the adaptive
// icon, the favicons and the in-app marks all derive from. `icon.png` is the
// one tile that must stay opaque and square: the stores mask the corners, they
// do not composite a transparent icon onto a background.
//
// The size budgets are part of the contract: the previous splash asset was a
// 1.6 MB JPEG saved as PNG, and "minimise the assets" is only true while a gate
// keeps it true.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const read = (path) => readFileSync(resolve(root, path));

const ICONS = {
  icon: 'apps/mobile/assets/images/icon.png',
  splash: 'apps/mobile/assets/images/splash-icon.png',
  foreground: 'apps/mobile/assets/images/android-icon-foreground.png',
  background: 'apps/mobile/assets/images/android-icon-background.png',
  monochrome: 'apps/mobile/assets/images/android-icon-monochrome.png',
  favicon: 'apps/mobile/assets/images/favicon.png',
  mark: 'apps/mobile/assets/images/brand-mark.png',
};

/** PNG header: width, height, colour type and whether it carries a tRNS chunk. */
const png = (path) => {
  const buffer = read(path);
  assert.ok(buffer.subarray(1, 4).toString() === 'PNG', `${path} must be a PNG`);
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer[25],
    // Colour types 4 and 6 have an alpha channel; palettes carry one in tRNS.
    hasAlpha: buffer[25] === 4 || buffer[25] === 6 || buffer.includes('tRNS'),
    bytes: statSync(resolve(root, path)).size,
  };
};

test('BRAND-1 every icon the app config names exists', () => {
  const config = readFileSync(resolve(root, 'apps/mobile/app.config.ts'), 'utf8');

  for (const [name, path] of Object.entries(ICONS)) {
    assert.ok(existsSync(resolve(root, path)), `${name} icon is missing at ${path}`);
    // `brand-mark.png` is rendered by components, not named by the config.
    if (name === 'mark') continue;
    assert.ok(config.includes(`./${path.replace('apps/mobile/', '')}`), `${name} must be referenced by app.config.ts`);
  }
});

test('BRAND-2 the app icon is a 1024 square with no transparency', () => {
  const icon = png(ICONS.icon);

  assert.equal(icon.width, 1024, 'iOS and Android both want a 1024px store icon');
  assert.equal(icon.height, 1024, 'the app icon must be square — the mask is applied at install time');
  assert.equal(icon.hasAlpha, false, 'a transparent app icon is rejected by the stores; keep the navy field');
});

test('BRAND-3 the splash and adaptive marks carry transparency', () => {
  // The splash is composited on the brand night, and the adaptive foreground
  // on the adaptive background: both must let the background through.
  for (const name of ['splash', 'foreground', 'monochrome', 'favicon', 'mark']) {
    const image = png(ICONS[name]);
    assert.equal(image.hasAlpha, true, `${name} must keep an alpha channel`);
  }

  const config = readFileSync(resolve(root, 'apps/mobile/app.config.ts'), 'utf8');
  const width = config.match(/imageWidth:\s*(\d+)/);
  assert.ok(width, 'the splash must set imageWidth explicitly');
  assert.ok(
    Number(width[1]) >= 160,
    'the lockup carries the wordmark — below 160dp it is a smudge',
  );
});

test('BRAND-4 every in-app logo renders the mark, not a letter tile', () => {
  const marks = {
    splash: ['apps/mobile/src/app/_layout.tsx', '../../assets/images/brand-mark.png'],
    welcome: ['apps/mobile/src/app/(auth)/welcome.tsx', '../../../assets/images/brand-mark.png'],
    admin: ['apps/admin/src/components/logo.tsx', '/brand-mark.png'],
  };

  for (const [name, [file, source]] of Object.entries(marks)) {
    const text = readFileSync(resolve(root, file), 'utf8');
    assert.ok(text.includes(source), `${name} must render ${source}`);
  }

  assert.ok(
    existsSync(resolve(root, 'apps/admin/public/brand-mark.png')),
    'the admin console serves the mark from /public',
  );
  assert.ok(
    existsSync(resolve(root, 'apps/admin/src/app/favicon.ico')),
    'the admin console keeps a favicon route',
  );
});

test('BRAND-5 the icon set stays small enough to commit', () => {
  let total = 0;

  for (const [name, path] of Object.entries(ICONS)) {
    const { bytes } = png(path);
    total += bytes;
    assert.ok(bytes <= 320 * 1024, `${name} is ${(bytes / 1024).toFixed(0)} KB — regenerate it, do not commit a photo`);
  }

  assert.ok(
    total <= 512 * 1024,
    `the icon set is ${(total / 1024).toFixed(0)} KB; it was 1.7 MB before the artwork was optimised`,
  );
});
