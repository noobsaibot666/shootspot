# Phase 0 — Rights, Privacy, and Data Ownership Rules

**Status:** Product rules decided. All member-facing wording needs **counsel review** before public launch (plan §8 launch gates). The closed NAS prototype may run with clearly marked draft terms for invited testers only.

## 1. Privacy principle

> Nobody should be able to learn where a specific person goes.

ShootSpot publishes **places**, not people. Each record is anonymous unless its creator explicitly opts in (D-06, D-07).

## 2. Anonymity rules (enforced server-side)

1. The public record API **never returns** a creator id, handle, or any stable pseudonym for a non-attributed record. Hiding the creator only in the UI is not enough.
2. There is **no public per-user grouping**: no browsable profiles and no "more from this creator" for anonymous records. Ids exposed to clients must not be sequential, so they cannot be used to correlate records by creation order.
3. Public image derivatives are re-encoded with **all EXIF/XMP/IPTC removed** (GPS, device serial, owner name).
4. Capture time and location are public on the anonymous record (D-08). Once a creator turns on attribution, the record links those values to them. The responsibility notice must say this plainly.
5. Admins can see the creator for moderation. Every such view is recorded in `admin_audit_events`.
6. Analytics never contain exact coordinates, image content, or the creator–record link.

## 3. Attribution opt-in

- Per-record toggle, default off (*Proposed*). It can be turned off at any time, and attribution then disappears immediately.
- When it is on, the record shows the display name, plus the optional portfolio link and social handle.
- Responsibility notice (draft, *Counsel*): *"Showing your name links you to this place and the time you were here. You are responsible for this choice. We recommend keeping your locations anonymous."*
- Store the acceptance with the notice version and a timestamp.

## 4. Image license (V1)

- Members grant ShootSpot a **non-exclusive, worldwide, royalty-free license to host, process, resize, and display** the image inside the app to signed-in members. The license continues for records retained after account deletion (D-12). *Counsel* must confirm, and must check whether the future paid export (D-11) needs the license wording to cover it now.
- Other members get **no** download, reuse, or redistribution rights. The app provides no download action. Screenshots cannot be prevented, and the terms should say so.
- Members confirm they own the image or have the right to grant the license.
- Each license version is stored. Every media record references the version accepted at upload.

## 5. Data ownership model

| Data | Owner/controller | Visible to | On account deletion |
|---|---|---|---|
| Account (email, auth ids, sessions) | Member | Member, admins (limited) | Purged |
| Profile (name, surname, bio, portfolio, social handle) | Member | Member only; on attributed records, the display name and links only | Purged |
| Consents | Member/ShootSpot | Member, admins | Kept as minimal legal evidence, pseudonymized (*Counsel*) |
| Location record + media + scouting data | Licensed to ShootSpot | All signed-in members (anonymous) | **Retained anonymously**; the creator link is destroyed |
| Creator ↔ record link | ShootSpot (private) | Creator, admins (audited) | **Deleted** |
| Projects + saved items | Member | Member only | Purged |
| Reports filed | ShootSpot | Admins | Reporter identity removed |
| Admin audit events | ShootSpot | Owner role | Retained; personal fields pseudonymized |

**Model rule (plan §7):** creator identity sits in a separate `record_ownership` table and is not a column on `locations`. Deletion then removes that row and leaves the community record intact.

## 6. Account deletion workflow

1. The member requests deletion. A 7-day grace period applies (*Proposed*) and is cancelled by signing in.
2. Access is disabled and all sessions and tokens are revoked.
3. Data export is offered before final deletion.
4. Personal data is purged: profile, projects, account, and ownership links. Attribution is removed from all records.
5. Local drafts are cleared on next app launch.
6. Completion is logged with no personal data. Backups expire on their normal retention cycle (*Proposed*: 35 days), and the privacy notice states this.

## 7. Location safety policy

- **Prohibited:** private residences and gardens, locations reachable only by trespassing, critical infrastructure and military sites, and places where photography is illegal.
- Access type (advanced field) flags permission-needed and restricted places, with a reminder that access is the visitor's responsibility.
- Pins are stored and shown at full precision, as scouting requires. Reports can lead to removal or hiding. Admins may blur a pin to about 500 m for sensitive categories (*Proposed*).
- Report reasons: private property/residence · unsafe or illegal access · wrong location · inappropriate image · copyright · person identifiable · spam/duplicate · other.
- Moderation response target for the pilot: 72 hours (*Proposed*). The affected member gets a contact path for appeals.

## 8. GDPR baseline (D-01)

EU data region for the database, media, and backups · a lawful basis recorded per processing purpose · data export (Art. 15/20) · erasure (Art. 17, as above) · a records-of-processing document · DPAs with processors (map, geocoding, email, crash reporting) · privacy declarations for the App Store and Play Store · no third-party advertising SDKs.
