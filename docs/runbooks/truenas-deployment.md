# TrueNAS deployment (draft)

**Status:** Outline. I'll turn each step into exact commands once [HANDWORK.md](../HANDWORK.md) H6–H10 are answered. You run them over SSH, one block at a time, and paste the output back to me.

## Rules

- Never expose the TrueNAS UI, SSH, SMB or NFS to the internet. No router port forwards.
- Only the API is public, through a Cloudflare Tunnel.
- Secrets live in `/mnt/<pool>/shootspot/.env` (mode 600, owned by root) and never in git.
- Every change is reversible: take a ZFS snapshot before each deploy.

## Steps

### 1. Preflight

Check TrueNAS edition and version, architecture, pool free space, and whether Docker is available.

### 2. Dataset

Create `/<pool>/shootspot` with the child datasets `db`, `s3`, `backups` and `config`.

### 3. Secrets

Generate the Postgres password, S3 keys and API secrets on the NAS with `openssl rand`, and write them to `.env`.

### 4. Stack

Use a compose file based on [infra/local/docker-compose.yml](../../infra/local/docker-compose.yml):

- data on the datasets
- `restart: unless-stopped`
- no host ports except the internal network
- `api` and `worker` images
- `cloudflared`

### 5. Images

Choose one approach:

- **(a)** Build on the NAS from a git checkout.
- **(b)** Push images from CI to GitHub Container Registry and pull them on the NAS. This is preferred.

### 6. Migrate

`docker compose run --rm api migrate up`

### 7. Tunnel

Create the tunnel in Cloudflare and route `api.<domain>` to `http://api:4000`. Then check `https://api.<domain>/ready` from the phone.

### 8. Backups

- nightly `pg_dump` into the `backups` dataset
- ZFS snapshot schedule
- restic to off-site storage
- check the last backup's age

### 9. Restore rehearsal

Restore the dump and the media into a scratch dataset, start a throwaway stack, and verify the record counts and image hashes. See [backup-restore.md](backup-restore.md).

### 10. Rollback

Roll back the dataset to the pre-deploy snapshot and redeploy the previous image tag.
