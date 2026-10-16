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

- [ ] Android test app installed

### 1.3 Build the iPhone version on the Mac 🍎 ⏱ 30 min

Follow the request in [state/windows-macos-handoff.md](../state/windows-macos-handoff.md). It covers installing Xcode, plugging in the iPhone, and running one command. A free Apple ID is enough for testing on your own iPhone. The paid Apple Developer Program is needed later, for TestFlight and the App Store (step 4.2).

- [ ] Install an Xcode that supports iOS 27.2. The iPhone runs the iOS 27.2 beta, and Xcode 26.4 can't build to it. You need the matching Xcode 27 beta from developer.apple.com/download
- [ ] iPhone test app installed

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

Choose one: **Backblaze B2** (EU region) or **Hetzner Storage Box**. It costs a few euros a month and holds encrypted copies of the database and photos.

- [ ] Chosen: \_\_\_

---

## ▶ Step 3 — Backend and app building (Phases 2–4)

- [ ] **3.1 Approve the login system.** Claude proposes Zitadel ([why](adr/0005-authentication.md)) and will ask before starting.
- [ ] **3.2 Email sender** ⏱ 15 min. Create an account with Postmark, Brevo or Scaleway, and verify your domain. It sends sign-up and account emails.
- [ ] **3.3 Admin 2-factor.** Have an authenticator app or passkey ready for your admin login.
- [ ] **3.4 Google Maps key** 💶 ⏱ 20 min. Android maps need it. Claude will walk you through the Google Cloud setup, including a spending cap.
- [x] **3.5 Logo / app icon.** Done. Generated from `shared/design/app-icon/Group 15@4x.png`; previews are in `shared/design/app-icon/generated/`. If the logo changes, drop the new export there and ask Claude to re-run `tools/make-icons.mjs`.
- [ ] **3.6 Review the photo tags and note fields** in [02-v1-scope-and-flows.md §3](phase-0/02-v1-scope-and-flows.md#3-scout-record-fields).

---

## ▶ Step 4 — Before public launch

- [ ] **4.1 Lawyer review** of the image licence, terms, privacy notice and deletion policy. Drafts are in [03-rights-privacy-data-ownership.md](phase-0/03-rights-privacy-data-ownership.md).
- [ ] **4.2 Store accounts** 💶: Apple Developer Program (99 USD/year) and Google Play Console (25 USD once). Make them in **your** name, so you own the app.
- [ ] **4.3 Store privacy forms.** Claude drafts the answers and you submit them.
- [ ] **4.4 Pick a cloud host for launch.** The NAS is for testing only and should not be the public production server.

---

## Decisions waiting for you

These are marked _Proposed_ in the [decision record](phase-0/01-decision-record.md). A quick "OK" or a change is enough:

- [ ] Name display (attribution) toggle is per photo and off by default
- [ ] Admin website uses light theme only
- [ ] Dark theme colours
- [ ] 7-day grace period before an account is deleted
- [ ] Pilot targets (speed, upload success, and so on)
