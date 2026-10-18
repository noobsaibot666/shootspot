import type { Queryable } from '../db';
import type { Storage } from '../storage';

/**
 * Deletes a location's image files (original and derivatives) and marks its media purged. Used
 * when a record is gone for good: the creator deletes it, or an admin removes it.
 */
export async function purgeMedia(pool: Queryable, storage: Storage, locationId: string) {
  const { rows } = await pool.query<{ id: string; original_key: string; derivatives: unknown }>(
    `select id, original_key, derivatives from media where location_id = $1 and state <> 'purged'`,
    [locationId],
  );
  for (const m of rows) {
    await storage.remove('quarantine', m.original_key);
    for (const d of m.derivatives as { key: string }[]) await storage.remove('public', d.key);
    await pool.query(
      `update media set state = 'purged', derivatives = '[]', updated_at = now() where id = $1`,
      [m.id],
    );
  }
}
