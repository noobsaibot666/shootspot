import { QUEUE, type DataExportJob, type ProcessMediaJob } from '@shootspot/shared';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { loadWorkerConfig } from './config';
import { dataExportJob, deletionSweep, processMediaJob } from './jobs';
import { createWorkerStorage } from './storage';

const config = loadWorkerConfig();
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 4 });
const storage = createWorkerStorage(config);
const deps = { pool, storage };
const RETRY_LIMIT = 3;

const boss = new PgBoss({ connectionString: config.DATABASE_URL, max: 2 });
boss.on('error', (err) => console.error('[worker] pg-boss', err));
await boss.start();
for (const name of Object.values(QUEUE)) {
  if (!(await boss.getQueue(name))) await boss.createQueue(name);
}

await boss.work<ProcessMediaJob>(
  QUEUE.processMedia,
  { localConcurrency: config.WORKER_CONCURRENCY, includeMetadata: true },
  async ([job]) => {
    if (!job) return;
    const finalAttempt = job.retryCount >= RETRY_LIMIT;
    const result = await processMediaJob(deps, job.data.mediaId, { finalAttempt });
    console.log(`[worker] media ${job.data.mediaId}: ${result.outcome}`);
  },
);

await boss.work<DataExportJob>(QUEUE.dataExport, async ([job]) => {
  if (job) await dataExportJob(deps, job.data.exportId);
});

await boss.schedule(QUEUE.deletionSweep, '*/15 * * * *');
await boss.work(QUEUE.deletionSweep, async () => {
  const n = await deletionSweep(deps);
  if (n) console.log(`[worker] completed ${n} account deletion(s)`);
});

console.log('[worker] ready');

const shutdown = async () => {
  await boss.stop({ graceful: true });
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
