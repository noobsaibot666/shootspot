/**
 * Prints the SQL Better Auth needs for our auth config, compiled against an EMPTY database.
 * Used to write the auth migration; re-run after changing auth plugins or fields.
 *   pnpm --filter @shootspot/api exec tsx scripts/auth-schema.ts postgres://…/empty_db
 */
import { getMigrations } from 'better-auth/db/migration';
import pg from 'pg';
import { createAuth } from '../src/auth';
import { loadConfig } from '../src/config';
import { createMemoryMailer } from '../src/mailer';

const url = process.argv[2];
if (!url) throw new Error('usage: auth-schema.ts <empty database url>');
const pool = new pg.Pool({ connectionString: url });
const config = loadConfig({
  PUBLIC_API_URL: 'http://127.0.0.1:4000',
  DATABASE_URL: url,
  AUTH_SECRET: 'x'.repeat(32),
  SMTP_URL: 'smtp://127.0.0.1:1025',
  S3_ENDPOINT: 'http://127.0.0.1:8333',
  S3_ACCESS_KEY_ID: 'x',
  S3_SECRET_ACCESS_KEY: 'x',
  S3_BUCKET_QUARANTINE: 'xxx',
  S3_BUCKET_PUBLIC: 'xxx',
});
const auth = createAuth({ pool, config, mailer: createMemoryMailer() });
const { compileMigrations } = await getMigrations(auth.options);
process.stdout.write((await compileMigrations()) + '\n');
await pool.end();
