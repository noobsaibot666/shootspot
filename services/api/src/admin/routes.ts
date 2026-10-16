import { objectKey } from '@shootspot/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx, type Queryable } from '../db';
import {
  HttpError,
  notFound,
  requireAdmin,
  requireOwner,
  type AppDeps,
  type Viewer,
} from '../http/context';
import { decryptSecret, encryptSecret, newTotp, verifyTotp } from './mfa';

const idParam = z.object({ id: z.uuid() });
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/) });
const reason = z.string().trim().min(3).max(500);
const moderateSchema = z.object({ action: z.enum(['hide', 'restore', 'remove']), reason });
const resolveSchema = z.object({
  outcome: z.enum(['actioned', 'dismissed']),
  note: z.string().trim().max(500).optional(),
});
const roleSchema = z.object({ role: z.enum(['member', 'owner']), reason });
const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.iso.datetime().optional(),
});

/** Audit every admin action and every view of personal data (threat model, asset 1). */
export async function audit(
  db: Queryable,
  actor: Viewer,
  action: string,
  target: { type: string; id: string | null },
  reasonText?: string,
  details: Record<string, unknown> = {},
) {
  await db.query(
    `insert into admin_audit_events (actor_user_id, action, target_type, target_id, reason, details)
     values ($1, $2, $3, $4, $5, $6)`,
    [actor.userId, action, target.type, target.id, reasonText ?? null, JSON.stringify(details)],
  );
}

