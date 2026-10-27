// Analytics (analytics-paywall.md §1): PostHog when EXPO_PUBLIC_POSTHOG_KEY is set, otherwise a no-op. Identify by
// user id only; never a name, email, or health value beyond the coarse properties listed in the spec.
import PostHog from 'posthog-react-native';

export type AnalyticsEvent =
  | 'onboarding_step'
  | 'onboarding_completed'
  | 'plan_revealed'
  | 'app_opened'
  | 'notif_permission'
  | 'location_permission'
  | 'meal_status'
  | 'session_started';

type Props = Record<string, string | number | boolean>;

const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const host = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
  if (client !== undefined) return client;
  client = key ? new PostHog(key, { host, captureAppLifecycleEvents: false }) : null;
  return client;
}

export function track(event: AnalyticsEvent, props?: Props): void {
  try {
    getClient()?.capture(event, props);
  } catch {
    // Analytics never breaks the app.
  }
}

export function identify(userId: string): void {
  try {
    getClient()?.identify(userId);
  } catch {
    // ignore
  }
}
