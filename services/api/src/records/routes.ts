import {
  MAX_UPLOAD_BYTES,
  draftRecordSchema,
  objectKey,
  sunAtCapture,
  type CreateRecordResponse,
  type RecordStatusResponse,
} from '@shootspot/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { tx } from '../db';
import { HttpError, notFound, requireOnboarded, getViewer, type AppDeps } from '../http/context';
import { legalVersions } from '../legal';
import { assertActiveTags } from '../vocabulary/routes';
import {
  ATTRIBUTION_JOIN,
  PUBLIC_COLUMNS,
  likedColumn,
  toPublicRecord,
  type PublicRow,
} from './dto';

const UPLOAD_URL_TTL = 15 * 60;
/** Plan §10: upload quota per member. */
const DAILY_RECORD_LIMIT = 30;
const idParam = z.object({ id: z.uuid() });

export function recordRoutes(app: FastifyInstance, deps: AppDeps) {
  const { pool, storage, queue, config } = deps;

  /**
   * Create a record from a draft and get an upload URL. Idempotent on draftId: retrying the same
   * draft returns the same record (and a fresh URL while the upload is still missing).
   */
  app.post('/v1/records', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const draft = draftRecordSchema.parse(req.body);

    const existing = await pool.query(
      `select o.location_id, o.user_id, l.status, m.id as media_id, m.state
       from record_ownership o join locations l on l.id = o.location_id
       join media m on m.location_id = l.id where o.draft_id = $1`,
      [draft.draftId],
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      if (row.user_id !== viewer.userId) throw new HttpError(409, 'draft_conflict');
      return reply.send(await createResponse(row.location_id, row.status, row.media_id, row.state));
    }

    const today = await pool.query(
      `select count(*)::int as n from record_ownership where user_id = $1 and created_at > now() - interval '1 day'`,
      [viewer.userId],
    );
    if (today.rows[0].n >= DAILY_RECORD_LIMIT) throw new HttpError(429, 'daily_limit');

    if (draft.attributed) await assertAttributionAccepted(viewer.userId);
    await assertActiveTags(pool, draft.short.goodFor, draft.short.bestLight);

    const sun = sunAtCapture(new Date(draft.capture.capturedAt), draft.pin.lat, draft.pin.lon);
    const created = await tx(pool, async (c) => {
      const loc = await c.query(
        `insert into locations (point, accuracy_m, pin_source, label, framing, good_for, good_for_note,
           best_light, best_light_note, bearing_deg, advanced, captured_at, altitude_m,
           focal_length_35mm, heading_deg, sun_azimuth_deg, sun_elevation_deg, attributed,
           capture_origin, good_for_custom, best_light_custom)
         values (st_setsrid(st_makepoint($1, $2), 4326)::geography, $3, $4, $5, $6, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
         returning id, status`,
        [
          draft.pin.lon,
          draft.pin.lat,
          draft.pin.accuracyM,
          draft.pin.source,
          draft.short.label,
          draft.framing,
          draft.short.goodFor,
          draft.short.goodForNote ?? null,
          draft.short.bestLight,
          draft.short.bestLightNote ?? null,
          draft.short.bearingDeg,
          JSON.stringify(draft.advanced ?? {}),
          draft.capture.capturedAt,
          draft.capture.altitudeM,
          draft.capture.focalLength35mm,
          draft.capture.headingDeg,
          sun.azimuthDeg,
          sun.elevationDeg,
          draft.attributed,
          draft.capture.origin,
          draft.short.goodForCustom,
          draft.short.bestLightCustom,
        ],
      );
      const locationId: string = loc.rows[0].id;
      await c.query(
        'insert into record_ownership (location_id, user_id, draft_id) values ($1, $2, $3)',
        [locationId, viewer.userId, draft.draftId],
      );
      const mediaId = crypto.randomUUID();
      await c.query(
        `insert into media (id, location_id, original_key, license_version) values ($1, $2, $3, $4)`,
        [mediaId, locationId, objectKey.original(mediaId), config.IMAGE_LICENSE_VERSION],
      );
      return { locationId, status: loc.rows[0].status, mediaId };
    });
    return reply
      .code(201)
      .send(
        await createResponse(
          created.locationId,
          created.status,
          created.mediaId,
          'awaiting_upload',
        ),
      );
  });

  /** The client finished the PUT. Verify the object exists and queue processing. Idempotent. */
  app.post('/v1/records/:id/upload-complete', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    const media = await ownedMedia(id, viewer.userId);
    if (media.state === 'awaiting_upload') {
      const head = await storage.head('quarantine', media.original_key);
      if (!head) throw new HttpError(409, 'upload_missing');
      if (head.size > MAX_UPLOAD_BYTES) {
        await storage.remove('quarantine', media.original_key);
        throw new HttpError(413, 'upload_too_large');
      }
      await tx(pool, async (c) => {
        await c.query(`update media set state = 'queued', updated_at = now() where id = $1`, [
          media.id,
        ]);
        await c.query(
          `update locations set status = 'processing', updated_at = now() where id = $1`,
          [id],
        );
      });
      await queue.processMedia({ mediaId: media.id });
    } else if (media.state === 'failed') {
      // Processing gave up after its retries (e.g. storage was down); the member can try again.
      await pool.query(`update media set state = 'queued', updated_at = now() where id = $1`, [
        media.id,
      ]);
      await queue.processMedia({ mediaId: media.id });
    }
    return reply.send(await statusOf(id));
  });

  app.get('/v1/records/:id/status', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    await ownedMedia(id, viewer.userId);
    return reply.send(await statusOf(id));
  });

  /** Public detail. Only published records, plus the owner's own record in any visible state. */
  app.get('/v1/records/:id', async (req, reply) => {
    const viewer = await getViewer(deps, req);
    if (!viewer) throw new HttpError(401, 'unauthenticated');
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query<PublicRow>(
      `select ${PUBLIC_COLUMNS}, ${likedColumn('$2')}
       from locations l join media m on m.location_id = l.id and m.state = 'ready'
       ${ATTRIBUTION_JOIN}
       where l.id = $1 and (l.status = 'published' or (l.status in ('hidden') and exists (
         select 1 from record_ownership o where o.location_id = l.id and o.user_id = $2)))`,
      [id, viewer.userId],
    );
    if (!rows[0]) throw notFound();
    return reply.send(await toPublicRecord(storage, rows[0]));
  });

  /**
   * Private likes (D-29). Like/unlike are idempotent; only published records can be liked.
   * The list is the viewer's own, newest like first, published records only.
   */
  app.put('/v1/records/:id/like', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    const { rowCount } = await pool.query(
      `insert into likes (user_id, location_id)
       select $2, l.id from locations l where l.id = $1 and l.status = 'published'
       on conflict do nothing`,
      [id, viewer.userId],
    );
    if (!rowCount) {
      const exists = await pool.query(
        `select 1 from locations where id = $1 and status = 'published'`,
        [id],
      );
      if (!exists.rowCount) throw notFound();
    }
    return reply.code(204).send();
  });

  app.delete('/v1/records/:id/like', async (req, reply) => {
    const viewer = await requireOnboarded(deps, req);
    const { id } = idParam.parse(req.params);
    await pool.query('delete from likes where user_id = $1 and location_id = $2', [
      viewer.userId,
      id,
    ]);
    return reply.code(204).send();
  });

  app.get('/v1/me/likes', async (req) => {
    const viewer = await requireOnboarded(deps, req);
    const { rows } = await pool.query<PublicRow>(
      `select ${PUBLIC_COLUMNS}, true as liked
       from likes lk join locations l on l.id = lk.location_id and l.status = 'published'
       join media m on m.location_id = l.id and m.state = 'ready'
       ${ATTRIBUTION_JOIN}
       where lk.user_id = $1 order by lk.created_at desc limit 500`,
      [viewer.userId],
    );
    return { items: await Promise.all(rows.map((r) => toPublicRecord(storage, r))) };
  });

  async function createResponse(
    recordId: string,
    status: CreateRecordResponse['status'],
    mediaId: string,
    state: CreateRecordResponse['media']['state'],
  ): Promise<CreateRecordResponse> {
    let upload: CreateRecordResponse['upload'] = null;
    if (state === 'awaiting_upload') {
      const signed = await storage.presignUpload(objectKey.original(mediaId), UPLOAD_URL_TTL);
      upload = {
        url: signed.url,
        method: 'PUT',
        headers: signed.headers,
        expiresAt: new Date(Date.now() + UPLOAD_URL_TTL * 1000).toISOString(),
      };
    }
    return { recordId, status, media: { id: mediaId, state }, upload };
  }

  async function ownedMedia(locationId: string, userId: string) {
    const { rows } = await pool.query(
      `select m.id, m.state, m.original_key from media m
       join record_ownership o on o.location_id = m.location_id
       where m.location_id = $1 and o.user_id = $2`,
      [locationId, userId],
    );
    if (!rows[0]) throw notFound();
    return rows[0] as { id: string; state: string; original_key: string };
  }

  async function statusOf(locationId: string): Promise<RecordStatusResponse> {
    const { rows } = await pool.query(
      `select l.status, m.state, m.reject_reason from locations l join media m on m.location_id = l.id
       where l.id = $1`,
      [locationId],
    );
    return {
      recordId: locationId,
      status: rows[0].status,
      media: { state: rows[0].state, rejectReason: rows[0].reject_reason },
    };
  }

  async function assertAttributionAccepted(userId: string) {
    const version = legalVersions(config).attribution_notice;
    const { rowCount } = await pool.query(
      `select 1 from consents where user_id = $1 and kind = 'attribution_notice' and version = $2`,
      [userId, version],
    );
    if (!rowCount) throw new HttpError(409, 'attribution_notice_required');
  }
}
