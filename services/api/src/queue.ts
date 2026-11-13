import { PgBoss } from 'pg-boss';
import {
  QUEUE,
  type BlurAreasJob,
  type DataExportJob,
  type ProcessMediaJob,
} from '@shootspot/shared';

export interface JobQueue {
  processMedia(job: ProcessMediaJob): Promise<void>;
  dataExport(job: DataExportJob): Promise<void>;
  blurAreas(job: BlurAreasJob): Promise<void>;
  stop(): Promise<void>;
}

/**
 * pg-boss producer. Jobs live in the `pgboss` schema of our own Postgres (no Redis on the NAS).
 * The worker owns maintenance and cron, so the API leaves both off and only sends.
 */
export async function createJobQueue(connectionString: string): Promise<JobQueue> {
  const boss = new PgBoss({ connectionString, max: 2, supervise: false, schedule: false });
  // pg-boss reports background failures (its queue-cache refresh) as 'error' events. With no
  // listener, EventEmitter throws them as unhandled rejections: one Sentry issue per slow DB moment.
  // A failed send still rejects to its caller, so this listener only covers the background work.
  boss.on('error', (err: { message?: string }) =>
    console.warn('[api] pg-boss', err?.message ?? err),
  );
  await boss.start();
  for (const name of Object.values(QUEUE)) {
    if (!(await boss.getQueue(name))) await boss.createQueue(name);
  }
  const retry = { retryLimit: 3, retryBackoff: true, retryDelay: 10 } as const;
  return {
    async processMedia(job) {
      await boss.send(QUEUE.processMedia, job, { ...retry, singletonKey: job.mediaId });
    },
    async dataExport(job) {
      await boss.send(QUEUE.dataExport, job, { ...retry, singletonKey: job.exportId });
    },
    async blurAreas(job) {
      await boss.send(QUEUE.blurAreas, job, retry);
    },
    stop: () => boss.stop({ graceful: true }),
  };
}

/** Records jobs instead of sending them; for tests. */
export function createMemoryQueue(): JobQueue & { sent: { queue: string; data: unknown }[] } {
  const sent: { queue: string; data: unknown }[] = [];
  return {
    sent,
    async processMedia(job) {
      sent.push({ queue: QUEUE.processMedia, data: job });
    },
    async dataExport(job) {
      sent.push({ queue: QUEUE.dataExport, data: job });
    },
    async blurAreas(job) {
      sent.push({ queue: QUEUE.blurAreas, data: job });
    },
    async stop() {},
  };
}
