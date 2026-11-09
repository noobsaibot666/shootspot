import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { blurAreas, detectFaces, toRaster } from './faces';
import { processImage, reblurPublished } from './process-image';

// Public-domain NASA crew photo with seven faces (test/fixtures/README.md).
const crew = readFileSync(new URL('../test/fixtures/nasa-sts061-crew.jpg', import.meta.url));

describe('face blur (D-45)', () => {
  it('finds the faces in a group photo', async () => {
    const faces = await detectFaces(await toRaster(crew, 2160));
    expect(faces.length).toBeGreaterThanOrEqual(7);
  });

  it('finds no face in a photo without people', async () => {
    const wall = await sharp({
      create: { width: 1600, height: 900, channels: 3, background: '#8a8f94' },
    })
      .jpeg()
      .toBuffer();
    expect(await detectFaces(await toRaster(wall, 2160))).toEqual([]);
  });

  it('changes the pixels of a face and nothing far from it', async () => {
    const r = await toRaster(crew, 2160);
    const [face] = await detectFaces(r);
    const out = await blurAreas(r, [face!]);
    const at = (buf: Buffer, x: number, y: number) =>
      buf.subarray((y * r.width + x) * 3, (y * r.width + x) * 3 + 3);
    let changed = 0;
    for (let y = Math.round(face!.y); y < face!.y + face!.h; y += 4)
      for (let x = Math.round(face!.x); x < face!.x + face!.w; x += 4)
        if (!at(r.data, x, y).equals(at(out.data, x, y))) changed++;
    expect(changed).toBeGreaterThan(10);
    // A corner far away from that face is untouched.
    const fx = face!.x > r.width / 2 ? 2 : r.width - 3;
    expect(at(out.data, fx, r.height - 3).equals(at(r.data, fx, r.height - 3))).toBe(true);
  });

  it('publishes a photo with its faces blurred', async () => {
    // Uploads must be 16:9 or 1:1 with a 1080 px short edge.
    const upload = await sharp(crew).resize(1920, 1080, { fit: 'cover' }).jpeg().toBuffer();
    const result = await processImage(upload);
    expect(result.ok).toBe(true);
    expect(result.ok && result.faces).toBeGreaterThanOrEqual(5);
  });

  it('blurs an area an admin marked, without detection', async () => {
    const r = await reblurPublished(crew, {
      detect: false,
      areas: [{ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }],
    });
    expect(r.faces).toBe(0);
    expect(r.derivatives.map((d) => d.name)).toEqual(['thumb', 'feed', 'detail']);
  });
});
