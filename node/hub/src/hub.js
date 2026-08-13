'use strict';

const { createHubServer } = require('./server/hubServer');

const bindAddress = process.env.DEBUG_TOOLKIT_HUB_BIND || '127.0.0.1';
const port = Number(process.env.DEBUG_TOOLKIT_HUB_PORT || 3800);
const dataDir = process.env.DEBUG_TOOLKIT_HUB_DATA_DIR || '/Users/Shared/ReactNativeDebugToolkitHub/data';
const advertiseUrl = process.env.DEBUG_TOOLKIT_HUB_ADVERTISE_URL || `http://${bindAddress}:${port}`;
const hub = createHubServer({ bindAddress, port, dataDir, advertiseUrl });

const stop = () => hub.stop().finally(() => process.exit(0));
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
hub.start().catch((error) => {
  process.stderr.write(`Failed to start Hub: ${error.message}\n`);
  process.exit(1);
});
