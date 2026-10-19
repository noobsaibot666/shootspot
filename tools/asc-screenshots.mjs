#!/usr/bin/env node
// Uploads App Store screenshots for one version and display type, replacing what is there.
// Usage: node tools/asc-screenshots.mjs <appStoreVersionId> <displayType> <file.png>...
// e.g.   node tools/asc-screenshots.mjs f166c2a2-… APP_IPHONE_67 shots/01.png shots/02.png
// Files are uploaded in the order given (= the order on the store). Uses the API key from
// tools/asc.mjs. Apple's flow: reserve (POST appScreenshots) → PUT the parts → PATCH uploaded.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { asc } from './asc.mjs';

const [versionId, displayType, ...files] = process.argv.slice(2);
if (!versionId || !displayType || !files.length) {
  console.error('usage: asc-screenshots.mjs <appStoreVersionId> <displayType> <file.png>...');
  process.exit(1);
}

async function call(method, path, body) {
  const { status, json } = await asc(method, path, body);
  if (status >= 300) throw new Error(`${method} ${path} → ${status} ${JSON.stringify(json)}`);
  return json;
}

const locs = await call('GET', `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
const loc = locs.data.find((l) => l.attributes.locale === 'en-US') ?? locs.data[0];
console.log('localization', loc.attributes.locale, loc.id);

const sets = await call('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`);
let set = sets.data.find((s) => s.attributes.screenshotDisplayType === displayType);
if (set) {
  const old = await call('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`);
  for (const s of old.data) await call('DELETE', `/v1/appScreenshots/${s.id}`);
  console.log(`set ${displayType}: removed ${old.data.length} old screenshot(s)`);
} else {
  set = (
    await call('POST', '/v1/appScreenshotSets', {
      data: {
        type: 'appScreenshotSets',
        attributes: { screenshotDisplayType: displayType },
        relationships: {
          appStoreVersionLocalization: {
            data: { type: 'appStoreVersionLocalizations', id: loc.id },
          },
        },
      },
    })
  ).data;
  console.log(`set ${displayType}: created`);
}

for (const file of files) {
  const bytes = readFileSync(file);
  const reserved = (
    await call('POST', '/v1/appScreenshots', {
      data: {
        type: 'appScreenshots',
        attributes: { fileName: basename(file), fileSize: bytes.length },
        relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } },
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
  await call('PATCH', `/v1/appScreenshots/${reserved.id}`, {
    data: {
      type: 'appScreenshots',
      id: reserved.id,
      attributes: {
        uploaded: true,
        sourceFileChecksum: createHash('md5').update(bytes).digest('hex'),
      },
    },
  });
  console.log('uploaded', basename(file));
}

// Apple processes each file; report the delivery state (COMPLETE, or an error per file).
await new Promise((r) => setTimeout(r, 8000));
const done = await call('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`);
for (const s of done.data) {
  const st = s.attributes.assetDeliveryState;
  console.log(
    s.attributes.fileName,
    st?.state,
    st?.errors?.map((e) => e.description).join('; ') ?? '',
  );
}
