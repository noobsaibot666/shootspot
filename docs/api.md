# API contract (v1)

Base URL: `PUBLIC_API_URL`. In development that's `http://127.0.0.1:4000`; on the NAS LAN it's `http://172.16.1.1:4400`. Request and response types live in [`packages/shared/src/api.ts`](../packages/shared/src/api.ts) and [`scout.ts`](../packages/shared/src/scout.ts). The mobile app imports them directly.

## Conventions

- **Auth.** The app sends `Authorization: Bearer <token>`. The admin web uses the session cookie through its same-origin proxy. Without auth, every `/v1` and `/admin/v1` route returns **401**, except `/v1/legal` (D-05).
- **Errors** look like `{ "error": "<code>", "message"?: string }`, and validation errors like `{ "error": "invalid_request", "issues": [{ path, message }] }`. Common codes:
  - `unauthenticated` (401)
  - `forbidden`, `onboarding_required`, `mfa_required` (403)
  - `not_found` (404)
  - `draft_conflict`, `legal_version_outdated`, `attribution_notice_required`, `already_reported`, `invalid_transition` (409)
  - `daily_limit` (429)
- **Ids** are random UUIDs. **Times** are ISO-8601 UTC.
- **Anonymity (D-06).** `PublicRecord` never contains a creator id, email, name or upload time. `attribution` is non-null only when the creator opted in. A test asserts the exact key set.
- **Image URLs** are presigned and valid for 1 hour. Re-fetch the record rather than caching URLs.

## Sign-in (Better Auth, `/api/auth`)

The app must send `expo-origin: shootspot://`. Browsers must come from a trusted origin.

| Method | Path                                        | Body                         | Notes                                                                                                                   |
| ------ | ------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/auth/email-otp/send-verification-otp` | `{ email, type: "sign-in" }` | Emails a 6-digit code (valid 10 min, 5 attempts)                                                                        |
| POST   | `/api/auth/sign-in/email-otp`               | `{ email, otp }`             | 200. Bearer token in the **`set-auth-token`** response header (app); cookie (web). Creates the account on first sign-in |
| GET    | `/api/auth/get-session`                     |                              | Current session or `null`                                                                                               |
| POST   | `/api/auth/sign-out`                        | `{}`                         |                                                                                                                         |

## Member

| Method        | Path                 | Auth      | Purpose                                                                                                                      |
| ------------- | -------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| GET           | `/v1/legal`          | none      | Current versions: `terms`, `privacy`, `image_license`, `attribution_notice`                                                  |
| GET           | `/v1/me`             | signed in | `{ user, profile, onboarded, deletionScheduledFor }`                                                                         |
| POST          | `/v1/me/onboarding`  | signed in | `{ ageConfirmed16: true, accept: { terms, privacy, image_license }, firstName, lastName? }`. Versions must equal `/v1/legal` |
| PATCH         | `/v1/me/profile`     | onboarded | firstName, lastName, displayName, bio, portfolioUrl, socialHandle                                                            |
| POST          | `/v1/me/consents`    | onboarded | `{ kind: "attribution_notice", version }`                                                                                    |
| GET           | `/v1/me/records`     | onboarded | The member's own records in every state, with status                                                                         |
| PATCH         | `/v1/me/records/:id` | onboarded | `{ attributed, noticeVersion? }`. Turning attribution on requires the current notice version                                 |
| DELETE        | `/v1/me/records/:id` | onboarded | Removes for everyone; images purged                                                                                          |
| POST / GET    | `/v1/me/exports`     | signed in | Request a data export (1 per day) / list exports with download links                                                         |
| POST / DELETE | `/v1/me/deletion`    | signed in | Schedule account deletion (`DELETION_GRACE_DAYS`, default 7) / cancel                                                        |

## Capture and publish

1. `POST /v1/records` with a `DraftRecord` body. Returns **201** `CreateRecordResponse` with a presigned `upload` (PUT, `content-type: image/jpeg`, valid 15 min). **Idempotent on `draftId`**: a retry returns **200** with the same `recordId` and a fresh URL. Limit: 30 per day.
2. `PUT` the cropped JPEG (max 25 MB) to `upload.url` with `upload.headers`.
3. `POST /v1/records/:id/upload-complete` checks the object exists and queues processing. It's idempotent and also re-queues a `failed` record.
4. Poll `GET /v1/records/:id/status` until `status` is `published` or `rejected`. `media.rejectReason` is one of: `portrait`, `unsupported_ratio`, `too_small`, `too_large`, `undecodable`, `unsupported_format`, `too_many_bytes`.

## Discover

| Method | Path                                                                   | Notes                                                                                                                                                                  |
| ------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/feed?lat&lon&radiusKm=10&goodFor=a,b&bestLight=c&limit=20&cursor` | Newest first. With lat/lon: within the radius (1–100 km) and with `distanceM`. Tags match if any tag matches. Returns `Page<PublicRecord>` with an opaque `nextCursor` |
| GET    | `/v1/records/:id`                                                      | Published records only. The owner also sees their own hidden records                                                                                                   |
| POST   | `/v1/records/:id/reports`                                              | `{ reason, note? }`. One open report per member per record; 20 per day                                                                                                 |

## Projects (private, D-09)

| Method         | Path                               | Body / notes                                                                                   |
| -------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| GET / POST     | `/v1/projects`                     | `{ name }`                                                                                     |
| PATCH / DELETE | `/v1/projects/:id`                 | `{ name?, position? }`                                                                         |
| GET            | `/v1/projects/:id/items`           | `[{ recordId, available, record \| null }]`. Removed or hidden records show `available: false` |
| POST           | `/v1/projects/:id/items`           | `{ recordId }` (published only; idempotent)                                                    |
| DELETE         | `/v1/projects/:id/items/:recordId` |                                                                                                |

Another member's project id returns **404**, the same as one that doesn't exist.

## Admin (`/admin/v1`)

Every route requires the **owner role** and a session that **passed TOTP** (ADR 0005). The exceptions are `/mfa`, `/mfa/enroll` and `/mfa/verify`, which need only the owner role. Every action is audited.

| Method | Path                         | Purpose                                                                                 |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------- |
| GET    | `/mfa`                       | `{ enrolled, sessionVerified }`                                                         |
| POST   | `/mfa/enroll`                | Returns `otpauthUri` (only while not yet confirmed)                                     |
| POST   | `/mfa/verify`                | `{ code }`. Confirms enrolment and marks this session verified. Codes can't be replayed |
| GET    | `/summary`                   | Counts for the dashboard                                                                |
| GET    | `/reports?status=open`       | Queue with record label, thumbnail and number of open reports                           |
| POST   | `/reports/:id/resolve`       | `{ outcome: actioned \| dismissed, note? }`                                             |
| POST   | `/records/:id/moderate`      | `{ action: hide \| restore \| remove, reason }`                                         |
| GET    | `/records/:id`               | Full record **including the creator**. Each view is audited as `record.view_creator`    |
| GET    | `/users?q=`                  | Email, role, counts. No profile data                                                    |
| POST   | `/users/:id/role`            | `{ role, reason }`. You can't demote yourself                                           |
| POST   | `/users/:id/revoke-sessions` | `{ reason }`                                                                            |
| GET    | `/audit?before&limit`        | Newest first                                                                            |
| GET    | `/uploads`                   | Media by state, plus failed, stuck and abandoned items                                  |
| POST   | `/media/:id/retry`           | Re-queue failed processing                                                              |

## Health

`GET /health` (liveness) and `GET /ready` (database and storage, without error details).
