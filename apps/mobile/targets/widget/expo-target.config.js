// iOS-only quick actions: Home Screen and Lock Screen widgets plus Control Center controls.
// Every action opens the app on shootspot://quick/<action> (src/app/quick/[action].tsx).
// _shared/ holds the App Intents used by both this extension and the app (Siri, controls).

/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'ShootSpotWidget',
  displayName: 'ShootSpot',
  bundleIdentifier: '.widget',
  // Same as the app. Controls (iOS 18) and the Siri hand-off are gated in Swift.
  deploymentTarget: '16.4',
  colors: {
    $widgetBackground: { light: '#FFFFFF', dark: '#0A0A0A' },
    $accent: { light: '#F0281A', dark: '#FF3B2C' },
    canvas: { light: '#FFFFFF', dark: '#0A0A0A' },
    ink: { light: '#0A0A0A', dark: '#F2F2F2' },
    onInk: { light: '#FFFFFF', dark: '#0A0A0A' },
    surface: { light: '#F3F3F3', dark: '#161616' },
    muted: { light: '#6E6E6E', dark: '#8C8C8C' },
  },
  images: {
    brand: '../../assets/icon.png',
  },
};
