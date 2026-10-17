/**
 * Integration-test harness: a throwaway database (migrated) and buckets per test file, the real
 * app with an in-memory mailer and queue, and helpers to sign in like a client would.
 * Needs the local stack (`pnpm dev:infra`) or the CI service containers.
 */
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { buildApp } from './app';
import { currentTotp } from './admin/mfa';
import { createAuth } from './auth';
import { loadConfig, type Config } from './config';
import { createPool, type Pool } from './db';
import { createMemoryMailer } from './mailer';
import { createMemoryQueue } from './queue';
import { createStorage, type Storage } from './storage';

const ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://shootspot:shootspot-dev@127.0.0.1:55432/shootspot';
const MIGRATIONS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../migrations');

export interface TestEnv {
  app: Awaited<ReturnType<typeof buildApp>>;
  config: Config;
  pool: Pool;
  storage: Storage;
  mailer: ReturnType<typeof createMemoryMailer>;
  queue: ReturnType<typeof createMemoryQueue>;
  databaseUrl: string;
  close(): Promise<void>;
}

export async function createTestEnv(): Promise<TestEnv> {
  const suffix = randomBytes(4).toString('hex');
  const dbName = `shootspot_test_${suffix}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`create database ${dbName}`);
  await admin.end();
  const databaseUrl = withDatabase(ADMIN_URL, dbName);

  await runner({
    databaseUrl,
    dir: MIGRATIONS,
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });

  const config = loadConfig({
    NODE_ENV: 'test',
    PUBLIC_API_URL: 'http://127.0.0.1:4000',
    DATABASE_URL: databaseUrl,
    AUTH_SECRET: randomBytes(32).toString('base64url'),
    SMTP_URL: 'smtp://127.0.0.1:1025',
    S3_ENDPOINT: process.env.TEST_S3_ENDPOINT ?? 'http://127.0.0.1:8333',
    S3_ACCESS_KEY_ID: 'shootspot-dev',
    S3_SECRET_ACCESS_KEY: 'shootspot-dev-secret',
    S3_BUCKET_QUARANTINE: `t-${suffix}-quarantine`,
    S3_BUCKET_PUBLIC: `t-${suffix}-public`,
    TRUSTED_ORIGINS: 'http://localhost:3000',
    REVIEW_EMAIL: 'Review@Example.com',
    REVIEW_CODE: '246810',
  });
  const pool = createPool(databaseUrl);
  const storage = createStorage(config);
  await storage.ensureBuckets();
  const mailer = createMemoryMailer();
  const queue = createMemoryQueue();
  const auth = createAuth({ pool, config, mailer });
  const app = await buildApp({ config, pool, auth, storage, queue });

  return {
    app,
    config,
    pool,
    storage,
    mailer,
    queue,
    databaseUrl,
    async close() {
      await app.close();
      await pool.end();
      const c = new pg.Client({ connectionString: ADMIN_URL });
      await c.connect();
      await c.query(`drop database if exists ${dbName} with (force)`);
      await c.end();
    },
  };
}

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

export type AuthHeaders = { authorization: string };

/** Header the Expo auth client sends instead of Origin. */
export const APP_HEADERS = { 'expo-origin': 'shootspot://' };

/** Email-code sign-in exactly as the mobile app does it; returns bearer headers. */
export async function signIn(
  env: TestEnv,
  email: string,
): Promise<AuthHeaders & { sessionToken: string }> {
  const send = await env.app.inject({
    method: 'POST',
    url: '/api/auth/email-otp/send-verification-otp',
    headers: APP_HEADERS,
    payload: { email, type: 'sign-in' },
  });
  if (send.statusCode !== 200) throw new Error(`send otp ${send.statusCode} ${send.body}`);
  const otp = env.mailer.lastCodeFor(email);
  const res = await env.app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email-otp',
    headers: APP_HEADERS,
    payload: { email, otp },
  });
  const token = res.headers['set-auth-token'];
  if (res.statusCode !== 200 || typeof token !== 'string') {
    throw new Error(`sign in ${res.statusCode} ${res.body}`);
  }
  return { authorization: `Bearer ${token}`, sessionToken: token };
}

export async function onboard(env: TestEnv, headers: AuthHeaders, firstName = 'Test') {
  const legal = (await env.app.inject({ method: 'GET', url: '/v1/legal' })).json();
  const res = await env.app.inject({
    method: 'POST',
    url: '/v1/me/onboarding',
    headers,
    payload: {
      ageConfirmed16: true,
      accept: { terms: legal.terms, privacy: legal.privacy, image_license: legal.image_license },
      firstName,
    },
  });
  if (res.statusCode !== 204) throw new Error(`onboarding ${res.statusCode} ${res.body}`);
}

/** Signed-in, onboarded member. */
export async function member(env: TestEnv, email: string, firstName?: string) {
  const headers = await signIn(env, email);
  await onboard(env, headers, firstName);
  return headers;
}

export const ADMIN_ORIGIN = 'http://localhost:3000';
export type CookieHeaders = { cookie: string };

/** Make an owner account the way scripts/grant-owner.ts does (the admin web can't create one). */
export async function grantOwner(env: TestEnv, email: string) {
  await env.pool.query(
    `insert into auth_users (name, email, "emailVerified", role) values ('Owner', $1, false, 'owner')
     on conflict (email) do update set role = 'owner'`,
    [email],
  );
}

/** Email-code sign-in from the admin web (browser origin); returns the session cookie. */
export async function browserSignIn(env: TestEnv, email: string): Promise<CookieHeaders> {
  const browser = {
    origin: ADMIN_ORIGIN,
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
  };
  await env.app.inject({
    method: 'POST',
    url: '/api/auth/email-otp/send-verification-otp',
    headers: browser,
    payload: { email, type: 'sign-in' },
  });
  const otp = env.mailer.lastCodeFor(email);
  const res = await env.app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email-otp',
    headers: browser,
    payload: { email, otp },
  });
  if (res.statusCode !== 200) throw new Error(`browser sign in ${res.statusCode} ${res.body}`);
  return { cookie: res.cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
}

/** Owner signed in on the admin web, with confirmed TOTP and an MFA-verified session. */
export async function admin(env: TestEnv, email: string) {
  await grantOwner(env, email);
  const headers = await browserSignIn(env, email);
  const enroll = await env.app.inject({ method: 'POST', url: '/admin/v1/mfa/enroll', headers });
  const secret = new URL(enroll.json().otpauthUri).searchParams.get('secret');
  if (!secret) throw new Error('no totp secret');
  const verify = await env.app.inject({
    method: 'POST',
    url: '/admin/v1/mfa/verify',
    headers,
    payload: { code: currentTotp(secret) },
  });
  if (verify.statusCode !== 204) throw new Error(`mfa verify ${verify.statusCode} ${verify.body}`);
  return { headers, secret };
}

/** A valid draft body for POST /v1/records. */
export function draftBody(overrides: Record<string, unknown> = {}) {
  return {
    draftId: crypto.randomUUID(),
    framing: '16:9',
    pin: { lat: 38.7139, lon: -9.1334, accuracyM: 8, source: 'gps' },
    short: {
      label: 'Miradouro da Graça',
      goodFor: ['landscape', 'urban'],
      bestLight: ['golden_pm'],
      bearingDeg: 247,
    },
    capture: {
      capturedAt: '2026-10-16T17:42:00+01:00',
      altitudeM: 90,
      focalLength35mm: 24,
      headingDeg: 247,
    },
    ...overrides,
  };
}
