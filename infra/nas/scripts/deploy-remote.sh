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
P=(docker compose -p shootspot -f "$F")  # TAG is exported below, so the images just loaded are used
ALLOWED=(api worker admin web backup)

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf '\033[31mSTOP: %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run with sudo"
[ $# -ge 4 ] || die "usage: deploy-remote.sh <tar> <sha256> <tag> <service...>"
TAR=$1 SUM=$2 TAG=$3; shift 3
# Compose reads TAG from the shell before .env: pin it, so a stale TAG in .env can't win.
export TAG
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
  # Only a runnable (amd64) image is worth keeping as the rollback.
  if [ "$(docker image inspect -f '{{.Architecture}}' "shootspot-$s:latest" 2>/dev/null)" = amd64 ]; then
    docker tag "shootspot-$s:latest" "shootspot-$s:rollback"
    echo "shootspot-$s:latest -> shootspot-$s:rollback"
  fi
done

# ---- 3. load -------------------------------------------------------------------------------
say "3/6 Load images"
docker load -i "$B/$TAR"
# The NAS is x86-64: refuse images built for another CPU (e.g. a Mac build without --platform),
# before anything restarts.
for s in "${SERVICES[@]}"; do
  arch=$(docker image inspect -f '{{.Architecture}}' "shootspot-$s:$TAG")
  [ "$arch" = amd64 ] || die "shootspot-$s:$TAG is built for $arch, not amd64: rebuild with --platform linux/amd64 (nothing was restarted)"
done
echo "all images are amd64"

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

# Tidy tags (by tag; never prune: untagged images here belong to other apps). Tags of images
# that can't run here (not amd64) go; of the rest, keep the current and the newest previous one.
for s in "${SERVICES[@]}"; do
  kept=0
  while read -r old; do
    a=$(docker image inspect -f '{{.Architecture}}' "shootspot-$s:$old")
    if [ "$a" = amd64 ] && [ $kept = 0 ]; then kept=1; continue; fi
    docker image rm "shootspot-$s:$old" >/dev/null && echo "removed shootspot-$s:$old ($a)"
  done < <(docker images "shootspot-$s" --format '{{.Tag}}' | grep -vxE "latest|rollback|rollback-.*|$TAG|<none>")
done

ENV_TAG=$(env_get TAG)
if [ -n "$ENV_TAG" ] && [ "$ENV_TAG" != latest ]; then
  say "Note: .env has TAG=$ENV_TAG"
  echo "Manual 'docker compose up' commands would use that tag, not this deploy. Set it back with:"
  echo "sudo sed -i.bak-\$(date +%Y%m%d-%H%M) 's/^TAG=.*/TAG=latest/' $R/.env"
fi

say "Rollback if needed"
RB=()
for s in "${SERVICES[@]}"; do
  [ "$(docker image inspect -f '{{.Architecture}}' "shootspot-$s:rollback" 2>/dev/null)" = amd64 ] || continue
  echo "sudo docker tag shootspot-$s:rollback shootspot-$s:latest"
  RB+=("$s")
done
if [ ${#RB[@]} -gt 0 ]; then
  echo "sudo TAG=latest docker compose -p shootspot -f $F up -d --no-deps ${RB[*]}"
else
  echo "(no runnable previous images to roll back to)"
fi
echo "(database changes: sudo zfs rollback -r Gaia/04_DEV/shootspot-runtime@pre-deploy-$STAMP, with the stack stopped)"

[ $fail = 0 ] || die "a health check failed: see above, and roll back if the site is broken"
say "Deployed $TAG: ${SERVICES[*]}"
