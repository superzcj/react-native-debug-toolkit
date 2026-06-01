'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { checkIosBundle } = require('./ios');
const { checkAndroidBundle } = require('./android');
const { detectPlatforms } = require('./setup');

function readZipEntriesWithUnzip(file) {
  const output = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' });
  return output.split(/\r?\n/).filter(Boolean);
}

async function doctorIos(options) {
  if (!options.app) {
    const result = checkIosBundle(options);
    if (!result.ok) {
      throw new Error(
        'iOS debug bundle setup is not active. '
        + 'Run `npm exec -- debug-toolkit setup-bundle --platform ios` after prebuild, '
        + 'or configure react-native-debug-toolkit/dev-client and regenerate native projects.',
      );
    }
    return { ...result, ok: true, platform: 'ios', mode: 'config' };
  }

  const bundle = path.join(options.app, 'main.jsbundle');
  if (!fs.existsSync(bundle)) {
    throw new Error(`main.jsbundle not found in ${options.app}`);
  }
  return { ok: true, platform: 'ios', mode: 'artifact', bundle };
}

async function doctorAndroid(options) {
  if (!options.apk) {
    const result = checkAndroidBundle(options);
    if (!result.ok) {
      throw new Error(`Android debug bundle setup is not active: ${result.reason || 'unknown'}.`);
    }
    return { ...result, ok: true, platform: 'android', mode: 'config' };
  }

  const readZipEntries = options.readZipEntries || readZipEntriesWithUnzip;
  const entries = await readZipEntries(options.apk);
  const bundle = entries.find((entry) => /^assets\/.+\.bundle$/.test(entry));
  if (!bundle) {
    throw new Error(`Android JS bundle not found in ${options.apk}`);
  }
  return { ok: true, platform: 'android', mode: 'artifact', bundle };
}

async function doctorBundle(options) {
  if (options.platform === 'ios') return doctorIos(options);
  if (options.platform === 'android') return doctorAndroid(options);
  if (options.platform === 'all') {
    const platforms = detectPlatforms(options.cwd);
    const results = [];
    for (const platform of platforms) {
      if (platform === 'ios') {
        results.push(await doctorIos({ ...options, platform }));
      } else if (platform === 'android') {
        results.push(await doctorAndroid({ ...options, platform }));
      }
    }
    return results;
  }
  throw new Error(`Unsupported platform for doctor-bundle: ${options.platform}`);
}

module.exports = { doctorBundle, readZipEntriesWithUnzip };
