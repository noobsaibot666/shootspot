import ActivityKit
import Foundation

// KEEP IN SYNC with apps/mobile/targets/widget/PublishActivityAttributes.swift. The app (this
// module) and the widget extension each compile their own copy; ActivityKit matches them by type
// name and encoded fields, so names and fields must be identical.

public struct PublishActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// sending · processing · live · rejected · waiting
    public var phase: String
    /// Set once the server has the record; the activity then opens the location.
    public var recordId: String?
  }

  public var draftId: String
  public var title: String
}

/// Shared with the widget, which can't read the app's files: small thumbnails of the photo.
enum PublishActivityStore {
  static let appGroup = "group.com.exposeu.shootspot"

  static func thumbnailURL(_ draftId: String) -> URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
      .appendingPathComponent("publish-thumbs", isDirectory: true)
      .appendingPathComponent("\(draftId).jpg")
  }
}
