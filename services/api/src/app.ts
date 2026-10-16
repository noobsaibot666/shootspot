import rateLimit from '@fastify/rate-limit';
import { fromNodeHeaders } from 'better-auth/node';
import Fastify, { LogController, type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { adminRoutes } from './admin/routes';
import { APP_ORIGIN, APP_ORIGIN_HEADER } from './auth';
import { HttpError, sendError, type AppDeps } from './http/context';
import { meRoutes } from './me/routes';
import { projectRoutes } from './projects/routes';
import { feedRoutes } from './records/feed';
import { recordRoutes } from './records/routes';
import { captureError } from './sentry';
import { vocabularyRoutes } from './vocabulary/routes';

export type { AppDeps } from './http/context';

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: deps.logger ?? false,
    // Never log request bodies or query strings: they may carry coordinates.
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: true,
  });

  // Clients often send `content-type: application/json` on body-less POSTs (upload-complete,
  // MFA enrol). Accept an empty body there; everything else still goes through Fastify's
  // prototype-poisoning-safe JSON parser.
  const safeJson = app.getDefaultJsonParser('error', 'error');
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const text = typeof body === 'string' ? body : body.toString('utf8');
    if (text === '') return done(null, undefined);
    return safeJson(req, text, done);
  });

  // No CORS: the app is native (no CORS) and the admin web calls us through its own same-origin
  // proxy. Any browser page on another origin is therefore refused by the browser itself.
  if (deps.config.NODE_ENV !== 'test') {
    await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  }

  // Security headers on every response; API data is private, so never cache it in between.
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-frame-options', 'DENY');
    reply.header('cross-origin-resource-policy', 'same-site');
    if (
      req.url.startsWith('/v1') ||
      req.url.startsWith('/admin') ||
      req.url.startsWith('/api/auth')
    ) {
      reply.header('cache-control', 'no-store');
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return sendError(reply, err);
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: 'invalid_request',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ error: 'bad_request', message: (err as Error).message });
    }
    app.log.error({ err }, 'unhandled');
    captureError(err);
    return reply.code(500).send({ error: 'internal' });
  });

  /** Liveness: the process is up. */
  app.get('/health', async () => ({ status: 'ok' }));

  /** Readiness: dependencies answer. Details stay out of the response body. */
  app.get('/ready', async (_req, reply) => {
    const [db, storage] = await Promise.allSettled([
      deps.pool.query('select 1'),
      deps.storage.ping(),
    ]);
    const checks = { db: db.status === 'fulfilled', storage: storage.status === 'fulfilled' };
    if (!checks.db || !checks.storage) {
      app.log.warn({ db: reason(db), storage: reason(storage) }, 'not ready');
      return reply.code(503).send({ status: 'unavailable', checks });
    }
    return { status: 'ok', checks };
  });

  // Better Auth: email-code sign-in, sessions, bearer tokens.
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(req, reply) {
      const url = new URL(req.url, deps.config.PUBLIC_API_URL);
      const headers = fromNodeHeaders(req.headers);
      // The app identifies itself with expo-origin (see APP_ORIGIN_HEADER); only our own scheme
      // is promoted to Origin, and never over an Origin a browser already sent.
      if (!headers.has('origin') && headers.get(APP_ORIGIN_HEADER) === APP_ORIGIN) {
        headers.set('origin', APP_ORIGIN);
      }
      // The admin web is for owners only: it can never create an account or sign in a member.
      // Non-owners get the same answer as owners (no email sent), so it reveals nothing.
      const origin = headers.get('origin');
      const adminWeb = origin !== null && deps.config.TRUSTED_ORIGINS.includes(origin);
      const otpPath = url.pathname.endsWith('/email-otp/send-verification-otp');
      const signInPath = url.pathname.endsWith('/sign-in/email-otp');
      if (adminWeb && (otpPath || signInPath)) {
        const email = String(
          (req.body as { email?: unknown } | undefined)?.email ?? '',
        ).toLowerCase();
        const { rowCount } = await deps.pool.query(
          `select 1 from auth_users where lower(email) = $1 and role = 'owner'`,
          [email],
        );
        if (!rowCount) {
          return otpPath
            ? reply.send({ success: true })
            : reply.code(401).send({ code: 'INVALID_OTP', message: 'Invalid OTP' });
        }
      }
      const response = await deps.auth.handler(
        new Request(url, {
          method: req.method,
          headers,
          ...(req.body ? { body: JSON.stringify(req.body) } : {}),
        }),
      );
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) reply.header('set-cookie', cookies);
      return reply.send(response.body ? await response.text() : null);
    },
  });

  recordRoutes(app, deps);
  feedRoutes(app, deps);
  meRoutes(app, deps);
  projectRoutes(app, deps);
  adminRoutes(app, deps);
  vocabularyRoutes(app, deps);

  return app;
}

function reason(result: PromiseSettledResult<unknown>): string | undefined {
  return result.status === 'rejected' ? String(result.reason) : undefined;
}
