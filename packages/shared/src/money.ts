import { SATANG_PER_BAHT } from './constants';

/** Converts baht to integer satang, rounding to the nearest satang. */
export function bahtToSatang(baht: number): number {
  if (!Number.isFinite(baht)) {
    throw new RangeError('bahtToSatang expects a finite number');
  }
  return Math.round(baht * SATANG_PER_BAHT);
}

/** Converts integer satang to baht. Use only for display, never for storage. */
export function satangToBaht(satang: number): number {
  assertSatang(satang);
  return satang / SATANG_PER_BAHT;
}

/** Sums satang amounts, keeping the total an integer. */
export function sumSatang(values: readonly number[]): number {
  return values.reduce((total, value) => total + assertSatang(value), 0);
}

/**
 * Throws unless `value` is a non-negative safe integer number of satang.
 * Returns the value so it can be used inline (`sumSatang`).
 */
export function assertSatang(value: number, label = 'amount'): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of satang`);
  }
  if (value < 0) {
    throw new RangeError(`${label} must not be negative`);
  }
  return value;
}

/** Type guard for a valid satang amount. */
export function isSatang(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
