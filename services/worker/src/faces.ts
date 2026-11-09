import { fileURLToPath } from 'node:url';
import './no-telemetry';
import * as ort from 'onnxruntime-node';
import sharp, { type OverlayOptions, type Sharp } from 'sharp';

/**
 * Face blur for published photos (D-45). Faces are found with YuNet (OpenCV Zoo, MIT licence,
 * models/face_detection_yunet_2023mar.onnx, ~230 KB) on the CPU; nothing leaves the server.
 *
 * Works on an sRGB raster at most the size of the largest published derivative (2160 px wide):
 * a face too small to be found there is too small to recognise in what is published. Faces of
 * every size are covered by running the 640×640 model on the whole picture and on overlapping
 * tiles at two resolutions.
 */

export interface Raster {
  data: Buffer;
  width: number;
  height: number;
  channels: 3;
}

/** A face, in pixels of the raster it was found in. */
export interface Face {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

const SIZE = 640;
const STRIDES = [8, 16, 32] as const;
/** Lower than OpenCV's 0.9 default: a missed face is worse than a blurred bit of wall. */
export const FACE_THRESHOLD = 0.6;
const NMS_IOU = 0.3;
const TILE_OVERLAP = 160;

const MODEL = fileURLToPath(
  new URL('../models/face_detection_yunet_2023mar.onnx', import.meta.url),
);
let session: Promise<ort.InferenceSession> | null = null;
function detector() {
  session ??= ort.InferenceSession.create(MODEL, { intraOpNumThreads: 1, interOpNumThreads: 1 });
  return session;
}

/** Decodes any input (orientation applied) into an sRGB raster no wider than `maxWidth`. */
export async function toRaster(input: Buffer | Sharp, maxWidth: number): Promise<Raster> {
  const img = Buffer.isBuffer(input) ? sharp(input, { autoOrient: true }) : input;
  const { data, info } = await img
    .resize({ width: maxWidth, withoutEnlargement: true })
    .toColourspace('srgb')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: 3 };
}

export async function detectFaces(raster: Raster, threshold = FACE_THRESHOLD): Promise<Face[]> {
  const found: Face[] = [];
  const longest = Math.max(raster.width, raster.height);
  // Whole picture (big faces), then tiles at a middle and at full resolution (small faces).
  const scales = [SIZE / longest];
  if (longest > SIZE * 1.5) scales.push(Math.min(1, 1280 / longest));
  if (longest > 1280 * 1.25) scales.push(1);

  for (const scale of scales) {
    const w = Math.round(raster.width * scale);
    const h = Math.round(raster.height * scale);
    const scaled =
      scale === 1
        ? raster.data
        : await sharp(raster.data, { raw: rawInfo(raster) })
            .resize(w, h)
            .raw()
            .toBuffer();
    for (const [left, top] of tiles(w, h)) {
      // Give the event loop a turn between tiles, so queue polling and DB pings stay responsive.
      await new Promise((resolve) => setImmediate(resolve));
      const faces = await detectTile(scaled, w, h, left, top, threshold);
      for (const f of faces) {
        found.push({
          x: f.x / scale,
          y: f.y / scale,
          w: f.w / scale,
          h: f.h / scale,
          score: f.score,
        });
      }
    }
  }
  return nms(found);
}

function rawInfo(r: { width: number; height: number }) {
  return { width: r.width, height: r.height, channels: 3 as const };
}

/** Top-left corners of 640×640 tiles covering a w×h image, overlapping so no face is cut. */
function tiles(w: number, h: number): [number, number][] {
  const starts = (len: number) => {
    if (len <= SIZE) return [0];
    const n = Math.ceil((len - TILE_OVERLAP) / (SIZE - TILE_OVERLAP));
    const step = (len - SIZE) / (n - 1);
    return Array.from({ length: n }, (_, i) => Math.round(i * step));
  };
  return starts(h).flatMap((top) => starts(w).map((left) => [left, top] as [number, number]));
}

