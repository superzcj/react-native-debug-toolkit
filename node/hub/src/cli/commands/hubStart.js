'use strict';

const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { DEFAULT_PORT } = require('../../protocol/constants');
const { createHubServer } = require('../../server/hubServer');
const { isLoopback } = require('../../protocol/validation');

function findLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) return address.address;
    }
  }
  return '127.0.0.1';
}

function resolveDevOptions(options = {}, cwd = process.cwd()) {
  if (options.localHubEndpoint) {
    let parsed;
    try {
      parsed = new URL(options.localHubEndpoint);
    } catch (err) {
      const error = new Error('DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT is invalid');
      error.code = 'INVALID_ARGUMENT';
      throw error;
    }
    if (!isLoopback(parsed.hostname)) {
      const error = new Error('DEBUG_TOOLKIT_LOCAL_HUB_ENDPOINT must be a loopback URL');
      error.code = 'INVALID_ARGUMENT';
      throw error;
    }
    const port = Number(parsed.port || DEFAULT_PORT);
    return {
      ...options,
      bind: '127.0.0.1',
      port,
      dataDir: options.dataDir || path.join(cwd, '.debug-toolkit', 'hub'),
      advertiseUrl: `http://127.0.0.1:${port}`,
    };
  }
  const url = options.url || options.advertiseUrl;
  const port = options.port || (url ? Number(new URL(url).port || DEFAULT_PORT) : DEFAULT_PORT);
  return {
    ...options,
    bind: options.bind || '0.0.0.0',
    port,
    dataDir: options.dataDir || path.join(cwd, '.debug-toolkit', 'hub'),
    advertiseUrl: url || `http://${findLanAddress()}:${port}`,
  };
}

function tryAdbReverse(port) {
  return new Promise((resolve) => {
    execFile('adb', ['devices'], { timeout: 3000 }, (devicesError, stdout) => {
      if (devicesError) {
        process.stderr.write('adb reverse skipped (adb unavailable)\n');
        resolve({ attempted: false, ok: false });
        return;
      }

      const hasDevice = String(stdout || '')
        .split('\n')
        .some((line) => /\tdevice$/.test(line.trim()));
      if (!hasDevice) {
        process.stderr.write('adb reverse skipped (no Android device/emulator)\n');
        resolve({ attempted: false, ok: false });
        return;
      }

      execFile(
        'adb',
        ['reverse', `tcp:${port}`, `tcp:${port}`],
        { timeout: 5000 },
        (reverseError) => {
          if (reverseError) {
            process.stderr.write(`adb reverse tcp:${port} tcp:${port} failed: ${reverseError.message}\n`);
            resolve({ attempted: true, ok: false });
            return;
          }
          process.stderr.write(`adb reverse tcp:${port} tcp:${port} applied\n`);
          resolve({ attempted: true, ok: true });
        },
      );
    });
  });
}

async function hubStartCommand(options) {
  const bind = options.bind || '127.0.0.1';
  const port = options.port || DEFAULT_PORT;
  const dataDir = options.dataDir || path.join(os.homedir(), '.react-native-debug-toolkit', 'hub-data');
  const advertiseUrl = options.advertiseUrl || `http://${bind}:${port}`;

  const { start, stop } = createHubServer({
    dataDir,
    bindAddress: bind,
    port,
    advertiseUrl,
  });

  const close = () => {
    stop().then(() => process.exit(0)).catch(() => process.exit(1));
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);

  try {
    await start();
    process.stderr.write(`Hub loopback: http://127.0.0.1:${port}\n`);
    process.stderr.write(`Hub LAN:      ${advertiseUrl}\n`);
    await tryAdbReverse(port);
    return { ok: true, exitCode: 0 };
  } catch (err) {
    process.stderr.write(`Failed to start Hub: ${err.message}\n`);
    return { ok: false, exitCode: 1 };
  }
}

module.exports = { hubStartCommand, resolveDevOptions, tryAdbReverse };
