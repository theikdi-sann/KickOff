import { describe, expect, it } from 'vitest';

import {
  assertSatang,
  bahtToSatang,
  isSatang,
  minorUnitScale,
  satangToBaht,
  sumSatang,
} from '../money';

describe('money', () => {
  it('converts whole baht to satang', () => {
    expect(bahtToSatang(1500)).toBe(150000);
  });

  it('converts fractional baht to satang', () => {
    expect(bahtToSatang(19.99)).toBe(1999);
  });

  it('rounds floating-point drift to the nearest satang', () => {
    expect(bahtToSatang(0.1 + 0.2)).toBe(30);
    expect(bahtToSatang(1550.505)).toBe(155051);
  });

  it('rejects non-finite baht', () => {
    expect(() => bahtToSatang(Number.NaN)).toThrow(RangeError);
    expect(() => bahtToSatang(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('converts satang back to baht', () => {
    expect(satangToBaht(155050)).toBe(1550.5);
    expect(satangToBaht(0)).toBe(0);
  });

  it('sums satang amounts', () => {
    expect(sumSatang([35000, 45000, 85000])).toBe(165000);
    expect(sumSatang([])).toBe(0);
  });

  it('rejects non-integer members when summing', () => {
    expect(() => sumSatang([35000, 45000.5])).toThrow(RangeError);
  });

  it('assertSatang returns valid amounts and rejects invalid ones', () => {
    expect(assertSatang(35000, 'price')).toBe(35000);
    expect(() => assertSatang(1.5)).toThrow(RangeError);
    expect(() => assertSatang(-1)).toThrow(RangeError);
    expect(() => assertSatang(Number.NaN)).toThrow(RangeError);
    expect(() => assertSatang(Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
  });

  it('isSatang guards integers', () => {
    expect(isSatang(0)).toBe(true);
    expect(isSatang(35000)).toBe(true);
    expect(isSatang(1.2)).toBe(false);
    expect(isSatang('100')).toBe(false);
    expect(isSatang(-5)).toBe(false);
    expect(isSatang(Number.NaN)).toBe(false);
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
