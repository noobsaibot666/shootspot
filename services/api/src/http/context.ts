import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Auth } from '../auth';
import type { Config } from '../config';
import type { Pool } from '../db';
import type { JobQueue } from '../queue';
import type { Storage } from '../storage';

export interface AppDeps {
  config: Config;
  pool: Pool;
  auth: Auth;
  storage: Storage;
  queue: JobQueue;
  logger?: boolean;
}

export interface Viewer {
  userId: string;
  sessionId: string;
  email: string;
  role: 'member' | 'owner';
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const notFound = () => new HttpError(404, 'not_found');

/**
 * Two clients, two channels, never mixed:
 * - `app`: the mobile app. Member routes (/v1) accept ONLY a bearer token; cookies are ignored.
 * - `admin`: the admin web. Admin routes (/admin/v1) accept ONLY the session cookie; a bearer
 *   token is refused, so the app can never reach administration and the web has no member features.
 */
export type Channel = 'app' | 'admin';

export async function getViewer(
  deps: AppDeps,
  req: FastifyRequest,
  channel: Channel = 'app',
): Promise<Viewer | null> {
  const headers = fromNodeHeaders(req.headers);
  const bearer = headers.get('authorization')?.startsWith('Bearer ');
  if (channel === 'app') {
    if (!bearer) return null;
    headers.delete('cookie');
  } else {
    if (bearer) throw new HttpError(403, 'admin_web_only');
    headers.delete('authorization');
  }
  const result = await deps.auth.api.getSession({ headers });
  if (!result) return null;
  const user = result.user as typeof result.user & { role?: string };
  return {
    userId: user.id,
    sessionId: result.session.id,
    email: user.email,
    role: user.role === 'owner' ? 'owner' : 'member',
  };
}

export async function requireViewer(deps: AppDeps, req: FastifyRequest): Promise<Viewer> {
  const viewer = await getViewer(deps, req);
  if (!viewer) throw new HttpError(401, 'unauthenticated');
  return viewer;
}

/** Publishing, reporting and saving need a completed onboarding (age gate + consents). */
export async function requireOnboarded(deps: AppDeps, req: FastifyRequest): Promise<Viewer> {
  const viewer = await requireViewer(deps, req);
  const { rows } = await deps.pool.query('select onboarded_at from profiles where user_id = $1', [
    viewer.userId,
  ]);
  if (!rows[0]?.onboarded_at) throw new HttpError(403, 'onboarding_required');
  return viewer;
}

/** Owner role on an admin-web session, no MFA yet: only for the MFA enrol/verify endpoints. */
export async function requireOwner(deps: AppDeps, req: FastifyRequest): Promise<Viewer> {
  const viewer = await getViewer(deps, req, 'admin');
  if (!viewer) throw new HttpError(401, 'unauthenticated');
  if (viewer.role !== 'owner') throw new HttpError(403, 'forbidden');
  return viewer;
}

/** Owner role AND this session passed a TOTP check (ADR 0005). Every admin route uses this. */
export async function requireAdmin(deps: AppDeps, req: FastifyRequest): Promise<Viewer> {
  const viewer = await requireOwner(deps, req);
  const { rowCount } = await deps.pool.query(
    'select 1 from admin_mfa_sessions where session_id = $1 and user_id = $2',
    [viewer.sessionId, viewer.userId],
  );
  if (!rowCount) throw new HttpError(403, 'mfa_required');
  return viewer;
}

export function sendError(reply: FastifyReply, err: HttpError) {
  return reply.code(err.status).send({ error: err.code, message: err.message });
}
