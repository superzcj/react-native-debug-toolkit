'use strict';

const path = require('path');
const os = require('os');
const { DEFAULT_PORT } = require('../../protocol/constants');
const { createHubServer } = require('../../server/hubServer');

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
    return { ok: true, exitCode: 0 };
  } catch (err) {
    process.stderr.write(`Failed to start Hub: ${err.message}\n`);
    return { ok: false, exitCode: 1 };
  }
}

module.exports = { hubStartCommand };
