import Fastify, { LogController, type FastifyInstance } from 'fastify';
import type { Storage } from './storage';

export interface AppDeps {
  /** Resolves when the database answers a trivial query. */
  pingDb(): Promise<void>;
  storage: Storage;
  logger?: boolean;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.logger ?? false,
    // Never log request bodies or query strings: they may carry coordinates.
    logController: new LogController({ disableRequestLogging: true }),
  });

  /** Liveness: the process is up. */
  app.get('/health', async () => ({ status: 'ok' }));

  /** Readiness: dependencies answer. Details stay out of the response body. */
  app.get('/ready', async (_req, reply) => {
    const [db, storage] = await Promise.allSettled([deps.pingDb(), deps.storage.ping()]);
    const checks = { db: db.status === 'fulfilled', storage: storage.status === 'fulfilled' };
    if (!checks.db || !checks.storage) {
      app.log.warn({ db: settledReason(db), storage: settledReason(storage) }, 'not ready');
      return reply.code(503).send({ status: 'unavailable', checks });
    }
    return { status: 'ok', checks };
  });

  return app;
}

function settledReason(result: PromiseSettledResult<void>): string | undefined {
  return result.status === 'rejected' ? String(result.reason) : undefined;
}
