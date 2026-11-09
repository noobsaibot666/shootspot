import sharp, { type Sharp, type SharpOptions } from 'sharp';
import { MAX_SOURCE_PIXELS, checkPublishable, type Framing } from '@shootspot/shared';
import { blurAreas, detectFaces, toRaster, type Area, type Raster } from './faces';

/**
 * Server-side image gate and derivative generation (plan §5, upload flow step 4).
 *
 * Never trust the client or EXIF alone: the source is decoded, orientation is applied to the real
 * pixels, and the upright raster is validated against the framing rules. Public derivatives are
 * re-encoded with all metadata removed (no EXIF GPS, device serial, or owner name).
 */

/**
 * Accepted source formats. HEIC is intentionally absent: sharp's prebuilt libvips cannot decode
 * HEVC, so the mobile client always uploads JPEG (see docs/adr/0003-media-pipeline.md).
 */
export const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'avif']);

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export const DERIVATIVES = [
  { name: 'thumb', width: 480, quality: 72 },
  { name: 'feed', width: 1080, quality: 78 },
  { name: 'detail', width: 2160, quality: 82 },
] as const;

export type DerivativeName = (typeof DERIVATIVES)[number]['name'];

export interface Derivative {
  name: DerivativeName;
  format: 'webp';
  width: number;
  height: number;
  bytes: number;
  data: Buffer;
}

export type ProcessResult =
  | {
      ok: true;
      framing: Framing;
      width: number;
      height: number;
      derivatives: Derivative[];
      /** Faces found and blurred (D-45). */
      faces: number;
    }
  | { ok: false; reason: RejectReason; detail?: string };

export type RejectReason =
  | 'too_many_bytes'
  | 'undecodable'
  | 'unsupported_format'
  | 'portrait'
  | 'unsupported_ratio'
  | 'too_small'
  | 'too_large';

export async function processImage(input: Buffer): Promise<ProcessResult> {
  if (input.byteLength > MAX_SOURCE_BYTES) return { ok: false, reason: 'too_many_bytes' };

  const options = {
    limitInputPixels: MAX_SOURCE_PIXELS,
    failOn: 'error',
    autoOrient: true,
  } as const;

  let format: string | undefined;
  let channels = 3;
  try {
    const meta = await sharp(input, options).metadata();
    format = meta.format;
    channels = meta.channels ?? 3;
  } catch (err) {
    return toDecodeFailure(err);
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) {
    return { ok: false, reason: 'unsupported_format', detail: format };
  }

  // Decode fully once so truncated/corrupt pixel data is caught here, and read the upright size
  // from the decoded raster rather than from header metadata.
  let upright: { width: number; height: number };
  try {
    const { info } = await sharp(input, options).raw().toBuffer({ resolveWithObject: true });
    upright = { width: info.width, height: info.height };
  } catch (err) {
    return toDecodeFailure(err);
  }

  const check = checkPublishable(upright);
  if (!check.ok) return { ok: false, reason: check.reason };

  const tone = toneCorrection(await measureTone(input, options));

  // Faces are blurred before anything is published (D-45). Detection runs on the largest
  // published size; if it fails, the job fails and retries rather than publishing unblurred.
  const largest = DERIVATIVES[DERIVATIVES.length - 1]!.width;
  const base = await toRaster(sharp(input, options), largest);
  const faces = await detectFaces(base);

  const derivatives: Derivative[] = [];
  if (faces.length) {
    const blurred = await blurAreas(base, faces);
    derivatives.push(...(await fromRaster(blurred, tone)));
  } else {
    for (const spec of DERIVATIVES) {
      let img = sharp(input, options).resize({ width: spec.width, withoutEnlargement: true });
      if (tone) img = img.linear(...perChannel(tone, channels));
      derivatives.push(await encode(img, spec));
    }
  }

  return { ok: true, framing: check.framing, ...upright, derivatives, faces: faces.length };
}

type Spec = (typeof DERIVATIVES)[number];

async function encode(img: Sharp, spec: Spec): Promise<Derivative> {
  const { data, info } = await img
    .toColourspace('srgb')
    .webp({ quality: spec.quality })
    .toBuffer({ resolveWithObject: true });
  return {
    name: spec.name,
    format: 'webp',
    width: info.width,
    height: info.height,
    bytes: info.size,
    data,
  };
}

/** All published sizes from an sRGB raster (already blurred where needed). */
async function fromRaster(r: Raster, tone: Tone | null): Promise<Derivative[]> {
  const out: Derivative[] = [];
  for (const spec of DERIVATIVES) {
    let img = sharp(r.data, { raw: { width: r.width, height: r.height, channels: 3 } }).resize({
      width: spec.width,
      withoutEnlargement: true,
    });
    if (tone) img = img.linear(...perChannel(tone, 3));
    out.push(await encode(img, spec));
  }
  return out;
}

