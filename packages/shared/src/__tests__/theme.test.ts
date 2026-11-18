import { describe, expect, it } from 'vitest';

import { brand, brandCssVariables } from '../theme';

/**
 * THEME-1 — the palette is data, so the only thing worth testing is the part
 * a designer cannot eyeball: contrast. These are the pairs the UI actually
 * renders as text, and every one must clear WCAG AA (4.5:1) — gold-on-black
 * and blue-on-white are the two the whole identity rests on.
 *
 * THEME-2 pins the admin bridge: a token added to `brand` and forgotten in
 * `brandCssVariables` would silently render as the CSS fallback.
 */

const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number => {
  const clean = hex.replace('#', '');
  expect(clean).toHaveLength(6);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: string, b: string): number => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

describe('brand palette', () => {
  it('renders every text pair at WCAG AA or better (THEME-1)', () => {
    const pairs: Array<[string, string, string, number]> = [
      ['body text on the app background', brand.ink, brand.appBackground, 4.5],
      ['muted text on an alternate surface', brand.muted, brand.surfaceAlt, 4.5],
      ['white button text on the primary action', '#FFFFFF', brand.primary, 4.5],
      ['blue links on white', brand.primaryBright, brand.card, 4.5],
      ['gold text on the dark tab bar', brand.accent, brand.night, 7],
      ['gold text on the primary action', brand.accent, brand.primary, 7],
      ['gold ink on a soft-gold chip', brand.goldInk, brand.softGold, 4.5],
      ['deep gold on a soft-gold chip', brand.accentDeep, brand.softGold, 4.5],
      ['dark text on a soft-blue chip', brand.primary, brand.softGreen, 4.5],
      ['muted text on the dark tab bar', brand.nightMuted, brand.night, 4.5],
      ['warning text on white', brand.warning, brand.card, 4.5],
    ];

    for (const [label, fg, bg, minimum] of pairs) {
      const ratio = contrast(fg, bg);
      expect(ratio, `${label}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(minimum);
    }
  });

  it('exports every token to the admin console as a CSS variable (THEME-2)', () => {
    const kebab = (key: string): string =>
      `--brand-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

    for (const [key, value] of Object.entries(brand)) {
      expect(brandCssVariables).toHaveProperty(kebab(key), value);
    }
    expect(Object.keys(brandCssVariables)).toHaveLength(Object.keys(brand).length);
  });
});
