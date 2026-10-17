# Your to-do list

These are the steps only you can do: accounts, phones, the NAS, payments and legal. Tick a box when a step is done, or just tell Claude, and the list will be kept up to date.

## How we work

- 💻 **Windows PC**: main development, Android builds, and NAS commands.
- 🍎 **Mac**: iPhone builds and tests. The two machines talk through [state/windows-macos-handoff.md](../state/windows-macos-handoff.md).
- 🗄️ **TrueNAS SCALE** (`alan@172.16.1.1`): used only once the phones need a real backend. You open the SSH session; Claude gives you the commands one block at a time and explains each one.

**Legend:** ⏱ how long it takes · 💶 costs money · 🔁 send Claude the result

---

## ▶ Step 1 — Do now (camera test)

### 1.1 Log in to Expo on the Windows PC ✅

Logged in as `expose.u`. The project is linked at [expo.dev/accounts/expose.u/projects/shootspot](https://expo.dev/accounts/expose.u/projects/shootspot).

- [x] Logged in and project linked

### 1.2 Install the test app on an Android phone ⏱ 20 min (mostly waiting)

1. Run `pnpm --filter @shootspot/mobile build:dev:android`. The build runs in the cloud, takes about 10–15 minutes, and prints a link.
2. Open that link on the Android phone and install the app. Allow "Install unknown apps" if the phone asks.
3. On the PC, run `pnpm --filter @shootspot/mobile start`. Keep the phone and PC on the same Wi-Fi.
4. Open **ShootSpot** on the phone. It connects to the PC and loads the camera.

- [x] Android test app installed

### 1.3 Build the iPhone version on the Mac 🍎 ⏱ 30 min

Follow the request in [state/windows-macos-handoff.md](../state/windows-macos-handoff.md). It covers installing Xcode, plugging in the iPhone, and running one command. A free Apple ID is enough for testing on your own iPhone. The paid Apple Developer Program is needed later, for TestFlight and the App Store (step 4.2).

- [x] Install an Xcode that supports iOS 27.2 (Xcode 27.1 installed)
- [x] iPhone test app installed

### 1.4 Run the camera test 🔁 ⏱ 30 min, outdoors

Go through the [camera test plan](runbooks/camera-spike-test-plan.md) on each phone, fill in the results table, and send it to Claude. The Mac side saves its results in `state/reports/`. Bring a compass app for the direction test.

- [ ] Android results sent
- [ ] iPhone results sent

### 1.5 Turn on GitHub security ⏱ 1 min

On GitHub, open the repo → **Settings → Code security**. Turn on **Secret scanning**, **Push protection** and **Dependabot alerts**.

- [ ] Done

### 1.6 Make ai-memory work in this project 🔁 ⏱ 10 min

**Windows: done.** ai-memory 3.1.0 is installed, connected to Claude Code only (MCP, hooks and skills), runs at logon, and is protected by a token. **Restart VS Code once** so new sessions get captured.

**Next:** today the Windows PC and the Mac would each keep a separate memory. To share one, the plan is to move the server to the NAS (`runtime/ai-memory` in [server-folders.md](runbooks/server-folders.md)) and point both machines at it. That happens with the NAS setup in Step 2.

- [x] `ai-memory status` works on Windows
- [ ] Restarted VS Code
- [ ] Mac connected (after the NAS server is up)

### 1.7 Test the real app on your phones (Phase 3) 🔁 ⏱ 45 min

The app now has sign-in, the new camera, the map pin, notes and publishing. It contains new native parts, so **both phones need a fresh build**.

**One-time setup on the Windows PC:**

1. Let phones reach this PC. In an **admin** PowerShell, run:
   ```powershell
   New-NetFirewallRule -DisplayName "ShootSpot dev" -Direction Inbound -Protocol TCP -LocalPort 4000,8081,8333 -InterfaceAlias "2.5Gb" -RemoteAddress LocalSubnet -Profile Any -Action Allow
   ```
2. In `services/api/.env`, set `S3_PUBLIC_ENDPOINT=http://192.168.178.63:8333`.
3. Copy `apps/mobile/.env.example` to `apps/mobile/.env`.

**Each test session:** run `pnpm dev:infra`, `pnpm dev:api`, `pnpm dev:worker` and `pnpm --filter @shootspot/mobile start`. The app now uses the **NAS backend** (`http://192.168.178.146:4400`); sign-in codes appear at http://192.168.178.146:4403. To go back to the PC backend, set `apps/mobile/.env` to the PC address and run the local services.

**Builds:**

- **Android:** run `pnpm --filter @shootspot/mobile build:dev:android` and install the new APK. Until there's a Google Maps key (3.4) and a new build, Android shows "Map coming soon" on the Map tab and a GPS/search-only pin screen. Everything else works without it.
- **iPhone:** the Mac follows the request in the handoff file.

**Test:** sign in → onboarding → capture (sideways and upright) → pin → notes → publish, and check the status screen shows **Published**. Send Claude the results.

- [ ] Firewall rule added
- [ ] Android: published a location
- [ ] iPhone: published a location
- [ ] Compass test results sent (deferred to the end, Phase 5)

---

## ▶ Step 2 — Before the NAS goes live

### 2.1 Check the NAS 🔁 ⏱ 5 min

These commands only read information; nothing is changed.

**Step A: connect first.** Linux commands don't work in Windows PowerShell; they have to run on the NAS. In a terminal on the PC, type:

```powershell
ssh alan@172.16.1.1
```

Log in. When the prompt changes to something like `alan@truenas:~$`, you are on the NAS.

**Step B: paste this block** at the NAS prompt and send Claude everything it prints:

```sh
cat /etc/version; echo; uname -m; nproc; free -h
sudo docker version --format 'docker {{.Server.Version}}'
sudo docker compose version
zfs list -o name,mountpoint,acltype,aclmode,used,avail | grep -E 'NAME|Gaia/04_DEV'
ls -la /mnt/Gaia/04_DEV/_personal/
id; getent passwd apps
sudo midclt call sharing.smb.query | python3 -c 'import json,sys; [print(s["name"], "->", s["path"]) for s in json.load(sys.stdin)]'
```

**Step C:** type `exit` to leave the NAS.

Claude uses the output to create the project folders in [server-folders.md](runbooks/server-folders.md) with the correct permissions.

- [x] Output sent
- [x] Project folders created (datasets `Gaia/04_DEV/shootspot-runtime` and `-backups`)
- [x] ShootSpot deployed on the NAS (home network only); see [truenas-deployment.md](runbooks/truenas-deployment.md)

### 2.2 Use an SSH key instead of a password ⏱ 5 min

The NAS only accepts SSH keys, and the PC's key isn't on it yet. The SSH config is already set to use the key `~/.ssh/truenas_windows`.

1. Open the TrueNAS web UI → **Credentials → Users** → **alan** → **Edit**.
2. In **Authorized Keys**, add this line (it's the _public_ key, safe to share) and **Save**:
   ```
   ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDitzoteVttiTIcY5gso5kaqnOFSgx9zrxxFQ3j0qC7B cyrus@Alan
   ```
3. Check that **SSH** is enabled in **System → Services**.
4. On the PC, run `ssh truenas`. You should land on the NAS prompt without a password.

- [x] SSH key works (`ssh truenas`; the passphrase is held by the Windows ssh-agent)

### 2.3 Domain name 💶 ⏱ 10 min

Buy a domain (for example `shootspot.app`) or choose one you already own. The phones use it to reach the app's server, and it also sends the account emails.

- [ ] Domain: \_\_\_

### 2.4 Cloudflare account ⏱ 10 min

Create a free account at cloudflare.com and add your domain. This lets phones reach the NAS **without opening any ports on your router**.

- [ ] Done

### 2.5 Off-site backup storage 💶 ⏱ 10 min

**Chosen: Backblaze B2, EU (D-27).** It holds encrypted copies of the database and photos, a few euros a month.

1. Create an account at backblaze.com. When it asks for a region, pick **EU Central (Amsterdam)**.
2. Go to **Buckets → Create a bucket**: name it e.g. `shootspot-backup-<random>`, **Private**, encryption on.
3. Go to **Application Keys → Add a New Application Key**: allow access to that bucket only, with Read and Write. Copy the **keyID** and **applicationKey**; the key is shown only once.
4. Tell Claude the **bucket name** and the endpoint shown on the bucket page (e.g. `s3.eu-central-003.backblazeb2.com`). **Don't send the key in chat.** Claude gives you a NAS command block that asks for the key and stores it in the root-only `.env`, together with a generated restic password.
5. Save the restic password in your password manager. Without it, the off-site backup can't be read.

- [x] Chosen: Backblaze B2 EU
- [x] Bucket and key created: bucket `shootspot-backup`, EU Central (`s3.eu-central-003.backblazeb2.com`), private, encrypted, lifecycle "keep only the last version"
- [x] Off-site backup running: first snapshot `ba2d921c` on 2026-10-17, then nightly at 03:15 with 35 days kept. Set up with `shared/builds/b2-setup.sh`; the key and restic password are in the NAS `.env`, and the restic password is in your password manager

---

## ▶ Step 3 — Backend and app building (Phases 2–4)

- [x] **3.1 Approve the login system.** Done: email codes via Better Auth inside the API ([ADR 0005](adr/0005-authentication.md)).
- [x] **3.2 Email sender: Brevo (D-26).** Done 2026-10-17, on the free plan:
  - Sign-in codes are sent via Brevo SMTP (login `be94a2001@smtp-brevo.com`). The key is only in the NAS `.env`, set with `infra/nas/scripts/email-setup.sh`.
  - Mailpit is stopped.
  - Brevo blocks SMTP from unknown IPs, and the home IP (Telefonica) changes. On 2026-10-17 sign-in codes stopped (`525 Unauthorized IP`); fixed by authorizing `77.183.215.215` in Brevo → Security → Authorized IPs. **Recommended:** "Deactivate for SMTP keys" there, so the next IP change doesn't block sign-in again. Failed sends now also reach Sentry (shootspot-api).
  - **Later, with the domain:** steps 2 and 4 below switch the sender from `alanxalves@me.com` to `no-reply@<domain>` (DKIM and DMARC, so codes don't land in spam).

  Original steps:

  1. Create a free account at brevo.com.
  2. **Senders, Domains & Dedicated IPs → Domains → Add a domain:** add the DNS records it shows (DKIM, Brevo code, and DMARC if offered) at your DNS host; with Cloudflare, that's under DNS.
  3. **SMTP & API → SMTP:** note the SMTP login and create an SMTP key.
  4. Tell Claude when the domain shows as verified. Claude gives you the NAS block that stores the SMTP key securely and turns off the test inbox. This fixes security finding F1 and is **required before anyone else tests**.

- [x] **3.3 Admin 2-factor.** Done: owner `alanxalves@me.com` signed in on the NAS admin web (`http://192.168.178.146:4401`) with an authenticator.
- [x] **3.4 Google Maps key.** Done 2026-10-16: Google Cloud project `shootspot-0t76lk` (exposeuberlin@gmail.com), key `shootspot-android` restricted to the app and the Maps SDK, a 5/month budget, and `GOOGLE_MAPS_ANDROID_KEY` stored in EAS (Sensitive). Created via Cloud Shell because local `gcloud auth login` fails (Google retired the OAuth client). Steps, for reference or to redo it:
  1. https://console.cloud.google.com → new project `ShootSpot` → link billing (displaying maps in the Android SDK has no usage charge).
  2. **APIs & Services → Library:** enable **Maps SDK for Android**.
  3. **Credentials → Create credentials → API key**, then edit it:
     - Application restriction **Android apps**: package `com.shootspot.app`, SHA-1 `87:2B:59:5F:C5:93:77:D9:10:23:23:86:C4:08:82:B0:EE:7C:1B:14` (the EAS build key), plus SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25` (the standard React Native debug key, so local Windows builds show maps).
     - API restriction: **Maps SDK for Android** only.
  4. **Billing → Budgets & alerts:** a €5/month budget with email alerts.
  5. On expo.dev: **@expose.u/shootspot → Environment variables**, add `GOOGLE_MAPS_ANDROID_KEY` (Sensitive, all environments). Don't paste the key in chat. Tell Claude, who starts a new Android build.
  6. **Later, at Play Store launch:** add the Play App Signing SHA-1 (Play Console → App integrity) to the same key.
- [x] **3.5 Logo / app icon.** Done. Generated from `shared/design/app-icon/Group 15@4x.png`; previews are in `shared/design/app-icon/generated/`. If the logo changes, drop the new export there and ask Claude to re-run `tools/make-icons.mjs`.
- [ ] **3.6 Review the photo tags and note fields** in [02-v1-scope-and-flows.md §3](phase-0/02-v1-scope-and-flows.md#3-scout-record-fields).
- [x] **3.7 Sentry crash reports (D-24).** Done 2026-10-17:
  - Org `exposeu` in the EU region (de.sentry.io), with projects `shootspot-app`, `shootspot-api` and `shootspot-worker`.
  - The app DSN is in EAS (`EXPO_PUBLIC_SENTRY_DSN`, preview and production builds). The API and worker DSNs are in the NAS `.env`, and both sent a verified test event.
  - Privacy hardened 2026-10-17: data scrubber and default scrubbers required, IP addresses not stored, enhanced privacy, 2FA required, shared issues and join requests off, and extra sensitive fields (lat, lon, email, token, authorization).

  Original steps, for reference:
  1. Create an account at sentry.io and choose the **EU (Frankfurt)** data region when asked.
  2. Create 3 projects: `shootspot-api` (Node.js), `shootspot-worker` (Node.js), `shootspot-app` (React Native).
  3. Copy each project's **DSN** (Settings → Client Keys). Claude adds the server DSNs to the NAS `.env`; the app DSN goes in with the next native build.
  4. Under Settings → Security & Privacy, turn on **Data Scrubber** and **Prevent Storing of IP Addresses**.

- [x] **3.8 Load NAS images `43acc49`** (polish round: likes, photo tone). Done 2026-10-17: migration 0006 (`likes`) applied, API healthy.
- [ ] **3.9 Field test away from home over Tailscale (D-30).** Install Tailscale on the phone, sign in to the same tailnet as the NAS, and use the release build (`tools/android-local.ps1 -Release`) on mobile data. Note anything that feels slow, stutters or looks off.
  - [x] Checked 2026-10-17: the NAS Tailscale app (`ix-tailscale-tailscale-1`) advertises only `192.168.178.146/32` (the NAS, nothing else at home), and the Nothing phone reached `http://192.168.178.146:4400/ready` on mobile data.

---

## ▶ Step 4 — Before public launch

- [ ] **4.1 Lawyer review** of the image licence, terms, privacy notice and deletion policy. Drafts are in [03-rights-privacy-data-ownership.md](phase-0/03-rights-privacy-data-ownership.md).
- [x] **4.2 Store accounts** 💶: Apple Developer Program and Google Play Console. Done: both active for more than 6 months (existing apps). The ShootSpot app records come after the polish round and field test.
- [ ] **4.3 Store privacy forms.** Drafted in [store/privacy-declarations.md](store/privacy-declarations.md); you submit them in App Store Connect and Play Console.
- [x] **4.5 Public pages on the docs hub (D-35)**: live at https://docs.alan-design.com/shootspot/ (privacy, terms, image licence, account deletion, getting started, support). Operator line from the expose.u finance portal: "Alan Alves, trading as expose.u (sole proprietorship), Dudenstraße 24, 10965 Berlin, Germany", VAT ID DE461275084. Confirmed by you 2026-10-17 ("Alan Alves" as on the expose-u.com Impressum, not the full legal name, for privacy); the privacy notice and terms link to https://expose-u.com/impressum.
- [x] **4.6 Public HTTPS (D-33)**: two Cloudflare Tunnel hostnames, then Claude's guarded NAS block. Then set the EAS production variable `EXPO_PUBLIC_API_URL` to the HTTPS API address. Details: [public-endpoints.md](runbooks/public-endpoints.md).
  - [x] NAS on `30237a7` (images built on the Mac, deployed 2026-10-17)
  - [x] Tunnel routes and DNS: `shootspot-api.expose-u.com` → `:4400`, `shootspot-media.expose-u.com` → `:4402` (added by the Mac via the Cloudflare API, other sites unchanged)
  - [x] NAS `.env` switched to the public addresses (Block 3, 2026-10-17); `.env.bak-<stamp>` kept
  - [x] EAS production `EXPO_PUBLIC_API_URL=https://shootspot-api.expose-u.com` (set from the Mac, 2026-10-17)
- [ ] **4.7 Sign-in email from your domain**: in Brevo → Senders, Domains → add `expose-u.com` and add its DNS records in Cloudflare (DKIM, DMARC). Then the sender becomes e.g. `ShootSpot <no-reply@expose-u.com>` and codes stop landing in spam. Also in Brevo → Security → Authorized IPs, **Deactivate for SMTP keys**.
- [ ] **4.8 App records**: create ShootSpot in App Store Connect (bundle `com.exposeu.shootspot`; `com.shootspot.app` belongs to another Apple developer, D-36) and Play Console (package `com.shootspot.app`). Claude guides you, then runs the EAS production builds and submissions (TestFlight, Play internal track).
- [ ] **4.9 Review account (D-34)**: just before submitting, Claude gives the NAS block for `REVIEW_EMAIL`/`REVIEW_CODE`; listing and review notes are in [store/listing.md](store/listing.md).
- [ ] **4.4 Pick a cloud host for launch.** The NAS is for testing only and should not be the public production server.

---

## Decisions waiting for you

These are marked _Proposed_ in the [decision record](phase-0/01-decision-record.md). A quick "OK" or a change is enough:

- [ ] Name display (attribution) toggle is per photo and off by default
- [ ] Admin website uses light theme only
- [ ] Dark theme colours
- [ ] 7-day grace period before an account is deleted
- [ ] Pilot targets (speed, upload success, and so on)
