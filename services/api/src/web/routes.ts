import {
  objectKey,
  toWebRecord,
  webFeedQuerySchema,
  type Page,
  type WebRecord,
} from '@shootspot/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { notFound, requireViewer, type AppDeps } from '../http/context';
import {
  ATTRIBUTION_JOIN,
  PUBLIC_COLUMNS,
  notBlocked,
  toPublicRecord,
  type PublicRow,
} from '../records/dto';
import { decodeCursor, encodeCursor } from '../records/feed';
import { activeVocabulary } from '../vocabulary/routes';
import { buildLocationArchive, type ExportLocation } from './export';

/** Same per-IP search limit as the app's feed (plan §10). */
const SEARCH_LIMIT = { max: 60, timeWindow: '1 minute' };
const idParam = z.object({ id: z.uuid() });

function exportFilename(label: string | null, all: boolean): string {
  const date = new Date().toISOString().slice(0, 10);
  if (all) return `shootspot-export-${date}.zip`;
  const slug = (label ?? 'location')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `shootspot-${slug || 'location'}-${date}.zip`;
}

/**
 * Member web gallery (D-44): read-only, signed-in members only, and a web session only (the
 * `web` channel). Payloads are WebRecords: the public record without its exact position.
 */
export function webRoutes(app: FastifyInstance, deps: AppDeps) {
  const { pool, storage } = deps;

  async function exportLocations(userId: string, id?: string): Promise<ExportLocation[]> {
    const params: unknown[] = [userId];
    const where = [`l.status = 'published'`, `m.state = 'ready'`, notBlocked('$1')];
    if (id) {
      params.push(id);
      where.push('l.id = $2');
    }
    const { rows } = await pool.query<PublicRow>(
      `select ${PUBLIC_COLUMNS}
       from locations l join media m on m.location_id = l.id and m.state = 'ready'
       ${ATTRIBUTION_JOIN}
       where ${where.join(' and ')}
       order by l.published_at desc nulls last, l.id desc`,
      params,
    );
    if (id && !rows[0]) throw notFound();
    return Promise.all(
      rows.map(async (row) => ({
        id: row.id,
        label: row.label,
        lat: row.lat,
        lon: row.lon,
        accuracyM: row.accuracy_m,
        framing: row.framing,
        goodFor: row.good_for,
        goodForCustom: row.good_for_custom,
        goodForNote: row.good_for_note,
        bestLight: row.best_light,
        bestLightCustom: row.best_light_custom,
        bestLightNote: row.best_light_note,
        bearingDeg: row.bearing_deg,
        advanced: row.advanced,
        capturedAt: row.captured_at.toISOString(),
        altitudeM: row.altitude_m,
        focalLength35mm: row.focal_length_35mm,
        sun:
          row.sun_azimuth_deg == null || row.sun_elevation_deg == null
            ? null
            : { azimuthDeg: row.sun_azimuth_deg, elevationDeg: row.sun_elevation_deg },
        attribution: row.attr_name
          ? {
              name: row.attr_name,
              portfolioUrl: row.attr_portfolio,
              socialHandle: row.attr_social,
            }
          : null,
        imageBytes: await storage.get('public', objectKey.derivative(row.media_id, 'detail')),
      })),
    );
  }

  async function sendExport(req: FastifyRequest, reply: FastifyReply, id?: string) {
    const viewer = await requireViewer(deps, req, 'web');
    const locations = await exportLocations(viewer.userId, id);
    const archive = buildLocationArchive(locations);
    reply
      .header('content-type', 'application/zip')
      .header(
        'content-disposition',
        `attachment; filename="${exportFilename(locations[0]?.label ?? null, !id)}"`,
      )
      .header('cache-control', 'no-store')
      .send(archive);
  }

  app.get('/web/v1/me', async (req) => {
    const viewer = await requireViewer(deps, req, 'web');
    return { email: viewer.email };
  });

  app.get('/web/v1/vocabulary', async (req) => {
    await requireViewer(deps, req, 'web');
    return activeVocabulary(pool);
  });

  app.get('/web/v1/export', async (req, reply) => sendExport(req, reply));

  app.get('/web/v1/records/:id/export', async (req, reply) => {
    const { id } = idParam.parse(req.params);
    return sendExport(req, reply, id);
  });

  /** All published locations, newest first, with the app's tag filters. Blocks still apply. */
  app.get('/web/v1/feed', { config: { rateLimit: SEARCH_LIMIT } }, async (req, reply) => {
    const viewer = await requireViewer(deps, req, 'web');
    const q = webFeedQuerySchema.parse(req.query);
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;
    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const where = [`l.status = 'published'`, notBlocked(p(viewer.userId))];
    if (q.goodFor?.length) where.push(`l.good_for && ${p(q.goodFor)}::text[]`);
    if (q.bestLight?.length) where.push(`l.best_light && ${p(q.bestLight)}::text[]`);
    if (cursor)
      where.push(`(l.published_at, l.id) < (${p(cursor.at)}::timestamptz, ${p(cursor.id)}::uuid)`);
    const { rows } = await pool.query<PublicRow>(
      `select ${PUBLIC_COLUMNS}
       from locations l join media m on m.location_id = l.id and m.state = 'ready'
       ${ATTRIBUTION_JOIN}
       where ${where.join(' and ')}
       order by l.published_at desc, l.id desc
       limit ${p(q.limit + 1)}`,
      params,
    );
    const page = rows.slice(0, q.limit);
    const last = page.at(-1);
    const body: Page<WebRecord> = {
      items: await Promise.all(
        page.map(async (r) => toWebRecord(await toPublicRecord(storage, r))),
      ),
      nextCursor:
        rows.length > q.limit && last?.published_at
          ? encodeCursor(last.published_at, last.id)
          : null,
    };
    return reply.send(body);
  });

  /** One published location (a shareable /l/:id page on the web). */
  app.get('/web/v1/records/:id', async (req, reply) => {
    const viewer = await requireViewer(deps, req, 'web');
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query<PublicRow>(
      `select ${PUBLIC_COLUMNS}
       from locations l join media m on m.location_id = l.id and m.state = 'ready'
       ${ATTRIBUTION_JOIN}
       where l.id = $1 and l.status = 'published' and ${notBlocked('$2')}`,
      [id, viewer.userId],
    );
    if (!rows[0]) throw notFound();
    return reply.send(toWebRecord(await toPublicRecord(storage, rows[0])));
  });
}
