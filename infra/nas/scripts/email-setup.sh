#!/usr/bin/env bash
# ShootSpot: send real sign-in emails through Brevo SMTP (HANDWORK 3.2, D-26) and stop Mailpit
# (security review F1). Run on the NAS:
#   bash /mnt/Gaia/04_DEV/_personal/shootspot/shared/builds/email-setup.sh
# Touches only ShootSpot's runtime/compose/.env and its api/worker/mail containers. The SMTP key
# is typed here (hidden), stored root-only (600) and never printed.
set -euo pipefail
R=/mnt/Gaia/04_DEV/_personal/shootspot/runtime/compose
F=$R/docker-compose.yml

read -r -p 'Brevo SMTP login (e.g. 9abc12@smtp-brevo.com): ' LOGIN
read -r -s -p 'Brevo SMTP key (hidden): ' KEY; echo
read -r -p 'Verified sender email (e.g. you@gmail.com): ' FROM
read -r -p 'Your email, to receive a test code: ' TO
[ -n "$LOGIN" ] && [ -n "$KEY" ] && [ -n "$FROM" ] && [ -n "$TO" ] || { echo 'All four values are needed.'; exit 1; }

# The login contains "@": URL-encode user and key for the SMTP URL.
enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=""))' "$1"; }
SMTP_URL="smtp://$(enc "$LOGIN"):$(enc "$KEY")@smtp-relay.brevo.com:587"
unset KEY

set_kv() { # replace the line if present, else append; '|' never appears in these values
  if sudo grep -q "^$1=" "$R/.env"; then sudo sed -i "s|^$1=.*|$1=$2|" "$R/.env"
  else printf '%s=%s\n' "$1" "$2" | sudo tee -a "$R/.env" >/dev/null; fi
}
set_kv SMTP_URL "$SMTP_URL"
set_kv MAIL_FROM "ShootSpot <$FROM>"
unset SMTP_URL
sudo chmod 600 "$R/.env"
echo 'Saved to .env:'; sudo grep -o '^\(SMTP_URL=smtp://[^:]*\|MAIL_FROM=.*\)' "$R/.env" | sed 's/%40/@/'

echo '--- Recreating api and worker with the new mail settings'
sudo docker compose -p shootspot -f "$F" up -d api worker
for i in $(seq 1 30); do curl -sf http://192.168.178.146:4400/ready >/dev/null && break; sleep 2; done
curl -s http://192.168.178.146:4400/ready; echo

echo "--- Sending a real sign-in code to $TO"
curl -s -o /dev/null -w 'request: HTTP %{http_code}\n' -X POST \
  -H 'content-type: application/json' -H 'expo-origin: shootspot://' \
  -d "{\"email\":\"$TO\",\"type\":\"sign-in\"}" \
  http://192.168.178.146:4400/api/auth/email-otp/send-verification-otp
sleep 3
echo '--- API log (mail errors would show here)'
sudo docker compose -p shootspot -f "$F" logs --since 2m api 2>&1 | grep -iE 'mail|smtp|error' | tail -5 || echo '(no mail errors)'
echo
echo "Check $TO (and spam) for '<6 digits> is your ShootSpot code'."
echo 'If it arrived, stop Mailpit with:'
echo "  sudo docker compose -p shootspot -f $F --profile devmail stop mail"
