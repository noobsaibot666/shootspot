import ActivityKit
import ExpoModulesCore
import UIKit

/// Publish progress as a Live Activity (Dynamic Island and Lock Screen), one per draft.
/// JS calls `sync` on every step (src/lib/publish-activity.ts); the views live in the widget
/// extension (targets/widget/PublishActivity.swift).
public class PublishActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PublishActivity")

    AsyncFunction("sync") {
      (draftId: String, title: String, phase: String, recordId: String?, photoUri: String?) in
      await PublishActivities.sync(
        draftId: draftId, title: title, phase: phase, recordId: recordId, photoUri: photoUri)
    }
  }
}

enum PublishActivities {
  /// Finished activities stay on the Lock Screen this long; the Dynamic Island clears at once.
  static let lingerLive: TimeInterval = 5 * 60
  static let lingerOther: TimeInterval = 15 * 60

  static func sync(
    draftId: String, title: String, phase: String, recordId: String?, photoUri: String?
  ) async {
    let state = PublishActivityAttributes.ContentState(phase: phase, recordId: recordId)
    let final = phase == "live" || phase == "rejected" || phase == "waiting"
    let existing = Activity<PublishActivityAttributes>.activities.first {
      $0.attributes.draftId == draftId
    }

    if let activity = existing {
      let content = ActivityContent(state: state, staleDate: nil)
      if final {
        let linger = phase == "live" ? lingerLive : lingerOther
        await activity.end(content, dismissalPolicy: .after(.now + linger))
      } else {
        await activity.update(content)
      }
      return
    }

    // Start only while publishing is under way, and only when the member allows Live Activities.
    guard !final, ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    writeThumbnail(draftId: draftId, photoUri: photoUri)
    let attributes = PublishActivityAttributes(draftId: draftId, title: title)
    // Processing normally takes seconds; marked stale after 10 minutes if the app never hears back.
    let content = ActivityContent(state: state, staleDate: .now + 10 * 60)
    _ = try? Activity.request(attributes: attributes, content: content, pushType: nil)
  }

  /// A ~200 px JPEG in the App Group for the widget, plus a sweep of day-old ones.
  private static func writeThumbnail(draftId: String, photoUri: String?) {
    guard let target = PublishActivityStore.thumbnailURL(draftId) else { return }
    let folder = target.deletingLastPathComponent()
    let fm = FileManager.default
    try? fm.createDirectory(at: folder, withIntermediateDirectories: true)
    if let old = try? fm.contentsOfDirectory(
      at: folder, includingPropertiesForKeys: [.contentModificationDateKey])
    {
      for file in old {
        let date = (try? file.resourceValues(forKeys: [.contentModificationDateKey]))?
          .contentModificationDate
        if let date, date < .now - 24 * 3600 { try? fm.removeItem(at: file) }
      }
    }

    guard let photoUri, let url = URL(string: photoUri),
      let image = UIImage(contentsOfFile: url.path)
    else { return }
    let height: CGFloat = 200
    let size = CGSize(width: height * image.size.width / max(image.size.height, 1), height: height)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let small = UIGraphicsImageRenderer(size: size, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: size))
    }
    try? small.jpegData(compressionQuality: 0.7)?.write(to: target, options: .atomic)
  }
}
