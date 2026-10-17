# Public endpoints: tunnel, DNS and docs hub

**Internal.** Everything ShootSpot exposes to the internet for the store launch (D-33, D-35), how it was set up on 2026-10-17, and how to change it. This file is not published. The public docs site (`docs-site/`) contains only the legal and user-guide pages.

## What is public

| Hostname                                  | Goes to                                     | What                                                        |
| ----------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| `https://shootspot-api.expose-u.com`      | NAS `http://192.168.178.146:4400` (api)     | The app's API. `/ready` returns `{"status":"ok",…}`         |
| `https://shootspot-media.expose-u.com`    | NAS `http://192.168.178.146:4402` (s3)      | Photos, through presigned URLs only. The root returns 403   |
| `https://docs.alan-design.com/shootspot/` | web_three's `docs-nginx` on the NAS (share) | Privacy, terms, image licence, account deletion, user guide |

**Not public:** the admin web (`:4401`), Postgres, the S3 admin, backups and the NAS itself. Never add a route for them.

The domain is **expose-u.com**. The owner first chose alan-design.com, but the Mac's Cloudflare token manages DNS only for expose-u.com, so the owner switched (2026-10-17). It also matches the contact `hello@expose-u.com`.

## Cloudflare Tunnel

- Tunnel **`TrueNas`** (`035a6e09-a040-45db-9a75-c2281879ba6d`) is shared with the owner's other sites: expose-u.com, alan-design.com, the portal, outreach, the docs hub and licensing. **Other routes must never change.**
- The connector is the `cloudflared` container on the NAS (network `webnet`, started with `--token`). The tunnel is **remotely managed**: its routes live in Cloudflare (Zero Trust → Networks → Tunnels → TrueNas → Public Hostname), not in a file on the NAS. Never restart this container: other sites depend on it.
- Routes point at the NAS LAN address (`192.168.178.146:<port>`), the same way as the other sites.

### How the ShootSpot routes were added

Via the Cloudflare API from the Mac, with [infra/cloudflare/tunnel-hostnames.py](../../infra/cloudflare/tunnel-hostnames.py):

```sh
export SSL_CERT_FILE=/etc/ssl/cert.pem    # python.org builds on macOS have no CA store
python3 infra/cloudflare/tunnel-hostnames.py list
python3 infra/cloudflare/tunnel-hostnames.py add \
  shootspot-api.expose-u.com=http://192.168.178.146:4400 \
  shootspot-media.expose-u.com=http://192.168.178.146:4402
```

- **Credentials:** the API token inside the Mac's `~/.cloudflared/cert.pem` (from an earlier `cloudflared tunnel login`). It can edit this account's tunnels and the **expose-u.com** DNS zone. It cannot see alan-design.com. The script reads it from the file and never prints it.
- **Safety:** `add` saves the previous config to `tunnel-config-<version>.json`, only appends rules before the catch-all, and verifies afterwards that every existing rule is byte-for-byte unchanged. It refuses hostnames outside expose-u.com and hostnames already routed.
- **DNS:** proxied CNAMEs `shootspot-api` and `shootspot-media` → `035a6e09-….cfargotunnel.com`, comment "ShootSpot public endpoint (D-33)". Both are first-level subdomains, so the free universal certificate covers them.
- Tunnel config went from version 40 to 41.
- **Checked after the change:** both ShootSpot hostnames answer, and alan-design.com, expose-u.com, docs, portal, outreach and `alan-design.com/licensing/health` answer as before.
- **Pre-existing, not ours:** `licensing.alan-design.com` routes to `:8888`, where nothing listens on the NAS, so it returns 502. Licensing itself works via `alan-design.com/licensing/`. Left unchanged and reported to the owner.

**Without the Mac:** the same two routes can be added in the dashboard (Public Hostname → Add, service type HTTP). The dashboard creates the DNS records itself.

**To remove** a ShootSpot route: delete it in the dashboard (Public Hostname → the row → Delete), then delete its DNS record. Never edit or reorder the other rows.

## NAS settings for the public API

Set in `runtime/compose/.env` (root-only; owner block, 2026-10-17; the previous file is kept as `.env.bak-<stamp>`):

