import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildLocationArchive, type ExportLocation } from './export';

const location = (overrides: Partial<ExportLocation> = {}): ExportLocation => ({
  id: 'location-1',
  label: 'Berlin Studio',
  lat: 52.4934,
  lon: 13.4234,
  accuracyM: 8,
  framing: '16:9',
  goodFor: ['portrait'],
  goodForCustom: [],
  goodForNote: 'North-facing windows.',
  bestLight: ['golden_hour'],
  bestLightCustom: [],
  bestLightNote: null,
  bearingDeg: 145,
  advanced: {},
  capturedAt: '2026-11-09T10:30:00.000Z',
  altitudeM: null,
  focalLength35mm: null,
  sun: { azimuthDeg: 180, elevationDeg: 22 },
  attribution: null,
  imageBytes: Buffer.from('jpeg-1'),
  ...overrides,
});

describe('buildLocationArchive', () => {
  it('packages metadata, GeoJSON, and each image in a portable ZIP', () => {
    const zip = buildLocationArchive([
      location(),
      location({ id: 'location-2', label: 'Forest', lon: 13.5, imageBytes: Buffer.from('jpeg-2') }),
    ]);
    const files = unzipSync(zip);
    const manifest = JSON.parse(new TextDecoder().decode(files['locations.json'])) as {
      schemaVersion: number;
      locations: Array<{ id: string; image: string; lat: number; lon: number }>;
    };
    const geojson = JSON.parse(new TextDecoder().decode(files['locations.geojson'])) as {
      type: string;
      features: Array<{ geometry: { coordinates: [number, number] } }>;
    };

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.locations).toHaveLength(2);
    expect(manifest.locations[0]).toMatchObject({
      id: 'location-1',
      lat: 52.4934,
      lon: 13.4234,
      image: 'images/location-1.webp',
    });
    expect(geojson.type).toBe('FeatureCollection');
    expect(geojson.features[0]?.geometry.coordinates).toEqual([13.4234, 52.4934]);
    expect(Buffer.from(files['images/location-1.webp']!)).toEqual(Buffer.from('jpeg-1'));
    expect(Buffer.from(files['images/location-2.webp']!)).toEqual(Buffer.from('jpeg-2'));
  });

  it('creates a valid archive for one location', () => {
    const files = unzipSync(buildLocationArchive([location()]));
    const manifest = JSON.parse(new TextDecoder().decode(files['locations.json'])) as {
      locations: unknown[];
    };
    expect(manifest.locations).toHaveLength(1);
    expect(files['images/location-1.webp']).toBeDefined();
  });
});
