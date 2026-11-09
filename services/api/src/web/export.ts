import { zipSync } from 'fflate';
import type { Attribution, PublicRecord } from '@shootspot/shared';

export interface ExportLocation {
  id: string;
  label: string;
  lat: number;
  lon: number;
  accuracyM: number | null;
  framing: PublicRecord['framing'];
  goodFor: PublicRecord['goodFor'];
  goodForCustom: string[];
  goodForNote: string | null;
  bestLight: PublicRecord['bestLight'];
  bestLightCustom: string[];
  bestLightNote: string | null;
  bearingDeg: number | null;
  advanced: PublicRecord['advanced'];
  capturedAt: string;
  altitudeM: number | null;
  focalLength35mm: number | null;
  sun: PublicRecord['sun'];
  attribution: Attribution | null;
  imageBytes: Buffer;
}

interface ManifestLocation extends Omit<ExportLocation, 'imageBytes'> {
  image: string;
}

function manifestLocation(location: ExportLocation): ManifestLocation {
  const { imageBytes: _imageBytes, ...metadata } = location;
  return { ...metadata, image: `images/${location.id}.webp` };
}

export function buildLocationArchive(locations: ExportLocation[]): Buffer {
  const manifest = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    locations: locations.map(manifestLocation),
  };
  const features = locations.map((location) => ({
    type: 'Feature' as const,
    geometry: {
      type: 'Point' as const,
      coordinates: [location.lon, location.lat] as [number, number],
    },
    properties: manifestLocation(location),
  }));
  const geojson = {
    type: 'FeatureCollection' as const,
    features,
  };
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    'locations.json': encoder.encode(JSON.stringify(manifest, null, 2)),
    'locations.geojson': encoder.encode(JSON.stringify(geojson, null, 2)),
  };
  for (const location of locations) files[`images/${location.id}.webp`] = location.imageBytes;
  return Buffer.from(zipSync(files));
}
