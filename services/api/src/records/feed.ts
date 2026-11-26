import {
  MAP_PIN_LIMIT,
  feedQuerySchema,
  mapQuerySchema,
  objectKey,
  type MapPin,
  type Page,
  type PublicRecord,
  type ScoutFilters,
} from '@shootspot/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError, notFound, requireViewer, type AppDeps } from '../http/context';
import {
  ATTRIBUTION_JOIN,
  PUBLIC_COLUMNS,
  likedColumn,
  notBlocked,
  toPublicRecord,
  type PublicRow,
} from './dto';

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

/** Shared SQL predicates for feed and map queries (Phase 1.5B). */
export function applyScoutFilters(q: ScoutFilters, p: (v: unknown) => string, where: string[]) {
  if (q.goodFor?.length) where.push(`l.good_for && ${p(q.goodFor)}::text[]`);
  if (q.bestLight?.length) where.push(`l.best_light && ${p(q.bestLight)}::text[]`);
  if (q.drone === 'allowed') where.push(`l.advanced->'rules'->>'drone' = 'allowed'`);
  if (q.noPermit) where.push(`l.advanced->'rules'->>'permitRequired' = 'no'`);
  if (q.parking) where.push(`l.advanced->'practical'->>'parking' = 'yes'`);
  if (q.power) where.push(`l.advanced->'practical'->>'power' = 'yes'`);
  if (q.restrooms) where.push(`l.advanced->'practical'->>'restrooms' = 'yes'`);
  if (q.easyTerrain) where.push(`l.advanced->'access'->>'terrain' = 'easy'`);
  if (q.tideDependent) where.push(`l.advanced->'conditions'->>'tideDependent' = 'yes'`);
  if (q.quiet) where.push(`l.advanced->'conditions'->>'noiseLevel' = 'quiet'`);
  if (q.focalBand === 'wide') where.push(`l.focal_length_35mm < 28`);
  else if (q.focalBand === 'standard')
    where.push(`l.focal_length_35mm >= 28 and l.focal_length_35mm <= 70`);
  else if (q.focalBand === 'telephoto') where.push(`l.focal_length_35mm > 70`);
}

