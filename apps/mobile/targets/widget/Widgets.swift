import SwiftUI
import WidgetKit

// Quick-action widgets. They show no data: each tap opens the app on a quick-action route
// (QuickRoute in _shared/QuickIntents.swift), so they need no sign-in or location of their own.
//   Scout   — small + Lock Screen circle: straight to the camera.
//   Nearby  — small + Lock Screen circle: the Feed around where you are.
//   ShootSpot — medium: both buttons.
// Controls (iOS 18+) put the same two actions in Control Center, on the Lock Screen and on the
// Action button.

@main
struct ShootSpotWidgets: WidgetBundle {
  var body: some Widget {
    ScoutWidget()
    NearbyWidget()
    QuickActionsWidget()
    PublishLiveActivity()
    if #available(iOS 18.0, *) {
      ScoutControl()
      NearbyControl()
    }
  }
}

// MARK: - Timeline (static: the widgets never change)

struct QuickEntry: TimelineEntry {
  let date: Date
}

struct QuickProvider: TimelineProvider {
  func placeholder(in context: Context) -> QuickEntry { QuickEntry(date: .now) }

  func getSnapshot(in context: Context, completion: @escaping (QuickEntry) -> Void) {
    completion(QuickEntry(date: .now))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<QuickEntry>) -> Void) {
    completion(Timeline(entries: [QuickEntry(date: .now)], policy: .never))
  }
}

// MARK: - Actions

enum QuickAction {
  case scout, nearby

  var url: URL { self == .scout ? QuickRoute.scout : QuickRoute.nearby }
  var title: String { self == .scout ? "Scout" : "Nearby" }
  var subtitle: String { self == .scout ? "Photograph a spot" : "Locations around you" }
  var symbol: String { self == .scout ? "camera.fill" : "mappin.and.ellipse" }
  var accessibility: String {
    self == .scout ? "Scout a location with the camera" : "Show locations nearby"
  }
}

// MARK: - Widgets

struct ScoutWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ShootSpotScout", provider: QuickProvider()) { _ in
      SingleActionView(action: .scout)
    }
    .configurationDisplayName("Scout")
    .description("Open the camera to photograph a new location.")
    .supportedFamilies([.systemSmall, .accessoryCircular])
  }
}

struct NearbyWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ShootSpotNearby", provider: QuickProvider()) { _ in
      SingleActionView(action: .nearby)
    }
    .configurationDisplayName("Nearby")
    .description("See the locations around where you are.")
    .supportedFamilies([.systemSmall, .accessoryCircular])
  }
}

struct QuickActionsWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ShootSpotQuickActions", provider: QuickProvider()) { _ in
      QuickActionsView()
    }
    .configurationDisplayName("ShootSpot")
    .description("Scout a new location or see what's nearby.")
    .supportedFamilies([.systemMedium])
  }
}

// MARK: - Views

/// The app icon and name, top left of the Home Screen widgets.
struct BrandHeader: View {
  var body: some View {
    HStack(spacing: 6) {
      Image("brand")
        .resizable()
        .frame(width: 20, height: 20)
        .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
        .accessibilityHidden(true)
      Text("ShootSpot")
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(Color("ink"))
    }
  }
}

struct SingleActionView: View {
  let action: QuickAction
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      if family == .accessoryCircular {
        ZStack {
          AccessoryWidgetBackground()
          Image(systemName: action.symbol)
            .font(.system(size: 22, weight: .semibold))
            .widgetAccentable()
        }
        .widgetBackground(.clear)
      } else {
        VStack(alignment: .leading, spacing: 2) {
          BrandHeader()
          Spacer(minLength: 0)
          Image(systemName: action.symbol)
            .font(.system(size: 30, weight: .semibold))
            .foregroundStyle(Color("ink"))
            .padding(.bottom, 6)
          Text(action.title)
            .font(.system(size: 20, weight: .bold))
            .foregroundStyle(Color("ink"))
          Text(action.subtitle)
            .font(.system(size: 12))
            .foregroundStyle(Color("muted"))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .widgetBackground(Color("canvas"))
      }
    }
    .widgetURL(action.url)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(action.accessibility)
    .accessibilityAddTraits(.isButton)
  }
}

struct QuickActionsView: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      BrandHeader()
      HStack(spacing: 10) {
        ActionTile(action: .scout, filled: true)
        ActionTile(action: .nearby, filled: false)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetBackground(Color("canvas"))
  }
}

struct ActionTile: View {
  let action: QuickAction
  let filled: Bool

  var body: some View {
    Link(destination: action.url) {
      VStack(alignment: .leading, spacing: 2) {
        Image(systemName: action.symbol)
          .font(.system(size: 22, weight: .semibold))
        Spacer(minLength: 0)
        Text(action.title)
          .font(.system(size: 17, weight: .bold))
        Text(action.subtitle)
          .font(.system(size: 11))
          .opacity(0.7)
          .lineLimit(1)
      }
      .foregroundStyle(filled ? Color("onInk") : Color("ink"))
      .padding(12)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
      .background(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .fill(filled ? Color("ink") : Color("surface"))
      )
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(action.accessibility)
    .accessibilityAddTraits(.isButton)
  }
}

extension View {
  /// containerBackground on iOS 17+ (required there); a plain background before.
  @ViewBuilder
  func widgetBackground(_ color: Color) -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(color, for: .widget)
    } else {
      background(color)
    }
  }
}

// MARK: - Controls (Control Center, Lock Screen, Action button)

@available(iOS 18.0, *)
struct ScoutControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.exposeu.shootspot.control.scout") {
      ControlWidgetButton(action: ScoutIntent()) {
        Label("Scout", systemImage: "camera.fill")
      }
    }
    .displayName("Scout a location")
    .description("Open the ShootSpot camera.")
  }
}

@available(iOS 18.0, *)
struct NearbyControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "com.exposeu.shootspot.control.nearby") {
      ControlWidgetButton(action: NearbyIntent()) {
        Label("Nearby", systemImage: "mappin.and.ellipse")
      }
    }
    .displayName("Locations nearby")
    .description("Open ShootSpot on the locations around you.")
  }
}
