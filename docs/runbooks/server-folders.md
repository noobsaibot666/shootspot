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

## Permissions

| Folder                | Owner                   | Mode  | Why                                                                                                  |
| --------------------- | ----------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `shared/`             | `alan` (your SMB user)  | `775` | You work in it from Windows and the Mac                                                              |
| `backups/`            | `root`, read for `alan` | `750` | Jobs write; you can copy a backup out but not damage one                                             |
| `runtime/`            | `apps` (uid 568)        | `700` | Containers run as TrueNAS's built-in `apps` user. An SMB client must never touch live database files |
| `runtime/config/.env` | `root`                  | `600` | Secrets                                                                                              |

**`runtime/` should be its own ZFS dataset** with POSIX ACLs, its own snapshot schedule, and SMB access off. Postgres refuses to start when it can't set `700` on its folder, and SMB-style (NFSv4) ACLs often block that `chmod`. Whether this works depends on how `04_DEV/_personal` was created. The inspection step in [HANDWORK](../HANDWORK.md) 2.1 checks that before anything is created.
