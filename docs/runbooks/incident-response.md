# Incident response and support

Owners get alert emails from the worker (every 30 minutes, at most once per problem per 12 hours). Each alert below says what it means and what to do. Use the admin website (`http://192.168.178.146:4401`) and the NAS commands in [truenas-deployment.md](truenas-deployment.md). Commands assume `F=/mnt/Gaia/04_DEV/_personal/shootspot/runtime/compose/docker-compose.yml`.

## Alerts

| Alert                                   | Meaning                                            | First steps                                                                                                                                      |
| --------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| No database backup / last backup > 26 h | The nightly `pg_dump` didn't run or failed         | `sudo docker compose -p shootspot -f $F logs --tail 50 backup`. Run `… run --rm backup now`. Check free space on `Gaia/04_DEV/shootspot-backups` |
| Off-site backup > 26 h                  | restic to Backblaze failed                         | Same logs. Check the B2 key hasn't expired and the bucket exists                                                                                 |
| Uploads failed processing               | Storage or worker error after 3 retries            | Admin → Uploads → read the error → **Retry**. If many fail: `… logs --tail 100 worker s3`                                                        |
| Uploads stuck > 30 min                  | The worker isn't processing                        | `… ps` and check that `worker` is running. `… restart worker` restarts only ShootSpot's worker                                                   |
| Reports open > 72 h                     | Moderation target missed                           | Admin → Reports: hide, remove or dismiss, always with a reason                                                                                   |
| Account deletions overdue               | The deletion sweep is failing (privacy obligation) | `… logs worker`; fix, and the sweep catches up automatically within 15 min                                                                       |

## Common situations

**API down (`/ready` not ok):**

1. `… ps`
2. `… logs --tail 50 api db s3`
3. `… up -d` starts anything that stopped.
4. If it was a bad deploy, roll back: snapshot rollback plus the previous image tag ([truenas-deployment.md](truenas-deployment.md#rollback)).

**A member reports a stolen or compromised account:** Admin → Users → **Sign out everywhere** (needs a reason). They sign in again with an email code. Codes go only to their inbox.

**Harmful or illegal location:**

1. Admin → open the record → **Remove**, with a reason. It's audited.
2. If there's an immediate safety risk (private home, dangerous access), remove first and review afterwards.

**Copyright claim:** hide the record (reason: "copyright claim"). Ask the claimant for proof by email, then remove it or restore it. Keep the email thread.

**Personal-data request (GDPR):**

- **Access/export:** the member can do it in the app (Settings → Request my data).
- **Erasure:** Settings → Delete account (7-day grace period).
- **By email:** verify the requester owns the account email, then act in the admin console and record the action.

**Suspected security breach:**

1. Revoke all admin sessions: Admin → Users → owner → **Sign out everywhere**.
2. Rotate secrets in `runtime/compose/.env` and run `up -d`. Read F6 in [security-review.md](../security-review.md) first.
3. Take a ZFS snapshot to preserve evidence.
4. Under GDPR, notify the supervisory authority within 72 h if personal data is at risk. Get counsel involved.

## Support contacts (to fill in before launch)

| What                              | Who / where                      |
| --------------------------------- | -------------------------------- |
| Member support email              | _support@<domain>, HANDWORK 2.3_ |
| Privacy / data protection contact | _privacy@<domain>_               |
| Copyright / abuse reports         | _abuse@<domain>_                 |
| Counsel                           | _HANDWORK 4.1_                   |
