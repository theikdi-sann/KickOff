/**
 * Time-aware greeting in the club's timezone (P11-12, C8.2c/C8.2d, C10.2).
 *
 * Devices travel, so the greeting must follow the club's timezone rather than
 * `Date#getHours()`. `Intl` does the offset math without hard-coding an
 * offset — and the time zone is a parameter, because the club says where it
 * lives (`tenants.timezone`, migration `0053`).
 *
 * The phrase is English copy like any other: it resolves through the
 * translation layer in the club's language (`tenants.locale`), so a Thai
 * club greets in Thai and an untranslated phrase renders in English.
 */
import { localeFromTag, translate } from './i18n';

/** Hour of day (0–23) in the given zone for the given instant. */
function clubHour(date: Date, timezone: string): number {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(date),
  );
  // Some ICU builds emit 24 for midnight under h23.
  return hour === 24 ? 0 : hour;
}

export type GreetingPeriod = 'morning' | 'afternoon' | 'evening' | 'night';

export function clubPeriod(date: Date, timezone: string): GreetingPeriod {
  const hour = clubHour(date, timezone);
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

const GREETINGS: Record<GreetingPeriod, string> = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: 'Good night',
};

/**
 * "Good evening" — by the club's clock, not the device's, in the club's
 * language (the English phrase is the key; see `i18n.ts`).
 */
export function clubGreeting(date: Date, timezone: string, localeTag = 'en-GB'): string {
  return translate(localeFromTag(localeTag), GREETINGS[clubPeriod(date, timezone)]);
}
