#!/usr/bin/env bash
# ShootSpot: connect the nightly backup to Backblaze B2 (HANDWORK 2.5, D-27).
# Run on the NAS:  bash /mnt/Gaia/04_DEV/_personal/shootspot/shared/builds/b2-setup.sh
# Touches only ShootSpot's runtime/compose/.env and the `backup` service. Secrets are typed here,
# stored root-only (600), never printed, except the restic password, shown once for your vault.
set -euo pipefail
R=/mnt/Gaia/04_DEV/_personal/shootspot/runtime/compose
F=$R/docker-compose.yml
ENDPOINT=s3.eu-central-003.backblazeb2.com

read -r -p 'Bucket name: ' BUCKET
read -r -p 'keyID: ' KID
read -r -s -p 'applicationKey (hidden): ' KEY; echo
[ -n "$BUCKET" ] && [ -n "$KID" ] && [ -n "$KEY" ] || { echo 'All three values are needed.'; exit 1; }

set_kv() { # replace the line if present, else append
  if sudo grep -q "^$1=" "$R/.env"; then sudo sed -i "s|^$1=.*|$1=$2|" "$R/.env"
  else printf '%s=%s\n' "$1" "$2" | sudo tee -a "$R/.env" >/dev/null; fi
}

# Never replace an existing restic password: that would lock us out of earlier snapshots.
NEW_PW=0
if sudo grep -q '^RESTIC_PASSWORD=.\+' "$R/.env"; then
  echo 'RESTIC_PASSWORD already set: keeping it.'
else
  set_kv RESTIC_PASSWORD "$(openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-40)"; NEW_PW=1
fi
set_kv RESTIC_REPOSITORY "s3:https://$ENDPOINT/$BUCKET/shootspot"
set_kv B2_KEY_ID "$KID"
set_kv B2_APPLICATION_KEY "$KEY"
unset KEY KID
sudo chmod 600 "$R/.env"
echo 'Saved to .env:'; sudo grep -o '^\(RESTIC_REPOSITORY\|B2_KEY_ID\|B2_APPLICATION_KEY\|RESTIC_PASSWORD\)=' "$R/.env"

echo '--- Restarting only the backup service with the new settings'
sudo docker compose -p shootspot -f "$F" up -d backup
echo '--- First backup now (database dump + encrypted off-site copy)'
sudo docker compose -p shootspot -f "$F" run --rm --no-deps backup now
echo '--- Off-site snapshots'
sudo docker compose -p shootspot -f "$F" run --rm --no-deps --entrypoint restic backup snapshots

if [ "$NEW_PW" = 1 ]; then
  echo
  echo '=== SAVE THIS PASSWORD IN YOUR PASSWORD MANAGER NOW (shown once) ==='
  sudo grep '^RESTIC_PASSWORD=' "$R/.env" | cut -d= -f2-
  echo '=== Without it the off-site backup cannot be read. ==='
fi
