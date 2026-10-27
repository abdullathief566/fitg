// Sentry (ported from Sumi's utils/sentry.ts): DSN from EXPO_PUBLIC_SENTRY_DSN; setUser({ id }) only. Without a DSN
// (development, Expo Go) it does nothing.
import * as Sentry from '@sentry/react-native';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
let initialized = false;

export function initSentry(): void {
  if (initialized || !dsn) return;
  Sentry.init({
    dsn,
    tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    enabled: !__DEV__ || process.env.EXPO_PUBLIC_SENTRY_DEV === '1',
  });
  initialized = true;
}

export function captureException(error: unknown, extras?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(error, extras ? { extra: extras } : undefined);
}

export function setSentryUser(userId: string | null): void {
  if (!initialized) return;
  Sentry.setUser(userId ? { id: userId } : null);
}
