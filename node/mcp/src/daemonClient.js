'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const {
  DEFAULT_DAEMON_ORIGIN,
  EXPECTED_PROTOCOL_VERSION,
} = require('./constants');
const { requestJson } = require('./httpClient');

function getDaemonOrigin() {
  return process.env.DEBUG_TOOLKIT_DAEMON_ORIGIN || DEFAULT_DAEMON_ORIGIN;
}

async function readHealth(origin = getDaemonOrigin()) {
  const response = await requestJson(origin, '/health', { timeoutMs: 800 });
  if (response.status !== 200 || !response.body?.ok) {
    throw new Error(`Daemon health check failed with status ${response.status}`);
  }
  if (response.body.protocolVersion !== EXPECTED_PROTOCOL_VERSION) {
    throw new Error(
      `Daemon protocol mismatch: expected ${EXPECTED_PROTOCOL_VERSION}, got ${response.body.protocolVersion}`,
    );
  }
  return response.body;
}

function findDaemonBin() {
  if (process.env.DEBUG_TOOLKIT_DAEMON_BIN) {
    return process.env.DEBUG_TOOLKIT_DAEMON_BIN;
  }

  try {
    return require.resolve('react-native-debug-toolkit/bin/debug-toolkit.js');
  } catch {
    const localPath = path.resolve(__dirname, '../../../bin/debug-toolkit.js');
    return fs.existsSync(localPath) ? localPath : null;
  }
}

function getDaemonBindHost() {
  return process.env.DEBUG_TOOLKIT_DAEMON_HOST || '0.0.0.0';
}

function spawnDaemon(origin = getDaemonOrigin()) {
  const daemonBin = findDaemonBin();
  if (!daemonBin) {
    throw new Error('Cannot find react-native-debug-toolkit debug-toolkit bin');
  }

  const url = new URL(origin);
  const child = spawn(process.execPath, [
    daemonBin,
    '--daemon-only',
    '--host',
    getDaemonBindHost(),
    '--port',
    url.port || '3799',
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDaemon(options = {}) {
  const origin = options.origin || getDaemonOrigin();
  const timeoutMs = options.timeoutMs || 3000;
  const pollMs = options.pollMs || 150;
  const startedAt = Date.now();

  try {
    return { ok: true, health: await readHealth(origin), origin, spawned: false };
  } catch (initialError) {
    try {
      spawnDaemon(origin);
    } catch (spawnError) {
      return {
        ok: false,
        origin,
        error: `${initialError.message}; ${spawnError.message}`,
      };
    }
  }

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(pollMs);
    try {
      return { ok: true, health: await readHealth(origin), origin, spawned: true };
    } catch {
      // Keep polling until timeout; the detached daemon may still be binding.
    }
  }

  return {
    ok: false,
    origin,
    error: `Daemon did not become healthy within ${timeoutMs}ms at ${origin}`,
  };
}

async function readSession(origin, sessionId) {
  const requestPath = sessionId ? `/sessions/${encodeURIComponent(sessionId)}` : '/latest';
  const response = await requestJson(origin, requestPath, { timeoutMs: 3000 });
  if (response.status !== 200 || !response.body?.ok) {
    throw new Error(response.body?.error || `Daemon request failed with status ${response.status}`);
  }
  return response.body;
}

async function readSessions(origin) {
  const response = await requestJson(origin, '/sessions', { timeoutMs: 3000 });
  if (response.status !== 200 || !response.body?.ok) {
    throw new Error(response.body?.error || `Daemon request failed with status ${response.status}`);
  }
  return response.body;
}

module.exports = {
  ensureDaemon,
  findDaemonBin,
  getDaemonOrigin,
  readHealth,
  readSession,
  readSessions,
};
