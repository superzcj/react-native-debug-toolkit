'use strict';

const os = require('os');
const path = require('path');

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 3799;
const DAEMON_NAME = 'react-native-debug-toolkit-daemon';
const DAEMON_VERSION = '0.1.0';
const REPORT_PROTOCOL_VERSION = 2;

function getLanIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family === 'IPv4' && !entry.internal) {
        ips.push(entry.address);
      }
    }
  }
  return ips;
}

function getDefaultDeviceStorePath() {
  return path.join(os.homedir(), '.react-native-debug-toolkit', 'daemon-devices.json');
}

module.exports = {
  DAEMON_NAME,
  DAEMON_VERSION,
  DEFAULT_HOST,
  DEFAULT_PORT,
  REPORT_PROTOCOL_VERSION,
  getDefaultDeviceStorePath,
  getLanIPs,
};
