# Your to-do list

These are the steps only you can do: accounts, phones, the NAS, payments and legal. Tick a box when a step is done, or just tell Claude, and the list will be kept up to date.

## How we work

- 💻 **Windows PC**: main development, Android builds, and NAS commands.
- 🍎 **Mac**: iPhone builds and tests. The two machines talk through [state/windows-macos-handoff.md](../state/windows-macos-handoff.md).
- 🗄️ **TrueNAS SCALE** (`alan@172.16.1.1`): used only once the phones need a real backend. You open the SSH session; Claude gives you the commands one block at a time and explains each one.

**Legend:** ⏱ how long it takes · 💶 costs money · 🔁 send Claude the result

---

## ▶ Step 1 — Do now (camera test)

### 1.1 Log in to Expo on the Windows PC ⏱ 1 min

Your Expo account exists, but this PC isn't signed in yet. In a terminal in the project folder, run:

```powershell
cd apps\mobile
npx eas-cli@latest login
```

Type your Expo username and password. Then tell Claude, and Claude will link the project to your account (`eas init`).

- [ ] Logged in

### 1.2 Install the test app on an Android phone ⏱ 20 min (mostly waiting)

1. Run `pnpm --filter @shootspot/mobile build:dev:android`. The build runs in the cloud, takes about 10–15 minutes, and prints a link.
2. Open that link on the Android phone and install the app. Allow "Install unknown apps" if the phone asks.
3. On the PC, run `pnpm --filter @shootspot/mobile start`. Keep the phone and PC on the same Wi-Fi.
4. Open **ShootSpot** on the phone. It connects to the PC and loads the camera.

- [ ] Android test app installed

### 1.3 Build the iPhone version on the Mac 🍎 ⏱ 30 min

Follow the request in [state/windows-macos-handoff.md](../state/windows-macos-handoff.md). It covers installing Xcode, plugging in the iPhone, and running one command. A free Apple ID is enough for testing on your own iPhone. The paid Apple Developer Program is needed later, for TestFlight and the App Store (step 4.2).

- [ ] iPhone test app installed

### 1.4 Run the camera test 🔁 ⏱ 30 min, outdoors

Go through the [camera test plan](runbooks/camera-spike-test-plan.md) on each phone, fill in the results table, and send it to Claude. The Mac side saves its results in `state/reports/`. Bring a compass app for the direction test.

- [ ] Android results sent
- [ ] iPhone results sent

### 1.5 Turn on GitHub security ⏱ 1 min

On GitHub, open the repo → **Settings → Code security**. Turn on **Secret scanning**, **Push protection** and **Dependabot alerts**.

- [ ] Done

### 1.6 Make ai-memory work in this project 🔁 ⏱ 10 min

This PC has **no ai-memory installed**: no program, no Claude connection, and nothing running. It's probably installed only on the Mac. To share one memory between Windows and Mac, both need to point at **one server**. Pick one option and tell Claude which:

- **A (recommended):** run the ai-memory server on the TrueNAS with a password, then connect both the PC and the Mac to it. Claude will give you the NAS commands.
- **B:** install it separately on each machine. Simpler, but the two machines won't share memories.

For either option, the Windows install is this (PowerShell, no admin needed):

```powershell
irm https://github.com/akitaonrails/ai-memory/releases/latest/download/install.ps1 | iex
ai-memory setup
```

Then restart VS Code and run `ai-memory status`.

- [ ] Option chosen: \_\_\_
- [ ] `ai-memory status` works on Windows
- [ ] `ai-memory status` works on Mac

---

## ▶ Step 2 — Before the NAS goes live

### 2.1 Run the NAS check commands 🔁 ⏱ 5 min

These commands only read information; they change nothing. Connect with `ssh alan@172.16.1.1`, paste this block, and send Claude the output:

```sh
cat /etc/version; echo; uname -m; nproc; free -h
zpool list -o name,size,alloc,free,health
sudo docker version --format 'docker {{.Server.Version}}'
sudo docker compose version
```

- [ ] Output sent

### 2.2 Use an SSH key instead of a password ⏱ 5 min

If `ssh alan@172.16.1.1` asks for a password, tell Claude, and you'll get the steps to set up a key.

- [ ] SSH key works

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
- [ ] **3.5 Logo / app icon.** Send yours, or approve one Claude proposes.
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
