import { betterAuth } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { bearer, emailOTP } from 'better-auth/plugins';
import type pg from 'pg';
import type { Config } from './config';
import { INTERNAL_IP_HEADER } from './http/client-ip';
import type { Mailer } from './mailer';
import { captureError } from './sentry';

/** The mobile app's URL scheme (app.json "scheme"). */
export const APP_ORIGIN = 'shootspot://';

/**
 * Native apps send no Origin header. The Expo auth client sends `expo-origin: shootspot://`
 * instead; the auth route (app.ts) copies it into Origin when Origin is absent, as Better Auth's
 * expo() server plugin would, without pulling Expo and React Native into the API image.
 */
export const APP_ORIGIN_HEADER = 'expo-origin';

/**
 * Authentication (ADR 0005): Better Auth inside the API, tables in our Postgres.
 * Members create an account and sign in with email and password (D-43, no wait for an email).
 * The 6-digit email code remains for a forgotten password (sign in with the code, then set a new
 * one: src/me/password.ts) and for older code-only accounts. Mobile clients use
 * bearer tokens, the admin web uses cookies. The admin web accepts only password sessions
 * (recorded in auth_password_sessions) plus TOTP, enforced by our own admin routes (src/admin/mfa.ts).
 */
export const MIN_PASSWORD = 10;
export function createAuth(deps: { pool: pg.Pool; config: Config; mailer: Mailer }) {
  const { pool, config, mailer } = deps;
  const isReviewer = (email: string, type: string) =>
    type === 'sign-in' &&
    !!config.REVIEW_EMAIL &&
    !!config.REVIEW_CODE &&
    email.toLowerCase() === config.REVIEW_EMAIL;
  return betterAuth({
    appName: 'ShootSpot',
    baseURL: config.PUBLIC_API_URL,
    basePath: '/api/auth',
    secret: config.AUTH_SECRET,
    database: pool,
    // Browser origins (admin web) plus the app's own scheme (see APP_ORIGIN_HEADER).
    trustedOrigins: [...config.TRUSTED_ORIGINS, APP_ORIGIN],
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      // App sign-up (D-43); the admin web can't sign up (app.ts). The address isn't proven at
      // sign-up: the forgot-password code is what proves it, so only its owner can reset.
      disableSignUp: false,
      minPasswordLength: MIN_PASSWORD,
      maxPasswordLength: 128,
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const session = ctx.context.newSession?.session;
        if (ctx.path === '/sign-in/email' && session) {
          await pool.query('insert into auth_password_sessions (session_id) values ($1)', [
            session.id,
          ]);
        }
      }),
    },
    user: {
      modelName: 'auth_users',
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'member', input: false },
      },
    },
    session: {
      modelName: 'auth_sessions',
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    account: { modelName: 'auth_accounts' },
    verification: { modelName: 'auth_verifications' },
    advanced: {
      database: { generateId: 'uuid' },
      cookiePrefix: 'shootspot',
      // Cookies are only used by the admin web (the app uses bearer tokens), so they follow the
      // admin origins: it stays on plain HTTP on the LAN even when the API is public over HTTPS.
      useSecureCookies:
        config.TRUSTED_ORIGINS.length > 0 &&
        config.TRUSTED_ORIGINS.every((o) => o.startsWith('https://')),
      // Better Auth silently skips origin/CSRF checks when NODE_ENV=test. Keep them on everywhere
      // so tests exercise exactly what production does.
      disableOriginCheck: false,
      // Only the API's own resolved client IP (see http/client-ip.ts); Better Auth's default
      // list includes x-forwarded-for, which any client can forge to dodge the sign-in limits.
      ipAddress: { ipAddressHeaders: [INTERNAL_IP_HEADER] },
    },
    rateLimit: {
      enabled: config.NODE_ENV !== 'test',
      storage: 'database',
      modelName: 'auth_rate_limits',
      window: 60,
      max: 30,
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        // Store review account (D-34): a fixed code, nothing emailed. Same attempt limits apply.
        generateOTP: ({ email, type }) =>
          isReviewer(email, type) ? config.REVIEW_CODE : undefined,
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== 'sign-in' || isReviewer(email, type)) return;
          try {
            await mailer.send({
              to: email,
              subject: `${otp} is your ShootSpot code`,
              text:
                `Your ShootSpot sign-in code is ${otp}\n\n` +
                `It expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
            });
          } catch (err) {
            // Better Auth only logs failed sends (the app always sees success), so report them:
            // a blocked SMTP login (e.g. Brevo's IP check) otherwise goes unnoticed.
            captureError(err);
            throw err;
          }
        },
      }),
      bearer(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
