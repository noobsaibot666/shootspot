/**
 * Make someone an owner (administrator) from the command line. Creates the account if it doesn't
 * exist yet: the admin web never creates accounts, so the first owner must come from here.
 *   pnpm --filter @shootspot/api owner:grant you@example.com
 * On the NAS: sudo docker compose exec api node --import tsx scripts/grant-owner.ts you@example.com
 */
import pg from 'pg';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
  throw new Error('usage: grant-owner.ts <email>');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('begin');
  const { rows } = await client.query(
    `insert into auth_users (name, email, "emailVerified", role)
     values (split_part($1, '@', 1), $1, false, 'owner')
     on conflict (email) do update set role = 'owner', "updatedAt" = now()
     returning id, (xmax = 0) as created`,
    [email],
  );
  await client.query(
    `insert into admin_audit_events (actor_user_id, action, target_type, target_id, reason)
     values (null, 'user.role', 'user', $1, 'granted owner from command line')`,
    [rows[0].id],
  );
  await client.query('commit');
  console.log(
    `${email} is now an owner${rows[0].created ? ' (new account)' : ''}. ` +
      'Sign in on the admin web with the emailed code, then set up the authenticator app.',
  );
} catch (err) {
  await client.query('rollback');
  throw err;
} finally {
  await client.end();
}