```sh
PUBLIC_API_URL=https://shootspot-api.expose-u.com        # Better Auth base URL
S3_PUBLIC_ENDPOINT=https://shootspot-media.expose-u.com  # host in presigned photo URLs
CLIENT_IP_HEADER=cf-connecting-ip                        # per-phone rate limits behind the tunnel
TRUSTED_ORIGINS=http://192.168.178.146:4401              # unchanged: admin stays LAN-only (secure cookies off)
```

- **Requires compose `30237a7` or later.** Older compose files hard-coded `S3_PUBLIC_ENDPOINT` to the LAN.
- **LAN and Tailscale clients keep working.** Without the header, `clientIp()` falls back to the socket address. Presigned photo URLs now always use the public media host. That works from the LAN too, because it goes out through Cloudflare.
- **Presigned URLs are signed for the public host:** SeaweedFS checks the `Host` that Cloudflare forwards, which is the same name.

## App builds

| Build                                  | `EXPO_PUBLIC_API_URL`                               | Notes                                                                          |
| -------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Store (EAS `production`)               | `https://shootspot-api.expose-u.com`                | EAS environment variable. HTTPS, so app.config adds no ATS/cleartext exception |
| Owner test builds (local Release, dev) | `http://192.168.178.146:4400` in `apps/mobile/.env` | LAN or Tailscale only (D-30); keep until the store builds take over            |

## NAS images built on the Mac

Docker Desktop on Apple silicon can build the NAS images (`--platform linux/amd64`, emulated, a few minutes with a warm cache). Same targets as the Windows runbook:

```sh
sha=$(git rev-parse --short HEAD); OUT=/Volumes/Gaia/04_DEV/_personal/shootspot/shared/builds
for t in api worker admin backup; do
  docker build --platform linux/amd64 -f infra/docker/Dockerfile --target "$t" -t "shootspot-${t}:latest" -t "shootspot-${t}:${sha}" .
done
docker save -o "$OUT/shootspot-images-${sha}.tar" $(for t in api worker admin backup; do echo "shootspot-${t}:latest shootspot-${t}:${sha}"; done)
cp infra/nas/docker-compose.yml "$OUT/docker-compose.yml"; cp infra/nas/.env.example "$OUT/env.example"
shasum -a 256 "$OUT/shootspot-images-${sha}.tar"
```

- Build from a **clean tree**: no rebase or merge in progress.
- In zsh, write `"shootspot-${t}:latest"` with braces, because `$t:l` is a zsh modifier and produces `…atest`.
- `30237a7` was built this way and deployed on 2026-10-17. The owner checked the hash, took a snapshot `pre-deploy-<stamp>`, loaded the images and installed the compose file. The rollback images are `43acc49`.

## Docs hub (D-35)

- Source: [docs-site/](../../docs-site/) (Astro 5.18.2 + Starlight 0.30.6, standalone npm). Publishes only `src/content/docs/legal/` and `user-guide/`. **Never add runbooks, NAS, security or infrastructure pages there.**
- Hosting: web_three's `docs-nginx` on the NAS serves `/mnt/Gaia/04_DEV/web/www/website/docs-site/dist/` read-only (from the Mac: `/Volumes/Gaia/04_DEV/web/www/website/docs-site/dist/`). ShootSpot lives in `dist/shootspot/`. No container restart is needed.
- Deploy from the Mac: `cd docs-site && npm install && npm run build && rsync -a --delete dist/ /Volumes/Gaia/04_DEV/web/www/website/docs-site/dist/shootspot/`.
- Hub homepage card: web_three `docs-site/homepage/index.html` (commit `e3eb03a`), copied to the share's `docs-site/homepage/index.html` and `docs-site/dist/index.html`.
- Operator line on the legal pages: "Alan Alves, trading as expose.u (sole proprietorship), Dudenstraße 24, 10965 Berlin, Germany", VAT ID DE461275084. It comes from the expose.u finance portal; the owner confirms it against the Impressum. When the legal wording changes: update `docs/store/legal-drafts.md`, the `docs-site` pages and `services/api/src/legal.ts` (version), then redeploy.
