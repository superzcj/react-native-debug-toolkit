'use strict';

const {
  DAEMON_NAME,
  DEFAULT_HOST,
  DEFAULT_PORT,
  getLanIPs,
} = require('./constants');
const { createDaemonServer } = require('./server');

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
  process.stdout.write('Usage: debug-toolkit-daemon [--host 0.0.0.0] [--port 3799] [--token dev-token]\n');
}

function getLocalOrigin(host, port) {
  const localHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  return `http://${localHost}:${port}`;
}

function startDaemonFromCli(args) {
  if (hasHelpFlag(args)) {
    printHelp();
    return;
  }

  const host = readOption(args, '--host', process.env.DEBUG_TOOLKIT_DAEMON_HOST || DEFAULT_HOST);
  const port = Number(readOption(args, '--port', process.env.DEBUG_TOOLKIT_DAEMON_PORT || DEFAULT_PORT));
  const token = readOption(args, '--token', process.env.DEBUG_TOOLKIT_DAEMON_TOKEN || '');

  if (!Number.isFinite(port) || port <= 0) {
    process.stderr.write('Invalid --port value\n');
    process.exitCode = 1;
    return;
  }

  const { server } = createDaemonServer({ token });

  server.on('error', (error) => {
    process.stderr.write(`${DAEMON_NAME} failed to start: ${error.message}\n`);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    const consolePath = token ? `/console?token=${encodeURIComponent(token)}` : '/console';
    process.stderr.write(`${DAEMON_NAME} listening on http://${host}:${port}\n`);
    process.stderr.write(`Web Console: ${getLocalOrigin(host, port)}${consolePath}\n`);
    const lanIPs = getLanIPs();
    if (lanIPs.length > 0) {
      process.stderr.write(`LAN IPs: ${lanIPs.join(', ')}\n`);
    }
  });

  const close = () => {
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

module.exports = {
  startDaemonFromCli,
};
