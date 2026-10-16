/**
 * Bootstrap or change an owner from the command line (no admin console exists for the first one).
 * The person must have signed in once (email code) so their account exists.
 *   pnpm --filter @shootspot/api owner:grant you@example.com
 * On the NAS: docker compose run --rm api node --import tsx scripts/grant-owner.ts you@example.com
 */
import pg from 'pg';

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes('@')) throw new Error('usage: grant-owner.ts <email>');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query('begin');
  const { rows } = await client.query(
    `update auth_users set role = 'owner' where lower(email) = $1 returning id`,
    [email],
  );
  if (!rows[0]) throw new Error(`no account for ${email}; sign in once with the email code first`);
  await client.query(
    `insert into admin_audit_events (actor_user_id, action, target_type, target_id, reason)
     values (null, 'user.role', 'user', $1, 'granted owner from command line')`,
    [rows[0].id],
  );
  await client.query('commit');
  console.log(`${email} is now an owner. They set up 2-factor on first admin sign-in.`);
} catch (err) {
  await client.query('rollback');
  throw err;
} finally {
  await client.end();
}
