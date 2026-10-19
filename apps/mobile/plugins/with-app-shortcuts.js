// Adds native/ios/AppShortcuts.swift (Siri / Spotlight phrases) to the iOS app target only.
// @bacons/apple-targets can share files between the app and the widget (_shared/), but an
// AppShortcutsProvider must live in the app alone, so this copies it into the generated app
// folder and adds it to the app's sources.
const fs = require('node:fs');
const path = require('node:path');
const { IOSConfig, withDangerousMod, withXcodeProject } = require('expo/config-plugins');

const FILE = 'AppShortcuts.swift';

module.exports = function withAppShortcuts(config) {
  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
      fs.copyFileSync(
        path.join(cfg.modRequest.projectRoot, 'native', 'ios', FILE),
        path.join(cfg.modRequest.platformProjectRoot, name, FILE),
      );
      return cfg;
    },
  ]);
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const name = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const filepath = `${name}/${FILE}`;
    if (!project.hasFile(filepath)) {
      const target = IOSConfig.XcodeUtils.getApplicationNativeTarget({
        project,
        projectName: name,
      });
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: name,
        project,
        targetUuid: target.uuid,
      });
    }
    return cfg;
  });
};
