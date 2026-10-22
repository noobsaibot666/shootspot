#!/usr/bin/env node
// Uploads a file (e.g. a screen recording) to App Review Information → Attachment of one version.
// Usage: node tools/asc-review-attachments.mjs <appStoreReviewDetailId> <file>
// Apple allows one attachment, so the existing one is replaced (join several videos first).
// Uses the API key from tools/asc.mjs. Apple's flow: reserve (POST appStoreReviewAttachments) →
// PUT the parts → PATCH uploaded.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { asc } from './asc.mjs';

const [detailId, file] = process.argv.slice(2);
if (!detailId || !file) {
  console.error('usage: asc-review-attachments.mjs <appStoreReviewDetailId> <file>');
  process.exit(1);
}

async function call(method, path, body) {
  const { status, json } = await asc(method, path, body);
  if (status >= 300) throw new Error(`${method} ${path} → ${status} ${JSON.stringify(json)}`);
  return json;
}

const old = await call('GET', `/v1/appStoreReviewDetails/${detailId}/appStoreReviewAttachments`);
for (const a of old.data) {
  await call('DELETE', `/v1/appStoreReviewAttachments/${a.id}`);
  console.log(`removed ${a.attributes.fileName}`);
}

{
  const bytes = readFileSync(file);
  const reserved = (
    await call('POST', '/v1/appStoreReviewAttachments', {
      data: {
        type: 'appStoreReviewAttachments',
        attributes: { fileName: basename(file), fileSize: bytes.length },
        relationships: {
          appStoreReviewDetail: { data: { type: 'appStoreReviewDetails', id: detailId } },
        },
      },
    })
  ).data;
  for (const op of reserved.attributes.uploadOperations) {
    const headers = Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value]));
    const res = await fetch(op.url, {
      method: op.method,
      headers,
      body: bytes.subarray(op.offset, op.offset + op.length),
    });
    if (!res.ok) throw new Error(`upload part ${op.offset} → ${res.status}`);
  }
  await call('PATCH', `/v1/appStoreReviewAttachments/${reserved.id}`, {
    data: {
      type: 'appStoreReviewAttachments',
      id: reserved.id,
      attributes: {
        uploaded: true,
        sourceFileChecksum: createHash('md5').update(bytes).digest('hex'),
      },
    },
  });
  console.log(`uploaded ${basename(file)} (${(bytes.length / 1e6).toFixed(1)} MB)`);
}

const all = await call('GET', `/v1/appStoreReviewDetails/${detailId}/appStoreReviewAttachments`);
for (const a of all.data)
  console.log(`- ${a.attributes.fileName}: ${a.attributes.assetDeliveryState?.state ?? '?'}`);
