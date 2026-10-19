// Android quick actions (D-40), the counterpart of the iOS widgets, controls and Siri phrases:
// home-screen widgets (Scout, Nearby, both), Quick Settings tiles (Scout, Nearby) and app
// shortcuts (long-press the icon). All open shootspot://quick/<scout|nearby>.
// Copies native/android/ (Kotlin + resources) into the generated project and registers the
// widgets, tiles and shortcuts in the manifest. The generated android/ folder is never edited.
const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const WIDGETS = [
  ['.quick.ScoutWidget', '@string/quick_scout', '@xml/quick_widget_scout'],
  ['.quick.NearbyWidget', '@string/quick_nearby', '@xml/quick_widget_nearby'],
  ['.quick.QuickActionsWidget', 'ShootSpot', '@xml/quick_widget_both'],
];
const TILES = [
  ['.quick.ScoutTile', '@string/quick_scout_long', '@drawable/quick_camera'],
  ['.quick.NearbyTile', '@string/quick_nearby_long', '@drawable/quick_pin'],
];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

const has = (list, name) => (list ?? []).some((x) => x.$['android:name'] === name);

module.exports = function withAndroidQuickActions(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const native = path.join(cfg.modRequest.projectRoot, 'native', 'android');
      const main = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main');
      const pkg = cfg.android.package.split('.');
      copyDir(path.join(native, 'res'), path.join(main, 'res'));
      copyDir(path.join(native, 'java'), path.join(main, 'java', ...pkg, 'quick'));
      return cfg;
    },
  ]);

  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    app.receiver = app.receiver ?? [];
    app.service = app.service ?? [];
    for (const [name, label, info] of WIDGETS) {
      if (has(app.receiver, name)) continue;
      app.receiver.push({
        $: { 'android:name': name, 'android:exported': 'false', 'android:label': label },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }] },
        ],
        'meta-data': [
          { $: { 'android:name': 'android.appwidget.provider', 'android:resource': info } },
        ],
      });
    }
    for (const [name, label, icon] of TILES) {
      if (has(app.service, name)) continue;
      app.service.push({
        $: {
          'android:name': name,
          'android:exported': 'true',
          'android:label': label,
          'android:icon': icon,
          'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
        },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }] },
        ],
      });
    }
    const main = app.activity.find((a) => a.$['android:name'] === '.MainActivity');
    main['meta-data'] = main['meta-data'] ?? [];
    if (!has(main['meta-data'], 'android.app.shortcuts')) {
      main['meta-data'].push({
        $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/quick_shortcuts' },
      });
    }
    return cfg;
  });
};
