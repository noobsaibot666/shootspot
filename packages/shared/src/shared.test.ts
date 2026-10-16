import { describe, expect, it } from 'vitest';
import {
  centerCrop,
  checkPublishable,
  classifyFraming,
  cropRetention,
  distanceMeters,
  draftRecordSchema,
  formatBearing,
  formatCoordinates,
  formatDistance,
  lightAngle,
  normalizeWebUrl,
  profileUpdateSchema,
  sunAtCapture,
  toCardinal,
} from './index';

describe('portfolio link', () => {
  it('adds https:// when the scheme is missing and keeps typed schemes', () => {
    expect(normalizeWebUrl('example.com/me')).toBe('https://example.com/me');
    expect(normalizeWebUrl('  www.example.com ')).toBe('https://www.example.com');
    expect(normalizeWebUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeWebUrl('HTTPS://example.com')).toBe('HTTPS://example.com');
    expect(normalizeWebUrl('  ')).toBeNull();
    expect(normalizeWebUrl(null)).toBeNull();
  });

  it('profile update accepts a link without a scheme', () => {
    const r = profileUpdateSchema.parse({ portfolioUrl: 'example.com/portfolio' });
    expect(r.portfolioUrl).toBe('https://example.com/portfolio');
    expect(profileUpdateSchema.parse({ portfolioUrl: null }).portfolioUrl).toBeNull();
    expect(profileUpdateSchema.parse({}).portfolioUrl).toBeUndefined();
    expect(profileUpdateSchema.safeParse({ portfolioUrl: 'not a link' }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ portfolioUrl: 'ftp://example.com' }).success).toBe(
      false,
    );
  });
});

describe('image rules', () => {
  it('classifies 16:9 and 1:1, rejects others', () => {
    expect(classifyFraming({ width: 3840, height: 2160 })).toBe('16:9');
    expect(classifyFraming({ width: 4000, height: 2251 })).toBe('16:9');
    expect(classifyFraming({ width: 3000, height: 3000 })).toBe('1:1');
    expect(classifyFraming({ width: 4000, height: 3000 })).toBeNull();
    expect(classifyFraming({ width: 2160, height: 3840 })).toBeNull();
  });

  it('crops a landscape 4:3 sensor frame to a centred 16:9 band', () => {
    expect(centerCrop({ width: 4000, height: 3000 }, '16:9')).toEqual({
      left: 0,
      top: 375,
      width: 4000,
      height: 2250,
    });
  });

  it('crops a portrait-held frame to a landscape band, never portrait', () => {
    const crop = centerCrop({ width: 3000, height: 4000 }, '16:9');
    expect(crop.width).toBe(3000);
    expect(crop.height).toBe(1688);
    expect(crop.width).toBeGreaterThan(crop.height);
    expect(cropRetention({ width: 3000, height: 4000 }, '16:9')).toBeCloseTo(0.42, 2);
  });

  it('square crop of a landscape frame keeps the full height', () => {
    expect(centerCrop({ width: 4000, height: 3000 }, '1:1')).toEqual({
      left: 500,
      top: 0,
      width: 3000,
      height: 3000,
    });
  });

  it('gates publishing on orientation, ratio and size', () => {
    expect(checkPublishable({ width: 3840, height: 2160 })).toEqual({ ok: true, framing: '16:9' });
    expect(checkPublishable({ width: 2160, height: 3840 })).toEqual({
      ok: false,
      reason: 'portrait',
    });
    expect(checkPublishable({ width: 4000, height: 3000 })).toEqual({
      ok: false,
      reason: 'unsupported_ratio',
    });
    expect(checkPublishable({ width: 1280, height: 720 })).toEqual({
      ok: false,
      reason: 'too_small',
    });
    expect(checkPublishable({ width: 20000, height: 20000 })).toEqual({
      ok: false,
      reason: 'too_large',
    });
  });
});

describe('geo', () => {
  it('formats bearings with 16-point cardinals', () => {
    expect(formatBearing(247)).toBe('247° WSW');
    expect(formatBearing(-10)).toBe('350° N');
    expect(formatBearing(359.7)).toBe('0° N');
    expect(toCardinal(90)).toBe('E');
    expect(toCardinal(202.5)).toBe('SSW');
  });

  it('formats coordinates with hemispheres', () => {
    expect(formatCoordinates(38.72231, -9.13934)).toBe('38.7223° N, 9.1393° W');
    expect(formatCoordinates(-33.8688, 151.2093)).toBe('33.8688° S, 151.2093° E');
  });

  it('computes distances', () => {
    // Lisbon → Porto ≈ 274 km
    const d = distanceMeters(38.7223, -9.1393, 41.1579, -8.6291);
    expect(d / 1000).toBeGreaterThan(270);
    expect(d / 1000).toBeLessThan(280);
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(1234)).toBe('1.2 km');
    expect(formatDistance(42_600)).toBe('43 km');
  });
});

describe('sun', () => {
  it('sun is roughly south and high at solar noon on the equinox in Lisbon', () => {
    // 2026-03-20 ~12:37 UTC is solar noon at 9.14° W.
    const sun = sunAtCapture(new Date('2026-03-20T12:37:00Z'), 38.7223, -9.1393);
    expect(sun.azimuthDeg).toBeGreaterThan(175);
    expect(sun.azimuthDeg).toBeLessThan(185);
    expect(sun.elevationDeg).toBeGreaterThan(50);
    expect(sun.elevationDeg).toBeLessThan(53);
  });

  it('sun is below the horizon at midnight', () => {
    const sun = sunAtCapture(new Date('2026-06-21T00:00:00Z'), 51.5, -0.1);
    expect(sun.elevationDeg).toBeLessThan(0);
    expect(lightAngle(0, sun)).toBe('sun_down');
  });

  it('classifies light angle relative to camera bearing', () => {
    const sun = { azimuthDeg: 270, elevationDeg: 10 };
    expect(lightAngle(260, sun)).toBe('backlit');
    expect(lightAngle(90, sun)).toBe('front_lit');
    expect(lightAngle(0, sun)).toBe('side_lit');
    expect(lightAngle(300, { azimuthDeg: 10, elevationDeg: 10 })).toBe('side_lit');
    expect(lightAngle(350, { azimuthDeg: 10, elevationDeg: 10 })).toBe('backlit');
  });
});

describe('scout schema', () => {
  const valid = {
    draftId: '6f1c2b8e-3d4a-4b5c-9d6e-7f8a9b0c1d2e',
    framing: '16:9',
    pin: { lat: 38.7, lon: -9.1, accuracyM: 8, source: 'gps' },
    short: {
      label: 'Miradouro',
      goodFor: ['landscape'],
      bestLight: ['golden_pm'],
      bearingDeg: 247,
    },
    capture: {
      capturedAt: '2026-10-16T07:42:00+01:00',
      altitudeM: 90,
      focalLength35mm: 24,
      headingDeg: 247,
    },
  };

  it('accepts a minimal draft and defaults attribution to off', () => {
    const parsed = draftRecordSchema.parse(valid);
    expect(parsed.attributed).toBe(false);
  });

  it('rejects malformed tag keys and out-of-range bearings (unknown keys are checked by the API)', () => {
    for (const bad of ['Selfie', 'x', 'has space', '9lives', 'a'.repeat(40)]) {
      expect(
        draftRecordSchema.safeParse({ ...valid, short: { ...valid.short, goodFor: [bad] } })
          .success,
      ).toBe(false);
    }
    expect(
      draftRecordSchema.safeParse({ ...valid, short: { ...valid.short, bearingDeg: 360 } }).success,
    ).toBe(false);
  });
});
