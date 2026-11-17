import { CLUB_TIMEZONE } from './constants';
import { formatMoney } from './money';

/**
 * What a club's display needs: its locale (how a month is spelled) and its
 * time zone (where 18:00 lives). The defaults are the product's platform
 * constants — a *default*, not the truth (C8.2c): the app passes the club's
 * values once it knows them (C8.2d), and the white-label `bootstrap` (C9)
 * will carry them in the claim.
 */
export interface DisplayOptions {
  locale?: string;
  timezone?: string;
}

const DEFAULT_LOCALE = 'en-GB';

function display(opts?: DisplayOptions): { locale: string; timezone: string } {
  return { locale: opts?.locale ?? DEFAULT_LOCALE, timezone: opts?.timezone ?? CLUB_TIMEZONE };
}

/** Formats THB, e.g. 150000 → "฿1,500". One formatter — this delegates. */
export function formatTHB(satang: number): string {
  return formatMoney(satang, 'THB');
}

/** e.g. "Sat 14 Nov" in the club's time zone (Bangkok by default). */
export function formatMatchDate(iso: string, opts?: DisplayOptions): string {
  const { locale, timezone } = display(opts);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  }).format(new Date(iso));
}

/** e.g. "18:00" in the club's time zone (24-hour). */
export function formatMatchTime(iso: string, opts?: DisplayOptions): string {
  const { locale, timezone } = display(opts);
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: timezone,
  }).format(new Date(iso));
}

/** e.g. "Saturday 14 November 2026" in the club's time zone. */
export function formatFullDate(iso: string, opts?: DisplayOptions): string {
  const { locale, timezone } = display(opts);
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(new Date(iso));
}

/** e.g. "14 Nov 2026" in the club's time zone. */
export function formatShortDate(iso: string, opts?: DisplayOptions): string {
  const { locale, timezone } = display(opts);
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: timezone,
  }).format(new Date(iso));
}

/** "Sat 14 Nov · 18:00–20:00" (or a single time when `endIso` is omitted). */
export function formatMatchDateTimeRange(
  startIso: string,
  endIso?: string,
  opts?: DisplayOptions,
): string {
  const date = formatMatchDate(startIso, opts);
  const start = formatMatchTime(startIso, opts);
  const range = endIso ? `${start}–${formatMatchTime(endIso, opts)}` : start;
  return `${date} · ${range}`;
}
