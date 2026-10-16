# Backup and restore (draft)

## What is backed up

| Data                            | Method                                  | Frequency              | Retention (_Proposed_)                                                                                                     |
| ------------------------------- | --------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL                      | `pg_dump -Fc` to the `backups` dataset  | Nightly                | 14 daily                                                                                                                   |
| Object storage (SeaweedFS data) | ZFS snapshot of the `s3` dataset        | Nightly                | 7 daily, 4 weekly                                                                                                          |
| Both, off-site                  | restic (encrypted) to EU object storage | Nightly after the dump | 35 days (matches the deletion notice, [03 §6](../phase-0/03-rights-privacy-data-ownership.md#6-account-deletion-workflow)) |

The restic repository password is stored in two places: the NAS `.env` and your password manager. Without it, the off-site backup cannot be read.

## Restore procedure (outline)

1. Stop `api` and `worker`.
2. Restore the database into a new database with `pg_restore --clean --if-exists`, then run migrations.
3. Restore the `s3` dataset from a ZFS snapshot, or from `restic restore` into a scratch dataset.
4. Start the stack and check `/ready`.
5. Spot-check 10 random media keys against their database records.
6. Record the duration. This is the measured RTO.

## Rehearsal

Do a full rehearsal before any external tester joins (Phase 1/2 exit), and again before launch. Log each rehearsal here with the date, the backup restored, the duration and any issues.
