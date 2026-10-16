// Keeps the Display P3 colour profile on the iOS app icon (backlog 3.9).
// `expo prebuild` re-encodes icon.png into AppIcon.appiconset without its ICC profile, so the
// designer's P3 red is compiled as plain sRGB. After prebuild, copy the original (P3-tagged,
// opaque, 1024×1024) file over the generated one so actool keeps the wide-gamut colours.
const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod } = require('expo/config-plugins');

module.exports = function withP3AppIcon(config) {
  return withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const source = path.join(cfg.modRequest.projectRoot, 'assets', 'icon.png');
      const iosRoot = cfg.modRequest.platformProjectRoot;
      const sets = findAppIconSets(iosRoot);
      for (const set of sets) {
        for (const file of fs.readdirSync(set)) {
          if (/1024/.test(file) && file.endsWith('.png')) {
            fs.copyFileSync(source, path.join(set, file));
          }
        }
      }
      if (!sets.length)
        console.warn('[with-p3-app-icon] AppIcon.appiconset not found; icon left as generated');
      return cfg;
    },
  ]);
};

function findAppIconSets(dir, depth = 0) {
  if (depth > 4 || !fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'Pods' || entry.name === 'build') continue;
    const full = path.join(dir, entry.name);
    if (entry.name === 'AppIcon.appiconset') out.push(full);
    else out.push(...findAppIconSets(full, depth + 1));
  }
  return out;
}
