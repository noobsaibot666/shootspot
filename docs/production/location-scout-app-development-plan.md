# Location Scout App — Developer Delivery Plan (V1)

**Status:** Product brief for discovery and implementation planning  
**Platforms:** iOS and Android first; restricted web administration console  
**Audience:** Product owner, designers, mobile/web engineers, backend and infrastructure engineers

## 1. Product goal

Build a mobile-first, community-maintained scouting library for photographers and filmmakers. Members capture a location in the field, attach a usable image and practical scouting notes, then publish it for discovery. Other members browse nearby or chosen places, inspect the image and location guidance, and save locations into private projects for a shoot.

This is a location utility with an image-led feed, not only a mood-board feed. Location accuracy, discoverability, reliable capture, media rights, moderation, and a clear privacy model are core product requirements.

## 2. Product principles and V1 boundaries

- The mobile apps are the primary member experience. The web app is a separate, role-gated admin console for owner/developer operations and moderation.
- A published scout entry is a **location record** with one or more landscape-or-square images, coordinates, creator attribution, and structured scouting notes. The feed is a way to discover these records.
- Members can make projects and save records to them. V1 projects are private to their owner unless sharing is explicitly designed and approved later.
- V1 notes: **Good for** (free text or controlled tags), **best time/light** (time-of-day selection plus optional note), and **shooting direction** (compass bearing/direction plus optional note). Capture time and device heading can be suggested, but the member must be able to correct them.
- V1 excludes RAW uploads, social messaging, public comments, complex project collaboration, bookings, payments, and advanced sun-path prediction.
- Do not promise that the app can guarantee light at a place: light depends on date, weather, season, obstructions, and camera position. V1 guidance is community-supplied and indicative.

## 3. Roles and access

| Role | Mobile app | Admin web |
|---|---|---|
| Visitor | Browse only if public browsing is allowed; otherwise sign-in gate | None |
| Member | Capture, publish, search, save, manage profile/projects, report content, request account deletion | None |
| Owner / developer | Member capabilities | User and role management, moderation, content operations, system settings, audit history |

Use server-enforced role checks, not just hidden UI. Require MFA for admin accounts, least privilege, auditable admin actions, and a separate admin sign-in/session policy. Keep admin endpoints and secrets out of the mobile bundle.

## 4. Core member journeys

1. **Onboarding:** explain location use, media rights, and visibility; collect only necessary profile details; request location/camera permissions in context; let people decline location and choose a place manually.
2. **Discover:** image-first feed; default to nearby entries when location permission is available and the member has selected nearby mode; provide a clear manual location search; filter by place/radius and, as scope permits, Good for and best-light period. Preserve filters and show the active location scope.
3. **Scout capture:** open an in-app capture screen; guide the device into landscape; provide native camera controls available on the device (focus/tap-to-focus, exposure adjustment, zoom/lens choice where supported, flash/torch where supported); show capture preview and orientation crop; retake or continue.
4. **Publish:** resolve GPS coordinates and accuracy, show a map pin/address for confirmation and correction, collect Good for, best time/light, and direction, preview the public record, then upload and publish. Save a draft locally if capture or upload fails.
5. **Inspect and save:** view the location record, navigate to its map position, review creator and scouting notes, and save it to one or more private projects.
6. **Profile and projects:** name, surname, short bio, portfolio URL, social handle; view own contributions; create, rename, organize, and delete private projects and saved entries.
7. **Account lifecycle:** let members export/request their data and request account deletion. The exact effect on published records must follow the rights and privacy policy in section 8; never implement silent identity deletion while retaining personally identifying metadata.

## 5. Image and camera rule — make the rule testable

The requirement says images must never be vertical; square is allowed. It also asks for the phone to be rotated before capture and vertical captures to be cropped. Treat this as **landscape orientation or square output**, not “horizontal portrait mode.”

- Capture UI should prefer landscape and clearly prompt rotation. It may allow capture while held vertically only if the resulting crop is shown before upload.
- Normalize orientation from image metadata, crop to a configured landscape aspect ratio (product decision, e.g. 3:2 or 16:9) or preserve square, and reject any final portrait raster. Do not rely on EXIF orientation alone; decode, normalize, and validate the actual pixels.
- Show the exact crop in the capture preview and publish confirmation. Keep the original only temporarily during processing; remove it after derivatives are confirmed unless a documented need requires retention.
- Accept common non-RAW camera formats, normalize to a delivery format such as JPEG/WebP/AVIF according to supported clients, strip unnecessary metadata (especially embedded GPS) from public derivatives, and retain coordinates in the location record instead.
- Enforce file size, dimensions, MIME type, decode safety, and orientation server-side. Generate thumbnail/feed and detail sizes; do not serve full camera files in the feed.
- Test on actual iOS and Android devices across front/back cameras, rotation, EXIF orientations, crop edges, permission denial, low storage, and interrupted uploads.

