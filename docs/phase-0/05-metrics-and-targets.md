# Phase 0 — Metric Definitions and Non-Functional Targets

## Product metrics (pilot)

| Metric                         | Definition                                                                | Pilot target (_Proposed_)   |
| ------------------------------ | ------------------------------------------------------------------------- | --------------------------- |
| Capture completion             | Published records ÷ camera sessions that took at least one photo          | ≥ 60%                       |
| Publish success                | Records reaching `published` ÷ publish attempts, measured over 24 h       | ≥ 98%                       |
| Upload failure rate            | Uploads needing more than 1 retry, or never completing, ÷ uploads started | ≤ 5% / ≤ 1%                 |
| Time to first useful result    | App open → first feed image rendered in the current scope (p75)           | ≤ 2.5 s                     |
| Advanced input usage           | Records with at least 1 advanced field ÷ published records                | Track only                  |
| Saves per weekly active member | Save actions ÷ WAM                                                        | Track only                  |
| Attribution opt-in rate        | Attributed records ÷ published records                                    | Track only (privacy signal) |
| Report rate                    | Reports ÷ published records; median time to resolution                    | Resolution ≤ 72 h           |
| Retention                      | D7 / D30 of members who published or saved                                | Track only                  |
| Location permission grant      | Granted ÷ prompted                                                        | Track only                  |

Analytics events must not contain coordinates, image content, or creator–record links (see [03 §2](03-rights-privacy-data-ownership.md#2-anonymity-rules-enforced-server-side)).

## Non-functional targets

| Area                            | Target                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feed performance                | First useful content in under 2.5 s (p75) on the reference Android mid-range phone and iPhone with 4G; progressive image loading                  |
| Feed derivatives                | Thumbnail around 480 px wide, feed around 1080 px, detail around 2160 px; WebP/AVIF with JPEG fallback                                            |
| Uploads                         | Resumable; idempotency key per draft; no duplicate published records                                                                              |
| Availability (NAS prototype)    | Best effort; documented restore within 24 h from off-site backup                                                                                  |
| Availability (cloud production) | 99.5% monthly API; RPO 24 h, RTO 8 h (_Proposed_, revisit before launch)                                                                          |
| Backups                         | Nightly database dump and continuous media replication off-site (EU), with a restore rehearsal before the pilot                                   |
| Rate limits                     | Uploads 30/day per member, sign-in 10/15 min per IP+account, reports 20/day, search 60/min                                                        |
| Upload limits                   | Up to 25 MB per source image; JPEG/HEIC/HEIF/PNG; server-validated decode, dimensions, and orientation                                            |
| Security                        | TLS everywhere, encrypted storage, MFA for admins, least-privilege roles, dependency scanning in CI, secrets kept out of repos and mobile bundles |
| Accessibility                   | WCAG 2.2 AA for admin web; mobile Dynamic Type, screen readers, Reduce Motion, contrast in both themes                                            |

## Reference test devices (_Proposed_)

iPhone 13 (iOS 18+) · iPhone 16 Pro · Samsung Galaxy A55 · Google Pixel 8 · one low-end Android (about 4 GB RAM)
