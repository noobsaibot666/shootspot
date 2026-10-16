/** Background job queues shared by the API (producer) and the worker (consumer). pg-boss on Postgres. */
export const QUEUE = {
  /** Validate an uploaded original, build derivatives, publish the record. */
  processMedia: 'process-media',
  /** Build a member's data export archive (GDPR Art. 15/20). */
  dataExport: 'data-export',
  /** Periodic sweep that executes account deletions whose grace period has passed. */
  deletionSweep: 'deletion-sweep',
  /** Every 30 minutes: backups, stuck/failed uploads, overdue reports → owner alert emails. */
  opsCheck: 'ops-check',
} as const;

export interface ProcessMediaJob {
  mediaId: string;
}

export interface DataExportJob {
  exportId: string;
}

/** Object keys. Originals live in the private quarantine bucket, derivatives in the public one. */
export const objectKey = {
  original: (mediaId: string) => `originals/${mediaId}.jpg`,
  derivative: (mediaId: string, name: string) => `media/${mediaId}/${name}.webp`,
  dataExport: (userId: string, exportId: string) => `exports/${userId}/${exportId}.json`,
};

/** Source upload limit; must match the worker's byte check. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
