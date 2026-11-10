import PostHog from 'posthog-react-native';

const projectToken = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

/**
 * Analytics are a no-op in development and whenever no project token is
 * configured (P11-16): the client is never constructed, so nothing can leave
 * the device and no network calls are made while running locally.
 */
export const analyticsEnabled = projectToken.length > 0 && !__DEV__;

const client = analyticsEnabled ? new PostHog(projectToken, { host }) : null;

export type AnalyticsProperties = Record<string, string | number | boolean | null>;

export type AnalyticsEvent =
  | 'app_open'
  | 'fixture_viewed'
  | 'checkout_started'
  | 'purchase_completed'
  | 'ticket_opened'
  | 'notification_preference_changed';

export function track(event: AnalyticsEvent, properties?: AnalyticsProperties): void {
  if (!analyticsEnabled) return;
  client?.capture(event, properties);
}

export function identify(userId: string, properties?: AnalyticsProperties): void {
  if (!analyticsEnabled || userId.length === 0) return;
  client?.identify(userId, properties);
}

export function reset(): void {
  if (!analyticsEnabled) return;
  client?.reset();
}
