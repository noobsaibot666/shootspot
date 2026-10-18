import { buildApp } from './app';
import { createAuth } from './auth';
import { loadConfig } from './config';
import { createPool } from './db';
import { createSmtpMailer } from './mailer';
import { createJobQueue } from './queue';
import { initSentry } from './sentry';
import { createStorage } from './storage';

const config = loadConfig();
initSentry(config.SENTRY_DSN, 'api');
const pool = createPool(config.DATABASE_URL);
const storage = createStorage(config);
const mailer = createSmtpMailer(config.SMTP_URL, config.MAIL_FROM);
const auth = createAuth({ pool, config, mailer });
const queue = await createJobQueue(config.DATABASE_URL);

// Idempotent: creates the two buckets on a fresh store (first NAS start), otherwise no-op.
// Storage may still be starting (container start order, NAS reboot): wait up to ~1 minute.
for (let attempt = 1; ; attempt++) {
  try {
    await storage.ensureBuckets();
    break;
  } catch (err) {
    if (attempt >= 30) throw err;
    console.warn(`storage not ready (attempt ${attempt}), retrying in 2 s`);
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const app = await buildApp({ config, pool, auth, storage, queue, mailer, logger: true });

const shutdown = async () => {
  await app.close();
  await queue.stop();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
