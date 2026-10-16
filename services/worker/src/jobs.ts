import { objectKey } from '@shootspot/shared';
import type pg from 'pg';
import { processImage } from './process-image';
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
           last_error = null, updated_at = now() where id = $1`,
        [mediaId, detail.width, detail.height, result.framing, JSON.stringify(derivatives)],
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

/**
 * Account deletion (docs/phase-0/03 §6). Removes attribution, then the auth user; cascades remove
 * sessions, profile, projects, MFA and the creator↔record links. Records stay, anonymous.
 */
export async function deletionSweep(deps: JobDeps): Promise<number> {
  const { pool } = deps;
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
    reportsFiled: await q(
      `select location_id, reason, note, status, created_at from reports where reporter_user_id = $1`,
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
