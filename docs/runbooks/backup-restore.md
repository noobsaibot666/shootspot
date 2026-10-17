# Backup and restore

**Status:** built and rehearsed locally, 2026-10-16. A dump restored into a fresh database gave identical counts for locations, users, tags and migrations. On the NAS, the service starts with the Phase 5 deploy. Off-site copies start once Backblaze is configured (HANDWORK 2.5).

## What runs

The `backup` service in [infra/nas/docker-compose.yml](../../infra/nas/docker-compose.yml) uses image target `backup` (Postgres 18 client and restic) and script [infra/docker/backup.sh](../../infra/docker/backup.sh). Every night at `BACKUP_AT` (default 03:15, NAS local time) it does the following:

| Step                                                                                      | Where                                                                            | Kept                                                                                                                                  |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pg_dump -Fc` of the database                                                             | `backups/postgres/shootspot-<UTC stamp>.dump` on the `shootspot-backups` dataset | 14 days                                                                                                                               |
| restic snapshot of the dumps and the photo store (`runtime/seaweedfs`, mounted read-only) | Backblaze B2, EU (`RESTIC_REPOSITORY`), encrypted with `RESTIC_PASSWORD`         | 35 daily snapshots (matches the deletion notice, [03 §6](../phase-0/03-rights-privacy-data-ownership.md#6-account-deletion-workflow)) |
| Heartbeat rows `pg_dump` and `offsite`                                                    | `ops_heartbeats` table                                                           | latest                                                                                                                                |

The admin summary shows both backup times. The worker emails every owner if a backup is more than 26 hours old (see [incident-response.md](incident-response.md)).

**Also recommended:** in the TrueNAS UI, under Data Protection → Periodic Snapshot Tasks, add a daily recursive snapshot of `Gaia/04_DEV/shootspot-runtime` kept for 7 days. It gives fast local rollback, separate from restic.

**Keep `RESTIC_PASSWORD` in your password manager.** Without it the off-site backup cannot be read.

## Run a backup now (on the NAS)

```sh
F=/mnt/Gaia/04_DEV/_personal/shootspot/runtime/compose/docker-compose.yml
sudo docker compose -p shootspot -f $F run --rm backup now
sudo ls -la /mnt/Gaia/04_DEV/_personal/shootspot/backups/postgres
```

## Restore the database (on the NAS)

1. Snapshot first, then stop the writers:
   ```sh
   sudo zfs snapshot -r Gaia/04_DEV/shootspot-runtime@pre-restore-$(date +%Y%m%d-%H%M)
   sudo docker compose -p shootspot -f $F stop api worker backup
   ```
2. Restore a dump into a **new** database and check it before switching:
   ```sh
   D=shootspot-<stamp>.dump
   sudo docker compose -p shootspot -f $F exec db psql -U shootspot -d shootspot -c "create database restore_check"
   sudo docker compose -p shootspot -f $F run --rm --entrypoint pg_restore backup -h db -U shootspot -d restore_check --no-owner /backups/postgres/$D
   sudo docker compose -p shootspot -f $F exec db psql -U shootspot -d restore_check -tAc "select count(*) from locations"
   ```
3. If the check looks right, swap the databases (rename the old one so nothing is lost):
   ```sh
   sudo docker compose -p shootspot -f $F exec db psql -U shootspot -d postgres -c "alter database shootspot rename to shootspot_old" -c "alter database restore_check rename to shootspot"
   sudo docker compose -p shootspot -f $F up -d
   curl -s http://192.168.178.146:4400/ready
   ```
4. When everything works, drop `shootspot_old`.

## Restore photos from off-site (restic)

```sh
sudo docker compose -p shootspot -f $F run --rm --entrypoint restic backup snapshots
sudo docker compose -p shootspot -f $F run --rm -v /mnt/Gaia/04_DEV/_personal/shootspot/backups/restore:/restore --entrypoint restic backup restore latest --target /restore
```

Then stop `s3`, copy `restore/data/seaweedfs` over `runtime/seaweedfs` (as root, keeping uid 568), and start the stack again.

## Rehearsal log

| Date                                          | What                                                                                                                                                                              | Result                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 2026-10-16                                    | Local: backup container (pg_dump + restic to a local repo), `pg_restore` into a scratch database                                                                                  | Pass: identical row counts, restic snapshot listed                                  |
| 2026-10-17                                    | NAS: nightly dump `shootspot-20261017T011523Z.dump` restored into a scratch database (`restore_check`) next to the live one, counts compared, scratch dropped. No service stopped | Pass: locations 6, users 6, media 6, vocabulary 24, migrations 6, identical to live |
| _after off-site is configured (HANDWORK 2.5)_ | NAS: restic restore of photos from Backblaze into `backups/restore`, spot-check files                                                                                             | _pending_                                                                           |
