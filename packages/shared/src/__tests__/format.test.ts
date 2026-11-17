import { describe, expect, it } from 'vitest';

import {
  formatFullDate,
  formatMatchDate,
  formatMatchDateTimeRange,
  formatMatchTime,
  formatShortDate,
  formatTHB,
} from '../format';

const KICKOFF = '2026-11-14T18:00:00+07:00';

describe('formatTHB', () => {
  it('omits decimals for whole baht', () => {
    expect(formatTHB(150000)).toBe('฿1,500');
    expect(formatTHB(0)).toBe('฿0');
  });

  it('keeps two decimals for fractional baht — grouped, unlike the old toFixed path', () => {
    expect(formatTHB(155050)).toBe('฿1,550.50');
  });
});

describe('date formatting pinned to Asia/Bangkok', () => {
  it('formats the match date', () => {
    expect(formatMatchDate(KICKOFF)).toBe('Sat 14 Nov');
  });

  it('formats kick-off time in 24-hour Bangkok time', () => {    expect(formatMatchTime(KICKOFF)).toBe('18:00');
  });

  it('converts UTC instants into Bangkok time', () => {
    expect(formatMatchTime('2026-11-14T11:00:00Z')).toBe('18:00');
    expect(formatMatchDate('2026-11-14T11:00:00Z')).toBe('Sat 14 Nov');
  });

  it('handles the UTC-to-Bangkok day rollover', () => {
    expect(formatMatchDate('2026-11-14T17:30:00Z')).toBe('Sun 15 Nov');
    expect(formatMatchTime('2026-11-14T17:30:00Z')).toBe('00:30');
  });

  it('formats full and short dates', () => {
    expect(formatFullDate(KICKOFF)).toBe('Saturday, 14 November 2026');
    expect(formatShortDate(KICKOFF)).toBe('14 Nov 2026');
  });

  it('formats a single time or a range', () => {
    expect(formatMatchDateTimeRange(KICKOFF)).toBe('Sat 14 Nov · 18:00');
    expect(formatMatchDateTimeRange(KICKOFF, '2026-11-14T20:00:00+07:00')).toBe(
      'Sat 14 Nov · 18:00–20:00',
    );
  });
});

describe('club display options (0053, C8.2c)', () => {
  // The formatters take the club's locale and time zone; the defaults are the
  // platform constants — a default, not the truth (C8.2d passes the club's).
  const UTC_NOON = '2026-11-14T12:00:00Z';

  it('renders the same instant in the club time zone', () => {
    // 12:00 UTC is 19:00 in Bangkok, and 12:00 in London — November is GMT
    // (BST ended in October), which is exactly what Intl must know.
    expect(formatMatchTime(UTC_NOON)).toBe('19:00');
    expect(formatMatchTime(UTC_NOON, { timezone: 'Europe/London' })).toBe('12:00');
  });

  it('formats dates in the club locale', () => {
    expect(formatShortDate(UTC_NOON)).toBe('14 Nov 2026');
    expect(formatShortDate(UTC_NOON, { locale: 'en-US' })).toBe('Nov 14, 2026');
  });

  it('passes the club options through the date-time range', () => {
    expect(formatMatchDateTimeRange(UTC_NOON, undefined, { timezone: 'Europe/London' })).toBe(
      'Sat 14 Nov · 12:00',
    );
  });

  it('keeps the platform defaults when no options are given', () => {
    expect(formatMatchTime(UTC_NOON)).toBe('19:00');
    expect(formatShortDate(UTC_NOON)).toBe('14 Nov 2026');
  });
});
