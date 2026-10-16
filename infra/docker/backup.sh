#!/bin/sh
# Nightly backup for the NAS stack (docs/runbooks/backup-restore.md).
#  1. pg_dump (custom format) into /backups/postgres, keep 14 days
#  2. if RESTIC_REPOSITORY is set: encrypted off-site copy of the dumps + photo store (B2 EU), keep 35 days
#  3. heartbeat rows in ops_heartbeats so the admin summary and alert emails see failures
# Usage: backup.sh            → wait for BACKUP_AT (HH:MM, NAS local time) every day
#        backup.sh now        → run once immediately (manual / rehearsal)
set -u
: "${BACKUP_AT:=03:15}"
export PGPASSWORD="${POSTGRES_PASSWORD:?}"
PSQL="psql -h db -U shootspot -d shootspot -v ON_ERROR_STOP=1 -q"

heartbeat() {
  $PSQL -c "insert into ops_heartbeats (name, ok_at, detail) values ('$1', now(), '$2')
            on conflict (name) do update set ok_at = now(), detail = excluded.detail" || true
}

run_once() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  out=/backups/postgres/shootspot-$stamp.dump
  echo "[backup] pg_dump → $out"
  if pg_dump -h db -U shootspot -d shootspot -Fc -f "$out.part" && mv "$out.part" "$out"; then
    find /backups/postgres -name 'shootspot-*.dump' -mtime +14 -delete
    heartbeat pg_dump "$(du -h "$out" | cut -f1) $(basename "$out")"
  else
    rm -f "$out.part"
    echo "[backup] pg_dump FAILED"
    return 1
  fi

  if [ -n "${RESTIC_REPOSITORY:-}" ]; then
    echo "[backup] restic → $RESTIC_REPOSITORY"
    restic cat config >/dev/null 2>&1 || restic init || return 1
    if restic backup --tag nightly --host shootspot-nas /backups/postgres /data/seaweedfs \
      && restic forget --tag nightly --host shootspot-nas --keep-daily 35 --prune; then
      heartbeat offsite "$(restic snapshots --latest 1 --compact 2>/dev/null | tail -n 3 | head -n 1)"
    else
      echo "[backup] restic FAILED"
      return 1
    fi
  fi
  echo "[backup] done"
}

if [ "${1:-}" = "now" ]; then
  run_once
  exit $?
fi

echo "[backup] scheduler started; daily at $BACKUP_AT"
last=""
while true; do
  today=$(date +%F)
  if [ "$(date +%H:%M)" = "$BACKUP_AT" ] && [ "$last" != "$today" ]; then
    run_once || echo "[backup] run failed; the alert check will report it"
    last=$today
  fi
  sleep 30
done
