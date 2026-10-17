# Store listing (draft for HANDWORK 4.2 / 4.3)

Draft copy for the App Store and Google Play. The owner edits and submits it. Privacy answers are in [privacy-declarations.md](privacy-declarations.md).

## Basics

| Field                        | Value                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Name                         | ShootSpot                                                                        |
| Subtitle (iOS, 30)           | Location scouting for creatives                                                  |
| Short description (Play, 80) | Find and share photo and film locations, with light, direction and access notes. |
| Category                     | Photo & Video (secondary: Travel)                                                |
| Age rating                   | 12+ / Teen (user-generated photos, moderated); the app requires 16+ at sign-up   |
| Price                        | Free                                                                             |
| Support URL                  | https://docs.alan-design.com/shootspot/user-guide/support/ (D-35)                |
| Support email                | hello@expose-u.com                                                               |
| Privacy policy URL           | https://docs.alan-design.com/shootspot/legal/privacy/                            |
| Account deletion URL (Play)  | https://docs.alan-design.com/shootspot/legal/delete-account/                     |
| Version                      | 1.0.0                                                                            |

## Description

ShootSpot is a location-scouting app for photographers and filmmakers.

Photograph a place you'd shoot, and ShootSpot records what matters for the next visit:

- where it is, and which way the camera points
- where the sun was
- the best light
- what it's good for
- access, permits and practical notes

Browse locations near you or anywhere else, filter by what you're shooting, and save the best ones into private projects for your next job.

- **Scout fast:** a minimal camera close to your phone's own. Or import photos you already took; their location and time fill in automatically.
- **Light and direction:** each location shows its compass direction and the sun's position when it was shot, so you know when to go.
- **Anonymous by default:** nobody sees who added a location unless you choose to show your name.
- **Private projects:** collect locations for a shoot. Only you can see them.
- **Your data:** export it any time, or delete your account in the app.

Shared by the community: access and conditions change, so always check before you go.

## Keywords (iOS, 100 characters)

location scouting,photography,film,locations,photo spots,golden hour,sun,shoot,filmmaker,scout

## Screenshots (to capture on device after the design review)

1. Feed grid (dark)
2. A location opening from the grid: photo, direction, sun and best light
3. Camera with the 16:9 frame
4. Pin confirmation on the map
5. Map with clusters
6. Import: the frame crop with the photo's location prefilled
7. Projects (boards)

Sizes: iPhone 6.9" (1320 × 2868), Android phone (1080 × 2400). Use real scouting photos, not test images.

## Review notes (for Apple / Google)

- Sign-in uses a 6-digit email code. **Review account (D-34):** before submitting, set `REVIEW_EMAIL` and `REVIEW_CODE` in the NAS `.env` (6 random digits; Claude gives the guarded block), then put both in the review notes: _"Sign in with review@… and, when asked for the code, enter …. No email is needed for this account."_ Remove both from `.env` once the review is approved.
- Before sending a review: on a phone outside the home network, sign in with the review account and open a location (the NAS must be public over HTTPS, D-33).
- Location: when-in-use only, and optional (manual pin and place search work without it).
- Photos: the picker is only used for imports the member starts. Their GPS metadata is read on the phone and never uploaded.
- Moderation: reports in the app, an admin console, and a 72-hour target.
