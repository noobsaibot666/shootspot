# Handwork — tasks only you can do

This is the list of things I can't do from the code: accounts, payments, physical devices, the NAS, legal review, and decisions. Each item says **when** it's needed so nothing blocks us early. Tick items off here, or tell me, and I'll keep the list up to date.

**Working model:** we build and test everything locally on this PC. We deploy to TrueNAS only when a phase needs the backend reachable from phones over the internet. For NAS work, you connect over SSH and I give you the exact commands, one block at a time, with what each one does.

---

## Now: Phase 1 camera spike

| #   | Task                                                                                                                                                                                                           | Why                                                                               | Notes                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | **Create an Expo account** at expo.dev, then run `npx eas-cli@latest login` in `apps/mobile`                                                                                                                   | EAS builds the test app in the cloud; there's no Android Studio or Mac on this PC | Free tier is fine for development builds                                                                                              |
| H2  | **Pick test phones** and tell me the models and OS versions                                                                                                                                                    | The spike must run on real devices (plan §5)                                      | At least one Android and one iPhone. The proposed reference list is in [05-metrics-and-targets.md](phase-0/05-metrics-and-targets.md) |
| H3  | **Android:** run `pnpm --filter @shootspot/mobile build:dev:android`, install the APK from the link EAS gives you, then run `pnpm --filter @shootspot/mobile start` on the PC (phone and PC on the same Wi-Fi) | Runs the camera spike                                                             | Enable "Install unknown apps" for your browser                                                                                        |
| H4  | **iPhone:** join the **Apple Developer Program** (99 USD/year), register the iPhone with `npx eas-cli@latest device:create`, then run `build:dev:ios`                                                          | Installing a development build on an iPhone needs a paid team                     | You can do Android first and postpone this                                                                                            |
| H21 | On GitHub, go to **Settings → Code security** and enable **Secret scanning** and **Push protection**, plus **Dependabot alerts**                                                                               | Catches leaked keys before they land in the repo                                  | Takes 1 minute                                                                                                                        |
| H5  | **Run the camera test plan** in [runbooks/camera-spike-test-plan.md](runbooks/camera-spike-test-plan.md) and send me the filled results table and any screenshots                                              | Phase 1 exit: tested camera prototype                                             | Bring a compass app or a known landmark bearing for the heading test                                                                  |

## Before the first TrueNAS deployment (end of Phase 1 or start of Phase 2)

| #   | Task                                                                                                                                                                     | Notes                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| H6  | Tell me the **TrueNAS edition and version** (SCALE vs CORE; output of `cat /etc/version` or the dashboard), CPU (`uname -m`), and free space on the pool you want to use | **CORE (FreeBSD) can't run our Docker stack.** It would need a Linux VM, or the API would run elsewhere |
| H7  | **Check SSH access** to the NAS from this PC with a key (not a password) and a non-root admin user with sudo                                                             | I'll give you the hardening commands                                                                    |
| H8  | **Register a domain** (e.g. `shootspot.app` or another TLD), or confirm one you own                                                                                      | Used for the API hostname and auth emails                                                               |
| H9  | **Create a Cloudflare account** (free) and add the domain                                                                                                                | Cloudflare Tunnel exposes only the API; no router ports opened (ADR 0004)                               |
| H10 | **Choose an off-site backup target** in the EU: Backblaze B2 (EU region) or Hetzner Storage Box                                                                          | Encrypted restic backups; a few euros a month at pilot scale                                            |

## Phase 2: backend and admin

| #   | Task                                                                                                                             | Notes                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| H11 | Confirm the auth choice ([ADR 0005](adr/0005-authentication.md), Zitadel proposed)                                               | I'll ask before starting                         |
| H12 | Set up a **transactional email sender** (e.g. Postmark, Brevo or Scaleway TEM, all EU-friendly) and verify the domain's SPF/DKIM | Sign-up verification, export and deletion emails |
| H13 | Create an **authenticator app / passkey** for your owner admin account                                                           | Admin MFA is mandatory                           |

## Phase 3–4: mobile V1

| #   | Task                                                                                                                                                                                   | Notes                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| H14 | Create a **Google Cloud project**, enable _Maps SDK for Android_ and _Places API (New)_, create an API key restricted to `com.shootspot.app`, and set a **budget alert and quota cap** | Android maps and place search (ADR 0006)                                              |
| H15 | Provide the **logo / app icon** (or approve one I propose)                                                                                                                             | Store listings need final assets                                                      |
| H16 | Review the proposed **Good-for tags, best-light periods and advanced fields**                                                                                                          | [02-v1-scope-and-flows.md §3](phase-0/02-v1-scope-and-flows.md#3-scout-record-fields) |

## Phase 5: launch hardening

| #   | Task                                                                                                                                                      | Notes                                                                                                                   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| H17 | **Legal counsel review**: image licence, attribution notice, terms of service, privacy notice, deletion and retention policy, prohibited-locations policy | Launch gate (plan §8). Drafts are in [03-rights-privacy-data-ownership.md](phase-0/03-rights-privacy-data-ownership.md) |
| H18 | **Google Play Console** account (25 USD one-time) and app listing; **App Store Connect** app record                                                       | Store submission and signing ownership must be yours, not a developer's                                                 |
| H19 | Store **privacy declarations** (App Privacy, Data safety): I'll draft the answers and you submit them                                                     |                                                                                                                         |
| H20 | Choose the **cloud host** for public launch (moving off the NAS)                                                                                          | Plan §7: the NAS must not be the public production origin                                                               |

## Decisions still waiting on you

- The _Proposed_ items in [01-decision-record.md](phase-0/01-decision-record.md): attribution toggle per record, admin light-only theme, dark theme colours, 7-day deletion grace period, pilot targets.
