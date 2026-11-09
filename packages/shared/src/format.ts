import { CLUB_TIMEZONE, SATANG_PER_BAHT } from './constants';

const LOCALE = 'en-GB';

/** Formats integer satang as Thai baht, e.g. 150000 → "฿1,500". */
export function formatTHB(satang: number): string {
  const baht = satang / SATANG_PER_BAHT;
  const formatted = baht % 1 === 0 ? baht.toLocaleString('en-US') : baht.toFixed(2);
  return `฿${formatted}`;
}

/** e.g. "Sat 14 Nov" in Asia/Bangkok. */
export function formatMatchDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: CLUB_TIMEZONE,
  }).format(new Date(iso));
}

/** e.g. "18:00" in Asia/Bangkok (24-hour). */
export function formatMatchTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: CLUB_TIMEZONE,
  }).format(new Date(iso));
}

/** e.g. "Saturday 14 November 2026" in Asia/Bangkok. */
export function formatFullDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: CLUB_TIMEZONE,
  }).format(new Date(iso));
}

/** e.g. "14 Nov 2026" in Asia/Bangkok. */
export function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: CLUB_TIMEZONE,
  }).format(new Date(iso));
}

/** "Sat 14 Nov · 18:00–20:00" (or a single time when `endIso` is omitted). */
export function formatMatchDateTimeRange(startIso: string, endIso?: string): string {
  const date = formatMatchDate(startIso);
  const start = formatMatchTime(startIso);
  const range = endIso ? `${start}–${formatMatchTime(endIso)}` : start;
  return `${date} · ${range}`;
}
