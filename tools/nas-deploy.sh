#!/usr/bin/env bash
# Build ShootSpot server images and deploy them to the TrueNAS in one go.
#
#   tools/nas-deploy.sh web              # one service
#   tools/nas-deploy.sh api worker       # several (migrations run automatically when api is included)
#   tools/nas-deploy.sh all              # api worker admin web backup
#   tools/nas-deploy.sh --build-only web # build and copy to the share, print the NAS command
#
# Runs on macOS, or Windows in Git Bash. Builds linux/amd64 images from the current commit, saves
# them to the server share, then SSHes to the NAS and runs infra/nas/scripts/deploy-remote.sh
# with sudo (you type the NAS password once). The NAS side is guarded: hash check, ZFS snapshot,
# rollback tags, restarts only the named services, health checks.
#
# Env: NAS_HOST (default: truenas, from ~/.ssh/config), SHARE (the share's builds folder).
set -euo pipefail

ALL=(api worker admin web backup)
NAS_HOST=${NAS_HOST:-truenas}
NAS_BUILDS=/mnt/Gaia/04_DEV/_personal/shootspot/shared/builds
if [ -z "${SHARE:-}" ]; then
  case "$(uname -s)" in
    Darwin) SHARE=/Volumes/Gaia/04_DEV/_personal/shootspot/shared/builds ;;
    MINGW* | MSYS* | CYGWIN*) SHARE=/x/04_DEV/_personal/shootspot/shared/builds ;;
    *) echo "set SHARE to the share's shared/builds folder" >&2; exit 1 ;;
  esac
fi

die() { printf '\033[31mSTOP: %s\033[0m\n' "$*" >&2; exit 1; }
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
sha256() { if command -v sha256sum >/dev/null; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

BUILD_ONLY=0
SERVICES=()
for a in "$@"; do
  case $a in
    --build-only) BUILD_ONLY=1 ;;
    all) SERVICES+=("${ALL[@]}") ;;
    -h | --help) sed -n '2,15p' "$0"; exit 0 ;;
    *) [[ " ${ALL[*]} " == *" $a "* ]] || die "unknown service '$a' (use: ${ALL[*]} or all)"; SERVICES+=("$a") ;;
  esac
done
[ ${#SERVICES[@]} -gt 0 ] || die "name what to deploy: ${ALL[*]} or all (see --help)"

cd "$(git rev-parse --show-toplevel)"
[ -d "$SHARE" ] || die "share not mounted: $SHARE"

# Images are tagged with the commit, so the commit must be what gets built.
dirty=$(git status --porcelain -- apps/web apps/admin services packages infra pnpm-lock.yaml package.json)
[ -z "$dirty" ] || die "uncommitted changes in server code; commit first:
$dirty"
git fetch -q origin 2>/dev/null || true
if [ -n "$(git rev-list '@{u}..HEAD' 2>/dev/null)" ]; then
  echo "note: HEAD is not pushed yet (deploying anyway; push afterwards)"
fi

SHA=$(git rev-parse --short HEAD)
TAG=$SHA
NAME="shootspot-$(IFS=-; echo "${SERVICES[*]}")-$SHA.tar"
[ ${#SERVICES[@]} -eq ${#ALL[@]} ] && NAME="shootspot-images-$SHA.tar"

say "Build ${SERVICES[*]} at $SHA (linux/amd64)"
IMAGES=()
for s in "${SERVICES[@]}"; do
  docker build --platform linux/amd64 -q -f infra/docker/Dockerfile --target "$s" \
    -t "shootspot-$s:latest" -t "shootspot-$s:$TAG" . >/dev/null
  echo "built shootspot-$s:$TAG"
  IMAGES+=("shootspot-$s:latest" "shootspot-$s:$TAG")
done

say "Copy to the share"
docker save -o "$SHARE/$NAME" "${IMAGES[@]}"
cp infra/nas/scripts/deploy-remote.sh "$SHARE/deploy-remote.sh"
cp infra/nas/docker-compose.yml "$SHARE/docker-compose.yml"
SUM=$(sha256 "$SHARE/$NAME")
echo "$SUM  $NAME" >"$SHARE/$NAME.sha256"
echo "$NAME  $SUM"

# Keep the newest three image files on the share; remove older ones by name.
# shellcheck disable=SC2010,SC2012
ls -t "$SHARE" | grep -E '^shootspot-.+\.tar$' | tail -n +4 | while read -r old; do
  rm -f -- "$SHARE/$old" "$SHARE/$old.sha256" && echo "removed old $old"
done

REMOTE="sudo bash $NAS_BUILDS/deploy-remote.sh $NAME $SUM $TAG ${SERVICES[*]}"
if [ $BUILD_ONLY = 1 ]; then
  say "Built. On the NAS (ssh $NAS_HOST), run:"
  echo "$REMOTE"
  exit 0
fi

say "Deploy on the NAS ($NAS_HOST): enter the NAS password when asked"
ssh -t "$NAS_HOST" "$REMOTE"
