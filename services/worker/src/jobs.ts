import { objectKey, type BlurAreasJob } from '@shootspot/shared';
import type pg from 'pg';
import { processImage, reblurPublished, type Derivative } from './process-image';
import type { WorkerStorage } from './storage';

export interface JobDeps {
  pool: pg.Pool;
  storage: WorkerStorage;
}

/**
 * Upload flow step 4–5 (plan §7): validate the original, build metadata-free derivatives, then
 * publish. A rejected image stays private with a reason; transient errors throw so pg-boss
 * retries; after the last retry the media is marked failed (retryable from admin or the app).
 */
export async function processMediaJob(
  deps: JobDeps,
  mediaId: string,
  opts: { finalAttempt: boolean },
) {
  const { pool, storage } = deps;
  const { rows } = await pool.query(
    `update media set state = 'processing', attempts = attempts + 1, updated_at = now()
     where id = $1 and state in ('queued', 'processing', 'failed')
     returning location_id, original_key`,
    [mediaId],
  );
  const media = rows[0];
  if (!media) return { outcome: 'skipped' as const };

  try {
    const original = await storage.get('quarantine', media.original_key);
    const result = await processImage(original);

    if (!result.ok) {
      await pool.query(
        `update media set state = 'rejected', reject_reason = $2, updated_at = now() where id = $1`,
        [mediaId, result.reason],
      );
      await pool.query(
        `update locations set status = 'rejected', updated_at = now() where id = $1`,
        [media.location_id],
      );
      await storage.remove('quarantine', media.original_key);
      return { outcome: 'rejected' as const, reason: result.reason };
    }

    const derivatives = [];
    for (const d of result.derivatives) {
      const key = objectKey.derivative(mediaId, d.name);
      await storage.put('public', key, d.data, 'image/webp');
      derivatives.push({ name: d.name, key, width: d.width, height: d.height, bytes: d.bytes });
    }
    const detail = derivatives.find((d) => d.name === 'detail')!;

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `update media set state = 'ready', width = $2, height = $3, framing = $4, derivatives = $5,
           faces_checked_at = now(), faces_blurred = $6, last_error = null, updated_at = now()
         where id = $1`,
        [
          mediaId,
          detail.width,
          detail.height,
          result.framing,
          JSON.stringify(derivatives),
          result.faces,
        ],
      );
      // The member chose 16:9 or 1:1; the worker's verdict on the real pixels wins.
      await client.query(
        `update locations set status = 'published', framing = $2, published_at = coalesce(published_at, now()),
           updated_at = now() where id = $1 and status in ('pending_media', 'processing')`,
        [media.location_id, result.framing],
      );
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
    // Plan §5: keep the original only until derivatives are confirmed.
    await storage.remove('quarantine', media.original_key);
    return { outcome: 'published' as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `update media set state = $2, last_error = $3, updated_at = now() where id = $1`,
      [mediaId, opts.finalAttempt ? 'failed' : 'queued', message.slice(0, 500)],
    );
    throw err;
  }
}

/** Replaces a published photo's sizes in place (same keys) and returns the stored list. */
async function storeDerivatives(deps: JobDeps, mediaId: string, list: Derivative[]) {
  const stored = [];
  for (const d of list) {
    const key = objectKey.derivative(mediaId, d.name);
    await deps.storage.put('public', key, d.data, 'image/webp');
    stored.push({ name: d.name, key, width: d.width, height: d.height, bytes: d.bytes });
  }
  return stored;
}

/**
 * Face blur for photos published before it existed (D-45): a few at a time, from the largest
 * published size (the originals are gone, plan §5). Photos with no face are only marked checked.
 */
export async function faceBackfill(deps: JobDeps, limit = 20) {
  const { rows } = await deps.pool.query<{ id: string }>(
    `select id from media where state = 'ready' and faces_checked_at is null
     order by created_at limit $1`,
    [limit],
  );
  let blurred = 0;
  for (const { id } of rows) {
    const detail = await deps.storage.get('public', objectKey.derivative(id, 'detail'));
    const result = await reblurPublished(detail, { detect: true });
    let stored = null;
    if (result.derivatives.length) {
      stored = await storeDerivatives(deps, id, result.derivatives);
      blurred++;
    }
    await deps.pool.query(
      `update media set faces_checked_at = now(), faces_blurred = $2,
         derivatives = coalesce($3::jsonb, derivatives), updated_at = now() where id = $1`,
      [id, result.faces, stored && JSON.stringify(stored)],
    );
  }
  return { checked: rows.length, blurred };
}

