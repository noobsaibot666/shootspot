# Web Location Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task.

**Goal:** Add a web-only ZIP export for all visible published locations, including `locations.json`, `locations.geojson`, and the ready WebP image for each location.

**Architecture:** Add export-specific API routes under `/web/v1/export` and `/web/v1/records/:id/export`. The API keeps normal `WebRecord` payloads coordinate-free, queries the same published/block-filtered records for export, reads ready image bytes through storage, and creates a ZIP in memory. The web client adds download helpers and buttons in the account menu and location detail view.

**Tech Stack:** Fastify, PostgreSQL/PostGIS, S3-compatible storage, `fflate`, Next.js/React, Vitest, TypeScript.

---

### Task 1: Add the archive model and ZIP builder

**Files:**

- Create: `services/api/src/web/export.ts`
- Test: `services/api/src/web/export.test.ts`
- Modify: `services/api/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write the failing unit tests**

  Add tests for a two-record archive. Assert that `locations.json` contains exact coordinates and
  relative image paths, `locations.geojson` has `FeatureCollection` type and `[lon, lat]` order,
  and each `images/<id>.jpg` entry contains the supplied bytes. Add a one-record test as well.

- [ ] **Step 2: Run the unit tests to verify they fail**

  Run `pnpm --filter @shootspot/api exec vitest run src/web/export.test.ts`.
  Expected: FAIL because the archive builder does not exist.

- [ ] **Step 3: Add the ZIP dependency and minimal archive implementation**

  Add `fflate` to `services/api` dependencies. Define an export record type containing the public
  scouting fields plus `lat`, `lon`, and `imageBytes`. Implement `buildLocationArchive(records)`:

  - map each record to a JSON-safe manifest record with `schemaVersion: 1` and `image: images/<id>.webp`;
  - create a GeoJSON `FeatureCollection` with each feature's geometry coordinates as `[lon, lat]`;
  - encode both JSON documents with UTF-8;
  - add image buffers and both documents to an `fflate.zipSync` input map;
  - return the ZIP `Buffer`.

- [ ] **Step 4: Run the unit tests to verify they pass**

  Run `pnpm --filter @shootspot/api exec vitest run src/web/export.test.ts`.
  Expected: PASS with all archive assertions green.

- [ ] **Step 5: Commit the archive unit**

  Run `git add services/api/src/web/export.ts services/api/src/web/export.test.ts services/api/package.json pnpm-lock.yaml && git commit -m "feat: build location export archives"`.

### Task 2: Add storage reads and authenticated web export routes

**Files:**

- Modify: `services/api/src/storage.ts`
- Modify: `services/api/src/web/routes.ts`
- Modify: `services/api/src/testing.ts` or its memory-storage helper, if required by typecheck
- Test: `services/api/test/api.int.test.ts` or a focused new web export integration test

- [ ] **Step 1: Write the failing API tests**

  Add integration coverage that creates two published records with ready media, signs in through a
  web session, and requests `GET /web/v1/export`. Assert a 200 ZIP response and inspect its JSON
  and image entries. Add a blocked/unpublished record and assert it is absent. Request
  `GET /web/v1/records/:id/export` and assert one record. Assert an unauthenticated request gets
  401 and an inaccessible record export gets 404.

- [ ] **Step 2: Run the API tests to verify they fail**

  Run `pnpm --filter @shootspot/api test:int -- --runInBand` or the focused integration test command
  used by the repository.
  Expected: FAIL with 404 for the missing export routes and/or the storage read type missing.

- [ ] **Step 3: Implement storage reads**

  Extend the API `Storage` interface with `get(bucket, key): Promise<Buffer>`. Implement it with
  `GetObjectCommand` and `Body.transformToByteArray()`, matching the worker storage behavior.

- [ ] **Step 4: Implement export route data loading**

  In `services/api/src/web/routes.ts`, add a shared loader that:

  - requires a `web` viewer;
  - selects the existing `PUBLIC_COLUMNS` plus exact `lat`/`lon` and the media ID;
  - restricts to `l.status = 'published'`, `m.state = 'ready'`, and `notBlocked(viewer.userId)`;
  - for a record route, adds `l.id = $2` and throws `notFound()` when no row exists;
  - reads each `derivative(media_id, 'detail')` WebP object through storage;
  - maps database rows to the archive record shape without storage URLs or internal fields.

- [ ] **Step 5: Implement the HTTP responses**

  Add `GET /web/v1/export` and `GET /web/v1/records/:id/export`. Build the archive, set
  `content-type: application/zip`, `content-disposition: attachment; filename="...zip"`,
  `cache-control: no-store`, and send the bytes. Use `shootspot-export-YYYY-MM-DD.zip` for the
  collection and a slugged label plus date for a single record.

- [ ] **Step 6: Run the API tests to verify they pass**

  Run the focused integration test, then `pnpm --filter @shootspot/api test:int`.
  Expected: the new export cases and all existing API integration tests pass.

- [ ] **Step 7: Commit the API export**

  Run `git add services/api/src/storage.ts services/api/src/web/routes.ts services/api/src/testing.ts services/api/test && git commit -m "feat: add authenticated web location exports"`.

### Task 3: Add the web download client and UI actions

**Files:**

- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/components/Chrome.tsx`
- Modify: `apps/web/src/components/Gallery.tsx`
- Modify: `apps/web/src/components/Detail.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `apps/web/src/lib/export.test.ts`

- [ ] **Step 1: Write the failing client test**

  Test `downloadExport(path, filename)` with a mocked successful `fetch`, `Response.blob()`,
  `URL.createObjectURL`, an anchor element, and `URL.revokeObjectURL`. Assert the request uses
  same-origin credentials and the anchor receives the expected download filename. Add a rejected
  response case that throws `ApiError`.

- [ ] **Step 2: Run the client test to verify it fails**

  Run `pnpm --filter @shootspot/web exec vitest run src/lib/export.test.ts`.
  Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the download helper**

  Add `downloadExport(path, filename)` in `apps/web/src/lib/api.ts`. Fetch the path with
  `credentials: 'same-origin'`, parse non-2xx responses using the existing `ApiError` convention,
  create an object URL from the ZIP blob, click a temporary hidden anchor, then revoke the URL.

- [ ] **Step 4: Add the account-menu action**

  Extend `AccountMenu` with an `onExportAll` callback. In `Gallery`, call
  `downloadExport('/web/v1/export', dateBasedFilename)` and show `Exporting…` plus an inline error
  state while active. Keep sign-out behavior unchanged.

- [ ] **Step 5: Add the detail action**

  Add an `Export this location` button beside `Copy link` in `Detail`. Call the record-specific
  endpoint and show busy/error feedback without closing the detail dialog.

- [ ] **Step 6: Add focused styling and accessibility**

  Style the export action using existing pill/button patterns, ensure disabled states are visible,
  and expose errors via `role="status"` or `role="alert"`. Do not alter mobile source files.

- [ ] **Step 7: Run web tests and typecheck**

  Run `pnpm --filter @shootspot/web test` and `pnpm --filter @shootspot/web typecheck`.
  Expected: all web tests pass and TypeScript exits 0.

- [ ] **Step 8: Commit the web UI**

  Run `git add apps/web/src && git commit -m "feat: add web location export controls"`.

### Task 4: Full verification

**Files:**

- No new source files; inspect the complete diff and existing mobile changes.

- [ ] **Step 1: Run all relevant checks**

  Run `pnpm --filter @shootspot/api typecheck`, `pnpm --filter @shootspot/api test`,
  `pnpm --filter @shootspot/api test:int`, `pnpm --filter @shootspot/web typecheck`,
  `pnpm --filter @shootspot/web test`, and `pnpm --filter @shootspot/web build`.

- [ ] **Step 2: Confirm scope**

  Run `git diff --name-only HEAD~3..HEAD` and confirm changed implementation files are only under
  `services/api`, `apps/web`, and export docs. Confirm no file under `apps/mobile` was changed by
  this feature.

- [ ] **Step 3: Review final diff**

  Run `git status --short` and `git diff --stat`. Preserve the pre-existing mobile Gradle changes
  and report them separately if they remain present.
