# ADR 0003 — Media pipeline and object storage

**Status:** Accepted · 2026-10-16

## Decision

### Client

1. Capture as JPEG.
2. Load the image upright.
3. Apply the centred 16:9 or 1:1 crop (`centerCrop`).
4. Re-encode to JPEG at quality 0.9. Re-encoding drops the original EXIF, including GPS.

Coordinates travel only in the record payload.

### Server worker (`services/worker`)

1. Enforce limits: 25 MB, 100 MP decode limit, and decoding fails on any error.
2. Accept **JPEG, PNG, WebP and AVIF only**. **HEIC is rejected**, because sharp's prebuilt libvips does not include an HEVC decoder.
3. Decode the full raster with EXIF orientation applied, then validate the **upright pixels** using `checkPublishable`:
   - no portrait images
   - 16:9 or 1:1 within 1%
   - short edge of at least 1080 px
4. Produce **WebP** derivatives (thumb 480, feed 1080, detail 2160 wide), never enlarging, in sRGB, with **all metadata removed**.

### Storage

**SeaweedFS** S3 gateway, behind a `Storage` interface and the plain S3 API:

- `shootspot-quarantine` (private): originals awaiting processing, deleted after derivatives are confirmed.
- `shootspot-public`: derivatives only. In the pilot they are served through the API with signed URLs. A CDN is added at cloud migration.

## Why SeaweedFS

- **MinIO Community Edition is no longer viable.** It stopped publishing Docker images in October 2025, went into maintenance mode in December 2025, and its repository has since been archived.
- **SeaweedFS** is Apache-2.0 licensed, mature, runs as a single container on a NAS, and speaks S3. Garage was the alternative: also suitable, but AGPL and with a more involved cluster layout setup.
- Because we use only the plain S3 API, moving to Cloudflare R2, Hetzner, Scaleway or AWS later is a configuration change, not a code change.

## Consequences

- Worker tests cover:
  - the EXIF orientation traps in both directions
  - GPS stripping
  - truncated files
  - unsupported formats
- If a future client sends HEIC, convert it on the client. Do not add HEVC to the server.
