export const palette = {
  primary: '#0B6B3A',
  primaryBright: '#16A34A',
  primaryDark: '#064E2B',
  accent: '#F4C430',
  accentSoft: '#FDE68A',
  ink: '#0F172A',
  inkMuted: '#475569',
  surface: '#F8FAFC',
  surfaceAlt: '#F1F5F9',
  card: '#FFFFFF',
  border: '#E2E8F0',
  danger: '#DC2626',
  warning: '#D97706',
  night: '#07130D',
  nightCard: '#10231A',
  nightBorder: '#1E3A2B',
  nightText: '#ECFDF3',
  nightMuted: '#9CB8A8',
} as const;

export const typography = {
  display: 'BarlowCondensed_700Bold',
  displayMedium: 'BarlowCondensed_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_700Bold',
} as const;

export const mockBadge = 'MOCK DATA';

export function formatTHB(satang: number): string {
  const baht = satang / 100;
  const formatted = baht % 1 === 0 ? baht.toLocaleString('en-US') : baht.toFixed(2);
  return `฿${formatted}`;
}

export function formatMatchDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatMatchTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
