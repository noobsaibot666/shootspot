import ActivityKit
import Foundation

// KEEP IN SYNC with apps/mobile/modules/publish-activity/ios/PublishActivityAttributes.swift.
// The app and this extension each compile their own copy; ActivityKit matches them by type name
// and encoded fields, so names and fields must be identical.

struct PublishActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    /// sending · processing · live · rejected · waiting
    var phase: String
    /// Set once the server has the record; the activity then opens the location.
    var recordId: String?
  }

  var draftId: String
  var title: String
}

enum PublishActivityStore {
  static let appGroup = "group.com.exposeu.shootspot"

  static func thumbnailURL(_ draftId: String) -> URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
      .appendingPathComponent("publish-thumbs", isDirectory: true)
      .appendingPathComponent("\(draftId).jpg")
  }
}
