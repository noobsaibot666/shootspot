# ADR 0004 — NAS prototype topology

**Status:** Proposed · 2026-10-16. It is confirmed when we first deploy to TrueNAS.

## Context

Decision D-20 puts the prototype on a container-capable TrueNAS. We build and test locally first, and deploy to the NAS only when a phase needs real-device testing over the internet. The plan (§7) forbids exposing NAS admin, SMB or NFS.

## Proposed decision

- **TrueNAS SCALE** (Linux) runs the stack as a Docker Compose project on a dedicated dataset. The same images and compose shape are used as in local development:
  - `db`: PostGIS
  - `s3`: SeaweedFS
  - `api`
  - `worker`
- **Ingress:** a **Cloudflare Tunnel** (`cloudflared` container) publishes **only the API hostname** (e.g. `api.shootspot.<domain>`).
  - No inbound router ports are opened.
  - The NAS UI, SSH, SMB and NFS stay on the LAN.
  - Object storage is never exposed directly. Uploads and downloads go through the API or short-lived presigned URLs routed through the same tunnel hostname.
- **Secrets** live in a root-only `.env` on the NAS dataset and never in git.
- **Backups:**
  - nightly `pg_dump`
  - SeaweedFS data snapshot: a ZFS snapshot of the dataset
  - encrypted off-site copy with **restic** to an EU object store (e.g. Backblaze B2 EU or Hetzner Storage Box)
  - a restore rehearsal before any external tester joins
- **Operations:** I give the commands step by step and you run them over SSH. See [runbooks/truenas-deployment.md](../runbooks/truenas-deployment.md).

## Open inputs needed from you

Edition confirmed: **TrueNAS SCALE**, reached at `alan@172.16.1.1` on the LAN. Still needed: the version (Docker-based apps need 24.10 or later), CPU architecture, the pool for the app, a domain name, and a Cloudflare account. See [HANDWORK.md](../HANDWORK.md) Step 2.
