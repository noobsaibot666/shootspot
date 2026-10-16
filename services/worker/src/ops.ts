import type pg from 'pg';

/**
 * Operational alerts (backlog 2.9, plan §10): every 30 minutes the worker checks for problems and
 * emails every owner, at most once per problem per 12 hours. When a problem clears, its alert
 * resets so a recurrence is reported right away. No coordinates, emails or photos in the message.
 */

export interface Problem {
  key: string;
  summary: string;
}

const HOURS = 3600_000;

export async function findProblems(pool: pg.Pool, now = new Date()): Promise<Problem[]> {
  const out: Problem[] = [];
  const q = async <T extends Record<string, unknown>>(sql: string) =>
    (await pool.query<T>(sql)).rows;

  const [age] = await q<{ first: Date | null }>(`select min(run_on) as first from pgmigrations`);
  const stackAgeH = age?.first ? (now.getTime() - age.first.getTime()) / HOURS : 0;
  const beats = Object.fromEntries(
    (await q<{ name: string; ok_at: Date }>(`select name, ok_at from ops_heartbeats`)).map((b) => [
      b.name,
      b.ok_at,
    ]),
  );

  const dump = beats['pg_dump'];
  if (dump ? now.getTime() - dump.getTime() > 26 * HOURS : stackAgeH > 26) {
    out.push({
      key: 'backup_pg_dump',
      summary: dump
        ? `Last database backup: ${dump.toISOString()}`
        : 'No database backup has run yet',
    });
  }
  const offsite = beats['offsite'];
  if (offsite && now.getTime() - offsite.getTime() > 26 * HOURS) {
    out.push({ key: 'backup_offsite', summary: `Last off-site backup: ${offsite.toISOString()}` });
  }

  const [m] = await q<{ failed: number; stuck: number }>(`
    select count(*) filter (where state = 'failed')::int as failed,
           count(*) filter (where state in ('queued', 'processing') and updated_at < now() - interval '30 minutes')::int as stuck
    from media`);
  if (m && m.failed > 0)
    out.push({
      key: 'media_failed',
      summary: `${m.failed} upload(s) failed processing: retry them in Admin → Uploads`,
    });
  if (m && m.stuck > 0)
    out.push({
      key: 'media_stuck',
      summary: `${m.stuck} upload(s) stuck in processing for over 30 minutes: is the worker running?`,
    });

  const [r] = await q<{ n: number }>(
    `select count(*)::int as n from reports where status = 'open' and created_at < now() - interval '72 hours'`,
  );
  if (r && r.n > 0)
    out.push({ key: 'reports_overdue', summary: `${r.n} report(s) open for more than 72 hours` });

  const [d] = await q<{ n: number }>(
    `select count(*)::int as n from account_deletions where status = 'scheduled' and execute_after < now() - interval '1 hour'`,
  );
  if (d && d.n > 0)
    out.push({
      key: 'deletions_overdue',
      summary: `${d.n} account deletion(s) past their date: the deletion sweep may be failing`,
    });

  return out;
}

/** Decide which problems to email now (12 h de-duplication), and clear resolved ones. */
export async function dueAlerts(pool: pg.Pool, problems: Problem[]): Promise<Problem[]> {
  const keys = problems.map((p) => p.key);
  await pool.query(`delete from ops_alerts where not (key = any($1::text[]))`, [keys]);
  const due: Problem[] = [];
  for (const p of problems) {
    const { rowCount } = await pool.query(
      `insert into ops_alerts (key, last_sent_at, last_detail) values ($1, now(), $2)
       on conflict (key) do update set last_sent_at = now(), last_detail = excluded.last_detail
       where ops_alerts.last_sent_at < now() - interval '12 hours'`,
      [p.key, p.summary],
    );
    if (rowCount) due.push(p);
  }
  return due;
}

export async function ownerEmails(pool: pg.Pool): Promise<string[]> {
  const { rows } = await pool.query<{ email: string }>(
    `select email from auth_users where role = 'owner'`,
  );
  return rows.map((r) => r.email);
}

export function alertText(problems: Problem[]): { subject: string; text: string } {
  return {
    subject: `ShootSpot: ${problems.length} problem${problems.length > 1 ? 's' : ''} need attention`,
    text:
      `The ShootSpot server found:\n\n${problems.map((p) => `• ${p.summary}`).join('\n')}\n\n` +
      `Details are in the admin website. You get this email at most once every 12 hours per problem.`,
  };
}
