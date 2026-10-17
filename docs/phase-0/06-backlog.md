# Phase 0 — Prioritized Backlog

P0 = required for the closed pilot · P1 = required for public launch · P2 = after V1

## Phase 1 — Technical proof and foundations

| #    | Item                                                                                              | Pri | Status                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------- |
| 1.1  | Monorepo scaffold (mobile, api, worker, shared), format, TypeScript, CI                           | P0  | Done; admin scaffold moved to Phase 2                                                   |
| 1.2  | Camera spike: 16:9/1:1 live crop mask, tap-to-focus, exposure, lens/zoom, torch/flash, rotate cue | P0  | Built; **awaiting device tests** (HANDWORK 1.2–1.4)                                     |
| 1.3  | Orientation normalization and pixel-level crop validation (client and worker)                     | P0  | **Done** (worker tested; client crop runs on both devices)                              |
| 1.4  | Heading/bearing accuracy test; GPS accuracy display; manual pin                                   | P0  | GPS ±10 m and heading readout working; **accuracy test moved to Phase 3** (3.7)         |
| 1.5  | Native map spike; place search approach (D-21)                                                    | P0  | ADR 0006 written; map spike moved to Phase 3, which needs the Google key (HANDWORK 3.4) |
| 1.6  | NAS stack: compose, tunnel, off-site backup                                                       | P0  | Local stack done; NAS datasets created; container deploy in Phase 2                     |
| 1.7  | S3-compatible store choice — ADR                                                                  | P0  | Done: SeaweedFS (ADR 0003)                                                              |
| 1.8  | Auth provider — ADR                                                                               | P0  | **Done**: Better Auth in the API, email-code sign-in (ADR 0005)                         |
| 1.9  | Threat model, restore runbook, deployment runbook                                                 | P0  | Drafted; commands finalized at first deploy                                             |
| 1.10 | Apple Developer and Google Play accounts, signing ownership                                       | P0  | HANDWORK 4.2 (iOS dev builds via the Mac, no paid account needed yet)                   |

## Phase 2 — Backend and admin foundation

| #    | Item                                                                                        | Pri | Status                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1  | Auth, sessions, roles (member/owner), age gate, consent versions                            | P0  | **Done**: email-code sign-in, bearer and cookie sessions, onboarding with versioned consents                                            |
| 2.2  | Schema: locations (PostGIS), media, scout notes, record_ownership, projects, reports, audit | P0  | **Done**: scout notes folded into `locations` (1:1); see migration 0002                                                                 |
| 2.3  | Signed upload, idempotency, processing queue, worker                                        | P0  | **Done**: presigned PUT, draftId idempotency, pg-boss, retry and failed states                                                          |
| 2.4  | Feed/search API with the anonymity contract                                                 | P0  | **Done**: radius, tags, keyset cursor; key-set test                                                                                     |
| 2.5  | Projects API; My records API; attribution toggle                                            | P0  | **Done**                                                                                                                                |
| 2.6  | Sun azimuth/elevation at capture, server-side                                               | P1  | **Done** (stored on publish)                                                                                                            |
| 2.7  | Admin web: sign-in/MFA, role-gated shell, reports queue, moderation, audit log              | P0  | **Done**, plus users, upload health and media retry                                                                                     |
| 2.8  | Data export and deletion workflow                                                           | P0  | **Done**: export archive; deletion with grace period and a 15-minute sweep                                                              |
| 2.9  | Logs, metrics, alerts, upload health view                                                   | P1  | Partial: admin summary and upload health done; **alerting moved to Phase 5**                                                            |
| 2.10 | Docker images and NAS stack definition                                                      | P0  | **Done**: `infra/docker/Dockerfile`, `infra/nas/docker-compose.yml` (memory-capped). **First NAS deploy pending** (owner runs over SSH) |
| 2.11 | CI integration tests (PostGIS and SeaweedFS service containers)                             | P0  | **Done**                                                                                                                                |

## Phase 3 — Mobile: capture and publish

