import { describe, expect, it } from 'vitest';
import { photoMeta } from './exif';

const now = new Date('2026-10-16T12:00:00Z');

describe('photoMeta (gallery import, D-28)', () => {
  it('reads Android-style flat tags with decimal degrees and an offset', () => {
    const m = photoMeta(
      {
        GPSLatitude: 52.4934,
        GPSLatitudeRef: 'N',
        GPSLongitude: 13.4234,
        GPSLongitudeRef: 'E',
        GPSAltitude: '34/1',
        GPSImgDirection: '1105/10',
        DateTimeOriginal: '2026:05:01 18:42:10',
        OffsetTimeOriginal: '+02:00',
        FocalLengthIn35mmFilm: 26,
      },
      now,
    );
    expect(m).toEqual({
      capturedAt: '2026-05-01T16:42:10.000Z',
      gps: { lat: 52.4934, lon: 13.4234 },
      altitudeM: 34,
      headingDeg: 110.5,
      focalLength35mm: 26,
    });
  });

  it('reads iOS-style nested dictionaries and rational DMS, with S/W signs', () => {
    const m = photoMeta(
      {
        '{GPS}': {
          Latitude: '38/1,43/1,1200/100',
          LatitudeRef: 'S',
          Longitude: [9, 8, 24],
          LongitudeRef: 'W',
          Altitude: 5,
          AltitudeRef: 1,
        },
        '{Exif}': { DateTimeOriginal: '2026:03:02 07:05:00', FocalLenIn35mmFilm: 13 },
      },
      now,
    );
    expect(m.gps!.lat).toBeCloseTo(-38.72, 4);
    expect(m.gps!.lon).toBeCloseTo(-9.14, 4);
    expect(m.altitudeM).toBe(-5);
    expect(m.focalLength35mm).toBe(13);
    expect(m.capturedAt).not.toBeNull();
  });

  it('drops missing, null-island and future data', () => {
    expect(photoMeta(null).gps).toBeNull();
    const m = photoMeta(
      { GPSLatitude: 0, GPSLongitude: 0, DateTimeOriginal: '2031:01:01 00:00:00' },
      now,
    );
    expect(m.gps).toBeNull();
    expect(m.capturedAt).toBeNull();
    expect(photoMeta({ DateTimeOriginal: 'garbage' }, now).capturedAt).toBeNull();
    // Unset camera clocks.
    expect(photoMeta({ DateTimeOriginal: '1970:01:01 00:00:00' }, now).capturedAt).toBeNull();
    expect(photoMeta({ DateTimeOriginal: '2000:01:01 00:00:00' }, now).capturedAt).toBeNull();
  });
});
