import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { measureTone, processImage, toneCorrection } from './process-image';

/** Horizontal grey ramp from `from` to `to`, tinted per channel. */
async function gradient(
  width: number,
  height: number,
  from: number,
  to: number,
  tint: [number, number, number],
) {
  const raw = Buffer.alloc(width * height * 3);
  for (let x = 0; x < width; x++) {
    const v = from + ((to - from) * x) / (width - 1);
    for (let y = 0; y < height; y++) {
      const i = (y * width + x) * 3;
      raw[i] = Math.round(v * tint[0]);
      raw[i + 1] = Math.round(v * tint[1]);
      raw[i + 2] = Math.round(v * tint[2]);
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function meanRgb(image: Buffer) {
  const { channels } = await sharp(image).stats();
  return { r: channels[0]!.mean, b: channels[2]!.mean };
}

/** Solid-colour JPEG with optional EXIF orientation and GPS tags. */
async function jpeg(width: number, height: number, exif?: { orientation?: number; gps?: boolean }) {
  let img = sharp({
    create: { width, height, channels: 3, background: { r: 90, g: 120, b: 150 } },
  }).jpeg();
  if (exif?.gps) {
    img = img.withExif({
      IFD0: { Make: 'TestCam', Artist: 'Jane Doe' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '38/1 43/1 20/1' },
    });
  }
  if (exif?.orientation) img = img.withMetadata({ orientation: exif.orientation });
  return img.toBuffer();
}

describe('processImage', () => {
  it('accepts a 16:9 landscape and builds webp derivatives', async () => {
    const result = await processImage(await jpeg(3840, 2160));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.framing).toBe('16:9');
    expect(result.derivatives.map((d) => [d.name, d.width, d.height])).toEqual([
      ['thumb', 480, 270],
      ['feed', 1080, 608],
      ['detail', 2160, 1215],
    ]);
  });

  it('accepts a square image', async () => {
    const result = await processImage(await jpeg(2400, 2400));
    expect(result).toMatchObject({ ok: true, framing: '1:1' });
  });

  it('rejects portrait pixels', async () => {
    expect(await processImage(await jpeg(2160, 3840))).toEqual({ ok: false, reason: 'portrait' });
  });

  it('applies EXIF orientation to real pixels: landscape pixels tagged rotate-90 are portrait', async () => {
    const result = await processImage(await jpeg(3840, 2160, { orientation: 6 }));
    expect(result).toEqual({ ok: false, reason: 'portrait' });
  });

  it('applies EXIF orientation to real pixels: portrait pixels tagged rotate-90 are landscape', async () => {
    const result = await processImage(await jpeg(2160, 3840, { orientation: 6 }));
    expect(result).toMatchObject({ ok: true, framing: '16:9', width: 3840, height: 2160 });
  });

  it('rejects uncropped 4:3 sensor frames', async () => {
    expect(await processImage(await jpeg(4000, 3000))).toEqual({
      ok: false,
      reason: 'unsupported_ratio',
    });
  });

  it('rejects images below the minimum short edge', async () => {
    expect(await processImage(await jpeg(1280, 720))).toEqual({ ok: false, reason: 'too_small' });
  });

  it('strips all metadata, including GPS, from derivatives', async () => {
    const source = await jpeg(3840, 2160, { gps: true });
    expect((await sharp(source).metadata()).exif).toBeDefined();
    const result = await processImage(source);
    if (!result.ok) throw new Error(result.reason);
    for (const d of result.derivatives) {
      const meta = await sharp(d.data).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.icc).toBeUndefined();
    }
  });

  it('gently brightens a dark photo without clipping or a colour shift', async () => {
    const source = await gradient(3840, 2160, 10, 110, [1, 0.9, 0.8]);
    const before = await measureTone(source);
    const result = await processImage(source);
    if (!result.ok) throw new Error(result.reason);
    const feed = result.derivatives.find((d) => d.name === 'feed')!;
    const after = await measureTone(feed.data);
    expect(after.mean).toBeGreaterThan(before.mean + 8);
    expect(after.mean).toBeLessThan(before.mean * 1.6);
    expect(after.high).toBeLessThan(255);
    // Same curve on every channel: the R:B balance of a mid tone stays put.
    const { r, b } = await meanRgb(feed.data);
    const src = await meanRgb(source);
    expect(r / b).toBeCloseTo(src.r / src.b, 1);
  });

  it('leaves a well-exposed photo exactly as taken', () => {
    expect(toneCorrection({ low: 4, high: 250, mean: 120 })).toBeNull();
  });

  it('darkens an over-bright photo a little, within the caps', () => {
    const tone = toneCorrection({ low: 70, high: 255, mean: 190 })!;
    expect(tone).not.toBeNull();
    const mid = tone.gain * 190 + tone.offset;
    expect(mid).toBeLessThan(190);
    expect(mid).toBeGreaterThan(140);
    expect(tone.gain * 255 + tone.offset).toBeLessThanOrEqual(255);
    expect(tone.gain).toBeLessThanOrEqual(1.35);
  });

  it('does not stretch a flat, low-contrast subject', () => {
    // Fog or a plain wall: narrow range, normal exposure.
    expect(toneCorrection({ low: 105, high: 140, mean: 120 })).toBeNull();
  });

  it('keeps a night shot dark (capped lift)', () => {
    const tone = toneCorrection({ low: 0, high: 120, mean: 25 })!;
    expect(tone.gain).toBeLessThanOrEqual(1.35);
    expect(tone.gain * 25 + tone.offset).toBeLessThan(60);
  });

  it('rejects truncated files', async () => {
    const source = await jpeg(3840, 2160);
    const result = await processImage(source.subarray(0, Math.floor(source.length / 2)));
    expect(result).toMatchObject({ ok: false, reason: 'undecodable' });
  });

  it('rejects non-image bytes and unsupported formats', async () => {
    expect(await processImage(Buffer.from('not an image'))).toMatchObject({
      ok: false,
      reason: 'undecodable',
    });
    const gif = await sharp({
      create: { width: 1920, height: 1080, channels: 3, background: '#000' },
    })
      .gif()
      .toBuffer();
    expect(await processImage(gif)).toMatchObject({ ok: false, reason: 'unsupported_format' });
  });
});
