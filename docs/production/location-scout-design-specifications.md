# Location Scout — Design Specifications

**Document type:** Visual and interaction specification for product design and implementation  
**Platforms:** iOS and Android mobile apps; responsive, admin-only website  
**Status:** Initial specification based on `05_UI_Design_System.md`, `design_direction.md`, and the product brief

## 1. Design intent

Create a precise, calm, premium tool for photographers and filmmakers. The visual language should feel technical and editorial, with clear structure and minimal decoration. Images are the main content in the mobile app; operational information is the main content in the admin website.

The two surfaces share typography, color tokens, spacing, borders, and motion principles. Their layouts differ by task:

- **Mobile:** immersive image discovery and fast, confident field capture.
- **Admin website:** efficient, information-dense operations and system management.

The reference documents include dashboard-specific elements and environmental-data examples. Those examples are design references, not product features. Do not add emissions metrics, data visualizations, Docker controls, or system-monitoring screens to the member app. Reuse dashboard patterns only for the admin website where they support actual operations.

## 2. Visual language

- Minimal, calm, technical, elegant, premium, responsive.
- Swiss-minimalist alignment and hierarchy with editorial restraint.
- Typography, image composition, grid, and contrast establish hierarchy; decoration is secondary.
- Flat surfaces, thin borders, little or no shadow, and restrained corner radii.
- No Bootstrap-like templates, default Material look, neon, decorative gradients, dashboard clutter, or excessive charts.
- Preserve platform conventions for permission prompts, system navigation, keyboard behavior, accessibility, and camera controls.

## 3. Shared design tokens

### Color

| Token | Initial value | Use |
|---|---|---|
| Canvas | `#D6D6D6` to `#E0E0E0` | Main workspace background; choose a stable default per surface and ensure text contrast. |
| Surface | `#EAEAEA` | Cards, sheets, form regions, and secondary surfaces. |
| Ink | `#111111` | Primary text, structural blocks, icons, key controls. |
| Ink secondary | `#1A1A1A` | Secondary dark surfaces and less prominent dark UI. |
| Divider | `#B5B5B5` or Ink at 15% opacity | Thin separators and outlines. |
| Signal red | `#FF3B30` | Errors, destructive states, warnings, or negative system status only. |
| Signal green | `#00A859` | Successful/safe status only; never the only signal. |
| White | `#FFFFFF` | Reserve for legible text/icons on dark surfaces and camera overlay contrast where needed. |

Use neutral colors for most of the interface. Keep semantic accents below roughly 5% of the visible interface, and never use red/green as the only way to convey state. Validate contrast in every theme. The light gray palette is a starting point from the references; the mobile image canvas may use dark/black surroundings where that improves photo viewing and camera legibility. Do not force one background color across every context.

### Typography

Use a neutral neo-grotesk sans-serif for interface text and a technical monospace for metadata. Preferred platform-native choices are SF Pro on iOS and a compatible system sans on Android; Inter is an acceptable shared web fallback. Use SF Mono or a compatible monospace for coordinates, bearings, timestamps, dimensions, and technical status.

| Level | Typeface / weight | Reference size | Usage |
|---|---|---:|---|
| Display | Sans bold/heavy | 32–40 px | Admin summary metrics or rare mobile feature heading; not routine feed chrome. |
| Section heading | Sans medium/semi-bold | 18–22 px | Page and sheet headings. |
| Component label | Sans medium/semi-bold, uppercase, tracking +1.5 px | 11–12 px | Compact admin labels and section metadata; avoid excessive uppercase on mobile. |
| Body | Sans regular | 13–15 px | Descriptions, notes, forms. |
| Metadata | Monospace regular/medium | 10–12 px | Dates, coordinates, bearings, technical status. |

Treat sizes as design references, not fixed pixel values. Use scalable text and platform accessibility settings. Compact line height is appropriate for short labels and dense admin content; long descriptions must remain comfortably readable and must not inherit overly tight dashboard leading.

### Shape, spacing, and depth

- Cards and controls generally use 8–12 px corner radii. Avoid rounding every element into a pill.
- Use 1 px borders/dividers in `#B5B5B5` or Ink at 15% opacity. Prefer borders and tonal contrast over drop shadows.
- Use generous separation between content groups, with compact spacing inside related controls.
- Establish spacing, type, and component-size tokens in Figma/design source before implementation; adapt values to platform density and device size.

## 4. Mobile app specification

### 4.1 Overall layout

The app is image-first. Photos should occupy most of the feed viewport, with location and creator information presented as concise, readable overlays or adjacent content. Controls should not obscure the image or compete with it.

