import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.url(),
  S3_ENDPOINT: z.url(),
  S3_REGION: z.string().default('eu-west-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET_QUARANTINE: z.string().min(3),
  S3_BUCKET_PUBLIC: z.string().min(3),
  /** Concurrent image jobs; sharp is memory-hungry, keep this low on the NAS. */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  /** Owner alert emails; without it, problems are only logged. */
  SMTP_URL: z.url().optional(),
  MAIL_FROM: z.string().default('ShootSpot <no-reply@shootspot.local>'),
  SENTRY_DSN: z.string().optional(),
});

export type WorkerConfig = z.infer<typeof envSchema>;

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`,
    );
  }
  return parsed.data;
}
