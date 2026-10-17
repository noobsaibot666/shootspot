# Closed pilot (Phase 6)

How the closed pilot runs, from first install to the go/no-go for a wider rollout. The plan's Phase 6: a small group of photographers and filmmakers in one or two cities, measured, interviewed and tuned.

## Before the first tester (all must be true)

| Gate                                                                  | Where                                           | Status                                      |
| --------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| Real email (Brevo); Mailpit stopped (security F1)                     | HANDWORK 3.2                                    | **done**; switch sender to the domain later |
| HTTPS through the Cloudflare Tunnel (F2); `CLIENT_IP_HEADER` set (F3) | HANDWORK 2.3–2.4, truenas-deployment.md Phase B | waiting on owner                            |
| Off-site backups running; NAS restore rehearsed                       | HANDWORK 2.5, backup-restore.md                 | waiting on owner                            |
| Crash reporting on (Sentry DSNs in EAS and the NAS `.env`)            | HANDWORK 3.7                                    | code ready                                  |
| Store accounts; TestFlight and Play internal testing set up           | HANDWORK 4.2                                    | waiting on owner                            |
| Terms, privacy notice and image licence reviewed                      | HANDWORK 4.1                                    | waiting on owner                            |
| Pilot targets agreed (below)                                          | owner                                           | **proposal, not agreed**                    |

## Builds for testers

Testers don't use development builds. The app needs the public API URL baked in:

1. In EAS (expo.dev → Environment variables), set for **preview** and **production**: `EXPO_PUBLIC_API_URL=https://api.<domain>`, `GOOGLE_MAPS_ANDROID_KEY` (already set), and `EXPO_PUBLIC_SENTRY_DSN` (HANDWORK 3.7).
2. Add the **Play App Signing** SHA-1 to the Maps key (HANDWORK 3.4, step 6) once the first bundle is uploaded.
3. Build and submit:
   - iOS → TestFlight: `npx eas-cli build -p ios --profile production`, then `npx eas-cli submit -p ios`. Add testers in App Store Connect → TestFlight (external testers need a short Beta App Review).
   - Android → Play internal testing: `npx eas-cli build -p android --profile production`, then `npx eas-cli submit -p android` (`eas.json` targets the **internal** track as a draft). Add testers' Google emails in Play Console → Testing → Internal testing.

## Inviting testers

- Start with 10–20 people you know, in one city, then a second city.
- Send them: the TestFlight or Play link, a one-paragraph brief ("scout places you'd shoot; everything is anonymous unless you show your name"), and where to send feedback (a dedicated email address, HANDWORK 2.3).
- Sign-in is open to anyone with the build. If you want sign-up limited to invited emails during the pilot, say so: that's a small server change (an allow-list in the admin), not built yet.

## Weekly review (admin → Summary → Pilot, 7 days)

| Measure                   | Proposed target (owner to agree) | Source                    |
| ------------------------- | -------------------------------- | ------------------------- |
| Upload success            | ≥ 98 %                           | Summary · Upload success  |
| Median time to publish    | ≤ 30 s                           | Summary · Median time     |
| Feed load (first content) | ≤ 2.5 s on 4G (plan §10)         | tester reports / Sentry   |
| Crash-free sessions       | ≥ 99 %                           | Sentry                    |
| Reports resolved          | median ≤ 72 h                    | Summary · Reports         |
| Weekly active creators    | ≥ 30 % of testers                | Summary · Active creators |
| Imports vs camera         | watch only                       | Summary · Locations       |

Also check every week:

- **Locations** page: sample new locations for quality and safety (private homes, dangerous access).
- **Uploads** page: failed uploads and their errors.
- Storage use on the NAS (`zfs list Gaia/04_DEV/shootspot-runtime`) to update the cost model.

## Interviews

Five to eight short calls in weeks 2–3. Ask about:

- the capture flow
- whether the notes fields are enough
- whether the feed radius and tags help them find places
- what made them not publish
- how they feel about anonymity

## Exit (go / no-go for wider rollout)

From the plan: the owner approves based on the agreed targets, with no unresolved critical safety or data-integrity issue, and the capacity/cost model updated from real usage. Before a public launch, move off the NAS to a cloud host (HANDWORK 4.4) and have an external penetration test (security F8).