/** Blurs areas an admin marked on a published photo (D-45): a face the detector missed. */
export async function blurAreasJob(deps: JobDeps, job: BlurAreasJob) {
  const { rows } = await deps.pool.query(`select id from media where id = $1 and state = 'ready'`, [
    job.mediaId,
  ]);
  if (!rows[0] || !job.areas.length) return { outcome: 'skipped' as const };
  const detail = await deps.storage.get('public', objectKey.derivative(job.mediaId, 'detail'));
  const result = await reblurPublished(detail, { detect: false, areas: job.areas });
  const stored = await storeDerivatives(deps, job.mediaId, result.derivatives);
  await deps.pool.query(`update media set derivatives = $2, updated_at = now() where id = $1`, [
    job.mediaId,
    JSON.stringify(stored),
  ]);
  return { outcome: 'blurred' as const, areas: job.areas.length };
}

/**
 * Account deletion (docs/phase-0/03 §6). Removes attribution, then the auth user; cascades remove
 * sessions, profile, projects, MFA and the creator↔record links. Records stay, anonymous.
 */
export async function deletionSweep(deps: JobDeps): Promise<number> {
  const { pool } = deps;
  // A user removed outside the sweep leaves its request with no user (on delete set null).
  // Nothing is left to delete, so close it; otherwise it stays scheduled and alerts forever.
  await pool.query(
    `update account_deletions set status = 'completed', completed_at = now()
     where status = 'scheduled' and user_id is null`,
  );
  const due = await pool.query(
    `select id, user_id from account_deletions where status = 'scheduled' and execute_after <= now() and user_id is not null`,
  );
  for (const d of due.rows) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `update locations l set attributed = false, updated_at = now()
         from record_ownership o where o.location_id = l.id and o.user_id = $1`,
        [d.user_id],
      );
      await client.query(`update data_exports set status = 'expired' where user_id = $1`, [
        d.user_id,
      ]);
      await client.query(`delete from auth_users where id = $1`, [d.user_id]);
      await client.query(
        `update account_deletions set status = 'completed', completed_at = now() where id = $1`,
        [d.id],
      );
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }
  return due.rowCount ?? 0;
}

/** Data export (GDPR Art. 15/20): a JSON archive in the private bucket, linked for 7 days. */
export async function dataExportJob(deps: JobDeps, exportId: string) {
  const { pool, storage } = deps;
  const { rows } = await pool.query(
    `select user_id from data_exports where id = $1 and status = 'queued'`,
    [exportId],
  );
  if (!rows[0]) return;
  const userId: string = rows[0].user_id;
  const q = async (sql: string) => (await pool.query(sql, [userId])).rows;
  const archive = {
    exportedAt: new Date().toISOString(),
    account: (await q(`select email, "createdAt" as created_at from auth_users where id = $1`))[0],
    profile:
      (
        await q(`select first_name, last_name, display_name, bio, portfolio_url, social_handle,
                         age_confirmed_at, onboarded_at from profiles where user_id = $1`)
      )[0] ?? null,
    consents: await q(
      `select kind, version, accepted_at from consents where user_id = $1 order by accepted_at`,
    ),
    records: await q(`select l.id, l.label, l.status, l.attributed, st_y(l.point::geometry) as lat,
                        st_x(l.point::geometry) as lon, l.good_for, l.best_light, l.bearing_deg, l.advanced,
                        l.captured_at, l.created_at, l.published_at
                      from record_ownership o join locations l on l.id = o.location_id where o.user_id = $1`),
    projects:
      await q(`select p.name, p.created_at, coalesce(json_agg(i.location_id) filter (where i.location_id is not null), '[]') as records
                       from projects p left join project_items i on i.project_id = p.id
                       where p.user_id = $1 group by p.id order by p.position`),
    // Private likes (D-29) are personal data too.
    likes: await q(
      `select location_id, created_at from likes where user_id = $1 order by created_at desc`,
    ),
    reportsFiled: await q(
      `select location_id, reason, note, status, created_at from reports where reporter_user_id = $1`,
    ),
    // Blocks (D-41): the location each was made from, never the blocked member's identity.
    blocks: await q(
      `select location_id, created_at from blocks where blocker_user_id = $1 order by created_at desc`,
    ),
  };
  await storage.put(
    'quarantine',
    objectKey.dataExport(userId, exportId),
    Buffer.from(JSON.stringify(archive, null, 2)),
    'application/json',
  );
  await pool.query(
    `update data_exports set status = 'ready', object_key = $2, ready_at = now(), expires_at = now() + interval '7 days'
     where id = $1`,
    [exportId, objectKey.dataExport(userId, exportId)],
  );
}
