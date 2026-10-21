import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx } from '../db';
import { HttpError, notFound, requireOnboarded, type AppDeps } from '../http/context';

const idParam = z.object({ id: z.uuid() });

/**
 * Blocking (D-41, App Review guideline 1.2). A member blocks the author of a location without
 * learning who they are: the client only ever sees block ids and the location label. Blocking
 * also files a 'blocked_user' report, so moderators review the content.
 */
export function blockRoutes(app: FastifyInstance, deps: AppDeps) {
  const { pool } = deps;

  app.post('/v1/records/:id/block', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query(
      `select o.user_id from record_ownership o join locations l on l.id = o.location_id
       where l.id = $1 and l.status = 'published'`,
      [id],
    );
    const author: string | undefined = rows[0]?.user_id;
    if (!author) throw notFound();
    if (author === viewer.userId) throw new HttpError(400, 'cannot_block_self');
    await tx(pool, async (c) => {
      await c.query(
        `insert into blocks (blocker_user_id, blocked_user_id, location_id) values ($1, $2, $3)
         on conflict (blocker_user_id, blocked_user_id) do nothing`,
        [viewer.userId, author, id],
      );
      await c.query(
        `insert into reports (location_id, reporter_user_id, reason) values ($1, $2, 'blocked_user')
         on conflict (location_id, reporter_user_id) where status = 'open' do nothing`,
        [id, viewer.userId],
      );
    });
    return reply.code(204).send();
  });

  /** The viewer's blocks, newest first, labelled by the location each was made from. */
  app.get('/v1/me/blocks', async (req) => {
    const viewer = await requireOnboarded(deps, req);
    const { rows } = await pool.query(
      `select b.id, b.created_at, l.label from blocks b left join locations l on l.id = b.location_id
       where b.blocker_user_id = $1 order by b.created_at desc`,
      [viewer.userId],
    );
    return {
      items: rows.map((r) => ({
        id: r.id as string,
        label: (r.label as string | null) ?? null,
        createdAt: (r.created_at as Date).toISOString(),
      })),
    };
  });

  app.delete('/v1/me/blocks/:id', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    const { rowCount } = await pool.query(
      'delete from blocks where id = $1 and blocker_user_id = $2',
      [id, viewer.userId],
    );
    if (!rowCount) throw notFound();
    return reply.code(204).send();
  });
}
