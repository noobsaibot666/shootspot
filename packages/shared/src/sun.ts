import { getPosition } from 'suncalc';
import { normalizeBearing } from './geo';

/**
 * Sun position at the moment of capture, stored as technical metadata on a record. This is a
 * single computed point, not sun-path prediction (which is out of V1 scope).
 */

export interface SunAtCapture {
  /** Degrees clockwise from true north. */
  azimuthDeg: number;
  /** Apparent altitude above the horizon in degrees; negative when the sun is below it. */
  elevationDeg: number;
}

export function sunAtCapture(at: Date, lat: number, lon: number): SunAtCapture {
  const { azimuth, altitude } = getPosition(at, lat, lon);
  return {
    azimuthDeg: Math.round(normalizeBearing(azimuth) * 10) / 10,
    elevationDeg: Math.round(altitude * 10) / 10,
  };
}

export type LightAngle = 'backlit' | 'side_lit' | 'front_lit' | 'sun_down';

/**
 * How the sun relates to where the camera points. Backlit when the camera faces within 45° of the
 * sun, front-lit when the sun is within 45° behind the photographer, side-lit otherwise.
 */
export function lightAngle(cameraBearingDeg: number, sun: SunAtCapture): LightAngle {
  if (sun.elevationDeg < -0.833) return 'sun_down';
  const diff = Math.abs(normalizeBearing(sun.azimuthDeg - cameraBearingDeg));
  const delta = diff > 180 ? 360 - diff : diff;
  if (delta <= 45) return 'backlit';
  if (delta >= 135) return 'front_lit';
  return 'side_lit';
}

/** "☀ az 104° · el 6°" */
export function formatSun(sun: SunAtCapture): string {
  return `☀ az ${Math.round(sun.azimuthDeg)}° · el ${Math.round(sun.elevationDeg)}°`;
}