| #    | Item                                                                                          | Pri     | Status                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Onboarding: age, sign-up, consents, anonymity explainer                                       | P0      | Built: email-code sign-in, onboarding (16+, name, versioned consents)                                                                       |
| 3.2  | Theme system (light/dark tokens, system-following)                                            | P0      | Built; camera and viewer always dark                                                                                                        |
| 3.3  | Camera screen: minimal, native-camera-like (D-22), and crop preview                           | P0      | Built: viewfinder, shutter, lens pills, tap-focus + drag exposure, pinch zoom, 16:9/1:1, flash, flip, last shot, review                     |
| 3.4  | Pin confirmation (GPS/manual/search)                                                          | P0      | Built: native map with fixed centre pin, place search, GPS button, no-permission path. **Android needs the Google Maps key (HANDWORK 3.4)** |
| 3.5  | Short data form; advanced form                                                                | P0 / P1 | Built                                                                                                                                       |
| 3.6  | Public preview, attribution toggle and notice, publish, local draft, retry, processing status | P0      | Built: drafts saved on the phone, resumable create/upload/confirm, status screen                                                            |
| 3.7  | Heading accuracy test (C16/C17); native azimuth module if error is over 15°                   | P1      | **Deferred to Phase 5** (owner: low priority); bearing stays editable by hand                                                               |
| 3.8  | Camera fixes from the spike (torch timing, single-lens fallback, retention readout)           | P0      | Done: zoom/exposure only after start, torch removed from UI (D-22), digital 2× fallback, spike readouts removed                             |
| 3.9  | iOS icon keeps Display P3                                                                     | P1      | **Done**: Assets.car compiles the icon as Display P3 (Mac verified)                                                                         |
| 3.10 | iOS signing workaround documented                                                             | P1      | In the handoff log; to move into a runbook                                                                                                  |
| 3.11 | End-to-end on devices: capture → published on iOS and Android                                 | P0      | **iOS done** (published on iPhone 16 Pro Max); Android pending (EAS build queued)                                                           |

## Phase 4 — Mobile: discover and organize

| #   | Item                                                    | Pri | Status                                                                                                                           |
| --- | ------------------------------------------------------- | --- | -------------------------------------------------------------------------------------------------------------------------------- |
| 4.1 | Floating nav: Feed · Map · Profile + Camera             | P0  | Built: dark pill Feed · Map · Profile + round camera; hides while scrolling, Reduce Motion aware                                 |
| 4.2 | Feed with scope chip, filter sheet, chrome hide/reveal  | P0  | Built: image-first cards, scope chip (everywhere/nearby/place + radius), filter sheet (persisted), paging                        |
| 4.3 | Map tab with clustering and preview card                | P0  | Built: /v1/map pins in view, grid clustering, preview card. **Android map needs the Google key**                                 |
| 4.4 | Location detail, Open in Maps, save to project, report  | P0  | Built: detail with notes, sun, advanced facts, Open in Maps, save sheet, report sheet, owner controls                            |
| 4.5 | Profile: My records, Projects, Settings, export, delete | P0  | Built: My locations + drafts, private projects (rename/delete, unavailable items), settings: profile, export, deletion, sign out |
| 4.6 | Empty, error, and offline states                        | P0  | Built: empty/offline/error/location-off states                                                                                   |
| 4.7 | Device test of Phase 4 on iOS and Android               | P0  | **Pending**                                                                                                                      |

## Phase 5 — Admin operations, safety, launch hardening

