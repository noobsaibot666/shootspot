import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Config } from './config';

export type BucketName = 'quarantine' | 'public';

/**
 * S3-compatible storage behind an interface so the NAS store (SeaweedFS) can be swapped for a
 * cloud provider without changing records (plan §7, NAS migration boundary).
 */
export interface Storage {
  ping(): Promise<void>;
  ensureBuckets(): Promise<void>;
  /** Short-lived URL the client PUTs the original JPEG to (quarantine bucket). */
  presignUpload(
    key: string,
    expiresInSeconds: number,
  ): Promise<{ url: string; headers: Record<string, string> }>;
  presignDownload(bucket: BucketName, key: string, expiresInSeconds: number): Promise<string>;
  head(bucket: BucketName, key: string): Promise<{ size: number } | null>;
  put(bucket: BucketName, key: string, body: Buffer, contentType: string): Promise<void>;
  remove(bucket: BucketName, key: string): Promise<void>;
}

export function createStorage(config: Config): Storage {
  const common = {
    region: config.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
    // The SDK's default ("when supported") bakes a CRC32 of an EMPTY body into presigned PUT URLs,
    // so any real upload fails with BadDigest. Only checksum when an operation requires it.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  } as const;
  const client = new S3Client({ ...common, endpoint: config.S3_ENDPOINT });
  // Presigned URLs must use the host phones can reach, which differs from the internal endpoint
  // on the NAS (containers talk to `s3:8333`, phones go through the tunnel hostname).
  const signer = new S3Client({
    ...common,
    endpoint: config.S3_PUBLIC_ENDPOINT ?? config.S3_ENDPOINT,
  });
  const name = (bucket: BucketName) =>
    bucket === 'public' ? config.S3_BUCKET_PUBLIC : config.S3_BUCKET_QUARANTINE;
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
    async presignUpload(key, expiresIn) {
      const headers = { 'content-type': 'image/jpeg' };
      const url = await getSignedUrl(
        signer,
        new PutObjectCommand({ Bucket: name('quarantine'), Key: key, ContentType: 'image/jpeg' }),
        { expiresIn },
      );
      return { url, headers };
    },
    async presignDownload(bucket, key, expiresIn) {
      return getSignedUrl(signer, new GetObjectCommand({ Bucket: name(bucket), Key: key }), {
        expiresIn,
      });
    },
    async head(bucket, key) {
      try {
        const res = await client.send(new HeadObjectCommand({ Bucket: name(bucket), Key: key }));
        return { size: res.ContentLength ?? 0 };
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },
    async put(bucket, key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: name(bucket),
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async remove(bucket, key) {
      await client.send(new DeleteObjectCommand({ Bucket: name(bucket), Key: key }));
    },
  };
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === 'NotFound' || e?.$metadata?.httpStatusCode === 404;
}
