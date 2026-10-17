#!/usr/bin/env python3
"""List or add public hostnames on the shared `TrueNas` Cloudflare Tunnel (D-33).

The tunnel is remotely managed (its connector on the NAS runs with a token), so routes live in
Cloudflare, not in a file. The tunnel also serves the owner's other sites: this script only ever
APPENDS rules before the catch-all, and aborts if any existing rule would change.

Credentials: the API token inside `~/.cloudflared/cert.pem` (from `cloudflared tunnel login` on the
Mac). It can edit this account's tunnels and DNS in the expose-u.com zone only. It is read from the
file and never printed.

Usage (macOS needs SSL_CERT_FILE=/etc/ssl/cert.pem with python.org builds):
  python3 infra/cloudflare/tunnel-hostnames.py list
  python3 infra/cloudflare/tunnel-hostnames.py add shootspot-api.expose-u.com=http://192.168.178.146:4400 [...]

`add` saves the previous config to ./tunnel-config-<version>.json first (keep it out of git), adds
the rules, verifies the existing ones are unchanged, and creates proxied CNAMEs to the tunnel.
"""

import base64
import copy
import json
import os
import sys
import urllib.error
import urllib.request

TUNNEL_ID = '035a6e09-a040-45db-9a75-c2281879ba6d'  # "TrueNas"
API = 'https://api.cloudflare.com/client/v4'


def credentials():
    pem = open(os.path.expanduser('~/.cloudflared/cert.pem')).read()
    body = pem.split('-----BEGIN ARGO TUNNEL TOKEN-----')[1].split('-----END ARGO TUNNEL TOKEN-----')[0]
    data = json.loads(base64.b64decode(''.join(body.split())))
    return data['apiToken'], data['accountID'], data['zoneID']


TOKEN, ACCOUNT, ZONE = credentials()
CONFIG_PATH = f'/accounts/{ACCOUNT}/cfd_tunnel/{TUNNEL_ID}/configurations'


def call(method, path, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return json.load(e)


def get_config():
    res = call('GET', CONFIG_PATH)
    if not res['success']:
        sys.exit(f'read failed: {res["errors"]}')
    return res['result']


def show(result):
    print(f'tunnel config version {result["version"]}:')
    for rule in result['config']['ingress']:
        print(f'  {rule.get("hostname") or "(catch-all)"} -> {rule["service"]}')


def add(pairs):
    new = [tuple(p.split('=', 1)) for p in pairs]
    current = get_config()
    config = current['config']
    ingress = config['ingress']
    if 'hostname' in ingress[-1]:
        sys.exit('last rule is not the catch-all; aborting')
    names = {h for h, _ in new}
    if names & {r.get('hostname') for r in ingress}:
        sys.exit('a hostname is already routed; aborting')
    if not all(h.endswith('.expose-u.com') for h in names):
        sys.exit('the token only manages DNS for expose-u.com; aborting')

    backup = f'tunnel-config-{current["version"]}.json'
    json.dump(current, open(backup, 'w'), indent=2)
    print(f'previous config saved to {backup}')

    updated = copy.deepcopy(config)
    updated['ingress'] = (
        ingress[:-1] + [{'hostname': h, 'service': s, 'originRequest': {}} for h, s in new] + [ingress[-1]]
    )
    res = call('PUT', CONFIG_PATH, {'config': updated})
    if not res['success']:
        sys.exit(f'update failed: {res["errors"]}')

    after = get_config()
    if [r for r in after['config']['ingress'] if r.get('hostname') not in names] != ingress:
        sys.exit(f'EXISTING RULES CHANGED: restore {backup} now')
    show(after)

    for host, _ in new:
        if call('GET', f'/zones/{ZONE}/dns_records?name={host}')['result']:
            print(f'DNS {host}: exists, left alone')
            continue
        res = call('POST', f'/zones/{ZONE}/dns_records', {
            'type': 'CNAME',
            'name': host,
            'content': f'{TUNNEL_ID}.cfargotunnel.com',
            'proxied': True,
            'comment': 'ShootSpot public endpoint (D-33)',
        })
        print(f'DNS {host}: {"created" if res["success"] else res["errors"]}')


if __name__ == '__main__':
    if len(sys.argv) >= 2 and sys.argv[1] == 'list':
        show(get_config())
    elif len(sys.argv) >= 3 and sys.argv[1] == 'add':
        add(sys.argv[2:])
    else:
        sys.exit(__doc__)
