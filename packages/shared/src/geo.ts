/** Bearing and coordinate helpers. Direction means "camera points toward" (decision D-14). */

const CARDINALS_16 = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

export type Cardinal = (typeof CARDINALS_16)[number];

/** Normalize any angle in degrees to [0, 360). */
export function normalizeBearing(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function toCardinal(degrees: number): Cardinal {
  const index = Math.round(normalizeBearing(degrees) / 22.5) % 16;
  return CARDINALS_16[index]!;
}

/** "247° WSW" — the monospace bearing label used across the app. */
export function formatBearing(degrees: number): string {
  const rounded = Math.round(normalizeBearing(degrees)) % 360;
  return `${rounded}° ${toCardinal(rounded)}`;
}

/** "38.7223° N, 9.1393° W" */
export function formatCoordinates(lat: number, lon: number, decimals = 4): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(decimals)}° ${ns}, ${Math.abs(lon).toFixed(decimals)}° ${ew}`;
}

export function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}

/** Great-circle distance in metres (haversine). */
export function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_008.8;
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "850 m" / "12.4 km" */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

/** Great-circle destination point given start coordinates, bearing (deg), and distance (m). */
export function destinationPoint(
  lat: number,
  lon: number,
  bearingDeg: number,
  distanceM: number,
): { lat: number; lon: number } {
  const R = 6_371_008.8;
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const angularDist = distanceM / R;
  const brng = normalizeBearing(bearingDeg) * toRad;
  const lat1 = lat * toRad;
  const lon1 = lon * toRad;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDist) +
      Math.cos(lat1) * Math.sin(angularDist) * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(angularDist) * Math.cos(lat1),
      Math.cos(angularDist) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: lat2 * toDeg,
    lon: ((lon2 * toDeg + 540) % 360) - 180,
  };
}
