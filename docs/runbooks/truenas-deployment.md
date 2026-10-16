# TrueNAS deployment

**Host:** TrueNAS SCALE 25.10. `ssh truenas` connects as `alan` over the direct link `172.16.1.1`; the home-network address is **`192.168.178.146`**. **Folders:** [server-folders.md](server-folders.md). **Stack:** [infra/nas/docker-compose.yml](../../infra/nas/docker-compose.yml), compose project **`shootspot`**.

**Status:** Phase A deployed 2026-10-16 (images `1c69406`). All services are healthy and use about 420 MB of RAM in total.

## Rules (other apps run on this NAS)

- Read-only check first, then guarded change blocks. Touch only the `shootspot` compose project, the `Gaia/04_DEV/shootspot-*` datasets and `/mnt/Gaia/04_DEV/_personal/shootspot`.
- Never restart Docker, never touch other apps, shares or datasets. Every command uses `-p shootspot`.
- Every container has a `mem_limit` (about 1.9 GB of caps).
- No router port forwards. Ports bind to `192.168.178.146` only. Public access later goes through the **existing** `cloudflared`, by adding a hostname in the Cloudflare dashboard; that container is never touched.
- Secrets are generated on the NAS in `runtime/compose/.env` (root, 600). Never in git, chat or the handoff file.
- `runtime/` is root-only, so **never `cd` into it**. Address the file instead: `F=/mnt/Gaia/04_DEV/_personal/shootspot/runtime/compose/docker-compose.yml` and `sudo docker compose -p shootspot -f $F …`.
- Take a ZFS snapshot before each deploy.

## Endpoints (home network)

| What                                                    | URL                           |
| ------------------------------------------------------- | ----------------------------- |
| API (phones)                                            | `http://192.168.178.146:4400` |
| Admin web                                               | `http://192.168.178.146:4401` |
| S3 (presigned URLs only)                                | `http://192.168.178.146:4402` |
| Mailpit, sign-in codes (until real email, HANDWORK 3.2) | `http://192.168.178.146:4403` |

## Deploy or update

**1. On Windows:** build the images and put them on the share. Nothing goes through a registry.

```powershell
$sha = (git rev-parse --short HEAD).Trim()
$ts = 'api','worker','admin','backup'
foreach ($t in $ts) { docker build -f infra/docker/Dockerfile --target $t -t "shootspot-${t}:latest" -t "shootspot-${t}:$sha" . }
docker save -o "X:\04_DEV\_personal\shootspot\shared\builds\shootspot-images-$sha.tar" ($ts | ForEach-Object { "shootspot-${_}:latest"; "shootspot-${_}:$sha" })
Copy-Item infra/nas/docker-compose.yml X:\04_DEV\_personal\shootspot\shared\builds\docker-compose.yml -Force
Copy-Item infra/nas/.env.example X:\04_DEV\_personal\shootspot\shared\builds\env.example -Force
```

**2. On the NAS:** load the images and install the stack file. `.env` is generated once, on first deploy, and kept afterwards.

```sh
S=/mnt/Gaia/04_DEV/_personal/shootspot; B=$S/shared/builds; R=$S/runtime/compose; F=$R/docker-compose.yml
sha256sum $B/shootspot-images-<sha>.tar        # compare with the Windows hash
sudo docker load -i $B/shootspot-images-<sha>.tar
sudo install -m 600 -o root -g root $B/docker-compose.yml $F
# first deploy only:
if sudo test -e $R/.env; then echo ".env kept"; else
  gen() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-40; }
  sed -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(gen)|" -e "s|^S3_SECRET_ACCESS_KEY=.*|S3_SECRET_ACCESS_KEY=$(gen)|" \
      -e "s|^AUTH_SECRET=.*|AUTH_SECRET=$(gen)|" $B/env.example | sudo install -m 600 -o root -g root /dev/stdin $R/.env; fi
```

**3. Snapshot, start and verify:**

```sh
sudo zfs snapshot -r Gaia/04_DEV/shootspot-runtime@pre-deploy-$(date +%Y%m%d-%H%M)
sudo docker compose -p shootspot -f $F --profile devmail up -d
sudo docker compose -p shootspot -f $F ps -a
curl -s http://192.168.178.146:4400/ready
sudo docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | grep shootspot
```

## Owner account

```sh
sudo docker compose -p shootspot -f $F exec api node --import tsx scripts/grant-owner.ts you@example.com
```

Then sign in at `http://192.168.178.146:4401`, read the code in Mailpit (`:4403`), and scan the TOTP QR code.

## Rollback

```sh
sudo docker compose -p shootspot -f $F down     # stops only the shootspot project
sudo zfs rollback -r Gaia/04_DEV/shootspot-runtime@pre-deploy-<stamp>
# then start the previous images: set TAG=<old sha> in .env and run `up -d` again
```

## Phase B: public through the existing Cloudflare Tunnel (after HANDWORK 2.3–2.4)

1. In the Cloudflare dashboard, under the existing tunnel, add `api.<domain>` → `http://192.168.178.146:4400` and `media.<domain>` → `http://192.168.178.146:4402`.
2. Set `PUBLIC_API_URL`, `S3_PUBLIC_ENDPOINT`, `TRUSTED_ORIGINS` and `CLIENT_IP_HEADER=cf-connecting-ip` in `.env`, then run `up -d`.

## Phase C: backups (before any external tester)

- nightly `pg_dump` to `backups/postgres`
- ZFS snapshot task for `shootspot-runtime`
- restic to off-site storage (HANDWORK 2.5)
- a restore rehearsal ([backup-restore.md](backup-restore.md))