export function feedRoutes(app: FastifyInstance, deps: AppDeps) {
  const { pool, storage } = deps;

  /**
   * Discover published records, newest first. With lat/lon: only within radiusKm, with distance.
   * Without: everything (manual browsing, D-15). Filters: Good for / best light (any match).
   */
  app.get('/v1/feed', { config: { rateLimit: SEARCH_LIMIT } }, async (req, reply) => {
    const viewer = await requireViewer(deps, req); // D-05: sign-in required to see anything
    const q = feedQuerySchema.parse(req.query);
    if ((q.lat == null) !== (q.lon == null)) throw new HttpError(400, 'lat_lon_pair');
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;

    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const where = [`l.status = 'published'`, notBlocked(p(viewer.userId))];
    let distance = 'null::float8';
    if (q.lat != null && q.lon != null) {
      const origin = `st_setsrid(st_makepoint(${p(q.lon)}, ${p(q.lat)}), 4326)::geography`;
      distance = `st_distance(l.point, ${origin})`;
      where.push(`st_dwithin(l.point, ${origin}, ${p(q.radiusKm * 1000)})`);
    }
    applyScoutFilters(q, p, where);
    if (cursor)
      where.push(`(l.published_at, l.id) < (${p(cursor.at)}::timestamptz, ${p(cursor.id)}::uuid)`);

    const liked = likedColumn(p(viewer.userId));
    const { rows } = await pool.query<PublicRow>(
      `select ${PUBLIC_COLUMNS}, ${distance} as distance_m, ${liked}
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
    const viewer = await requireViewer(deps, req);
    const q = mapQuerySchema.parse(req.query);
    const params: unknown[] = [q.minLon, q.minLat, q.maxLon, q.maxLat, viewer.userId];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const where = [
      `l.status = 'published'`,
      `l.point && st_makeenvelope($1, $2, $3, $4, 4326)::geography`,
      notBlocked('$5'),
    ];
    applyScoutFilters(q, p, where);
    const { rows } = await pool.query(
      `select l.id, l.label, st_y(l.point::geometry) as lat, st_x(l.point::geometry) as lon, m.id as media_id
       from locations l join media m on m.location_id = l.id and m.state = 'ready'
       where ${where.join(' and ')}
       order by l.published_at desc limit ${p(MAP_PIN_LIMIT)}`,
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

  /**
   * Moodboard-to-Location Matcher (Phase 2D): finds locations matching a reference spot's
   * shooting tags, light periods, framing, focal-length perspective, and terrain.
   */
  app.get(
    '/v1/records/:id/similar',
    { config: { rateLimit: SEARCH_LIMIT } },
    async (req, reply) => {
      const viewer = await requireViewer(deps, req);
      const { id } = z.object({ id: z.uuid() }).parse(req.params);
      const q = z
        .object({
          lat: z.coerce.number().min(-90).max(90).optional(),
          lon: z.coerce.number().min(-180).max(180).optional(),
          radiusKm: z.coerce.number().min(1).max(200).default(50),
          limit: z.coerce.number().int().min(1).max(20).default(8),
        })
        .parse(req.query);
      if ((q.lat == null) !== (q.lon == null)) throw new HttpError(400, 'lat_lon_pair');

      const refRes = await pool.query<{
        good_for: string[];
        best_light: string[];
        framing: string;
        focal_length_35mm: number | null;
        terrain: string | null;
      }>(
        `select good_for, best_light, framing, focal_length_35mm,
              advanced->'access'->>'terrain' as terrain
       from locations l
       where l.id = $1 and l.status = 'published' and ${notBlocked('$2')}`,
        [id, viewer.userId],
      );
      const ref = refRes.rows[0];
      if (!ref) throw notFound();

      const params: unknown[] = [
        id,
        viewer.userId,
        ref.good_for,
        ref.best_light,
        ref.framing,
        ref.focal_length_35mm,
        ref.terrain,
      ];
      const p = (v: unknown) => {
        params.push(v);
        return `$${params.length}`;
      };

      const where = [
        `l.status = 'published'`,
        `l.id <> $1`,
        notBlocked('$2'),
        `(l.good_for && $3::text[] or l.best_light && $4::text[])`,
      ];
      let distance = 'null::float8';
      if (q.lat != null && q.lon != null) {
        const origin = `st_setsrid(st_makepoint(${p(q.lon)}, ${p(q.lat)}), 4326)::geography`;
        distance = `st_distance(l.point, ${origin})`;
        where.push(`st_dwithin(l.point, ${origin}, ${p(q.radiusKm * 1000)})`);
      }

      const scoreExpr = `(
      coalesce(cardinality(array(select unnest(l.good_for) intersect select unnest($3::text[]))), 0) * 3 +
      coalesce(cardinality(array(select unnest(l.best_light) intersect select unnest($4::text[]))), 0) * 2 +
      case when l.framing = $5 then 2 else 0 end +
      case when $6::float8 is not null and l.focal_length_35mm is not null and (
        ($6::float8 < 28 and l.focal_length_35mm < 28) or
        ($6::float8 between 28 and 70 and l.focal_length_35mm between 28 and 70) or
        ($6::float8 > 70 and l.focal_length_35mm > 70)
      ) then 2 else 0 end +
      case when $7::text is not null and l.advanced->'access'->>'terrain' = $7 then 1 else 0 end
    )`;

      const { rows } = await pool.query<PublicRow>(
        `select ${PUBLIC_COLUMNS}, ${distance} as distance_m, ${likedColumn('$2')}
       from locations l join media m on m.location_id = l.id and m.state = 'ready'
       ${ATTRIBUTION_JOIN}
       where ${where.join(' and ')}
       order by ${scoreExpr} desc, l.published_at desc
       limit ${p(q.limit)}`,
        params,
      );

      return reply.send({
        items: await Promise.all(rows.map((r) => toPublicRecord(storage, r))),
      });
    },
  );
}
