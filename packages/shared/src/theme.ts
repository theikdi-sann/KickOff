/**
 * KickOff brand tokens — the single source of truth for brand colour.
 *
 * Re-skinning the product should only require editing the hex values below:
 * the mobile app reads these through `apps/mobile/src/lib/theme.ts`, and the
 * admin console receives them as CSS custom properties from
 * `apps/admin/src/app/layout.tsx`.
 *
 * Keep `brandCssVariables` in sync with the keys referenced by
 * `apps/admin/src/app/globals.css`.
 */
export const brand = {
  /**
   * Black — the primary action, active navigation and crest base. White text
   * on it clears 21:1; gold clears 13:1, so both survive on the same surface.
   */
  primary: '#000000',
  /** Royal blue — links, secondary actions, crest highlight and focus. */
  primaryBright: '#184794',
  /** Deep navy — gradient anchor, icons on light, pressed states. */
  primaryDark: '#0B1B33',
  /** Ink navy — the deepest surface and full-bleed overlays. */
  primaryDeep: '#07101F',
  /** Warm gold — highlights, badges, active tab on dark, hero accents. */
  accent: '#FFCA6F',
  /** Amber ink — gold-family text and icons on light surfaces. */
  accentDeep: '#8A5A00',
  /** Pale gold — borders, reserved states and soft highlights. */
  accentSoft: '#F6D79A',
  /** Gold ink — text on a soft-gold chip (7.2:1). */
  goldInk: '#6B4A00',
  /** Neutrals. */
  ink: '#0A0F1A',
  inkMuted: '#475569',
  muted: '#5B6779',
  /** Legacy key name: the muted caption tone, now blue-grey. */
  mutedGreen: '#56637A',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  card: '#FFFFFF',
  border: '#E2E8F0',
  /** App chrome. */
  appBackground: '#F1F5F9',
  line: '#E2E8F0',
  /**
   * Soft chip surface. The key is legacy (it predates the blue palette); it
   * backs positive/info chips with dark text, so it is a pale blue tint rather
   * than a green one.
   */
  softGreen: '#E8EFFB',
  softGold: '#FFF1D9',
  shadow: '#0A1628',
  /** Night / dark surfaces — navy-black, so gold reads as the only warm note. */
  night: '#070C17',
  nightMid: '#0E1A33',
  nightCard: '#141F38',
  nightBorder: '#26324D',
  nightText: '#F8FAFC',
  nightMuted: '#A9B6CC',
  /** Status colours — semantic, not brand. */
  danger: '#DC2626',
  warning: '#B45309',
} as const;

/**
 * Status tones — the one language for badges, pills and alerts.
 *
 * Both products draw these: the console maps each tone to its Tailwind recipe
 * in `apps/admin/src/components/ui.tsx`, and the app reads the hex values
 * directly through `apps/mobile/src/lib/theme.ts`. Every light pair clears
 * 4.5:1 on its own surface, which is what the 9–10 px bold uppercase chips
 * need. `dark` is the on-navy variant.
 */
export const status = {
  green: { bg: '#ECFDF5', fg: '#047857', border: '#A7F3D0' },
  gold: { bg: '#FFFBEB', fg: '#B45309', border: '#FDE68A' },
  red: { bg: '#FEF2F2', fg: '#B91C1C', border: '#FECACA' },
  muted: { bg: '#F1F5F9', fg: '#475569', border: '#E2E8F0' },
  blue: { bg: '#F0F9FF', fg: '#0369A1', border: '#BAE6FD' },
  dark: { bg: 'rgba(255,255,255,0.10)', fg: '#FFFFFF', border: 'rgba(255,255,255,0.15)' },
} as const;

/** A status tone's name. */
export type StatusTone = keyof typeof status;

/** Backwards-compatible alias: prefer `brand` in new code. */
export const palette = brand;

/**
 * CSS custom properties consumed by the admin console. Applied to `<html>` so
 * Tailwind's `@theme inline` mappings can resolve them everywhere.
 */
export const brandCssVariables = {
  '--brand-primary': brand.primary,
  '--brand-primary-bright': brand.primaryBright,
  '--brand-primary-dark': brand.primaryDark,
  '--brand-primary-deep': brand.primaryDeep,
  '--brand-accent': brand.accent,
  '--brand-accent-deep': brand.accentDeep,
  '--brand-accent-soft': brand.accentSoft,
  '--brand-gold-ink': brand.goldInk,
  '--brand-ink': brand.ink,
  '--brand-ink-muted': brand.inkMuted,
  '--brand-muted': brand.muted,
  '--brand-muted-green': brand.mutedGreen,
  '--brand-surface': brand.surface,
  '--brand-surface-alt': brand.surfaceAlt,
  '--brand-card': brand.card,
  '--brand-border': brand.border,
  '--brand-app-background': brand.appBackground,
  '--brand-line': brand.line,
  '--brand-soft-green': brand.softGreen,
  '--brand-soft-gold': brand.softGold,
  '--brand-shadow': brand.shadow,
  '--brand-night': brand.night,
  '--brand-night-mid': brand.nightMid,
  '--brand-night-card': brand.nightCard,
  '--brand-night-border': brand.nightBorder,
  '--brand-night-text': brand.nightText,
  '--brand-night-muted': brand.nightMuted,
  '--brand-danger': brand.danger,
  '--brand-warning': brand.warning,
} as const;

export const typography = {
  display: 'BarlowCondensed_700Bold',
  displayMedium: 'BarlowCondensed_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_700Bold',
} as const;
