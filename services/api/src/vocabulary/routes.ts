import { TAG_KINDS, tagKey, type Vocabulary } from '@shootspot/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../admin/routes';
import { tx, type Queryable } from '../db';
import { HttpError, notFound, requireAdmin, type AppDeps } from '../http/context';

/**
 * Admin-managed tag lists (D-25). Keys are permanent; labels, order and visibility are editable.
 * New records may only use ACTIVE keys; old records keep whatever keys they have.
 */

const kindParam = z.object({ kind: z.enum(TAG_KINDS), key: tagKey });
const createSchema = z.object({
  kind: z.enum(TAG_KINDS),
  key: tagKey,
  label: z.string().trim().min(1).max(60),
});
const updateSchema = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    active: z.boolean().optional(),
    position: z.number().int().min(0).max(999).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'nothing to change');

export async function activeVocabulary(db: Queryable): Promise<Vocabulary> {
  const { rows } = await db.query(
    `select kind, key, label from vocabulary where active order by kind, position, label`,
  );
  return {
    goodFor: rows.filter((r) => r.kind === 'good_for').map((r) => ({ key: r.key, label: r.label })),
    bestLight: rows
      .filter((r) => r.kind === 'best_light')
      .map((r) => ({ key: r.key, label: r.label })),
  };
}

/** Throws 400 unknown_tag when a draft uses a key that isn't in the active vocabulary. */
export async function assertActiveTags(db: Queryable, goodFor: string[], bestLight: string[]) {
  const { rows } = await db.query(
    `select kind, key from vocabulary where active and (
       (kind = 'good_for' and key = any($1::text[])) or (kind = 'best_light' and key = any($2::text[])))`,
    [goodFor, bestLight],
  );
  const ok = new Set(rows.map((r) => `${r.kind}:${r.key}`));
  const bad = [
    ...goodFor.filter((k) => !ok.has(`good_for:${k}`)),
    ...bestLight.filter((k) => !ok.has(`best_light:${k}`)),
  ];
  if (bad.length) throw new HttpError(400, 'unknown_tag', `unknown tag(s): ${bad.join(', ')}`);
}

export function vocabularyRoutes(app: FastifyInstance, deps: AppDeps) {
  const { pool } = deps;

  /** Public (like /v1/legal): the app needs the lists before sign-in completes. */
  app.get('/v1/vocabulary', async () => activeVocabulary(pool));

  app.get('/admin/v1/vocabulary', async (req) => {
    await requireAdmin(deps, req);
    const { rows } = await pool.query(
      `select v.kind, v.key, v.label, v.position, v.active,
              (select count(*)::int from locations l
               where (v.kind = 'good_for' and v.key = any(l.good_for))
                  or (v.kind = 'best_light' and v.key = any(l.best_light))) as used
       from vocabulary v order by v.kind, v.position, v.label`,
    );
    return { items: rows };
  });

  app.post('/admin/v1/vocabulary', async (req, reply) => {
    const viewer = await requireAdmin(deps, req);
    const body = createSchema.parse(req.body);
    await tx(pool, async (c) => {
      const { rowCount } = await c.query(
        `insert into vocabulary (kind, key, label, position)
         values ($1, $2, $3, coalesce((select max(position) + 1 from vocabulary where kind = $1), 0))
         on conflict do nothing`,
        [body.kind, body.key, body.label],
      );
      if (!rowCount) throw new HttpError(409, 'tag_exists');
      await audit(c, viewer, 'vocabulary.add', { type: 'vocabulary', id: null }, undefined, body);
    });
    return reply.code(201).send({ ...body, active: true });
  });

  app.patch('/admin/v1/vocabulary/:kind/:key', async (req, reply) => {
    const viewer = await requireAdmin(deps, req);
    const { kind, key } = kindParam.parse(req.params);
    const body = updateSchema.parse(req.body);
    await tx(pool, async (c) => {
      const { rowCount } = await c.query(
        `update vocabulary set label = coalesce($3, label), active = coalesce($4, active),
           position = coalesce($5, position), updated_at = now()
         where kind = $1 and key = $2`,
        [kind, key, body.label ?? null, body.active ?? null, body.position ?? null],
      );
      if (!rowCount) throw notFound();
      await audit(c, viewer, 'vocabulary.update', { type: 'vocabulary', id: null }, undefined, {
        kind,
        key,
        ...body,
      });
    });
    return reply.code(204).send();
  });
}
