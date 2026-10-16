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

| #   | Item                                                                                                             | Pri |
| --- | ---------------------------------------------------------------------------------------------------------------- | --- |
| 2.1 | Auth, sessions, roles (member/owner), age gate, consent versions                                                 | P0  |
| 2.2 | Schema: locations (PostGIS), media, scout_notes (short and advanced), record_ownership, projects, reports, audit | P0  |
| 2.3 | Signed upload, idempotency, processing queue, worker (decode, validate, crop check, EXIF strip, derivatives)     | P0  |
| 2.4 | Feed/search API (radius, Good for, best light, cursor pagination) with the anonymity response contract           | P0  |
| 2.5 | Projects API; My records API; attribution toggle                                                                 | P0  |
| 2.6 | Sun azimuth/elevation at capture computed server-side                                                            | P1  |
| 2.7 | Admin web: sign-in/MFA, role-gated shell, reports queue, hide/restore/remove, audit log                          | P0  |
| 2.8 | Data export and deletion workflow (stateful job)                                                                 | P0  |
| 2.9 | Logs, metrics, alerts, upload health view                                                                        | P1  |

## Phase 3 — Mobile: capture and publish

| #    | Item                                                                                                                                                                                                         | Pri     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| 3.1  | Onboarding: age, sign-up, consents, anonymity explainer                                                                                                                                                      | P0      |
| 3.2  | Theme system (light/dark tokens, system-following)                                                                                                                                                           | P0      |
| 3.3  | Camera screen: minimal, native-camera-like on each platform (D-22), and crop preview                                                                                                                         | P0      |
| 3.4  | Pin confirmation (GPS/manual/search)                                                                                                                                                                         | P0      |
| 3.5  | Short data form; advanced form                                                                                                                                                                               | P0 / P1 |
| 3.6  | Public preview, attribution toggle and notice, publish, local draft, retry, processing status                                                                                                                | P0      |
| 3.7  | Heading accuracy test (C16/C17) on Android and iPhone; native camera-azimuth module if error is over 15°                                                                                                     | P0      |
| 3.8  | Camera fixes from the spike: apply torch/zoom only after the session starts (Android "Camera is not active"); lens fallback when the device exposes a single zoom factor; correct the crop-retention readout | P0      |
| 3.9  | iOS icon keeps Display P3: config plugin to restore the ICC profile / display-gamut in AppIcon after prebuild (the Mac found prebuild strips it)                                                             | P1      |
| 3.10 | iOS signing: document or script the `xcodebuild -allowProvisioningUpdates` workaround from the Mac log                                                                                                       | P1      |

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
