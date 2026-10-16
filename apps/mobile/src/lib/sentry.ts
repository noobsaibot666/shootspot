import * as Sentry from '@sentry/react-native';

/**
 * Crash reporting (D-24): Sentry EU, only when EXPO_PUBLIC_SENTRY_DSN is set at build time
 * (HANDWORK 3.7). Privacy first, like the server: no user, no request data, no IP; coordinates
 * and emails are masked in messages; breadcrumbs keep navigation/UI only (no URLs, which carry
 * coordinates in query strings, and no console text).
 */
const COORD = /-?\d{1,3}\.\d{3,}/g;
const EMAIL = /[^\s@"']+@[^\s@"']+\.[a-z]{2,}/gi;
const scrub = (s: string) => s.replace(EMAIL, '[email]').replace(COORD, '[num]');

export const sentryEnabled = Boolean(process.env.EXPO_PUBLIC_SENTRY_DSN);

export function initSentry() {
  if (!sentryEnabled) return;
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: __DEV__ ? 'development' : 'production',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      delete event.user;
      delete event.request;
      if (event.message) event.message = scrub(event.message);
      for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrub(ex.value);
      return event;
    },
    beforeBreadcrumb(b) {
      if (b.category === 'navigation' || b.category === 'ui.click' || b.category === 'touch') {
        if (b.data) b.data = {};
        if (b.message) b.message = scrub(b.message);
        return b;
      }
      return null;
    },
  });
}

/** Wraps the root component when reporting is on (captures render errors); a no-op otherwise. */
export function withSentry(C: () => React.ReactNode): React.ComponentType {
  return sentryEnabled ? Sentry.wrap(C) : C;
}
