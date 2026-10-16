# Phase 0 — Design Brief

This brief locks the open items in [location-scout-design-specifications.md](../production/location-scout-design-specifications.md) §9. That specification remains the source for tokens, typography, and component guidance. Where they differ, this brief wins.

## Resolved design decisions

| Spec §9 question                | Decision                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dark photo shell or light shell | **Follow the system theme** (D-19). Both themes are required for every member screen. The camera and full-screen photo viewer are always dark.             |
| Bottom navigation items         | Floating dark pill: **Feed · Map · Profile**, plus a separate round **Camera** button (D-17). Projects are inside Profile.                                 |
| Camera placement                | **Separate floating circular button** to the right of the pill, visually distinct from navigation.                                                         |
| Crop ratio and square display   | **16:9** default and **1:1** allowed (D-13). The feed shows each image at its native ratio (no cropping of square images). Detail uses full width.         |
| Map treatment                   | **Embedded native map**: Apple Maps on iOS, Google Maps on Android (D-18). There is a Map tab, a static mini-map in detail, and an "Open in Maps" handoff. |
| Admin theme                     | **Light only** in V1 (_Proposed_).                                                                                                                         |
| Brand name                      | **ShootSpot** (final). Logo: to be designed. Keep the industrial gray palette and validate it against photography in both themes.                          |

## Theme tokens to produce

The light theme uses the spec palette (canvas `#E0E0E0`, surface `#EAEAEA`, ink `#111111`). The dark theme needs a matching set. Starting proposal:

| Token         | Light           | Dark (_Proposed_)                               |
| ------------- | --------------- | ----------------------------------------------- |
| canvas        | `#E0E0E0`       | `#0E0E0E`                                       |
| surface       | `#EAEAEA`       | `#1A1A1A`                                       |
| ink           | `#111111`       | `#EDEDED`                                       |
| ink-secondary | `#1A1A1A`       | `#B8B8B8`                                       |
| divider       | `#B5B5B5`       | `#2E2E2E`                                       |
| signal-red    | `#FF3B30`       | `#FF453A`                                       |
| signal-green  | `#00A859`       | `#30D158`                                       |
| nav-pill      | `#111111` @ 88% | `#1F1F1F` @ 88% with 1 px `#FFFFFF` @ 8% border |

All text and icon pairs must meet WCAG AA contrast in both themes. The nav pill must stay legible over both bright and dark photos; add an opaque backplate if testing shows it doesn't.

## Screens for the design pass (priority order)

1. Camera (16:9/1:1 toggle, rotate cue, crop mask, controls) — landscape and portrait-held
2. Crop preview → pin confirm → short form → advanced form → public preview with attribution toggle and notice
3. Feed with scope chip and filter sheet
4. Map tab with clustered pins and preview card
5. Location detail
6. Profile: My records, Projects, project detail, Settings, deletion and export
7. Onboarding with the anonymity explanation
8. Empty, error, and permission states ([02 §5](02-v1-scope-and-flows.md#5-empty-error-and-permission-states-must-be-designed))
9. Admin: sign-in/MFA, reports queue, record inspection, upload jobs, audit log

## Metadata display conventions

Monospace for `247° WSW`, `38.7223° N, 9.1393° W`, `±8 m`, `2026-10-16 07:42 WEST`, `☀ az 104° · el 6°`, and `24 mm eq`. Sans for Good-for tags, light notes, and advanced notes.
