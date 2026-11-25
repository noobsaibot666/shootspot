import {
  describeWmoWeather,
  weatherQuerySchema,
  type WeatherDay,
  type WeatherForecast,
} from '@shootspot/shared';
import type { FastifyInstance } from 'fastify';
import { HttpError, requireViewer, type AppDeps } from '../http/context';

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;
const cache = new Map<string, { expiresAt: number; data: WeatherForecast }>();

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
}
