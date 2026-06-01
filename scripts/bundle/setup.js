'use strict';

const { setupIosBundle, undoIosBundle, checkIosBundle } = require('./ios');
const { setupAndroidBundle, undoAndroidBundle, checkAndroidBundle } = require('./android');

async function setupBundle(options) {
  const platforms = options.platform === 'all' ? ['ios', 'android'] : [options.platform];
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

module.exports = { setupBundle };
