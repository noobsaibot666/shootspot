import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
  );

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  /** Public base URL of this API, e.g. https://api.shootspot.app (Better Auth baseURL). */
  PUBLIC_API_URL: z.url(),
  /** Browser origins allowed to call the API with cookies (admin web). Mobile uses bearer tokens. */
  TRUSTED_ORIGINS: csv,
  /**
   * Header carrying the real client IP when behind a proxy (`cf-connecting-ip` behind the
   * Cloudflare Tunnel). Unset in development. Rate limits are per IP, so without this every phone
   * would share the tunnel's single address.
   */
  CLIENT_IP_HEADER: z.string().optional(),
  DATABASE_URL: z.url(),
  /** Signs sessions and derives the key that encrypts admin TOTP secrets. 32+ random characters. */
  AUTH_SECRET: z.string().min(32),
  SMTP_URL: z.url(),
  MAIL_FROM: z.string().min(3).default('ShootSpot <no-reply@shootspot.local>'),
  S3_ENDPOINT: z.url(),
  /** Endpoint used in presigned URLs given to phones, if different from S3_ENDPOINT. */
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().default('eu-west-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  /** Private bucket for originals awaiting processing; never served publicly. */
  S3_BUCKET_QUARANTINE: z.string().min(3),
  /** Processed, metadata-free derivatives. */
  S3_BUCKET_PUBLIC: z.string().min(3),
  /** Current image licence version members accept (D-10); stamped on every media record. */
  IMAGE_LICENSE_VERSION: z.string().default('2026-10-draft'),
  /** Days between a deletion request and execution (D-12 grace period, proposed 7). */
  DELETION_GRACE_DAYS: z.coerce.number().int().min(0).max(30).default(7),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid configuration: ${fields}`);
  }
  return parsed.data;
}
