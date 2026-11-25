# ShootSpot — Future Ideas Backlog (Post-v1.5 / For Later Review)

**Status:** Unscheduled parking lot for product review  
**Purpose:** Capture strong ideas for v2.0+ or a future paid tier (`D-11`) that were intentionally held back from v1.5—either because they require paid APIs, heavier infrastructure, or post-pilot validation.

---

## 1. Environmental & Technical Tools (Require Paid APIs or Heavy Data)

- **Live Tide Tables (Height & Times):**
  - _What:_ Show exact high/low tide times and heights for `tideDependent: 'yes'` coastal locations on any chosen shoot date.
  - _Why deferred:_ Accurate global tide predictions typically require a paid/keyed API (e.g., WorldTides) or per-country hydrographic integrations.
- **3D Terrain, Elevation Profile & Shadow / Horizon Obstruction:**
  - _What:_ Account for mountains, valleys, or tall city buildings blocking the sun before theoretical sunset (similar to PhotoPills / Sun Seeker 3D).
  - _Why deferred:_ Requires Digital Elevation Model (DEM) tiles or 3D building footprints (OSM/Mapbox), adding tile hosting costs or paid SDKs.
- **Official Drone Airspace / No-Fly Zone Map Layer:**
  - _What:_ Render live airspace restrictions, temporary flight restrictions (TFRs), and airport zones directly on the ShootSpot Map tab.
  - _Why deferred:_ Reliable, legally current global/EU airspace data requires commercial aviation APIs or complex national aviation authority feeds.
- **Driving-Time Route Optimization in Projects:**
  - _What:_ Calculate actual driving/walking durations between saved project locations and auto-optimize multi-stop shoot routes.
  - _Why deferred:_ Google Directions / Mapbox Matrix APIs are billed per request. Could be revisited later with a self-hosted OSRM instance or paid tier.

---

## 2. Paid Tier & Production Workflow (`D-11` Candidates)

- **PDF Location-Timeline / Call-Sheet Export:**
  - _What:_ Export a formatted, branded PDF of a Project's locations (hero photo, map pin, coordinates, parking/permit/access notes, and shoot-day sun/weather timeline) for clients, directors, or crew.
  - _Why deferred:_ Explicitly earmarked in `D-11` as a flagship paid-tier feature.
- **Shareable Read-Only Project Links:**
  - _What:_ Generate a private, revocable web link to share a curated Project (with coordinates & notes) with a client or producer who doesn't have a ShootSpot account.
  - _Why deferred:_ Requires careful access-control/privacy design (`D-05`, `D-09`) and fits well alongside the paid tier.
- **Collaborative Team Projects:**
  - _What:_ Invite a DP, producer, or fellow photographer to co-edit a private Project, vote on spots, and assign shoot-day order.
  - _Why deferred:_ Out of V1/v1.5 single-owner project scope; adds permissions and notification complexity.
- **Offline Spot Packs (Region / Project Cache):**
  - _What:_ Download a Project or city radius (thumbnails, scouting notes, coordinates, sun-calc data, and optionally offline map tiles) for `mobileSignal: 'none'` shoots in mountains or rural areas.
  - _Why deferred:_ Offline vector map tiles require third-party map tile licensing (MapKit/Google Maps restrict offline tile caching).

---

## 3. AI & Smart Discovery (No Social/Photo-App Bloat)

- **Visual Similarity Search ("Find Spots Like This"):**
  - _What:_ Use lightweight image embeddings (computed in `services/worker` and stored in `pgvector`) to surface visually similar locations (_"More concrete brutalist interiors"_ or _"Similar coastal cliffs"_) or let a user upload a mood-board reference image to find matching real-world locations nearby.
  - _Why deferred:_ Requires adding `pgvector` and an embedding model to the worker container (watch TrueNAS memory caps).
- **Auto-Suggested Tags & Hazards on Capture/Import:**
  - _What:_ Suggest `goodFor` tags or detect time-of-day/indoor-vs-outdoor from the captured photo on-device to speed up the <30s short input form.
  - _Why deferred:_ Nice UX speed-up once core v1.5 scouting tools are live.

---

## 4. Platform & Web Expansion

- **Web (`apps/web`) Project & Shoot Planner:**
  - _What:_ Expand the read-only `apps/web` gallery so signed-in members can browse their private Projects, organize shoot-day timelines, and review sun/weather forecasts on a desktop monitor.
  - _Why deferred:_ Keeps mobile as the primary experience during pilot; strong candidate once web usage grows.
- **Multi-Language Localization (`D-03`):**
  - _What:_ Translate the app and controlled tag labels into major EU languages (DE, FR, ES, IT, etc.).
  - _Why deferred:_ Strings are structured for it, but English-only stays simpler during early iterations.
- **Home-Screen / Lock-Screen Golden Hour Widget:**
  - _What:_ iOS/Android widget showing today's Golden Hour / Blue Hour times for the user's current location or next scheduled Project shoot date.
  - _Why deferred:_ Native widget extension maintenance (`@bacons/apple-targets` / Android Glance) can wait until core v1.5 sun features stabilize.
