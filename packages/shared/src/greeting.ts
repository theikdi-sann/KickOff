/**
 * Time-aware greeting pinned to Thailand time (P11-12).
 *
 * Devices travel, so the greeting must follow the club's timezone rather than
 * `Date#getHours()`. `Intl` does the offset math (including the fixed UTC+7
 * offset Bangkok has used since 1941) without hard-coding +7.
 */
const BANGKOK_HOUR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  hour: "numeric",
  hourCycle: "h23",
});

/** Hour of day (0–23) in Asia/Bangkok for the given instant. */
export function bangkokHour(date: Date = new Date()): number {
  const hour = Number(BANGKOK_HOUR.format(date));
  // Some ICU builds emit 24 for midnight under h23.
  return hour === 24 ? 0 : hour;
}

export type GreetingPeriod = "morning" | "afternoon" | "evening" | "night";

export function bangkokPeriod(date: Date = new Date()): GreetingPeriod {
  const hour = bangkokHour(date);
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

const GREETINGS: Record<GreetingPeriod, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Good night",
};

export function bangkokGreeting(date: Date = new Date()): string {
  return GREETINGS[bangkokPeriod(date)];
}
