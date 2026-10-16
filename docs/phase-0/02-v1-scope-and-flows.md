# Phase 0 — V1 Scope, User Flows, and Acceptance Criteria

Decision references (`D-xx`) point to [01-decision-record.md](01-decision-record.md).

## 1. V1 scope

### In scope

- Sign-up and sign-in with an age gate (16+), consent capture, and a minimal profile
- Camera capture with 16:9 or 1:1 framing, focus, exposure, zoom/lens, flash/torch where supported, and a crop preview
- Publishing: pin confirmation, short data input, optional advanced input, preview, upload with draft and retry
- Anonymous-by-default records with an opt-in attribution toggle
- Feed (image-first), Map, and location detail
- Nearby or manual place scope; filters for radius, Good for, and best light
- Private projects inside Profile; save and remove records
- Report a record
- Data export request and account deletion workflow
- Light and dark themes following the system
- Admin web: sign-in with MFA, reports queue, hide/restore/remove, user actions, audit log, upload health, tag vocabulary

### Out of scope for V1

RAW uploads, image downloads, comments, messaging, inbox, notifications, project sharing, collaboration, PDF/timeline export (planned for the paid tier, D-11), payments, sun-path prediction, offline maps, localization, and public web pages.

## 2. Navigation map

```
[Feed] ── record card ──> [Location detail] ──> Save to project / Report / Open in Maps
[Map]  ── pin ─────────> [Location detail]
[Profile] ── My records (private list, edit/delete, attribution toggle)
          ── Projects ──> [Project] ──> [Location detail]
          ── Settings (account, privacy, export, delete, theme follows system)
(Camera) ──> Capture ──> Crop preview ──> Pin ──> Short data ──> (Advanced) ──> Preview ──> Publish
```

## 3. Scout record fields

_Proposed. Please review._ Fields marked "auto" are filled from the device or EXIF and can be corrected. All fields are public on the anonymous record (D-08).

### Short input (one screen, target under 30 seconds)

| Field                | Type                                      | Source                           |
| -------------------- | ----------------------------------------- | -------------------------------- |
| Photo                | 16:9 or 1:1                               | camera                           |
| Location pin         | point plus accuracy (m)                   | auto (GPS) or manual             |
| Location label       | short text                                | auto (reverse geocode), editable |
| Good for             | tags (multi-select), with optional text   | member                           |
| Best light           | period (multi-select), with optional note | member                           |
| Camera points toward | bearing 0–359°                            | auto (heading), editable         |

**Good for tags:** Portrait · Fashion · Landscape · Architecture · Street · Urban · Nature · Seascape · Night/astro · Product · Wedding · Music video · Narrative film · Commercial · Drone (where legal)

**Best light periods:** Blue hour (AM) · Sunrise/golden (AM) · Morning · Midday · Afternoon · Golden/sunset (PM) · Blue hour (PM) · Night · Overcast-friendly

### Captured automatically (shown as technical metadata)

Capture date and time (local, with timezone) · GPS accuracy · altitude · lens equivalent focal length · **sun azimuth and elevation at the capture time**. The sun values are computed from time and location. This is cheap to compute and is not sun-path prediction, which stays out of V1.

### Advanced input (optional, collapsible)

| Group             | Fields                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Access            | Access type (public / permission needed / paid entry / restricted), walk-in time from parking, terrain difficulty, accessibility notes |
| Permits and rules | Permit required (yes/no/unknown), drone rules (allowed/restricted/no-fly/unknown), tripod allowed                                      |
| Practical         | Parking, power available, shelter, restrooms, mobile signal                                                                            |
| Conditions        | Best season(s), crowd level by time, tide-dependent (yes/no), hazards/safety note                                                      |
| Shot notes        | Lens used and recommended focal range, free-text note (max 500 characters)                                                             |

## 4. Core flows and acceptance criteria

### F1. Onboarding

1. Welcome → age confirmation (16+) → sign up → accept terms, privacy, and image license (versioned) → profile basics (name, surname; bio, portfolio, and social handle optional).
2. Explain anonymity: "Your locations are anonymous. Nobody can see who took them unless you choose to show it."
3. Location and camera permissions are requested in context the first time they are needed, not during onboarding.

**Accept when:** consent version and timestamp are stored server-side; a member under 16 cannot create an account; declining location still lets the member use the app.

### F2. Capture and publish

1. The camera opens in 16:9 framing with a rotate-to-landscape cue. The 1:1 toggle is available. A live crop mask is shown when the phone is held upright.
2. Capture → crop preview → retake or continue.
3. Pin: GPS suggestion with an accuracy ring, or search or drop a pin. The member confirms the pin.
4. Short data form → optional Advanced → preview of the public record. The attribution toggle is off by default; turning it on shows the responsibility notice.
5. Publish. A draft is saved locally; the upload resumes or retries; the member sees processing status.

**Accept when:** no portrait raster can be published (validated server-side); the crop and pin are shown and confirmed before publishing; public derivatives contain no EXIF GPS; a retry never creates a duplicate record; the API response for a non-attributed record contains no creator identifier.

### F3. Discover (Feed and Map)

1. The scope chip shows "Nearby · 10 km" or the manually chosen place.
2. The filter sheet offers place, radius (1, 5, 10, 25, 50 km), Good for, and best light. Filters persist across sessions.
3. Feed: image-first cards showing location label, distance, bearing, and save. The map shows clustered pins with an image preview.

**Accept when:** first useful content appears in under 2.5 s on a reference device over 4G; the manual scope works with location permission denied; pagination has no duplicates; the active scope is always visible.

### F4. Location detail, save, report

Larger image, map pin, label, all scouting data, technical metadata, attribution (if opted in), "Open in Maps" handoff, save to one or more projects, and report with reasons.

**Accept when:** save and unsave are reflected immediately; a removed or moderated record in a project shows as "No longer available" instead of disappearing silently.

### F5. Profile and projects

Profile shows the member's own details, **My records** (visible only to the owner, with edit, delete, and attribution toggle), **Projects** (create, rename, reorder, delete with undo), and Settings.

**Accept when:** no other member can view a member's profile, record list, or projects through the UI or the API.

### F6. Account lifecycle

Data export request (machine-readable archive by email or in-app download) and account deletion. Deletion is confirmed, then sessions are revoked, personal data is purged, attribution is removed, records stay anonymous, and completion is logged.

**Accept when:** after deletion, no personal data remains linked to any retained record, and the audit log records the completed deletion.

## 5. Empty, error, and permission states (must be designed)

No results in scope · location denied · camera denied · offline · upload failed or retrying · processing · record unavailable · empty project · empty My records · map unavailable.