| #    | Item                                                   | Pri | Status                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------------------------------ | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1  | Moderation queue, audit trail, account/content actions | P0  | Done in Phase 2 (reports, hide/restore/remove, revoke sessions, roles, audit)                                                                                                                                                                                              |
| 5.2  | Controlled tags (D-25)                                 | P0  | **Done**: vocabulary table, admin Tags page, app loads live lists                                                                                                                                                                                                          |
| 5.3  | Abuse and rate limits                                  | P0  | **Done**: per-IP global 300/min, feed/map 60/min, daily caps on records/reports/exports, sign-in limits                                                                                                                                                                    |
| 5.4  | Security review                                        | P0  | **Done (internal)**: docs/security-review.md; F1 (Mailpit) and F2 (HTTPS) block external testers; external pentest before public launch                                                                                                                                    |
| 5.5  | Privacy and rights review                              | P0  | Drafts ready (docs/phase-0/03, docs/store); **counsel review** (HANDWORK 4.1)                                                                                                                                                                                              |
| 5.6  | Backups and restore rehearsal (D-27)                   | P0  | **Done**: nightly NAS dumps running; NAS restore rehearsal passed 2026-10-17 (identical counts). Off-site photo restore after HANDWORK 2.5                                                                                                                                 |
| 5.7  | Alerting (from 2.9)                                    | P0  | **Done**: worker ops-check emails owners (backups, failed/stuck uploads, overdue reports/deletions)                                                                                                                                                                        |
| 5.8  | Crash reporting (D-24)                                 | P1  | **Done in code**: server and app (`@sentry/react-native`, scrubbed, off until `EXPO_PUBLIC_SENTRY_DSN` / `SENTRY_DSN_*` are set, HANDWORK 3.7)                                                                                                                             |
| 5.9  | Load and upload testing                                | P1  | **Done locally** (`tools/load-test.mjs`, 2026-10-16), see results below. Found and fixed F9 (rate-limit bypass)                                                                                                                                                            |
| 5.10 | Accessibility review                                   | P1  | **Code pass done** (2026-10-16): labels/roles; 44 pt targets; gesture-only actions have screen-reader equivalents (crop frame adjustable, import removal action); modal sheets; Reduce Motion; contrast ≥ 4.5:1. **Device check** (VoiceOver/TalkBack, large text) pending |
| 5.11 | Store listings and privacy declarations                | P1  | Privacy answers drafted (docs/store); listing copy/screens later                                                                                                                                                                                                           |
| 5.12 | Support and incident runbooks                          | P0  | **Done**: docs/runbooks/incident-response.md                                                                                                                                                                                                                               |
| 5.13 | Compass/heading test (deferred 3.7)                    | P2  | Pending, owner: low priority                                                                                                                                                                                                                                               |
| 5.14 | Real email (D-26) and HTTPS via tunnel                 | P0  | Needs domain + Brevo (HANDWORK 2.3, 3.2) and Cloudflare hostname                                                                                                                                                                                                           |

### Load test results (5.9), local stack, 2026-10-16

20 simulated clients (one screen load per second each, ~16 requests/s) for 30 s, plus 20 parallel 4K uploads. Run on the Windows dev PC, never against the NAS.

| Measure                                       | p50    | p95    | Errors |
| --------------------------------------------- | ------ | ------ | ------ |
| Feed (`/v1/feed`, 50 km radius)               | 89 ms  | 185 ms | 0      |
| Map (`/v1/map`)                               | 96 ms  | 192 ms | 0      |
| Upload (create → presigned PUT → complete)    | 113 ms | 198 ms | 0/20   |
| 20 uploads at once, until visible in the feed | 21 s   | 40 s   | 0/20   |

The worker processes one photo at a time (~2 s per 4K image), so a burst queues. That's fine for the pilot; raise `WORKER_CONCURRENCY` to 2 on the NAS if bursts are common (the memory cap allows it).

## Design review (after the Phase 5/6 gaps are closed)

The owner asked for this on 2026-10-16. It is collected here and done in one pass at the end.

| #   | Item                                                                                                                                                                                                                                                                                                           | Status |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| R1  | **Feed like savee.com:** an image-first grid of thumbnails (two columns, rounded corners, no text under each tile, dark background). The details appear on tap. Photos are 16:9 or 1:1 (D-13), so a masonry layout gets some rhythm from mixing both. Reference screenshot from 2026-10-16 in the conversation | To do  |
| R2  | Overall UI polish across capture, the detail screen, Profile and Settings (owner: "UI will be improved in the next steps")                                                                                                                                                                                     | To do  |

## Phase 6–7 (summarized)

**Phase 6 prep done (2026-10-16):**

- [pilot runbook](../runbooks/pilot.md): gates, tester builds, weekly review, proposed targets for the owner to agree
- admin pilot metrics (Summary → Pilot) and the Locations library
- store listing draft ([docs/store/listing.md](../store/listing.md))
- `eas.json` production profile (app bundle, Play internal track)

Waiting on the owner's accounts and gates. An invite-only sign-up allow-list is not built; it's only needed if the owner wants one.

Closed pilot in one or two cities, metrics, tuning (Phase 6) · Cloud migration off the NAS before public launch · Paid tier: PDF location-timeline export (P2) · Localization (P2) · Offline maps (P2) · Sun-path prediction (P2)
