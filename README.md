# ShootSpot

A mobile-first, community-maintained location scouting library for photographers and filmmakers. Members capture a location in the field, attach a landscape or square image with practical scouting notes, and publish it so others can discover it. Other members browse nearby or chosen places and save locations into private projects for a shoot.

## Status

**Phase 1: technical proof and foundations.** The repo, local stack, image pipeline and camera spike are built. The device testing still to do is listed in [docs/HANDWORK.md](docs/HANDWORK.md).

Key V1 decisions: EU/UK launch with GDPR · sign-in required · **anonymous location records by default** (attribution is opt-in) · in-app viewing licence only · 16:9 or 1:1 images · Feed · Map · Profile + Camera navigation · native maps per platform · follows system theme · NAS-backed prototype first. See [the decision record](docs/phase-0/01-decision-record.md).

## Repository

| Path              | What                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| `apps/mobile`     | Expo SDK 58 / React Native app (currently the camera spike)                         |
| `services/api`    | Fastify API, PostgreSQL + PostGIS migrations                                        |
| `services/worker` | Image validation and derivative generation (sharp)                                  |
| `packages/shared` | Domain rules shared by every app and service: framing, geo, sun, scout schemas      |
| `infra/local`     | Docker Compose for local PostGIS + SeaweedFS (S3)                                   |
| `docs/`           | Plan, Phase 0 decisions, ADRs, runbooks, threat model, [handwork](docs/HANDWORK.md) |

Get started: [docs/runbooks/local-development.md](docs/runbooks/local-development.md).

## Documentation

- [Development plan](docs/production/location-scout-app-development-plan.md) and [design specifications](docs/production/location-scout-design-specifications.md)
- [Phase 0 decisions](docs/phase-0/): decision record, scope, privacy rules, design brief, metrics, backlog
- [Architecture decision records](docs/adr/)
- [Threat model](docs/threat-model.md)
- [Runbooks](docs/runbooks/): local development, camera spike test plan, TrueNAS deployment, backup/restore
- [Handwork](docs/HANDWORK.md): tasks that need the product owner