export function adminRoutes(app: FastifyInstance, deps: AppDeps) {
  const { pool, storage, config } = deps;

  // ---- MFA (owner role, session not yet verified) -------------------------------------------

  app.get('/admin/v1/mfa', async (req) => {
    const viewer = await requireOwner(deps, req);
    const { rows } = await pool.query(
      `select a.confirmed_at, exists (select 1 from admin_mfa_sessions s where s.session_id = $2) as verified
       from (select $1::uuid as uid) x left join admin_mfa a on a.user_id = x.uid`,
      [viewer.userId, viewer.sessionId],
    );
    return {
      enrolled: Boolean(rows[0]?.confirmed_at),
      sessionVerified: Boolean(rows[0]?.verified),
    };
  });

  /** Start (or restart, while unconfirmed) TOTP enrolment. Returns the otpauth:// URI once. */
  app.post('/admin/v1/mfa/enroll', async (req) => {
    const viewer = await requireOwner(deps, req);
    const existing = await pool.query('select confirmed_at from admin_mfa where user_id = $1', [
      viewer.userId,
    ]);
    if (existing.rows[0]?.confirmed_at) throw new HttpError(409, 'already_enrolled');
    const { base32, uri } = newTotp(viewer.email);
    await pool.query(
      `insert into admin_mfa (user_id, secret_enc) values ($1, $2)
       on conflict (user_id) do update set secret_enc = excluded.secret_enc, created_at = now()`,
      [viewer.userId, encryptSecret(config.AUTH_SECRET, base32)],
    );
    return { otpauthUri: uri };
  });

  /** Verify a TOTP code; confirms enrolment the first time and marks this session MFA-verified. */
  app.post('/admin/v1/mfa/verify', async (req, reply) => {
    const viewer = await requireOwner(deps, req);
    const { code } = codeSchema.parse(req.body);
    const { rows } = await pool.query('select * from admin_mfa where user_id = $1', [
      viewer.userId,
    ]);
    const mfa = rows[0];
    if (!mfa) throw new HttpError(409, 'not_enrolled');
    const replay = mfa.last_code === code && mfa.last_code_at > new Date(Date.now() - 90_000);
    if (replay || !verifyTotp(decryptSecret(config.AUTH_SECRET, mfa.secret_enc), code)) {
      await audit(pool, viewer, 'mfa.failed', { type: 'user', id: viewer.userId });
      throw new HttpError(401, 'invalid_code');
    }
    await tx(pool, async (c) => {
      await c.query(
        `update admin_mfa set confirmed_at = coalesce(confirmed_at, now()), last_code = $2, last_code_at = now()
         where user_id = $1`,
        [viewer.userId, code],
      );
      await c.query(
        `insert into admin_mfa_sessions (session_id, user_id) values ($1, $2) on conflict do nothing`,
        [viewer.sessionId, viewer.userId],
      );
      await audit(c, viewer, 'mfa.verified', { type: 'user', id: viewer.userId });
    });
    return reply.code(204).send();
  });

  // ---- Everything below requires owner + MFA-verified session -------------------------------

  app.get('/admin/v1/summary', async (req) => {
    await requireAdmin(deps, req);
    const { rows } = await pool.query(`
      select
        (select count(*)::int from auth_users) as users,
        (select count(*)::int from locations where status = 'published') as published,
        (select count(*)::int from locations where status in ('pending_media', 'processing')) as in_progress,
        (select count(*)::int from locations where status = 'hidden') as hidden,
        (select count(*)::int from reports where status = 'open') as open_reports,
        (select count(*)::int from media where state = 'failed') as failed_media,
        (select count(*)::int from media where state = 'rejected') as rejected_media,
        (select count(*)::int from account_deletions where status = 'scheduled') as scheduled_deletions,
        (select ok_at from ops_heartbeats where name = 'pg_dump') as last_backup,
        (select ok_at from ops_heartbeats where name = 'offsite') as last_offsite_backup`);
    return rows[0];
  });

  /**
   * Pilot metrics (plan Phase 6): aggregate numbers over a window, no per-person data. Upload
   * success counts media created in the window that reached a final state.
   */
  app.get('/admin/v1/metrics', async (req) => {
    await requireAdmin(deps, req);
    const q = z
      .object({ days: z.coerce.number().int().min(1).max(90).default(7) })
      .parse(req.query);
    const { rows } = await pool.query(
      `with w as (select now() - make_interval(days => $1) as since)
       select
         (select count(*)::int from auth_users, w where "createdAt" >= w.since) as new_members,
         (select count(distinct user_id)::int from record_ownership, w where created_at >= w.since) as active_creators,
         (select count(*)::int from locations, w where created_at >= w.since) as records_created,
         (select count(*)::int from locations, w where published_at >= w.since) as published,
         (select count(*)::int from locations, w where created_at >= w.since and capture_origin = 'import') as imported,
         (select count(*)::int from media, w where created_at >= w.since and state = 'ready') as media_ready,
         (select count(*)::int from media, w where created_at >= w.since and state = 'failed') as media_failed,
         (select count(*)::int from media, w where created_at >= w.since and state = 'rejected') as media_rejected,
         (select percentile_cont(0.5) within group (order by extract(epoch from published_at - created_at))
            from locations, w where published_at >= w.since) as median_publish_seconds,
         (select count(*)::int from reports, w where created_at >= w.since) as reports_opened,
         (select percentile_cont(0.5) within group (order by extract(epoch from resolved_at - created_at) / 3600)
            from reports, w where resolved_at >= w.since) as median_report_hours,
         (select count(*)::int from data_exports, w where created_at >= w.since) as exports,
         (select count(*)::int from account_deletions, w where requested_at >= w.since) as deletions_requested`,
      [q.days],
    );
    const r = rows[0];
    const finished = r.media_ready + r.media_failed + r.media_rejected;
    return {
      days: q.days,
      ...r,
      median_publish_seconds:
        r.median_publish_seconds == null ? null : Math.round(r.median_publish_seconds),
      median_report_hours:
        r.median_report_hours == null ? null : Math.round(r.median_report_hours * 10) / 10,
      upload_success_rate: finished ? r.media_ready / finished : null,
    };
  });

  /**
   * Locations library for moderation browsing: newest first, filtered by status, as a photo grid.
   * Deliberately no creator data here (D-06); the per-record view audits creator access.
   */
  app.get('/admin/v1/records', async (req) => {
    await requireAdmin(deps, req);
    const q = z
      .object({
        status: z
          .enum(['published', 'hidden', 'processing', 'rejected', 'removed', 'all'])
          .default('published'),
        before: z.iso.datetime({ offset: true }).optional(),
        limit: z.coerce.number().int().min(1).max(60).default(40),
      })
      .parse(req.query);
    const statuses =
      q.status === 'all'
        ? ['pending_media', 'processing', 'published', 'rejected', 'hidden', 'removed']
        : q.status === 'processing'
          ? ['pending_media', 'processing']
          : [q.status];
    const { rows } = await pool.query(
      `select l.id, l.label, l.status, l.created_at, l.capture_origin,
              m.id as media_id, m.state as media_state, m.width, m.height,
              (select count(*)::int from reports r where r.location_id = l.id and r.status = 'open') as open_reports
       from locations l left join media m on m.location_id = l.id
       where l.status = any($1::text[]) and ($2::timestamptz is null or l.created_at < $2)
       order by l.created_at desc limit $3`,
      [statuses, q.before ?? null, q.limit],
    );
    return {
      items: await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          label: r.label,
          status: r.status,
          origin: r.capture_origin,
          createdAt: r.created_at.toISOString(),
          openReports: r.open_reports,
          width: r.width,
          height: r.height,
          image:
            r.media_state === 'ready'
              ? await storage.presignDownload(
                  'public',
                  objectKey.derivative(r.media_id, 'feed'),
                  900,
                )
              : null,
        })),
      ),
      nextBefore: rows.length === q.limit ? rows.at(-1)!.created_at.toISOString() : null,
    };
  });

  app.get('/admin/v1/reports', async (req) => {
    await requireAdmin(deps, req);
    const q = z
      .object({ status: z.enum(['open', 'actioned', 'dismissed']).default('open') })
      .parse(req.query);
    const { rows } = await pool.query(
      `select r.id, r.reason, r.note, r.status, r.created_at, r.resolved_at, r.resolution_note,
              l.id as record_id, l.label, l.status as record_status, m.id as media_id, m.state as media_state,
              (select count(*)::int from reports r2 where r2.location_id = l.id and r2.status = 'open') as open_on_record
       from reports r join locations l on l.id = r.location_id
       left join media m on m.location_id = l.id
       where r.status = $1 order by r.created_at asc limit 200`,
      [q.status],
    );
    return {
      items: await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          reason: r.reason,
          note: r.note,
          status: r.status,
          createdAt: r.created_at.toISOString(),
          resolvedAt: r.resolved_at?.toISOString() ?? null,
          resolutionNote: r.resolution_note,
          record: {
            id: r.record_id,
            label: r.label,
            status: r.record_status,
            openReports: r.open_on_record,
            thumb:
              r.media_state === 'ready'
                ? await storage.presignDownload(
                    'public',
                    objectKey.derivative(r.media_id, 'thumb'),
                    900,
                  )
                : null,
          },
        })),
      ),
    };
  });

  app.post('/admin/v1/reports/:id/resolve', async (req, reply) => {
    const viewer = await requireAdmin(deps, req);
    const { id } = idParam.parse(req.params);
    const body = resolveSchema.parse(req.body);
    await tx(pool, async (c) => {
      const { rowCount } = await c.query(
        `update reports set status = $2, resolved_at = now(), resolved_by = $3, resolution_note = $4
         where id = $1 and status = 'open'`,
        [id, body.outcome, viewer.userId, body.note ?? null],
      );
      if (!rowCount) throw notFound();
      await audit(c, viewer, `report.${body.outcome}`, { type: 'report', id }, body.note);
    });
    return reply.code(204).send();
  });

  /** Hide / restore / remove a record. Always needs a reason; always audited. */
  app.post('/admin/v1/records/:id/moderate', async (req, reply) => {
    const viewer = await requireAdmin(deps, req);
    const { id } = idParam.parse(req.params);
    const body = moderateSchema.parse(req.body);
    const next = { hide: 'hidden', restore: 'published', remove: 'removed' }[body.action];
    const allowedFrom = {
      hide: ['published'],
      restore: ['hidden'],
      remove: ['published', 'hidden'],
    }[body.action];
    await tx(pool, async (c) => {
      const { rows } = await c.query('select status from locations where id = $1 for update', [id]);
      if (!rows[0]) throw notFound();
      if (!allowedFrom.includes(rows[0].status)) throw new HttpError(409, 'invalid_transition');
      await c.query(
        `update locations set status = $2, moderation_reason = $3, updated_at = now() where id = $1`,
        [id, next, body.reason],
      );
      await audit(c, viewer, `record.${body.action}`, { type: 'location', id }, body.reason, {
        from: rows[0].status,
        to: next,
      });
    });
    return reply.code(204).send();
  });

  /** Full record for moderation, including who created it. Viewing the creator is audited. */
  app.get('/admin/v1/records/:id', async (req) => {
    const viewer = await requireAdmin(deps, req);
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query(
      `select l.id, l.label, l.status, l.moderation_reason, l.attributed, l.good_for, l.best_light,
              st_y(l.point::geometry) as lat, st_x(l.point::geometry) as lon, l.created_at, l.published_at,
              m.id as media_id, m.state as media_state, m.reject_reason, m.last_error,
              o.user_id as creator_id, u.email as creator_email
       from locations l left join media m on m.location_id = l.id
       left join record_ownership o on o.location_id = l.id
       left join auth_users u on u.id = o.user_id
       where l.id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) throw notFound();
    await audit(pool, viewer, 'record.view_creator', { type: 'location', id });
    return {
      ...r,
      created_at: r.created_at.toISOString(),
      published_at: r.published_at?.toISOString() ?? null,
      thumb:
        r.media_state === 'ready'
          ? await storage.presignDownload('public', objectKey.derivative(r.media_id, 'detail'), 900)
          : null,
    };
  });

  app.get('/admin/v1/users', async (req) => {
    await requireAdmin(deps, req);
    const q = z.object({ q: z.string().trim().max(100).default('') }).parse(req.query);
    const { rows } = await pool.query(
      `select u.id, u.email, u.role, u."createdAt" as created_at, p.onboarded_at,
              (select count(*)::int from record_ownership o where o.user_id = u.id) as records,
              (select count(*)::int from auth_sessions s where s."userId" = u.id and s."expiresAt" > now()) as sessions
       from auth_users u left join profiles p on p.user_id = u.id
       where $1 = '' or u.email ilike '%' || $1 || '%'
       order by u."createdAt" desc limit 100`,
      [q.q],
    );
    return { items: rows };
  });

  app.post('/admin/v1/users/:id/role', async (req, reply) => {
    const viewer = await requireAdmin(deps, req);
    const { id } = idParam.parse(req.params);
    const body = roleSchema.parse(req.body);
    if (id === viewer.userId && body.role !== 'owner')
      throw new HttpError(409, 'cannot_demote_self');
    await tx(pool, async (c) => {
      const { rowCount } = await c.query(`update auth_users set role = $2 where id = $1`, [
        id,
        body.role,
      ]);
      if (!rowCount) throw notFound();
      if (body.role !== 'owner') {
        await c.query('delete from admin_mfa_sessions where user_id = $1', [id]);
      }
      await audit(c, viewer, 'user.role', { type: 'user', id }, body.reason, { role: body.role });
    });
    return reply.code(204).send();
  });

  /** Sign a user out everywhere (e.g. compromised account). */
  app.post('/admin/v1/users/:id/revoke-sessions', async (req, reply) => {
    const viewer = await requireAdmin(deps, req);
    const { id } = idParam.parse(req.params);
    const body = z.object({ reason }).parse(req.body);
    await tx(pool, async (c) => {
      await c.query(`delete from auth_sessions where "userId" = $1`, [id]);
      await audit(c, viewer, 'user.revoke_sessions', { type: 'user', id }, body.reason);
    });
    return reply.code(204).send();
  });

  app.get('/admin/v1/audit', async (req) => {
    await requireAdmin(deps, req);
    const q = pageSchema.parse(req.query);
    const { rows } = await pool.query(
      `select e.id, e.action, e.target_type, e.target_id, e.reason, e.details, e.created_at, u.email as actor
       from admin_audit_events e left join auth_users u on u.id = e.actor_user_id
       where ($1::timestamptz is null or e.created_at < $1)
       order by e.created_at desc limit $2`,
      [q.before ?? null, q.limit],
    );
    return { items: rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() })) };
  });

  /** Re-queue processing for media that failed (e.g. storage outage). Rejected images stay rejected. */
  app.post('/admin/v1/media/:id/retry', async (req, reply) => {
    const viewer = await requireAdmin(deps, req);
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query(
      `update media set state = 'queued', last_error = null, updated_at = now()
       where id = $1 and state in ('failed', 'queued', 'processing') returning location_id`,
      [id],
    );
    if (!rows[0]) throw new HttpError(409, 'not_retryable');
    await pool.query(
      `update locations set status = 'processing' where id = $1 and status = 'pending_media'`,
      [rows[0].location_id],
    );
    await deps.queue.processMedia({ mediaId: id });
    await audit(pool, viewer, 'media.retry', { type: 'media', id });
    return reply.code(202).send({ state: 'queued' });
  });

  /** Upload health: media by state, plus the latest failures with their errors. */
  app.get('/admin/v1/uploads', async (req) => {
    await requireAdmin(deps, req);
    const states = await pool.query(`select state, count(*)::int as n from media group by state`);
    const problems = await pool.query(
      `select m.id, m.location_id, m.state, m.reject_reason, m.last_error, m.attempts, m.updated_at
       from media m where m.state in ('failed', 'rejected')
          or (m.state in ('queued', 'processing') and m.updated_at < now() - interval '15 minutes')
          or (m.state = 'awaiting_upload' and m.created_at < now() - interval '1 day')
       order by m.updated_at desc limit 100`,
    );
    return {
      byState: Object.fromEntries(states.rows.map((r) => [r.state, r.n])),
      problems: problems.rows.map((r) => ({ ...r, updated_at: r.updated_at.toISOString() })),
    };
  });
}
