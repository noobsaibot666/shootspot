import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { bearer, emailOTP } from 'better-auth/plugins';
import type pg from 'pg';
import type { Config } from './config';
import type { Mailer } from './mailer';

/**
 * Authentication (ADR 0005): Better Auth inside the API, tables in our Postgres.
 * Members sign in with a 6-digit email code only; there are no passwords. Mobile clients use
 * bearer tokens, the admin web uses cookies. Admin MFA is enforced by our own admin routes
 * (src/admin/mfa.ts), because email-code sign-in is not challenged by Better Auth's 2FA plugin.
 */
/** The mobile app's URL scheme (app.json "scheme"). */
export const APP_ORIGIN = 'shootspot://';

export function createAuth(deps: { pool: pg.Pool; config: Config; mailer: Mailer }) {
  const { pool, config, mailer } = deps;
  return betterAuth({
    appName: 'ShootSpot',
    baseURL: config.PUBLIC_API_URL,
    basePath: '/api/auth',
    secret: config.AUTH_SECRET,
    database: pool,
    // Browser origins (admin web) plus the app's own scheme, which the Expo client sends as
    // `expo-origin` and the expo() plugin turns into Origin (native apps send no Origin header).
    trustedOrigins: [...config.TRUSTED_ORIGINS, APP_ORIGIN],
    telemetry: { enabled: false },
    emailAndPassword: { enabled: false },
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
      useSecureCookies: config.PUBLIC_API_URL.startsWith('https://'),
      // Better Auth silently skips origin/CSRF checks when NODE_ENV=test. Keep them on everywhere
      // so tests exercise exactly what production does.
      disableOriginCheck: false,
      ...(config.CLIENT_IP_HEADER
        ? { ipAddress: { ipAddressHeaders: [config.CLIENT_IP_HEADER] } }
        : {}),
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
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== 'sign-in') return;
          await mailer.send({
            to: email,
            subject: `${otp} is your ShootSpot code`,
            text:
              `Your ShootSpot sign-in code is ${otp}\n\n` +
              `It expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
          });
        },
      }),
      bearer(),
      expo(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
