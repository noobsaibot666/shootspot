import { createHash, randomBytes } from 'node:crypto';
import { feedQuerySchema, objectKey, type Page, type PublicRecord } from '@shootspot/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { tx } from '../db';
import { HttpError, notFound, requireViewer, type AppDeps } from '../http/context';
import {
  ATTRIBUTION_JOIN,
  PUBLIC_COLUMNS,
  likedColumn,
  notBlocked,
  toPublicRecord,
  type PublicRow,
} from '../records/dto';
import { decodeCursor, encodeCursor } from '../records/feed';

const idParam = z.object({ id: z.uuid() });
const createTokenSchema = z
  .object({ label: z.string().trim().min(1).max(60).optional() })
  .optional();

const integrationFeedQuerySchema = feedQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
});

const SEARCH_LIMIT = { max: 60, timeWindow: '1 minute' };

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

async function requireIntegrationViewer(
  deps: AppDeps,
  req: FastifyRequest,
): Promise<{ userId: string; email: string }> {
  const token = bearerToken(req);
  if (!token || !token.startsWith('ss_int_')) {
    throw new HttpError(401, 'unauthorized');
  }
  const tokenHash = hashToken(token);
  const { rows } = await deps.pool.query<{
    token_id: string;
    user_id: string;
    email: string;
  }>(
    `select t.id as token_id, u.id as user_id, u.email
     from integration_tokens t
     join auth_users u on u.id = t.user_id
     where t.token_hash = $1 and t.revoked_at is null
     limit 1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) throw new HttpError(401, 'unauthorized');
  void deps.pool.query(`update integration_tokens set last_used_at = now() where id = $1`, [
    row.token_id,
  ]);
  return { userId: row.user_id, email: row.email };
}

/**
 * Personal Integration Tokens (read-only) for external production pipelines such as Expose-U Portal.
 * Users can manage their token via `/web/v1/integration-token` (web session) or `/v1/me/integration-token`
 * (app bearer), and connected apps authenticate to `/v1/integrations/*` using `Authorization: Bearer ss_int_...`.
 */
export function integrationRoutes(app: FastifyInstance, deps: AppDeps) {
  const { pool, storage } = deps;

  async function getActiveToken(userId: string) {
    const { rows } = await pool.query<{
      id: string;
      label: string;
      token_prefix: string;
      created_at: Date;
      last_used_at: Date | null;
    }>(
      `select id, label, token_prefix, created_at, last_used_at
       from integration_tokens
       where user_id = $1 and revoked_at is null
       order by created_at desc
       limit 1`,
      [userId],
    );
    const row = rows[0];
    if (!row) return { active: null };
    return {
      active: {
        id: row.id,
        label: row.label,
        tokenPrefix: row.token_prefix,
        createdAt: row.created_at.toISOString(),
        lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
      },
    };
  }

  async function rotateToken(userId: string, label: string) {
    const raw = `ss_int_${randomBytes(24).toString('base64url')}`;
    const prefix = raw.slice(0, 14);
    const digest = hashToken(raw);
    const row = await tx(pool, async (c) => {
      await c.query(
        `update integration_tokens set revoked_at = now()
         where user_id = $1 and revoked_at is null`,
        [userId],
      );
      const { rows } = await c.query<{ id: string; created_at: Date }>(
        `insert into integration_tokens (user_id, label, token_prefix, token_hash)
         values ($1, $2, $3, $4)
         returning id, created_at`,
        [userId, label, prefix, digest],
      );
      return rows[0]!;
    });
    return {
      id: row.id,
      token: raw,
      label,
      tokenPrefix: prefix,
      createdAt: row.created_at.toISOString(),
    };
  }

  async function revokeToken(userId: string) {
    await pool.query(
      `update integration_tokens set revoked_at = now()
       where user_id = $1 and revoked_at is null`,
      [userId],
    );
  }

  app.get('/web/v1/integration-token', async (req) => {
    const viewer = await requireViewer(deps, req, 'web');
    return getActiveToken(viewer.userId);
  });

  app.post('/web/v1/integration-token', async (req, reply) => {
    const viewer = await requireViewer(deps, req, 'web');
    const body = createTokenSchema.parse(req.body);
    const created = await rotateToken(viewer.userId, body?.label ?? 'Portal');
    return reply.code(201).send(created);
  });

  app.delete('/web/v1/integration-token', async (req, reply) => {
    const viewer = await requireViewer(deps, req, 'web');
    await revokeToken(viewer.userId);
    return reply.code(204).send();
  });

  app.get('/v1/me/integration-token', async (req) => {
    const viewer = await requireViewer(deps, req);
    return getActiveToken(viewer.userId);
  });

  app.post('/v1/me/integration-token', async (req, reply) => {
    const viewer = await requireViewer(deps, req);
    const body = createTokenSchema.parse(req.body);
    const created = await rotateToken(viewer.userId, body?.label ?? 'Portal');
    return reply.code(201).send(created);
  });

  app.delete('/v1/me/integration-token', async (req, reply) => {
    const viewer = await requireViewer(deps, req);
    await revokeToken(viewer.userId);
    return reply.code(204).send();
  });

  /** Verify connection & return signed-in ShootSpot account email. */
  app.get('/v1/integrations/me', async (req) => {
    const viewer = await requireIntegrationViewer(deps, req);
    return { userId: viewer.userId, email: viewer.email };
  });

  /** List the connected user's ShootSpot projects. */
  app.get('/v1/integrations/projects', async (req) => {
    const viewer = await requireIntegrationViewer(deps, req);
    const { rows } = await pool.query<{
      id: string;
      name: string;
      shoot_date: string | null;
      count: number;
      cover_media_id: string | null;
    }>(
      `select p.id, p.name, to_char(p.shoot_date, 'YYYY-MM-DD') as shoot_date,
              (select count(*)::int from project_items i where i.project_id = p.id) as count,
              cover.media_id as cover_media_id
       from projects p
       left join lateral (
         select m.id as media_id from project_items i
         join locations l on l.id = i.location_id and l.status = 'published'
         join media m on m.location_id = l.id and m.state = 'ready'
         where i.project_id = p.id order by i.added_at desc limit 1
       ) cover on true
       where p.user_id = $1 order by p.position, p.created_at`,
      [viewer.userId],
    );
    return {
      items: await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          name: r.name,
          shootDate: r.shoot_date ?? null,
          count: r.count,
          cover: r.cover_media_id
            ? await storage.presignDownload(
                'public',
                objectKey.derivative(r.cover_media_id, 'thumb'),
                3600,
              )
            : null,
        })),
      ),
    };
  });

  /** Return all locations inside one of the connected user's ShootSpot projects. */
  app.get('/v1/integrations/projects/:id', async (req) => {
    const viewer = await requireIntegrationViewer(deps, req);
    const { id } = idParam.parse(req.params);
    const proj = await pool.query<{ id: string; name: string; shoot_date: string | null }>(
      `select id, name, to_char(shoot_date, 'YYYY-MM-DD') as shoot_date
       from projects where id = $1 and user_id = $2`,
      [id, viewer.userId],
    );
    const project = proj.rows[0];
    if (!project) throw notFound();
    const { rows } = await pool.query<
      PublicRow & { item_note: string | null; item_location_id: string; available: boolean }
    >(
      `select i.location_id as item_location_id, i.note as item_note,
              (l.id is not null and l.status = 'published' and m.id is not null and ${notBlocked('$2')}) as available,
              ${PUBLIC_COLUMNS}, ${likedColumn('$2')}
       from project_items i
       left join locations l on l.id = i.location_id
       left join media m on m.location_id = l.id and m.state = 'ready'
       ${ATTRIBUTION_JOIN}
       where i.project_id = $1
       order by i.position, i.added_at desc`,
      [id, viewer.userId],
    );
    return {
      id: project.id,
      name: project.name,
      shootDate: project.shoot_date ?? null,
      items: await Promise.all(
        rows.map(async (r) =>
          r.available
            ? {
                recordId: r.item_location_id,
                note: r.item_note ?? null,
                available: true,
                record: await toPublicRecord(storage, r),
              }
            : {
                recordId: r.item_location_id,
                note: r.item_note ?? null,
                available: false,
                record: null,
              },
        ),
      ),
    };
  });

  /** Browse and search the ShootSpot feed with full public metadata for Portal import. */
  app.get('/v1/integrations/feed', { config: { rateLimit: SEARCH_LIMIT } }, async (req) => {
    const viewer = await requireIntegrationViewer(deps, req);
    const q = integrationFeedQuerySchema.parse(req.query);
    if ((q.lat == null) !== (q.lon == null)) throw new HttpError(400, 'lat_lon_pair');
    const cursor = q.cursor ? decodeCursor(q.cursor) : null;

    const params: unknown[] = [];
    const p = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const viewerParam = p(viewer.userId);
    const where = [`l.status = 'published'`, notBlocked(viewerParam)];
    let distance = 'null::float8';
    if (q.lat != null && q.lon != null) {
      const origin = `st_setsrid(st_makepoint(${p(q.lon)}, ${p(q.lat)}), 4326)::geography`;
      distance = `st_distance(l.point, ${origin})`;
      where.push(`st_dwithin(l.point, ${origin}, ${p(q.radiusKm * 1000)})`);
    }
    if (q.q) {
      const pattern = `%${q.q.replace(/[%_\\]/g, '\\$&')}%`;
      const qp = p(pattern);
      where.push(
        `(l.label ilike ${qp} or coalesce(l.good_for_note, '') ilike ${qp} or coalesce(l.best_light_note, '') ilike ${qp} or array_to_string(l.good_for_custom, ' ') ilike ${qp} or array_to_string(l.best_light_custom, ' ') ilike ${qp})`,
      );
    }
    if (q.goodFor?.length) where.push(`l.good_for && ${p(q.goodFor)}::text[]`);
    if (q.bestLight?.length) where.push(`l.best_light && ${p(q.bestLight)}::text[]`);
    if (cursor) {
      where.push(`(l.published_at, l.id) < (${p(cursor.at)}::timestamptz, ${p(cursor.id)}::uuid)`);
    }

    const { rows } = await pool.query<PublicRow>(
      `select ${PUBLIC_COLUMNS}, ${distance} as distance_m, ${likedColumn(viewerParam)}
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
    return body;
  });

  app.get('/v1/integrations/records/:id', async (req) => {
    const viewer = await requireIntegrationViewer(deps, req);
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query<PublicRow>(
      `select ${PUBLIC_COLUMNS}, ${likedColumn('$2')}
       from locations l join media m on m.location_id = l.id and m.state = 'ready'
       ${ATTRIBUTION_JOIN}
       where l.id = $1 and l.status = 'published' and ${notBlocked('$2')}`,
      [id, viewer.userId],
    );
    if (!rows[0]) throw notFound();
    return toPublicRecord(storage, rows[0]);
  });
}
