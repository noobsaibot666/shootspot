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
| 3.7  | Heading accuracy test (C16/C17); native azimuth module if error is over 15°                   | P0      | **Device test pending**                                                                                                                     |
| 3.8  | Camera fixes from the spike (torch timing, single-lens fallback, retention readout)           | P0      | Done: zoom/exposure only after start, torch removed from UI (D-22), digital 2× fallback, spike readouts removed                             |
| 3.9  | iOS icon keeps Display P3                                                                     | P1      | **Done**: Assets.car compiles the icon as Display P3 (Mac verified)                                                                         |
| 3.10 | iOS signing workaround documented                                                             | P1      | In the handoff log; to move into a runbook                                                                                                  |
| 3.11 | End-to-end on devices: capture → published on iOS and Android                                 | P0      | **iOS done** (published on iPhone 16 Pro Max); Android pending (EAS build queued)                                                           |

## Phase 4 — Mobile: discover and organize

| #   | Item                                                    | Pri |
| --- | ------------------------------------------------------- | --- |
| 4.1 | Floating nav: Feed · Map · Profile + Camera             | P0  |
| 4.2 | Feed with scope chip, filter sheet, chrome hide/reveal  | P0  |
| 4.3 | Map tab with clustering and preview card                | P0  |
| 4.4 | Location detail, Open in Maps, save to project, report  | P0  |
| 4.5 | Profile: My records, Projects, Settings, export, delete | P0  |
| 4.6 | Empty, error, and offline states                        | P0  |

## Phase 5+ (summarized)

Moderation hardening, rate limits, security/privacy review, counsel sign-off, restore rehearsal, store listings (P1) · Cloud migration off the NAS before public launch (P1) · Paid tier: PDF location-timeline export (P2) · Localization (P2) · Offline maps (P2) · Sun-path prediction (P2)
