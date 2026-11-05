import { toWebRecord, webFeedQuerySchema, type Page, type WebRecord } from '@shootspot/shared';
import type { FastifyInstance } from 'fastify';
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

/** Same per-IP search limit as the app's feed (plan §10). */
const SEARCH_LIMIT = { max: 60, timeWindow: '1 minute' };
const idParam = z.object({ id: z.uuid() });

/**
 * Member web gallery (D-44): read-only, signed-in members only, and a web session only (the
 * `web` channel). Payloads are WebRecords: the public record without its exact position.
 */
export function webRoutes(app: FastifyInstance, deps: AppDeps) {
  const { pool, storage } = deps;

  app.get('/web/v1/me', async (req) => {
    const viewer = await requireViewer(deps, req, 'web');
    return { email: viewer.email };
  });

  app.get('/web/v1/vocabulary', async (req) => {
    await requireViewer(deps, req, 'web');
    return activeVocabulary(pool);
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
