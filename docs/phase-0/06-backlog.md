# Phase 0 — Prioritized Backlog

P0 = required for the closed pilot · P1 = required for public launch · P2 = after V1

## Phase 1 — Technical proof and foundations

| # | Item | Pri |
|---|---|---|
| 1.1 | Monorepo scaffold (mobile, admin, api, worker, shared packages), lint, format, TypeScript, CI | P0 |
| 1.2 | Camera spike: RN with native modules (AVFoundation/CameraX) — 16:9/1:1 live crop mask, tap-to-focus, exposure, lens/zoom, torch, rotate cue | P0 |
| 1.3 | Orientation normalization and pixel-level crop validation (client and worker) | P0 |
| 1.4 | Heading/bearing accuracy test; GPS accuracy display; manual pin | P0 |
| 1.5 | Native map spike (Apple/Google through one component); place search approach (D-21) | P0 |
| 1.6 | NAS stack: Docker Compose for PostGIS, S3-compatible store, API, worker; outbound tunnel; off-site encrypted backup | P0 |
| 1.7 | Choose the S3-compatible store for the NAS (assess Garage, SeaweedFS, MinIO licensing/distribution status) — ADR | P0 |
| 1.8 | Choose the auth provider (EU-hosted OIDC with MFA for admin) — ADR | P0 |
| 1.9 | Threat model, restore runbook, deployment runbook | P0 |
| 1.10 | Apple Developer and Google Play accounts, signing ownership | P0 |

## Phase 2 — Backend and admin foundation

| # | Item | Pri |
|---|---|---|
| 2.1 | Auth, sessions, roles (member/owner), age gate, consent versions | P0 |
| 2.2 | Schema: locations (PostGIS), media, scout_notes (short and advanced), record_ownership, projects, reports, audit | P0 |
| 2.3 | Signed upload, idempotency, processing queue, worker (decode, validate, crop check, EXIF strip, derivatives) | P0 |
| 2.4 | Feed/search API (radius, Good for, best light, cursor pagination) with the anonymity response contract | P0 |
| 2.5 | Projects API; My records API; attribution toggle | P0 |
| 2.6 | Sun azimuth/elevation at capture computed server-side | P1 |
| 2.7 | Admin web: sign-in/MFA, role-gated shell, reports queue, hide/restore/remove, audit log | P0 |
| 2.8 | Data export and deletion workflow (stateful job) | P0 |
| 2.9 | Logs, metrics, alerts, upload health view | P1 |

## Phase 3 — Mobile: capture and publish

| # | Item | Pri |
|---|---|---|
| 3.1 | Onboarding: age, sign-up, consents, anonymity explainer | P0 |
| 3.2 | Theme system (light/dark tokens, system-following) | P0 |
| 3.3 | Camera screen (from the spike) and crop preview | P0 |
| 3.4 | Pin confirmation (GPS/manual/search) | P0 |
| 3.5 | Short data form; advanced form | P0 / P1 |
| 3.6 | Public preview, attribution toggle and notice, publish, local draft, retry, processing status | P0 |

## Phase 4 — Mobile: discover and organize

| # | Item | Pri |
|---|---|---|
| 4.1 | Floating nav: Feed · Map · Profile + Camera | P0 |
| 4.2 | Feed with scope chip, filter sheet, chrome hide/reveal | P0 |
| 4.3 | Map tab with clustering and preview card | P0 |
| 4.4 | Location detail, Open in Maps, save to project, report | P0 |
| 4.5 | Profile: My records, Projects, Settings, export, delete | P0 |
| 4.6 | Empty, error, and offline states | P0 |

## Phase 5+ (summarized)
Moderation hardening, rate limits, security/privacy review, counsel sign-off, restore rehearsal, store listings (P1) · Cloud migration off the NAS before public launch (P1) · Paid tier: PDF location-timeline export (P2) · Localization (P2) · Offline maps (P2) · Sun-path prediction (P2)
