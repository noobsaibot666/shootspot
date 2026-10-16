# Threat model (V1, initial)

**Scope:** mobile app, API, worker, object storage, NAS prototype, and admin web. Review it at each phase exit.

## Assets, ranked

1. **The creator ↔ record link and attribution data.** Leaking it breaks the core promise (D-06) that nobody can learn where a person goes.
2. Account data: email, profile, sessions, and admin credentials.
3. Original uploads, which can contain EXIF GPS and device serials before processing.
4. Location records. Public to members, but must not be bulk-scraped.
5. Backups. They contain everything above.

## Threats and mitigations

| Threat                                                                                         | Mitigation                                                                                                                                                                      | Phase     |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| The API returns `creator_id` on anonymous records, or ids are sequential and allow correlation | Creator link in a separate `record_ownership` table; response DTO allow-lists with a test asserting no creator fields; random UUIDv4 ids                                        | 2         |
| Timing or metadata correlation: one person's many anonymous records grouped                    | No per-user endpoints for others; feed ordering doesn't expose upload sequence per user; no `created_at` on public payloads beyond `capturedAt` (D-08)                          | 2         |
| Original EXIF GPS leaks through derivatives                                                    | Client re-encode plus server re-encode with metadata stripped (tested); originals only in the private quarantine bucket and deleted after processing                            | 1 ✓ / 2   |
| Malicious image (decompression bomb, parser exploit)                                           | sharp pixel limit, byte limit, decode fails on error, format allow-list; worker runs as non-root in its own container with no network except S3/DB                              | 1 ✓ / 2   |
| Coordinate scraping by a member account                                                        | Sign-in required (D-05); rate limits on search/feed; anomaly alerting on page depth                                                                                             | 2 / 5     |
| Admin account takeover                                                                         | MFA required; separate admin client and session policy; audit log of every view of a creator link                                                                               | 2         |
| Insider over-access                                                                            | Least-privilege roles; creator-link reads audited; no production DB access from developer laptops                                                                               | 2 / 5     |
| NAS exposed to the internet                                                                    | Cloudflare Tunnel to the API only; no port forwards; NAS UI/SSH/SMB on the LAN only                                                                                             | Deploy    |
| Secrets in git or the mobile bundle                                                            | `.env` gitignored; no secrets in `app.json`; Maps key restricted by package and signature; GitHub secret scanning with push protection (enable in repo settings — HANDWORK H21) | 1 ✓ / 2   |
| Backup theft                                                                                   | restic encryption; off-site credentials scoped to append-only where supported                                                                                                   | Deploy    |
| Logs leaking coordinates or PII                                                                | Request logging disabled by default; structured logs allow-list fields; no coordinates in analytics (05 NFR)                                                                    | 1 ✓ / 2   |
| Dependency supply chain                                                                        | pnpm minimum release age, `allowBuilds` allow-list, frozen lockfile in CI, Dependabot weekly updates                                                                            | 1 ✓       |
| Unsafe or illegal locations published (physical harm)                                          | Prohibited-location policy, reports, admin hide/blur, access-type field                                                                                                         | 2 / 4 / 5 |

✓ = in place at the end of Phase 1.
