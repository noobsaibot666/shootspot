import {
  objectKey,
  projectCreateSchema,
  projectUpdateSchema,
  reportSchema,
} from '@shootspot/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError, notFound, requireOnboarded, type AppDeps } from '../http/context';
import {
  ATTRIBUTION_JOIN,
  PUBLIC_COLUMNS,
  likedColumn,
  toPublicRecord,
  type PublicRow,
} from '../records/dto';

const idParam = z.object({ id: z.uuid() });
const itemParams = z.object({ id: z.uuid(), recordId: z.uuid() });
const addItemSchema = z.object({ recordId: z.uuid() });
const DAILY_REPORT_LIMIT = 20;

/** Private projects (D-09) and reports. Every query is scoped to the viewer's own user id. */
export function projectRoutes(app: FastifyInstance, deps: AppDeps) {
  const { pool, storage } = deps;

  app.get('/v1/projects', async (req) => {
    const viewer = await requireOnboarded(deps, req);
    const { rows } = await pool.query(
      `select p.id, p.name,
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

  app.post('/v1/projects', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { name } = projectCreateSchema.parse(req.body);
    const { rows } = await pool.query(
      `insert into projects (user_id, name, position)
       values ($1, $2, coalesce((select max(position) + 1 from projects where user_id = $1), 0))
       returning id, name`,
      [viewer.userId, name],
    );
    return reply.code(201).send({ id: rows[0].id, name: rows[0].name, count: 0, cover: null });
  });

  app.patch('/v1/projects/:id', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    const body = projectUpdateSchema.parse(req.body);
    const { rowCount } = await pool.query(
      `update projects set name = coalesce($3, name), position = coalesce($4, position), updated_at = now()
       where id = $1 and user_id = $2`,
      [id, viewer.userId, body.name ?? null, body.position ?? null],
    );
    if (!rowCount) throw notFound();
    return reply.code(204).send();
  });

  app.delete('/v1/projects/:id', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    const { rowCount } = await pool.query('delete from projects where id = $1 and user_id = $2', [
      id,
      viewer.userId,
    ]);
    if (!rowCount) throw notFound();
    return reply.code(204).send();
  });

  /** Items; removed or moderated records stay in the list as "no longer available". */
  app.get('/v1/projects/:id/items', async (req) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    await ownProject(id, viewer.userId);
    const { rows } = await pool.query<PublicRow & { item_location_id: string; available: boolean }>(
      `select i.location_id as item_location_id, (l.status = 'published' and m.id is not null) as available,
              ${PUBLIC_COLUMNS}, ${likedColumn('$2')}
       from project_items i join locations l on l.id = i.location_id
       left join media m on m.location_id = l.id and m.state = 'ready'
       ${ATTRIBUTION_JOIN}
       where i.project_id = $1 order by i.position, i.added_at`,
      [id, viewer.userId],
    );
    return {
      items: await Promise.all(
        rows.map(async (r) =>
          r.available
            ? {
                recordId: r.item_location_id,
                available: true,
                record: await toPublicRecord(storage, r),
              }
            : { recordId: r.item_location_id, available: false, record: null },
        ),
      ),
    };
  });

  app.post('/v1/projects/:id/items', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    const { recordId } = addItemSchema.parse(req.body);
    await ownProject(id, viewer.userId);
    const visible = await pool.query(
      `select 1 from locations where id = $1 and status = 'published'`,
      [recordId],
    );
    if (!visible.rowCount) throw notFound();
    await pool.query(
      `insert into project_items (project_id, location_id, position)
       values ($1, $2, coalesce((select max(position) + 1 from project_items where project_id = $1), 0))
       on conflict do nothing`,
      [id, recordId],
    );
    return reply.code(204).send();
  });

  app.delete('/v1/projects/:id/items/:recordId', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { id, recordId } = itemParams.parse(req.params);
    await ownProject(id, viewer.userId);
    await pool.query('delete from project_items where project_id = $1 and location_id = $2', [
      id,
      recordId,
    ]);
    return reply.code(204).send();
  });

  app.post('/v1/records/:id/reports', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    const body = reportSchema.parse(req.body);
    const recent = await pool.query(
      `select count(*)::int as n from reports where reporter_user_id = $1 and created_at > now() - interval '1 day'`,
      [viewer.userId],
    );
    if (recent.rows[0].n >= DAILY_REPORT_LIMIT) throw new HttpError(429, 'daily_limit');
    const visible = await pool.query(
      `select 1 from locations where id = $1 and status = 'published'`,
      [id],
    );
    if (!visible.rowCount) throw notFound();
    try {
      await pool.query(
        `insert into reports (location_id, reporter_user_id, reason, note) values ($1, $2, $3, $4)`,
        [id, viewer.userId, body.reason, body.note ?? null],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new HttpError(409, 'already_reported');
      throw err;
    }
    return reply.code(201).send({ status: 'received' });
  });

  /** For the save sheet: which of MY projects already contain this record. */
  app.get('/v1/records/:id/projects', async (req) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query(
      `select i.project_id from project_items i join projects p on p.id = i.project_id
       where i.location_id = $1 and p.user_id = $2`,
      [id, viewer.userId],
    );
    return { projectIds: rows.map((r) => r.project_id as string) };
  });

  async function ownProject(id: string, userId: string) {
    const { rowCount } = await pool.query('select 1 from projects where id = $1 and user_id = $2', [
      id,
      userId,
    ]);
    if (!rowCount) throw notFound();
  }
}