- Prefer a dark image-viewing canvas or dark image backplate when it improves perceived photo quality; surrounding discovery/filter surfaces may use the neutral light palette.
- Keep feed chrome minimal. On scroll, secondary chrome can recede; when scrolling stops, return the controls with a short, smooth transition. Essential navigation, accessibility affordances, and status feedback must remain findable.
- Use safe areas and avoid content beneath camera cutouts, home indicators, or system gestures.
- Keep loading, empty, unavailable-location, permission-denied, offline, and upload-processing states visually consistent with the same restrained system.

### 4.2 Navigation and floating controls

The attached image is a visual reference for a compact, dark, floating navigation bar: a translucent/near-black rounded container with simple line icons and a separate circular add action. It does not determine final navigation labels or feature scope.

For the scout app:

- Provide a clear path to Feed, Projects/Collections, and Profile. Notifications or inbox should be included only if they serve a confirmed V1 use case.
- Make the camera capture action a prominent, easy-to-reach action. If it uses a separate floating button, visually distinguish it from navigation and ensure it does not cover feed content.
- Use consistent single-weight line icons with labels or accessible names. Selected state must be distinguishable beyond color alone.
- Use a translucent dark surface only where readability is maintained across bright and dark imagery. Consider a subtle opaque backplate when image contrast makes icons hard to see.
- Validate placement and interaction on small phones, large phones, one-handed reach, and accessibility text settings.

### 4.3 Feed cards and location detail

- Feed cards prioritize the photo, with restrained location name/distance, creator attribution, and save action.
- Use square or landscape media only. Feed crops may differ from detail crops only if the record’s composition is not misleading; do not crop away the published framing without an intentional preview treatment.
- Keep metadata compact and use monospace for technical facts such as distance or compass bearing. Use ordinary sans text for “Good for” and best-light notes.
- The location detail view should show a larger image, exact/approved map pin, location label, capture notes, best-light information, direction guidance, attribution, report action, and save-to-project action.
- Animate transitions from feed image to detail in a way that preserves context, but allow system Reduce Motion to disable or simplify motion.

### 4.4 Filters and location selection

Filters open in modern modal sheets or pop-ups consistent with the reference’s light, clean movement. They should not feel like a dense admin panel.

- Group controls by location, radius, and scouting attributes.
- Show current selection, clear/reset, apply, and cancellation behavior.
- Let people choose a place manually when device location is unavailable or denied.
- Keep current location scope visible in the feed so nearby and manually selected locations are not confused.
- Ensure sheets fit small screens, support keyboard/screen reader navigation, and allow dismissal without accidental loss when appropriate.

### 4.5 Camera and capture flow

- Provide a dedicated camera surface that supports the device-native capture capabilities in scope: tap-to-focus, exposure adjustment, and supported lens/zoom and flash/torch controls.
- Make landscape capture the default and provide a clear rotate-device cue. If vertical holding is allowed, show the resulting landscape crop clearly before the image is accepted.
- Show focus/exposure state and capture feedback without cluttering the viewfinder.
- After capture, show the final crop, allow retake, and continue into location and note confirmation.
- Keep camera controls large enough to use outdoors and with one hand. Maintain strong contrast over changing scenes using unobtrusive solid backplates.
- Request camera and location permission in context, explain the benefit, and provide recoverable denial states.

### 4.6 Forms, projects, and profile

- Use focused forms with clear labels, short helper text, visible required/optional status, and inline validation.
- “Good for” can use concise selectable tags and optional free text. Best light and shooting direction should use understandable labels, with technical values (time/bearing) in monospace where helpful.
- The direction input must name the meaning explicitly (for example, “Photographer faces” or “Camera points toward”). The final wording depends on the product decision.
- Projects are quiet organizational surfaces: image thumbnails, project name, count, and clear add/remove actions. Private project status should be explicit.
- Profile pages should be restrained and creator-focused: name, bio, portfolio link, social handle, contribution grid/list, and projects.

## 5. Admin website specification

### 5.1 Layout and navigation

The admin website is a separate responsive web application for owner/developer operations. The layout from the UI design system is applicable here:

- Top summary
- Warnings
- System
- Storage
- Backups
- Snapshots
- Security
- Activity

Use only sections that correspond to real V1 operational needs. Docker-specific sections are not required unless the deployed infrastructure actually exposes meaningful operator actions. Avoid empty dashboard widgets added only to fill the layout.

- Use a clear page title and a stable navigation rail/sidebar on desktop.
- On tablet/mobile web, collapse navigation into a drawer or compact menu and maintain access to critical actions.
- Keep page content aligned to a consistent grid, with clear primary action per page.
- Show persistent admin identity/role and a clear sign-out action.

