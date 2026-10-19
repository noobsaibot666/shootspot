import AppIntents
import Foundation

// Linked into both the app and the widget extension: Control Center buttons run these, and
// Siri / Spotlight / the Shortcuts app list them through ShootSpotShortcuts (app target only,
// native/ios/AppShortcuts.swift). Each one opens the app on a quick-action route.

enum QuickRoute {
  static let scout = URL(string: "shootspot://quick/scout")!
  static let nearby = URL(string: "shootspot://quick/nearby")!
}

@available(iOS 18.0, *)
struct ScoutIntent: AppIntent {
  static let title: LocalizedStringResource = "Scout a location"
  static let description = IntentDescription(
    "Opens the ShootSpot camera so you can photograph a new location.")
  static let openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(QuickRoute.scout))
  }
}

@available(iOS 18.0, *)
struct NearbyIntent: AppIntent {
  static let title: LocalizedStringResource = "Show locations nearby"
  static let description = IntentDescription(
    "Opens ShootSpot on the locations around where you are.")
  static let openAppWhenRun: Bool = true

  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(QuickRoute.nearby))
  }
}