/**
 * Re-blurs an already published photo (D-45): existing photos once, and areas an admin marks.
 * Originals are deleted after processing (plan §5), so this works from the largest published
 * size; the tone balance is already in it. `areas` are fractions (0–1) of the width and height.
 */
export async function reblurPublished(
  detail: Buffer,
  opts: { detect: boolean; areas?: Area[] },
): Promise<{ faces: number; derivatives: Derivative[] }> {
  const base = await toRaster(detail, DERIVATIVES[DERIVATIVES.length - 1]!.width);
  const faces = opts.detect ? await detectFaces(base) : [];
  const marked = (opts.areas ?? []).map((a) => ({
    x: a.x * base.width,
    y: a.y * base.height,
    w: a.w * base.width,
    h: a.h * base.height,
  }));
  const areas = [...faces, ...marked];
  if (!areas.length) return { faces: 0, derivatives: [] };
  return { faces: faces.length, derivatives: await fromRaster(await blurAreas(base, areas), null) };
}

/**
 * Gentle automatic tone balance (D-32), so the feed does not swing between very dark and very
 * bright photos. One linear curve, the same on R, G and B: no hue or saturation change, no local
 * effects, nothing that can create halos or banding. Deliberately conservative: half of a levels
 * stretch, a partial pull toward a mid exposure, hard caps on both, highlights never pushed into
 * clipping, and no change at all when the photo is already close.
 */
export interface ToneStats {
  /** 0.5th and 99.5th luminance percentiles and the mean, 0–255. */
  low: number;
  high: number;
  mean: number;
}

export interface Tone {
  /** out = gain * in + offset, per colour channel. */
  gain: number;
  offset: number;
}

const TARGET_MEAN = 118;
const STRETCH_BLEND = 0.5;
const EXPOSURE_BLEND = 0.4;
const MAX_GAIN = 1.35;
const MIN_GAIN = 0.85;
const MAX_LIFT = 30;
/** A narrower range is a flat subject (fog, a wall), not a bad exposure: leave levels alone. */
const MIN_RANGE = 48;

export async function measureTone(
  input: Buffer,
  options: SharpOptions = { autoOrient: true },
): Promise<ToneStats> {
  const { data } = await sharp(input, options)
    .resize({ width: 256, height: 256, fit: 'inside' })
    .toColourspace('srgb')
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const hist = new Array<number>(256).fill(0);
  let sum = 0;
  for (const v of data) {
    hist[v]!++;
    sum += v;
  }
  const at = (p: number) => {
    const target = p * data.length;
    let seen = 0;
    for (let v = 0; v < 256; v++) {
      seen += hist[v]!;
      if (seen >= target) return v;
    }
    return 255;
  };
  return { low: at(0.005), high: at(0.995), mean: sum / data.length };
}

export function toneCorrection({ low, high, mean }: ToneStats): Tone | null {
  // 1. Half of a levels stretch (black point to 0, white point to 255).
  let gain = 1;
  let offset = 0;
  if (high - low >= MIN_RANGE) {
    const full = 255 / (high - low);
    gain = 1 + (full - 1) * STRETCH_BLEND;
    offset = -low * full * STRETCH_BLEND;
  }
  // 2. Pull part of the way toward a mid exposure.
  const mid = gain * mean + offset;
  if (mid > 1) {
    let k = 1 + (TARGET_MEAN / mid - 1) * EXPOSURE_BLEND;
    // Never push the white point past 255.
    const top = gain * high + offset;
    if (top > 0) k = Math.min(k, Math.max(1, 255 / top));
    gain *= k;
    offset *= k;
  }
  // Cap the gain, keeping the black point where the full curve put it (no lifted, milky blacks).
  const black = gain * low + offset;
  gain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, gain));
  offset = black - gain * low;
  offset = Math.min(MAX_LIFT, Math.max(-MAX_LIFT * 2, offset));
  // The caps can move the white point again: keep it at or below 255.
  offset = Math.min(offset, 255 - gain * high);
  // Close enough already: leave the photo exactly as taken.
  if (Math.abs(gain - 1) < 0.04 && Math.abs(offset) < 4) return null;
  return { gain, offset };
}

function perChannel({ gain, offset }: Tone, channels: number): [number[], number[]] {
  // Alpha (4th channel) stays untouched.
  const n = Math.min(channels, 3);
  const a = Array.from({ length: channels }, (_, i) => (i < n ? gain : 1));
  const b = Array.from({ length: channels }, (_, i) => (i < n ? offset : 0));
  return [a, b];
}

function toDecodeFailure(err: unknown): ProcessResult {
  const message = err instanceof Error ? err.message : String(err);
  if (/pixel limit/i.test(message)) return { ok: false, reason: 'too_large' };
  return { ok: false, reason: 'undecodable', detail: message };
}
