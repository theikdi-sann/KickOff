/**
 * Time-aware greeting in the club's timezone (P11-12, C8.2c/C8.2d).
 *
 * Devices travel, so the greeting must follow the club's timezone rather than
 * `Date#getHours()`. `Intl` does the offset math without hard-coding an
 * offset — and the time zone is a parameter, because the club says where it
 * lives (`tenants.timezone`, migration `0053`).
 */

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

/** "Good evening" — by the club's clock, not the device's. */
export function clubGreeting(date: Date, timezone: string): string {
  return GREETINGS[clubPeriod(date, timezone)];
}
