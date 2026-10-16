import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { processImage } from './process-image';

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
