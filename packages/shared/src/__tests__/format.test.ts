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

  it('keeps two decimals for fractional baht', () => {
    expect(formatTHB(155050)).toBe('฿1550.50');
  });
});

describe('date formatting pinned to Asia/Bangkok', () => {
  it('formats the match date', () => {
    expect(formatMatchDate(KICKOFF)).toBe('Sat 14 Nov');
  });

  it('formats kick-off time in 24-hour Bangkok time', () => {
    expect(formatMatchTime(KICKOFF)).toBe('18:00');
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