### 5.2 Admin components

The following components from the UI reference are suitable for operational and moderation screens:

- `MetricCard` — only for actionable/meaningful current totals or trends.
- `HealthCard` — service, storage, backup, or processing health.
- `WarningCard` — actionable issue with severity and next step.
- `StatusBadge` — concise state, paired with readable text/icon.
- `ActivityTimeline` — auditable admin changes and system events.
- `JobDrawer` — details and retry/inspect controls for upload/processing jobs.
- `ResponsiveTable` — reports, users, locations, media, and audit events; provide a stacked/tablet view.
- `ConfirmationDialog` — destructive actions, with impact and reason where appropriate.

Additional moderation patterns: filterable reports queue, media/location preview, creator and record metadata, clear status/action controls, and visible audit history. User data should be limited to what the administrator needs for the task.

### 5.3 Admin tables and states

- Tables need a clear primary column, compact metadata, sorting/filter affordances, pagination or incremental loading, and responsive behavior.
- Avoid using color-only status. Pair color with text or icon.
- Destructive controls must be visually distinct and require confirmation. Use red for destructive/error states, not routine navigation.
- Empty, loading, partial failure, permission denied, and stale data states need designed views.
- Admin sign-in must support the selected MFA/authentication policy. Role denial must explain the access state without leaking sensitive information.

## 6. Motion and interaction

Motion should make navigation and feedback feel refined and smooth, while remaining quick and unobtrusive.

- Use short easing transitions for modal/sheet presentation, save feedback, capture confirmation, and feed-to-detail transitions.
- Use motion to communicate state and continuity, not decoration or prolonged parallax.
- Avoid layout shifts, excessive bounce, and animations that delay camera capture or admin actions.
- Respect Reduce Motion on both platforms; provide reduced or instant state changes.
- The direction reference mentions GSAP or a similar tool. Choose animation technology per platform rather than forcing one library: native/Reanimated-style motion on mobile and CSS/Web Animations or a suitable web library on the admin console. GSAP is optional, not a design requirement.
- Define timing and easing tokens during prototyping and verify on lower-end devices.

## 7. Accessibility and responsive behavior

- Support Dynamic Type/font scaling, screen readers, keyboard navigation for web, visible focus, adequate contrast, and semantic labels.
- Do not encode selected, error, or success states with color alone.
- Provide touch targets appropriate to mobile use, including outdoor camera use.
- Ensure landscape camera screens, compact portrait phones, large text, and system safe areas work correctly.
- Admin web must remain usable at desktop, tablet, and narrow mobile widths even though administration is primarily a web task.
- Avoid overly tight line-height for long content and maintain readable line lengths.

## 8. Design deliverables and handoff

Before implementation, create and review:

1. Shared color, typography, spacing, radius, border, icon, and motion tokens.
2. Mobile wireframes and high-fidelity screens for Feed, Filter sheet, Location detail, Camera, Crop/Publish, Projects, Profile, and permission/error states.
3. Admin web screens for Sign-in/MFA, Summary, Reports/Moderation, User/Location/Media inspection, Upload jobs, Security, Storage/Backups, and Activity/Audit.
4. Responsive layouts for phone, tablet, and desktop; dark camera/viewing context and light admin workspace.
5. Component states: default, selected, pressed, disabled, loading, error, success, empty, and destructive confirmation.
6. Prototype showing feed chrome hide/reveal, feed-to-detail transition, filter sheet, camera/crop flow, and admin moderation action.
7. Accessibility review and platform-specific behavior notes.

## 9. Open design decisions

- Confirm whether the mobile feed should use a consistently dark photo-viewing shell or a light shell with dark floating controls.
- Confirm the exact bottom navigation items. The reference displays home, inbox, notifications, layers, and add; the product brief requires feed, camera, profile, and projects.
- Decide whether the camera is a centered primary action, a separate floating control, or a capture tab.
- Define landscape crop ratio and how square photos appear in feed and detail.
- Define map treatment: embedded map, static preview, or map-app handoff.
- Confirm whether admin uses only light mode or needs dark mode; avoid adding theme complexity until operational need is clear.
- Confirm final brand name/logo and whether the industrial gray palette should be adjusted to complement location photography.

## 10. Source references

- `05_UI_Design_System.md` — minimal/calm/technical/premium direction, admin component list, and operational layout outline.
- `design_direction.md` — neutral gray/charcoal palette, restrained red/green semantics, sans/monospace pairing, compact hierarchy, flat surfaces, and motion guidance.
- Product brief image — compact dark floating navigation reference; interpret as visual inspiration only.
