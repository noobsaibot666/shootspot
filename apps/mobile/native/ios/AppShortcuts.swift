import AppIntents

// Siri, Spotlight, the Shortcuts app and the Action button. App target only (an app may have
// one AppShortcutsProvider, in its main bundle); added by plugins/with-app-shortcuts.js.
// The intents themselves are in targets/widget/_shared/QuickIntents.swift. "Hey Siri, open
// ShootSpot" needs nothing from us; these add the two quick actions.

@available(iOS 18.0, *)
struct ShootSpotShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: ScoutIntent(),
      phrases: [
        "Scout a location with \(.applicationName)",
        "Scout with \(.applicationName)",
        "Take a photo with \(.applicationName)",
        "Open the \(.applicationName) camera",
        "New location in \(.applicationName)",
      ],
      shortTitle: "Scout",
      systemImageName: "camera.fill"
    )
    AppShortcut(
      intent: NearbyIntent(),
      phrases: [
        "Show locations near me in \(.applicationName)",
        "Show \(.applicationName) locations nearby",
        "What's nearby in \(.applicationName)",
        "Open \(.applicationName) nearby",
      ],
      shortTitle: "Nearby",
      systemImageName: "mappin.and.ellipse"
    )
  }
}
