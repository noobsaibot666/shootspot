// Build store-compliant app icons from the designer export (rounded square with glow, Display P3).
// Run from the repo root:
//   node tools/make-icons.mjs "X:/04_DEV/_personal/shootspot/shared/design/app-icon/Group 15@4x.png" \
//     apps/mobile/assets <previewDir>
// Produces: icon.png (1024, opaque, square, P3-tagged), Android adaptive foreground/background/
// monochrome (rings inside the 61% safe zone), splash-icon.png, favicon.png, and masked previews.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';

const require = createRequire(path.resolve('services/worker/package.json'));
const sharp = require('sharp');

const [src, assets, previews] = process.argv.slice(2);
fs.mkdirSync(previews, { recursive: true });

// 1. Locate the straight edges of the rounded square (fully opaque) at the centre row/column.
const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width,
  H = info.height;
const A = (x, y) => data[(y * W + x) * 4 + 3];
const cy = H >> 1,
  cx = W >> 1;
let left = 0;
while (A(left, cy) < 250) left++;
let right = W - 1;
while (A(right, cy) < 250) right--;
let top = 0;
while (A(cx, top) < 250) top++;
let bottom = H - 1;
while (A(cx, bottom) < 250) bottom--;
const side = Math.min(right - left + 1, bottom - top + 1);
console.log('source', W, H, 'square', { left, top, right, bottom, side });

const crop = await sharp(src)
  .extract({ left, top, width: side, height: side })
  .resize(2048, 2048, { kernel: 'lanczos3' })
  .ensureAlpha()
  .raw()
  .toBuffer();
const N = 2048;

// 2. Fill the transparent rounded corners by normalized convolution: blur(rgb*a)/blur(a).
const rgbA = Buffer.alloc(N * N * 3),
  aa = Buffer.alloc(N * N * 3);
for (let i = 0; i < N * N; i++) {
  const a = crop[i * 4 + 3] / 255;
  for (let c = 0; c < 3; c++) {
    rgbA[i * 3 + c] = Math.round(crop[i * 4 + c] * a);
    aa[i * 3 + c] = Math.round(a * 255);
  }
}
const blurOpts = { raw: { width: N, height: N, channels: 3 } };
const bRgb = await sharp(rgbA, blurOpts).blur(60).raw().toBuffer();
const bA = await sharp(aa, blurOpts).blur(60).raw().toBuffer();
const full = Buffer.alloc(N * N * 3);
for (let i = 0; i < N * N; i++) {
  const a = crop[i * 4 + 3] / 255;
  const w = Math.max(bA[i * 3], 1) / 255;
  for (let c = 0; c < 3; c++) {
    const fill = Math.min(255, (bRgb[i * 3 + c] / 255 / w) * 255);
    full[i * 3 + c] = Math.round(crop[i * 4 + c] * a + fill * (1 - a));
  }
}
const raw3 = { raw: { width: N, height: N, channels: 3 } };

// iOS / store icon: 1024, opaque, square corners. Pixel values are the designer's Display P3
// values, so the output is tagged with Display P3 (Apple supports P3 app icons), not converted.
const p3 = (await sharp(src).metadata()).icc;
const iconRaw = await sharp(full, raw3).resize(1024, 1024, { kernel: 'lanczos3' }).raw().toBuffer();
const iconPng = await sharp(iconRaw, { raw: { width: 1024, height: 1024, channels: 3 } })
  .png({ compressionLevel: 9 })
  .toBuffer();
fs.writeFileSync(path.join(assets, 'icon.png'), tagIcc(iconPng, 'Display P3', p3));

/** Insert an iCCP chunk after IHDR: tags the pixels with a profile without converting them. */
function tagIcc(png, name, icc) {
  const body = Buffer.concat([Buffer.from(name + '\0\0', 'latin1'), zlib.deflateSync(icc)]);
  const type = Buffer.from('iCCP', 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([type, body])) >>> 0);
  const ihdrEnd = 8 + 4 + 4 + 13 + 4;
  return Buffer.concat([png.subarray(0, ihdrEnd), len, type, body, crc, png.subarray(ihdrEnd)]);
}

// 3. Separate the rings from the gradient. Rings are light (high green); the gradient runs from
// orange to pink-red, so green stays low everywhere except on the rings.
let bgG = 0,
  ringG = 0;
for (let y = 0; y < N; y += 8)
  for (const x of [8, N - 8]) bgG = Math.max(bgG, full[(y * N + x) * 3 + 1]);
for (let i = 0; i < N * N; i++) ringG = Math.max(ringG, full[i * 3 + 1]);
console.log('green: background max', bgG, 'ring', ringG);
const ringAlpha = Buffer.alloc(N * N);
const isRing = Buffer.alloc(N * N * 3);
for (let i = 0; i < N * N; i++) {
  const t = (full[i * 3 + 1] - (bgG + 15)) / (ringG - (bgG + 15));
  const a = Math.max(0, Math.min(1, t));
  ringAlpha[i] = Math.round(a * 255);
  const m = a < 0.02 ? 255 : 0;
  isRing[i * 3] = isRing[i * 3 + 1] = isRing[i * 3 + 2] = m;
}

