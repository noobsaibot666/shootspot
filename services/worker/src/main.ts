import { QUEUE, type DataExportJob, type ProcessMediaJob } from '@shootspot/shared';
import pg from 'pg';
import { PgBoss } from 'pg-boss';
import { loadWorkerConfig } from './config';
import nodemailer from 'nodemailer';
import { dataExportJob, deletionSweep, processMediaJob } from './jobs';
import { alertText, dueAlerts, findProblems, ownerEmails } from './ops';
import { initSentry } from './sentry';
import { createWorkerStorage } from './storage';

const config = loadWorkerConfig();
initSentry(config.SENTRY_DSN, 'worker');
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

const mailer = config.SMTP_URL ? nodemailer.createTransport(config.SMTP_URL) : null;
await boss.schedule(QUEUE.opsCheck, '*/30 * * * *');
await boss.work(QUEUE.opsCheck, async () => {
  const problems = await findProblems(pool);
  const due = await dueAlerts(pool, problems);
  if (!due.length) return;
  console.warn(`[worker] alert: ${due.map((p) => p.key).join(', ')}`);
  const to = await ownerEmails(pool);
  if (mailer && to.length) {
    const { subject, text } = alertText(due);
    await mailer.sendMail({ from: config.MAIL_FROM, to, subject, text });
  }
});

console.log('[worker] ready');

const shutdown = async () => {
  await boss.stop({ graceful: true });
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