async function detectTile(
  rgb: Buffer,
  w: number,
  h: number,
  left: number,
  top: number,
  threshold: number,
): Promise<Face[]> {
  // The model takes BGR, 0–255, planar, 640×640; anything outside the image stays black.
  const plane = SIZE * SIZE;
  const input = new Float32Array(3 * plane);
  const tw = Math.min(SIZE, w - left);
  const th = Math.min(SIZE, h - top);
  for (let y = 0; y < th; y++) {
    let src = ((top + y) * w + left) * 3;
    let dst = y * SIZE;
    for (let x = 0; x < tw; x++, src += 3, dst++) {
      input[dst] = rgb[src + 2]!;
      input[plane + dst] = rgb[src + 1]!;
      input[2 * plane + dst] = rgb[src]!;
    }
  }
  const s = await detector();
  const out = await s.run({ input: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });

  const faces: Face[] = [];
  for (const stride of STRIDES) {
    const cls = out[`cls_${stride}`]!.data as Float32Array;
    const obj = out[`obj_${stride}`]!.data as Float32Array;
    const box = out[`bbox_${stride}`]!.data as Float32Array;
    const cols = SIZE / stride;
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(clamp01(cls[i]!) * clamp01(obj[i]!));
      if (score < threshold) continue;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = (col + box[i * 4]!) * stride;
      const cy = (row + box[i * 4 + 1]!) * stride;
      const bw = Math.exp(box[i * 4 + 2]!) * stride;
      const bh = Math.exp(box[i * 4 + 3]!) * stride;
      faces.push({ x: left + cx - bw / 2, y: top + cy - bh / 2, w: bw, h: bh, score });
    }
  }
  return faces;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function iou(a: Face, b: Face) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  return inter / (a.w * a.h + b.w * b.h - inter);
}

function nms(faces: Face[]): Face[] {
  const kept: Face[] = [];
  for (const f of [...faces].sort((a, b) => b.score - a.score)) {
    if (kept.every((k) => iou(k, f) < NMS_IOU)) kept.push(f);
  }
  return kept;
}

/** An area to blur, in pixels of the raster: a found face, or one an admin marked (D-45). */
export type Area = Pick<Face, 'x' | 'y' | 'w' | 'h'>;

/**
 * Blurs the given areas in place of the raster: each area is grown (hair, ears, chin), turned
 * into coarse blocks and softened, inside an ellipse so it reads as a blur, not a sticker.
 * Not reversible: the published pixels no longer hold the face.
 */
export async function blurAreas(raster: Raster, areas: Area[]): Promise<Raster> {
  if (!areas.length) return raster;
  const patches: OverlayOptions[] = [];
  for (const a of areas) {
    const grow = 0.3;
    const left = clampInt(a.x - a.w * grow, 0, raster.width - 1);
    const top = clampInt(a.y - a.h * grow * 1.2, 0, raster.height - 1);
    const right = clampInt(a.x + a.w * (1 + grow), left + 1, raster.width);
    const bottom = clampInt(a.y + a.h * (1 + grow), top + 1, raster.height);
    const w = right - left;
    const h = bottom - top;
    const blocks = Math.max(1, Math.round(Math.max(w, h) / 8));
    const mosaic = await sharp(raster.data, { raw: rawInfo(raster) })
      .extract({ left, top, width: w, height: h })
      .resize(Math.max(1, Math.round(w / blocks)), Math.max(1, Math.round(h / blocks)))
      .resize(w, h, { kernel: 'nearest' })
      .blur(Math.max(1, blocks / 2))
      .ensureAlpha()
      .raw()
      .toBuffer();
    const mask = Buffer.from(
      `<svg width="${w}" height="${h}"><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="#fff"/></svg>`,
    );
    const patch = await sharp(mosaic, { raw: { width: w, height: h, channels: 4 } })
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer();
    patches.push({ input: patch, left, top });
  }
  const data = await sharp(raster.data, { raw: rawInfo(raster) })
    .composite(patches)
    .removeAlpha()
    .raw()
    .toBuffer();
  return { ...raster, data };
}

const clampInt = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));
