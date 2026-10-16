# Server folders

One project root, seen from all three machines:

| Machine | Path                                       |
| ------- | ------------------------------------------ |
| TrueNAS | `/mnt/Gaia/04_DEV/_personal/shootspot`     |
| Windows | `X:\04_DEV\_personal\shootspot`            |
| macOS   | `/Volumes/Gaia/04_DEV/_personal/shootspot` |

The **code is not stored here**. It lives in git, and each machine keeps its own clone on a local disk, because `node_modules` and builds over SMB are slow and fragile. This folder holds what the app and the team need around the code.

## Layout

```
shootspot/
├── shared/            You, from any machine (read/write over SMB)
│   ├── builds/          Android APK / iOS test builds to install
│   ├── reports/         Device test results, screenshots, recordings
│   ├── design/          Logo, icons, mockups, store artwork
│   └── exports/         Database or media exports you want to inspect
├── backups/           Written by NAS jobs; read-only for you
│   ├── postgres/        Nightly pg_dump files
│   └── restic/          Local cache for the encrypted off-site backup
└── runtime/           Containers only; never edit over SMB
    ├── config/          .env with secrets (root only, 600)
    ├── compose/         docker-compose.yml for the NAS stack
    ├── postgres/        Database files
    ├── seaweedfs/       Photo storage (S3)
    └── ai-memory/       Shared ai-memory server data (Windows and Mac point here)
```

## NAS facts (checked 2026-10-16)

TrueNAS SCALE 25.10.3 · x86_64 · 12 cores · 14 GiB RAM · Docker 28.3.1 · Compose 2.38.1. `Gaia/04_DEV` is an NFSv4-ACL dataset and `_personal` is a plain folder inside it. The `Gaia` SMB share exposes all of `/mnt/Gaia`. `alan` is uid 951, has primary group `root` (gid 0), and is in the `docker` group. The `apps` user is uid/gid 568.

## Datasets

The same pattern as the existing `Gaia/04_DEV/exposeu-delivery`: datasets with custom mountpoints.

| Dataset                                   | Mountpoint                       | Properties                  |
| ----------------------------------------- | -------------------------------- | --------------------------- |
| `Gaia/04_DEV/shootspot-runtime`           | `…/_personal/shootspot/runtime`  | `acltype=posix`, `xattr=sa` |
| `Gaia/04_DEV/shootspot-runtime/postgres`  | `…/runtime/postgres` (inherited) | `recordsize=16K` (DB pages) |
| `Gaia/04_DEV/shootspot-runtime/seaweedfs` | `…/runtime/seaweedfs`            | `recordsize=1M` (photos)    |
| `Gaia/04_DEV/shootspot-runtime/ai-memory` | `…/runtime/ai-memory`            | defaults                    |
| `Gaia/04_DEV/shootspot-backups`           | `…/_personal/shootspot/backups`  | `acltype=posix`, `xattr=sa` |

Separate datasets give each part its own snapshots and rollback, and POSIX permissions that Postgres accepts. `shared/` stays a plain folder in `Gaia/04_DEV`.

## Permissions

| Folder                                       | Owner:group | Mode  | Effect                                                                     |
| -------------------------------------------- | ----------- | ----- | -------------------------------------------------------------------------- |
| `shared/`                                    | `alan:root` | `775` | You work in it from Windows and the Mac                                    |
| `backups/` and subfolders                    | `root:root` | `750` | Jobs write; `alan` (group root) can read and copy out, but not change      |
| `runtime/`                                   | `root:root` | `700` | Invisible over SMB; only root and the containers                           |
| `runtime/postgres`, `seaweedfs`, `ai-memory` | `568:568`   | `700` | Each container runs as the `apps` user and owns only its own data          |
| `runtime/config`, `runtime/compose`          | `root:root` | `700` | Secrets (`.env` is `600`) and the stack definition, read by Docker as root |

Containers reach their data through bind mounts, so they don't need access to the parent `runtime/` folder.

## Memory

At inspection, 1.9 GiB was free of 14 GiB. Part of the used memory is the ZFS cache (ARC), which shrinks under pressure. Every container in the NAS compose file still gets a `mem_limit` (planned: postgres 512M, seaweedfs 256M, api 256M, worker 512M, ai-memory 256M).
