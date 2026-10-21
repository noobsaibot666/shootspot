# Public legal and support pages: draft texts

Source text for ShootSpot's pages on the shared docs hub (`https://docs.alan-design.com/shootspot/`, D-35). The Mac side ports these into the Starlight site under `legal/` and `user-guide/`. Based on [03-rights-privacy-data-ownership.md](../phase-0/03-rights-privacy-data-ownership.md) and [privacy-declarations.md](privacy-declarations.md).

- **Status:** draft; terms and privacy version `2026-10-21`, others `2026-10-draft` (matches `services/api/src/legal.ts`). The live terms text (with the D-41 zero-tolerance, reporting and blocking sections) is `docs-site/src/content/docs/legal/terms.md`. Counsel review is HANDWORK 4.1. When the wording changes, bump the version in `legal.ts` so that members are asked to accept it again.
- **Operator:** Alan Alves, trading as expose.u (sole proprietorship / Einzelunternehmen), Dudenstraße 24, 10965 Berlin, Germany; VAT ID DE461275084. Owner confirmed 2026-10-17: "Alan Alves", as on the expose-u.com Impressum (not the full legal name, for privacy). The privacy notice and terms also link to https://expose-u.com/impressum. It replaces `[OPERATOR — name, legal form, address]` below.
- **Published:** `docs-site/` (Starlight), live at https://docs.alan-design.com/shootspot/. When these drafts change, update the pages there too and redeploy (see `docs-site/README.md`).
- **Contact:** hello@expose-u.com (as CineFlow).

---

## Privacy notice (`legal/privacy`)

ShootSpot is a location-scouting app for photographers and filmmakers. Our principle is that we publish **places, not people**. Nobody should be able to learn where a specific person goes.

### Who is responsible

[OPERATOR — name, legal form, address]
Email: hello@expose-u.com

### What we process, and why

| Data                                                              | Purpose                                                                                      | Legal basis (GDPR)                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Email address                                                     | Your account and the sign-in codes we email you                                              | Contract, Art. 6(1)(b)                                              |
| Name; optional display name, bio, portfolio link, social handle   | Your profile. Shown publicly only on locations where you turn on "show my name"              | Contract, Art. 6(1)(b); consent for showing your name, Art. 6(1)(a) |
| Photos, location pin, capture time, direction, scouting notes     | The location records you publish for other members                                           | Contract, Art. 6(1)(b)                                              |
| Your device location while using the app                          | Pinning a photo and showing locations near you. Not stored for browsing                      | Contract, Art. 6(1)(b). Optional: you can place the pin by hand     |
| Projects, saved and liked locations                               | Your private lists. Likes are private: nobody else sees them, and there are no public counts | Contract, Art. 6(1)(b)                                              |
| Reports you file                                                  | Moderation                                                                                   | Legitimate interest in a safe service, Art. 6(1)(f)                 |
| Crash reports (no email, no user ID; coordinates removed)         | Fixing errors                                                                                | Legitimate interest, Art. 6(1)(f)                                   |
| Technical logs (IP address, for rate limits and abuse protection) | Security                                                                                     | Legitimate interest, Art. 6(1)(f)                                   |
| Your acceptance of these documents (version and time)             | Proof of consent                                                                             | Legal obligation, Art. 6(1)(c)                                      |

### Anonymous by default

Published locations are anonymous. The app and its servers never show who created a location unless you turn on "show my name" for that location. Showing your name links you to that place and the time you were there, and you can turn it off at any time. All photo metadata (such as GPS tags, camera serial numbers and owner names) is removed from published images. Moderators can see who created a location when they handle a report, and every such view is logged.

Published photos get a gentle automatic brightness and contrast balance. The original upload is not published.

### Who else receives data

We do not sell data, show ads, or track you across apps or websites. We use these service providers under data-processing agreements:

