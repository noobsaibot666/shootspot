import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';
import type { Config } from './config';

/**
 * S3-compatible storage behind an interface so the NAS store (SeaweedFS) can be swapped for a
 * cloud provider without changing records (plan §7, NAS migration boundary).
 */
export interface Storage {
  ping(): Promise<void>;
  ensureBuckets(): Promise<void>;
}

export function createStorage(config: Config): Storage {
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });
  const buckets = [config.S3_BUCKET_QUARANTINE, config.S3_BUCKET_PUBLIC];

  return {
    async ping() {
      for (const Bucket of buckets) await client.send(new HeadBucketCommand({ Bucket }));
    },
    async ensureBuckets() {
      for (const Bucket of buckets) {
        try {
          await client.send(new HeadBucketCommand({ Bucket }));
        } catch {
          await client.send(new CreateBucketCommand({ Bucket }));
        }
      }
    },
  };
}
