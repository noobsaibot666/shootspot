/**
 * Image framing rules (decision D-13): published images are 16:9 landscape or 1:1 square.
 * Portrait output is never allowed. These rules are shared by the mobile crop preview and the
 * server-side worker so both agree on what is publishable.
 */

export type Framing = '16:9' | '1:1';

export const FRAMING_RATIO: Record<Framing, number> = {
  '16:9': 16 / 9,
  '1:1': 1,
};

/** Relative tolerance when classifying an already-cropped image (rounding of odd pixel sizes). */
export const RATIO_TOLERANCE = 0.01;

/** Shortest edge allowed for a published image, in pixels. */
export const MIN_SHORT_EDGE = 1080;

/** Largest accepted source dimension; protects the worker from decompression bombs. */
export const MAX_SOURCE_PIXELS = 100_000_000;

export interface Size {
  width: number;
  height: number;
}

export interface CropRect extends Size {
  left: number;
  top: number;
}

/** Classify upright pixel dimensions. Returns null for anything that is not a permitted framing. */
export function classifyFraming({ width, height }: Size): Framing | null {
  if (width <= 0 || height <= 0) return null;
  const ratio = width / height;
  for (const framing of Object.keys(FRAMING_RATIO) as Framing[]) {
    const target = FRAMING_RATIO[framing];
    if (Math.abs(ratio - target) / target <= RATIO_TOLERANCE) return framing;
  }
  return null;
}

export function isPortrait({ width, height }: Size): boolean {
  return height > width;
}

/**
 * Largest centred crop of `source` with the requested framing. Works for portrait-held sources:
 * a 3000x4000 upright frame cropped to 16:9 yields a 3000x1688 band through the middle.
 */
export function centerCrop(source: Size, framing: Framing): CropRect {
  const ratio = FRAMING_RATIO[framing];
  let width = source.width;
  let height = Math.round(width / ratio);
  if (height > source.height) {
    height = source.height;
    width = Math.round(height * ratio);
  }
  return {
    left: Math.floor((source.width - width) / 2),
    top: Math.floor((source.height - height) / 2),
    width,
    height,
  };
}

/** Fraction of the source area kept by a centred crop; used to warn about heavy portrait crops. */
export function cropRetention(source: Size, framing: Framing): number {
  const crop = centerCrop(source, framing);
  return (crop.width * crop.height) / (source.width * source.height);
}

export type PublishCheck =
  | { ok: true; framing: Framing }
  | { ok: false; reason: 'portrait' | 'unsupported_ratio' | 'too_small' | 'too_large' };

/** Final gate for an upright (orientation-normalized) raster before it may be published. */
export function checkPublishable(size: Size): PublishCheck {
  if (size.width * size.height > MAX_SOURCE_PIXELS) return { ok: false, reason: 'too_large' };
  if (isPortrait(size)) return { ok: false, reason: 'portrait' };
  const framing = classifyFraming(size);
  if (!framing) return { ok: false, reason: 'unsupported_ratio' };
  if (Math.min(size.width, size.height) < MIN_SHORT_EDGE) return { ok: false, reason: 'too_small' };
  return { ok: true, framing };
}
