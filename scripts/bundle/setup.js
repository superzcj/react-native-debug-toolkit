'use strict';

const {
  setupIosBundle,
  undoIosBundle,
  checkIosBundle,
  hasIosBundleProject,
} = require('./ios');
const {
  setupAndroidBundle,
  undoAndroidBundle,
  checkAndroidBundle,
  hasAndroidBundleProject,
} = require('./android');

function detectPlatforms(cwd) {
  const platforms = [];

  if (hasIosBundleProject(cwd)) {
    platforms.push('ios');
  }

  if (hasAndroidBundleProject(cwd)) {
    platforms.push('android');
  }

  if (platforms.length === 0) {
    throw new Error(
      'No iOS or Android native project found. Run from the app root, '
      + 'pass --platform ios|android from a native project, or use '
      + 'react-native-debug-toolkit/dev-client during Expo prebuild.',
    );
  }

  return platforms;
}

async function setupBundle(options) {
  const platforms = options.platform === 'all' ? detectPlatforms(options.cwd) : [options.platform];
  const results = [];

  for (const platform of platforms) {
    if (platform === 'ios') {
      if (options.undo) {
        results.push(undoIosBundle(options));
      } else if (options.check) {
        results.push(checkIosBundle(options));
      } else {
        results.push(setupIosBundle(options));
      }
      continue;
    }

    if (platform === 'android') {
      if (options.undo) {
        results.push(undoAndroidBundle(options));
      } else if (options.check) {
        results.push(checkAndroidBundle(options));
      } else {
        results.push(setupAndroidBundle(options));
      }
      continue;
    }

    throw new Error(`Unsupported platform: ${platform}`);
  }

  return results;
}

module.exports = { setupBundle, detectPlatforms };