## 6. Product requirements and acceptance criteria

### Feed, search, and maps
- Feed is fast, image-led, and usable with intermittent mobile networks. UI chrome hides during scroll and returns when scrolling stops, without obscuring essential navigation, accessibility controls, or feedback.
- Bottom floating navigation should follow the supplied reference’s compact dark pill and separate round “+” action as visual inspiration. The reference suggests home, inbox/collection, notifications, layers, and add; it does **not** define the app’s information architecture. Validate whether inbox and notifications belong in V1. The requested camera and profile actions must be unmistakable and reachable; avoid mapping “+” to camera without user testing.
- Smooth motion must respect Reduce Motion, avoid blocking navigation, and keep touch targets accessible.
- Nearby results are based on explicit user-selected radius and location permission. Manual place search must work without device location. Ask whether maps/list/map preview need a third-party map provider and budget before selection.
- Location records need geospatial indexing, pagination, deduplication/reporting pathways, and a defined policy for private, unsafe, or access-restricted places.

### Profile and projects
- Profile fields are limited to name, surname, short bio, portfolio link, and one social handle in V1. Avoid collecting birth date, phone, or home address without a specific requirement.
- A member can create, edit, and delete projects and add/remove saved location records. Define empty states, undo/confirmation, and behavior when a saved record is removed or moderated.
- Decide whether profile and contribution pages are public, whether social links are clickable, and whether users can use a display name distinct from legal name.

### Admin console
- Admin web console supports secure sign-in, MFA, role management, reports queue, hide/restore/remove content, account actions, search, audit log, upload health, and configuration of controlled vocabularies/tags.
- Destructive operations require confirmation and record actor, time, reason, and affected object. Moderation actions need an appeal/contact path and policy-defined outcomes.
- Owner/developer privileges are distinct from ordinary members. Consider a moderator role later; do not give every developer broad access to private user data by default.

## 7. Proposed architecture

### Recommended baseline

- **Mobile:** React Native with TypeScript for shared product UI, plus small native Swift/AVFoundation and Kotlin/CameraX modules for capture behavior and device-specific controls. Choose Flutter or fully native only if the team’s expertise or camera requirements justify changing this recommendation. Prove landscape capture/crop and controls in a short technical spike before committing.
- **Web admin:** Next.js/TypeScript, deployed separately from the mobile client, with server-side authorization and MFA.
- **Backend:** TypeScript API service (for example, NestJS/Fastify) with PostgreSQL + PostGIS. Keep domain rules in the API; mobile clients never connect to the database directly. Use managed authentication or a well-supported OIDC provider; model roles and account lifecycle in the backend.
- **Media:** S3-compatible object storage, private originals/quarantine, processed public derivatives, signed/resumable uploads, image processing worker, CDN delivery, lifecycle rules, and per-user rate/size limits. Use a queue for processing and retries.
- **Operations:** managed database, object storage, CDN, secrets manager, centralized logs/metrics/alerts, backups, infrastructure-as-code, staging and production environments, CI/CD, migrations, and crash/error reporting.

This keeps the first production deployment small while allowing database, worker, API, and media delivery to scale independently. Avoid building a large microservice system at launch.

### NAS use and migration boundary

A NAS is useful for a closed prototype, internal test assets, or a replicated backup. It should not be the only public production origin: home/office connectivity, power, disk failure, security exposure, and global latency become operational risks. Do not expose NAS admin or SMB/NFS to the internet. If the pilot must use it, expose uploads through an authenticated API or narrowly scoped gateway, encrypt in transit and at rest, keep immutable off-site backups, monitor capacity, and define tested restore and cloud-migration procedures. Prefer an object-storage-compatible interface from day one so the storage backend can change without changing app records.

### Data model (initial)

- `users`, `profiles`, `roles`, `consents` (versioned terms and accepted timestamp)
- `locations` (PostGIS point, coordinate accuracy, optional normalized place label, owner/creator reference, visibility/moderation state)
- `media` (location id, object keys, dimensions, format, processing state, attribution/license version, moderation state)
- `scout_notes` (Good for tags/text, best-light period, direction bearing/text, optional note)
- `projects`, `project_locations` (private ownership and ordering)
- `reports`, `moderation_actions`, `admin_audit_events`
- `upload_jobs` / idempotency records to safely retry uploads and processing

