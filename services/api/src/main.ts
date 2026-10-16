import pg from 'pg';
import { buildApp } from './app';
import { loadConfig } from './config';
import { createStorage } from './storage';

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });
const storage = createStorage(config);

if (config.NODE_ENV === 'development') await storage.ensureBuckets();

const app = buildApp({
  pingDb: async () => {
    await pool.query('select 1');
  },
  storage,
  logger: true,
});

const shutdown = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await app.listen({ port: config.PORT, host: config.HOST });
