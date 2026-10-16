# ShootSpot

A mobile-first, community-maintained location scouting library for photographers and filmmakers. Members capture a location in the field, attach a landscape or square image with practical scouting notes, and publish it so others can discover it. Other members browse nearby or chosen places and save locations into private projects for a shoot.

## Status

**Phase 2 complete: backend and admin foundation.** The API (email-code sign-in, records, feed, projects, reports, export and deletion), the image worker, the admin web (MFA, moderation, audit) and the Docker/NAS stack are built and tested. The first NAS deploy and the Phase 3 mobile work are next. See the [API contract](docs/api.md) and [docs/HANDWORK.md](docs/HANDWORK.md).

Key V1 decisions: EU/UK launch with GDPR · sign-in required · **anonymous location records by default** (attribution is opt-in) · in-app viewing licence only · 16:9 or 1:1 images · Feed · Map · Profile + Camera navigation · native maps per platform · follows system theme · NAS-backed prototype first. See [the decision record](docs/phase-0/01-decision-record.md).

## Repository

| Path                        | What                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/mobile`               | Expo SDK 58 / React Native app (currently the camera spike)                              |
| `apps/admin`                | Next.js admin console: sign-in + TOTP, reports, moderation, uploads, users, audit        |
| `services/api`              | Fastify API: Better Auth email codes, records, feed, projects, admin; PostGIS migrations |
| `services/worker`           | pg-boss jobs: image validation and derivatives (sharp), data export, deletion sweep      |
| `packages/shared`           | Domain rules and the API contract shared by every app and service                        |
| `infra/local`               | Docker Compose for local PostGIS, SeaweedFS (S3) and Mailpit                             |
| `infra/docker`, `infra/nas` | Container images and the memory-capped TrueNAS stack                                     |
| `tools/`                    | App-icon generator, end-to-end smoke test                                                |
| `state/`                    | [Windows ↔ macOS handoff](state/windows-macos-handoff.md) (iOS builds happen on the Mac) |
| `docs/`                     | Plan, Phase 0 decisions, ADRs, runbooks, threat model, [handwork](docs/HANDWORK.md)      |

Get started: [docs/runbooks/local-development.md](docs/runbooks/local-development.md).

## Documentation

- [Development plan](docs/production/location-scout-app-development-plan.md) and [design specifications](docs/production/location-scout-design-specifications.md)
- [Phase 0 decisions](docs/phase-0/): decision record, scope, privacy rules, design brief, metrics, backlog
- [Architecture decision records](docs/adr/)
- [Threat model](docs/threat-model.md)
- [Runbooks](docs/runbooks/): local development, camera spike test plan, TrueNAS deployment, backup/restore
- [Handwork](docs/HANDWORK.md): tasks that need the product owner
