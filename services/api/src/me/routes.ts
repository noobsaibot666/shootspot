import {
  attributionUpdateSchema,
  objectKey,
  onboardingSchema,
  profileUpdateSchema,
} from '@shootspot/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx } from '../db';
import {
  HttpError,
  notFound,
  requireOnboarded,
  requireViewer,
  type AppDeps,
} from '../http/context';
import { legalVersions } from '../legal';
import { imageSet } from '../records/dto';
import { purgeMedia } from '../records/purge';

const idParam = z.object({ id: z.uuid() });
const consentSchema = z.object({ kind: z.literal('attribution_notice'), version: z.string() });

export function meRoutes(app: FastifyInstance, deps: AppDeps) {
  const { pool, storage, queue, config } = deps;

  app.get('/v1/legal', async () => legalVersions(config));

  app.get('/v1/me', async (req) => {
    const viewer = await requireViewer(deps, req);
    const { rows } = await pool.query(
      `select p.*, (select status from account_deletions d where d.user_id = $1 and d.status = 'scheduled') as deletion,
              (select execute_after from account_deletions d where d.user_id = $1 and d.status = 'scheduled') as deletion_at
       from (select $1::uuid as uid) x left join profiles p on p.user_id = x.uid`,
      [viewer.userId],
    );
    const p = rows[0];
    return {
      user: { id: viewer.userId, email: viewer.email, role: viewer.role },
      profile: {
        firstName: p?.first_name ?? '',
        lastName: p?.last_name ?? '',
        displayName: p?.display_name ?? null,
        bio: p?.bio ?? null,
        portfolioUrl: p?.portfolio_url ?? null,
        socialHandle: p?.social_handle ?? null,
      },
      onboarded: Boolean(p?.onboarded_at),
      deletionScheduledFor: p?.deletion_at ? new Date(p.deletion_at).toISOString() : null,
    };
  });

  /** Age gate + versioned consents + name. Versions must match the current ones. */
  app.post('/v1/me/onboarding', async (req, reply) => {
    const viewer = await requireViewer(deps, req);
    const body = onboardingSchema.parse(req.body);
    const current = legalVersions(config);
    for (const kind of ['terms', 'privacy', 'image_license'] as const) {
      if (body.accept[kind] !== current[kind]) throw new HttpError(409, 'legal_version_outdated');
    }
    await tx(pool, async (c) => {
      await c.query(
        `insert into profiles (user_id, first_name, last_name, age_confirmed_at, onboarded_at)
         values ($1, $2, $3, now(), now())
         on conflict (user_id) do update set first_name = excluded.first_name,
           last_name = excluded.last_name, age_confirmed_at = coalesce(profiles.age_confirmed_at, now()),
           onboarded_at = coalesce(profiles.onboarded_at, now()), updated_at = now()`,
        [viewer.userId, body.firstName, body.lastName],
      );
      for (const kind of ['terms', 'privacy', 'image_license'] as const) {
        await c.query('insert into consents (user_id, kind, version) values ($1, $2, $3)', [
          viewer.userId,
          kind,
          current[kind],
        ]);
      }
      await c.query(
        `insert into consents (user_id, kind, version) values ($1, 'age_16', 'self-declared')`,
        [viewer.userId],
      );
    });
    return reply.code(204).send();
  });

  app.patch('/v1/me/profile', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const b = profileUpdateSchema.parse(req.body);
    await pool.query(
      `update profiles set
         first_name = coalesce($2, first_name), last_name = coalesce($3, last_name),
         display_name = case when $4::boolean then $5 else display_name end,
         bio = case when $6::boolean then $7 else bio end,
         portfolio_url = case when $8::boolean then $9 else portfolio_url end,
         social_handle = case when $10::boolean then $11 else social_handle end,
         updated_at = now()
       where user_id = $1`,
      [
        viewer.userId,
        b.firstName ?? null,
        b.lastName ?? null,
        b.displayName !== undefined,
        b.displayName ?? null,
        b.bio !== undefined,
        b.bio ?? null,
        b.portfolioUrl !== undefined,
        b.portfolioUrl ?? null,
        b.socialHandle !== undefined,
        b.socialHandle ?? null,
      ],
    );
    return reply.code(204).send();
  });

  app.post('/v1/me/consents', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const body = consentSchema.parse(req.body);
    if (body.version !== legalVersions(config).attribution_notice) {
      throw new HttpError(409, 'legal_version_outdated');
    }
    await pool.query('insert into consents (user_id, kind, version) values ($1, $2, $3)', [
      viewer.userId,
      body.kind,
      body.version,
    ]);
    return reply.code(204).send();
  });

  /** "My records": visible only to their creator, in every state. */
  app.get('/v1/me/records', async (req) => {
    const viewer = await requireOnboarded(deps, req);
    const { rows } = await pool.query(
      `select l.id, l.label, l.status, l.attributed, l.captured_at, l.created_at, m.id as media_id,
              m.state as media_state, m.reject_reason, m.width, m.height
       from record_ownership o join locations l on l.id = o.location_id
       join media m on m.location_id = l.id
       where o.user_id = $1 and l.status <> 'removed'
       order by l.created_at desc limit 200`,
      [viewer.userId],
    );
    return {
      items: await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          label: r.label,
          status: r.status,
          attributed: r.attributed,
          capturedAt: r.captured_at.toISOString(),
          media: { state: r.media_state, rejectReason: r.reject_reason },
          images: r.media_state === 'ready' ? await imageSet(storage, r) : null,
        })),
      ),
    };
  });

  app.patch('/v1/me/records/:id', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    const body = attributionUpdateSchema.parse(req.body);
    if (body.attributed) {
      const version = legalVersions(config).attribution_notice;
      if (body.noticeVersion !== version) throw new HttpError(409, 'attribution_notice_required');
      await pool.query(
        `insert into consents (user_id, kind, version) values ($1, 'attribution_notice', $2)`,
        [viewer.userId, version],
      );
    }
    const { rowCount } = await pool.query(
      `update locations l set attributed = $3, updated_at = now()
       from record_ownership o where o.location_id = l.id and l.id = $1 and o.user_id = $2`,
      [id, viewer.userId, body.attributed],
    );
    if (!rowCount) throw notFound();
    return reply.code(204).send();
  });

  /** Creator deletes a record: it disappears for everyone; images are purged. */
  app.delete('/v1/me/records/:id', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query(
      `select 1 from media m join record_ownership o on o.location_id = m.location_id
       where m.location_id = $1 and o.user_id = $2`,
      [id, viewer.userId],
    );
    if (!rows[0]) throw notFound();
    await pool.query(
      `update locations set status = 'removed', attributed = false, updated_at = now() where id = $1`,
      [id],
    );
    await purgeMedia(pool, storage, id);
    return reply.code(204).send();
  });

  app.post('/v1/me/exports', async (req, reply) => {
    const viewer = await requireViewer(deps, req);
    const recent = await pool.query(
      `select 1 from data_exports where user_id = $1 and created_at > now() - interval '1 day' and status <> 'failed'`,
      [viewer.userId],
    );
    if (recent.rowCount) throw new HttpError(429, 'export_recently_requested');
    const { rows } = await pool.query(
      `insert into data_exports (user_id) values ($1) returning id`,
      [viewer.userId],
    );
    await queue.dataExport({ exportId: rows[0].id });
    return reply.code(202).send({ id: rows[0].id, status: 'queued' });
  });

  app.get('/v1/me/exports', async (req) => {
    const viewer = await requireViewer(deps, req);
    const { rows } = await pool.query(
      `select id, status, created_at, ready_at, expires_at from data_exports where user_id = $1 order by created_at desc limit 10`,
      [viewer.userId],
    );
    return {
      items: await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          status: r.status,
          createdAt: r.created_at.toISOString(),
          downloadUrl:
            r.status === 'ready' && r.expires_at > new Date()
              ? await storage.presignDownload(
                  'quarantine',
                  objectKey.dataExport(viewer.userId, r.id),
                  15 * 60,
                )
              : null,
        })),
      ),
    };
  });

  /** Schedule deletion after the grace period (D-12). The worker's sweep executes it. */
  app.post('/v1/me/deletion', async (req, reply) => {
    const viewer = await requireViewer(deps, req);
    const { rows } = await pool.query(
      `insert into account_deletions (user_id, execute_after)
       values ($1, now() + make_interval(days => $2))
       on conflict (user_id) where status = 'scheduled' do update set requested_at = account_deletions.requested_at
       returning execute_after`,
      [viewer.userId, config.DELETION_GRACE_DAYS],
    );
    return reply.code(202).send({ scheduledFor: rows[0].execute_after.toISOString() });
  });

  app.delete('/v1/me/deletion', async (req, reply) => {
    const viewer = await requireViewer(deps, req);
    await pool.query(
      `update account_deletions set status = 'cancelled' where user_id = $1 and status = 'scheduled'`,
      [viewer.userId],
    );
    return reply.code(204).send();
  });
}
