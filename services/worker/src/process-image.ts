import sharp from 'sharp';
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

  const derivatives: Derivative[] = [];
  for (const spec of DERIVATIVES) {
    const { data, info } = await sharp(input, options)
      .resize({ width: spec.width, withoutEnlargement: true })
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

function toDecodeFailure(err: unknown): ProcessResult {
  const message = err instanceof Error ? err.message : String(err);
  if (/pixel limit/i.test(message)) return { ok: false, reason: 'too_large' };
  return { ok: false, reason: 'undecodable', detail: message };
}
