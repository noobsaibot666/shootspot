import ActivityKit
import SwiftUI
import WidgetKit

// Publish progress (Live Activity): the photo, its name and sending → processing → live, in the
// Dynamic Island and on the Lock Screen. Started and updated by the app
// (modules/publish-activity); tapping opens the location once it exists.

struct PublishLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: PublishActivityAttributes.self) { context in
      PublishLockScreenView(context: context)
        .activityBackgroundTint(Color("canvas"))
        .activitySystemActionForegroundColor(Color("ink"))
        .widgetURL(Phase(context.state).link)
    } dynamicIsland: { context in
      let phase = Phase(context.state)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Thumbnail(draftId: context.attributes.draftId, size: 52)
            .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Image(systemName: phase.symbol)
            .font(.system(size: 24, weight: .semibold))
            .foregroundStyle(phase.tint)
            .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.attributes.title)
              .font(.system(size: 15, weight: .semibold))
              .lineLimit(1)
            Text(phase.title)
              .font(.system(size: 13))
              .foregroundStyle(.secondary)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        DynamicIslandExpandedRegion(.bottom) {
          StepBar(step: phase.step, tint: phase.tint)
            .padding(.horizontal, 4)
            .padding(.top, 4)
        }
      } compactLeading: {
        Thumbnail(draftId: context.attributes.draftId, size: 22)
      } compactTrailing: {
        Image(systemName: phase.symbol).foregroundStyle(phase.tint)
      } minimal: {
        Image(systemName: phase.symbol).foregroundStyle(phase.tint)
      }
      .widgetURL(phase.link)
      .keylineTint(phase.tint)
    }
  }
}

/// What each phase looks like. Sending and processing are steps 1–2 of 3; live completes it.
struct Phase {
  let name: String
  let recordId: String?

  init(_ state: PublishActivityAttributes.ContentState) {
    name = state.phase
    recordId = state.recordId
  }

  var title: String {
    switch name {
    case "sending": "Sending photo…"
    case "processing": "Processing…"
    case "live": "Live on ShootSpot"
    case "rejected": "Photo not accepted"
    default: "Saved on your phone"
    }
  }

  var detail: String {
    switch name {
    case "sending": "Keep scouting, it finishes on its own."
    case "processing": "Almost there."
    case "live": "Tap to open the location."
    case "rejected": "Open ShootSpot for the reason."
    default: "It's sent when you're back online."
    }
  }

  var symbol: String {
    switch name {
    case "sending": "arrow.up.circle"
    case "processing": "hourglass"
    case "live": "checkmark.circle.fill"
    case "rejected": "exclamationmark.circle.fill"
    default: "icloud.slash"
    }
  }

  var tint: Color {
    switch name {
    case "live": .green
    case "rejected": .red
    case "waiting": .orange
    default: Color("accent")
    }
  }

  var step: Int {
    switch name {
    case "sending": 1
    case "processing": 2
    case "live": 3
    default: 0
    }
  }

  /// The location once it exists, otherwise Profile (where drafts and own locations are listed).
  var link: URL {
    if let recordId, name == "live" || name == "rejected" {
      return URL(string: "shootspot://records/\(recordId)")!
    }
    return URL(string: "shootspot://profile")!
  }
}

struct PublishLockScreenView: View {
  let context: ActivityViewContext<PublishActivityAttributes>

  var body: some View {
    let phase = Phase(context.state)
    HStack(spacing: 12) {
      Thumbnail(draftId: context.attributes.draftId, size: 56)
      VStack(alignment: .leading, spacing: 3) {
        HStack(spacing: 6) {
          Image(systemName: phase.symbol).foregroundStyle(phase.tint)
          Text(phase.title).font(.system(size: 15, weight: .semibold))
        }
        Text(context.attributes.title)
          .font(.system(size: 14))
          .lineLimit(1)
        Text(phase.detail)
          .font(.system(size: 12))
          .foregroundStyle(Color("muted"))
          .lineLimit(1)
        if phase.step > 0 {
          StepBar(step: phase.step, tint: phase.tint).padding(.top, 3)
        }
      }
      .foregroundStyle(Color("ink"))
      Spacer(minLength: 0)
    }
    .padding(14)
    .accessibilityElement(children: .combine)
  }
}

/// Three segments: sent, processed, live.
struct StepBar: View {
  let step: Int
  let tint: Color

  var body: some View {
    HStack(spacing: 4) {
      ForEach(1...3, id: \.self) { i in
        Capsule()
          .fill(i <= step ? tint : Color.gray.opacity(0.35))
          .frame(height: 4)
      }
    }
    .accessibilityHidden(true)
  }
}

/// The photo from the App Group (written by the app when publishing starts), or the app icon.
struct Thumbnail: View {
  let draftId: String
  let size: CGFloat

  var body: some View {
    Group {
      if let url = PublishActivityStore.thumbnailURL(draftId),
        let image = UIImage(contentsOfFile: url.path)
      {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        Image("brand").resizable()
      }
    }
    .frame(width: size, height: size)
    .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
    .accessibilityHidden(true)
  }
}
