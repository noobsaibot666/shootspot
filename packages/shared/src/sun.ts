import { getMoonIllumination, getMoonPosition, getMoonTimes, getPosition, getTimes } from 'suncalc';
import type { HorizonProfile } from './api';
import { normalizeBearing } from './geo';

/**
 * Sun position and light-planning helpers built on `suncalc`.
 * All calculations run deterministically from date, latitude, longitude, and camera bearing.
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

export interface SunPathPoint {
  hour: number;
  azimuthDeg: number;
  elevationDeg: number;
}

export interface DaylightSummary {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  dawn: Date | null;
  dusk: Date | null;
  goldenHourEnd: Date | null;
  goldenHour: Date | null;
  nightEnd: Date | null;
  night: Date | null;
  alwaysUp: boolean;
  alwaysDown: boolean;
  /** 25 hourly samples (0..24) on the local civil day of `date` for drawing the sun arc. */
  sunPath: SunPathPoint[];
}

export function daylightSummary(date: Date, lat: number, lon: number): DaylightSummary {
  const times = getTimes(date, lat, lon);
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);

  const sunPath: SunPathPoint[] = [];
  for (let hour = 0; hour <= 24; hour++) {
    const sample = new Date(startOfDay.getTime() + hour * 3_600_000);
    const pos = sunAtCapture(sample, lat, lon);
    sunPath.push({ hour, azimuthDeg: pos.azimuthDeg, elevationDeg: pos.elevationDeg });
  }

  return {
    sunrise: times.sunrise,
    sunset: times.sunset,
    solarNoon: times.solarNoon,
    dawn: times.dawn,
    dusk: times.dusk,
    goldenHourEnd: times.goldenHourEnd,
    goldenHour: times.goldenHour,
    nightEnd: times.nightEnd,
    night: times.night,
    alwaysUp: Boolean(times.alwaysUp),
    alwaysDown: Boolean(times.alwaysDown),
    sunPath,
  };
}

export interface NextBestLight {
  kind: 'golden_am' | 'golden_pm';
  start: Date;
  end: Date;
  sunAzimuthDeg: number;
  lightAngle: LightAngle | null;
}

/**
 * Finds the next upcoming golden hour window (AM or PM) from `from` (searching today and tomorrow),
 * along with the sun azimuth and light angle relative to `bearingDeg` at the midpoint.
 */
