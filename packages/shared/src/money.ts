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

/**
 * ISO-4217 currencies whose minor unit is not the usual two decimals.
 *
 * The list is the one the Stripe API uses: an amount is always in the
 * currency's minor unit, so a zero-decimal currency such as JPY is stored as
 * whole yen, never as hundredths. Keep this table in step with
 * `public.minor_units(text)` in SQL (migration `0040`); the pgTAP suite
 * (`supabase/tests/tenants.test.sql`) pins both to the same expected values.
 */
const MINOR_UNIT_SCALE: Readonly<Record<string, 0 | 2 | 3>> = {
  // Three decimals.
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  // Zero decimals.
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
};

/** The scale used for every currency absent from `MINOR_UNIT_SCALE`. */
const DEFAULT_MINOR_UNIT_SCALE = 2;

/** An ISO-4217 code: exactly three ASCII letters. */
const ISO_4217_CODE = /^[A-Za-z]{3}$/;

/**
 * Number of decimals in a currency's minor unit (THB → 2, JPY → 0, KWD → 3).
 *
 * Every stored amount is an integer in the currency's minor unit; this is the
 * one owner of the scale on the client side, mirrored by
 * `public.minor_units(text)` in SQL.
 *
 * @param currency ISO-4217 code, case-insensitive
 * @throws RangeError when the code is not three letters
 */
export function minorUnitScale(currency: string): 0 | 2 | 3 {
  if (typeof currency !== 'string' || !ISO_4217_CODE.test(currency)) {
    throw new RangeError('minorUnitScale expects a three-letter ISO-4217 code');
  }
  return MINOR_UNIT_SCALE[currency.toUpperCase()] ?? DEFAULT_MINOR_UNIT_SCALE;
}
