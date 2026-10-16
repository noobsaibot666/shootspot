# Local development

## Prerequisites

Node 24, pnpm 11, Docker Desktop. For the mobile app: an Expo account and a development build on a phone (see [HANDWORK.md](../HANDWORK.md)).

## First run

```sh
pnpm install
pnpm dev:infra                         # PostGIS :55432, SeaweedFS S3 :8333, Mailpit :1025/:8025
cp services/api/.env.example services/api/.env
cp services/worker/.env.example services/worker/.env
pnpm db:migrate
```

Then run each of these in its own terminal:

| Service                    | Command           | URL                         |
| -------------------------- | ----------------- | --------------------------- |
| API                        | `pnpm dev:api`    | http://127.0.0.1:4000/ready |
| Worker                     | `pnpm dev:worker` | (logs only)                 |
| Admin web                  | `pnpm dev:admin`  | http://localhost:3000       |
| Mail inbox (sign-in codes) | —                 | http://127.0.0.1:8025       |

**Become an admin locally:**

1. Sign in once at http://localhost:3000 with any email. The code appears in Mailpit.
2. Run `pnpm --filter @shootspot/api owner:grant you@example.com`.
3. Sign in again and scan the QR code with an authenticator app.

## Tests

| What                                     | Command                                            | Needs                                                                                      |
| ---------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Unit tests                               | `pnpm test`                                        | nothing                                                                                    |
| Integration (API, and worker end-to-end) | `pnpm test:int`                                    | `pnpm dev:infra`. Each test file gets its own throwaway database and buckets               |
| Smoke test across the running services   | `node tools/smoke.mjs`                             | API, worker, admin (`pnpm --filter @shootspot/admin build && … start`) and Mailpit running |
| Everything CI runs                       | `pnpm format:check && pnpm typecheck && pnpm test` |                                                                                            |

## Everyday

| Task                           | Command                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| New migration                  | `pnpm --filter @shootspot/api migrate create <name> --migration-file-language sql`            |
| Undo the last migration        | `pnpm --filter @shootspot/api migrate down 1`                                                 |
| Regenerate the auth schema SQL | `pnpm --filter @shootspot/api exec tsx scripts/auth-schema.ts <empty-db-url>`                 |
| Mobile dev server              | `pnpm --filter @shootspot/mobile start`                                                       |
| Build server images            | `docker build -f infra/docker/Dockerfile --target api\|worker\|admin -t shootspot-<target> .` |
| Stop infra                     | `pnpm dev:infra:down`                                                                         |

## Notes

- Host port **55432** is used because Windows often reserves 5432.
- Better Auth limits code requests per IP. If you trip it while testing, clear the limits with `docker compose -f infra/local/docker-compose.yml exec db psql -U shootspot -c "delete from auth_rate_limits"`.
- The compose credentials are for development only. The NAS gets its own generated secrets.