Separate identity from contribution ownership so account deletion and retained community records can be handled consistently and audited.

### Upload flow

1. App captures and previews crop; strips/normalizes local metadata.
2. API authorizes upload, validates policy/quota, creates a pending media record, and returns a short-lived scoped upload target.
3. App uploads directly to object storage, with resumability/retry where supported.
4. Worker validates and decodes file, normalizes orientation/aspect, compresses derivatives, strips EXIF, scans for malware/abusive payloads as appropriate, and marks processing status.
5. API publishes the record only when required media variants and metadata checks succeed. Failed processing stays private and is retryable or removable.

## 8. Rights, privacy, safety, and account deletion — decisions required before public launch

The requested acceptance term (“images become free for everybody in the application”) is too vague to implement safely. Decide and have counsel review:

- Is the grant a non-exclusive license to host, resize, display, and allow in-app viewing/download? Can members use images commercially outside the app? Is attribution required? Can other members download originals? Can creators revoke or hide images?
- Which license version applies to existing content, and what happens when terms change?
- On account deletion, which content remains, under what pseudonymous attribution, and can any personal data remain? The product request says images remain, but that does not itself resolve privacy, copyright, data protection, or retention obligations. Implement deletion as a stateful workflow (disable access, detach or pseudonymize identity as policy permits, purge personal data and sessions, preserve only content and records that policy/law allows, log completion) rather than leaving a live deleted profile.
- Location data can expose private homes, sensitive sites, or unsafe access. Decide public coordinate precision, location restrictions, reporting/removal, privacy-preserving fuzzing for sensitive categories, and whether members may submit locations where access is prohibited.
- Collect precise device location only when needed for capture/nearby, explain purpose, offer manual correction and a path without location permission, and set retention limits. Strip GPS EXIF from public images so location is controlled by the record’s published pin.
- Define age eligibility, prohibited content, copyright complaint process, moderation response targets, and appeals.

These are launch gates, not polish items. Do not ship the “free image use” checkbox until the license wording, scope, consent evidence, and account deletion behavior are settled.

## 9. Delivery phases

### Phase 0 — Product decisions and discovery

**Work:** confirm target launch countries/languages, audience and age policy; resolve image license/account deletion/privacy/location precision; decide public browsing and profile visibility; define the reference image’s navigation; choose map provider and V1 filters; set pilot scale/budget; produce user flows and acceptance criteria.

**Exit:** signed-off V1 scope, rights/privacy decision record, design brief, data ownership rules, metric definitions, and a prioritized backlog. The promised design-style Markdown document should be reviewed here before visual design is locked.

### Phase 1 — Technical proof and foundations

**Work:** camera spike on representative iOS/Android devices; verify focus/exposure controls, landscape guidance, orientation normalization/crop, upload resilience, permissions, maps/geolocation accuracy; establish repositories, environments, CI/CD, app signing, database migrations, secrets, logging, backups, and access policy.

**Exit:** tested camera prototype; architecture decision record; staging environment; threat model; restore and deployment runbooks; App Store/Play Store ownership and signing access confirmed.

### Phase 2 — Backend and admin foundation

**Work:** authentication, profile and roles, PostGIS location schema/indexes, media records, signed upload workflow, processing queue, feed/search API, project API, moderation/reporting and audit foundations; admin web sign-in/MFA and role-gated shell.

**Exit:** API contracts documented; integration test environment; admin role enforcement verified server-side; media failure/retry flow works; operational dashboards and alerts available.

### Phase 3 — Mobile V1: capture and publish

**Work:** onboarding/consent capture; profile basics; camera experience; crop preview; coordinate/map confirmation; notes form; draft, retry, processing status, publish success/failure; account and permission states.

**Exit:** end-to-end test from capture to published record on iOS and Android; no portrait media can be published; coordinate and crop are confirmed before publication; accessibility and low-network behavior reviewed.

### Phase 4 — Mobile V1: discover and organize

**Work:** image-first feed, nearby/manual place browsing, filters, location detail, map handoff, save-to-project, project management, profile contributions, account deletion request flow, report content. Implement the floating navigation after validating its information architecture.

**Exit:** key journeys usable without onboarding help; feed pagination/performance targets met on agreed test devices/network; projects remain private; empty/error/offline states covered.

### Phase 5 — Admin operations, safety, and launch hardening

**Work:** moderation queue and audit trail, account/content actions, controlled tags, abuse/rate limits, security review, privacy and rights review, backups/restore rehearsal, load and upload testing, accessibility, crash analytics, store listings/privacy declarations, support and incident runbooks.

