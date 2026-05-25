#!/usr/bin/env node

'use strict';

const {
  DAEMON_NAME,
  DEFAULT_HOST,
  DEFAULT_PORT,
  getDefaultDeviceStorePath,
  getLanIPs,
} = require('../node/daemon/src/constants');
const { createDaemonServer } = require('../node/daemon/src/server');
const { startStdioServer } = require('../node/mcp/src/server');

function readOption(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) {
    return fallback;
  }
  return args[index + 1] || fallback;
}

function hasHelpFlag(args) {
  return args.includes('--help') || args.includes('-h');
}

function printHelp() {
  process.stderr.write(
    'Usage: debug-toolkit [--host 0.0.0.0] [--port 3799] [--token dev-token] [--store ~/.react-native-debug-toolkit/daemon-devices.json] [--daemon-only]\n'
  + '\n'
  + 'Starts the debug toolkit: daemon (HTTP + Web Console) and MCP stdio server.\n'
  + '\n'
  + 'Options:\n'
  + '  --host <addr>   Host to bind (default: 0.0.0.0)\n'
    + '  --port <port>   Port to bind (default: 3799)\n'
  + '  --token <str>   Auth token for daemon endpoints\n'
  + '  --store <path>  Device log store path\n'
  + '  --daemon-only   Start only the HTTP daemon and Web Console\n'
  + '  -h, --help      Show this help\n',
  );
}

function hasDaemonOnlyFlag(args) {
  return args.includes('--daemon-only');
}

function getLocalOrigin(host, port) {
  const localHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  return `http://${localHost}:${port}`;
}

async function main() {
  const args = process.argv.slice(2);

  if (hasHelpFlag(args)) {
    printHelp();
    return;
  }

  const host = readOption(args, '--host', process.env.DEBUG_TOOLKIT_DAEMON_HOST || DEFAULT_HOST);
  const port = Number(readOption(args, '--port', process.env.DEBUG_TOOLKIT_DAEMON_PORT || DEFAULT_PORT));
  const token = readOption(args, '--token', process.env.DEBUG_TOOLKIT_DAEMON_TOKEN || '');
  const deviceStorePath = readOption(
    args,
    '--store',
    process.env.DEBUG_TOOLKIT_DAEMON_STORE || getDefaultDeviceStorePath(),
  );
  const daemonOnly = hasDaemonOnlyFlag(args);

  if (!Number.isFinite(port) || port <= 0) {
    process.stderr.write('Invalid --port value\n');
    process.exitCode = 1;
    return;
  }

  // Start daemon HTTP server in-process
  const { server } = createDaemonServer({ token, deviceStorePath });

  server.on('error', (error) => {
    process.stderr.write(`${DAEMON_NAME} failed to start: ${error.message}\n`);
    process.exitCode = 1;
  });

  await new Promise((resolve) => {
    server.listen(port, host, () => {
      const consolePath = token ? `/console?token=${encodeURIComponent(token)}` : '/console';
      process.stderr.write(`${DAEMON_NAME} listening on http://${host}:${port}\n`);
      process.stderr.write(`Web Console: ${getLocalOrigin(host, port)}${consolePath}\n`);
      process.stderr.write(`Device store: ${deviceStorePath}\n`);
      const lanIPs = getLanIPs();
      if (lanIPs.length > 0) {
        process.stderr.write(`LAN IPs: ${lanIPs.join(', ')}\n`);
      }
      resolve();
    });
  });

  const close = () => {
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', close);
  process.on('SIGTERM', close);

  if (daemonOnly) {
    return;
  }

  const origin = getLocalOrigin(host, port);

  // MCP stdio — daemon is in-process, skip HTTP health check
  startStdioServer({
    context: {
      ensureDaemon: async () => ({ ok: true, origin, spawned: false }),
    },
  });
}

main().catch((error) => {
  process.stderr.write(`Fatal: ${error.message}\n`);
  process.exitCode = 1;
});
