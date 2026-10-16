# Phase 0 — Product Decision Record

**Date:** 2026-10-16
**Decided by:** Product owner
**Status:** Decided. Items marked *Proposed* need product owner review; items marked *Counsel* need legal review before public launch.

This record supersedes the open questions in the development plan (§12) and the design specification (§9) where they conflict.

## Market, audience, language

| ID | Decision | Notes |
|---|---|---|
| D-01 | Launch market is **EU/UK**. **GDPR applies from day one.** | EU data residency for database, media, and backups. Data export and deletion are V1 features, not later work. |
| D-02 | Minimum member age is **16+**. | Self-declared at sign-up with an age gate. No parental consent flow. |
| D-03 | V1 language is **English only**. | Externalize all strings from day one so later localization does not need refactoring. |
| D-04 | Product name is **ShootSpot** (final). | Use for bundle IDs (`com.shootspot.app`, *Proposed*), store listings, and design. |

## Access and visibility

| ID | Decision | Notes |
|---|---|---|
| D-05 | **Sign-in is required** to see any content. No visitor browsing and no public web URLs in V1. | Limits scraping of coordinates. Public web discovery stays in Phase 7. |
| D-06 | **Location records are anonymous by default.** Other members see the photo, pin, and scouting data, but never who created the record. | The goal is that no one can learn where a specific person goes. See [03-rights-privacy-data-ownership.md](03-rights-privacy-data-ownership.md). |
| D-07 | Creators may **opt in to public attribution** with a toggle, after accepting a responsibility notice. The app recommends keeping records private. | Per-record toggle, default **off** (*Proposed*). Notice text: *Counsel*. |
| D-08 | **Capture data is shown publicly** (exact capture date/time, bearing, technical data) because records are anonymous. | If a creator opts in to attribution, the responsibility notice must state that the timestamp and location become linked to them. |
| D-09 | Projects are **private** to their owner in V1 and live **inside Profile**. | Sharing is not designed for V1. |

## Rights and account lifecycle

| ID | Decision | Notes |
|---|---|---|
| D-10 | V1 image license is **in-app viewing only**. Members grant ShootSpot a non-exclusive license to host, resize, and display. Other members get no download or reuse rights. | Wording: *Counsel*. This replaces the "images become free for everybody" wording in the brief. |
| D-11 | **Future paid tier:** export a project as a formatted PDF in a location-timeline style, plus further features for paying members. | Not V1. The data model should not prevent it (ordering, timestamps). The license must allow this export (*Counsel*). |
| D-12 | **Account deletion:** the member's personal data is purged. Their published records **remain as anonymous records**, which they already are by default. Opted-in attribution is removed. | Before deleting, members can delete individual records. Whether creators keep a takedown right after deletion: *Counsel* (proposed: no, because the identity link is destroyed). |

## Capture and location

| ID | Decision | Notes |
|---|---|---|
| D-13 | Enforced landscape ratio is **16:9**. **Square (1:1)** is also allowed and preserved exactly. No portrait output. | The camera offers 16:9 (default) and 1:1 framing. Phone sensors are 4:3, so 16:9 crops about 25% of the height; the viewfinder must show the crop live. |
| D-14 | "Direction" means **the compass bearing the camera points toward**. It is suggested from the device heading and the member can edit it. | Label: "Camera points toward". Shown as `247° WSW`. |
| D-15 | **Location permission is optional.** GPS is suggested when permitted. Otherwise the member searches or drops a pin. The pin is always confirmed before publishing. | |
| D-16 | Capture data uses a **short input** (fast, field-friendly) plus an **optional advanced input** with richer photographer-relevant detail. | Field list: [02-v1-scope-and-flows.md §3](02-v1-scope-and-flows.md#3-scout-record-fields) (*Proposed*). |

## Navigation, maps, design

| ID | Decision | Notes |
|---|---|---|
| D-17 | Bottom navigation: a dark floating pill with **Feed · Map · Profile**, plus a separate round **Camera** action. Projects are inside Profile. No inbox or notifications in V1. | |
| D-18 | Maps use **native providers per platform**: Apple Maps (MapKit) on iOS and Google Maps on Android, through one React Native map component. | Trade-offs: the two platforms look different, Apple Maps has limited styling, and Android place search uses Google Places, which is billed per request. See D-21. |
| D-19 | The app **follows the system theme** (light and dark). | Every member screen needs light and dark tokens. **Exception:** the camera and full-screen photo viewer are always dark. Admin web: light only in V1 (*Proposed*). |

## Infrastructure

| ID | Decision | Notes |
|---|---|---|
| D-20 | **NAS-backed prototype first** on a container-capable Linux NAS (TrueNAS/Unraid/custom). | Run PostGIS, an S3-compatible object store, the API, and the worker as containers. Expose only the API through an outbound tunnel. Never expose NAS admin, SMB, or NFS. Keep encrypted off-site backups. Prototype/closed pilot only (plan §7). The cloud migration path must be kept ready from day one. |
| D-21 | Place search: **MapKit local search on iOS** (free). On Android, **Google Places Autocomplete** with session tokens and a monthly spend cap (*Proposed*). | Alternative: route search through our API using a single EU geocoder, so both platforms get the same results. Decide in the Phase 1 spike. |

## Still open (non-blocking for Phase 1)

1. Exact Good-for tag vocabulary and best-light periods: proposal in [02-v1-scope-and-flows.md](02-v1-scope-and-flows.md#3-scout-record-fields).
2. Attribution toggle: per record (proposed) or per account default.
3. What an attributed creator's public presence looks like. Proposed: display name and optional portfolio link and social handle on attributed records only, with no browsable profile page.
4. Counsel review: license text, attribution responsibility notice, terms of service, privacy notice, deletion policy, and prohibited-location policy.
