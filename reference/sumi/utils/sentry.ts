import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

let initialized = false;

export function initSentry() {
  if (initialized || !dsn) return;
  Sentry.init({
    dsn,
    enableAutoSessionTracking: true,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    debug: false,
    enabled: !__DEV__ || process.env.EXPO_PUBLIC_SENTRY_DEV === "1",
  });
  initialized = true;
}

export function captureException(error: unknown, extras?: Record<string, unknown>) {
  if (!initialized) return;
  Sentry.captureException(error, extras ? { extra: extras } : undefined);
}

export function setUser(userId: string | null) {
  if (!initialized) return;
  Sentry.setUser(userId ? { id: userId } : null);
}
