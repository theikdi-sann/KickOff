// GENERATED FILE — do not edit.
// Source: packages/shared/src/money.ts
// Regenerate: node scripts/sync-edge-schemas.mjs
//
// Supabase deploys only `supabase/functions/**`, so this copy cannot be an
// import from `@kickoff/shared`. It is generated from the canonical source,
// and a contract test fails if it drifts.

/**
 * Money in integer minor units — the one owner of the scale, the arithmetic
 * and the display format.
 *
 * This module is deliberately self-contained (no imports): Supabase deploys
 * only `supabase/functions/**`, so the generated Edge copy
 * (`_shared/money.ts`) must stay valid under Deno's module resolution, and the
 * receipt PDF formats money the same way the apps do (D-13).
 */

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

/**
 * The display symbol for a currency; the ISO code (with a space) when unknown.
 *
 * A symbol table rather than `Intl`'s `currencyDisplay`: the formatter below
 * owns the scale, and a second source of truth for the display would be the
 * drift the "one owner" rule exists to prevent.
 */
const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  THB: '฿',
  JPY: '¥',
  USD: '$',
  EUR: '€',
};

/** e.g. "THB" → "฿", "XYZ" → "XYZ " (the code, with the space it needs). */
export function currencySymbol(currency: string): string {
  if (typeof currency !== 'string' || !ISO_4217_CODE.test(currency)) {
    throw new RangeError('currencySymbol expects a three-letter ISO-4217 code');
  }
  const code = currency.toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

/**
 * Formats integer minor units for any currency — the one money formatter.
 *
 * 150000 THB → "฿1,500" · 1500 JPY → "¥1,500" · 1500500 KWD → "KWD 1,500.500".
 * The scale comes from `minorUnitScale()`, so a zero-decimal currency never
 * renders with decimals and a three-decimal currency keeps three when the
 * amount is fractional. Whole amounts keep the house style (no ".00").
 *
 * @param minorUnits integer amount in the currency's minor unit
 * @param currency ISO-4217 code
 * @param locale display locale (defaults to the product's `en-GB`)
 */
export function formatMoney(minorUnits: number, currency: string, locale = 'en-GB'): string {
  const scale = minorUnitScale(currency);
  const major = minorUnits / 10 ** scale;
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: major % 1 === 0 ? 0 : scale,
    maximumFractionDigits: scale,
  }).format(major);
  return `${currencySymbol(currency)}${formatted}`;
}

/**
 * Major unit → integer minor units for a currency
 * (1500 THB → 150000 satang, 1500 JPY → 1500 yen), rounding to the nearest
 * minor unit.
 */
export function majorToMinorUnits(major: number, currency: string): number {
  if (!Number.isFinite(major)) {
    throw new RangeError('majorToMinorUnits expects a finite number');
  }
  return Math.round(major * 10 ** minorUnitScale(currency));
}

/** Integer minor units → the major unit. Use only for display, never for storage. */
export function toMajorUnits(minorUnits: number, currency: string): number {
  assertMinorUnits(minorUnits);
  return minorUnits / 10 ** minorUnitScale(currency);
}

/** Sums minor-unit amounts, keeping the total an integer. */
export function sumMinorUnits(values: readonly number[]): number {
  return values.reduce((total, value) => total + assertMinorUnits(value), 0);
}

/**
 * Throws unless `value` is a non-negative safe integer number of minor units.
 * Returns the value so it can be used inline (`sumMinorUnits`).
 */
export function assertMinorUnits(value: number, label = 'amount'): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of minor units`);
  }
  if (value < 0) {
    throw new RangeError(`${label} must not be negative`);
  }
  return value;
}

/** Type guard for a valid minor-unit amount. */
export function isMinorUnits(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
