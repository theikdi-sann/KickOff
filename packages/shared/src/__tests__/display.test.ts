import { describe, expect, it } from 'vitest';

import { PLATFORM_DISPLAY, displayFromTenant } from '../display';

describe('displayFromTenant', () => {
  const row = { currency: 'jpy', locale: 'ja-JP', timezone: 'Asia/Tokyo' };

  it('maps the club row to the display config, currency uppercased', () => {
    expect(displayFromTenant(row)).toEqual({
      currency: 'JPY',
      locale: 'ja-JP',
      timezone: 'Asia/Tokyo',
    });
  });

  it('rejects a malformed currency code', () => {
    expect(() => displayFromTenant({ ...row, currency: 'BAHT' })).toThrow(RangeError);
  });

  it('rejects a time zone the database could not have accepted', () => {
    expect(() => displayFromTenant({ ...row, timezone: 'Mars/Olympus' })).toThrow(RangeError);
  });

  it('rejects an empty locale', () => {
    expect(() => displayFromTenant({ ...row, locale: ' ' })).toThrow(RangeError);
  });
});

describe('PLATFORM_DISPLAY', () => {
  it('is the single-club default — a default, not the truth', () => {
    expect(PLATFORM_DISPLAY).toEqual({
      currency: 'THB',
      locale: 'en-GB',
      timezone: 'Asia/Bangkok',
    });
  });
});
