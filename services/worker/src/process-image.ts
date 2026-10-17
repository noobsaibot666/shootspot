import sharp, { type SharpOptions } from 'sharp';
import { MAX_SOURCE_PIXELS, checkPublishable, type Framing } from '@shootspot/shared';

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
  | { ok: true; framing: Framing; width: number; height: number; derivatives: Derivative[] }
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
  try {
    ({ format } = await sharp(input, options).metadata());
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
  const channels = (await sharp(input, options).metadata()).channels ?? 3;

  const derivatives: Derivative[] = [];
  for (const spec of DERIVATIVES) {
    let img = sharp(input, options).resize({ width: spec.width, withoutEnlargement: true });
    if (tone) img = img.linear(...perChannel(tone, channels));
    const { data, info } = await img
      .toColourspace('srgb')
      .webp({ quality: spec.quality })
      .toBuffer({ resolveWithObject: true });
    derivatives.push({
      name: spec.name,
      format: 'webp',
      width: info.width,
      height: info.height,
      bytes: info.size,
      data,
    });
  }

  return { ok: true, framing: check.framing, ...upright, derivatives };
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
