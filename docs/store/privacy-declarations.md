# Store privacy declarations (draft for HANDWORK 4.3)

**Draft answers** for App Store Connect (App Privacy) and Google Play (Data safety), based on what the app actually collects. Counsel and the privacy notice must agree before you submit them (HANDWORK 4.1). Update this file whenever data collection changes; Sentry (D-24) adds diagnostics.

## What the app collects

| Data                                                                          | Why                                                                       | Linked to the account?                                                                  | Shared with third parties?                               | Optional?                                        |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| Email address                                                                 | Sign-in codes, account                                                    | Yes                                                                                     | Email delivery processor (Brevo, D-26) only to send mail | Required                                         |
| Name (first, last), optional display name, bio, portfolio link, social handle | Profile; shown only on locations where the member turns on "show my name" | Yes                                                                                     | No                                                       | Name required, rest optional                     |
| Photos                                                                        | The location records members publish                                      | Internally yes (creator link, never public unless opted in)                             | No                                                       | Required to publish                              |
| Precise location                                                              | Pin of a published location; "nearby" browsing                            | The pin is part of the published record. Device location for browsing is **not stored** | No                                                       | Optional (manual pin and place search available) |
| Other user content (scouting notes, reports)                                  | Location records, moderation                                              | Yes (reports are private to moderators)                                                 | No                                                       | Optional                                         |
| User ID                                                                       | Account and session                                                       | Yes                                                                                     | No                                                       | Required                                         |
| Crash data / diagnostics (when Sentry is enabled)                             | Fixing crashes                                                            | No (no user ID or email sent; coordinates scrubbed)                                     | Sentry (EU) as processor                                 | —                                                |

**Not collected:** contacts, browsing history, advertising ID, health, financial data, audio, physical address, phone number.

**Not used for:** tracking across apps or websites, advertising, selling data, or profiling.

**Security:** data is encrypted in transit (HTTPS once public; see security review F2). Members can request deletion (Settings → Delete account) and export (Settings → Request my data).

## Apple: App Privacy answers (draft)

- **Data Used to Track You:** none.
- **Data Linked to You:** Contact Info (Email Address, Name); User Content (Photos, Other User Content); Identifiers (User ID); Location (Precise Location, as the published pin).
- **Data Not Linked to You:** Diagnostics (Crash Data), when Sentry is on.
- **Purpose** for all of the above: App Functionality. Diagnostics: App Functionality / Analytics: crash reporting only.

## Google Play: Data safety answers (draft)

- **Collected:** Personal info (email, name); Photos; Location (precise; part of user-published content); App activity (user-generated content); App info and performance (crash logs, when Sentry is on); Device or other IDs (user ID).
- **Shared:** No. Processors acting on our behalf don't count as sharing under Play's definition.
- **Encrypted in transit:** Yes, once served over HTTPS.
- **Deletion request:** Yes, in-app, plus a web/email route (add the URL to the listing).
- **Required vs optional:** email and photos to publish are required; location permission is optional.

## Permission strings (already in app.json)

- **Camera:** "ShootSpot uses the camera to photograph locations you scout."
- **Location (when in use):** "ShootSpot uses your location to pin the place you photograph and to show locations near you. You can always place the pin manually instead."
