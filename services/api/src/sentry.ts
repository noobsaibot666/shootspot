import * as Sentry from '@sentry/node';

/**
 * Crash/error reporting (D-24): Sentry EU, only when a DSN is configured. Privacy first: no
 * request bodies, query strings, cookies, headers or user data, and coordinates/emails are masked
 * in messages (threat model: logs must not leak coordinates or PII).
 */
const COORD = /-?\d{1,3}\.\d{3,}/g;
const EMAIL = /[^\s@"']+@[^\s@"']+\.[a-z]{2,}/gi;
const scrub = (s: string) => s.replace(EMAIL, '[email]').replace(COORD, '[num]');

export function initSentry(dsn: string | undefined, service: string) {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'production',
    initialScope: { tags: { service } },
    tracesSampleRate: 0,
    beforeSend(event) {
      delete event.request;
      delete event.user;
      if (event.message) event.message = scrub(event.message);
      for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrub(ex.value);
      event.breadcrumbs = [];
      return event;
    },
  });
}

export const captureError = (err: unknown) => Sentry.captureException(err);
