'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function readZipEntriesWithUnzip(file) {
  const output = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' });
  return output.split(/\r?\n/).filter(Boolean);
}

async function doctorIos(options) {
  if (!options.app) throw new Error('--app is required for iOS doctor.');
  const bundle = path.join(options.app, 'main.jsbundle');
  if (!fs.existsSync(bundle)) {
    throw new Error(`main.jsbundle not found in ${options.app}`);
  }
  return { ok: true, platform: 'ios', bundle };
}

async function doctorAndroid(options) {
  if (!options.apk) throw new Error('--apk is required for Android doctor.');
  const readZipEntries = options.readZipEntries || readZipEntriesWithUnzip;
  const entries = await readZipEntries(options.apk);
  const bundle = entries.find((entry) => /^assets\/.+\.bundle$/.test(entry));
  if (!bundle) {
    throw new Error(`Android JS bundle not found in ${options.apk}`);
  }
  return { ok: true, platform: 'android', bundle };
}

async function doctorBundle(options) {
  if (options.platform === 'ios') return doctorIos(options);
  if (options.platform === 'android') return doctorAndroid(options);
  throw new Error(`Unsupported platform for doctor-bundle: ${options.platform}`);
}

module.exports = { doctorBundle, readZipEntriesWithUnzip };
