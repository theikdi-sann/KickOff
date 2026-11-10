import posthog from "posthog-js";

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

/**
 * `posthog-js` touches `window` during init, so it is only started in the
 * browser and only when a project token is configured. Server rendering and
 * local runs without a token stay silent (P11-17).
 */
const inBrowser = typeof window !== "undefined";
export const analyticsEnabled = inBrowser && projectToken.length > 0;

if (analyticsEnabled) {
  posthog.init(projectToken, {
    api_host: host,
    capture_pageview: false,
    person_profiles: "identified_only",
  });
}

export type AdminAnalyticsEvent =
  | "admin_signed_in"
  | "fixture_created"
  | "order_refunded"
  | "gate_scan_validated";

export function track(event: AdminAnalyticsEvent, properties?: Record<string, unknown>): void {
  if (!analyticsEnabled) return;
  posthog.capture(event, properties);
}

export function identify(userId: string, properties?: Record<string, unknown>): void {
  if (!analyticsEnabled || userId.length === 0) return;
  posthog.identify(userId, properties);
}

export function reset(): void {
  if (!analyticsEnabled) return;
  posthog.reset();
}
