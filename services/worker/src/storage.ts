import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { WorkerConfig } from './config';

export type BucketName = 'quarantine' | 'public';

export interface WorkerStorage {
  get(bucket: BucketName, key: string): Promise<Buffer>;
  put(bucket: BucketName, key: string, body: Buffer, contentType: string): Promise<void>;
  remove(bucket: BucketName, key: string): Promise<void>;
}

export function createWorkerStorage(config: WorkerConfig): WorkerStorage {
  const client = new S3Client({
    endpoint: config.S3_ENDPOINT,
    region: config.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const name = (b: BucketName) =>
    b === 'public' ? config.S3_BUCKET_PUBLIC : config.S3_BUCKET_QUARANTINE;
  return {
    async get(bucket, key) {
      const res = await client.send(new GetObjectCommand({ Bucket: name(bucket), Key: key }));
      if (!res.Body) throw new Error(`empty object ${key}`);
      return Buffer.from(await res.Body.transformToByteArray());
    },
    async put(bucket, key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: name(bucket),
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: bucket === 'public' ? 'public, max-age=31536000, immutable' : undefined,
        }),
      );
    },
    async remove(bucket, key) {
      await client.send(new DeleteObjectCommand({ Bucket: name(bucket), Key: key }));
    },
  };
}