- **Brevo** (EU): sends sign-in emails.
- **Sentry** (EU region): crash reports, without your email or user ID.
- **Backblaze** (EU region): encrypted backups.
- **Cloudflare**: the secure connection to our server. It passes traffic through, including your IP address.
- **Google Maps** (Android) and **Apple Maps** (iOS): show the map. The map provider receives map requests from your device.

Our database, photos and backups are stored in the EU.

### How long we keep data

- **Your account, profile, projects and likes:** until you delete your account.
- **Published locations:** they stay in ShootSpot anonymously after you delete your account. The link between you and them is deleted, and your name is removed from them.
- **Backups:** kept for up to 35 days, then they expire.
- **Records of consent:** kept as minimal evidence, without your profile.

### Your rights

You can access, correct, export, restrict or delete your data, object to processing based on legitimate interest, and withdraw consent at any time. In the app, use _Settings → Request my data_ and _Settings → Delete account_, or write to hello@expose-u.com. You also have the right to complain to a data-protection supervisory authority.

### Age

ShootSpot is for people aged 18 and over.

---

## Terms of use (`legal/terms`)

### Provider

[OPERATOR — name, legal form, address], hello@expose-u.com

### The service

ShootSpot lets members publish and find photo and film locations. You must be 18 or older and sign in with your email address. The service is free. We may change or end features, and we tell members about important changes in the app.

### What you publish

- Only publish photos you took or have the right to share, under the Image licence.
- Do not publish:
  - private homes or gardens
  - places reachable only by trespassing
  - critical infrastructure or military sites
  - places where photography is illegal
  - images in which people can be identified without their consent
- Access to a place is your own responsibility. A location in ShootSpot does not mean you may enter it.
- Locations are anonymous unless you turn on "show my name". If you do, you are responsible for showing your name with that place and time.

### Moderation

Members can report locations. We may hide or remove content and suspend accounts that break these terms. If we act on your content and you disagree, write to hello@expose-u.com.

### Other members' content

Photos in ShootSpot are for viewing inside the app. You may not download, copy or reuse other members' photos.

### Liability

We provide ShootSpot as it is and cannot guarantee that information about a location is correct or current. We are fully liable for intent and gross negligence, and wherever the law requires. For slight negligence, we are liable only for breach of essential obligations, limited to typical, foreseeable damage.

### Ending your account

You can delete your account at any time (see Delete your account). Locations you published stay in ShootSpot anonymously, as the Privacy notice describes.

### Law

German law applies. This does not affect mandatory consumer protection in your country of residence.

---

## Image licence (`legal/image-licence`)

When you publish a photo in ShootSpot:

- You confirm that you took it or have the right to grant this licence.
- You grant the operator of ShootSpot a non-exclusive, worldwide, royalty-free licence to host and process the photo, and to display it inside ShootSpot to signed-in members. Processing includes resizing, removing metadata and adjusting brightness.
- The licence continues for locations that stay in ShootSpot after you delete your account.
- You keep your copyright. Other members get no right to download, reuse or redistribute your photo, and the app offers no download. Screenshots cannot be prevented.

---

## Delete your account (`legal/delete-account`; Google Play's web deletion URL)

### In the app

1. Open _Profile → menu → Settings_.
2. Tap _Delete account_ and confirm.

Your account is deleted after 7 days. Signing in during that time cancels the deletion. You can request a copy of your data first with _Settings → Request my data_.

### Without the app

Email hello@expose-u.com from the address you use for ShootSpot, with the subject "Delete my account". We confirm and delete it within 30 days.

### What is deleted, and what stays

- **Deleted:** your account and email, your profile, projects and likes, and the link between you and the locations you published. Your name is removed from those locations.
- **Kept anonymously:** the locations and photos you published, with no link to you.
- **Backups:** expire within 35 days.

---

## Support (`user-guide/support`)

Questions, problems or feedback: hello@expose-u.com. Please include your phone model and what you were doing. To report a location, use _Report_ on the location page in the app.
