# TrueNAS deployment

**Host:** TrueNAS SCALE 25.10 at `ssh truenas` (`alan@172.16.1.1`, LAN only). **Folders:** [server-folders.md](server-folders.md). **Stack:** [infra/nas/docker-compose.yml](../../infra/nas/docker-compose.yml).

## Rules (other apps run on this NAS)

- Read-only check first, then guarded change blocks. Touch only `Gaia/04_DEV/shootspot-*` and `/mnt/Gaia/04_DEV/_personal/shootspot`.
- Never restart Docker, never touch other apps, shares or datasets.
- Every container has a `mem_limit` (about 1.8 GB in total).
- No router port forwards. Ports bind to the LAN IP only. Public access later goes through the Cloudflare Tunnel.
- Secrets are generated on the NAS and stored in `runtime/compose/.env` (root, 600). Never in git, chat or the handoff file.
- Take a ZFS snapshot before each deploy so it can be rolled back.

## Phase A: first deploy, LAN only (no domain needed)

Phones on the home Wi-Fi use `http://172.16.1.1:4400`. Sign-in codes go to a Mailpit inbox on the NAS (`:4403`) until a real email sender exists (HANDWORK 3.2).

### A1. Check (read-only, on the NAS)

```sh
sudo docker ps --format '{{.Names}}\t{{.Ports}}' | head -50
sudo ss -ltnp | grep -E ':(4400|4401|4402|4403)\b' || echo "ports 4400-4403 free"
free -h; zfs list -o name,used,avail Gaia/04_DEV/shootspot-runtime
```

### A2. Images (on Windows): build, then stream to the NAS

`alan` is in the `docker` group, so `docker load` needs no sudo. Nothing goes through a registry.

```powershell
foreach ($t in 'api','worker','admin') { docker build -f infra/docker/Dockerfile --target $t -t "shootspot-${t}:latest" . }
docker save shootspot-api:latest shootspot-worker:latest shootspot-admin:latest | ssh truenas docker load
```

### A3. Stack files (on Windows, then on the NAS)

```powershell
scp infra/nas/docker-compose.yml truenas:/tmp/shootspot-compose.yml
```

Then on the NAS:

```sh
# runtime/ is root-only, so the file is installed with sudo and the temporary copy removed
sudo install -m 600 -o root -g root /tmp/shootspot-compose.yml \
  /mnt/Gaia/04_DEV/_personal/shootspot/runtime/compose/docker-compose.yml && rm /tmp/shootspot-compose.yml
```

### A4. Secrets (on the NAS; values never leave it)

The exact block is given at deploy time. It writes `.env` from [infra/nas/.env.example](../../infra/nas/.env.example) with `openssl rand` values for `POSTGRES_PASSWORD`, `S3_SECRET_ACCESS_KEY` and `AUTH_SECRET`.

### A5. Start (on the NAS)

```sh
sudo zfs snapshot -r Gaia/04_DEV/shootspot-runtime@pre-deploy-$(date +%Y%m%d-%H%M)
cd /mnt/Gaia/04_DEV/_personal/shootspot/runtime/compose
sudo docker compose --profile devmail up -d
sudo docker compose ps
curl -s http://172.16.1.1:4400/ready
```

### A6. First owner

1. Open `http://172.16.1.1:4401` and sign in. Read the code at `http://172.16.1.1:4403`.
2. Run `sudo docker compose exec api node --import tsx scripts/grant-owner.ts you@…` (`DATABASE_URL` is already set in the container).
3. Sign in again and scan the TOTP QR code.

### Rollback

```sh
sudo docker compose down          # stops only the shootspot project
sudo zfs rollback -r Gaia/04_DEV/shootspot-runtime@pre-deploy-<stamp>
```

## Phase B: public through a Cloudflare Tunnel (after HANDWORK 2.3–2.4)

Add `cloudflared` with the tunnel token. Route `api.<domain>` to `http://api:4000` and the S3 hostname to `http://s3:8333`. Then set `PUBLIC_API_URL`, `S3_PUBLIC_ENDPOINT`, `TRUSTED_ORIGINS` and `CLIENT_IP_HEADER=cf-connecting-ip`, and remove the LAN port bindings for anything that doesn't need them.

## Phase C: backups (before any external tester)

- nightly `pg_dump` to `backups/postgres`
- ZFS snapshot task for `shootspot-runtime`
- restic to off-site storage (HANDWORK 2.5)
- a restore rehearsal ([backup-restore.md](backup-restore.md))
