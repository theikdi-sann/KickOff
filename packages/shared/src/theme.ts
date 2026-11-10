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
  /** Pitch green — primary actions, crests and active navigation. */
  primary: '#0B6B3A',
  primaryBright: '#16A34A',
  primaryDark: '#064E2B',
  primaryDeep: '#0B2417',
  /** Trophy gold — highlights, badges and the club crest mark. */
  accent: '#F4C430',
  accentDeep: '#92400E',
  accentSoft: '#FDE68A',
  goldInk: '#8A6400',
  /** Neutrals. */
  ink: '#0F172A',
  inkMuted: '#475569',
  muted: '#64748B',
  mutedGreen: '#52665B',
  surface: '#F8FAFC',
  surfaceAlt: '#F1F5F9',
  card: '#FFFFFF',
  border: '#E2E8F0',
  /** App chrome. */
  appBackground: '#F5F7F6',
  line: '#E5EAE7',
  softGreen: '#E7F4EC',
  softGold: '#FEF7DF',
  shadow: '#0B2016',
  /** Night / dark surfaces. */
  night: '#07130D',
  nightMid: '#0A2B1B',
  nightCard: '#10231A',
  nightBorder: '#1E3A2B',
  nightText: '#ECFDF3',
  nightMuted: '#9CB8A8',
  /** Status colours. */
  danger: '#DC2626',
  warning: '#D97706',
} as const;

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
