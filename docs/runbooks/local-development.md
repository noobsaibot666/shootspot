# Local development

## Prerequisites

Node 24, pnpm 11, and Docker Desktop. For the mobile app: an Expo account and a development build on a phone (see [HANDWORK.md](../HANDWORK.md)).

## First run

```sh
pnpm install
pnpm dev:infra                       # PostGIS on 127.0.0.1:55432, SeaweedFS S3 on 127.0.0.1:8333
cp services/api/.env.example services/api/.env
pnpm db:migrate
pnpm dev:api                         # http://127.0.0.1:4000/health and /ready
```

`/ready` returns `200 {"checks":{"db":true,"storage":true}}` when both dependencies answer. In development the API creates the two buckets on startup.

## Everyday

| Task                 | Command                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| Typecheck everything | `pnpm typecheck`                                                                   |
| Tests                | `pnpm test`                                                                        |
| Format               | `pnpm format`                                                                      |
| Mobile dev server    | `pnpm --filter @shootspot/mobile start`                                            |
| Stop infra           | `pnpm dev:infra:down` (add `-v` to the compose command to wipe data)               |
| New migration        | `pnpm --filter @shootspot/api migrate create <name> --migration-file-language sql` |

## Notes

- Host port **55432** is used because Windows often reserves 5432.
- The compose credentials are for development only. The NAS gets its own generated secrets.
