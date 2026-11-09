#!/usr/bin/env bash
# Runs ON THE NAS, as root (sudo). Started by tools/nas-deploy.sh; can also be run by hand:
#   sudo bash /mnt/Gaia/04_DEV/_personal/shootspot/shared/builds/deploy-remote.sh <tar> <sha256> <tag> <service...>
#
# Touches only the `shootspot` compose project, the shootspot-* images and datasets
# (other apps run on this NAS). Never restarts Docker, never prunes, no wildcards on shared paths.
set -euo pipefail

S=/mnt/Gaia/04_DEV/_personal/shootspot
B=$S/shared/builds
R=$S/runtime/compose
F=$R/docker-compose.yml
P=(docker compose -p shootspot -f "$F")
ALLOWED=(api worker admin web backup)

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\033[31mSTOP: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run with sudo"
[ $# -ge 4 ] || die "usage: deploy-remote.sh <tar> <sha256> <tag> <service...>"
TAR=$1 SUM=$2 TAG=$3; shift 3
SERVICES=("$@")
for s in "${SERVICES[@]}"; do
  [[ " ${ALLOWED[*]} " == *" $s "* ]] || die "unknown service '$s' (allowed: ${ALLOWED[*]})"
done
[[ "$TAR" == shootspot-*.tar && "$TAR" != */* ]] || die "tar must be a file name in $B"

# ---- 1. read-only checks -------------------------------------------------------------------
say "1/6 Checks (read-only)"
[ -f "$B/$TAR" ] || die "$B/$TAR not found"
[ -f "$F" ] || die "$F not found"
got=$(sha256sum "$B/$TAR" | cut -d' ' -f1)
[ "$got" = "$SUM" ] || die "hash mismatch: got $got, want $SUM (file damaged or still copying)"
echo "hash ok  $got"
env_get() { sed -n "s/^$1=//p" "$R/.env" | tail -1; }
port() { local v; v=$(env_get "$1"); echo "${v:-$2}"; }
LAN_IP=$(env_get LAN_IP); [ -n "$LAN_IP" ] || die "LAN_IP missing in .env"
"${P[@]}" ps --format '{{.Service}} {{.Status}}'
df -h "$S" | tail -1

# The stack file: install the new one only after showing the difference and asking.
if [ -f "$B/docker-compose.yml" ] && ! cmp -s "$B/docker-compose.yml" "$F"; then
  say "The stack file (docker-compose.yml) changed:"
  diff -u "$F" "$B/docker-compose.yml" || true
  read -r -p "Install the new stack file? [y/N] " ok
  if [ "$ok" = y ]; then
    cp -p "$F" "$F.bak-$(date +%Y%m%d-%H%M)"
    install -m 600 -o root -g root "$B/docker-compose.yml" "$F"
    echo "installed (backup kept next to it)"
  else
    echo "kept the current stack file"
  fi
fi

# ---- 2. safety nets ------------------------------------------------------------------------
say "2/6 Snapshot and rollback tags"
STAMP=$(date +%Y%m%d-%H%M)
zfs snapshot -r "Gaia/04_DEV/shootspot-runtime@pre-deploy-$STAMP"
echo "snapshot Gaia/04_DEV/shootspot-runtime@pre-deploy-$STAMP"
for s in "${SERVICES[@]}"; do
  if docker image inspect "shootspot-$s:latest" >/dev/null 2>&1; then
    docker tag "shootspot-$s:latest" "shootspot-$s:rollback"
    echo "shootspot-$s:latest -> shootspot-$s:rollback"
  fi
done

# ---- 3. load -------------------------------------------------------------------------------
say "3/6 Load images"
docker load -i "$B/$TAR"

# ---- 4. migrations (only when the API or the worker changes) -------------------------------
if [[ " ${SERVICES[*]} " == *" api "* || " ${SERVICES[*]} " == *" worker "* ]]; then
  say "4/6 Database migrations"
  "${P[@]}" run --rm migrate
else
  say "4/6 Database migrations: not needed"
fi

# ---- 5. restart only the named services ----------------------------------------------------
say "5/6 Restart: ${SERVICES[*]}"
"${P[@]}" up -d --no-deps "${SERVICES[@]}"

# ---- 6. verify -----------------------------------------------------------------------------
say "6/6 Verify"
check() { # name url
  local code=000
  for _ in $(seq 1 30); do
    code=$(curl -sL -o /dev/null -w '%{http_code}' "$2" || true)
    [ "$code" = 200 ] && break
    sleep 2
  done
  printf '%-7s %s  %s\n' "$1" "$code" "$2"
  [ "$code" = 200 ]
}
fail=0
for s in "${SERVICES[@]}"; do
  case $s in
    api) check api "http://$LAN_IP:$(port API_PORT 4400)/ready" || fail=1 ;;
    admin) check admin "http://$LAN_IP:$(port ADMIN_PORT 4401)/" || fail=1 ;;
    web) check web "http://$LAN_IP:$(port WEB_PORT 4404)/sign-in" || fail=1 ;;
  esac
done
"${P[@]}" ps --format '{{.Service}} {{.Status}}'
docker stats --no-stream --format '{{.Name}} {{.MemUsage}}' | grep '^shootspot-' || true

# Keep each image's current and previous tag only (by tag; never prune: untagged images here
# belong to other apps).
for s in "${SERVICES[@]}"; do
  docker images "shootspot-$s" --format '{{.Tag}}' |
    grep -vxE "latest|rollback|rollback-.*|$TAG|<none>" | tail -n +2 |
    while read -r old; do docker image rm "shootspot-$s:$old" >/dev/null && echo "removed shootspot-$s:$old"; done
done

say "Rollback if needed"
for s in "${SERVICES[@]}"; do echo "sudo docker tag shootspot-$s:rollback shootspot-$s:latest"; done
echo "sudo docker compose -p shootspot -f $F up -d --no-deps ${SERVICES[*]}"
echo "(database changes: sudo zfs rollback -r Gaia/04_DEV/shootspot-runtime@pre-deploy-$STAMP, with the stack stopped)"

[ $fail = 0 ] || die "a health check failed: see above, and roll back if the site is broken"
say "Deployed $TAG: ${SERVICES[*]}"