// Background without rings: normalized convolution over non-ring pixels only.
const bgMasked = Buffer.alloc(N * N * 3);
for (let i = 0; i < N * N * 3; i++) bgMasked[i] = Math.round(full[i] * (isRing[i] / 255));
const bBg = await sharp(bgMasked, raw3).blur(80).raw().toBuffer();
const bM = await sharp(isRing, raw3).blur(80).raw().toBuffer();
const bgOnly = Buffer.alloc(N * N * 3);
for (let i = 0; i < N * N * 3; i++) {
  const keep = isRing[i] === 255;
  bgOnly[i] = keep ? full[i] : Math.min(255, Math.round((bBg[i] / Math.max(bM[i], 1)) * 255));
}
// Smooth once more so ring "ghosts" disappear.
const bgSmooth = await sharp(bgOnly, raw3).blur(30).raw().toBuffer();

// Ring colour: the brightest ring pixel's colour.
let ringRGB = [255, 255, 255],
  best = -1;
for (let i = 0; i < N * N; i++)
  if (ringAlpha[i] > best) {
    best = ringAlpha[i];
    ringRGB = [...full.subarray(i * 3, i * 3 + 3)];
  }
console.log('ring colour', ringRGB);

const ringsRGBA = (rgb) => {
  const out = Buffer.alloc(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = ringAlpha[i];
  }
  return out;
};
const raw4 = { raw: { width: N, height: N, channels: 4 } };

// Ring bounding box, to place it in Android's safe zone.
let minX = N,
  minY = N,
  maxX = 0,
  maxY = 0;
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++)
    if (ringAlpha[y * N + x] > 128) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
const ringSize = Math.max(maxX - minX, maxY - minY);
console.log('rings occupy', ((ringSize / N) * 100).toFixed(1), '% of icon');

// Android adaptive foreground: 1024 canvas, rings at 56% (safe zone is the centre 61%).
async function placedRings(rgb, canvas, fraction) {
  const pad = Math.round(ringSize * 0.03);
  const ext = {
    left: minX - pad,
    top: minY - pad,
    width: ringSize + 2 * pad,
    height: ringSize + 2 * pad,
  };
  const target = Math.round(canvas * fraction * (ext.width / ringSize));
  const ring = await sharp(ringsRGBA(rgb), raw4)
    .extract(ext)
    .resize(target, target)
    .png()
    .toBuffer();
  const off = Math.round((canvas - target) / 2);
  return sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: ring, left: off, top: off }])
    .png({ compressionLevel: 9 });
}
await (
  await placedRings(ringRGB, 1024, 0.56)
).toFile(path.join(assets, 'android-icon-foreground.png'));
await (
  await placedRings([255, 255, 255], 1024, 0.56)
).toFile(path.join(assets, 'android-icon-monochrome.png'));
await sharp(bgSmooth, raw3)
  .resize(1024, 1024)
  .toColourspace('srgb')
  .png({ compressionLevel: 9 })
  .toFile(path.join(assets, 'android-icon-background.png'));
await (await placedRings(ringRGB, 1024, 0.5)).toFile(path.join(assets, 'splash-icon.png'));
await sharp(full, raw3).resize(48, 48).png().toFile(path.join(assets, 'favicon.png'));

// Previews: iOS squircle-ish mask at 1024 and Android circle mask of the adaptive layers.
const roundMask = (r) =>
  Buffer.from(
    `<svg width="1024" height="1024"><rect width="1024" height="1024" rx="${r}" fill="#fff"/></svg>`,
  );
await sharp(path.join(assets, 'icon.png'))
  .composite([{ input: roundMask(230), blend: 'dest-in' }])
  .png()
  .toFile(path.join(previews, 'preview-ios.png'));
const adaptive = await sharp(path.join(assets, 'android-icon-background.png'))
  .composite([{ input: path.join(assets, 'android-icon-foreground.png') }])
  .png()
  .toBuffer();
const circle = Buffer.from(
  '<svg width="1024" height="1024"><circle cx="512" cy="512" r="341" fill="#fff"/></svg>',
);
const masked = await sharp(adaptive)
  .composite([{ input: circle, blend: 'dest-in' }])
  .png()
  .toBuffer();
await sharp(masked)
  .extract({ left: 171, top: 171, width: 682, height: 682 })
  .png()
  .toFile(path.join(previews, 'preview-android-circle.png'));
await sharp(path.join(assets, 'icon.png'))
  .resize(58, 58)
  .png()
  .toFile(path.join(previews, 'preview-ios-29pt@2x.png'));
console.log('done');
