import { describe, expect, it } from 'vitest';

import {
  assertMinorUnits,
  currencySymbol,
  formatMoney,
  isMinorUnits,
  majorToMinorUnits,
  minorUnitScale,
  sumMinorUnits,
  toMajorUnits,
} from '../money';

describe('money', () => {
  it('converts whole major units to minor units', () => {
    expect(majorToMinorUnits(1500, 'THB')).toBe(150000);
  });

  it('converts fractional major units to minor units', () => {
    expect(majorToMinorUnits(19.99, 'THB')).toBe(1999);
  });

  it('converts for a zero-decimal currency without the ×100 lie', () => {
    expect(majorToMinorUnits(1500, 'JPY')).toBe(1500);
  });

  it('rounds floating-point drift to the nearest minor unit', () => {
    expect(majorToMinorUnits(0.1 + 0.2, 'THB')).toBe(30);
    expect(majorToMinorUnits(1550.505, 'THB')).toBe(155051);
  });

  it('rejects non-finite major units', () => {
    expect(() => majorToMinorUnits(Number.NaN, 'THB')).toThrow(RangeError);
    expect(() => majorToMinorUnits(Number.POSITIVE_INFINITY, 'THB')).toThrow(RangeError);
  });

  it('converts minor units back to the major unit', () => {
    expect(toMajorUnits(155050, 'THB')).toBe(1550.5);
    expect(toMajorUnits(0, 'THB')).toBe(0);
    expect(toMajorUnits(1500, 'JPY')).toBe(1500);
  });

  it('sums minor-unit amounts', () => {
    expect(sumMinorUnits([35000, 45000, 85000])).toBe(165000);
    expect(sumMinorUnits([])).toBe(0);
  });

  it('rejects non-integer members when summing', () => {
    expect(() => sumMinorUnits([35000, 45000.5])).toThrow(RangeError);
  });

  it('assertMinorUnits returns valid amounts and rejects invalid ones', () => {
    expect(assertMinorUnits(35000, 'price')).toBe(35000);
    expect(() => assertMinorUnits(1.5)).toThrow(RangeError);
    expect(() => assertMinorUnits(-1)).toThrow(RangeError);
    expect(() => assertMinorUnits(Number.NaN)).toThrow(RangeError);
    expect(() => assertMinorUnits(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });

  it('isMinorUnits guards integers', () => {
    expect(isMinorUnits(0)).toBe(true);
    expect(isMinorUnits(35000)).toBe(true);
    expect(isMinorUnits(1.2)).toBe(false);
    expect(isMinorUnits('100')).toBe(false);
    expect(isMinorUnits(-5)).toBe(false);
    expect(isMinorUnits(Number.NaN)).toBe(false);
  });
});

describe('minorUnitScale', () => {
  it('uses two decimals for the common currencies', () => {
    expect(minorUnitScale('THB')).toBe(2);
    expect(minorUnitScale('USD')).toBe(2);
    expect(minorUnitScale('eur')).toBe(2);
  });

  it('knows the zero-decimal currencies', () => {
    expect(minorUnitScale('JPY')).toBe(0);
    expect(minorUnitScale('KRW')).toBe(0);
    expect(minorUnitScale('VND')).toBe(0);
  });

  it('knows the three-decimal currencies', () => {
    expect(minorUnitScale('KWD')).toBe(3);
    expect(minorUnitScale('BHD')).toBe(3);
  });

  it('rejects anything that is not a three-letter code', () => {
    expect(() => minorUnitScale('BAHT')).toThrow(RangeError);
    expect(() => minorUnitScale('')).toThrow(RangeError);
  });
});

describe('formatMoney', () => {
  it('formats THB minor units with the baht symbol', () => {
    expect(formatMoney(150000, 'THB')).toBe('฿1,500');
    expect(formatMoney(0, 'THB')).toBe('฿0');
  });

  it('keeps two decimals for a fractional THB amount — grouped', () => {
    expect(formatMoney(155050, 'THB')).toBe('฿1,550.50');
  });

  it('formats a zero-decimal currency without decimals (JPY)', () => {
    expect(formatMoney(1500, 'JPY')).toBe('¥1,500');
  });

  it('formats a three-decimal currency with three decimals when fractional (KWD)', () => {
    expect(formatMoney(1500500, 'KWD')).toBe('KWD 1,500.500');
    expect(formatMoney(1500000, 'KWD')).toBe('KWD 1,500');
  });

  it('falls back to the ISO code for a currency with no display symbol', () => {
    expect(formatMoney(150000, 'XYZ')).toBe('XYZ 1,500');
  });

  it('rejects a malformed currency code', () => {
    expect(() => formatMoney(1, 'TH')).toThrow(RangeError);
  });
});

describe('currencySymbol', () => {
  it('is case-insensitive and falls back to the code with its space', () => {
    expect(currencySymbol('thb')).toBe('฿');
    expect(currencySymbol('JPY')).toBe('¥');
    expect(currencySymbol('XYZ')).toBe('XYZ ');
  });

  it('rejects a malformed currency code', () => {
    expect(() => currencySymbol('B')).toThrow(RangeError);
  });
});
