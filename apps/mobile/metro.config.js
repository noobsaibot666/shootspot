// Metro config: Expo defaults, minus the native build output Metro never needs.
// The generated android/ and ios/ folders and native .cxx build caches change by the thousands
// of files during a local build (tools/android-local.ps1 -Clean); watching them made Metro hang
// and the app load a white screen.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  /[\\/]apps[\\/]mobile[\\/](android|ios)[\\/].*/,
  /[\\/]\.cxx[\\/].*/,
  /[\\/]android[\\/](build|\.gradle)[\\/].*/,
];

module.exports = config;
