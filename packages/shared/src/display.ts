/**
 * The club's display configuration — how money, dates and greetings render
 * for *this* club (C8.2d).
 *
 * The `tenants` branding row is the source (member-readable since `0040`;
 * the timezone column since `0053`); this module is the one owner of
 * mapping that row to what the formatters take, and of the platform default
 * used before the row arrives (or when it cannot be read).
 */
import { minorUnitScale } from './money';

/** What a club's display needs: how it charges, speaks and keeps time. */
export interface ClubDisplay {
  /** ISO-4217 code the catalogue prices are in. */
  currency: string;
  /** BCP 47 locale (the product's copy is English until C10.2). */
  locale: string;
  /** IANA time zone every kickoff is rendered in. */
  timezone: string;
}

/**
 * The single-club platform default — a *default*, not the truth: the
 * deployment's own club ships THB / en-GB / Asia/Bangkok, and the hook keeps
 * it until the `tenants` row arrives (or if the read fails, which is exactly
 * when the platform default is the honest fallback).
 */
export const PLATFORM_DISPLAY: Readonly<ClubDisplay> = Object.freeze({
  currency: 'THB',
  locale: 'en-GB',
  timezone: 'Asia/Bangkok',
});

/**
 * Maps a `tenants` branding row to the display config, validating each field
 * the way the database validated it at write time — a club row that could not
 * have been provisioned (`0053`) must not reach a formatter:
 *
 * - the currency through `minorUnitScale()` (three ASCII letters),
 * - the time zone through `Intl` itself (an unknown zone throws),
 * - the locale as a non-empty tag.
 *
 * @throws RangeError naming the field that failed
 */
export function displayFromTenant(row: {
  currency: string;
  locale: string;
  timezone: string;
}): ClubDisplay {
  minorUnitScale(row.currency);

  if (typeof row.locale !== 'string' || row.locale.trim().length === 0) {
    throw new RangeError('displayFromTenant expects a locale (for example th-TH)');
  }

  if (typeof row.timezone !== 'string' || row.timezone.trim().length === 0) {
    throw new RangeError('displayFromTenant expects a time zone (for example Asia/Bangkok)');
  }
  try {
    // Intl is the same authority the formatters use: a zone it rejects is a
    // zone no kickoff can be rendered in.
    new Intl.DateTimeFormat('en-GB', { timeZone: row.timezone });
  } catch {
    throw new RangeError(
      `displayFromTenant expects a known time zone, got ${row.timezone}`,
    );
  }

  return {
    currency: row.currency.toUpperCase(),
    locale: row.locale,
    timezone: row.timezone,
  };
}