export function nextBestLight(
  from: Date,
  lat: number,
  lon: number,
  bearingDeg?: number | null,
): NextBestLight | null {
  const candidates: Array<{
    kind: 'golden_am' | 'golden_pm';
    start: Date | null;
    end: Date | null;
  }> = [];

  for (let offset = 0; offset <= 1; offset++) {
    const day = new Date(from.getTime() + offset * 86_400_000);
    const t = getTimes(day, lat, lon);
    candidates.push(
      { kind: 'golden_am', start: t.sunrise, end: t.goldenHourEnd },
      { kind: 'golden_pm', start: t.goldenHour, end: t.sunset },
    );
  }

  const upcoming = candidates
    .filter(
      (c): c is { kind: 'golden_am' | 'golden_pm'; start: Date; end: Date } =>
        c.start != null && c.end != null && c.end.getTime() > from.getTime(),
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const next = upcoming[0];
  if (!next) return null;

  const mid = new Date((next.start.getTime() + next.end.getTime()) / 2);
  const sun = sunAtCapture(mid, lat, lon);

  return {
    kind: next.kind,
    start: next.start,
    end: next.end,
    sunAzimuthDeg: sun.azimuthDeg,
    lightAngle: bearingDeg != null ? lightAngle(bearingDeg, sun) : null,
  };
}

export type MoonPhaseLabel =
  | 'New Moon'
  | 'Waxing Crescent'
  | 'First Quarter'
  | 'Waxing Gibbous'
  | 'Full Moon'
  | 'Waning Gibbous'
  | 'Last Quarter'
  | 'Waning Crescent';

export function moonPhaseLabel(phase: number): MoonPhaseLabel {
  if (phase < 0.0625 || phase >= 0.9375) return 'New Moon';
  if (phase < 0.1875) return 'Waxing Crescent';
  if (phase < 0.3125) return 'First Quarter';
  if (phase < 0.4375) return 'Waxing Gibbous';
  if (phase < 0.5625) return 'Full Moon';
  if (phase < 0.6875) return 'Waning Gibbous';
  if (phase < 0.8125) return 'Last Quarter';
  return 'Waning Crescent';
}

export interface MoonSummary {
  fraction: number;
  phase: number;
  phaseLabel: MoonPhaseLabel;
  waxing: boolean;
  azimuthDeg: number;
  elevationDeg: number;
  rise: Date | null;
  set: Date | null;
  alwaysUp: boolean;
  alwaysDown: boolean;
}

export function moonSummary(date: Date, lat: number, lon: number): MoonSummary {
  const illum = getMoonIllumination(date);
  const pos = getMoonPosition(date, lat, lon);
  const times = getMoonTimes(date, lat, lon);

  return {
    fraction: illum.fraction,
    phase: illum.phase,
    phaseLabel: moonPhaseLabel(illum.phase),
    waxing: illum.waxing,
    azimuthDeg: Math.round(normalizeBearing(pos.azimuth) * 10) / 10,
    elevationDeg: Math.round(pos.altitude * 10) / 10,
    rise: times.rise ?? null,
    set: times.set ?? null,
    alwaysUp: Boolean(times.alwaysUp),
    alwaysDown: Boolean(times.alwaysDown),
  };
}

/**
 * Horizontal field of view in degrees for a 35mm-equivalent focal length (36 mm sensor width).
 * Falls back to 54° (~35mm lens) when focal length is unknown.
 */
export function horizontalFovDeg(focalLength35mm: number | null | undefined): number {
  if (!focalLength35mm || !Number.isFinite(focalLength35mm) || focalLength35mm <= 0) {
    return 54;
  }
  const fov = 2 * Math.atan(36 / (2 * focalLength35mm)) * (180 / Math.PI);
  return Math.max(5, Math.min(130, Math.round(fov * 10) / 10));
}

/** Linearly interpolates the terrain horizon angle (deg) at `azimuthDeg` from a 360° profile. */
export function horizonAngleAt(azimuthDeg: number, profile: HorizonProfile): number {
  const sectors = profile.sectorsDeg;
  if (!sectors.length) return 0;
  const step = 360 / sectors.length;
  const az = normalizeBearing(azimuthDeg);
  const idx = Math.floor(az / step) % sectors.length;
  const nextIdx = (idx + 1) % sectors.length;
  const frac = (az - idx * step) / step;
  return (sectors[idx] ?? 0) * (1 - frac) + (sectors[nextIdx] ?? 0) * frac;
}

export interface EffectiveSolarTimes {
  effectiveSunrise: Date | null;
  effectiveSunset: Date | null;
  sunriseDelayMin: number;
  sunsetEarlyMin: number;
}

/**
 * Estimates when the sun actually clears or drops behind surrounding terrain using 2-minute steps
 * from flat-horizon sunrise/sunset.
 */
export function effectiveSolarTimes(
  summary: Pick<DaylightSummary, 'sunrise' | 'sunset'>,
  lat: number,
  lon: number,
  profile: HorizonProfile,
): EffectiveSolarTimes {
  let effectiveSunrise = summary.sunrise;
  let sunriseDelayMin = 0;
  if (summary.sunrise && !Number.isNaN(summary.sunrise.getTime())) {
    const startMs = summary.sunrise.getTime();
    for (let min = 0; min <= 120; min += 2) {
      const t = new Date(startMs + min * 60_000);
      const pos = sunAtCapture(t, lat, lon);
      if (pos.elevationDeg >= horizonAngleAt(pos.azimuthDeg, profile)) {
        effectiveSunrise = t;
        sunriseDelayMin = min;
        break;
      }
    }
  }

  let effectiveSunset = summary.sunset;
  let sunsetEarlyMin = 0;
  if (summary.sunset && !Number.isNaN(summary.sunset.getTime())) {
    const endMs = summary.sunset.getTime();
    for (let min = 0; min <= 120; min += 2) {
      const t = new Date(endMs - min * 60_000);
      const pos = sunAtCapture(t, lat, lon);
      if (pos.elevationDeg >= horizonAngleAt(pos.azimuthDeg, profile)) {
        effectiveSunset = t;
        sunsetEarlyMin = min;
        break;
      }
    }
  }

  return { effectiveSunrise, effectiveSunset, sunriseDelayMin, sunsetEarlyMin };
}