**Exit:** launch checklist signed; critical security/privacy defects closed; deletion and report workflows demonstrated; restore rehearsal successful; app review assets and support process ready.

### Phase 6 — Closed pilot and measured rollout

**Work:** invite a small cohort in one or two cities; monitor capture completion, upload failures, time to first useful result, feed latency, reports, storage/egress and support load; interview photographers and filmmakers; tune radius, tags, onboarding, and image sizes.

**Exit:** product owner approves rollout based on agreed thresholds; no unresolved critical safety or data integrity issue; capacity/cost model updated from actual usage.

### Phase 7 — Scale and expansion (post-V1)

**Work when justified by metrics:** multi-region media delivery, database read scaling/partitioning, richer sun-position estimates, collaborative projects, advanced filters, localization, creator licensing options, offline map packs, moderation tooling expansion, and public web discovery if desired.

**Exit:** each expansion is supported by usage, reliability, and cost evidence; preserve backward-compatible APIs and data migrations.

## 10. Non-functional targets to agree before build

Set numeric targets in Phase 0. Suggested initial targets for discussion:

- Feed first useful content in under 2.5 seconds on a defined mid-range phone and ordinary 4G connection; use placeholders and progressive loading.
- Uploads resume or fail clearly; no duplicate published records on retry.
- API availability and recovery objectives defined for pilot and production; automated database backups plus off-site media redundancy and restore tests.
- Rate limiting and quotas for uploads, search, sign-in, and reports; encrypted transport, encrypted managed storage, least privilege, dependency scanning, and security incident procedure.
- Instrument location permission choices and camera/upload failures without logging exact coordinates or image contents into analytics.
- Meet WCAG 2.2 AA for admin web where applicable; mobile support for screen readers, dynamic text, contrast, and Reduce Motion.

## 11. Key risks and mitigations

| Risk | Mitigation / decision |
|---|---|
| “Free for community use” creates broad, unclear rights | Define a narrow, explicit license and downloads/attribution rules with counsel before consent screen ships. |
| Account deletion conflicts with retained images | Separate identity and content lifecycle; define pseudonymization, takedown, and lawful retention policy before launch. |
| GPS is wrong, unavailable, or exposes a sensitive place | Show accuracy and pin confirmation; support manual correction; define coordinate precision and sensitive-location policy. |
| Portrait crop damages composition | Define aspect ratio, show crop before publish, test device orientation and EXIF edge cases. |
| Native camera behavior differs across devices | Early native camera spike; capability detection and graceful fallback. |
| NAS becomes a public single point of failure | Limit to controlled pilot; keep off-site backups, no direct NAS exposure, and migration-ready object storage abstraction. |
| Image volume drives cost | Client-side resize plus server-side re-encode, derivatives, CDN cache, quotas, lifecycle rules, and storage/egress dashboards. |
| Low-quality, duplicate, or unsafe locations erode trust | Report, moderation, duplicate detection, attribution, and clear access guidance. |

## 12. Questions to resolve with the product owner

1. Which first launch country/countries, and must the product meet EU privacy requirements from day one?
2. Should anyone browse without an account? Are member profiles and location pins public to the internet or only to signed-in users?
3. What exact image license do you intend: in-app viewing only, in-app download, or broader reuse? Should creators be able to remove a record later?
4. On account deletion, should contributions become unattributed/pseudonymous, and should the creator retain a takedown right?
5. What landscape crop ratio should be enforced, and should square images be preserved exactly?
6. Which maps provider and location search experience do you prefer? Is offline use important?
7. Are projects private in V1, and what does “share” mean if added later?
8. Should capture require location permission, or can members enter/select a location manually?
9. What does “direction” mean: compass bearing of the camera, direction the subject faces, or recommended photographer standing position? These are different values and labels.
10. Which bottom navigation items from the reference are actually needed in V1? The reference includes inbox, notifications, layers, and add; the stated core needs are feed, camera, and profile/projects.

## 13. References for implementation planning

- [Supabase Storage image transformations](https://supabase.com/docs/guides/storage/serving/image-transformations) — managed image resizing and optimized delivery; assess plan and per-image transformation costs before choosing it.
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) — current storage, operation, and egress pricing; re-check before procurement because pricing changes.
- [Apple AVFoundation camera capture](https://developer.apple.com/documentation/avfoundation/capture_setup) — native iOS capture framework reference.
- [Android CameraX](https://developer.android.com/media/camera/camerax) — native Android camera APIs and lifecycle guidance.

*This plan is a development brief, not a final legal or vendor selection. Confirm service region, data-processing terms, current pricing, app-store rules, and licensing/privacy language during Phase 0.*
