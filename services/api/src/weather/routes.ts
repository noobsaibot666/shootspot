import {
  describeWmoWeather,
  destinationPoint,
  weatherQuerySchema,
  type HorizonProfile,
  type WeatherDay,
  type WeatherForecast,
} from '@shootspot/shared';
import type { FastifyInstance } from 'fastify';
import { HttpError, requireViewer, type AppDeps } from '../http/context';

const CACHE_TTL_MS = 60 * 60 * 1000;
const HORIZON_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const cache = new Map<string, { expiresAt: number; data: WeatherForecast }>();
const horizonCache = new Map<string, { expiresAt: number; data: HorizonProfile }>();
const HORIZON_SECTORS = 16;
const HORIZON_DISTANCES_M = [500, 1500, 4000, 9000] as const;

interface OpenMeteoDailyResponse {
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_min?: number[];
    temperature_2m_max?: number[];
    cloud_cover_mean?: number[];
    precipitation_probability_max?: number[];
    wind_speed_10m_max?: number[];
    wind_gusts_10m_max?: number[];
  };
}

/**
 * 7-day shoot-day weather & wind forecast proxied through Open-Meteo (no API key required).
 * Coordinates are rounded to ~1.1 km for caching and privacy; client IPs never reach Open-Meteo.
 */
export function weatherRoutes(app: FastifyInstance, deps: AppDeps) {
  app.get(
    '/v1/weather',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      await requireViewer(deps, req);
      const { lat, lon } = weatherQuerySchema.parse(req.query);

      const gridLat = Number(lat.toFixed(2));
      const gridLon = Number(lon.toFixed(2));
      const key = `${gridLat},${gridLon}`;
      const now = Date.now();

      const cached = cache.get(key);
      if (cached && cached.expiresAt > now) {
        return reply.send(cached.data);
      }

      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${gridLat}&longitude=${gridLon}` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,cloud_cover_mean,wind_speed_10m_max,wind_gusts_10m_max` +
        `&timezone=auto&forecast_days=7`;

      let raw: OpenMeteoDailyResponse;
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
        if (!res.ok) throw new Error(`open-meteo status ${res.status}`);
        raw = (await res.json()) as OpenMeteoDailyResponse;
      } catch (err) {
        app.log.warn({ err }, 'weather fetch failed');
        throw new HttpError(503, 'weather_unavailable');
      }

      const d = raw.daily;
      if (!d?.time?.length) throw new HttpError(503, 'weather_unavailable');

      const days: WeatherDay[] = d.time.map((date, i) => {
        const code = Math.round(d.weather_code?.[i] ?? 0);
        return {
          date,
          weatherCode: code,
          summary: describeWmoWeather(code),
          tempMinC: Math.round(d.temperature_2m_min?.[i] ?? 0),
          tempMaxC: Math.round(d.temperature_2m_max?.[i] ?? 0),
          cloudCoverPct: Math.round(d.cloud_cover_mean?.[i] ?? 0),
          precipProbPct: Math.round(d.precipitation_probability_max?.[i] ?? 0),
          windMaxKmh: Math.round(d.wind_speed_10m_max?.[i] ?? 0),
          windGustsKmh: Math.round(d.wind_gusts_10m_max?.[i] ?? 0),
        };
      });

      const forecast: WeatherForecast = { days, source: 'open-meteo' };
      if (cache.size >= MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      cache.set(key, { expiresAt: now + CACHE_TTL_MS, data: forecast });
      return reply.send(forecast);
    },
  );

  /**
   * 360° terrain horizon profile via Open-Meteo Elevation (no API key).
   * Samples 16 azimuths × 4 distances around a ~1 km grid point and caches for 24 h.
   */
  app.get(
    '/v1/horizon',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      await requireViewer(deps, req);
      const { lat, lon } = weatherQuerySchema.parse(req.query);

      const gridLat = Number(lat.toFixed(2));
      const gridLon = Number(lon.toFixed(2));
      const key = `${gridLat},${gridLon}`;
      const now = Date.now();

      const cached = horizonCache.get(key);
      if (cached && cached.expiresAt > now) {
        return reply.send(cached.data);
      }

      const lats: number[] = [gridLat];
      const lons: number[] = [gridLon];
      for (let s = 0; s < HORIZON_SECTORS; s++) {
        const az = (s * 360) / HORIZON_SECTORS;
        for (const dist of HORIZON_DISTANCES_M) {
          const pt = destinationPoint(gridLat, gridLon, az, dist);
          lats.push(Number(pt.lat.toFixed(4)));
          lons.push(Number(pt.lon.toFixed(4)));
        }
      }

      const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(',')}&longitude=${lons.join(',')}`;
      let elevations: number[];
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
        if (!res.ok) throw new Error(`open-meteo elevation status ${res.status}`);
        const json = (await res.json()) as { elevation?: number[] };
        if (!json.elevation || json.elevation.length < lats.length) {
          throw new Error('incomplete elevation array');
        }
        elevations = json.elevation;
      } catch (err) {
        app.log.warn({ err }, 'horizon elevation fetch failed');
        throw new HttpError(503, 'horizon_unavailable');
      }

      const observerElevationM = Math.round(elevations[0] ?? 0);
      const sectorsDeg: number[] = [];
      let idx = 1;
      for (let s = 0; s < HORIZON_SECTORS; s++) {
        let maxAngle = 0;
        for (const dist of HORIZON_DISTANCES_M) {
          const elev = elevations[idx++] ?? observerElevationM;
          const angle = Math.atan2(elev - observerElevationM, dist) * (180 / Math.PI);
          if (angle > maxAngle) maxAngle = angle;
        }
        sectorsDeg.push(Math.round(maxAngle * 10) / 10);
      }

      const profile: HorizonProfile = {
        observerElevationM,
        sectorsDeg,
        source: 'open-meteo',
      };
      if (horizonCache.size >= MAX_CACHE_ENTRIES) {
        const oldest = horizonCache.keys().next().value;
        if (oldest) horizonCache.delete(oldest);
      }
      horizonCache.set(key, { expiresAt: now + HORIZON_TTL_MS, data: profile });
      return reply.send(profile);
    },
  );
}
