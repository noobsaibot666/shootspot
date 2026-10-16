import { buildApp } from './app';
import { createAuth } from './auth';
import { loadConfig } from './config';
import { createPool } from './db';
import { createSmtpMailer } from './mailer';
import { createJobQueue } from './queue';
import { createStorage } from './storage';

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const storage = createStorage(config);
const mailer = createSmtpMailer(config.SMTP_URL, config.MAIL_FROM);
const auth = createAuth({ pool, config, mailer });
const queue = await createJobQueue(config.DATABASE_URL);

if (config.NODE_ENV === 'development') await storage.ensureBuckets();

const app = await buildApp({ config, pool, auth, storage, queue, logger: true });

const shutdown = async () => {
  await app.close();
  await queue.stop();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
