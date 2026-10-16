import {
  MAP_PIN_LIMIT,
  feedQuerySchema,
  mapQuerySchema,
  objectKey,
  type MapPin,
  type Page,
  type PublicRecord,
} from '@shootspot/shared';
import type { FastifyInstance } from 'fastify';
import { HttpError, requireViewer, type AppDeps } from '../http/context';
import { ATTRIBUTION_JOIN, PUBLIC_COLUMNS, toPublicRecord, type PublicRow } from './dto';

/** Keyset cursor over (published_at, id); opaque to clients. */
export function encodeCursor(publishedAt: Date, id: string): string {
  return Buffer.from(`${publishedAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeCursor(cursor: string): { at: string; id: string } {
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  if (!at || !id || Number.isNaN(Date.parse(at)) || !/^[0-9a-f-]{36}$/.test(id)) {
    throw new HttpError(400, 'bad_cursor');
  }
  return { at, id };
}

/** Plan §10: search/feed rate limit (per client IP; the global limit is 300/min). */
const SEARCH_LIMIT = { max: 60, timeWindow: '1 minute' };

export function feedRoutes(app: FastifyInstance, deps: AppDeps) {
  const { pool, storage } = deps;

  /**
   * Discover published records, newest first. With lat/lon: only within radiusKm, with distance.
   * Without: everything (manual browsing, D-15). Filters: Good for / best light (any match).
   */
  app.get('/v1/feed', { config: { rateLimit: SEARCH_LIMIT } }, async (req, reply) => {
    await requireViewer(deps, req); // D-05: sign-in required to see anything
    const q = feedQuerySchema.parse(req.query);
    if ((q.lat == null) !== (q.lon == null)) throw new HttpError(400, 'lat_lon_pair');
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;

    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const where = [`l.status = 'published'`];
    let distance = 'null::float8';
    if (q.lat != null && q.lon != null) {
      const origin = `st_setsrid(st_makepoint(${p(q.lon)}, ${p(q.lat)}), 4326)::geography`;
      distance = `st_distance(l.point, ${origin})`;
      where.push(`st_dwithin(l.point, ${origin}, ${p(q.radiusKm * 1000)})`);
    }
    if (q.goodFor?.length) where.push(`l.good_for && ${p(q.goodFor)}::text[]`);
    if (q.bestLight?.length) where.push(`l.best_light && ${p(q.bestLight)}::text[]`);
    if (cursor)
      where.push(`(l.published_at, l.id) < (${p(cursor.at)}::timestamptz, ${p(cursor.id)}::uuid)`);

    const { rows } = await pool.query<PublicRow>(
      `select ${PUBLIC_COLUMNS}, ${distance} as distance_m
       from locations l join media m on m.location_id = l.id and m.state = 'ready'
       ${ATTRIBUTION_JOIN}
       where ${where.join(' and ')}
       order by l.published_at desc, l.id desc
       limit ${p(q.limit + 1)}`,
      params,
    );

    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    const body: Page<PublicRecord> = {
      items: await Promise.all(page.map((r) => toPublicRecord(storage, r))),
      nextCursor:
        rows.length > q.limit && last?.published_at
          ? encodeCursor(last.published_at, last.id)
          : null,
    };
    return reply.send(body);
  });

  /**
   * Map tab: published records inside the visible box, newest first, capped. Lightweight pins
   * (the detail screen fetches the full record). No creator data, same as the feed.
   */
  app.get('/v1/map', { config: { rateLimit: SEARCH_LIMIT } }, async (req, reply) => {
    await requireViewer(deps, req);
    const q = mapQuerySchema.parse(req.query);
    const params: unknown[] = [q.minLon, q.minLat, q.maxLon, q.maxLat];
    const where = [
      `l.status = 'published'`,
      `l.point && st_makeenvelope($1, $2, $3, $4, 4326)::geography`,
    ];
    if (q.goodFor?.length) {
      params.push(q.goodFor);
      where.push(`l.good_for && $${params.length}::text[]`);
    }
    if (q.bestLight?.length) {
      params.push(q.bestLight);
      where.push(`l.best_light && $${params.length}::text[]`);
    }
    params.push(MAP_PIN_LIMIT);
    const { rows } = await pool.query(
      `select l.id, l.label, st_y(l.point::geometry) as lat, st_x(l.point::geometry) as lon, m.id as media_id
       from locations l join media m on m.location_id = l.id and m.state = 'ready'
       where ${where.join(' and ')}
       order by l.published_at desc limit $${params.length}`,
      params,
    );
    const items: MapPin[] = await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        lat: r.lat,
        lon: r.lon,
        label: r.label,
        thumb: await storage.presignDownload(
          'public',
          objectKey.derivative(r.media_id, 'thumb'),
          3600,
        ),
      })),
    );
    return reply.send({ items, truncated: rows.length === MAP_PIN_LIMIT });
  });
}
