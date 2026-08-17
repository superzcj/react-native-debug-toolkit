'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createHubServer } = require('../../../src/server/hubServer');

const APP_ID = 'com.example.eval';
const NOW_MS = 1_786_934_400_000;
const AT_1032_MS = Date.parse('2026-08-17T02:32:00.000Z');
const AT_1032_ISO = '2026-08-17T10:32:00+08:00';
const RECEIVED_1040_ISO = '2026-08-17T02:40:00.000Z';

function uuid(n) {
  return `223e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`;
}

function safeAppDir(appId) {
  return appId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128);
}

function hubRequest(port, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: pathname,
      headers: body ? { 'content-type': 'application/json' } : undefined,
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({
        status: res.statusCode,
        body: raw ? JSON.parse(raw) : null,
      }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function startHub(dataDir) {
  const server = createHubServer({ dataDir, bindAddress: '127.0.0.1', port: 0 });
  const started = await server.start();
  const url = `http://127.0.0.1:${started.address.port}`;
  return { server, port: started.address.port, url, dataDir };
}

async function openSession(port, { appId = APP_ID, sessionId, device = {}, startedAt = NOW_MS }) {
  const opened = await hubRequest(port, 'POST', `/api/v1/apps/${appId}/sessions`, {
    protocolVersion: 1,
    canonicalVersion: 1,
    sessionId,
    startedAt,
    clientAckThrough: 0,
    device: {
      platform: 'ios',
      osVersion: '18',
      model: 'iPhone 15',
      appVersion: '4.0.0',
      nativeApplicationId: appId,
      ...device,
    },
  });
  if (opened.status !== 201) {
    throw new Error(`openSession failed: ${opened.status}`);
  }
}

async function appendEvents(port, { appId = APP_ID, sessionId, events }) {
  const appended = await hubRequest(port, 'POST', `/api/v1/apps/${appId}/sessions/${sessionId}/events`, {
    firstSequence: events[0].sequence,
    events,
  });
  if (!appended.body?.ok) {
    throw new Error('appendEvents failed');
  }
}

function sessionDir(dataDir, appId, sessionId) {
  return path.join(dataDir, safeAppDir(appId), sessionId);
}

function patchManifest(dataDir, appId, sessionId, patch) {
  const manifestPath = path.join(sessionDir(dataDir, appId, sessionId), 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  Object.assign(manifest, patch);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
}

function patchEventReceivedAt(dataDir, appId, sessionId, sequence, receivedAt) {
  const eventsPath = path.join(sessionDir(dataDir, appId, sessionId), 'events.jsonl');
  const lines = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean);
  const next = lines.map((line) => {
    const event = JSON.parse(line);
    if (event.sequence === sequence) {
      return JSON.stringify({ ...event, receivedAt });
    }
    return line;
  });
  fs.writeFileSync(eventsPath, `${next.join('\n')}\n`);
}

async function seedNetwork401(port, sessionId, timestamp = AT_1032_MS) {
  await appendEvents(port, {
    sessionId,
    events: [{
      sequence: 1,
      timestamp,
      type: 'network',
      severity: 'error',
      data: { request: { url: '/login' }, response: { status: 401 } },
    }],
  });
}

async function scenarioSingleLogin401() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-login-401-'));
  const hub = await startHub(dataDir);
  const sessionId = uuid(1);
  await openSession(hub.port, { sessionId });
  await seedNetwork401(hub.port, sessionId);
  return {
    id: 'single_login_401',
    hubs: [{ endpoint: hub.url, ready: true, apps: [{ appId: APP_ID, sessions: [] }] }],
    servers: [hub],
    endpoints: [hub.url],
    localEndpoint: hub.url,
    projectEndpoint: null,
    turnStart: NOW_MS,
    secrets: ['Authorization: Bearer secret-token'],
    userActions: [],
    truth: {
      appId: APP_ID,
      sessionId,
      hub: hub.url,
      expectedState: 'evidence_ready',
      has401: true,
    },
    async stop() {
      await hub.server.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function scenarioTwoActiveDevices() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-two-devices-'));
  const hub = await startHub(dataDir);
  const s1 = uuid(1);
  const s2 = uuid(2);
  await openSession(hub.port, { sessionId: s1, device: { model: 'iPhone 15' } });
  await openSession(hub.port, { sessionId: s2, device: { model: 'Pixel 8' } });
  await seedNetwork401(hub.port, s1);
  await seedNetwork401(hub.port, s2);
  return {
    id: 'two_active_devices',
    hubs: [{ endpoint: hub.url, ready: true, apps: [{ appId: APP_ID, sessions: [] }] }],
    servers: [hub],
    endpoints: [hub.url],
    localEndpoint: hub.url,
    turnStart: NOW_MS,
    secrets: [],
    userActions: [{ turn: 2, text: 'iPhone 15' }],
    truth: { appId: APP_ID, sessionIds: [s1, s2], hub: hub.url },
    async stop() {
      await hub.server.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function scenarioHubStoppedThenCapture() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-hub-stopped-'));
  const closedUrl = 'http://127.0.0.1:39999';
  const fixture = {
    id: 'hub_stopped_then_capture',
    hubs: [],
    servers: [],
    endpoints: [closedUrl],
    localEndpoint: closedUrl,
    localDataDir: dataDir,
    turnStart: NOW_MS,
    secrets: [],
    userActions: [
      { turn: 2, text: 'Hub 已启动，App 已打开' },
      { turn: 3, text: '已点 Upload Once' },
    ],
    truth: { expectedFirstCode: 'LOCAL_HUB_NOT_RUNNING', appId: APP_ID },
    async mutate(turn, broker) {
      if (turn !== 2) return;
      const hub = await startHub(dataDir);
      fixture.servers.push(hub);
      fixture.endpoints = [hub.url];
      fixture.localEndpoint = hub.url;
      broker.setAllowedEndpoints(fixture.endpoints);
      const sessionId = uuid(10);
      await openSession(hub.port, { sessionId });
      fixture.truth.sessionId = sessionId;
    },
    async stop() {
      for (const hub of fixture.servers) {
        await hub.server.stop();
      }
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
  return fixture;
}

async function scenarioRemoteWithUnrelatedLocal() {
  const localDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-local-'));
  const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-remote-'));
  const local = await startHub(localDir);
  const remote = await startHub(remoteDir);
  const localSession = uuid(1);
  const remoteSession = uuid(2);
  await openSession(local.port, { appId: 'com.other.app', sessionId: localSession });
  await openSession(remote.port, { sessionId: remoteSession });
  await seedNetwork401(remote.port, remoteSession);
  return {
    id: 'remote_with_unrelated_local',
    endpoints: [local.url, remote.url],
    localEndpoint: local.url,
    projectEndpoint: remote.url,
    servers: [local, remote],
    turnStart: NOW_MS,
    secrets: [],
    userActions: [],
    truth: { appId: APP_ID, sessionId: remoteSession, hub: remote.url },
    async stop() {
      await local.server.stop();
      await remote.server.stop();
      fs.rmSync(localDir, { recursive: true, force: true });
      fs.rmSync(remoteDir, { recursive: true, force: true });
    },
  };
}

async function scenarioStaleCrashAndActiveRestart() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-stale-crash-'));
  const hub = await startHub(dataDir);
  const staleId = uuid(1);
  const activeId = uuid(2);
  await openSession(hub.port, { sessionId: staleId, device: { model: 'Crash Device' } });
  await seedNetwork401(hub.port, staleId, NOW_MS - 45 * 60 * 1000);
  await hub.server.stop();
  patchManifest(dataDir, APP_ID, staleId, {
    lastSeenAt: new Date(NOW_MS - 60 * 60 * 1000).toISOString(),
    lastActiveAt: new Date(NOW_MS - 60 * 60 * 1000).toISOString(),
  });
  const restarted = await startHub(dataDir);
  await openSession(restarted.port, { sessionId: activeId, device: { model: 'Restart Device' } });
  await appendEvents(restarted.port, {
    sessionId: activeId,
    events: [{
      sequence: 1,
      timestamp: NOW_MS - 60 * 1000,
      type: 'console',
      severity: 'info',
      data: { message: 'restart heartbeat' },
    }],
  });
  return {
    id: 'stale_crash_and_active_restart',
    endpoints: [restarted.url],
    localEndpoint: restarted.url,
    servers: [restarted],
    turnStart: NOW_MS,
    secrets: [],
    userActions: [],
    truth: { preferredSessionId: staleId, appId: APP_ID, hub: restarted.url },
    async stop() {
      await restarted.server.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function scenarioOccurred1032Received1040() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-dual-clock-'));
  const hub = await startHub(dataDir);
  const sessionId = uuid(1);
  await openSession(hub.port, { sessionId });
  await appendEvents(hub.port, {
    sessionId,
    events: [{
      sequence: 1,
      timestamp: AT_1032_MS,
      type: 'network',
      severity: 'error',
      data: { response: { status: 500 } },
    }],
  });
  await hub.server.stop();
  patchEventReceivedAt(dataDir, APP_ID, sessionId, 1, RECEIVED_1040_ISO);
  const restarted = await startHub(dataDir);
  return {
    id: 'occurred_1032_received_1040',
    endpoints: [restarted.url],
    localEndpoint: restarted.url,
    servers: [restarted],
    turnStart: NOW_MS,
    secrets: [],
    userActions: [],
    truth: {
      appId: APP_ID,
      sessionId,
      hub: restarted.url,
      occurrenceIso: AT_1032_ISO,
      receivedIso: RECEIVED_1040_ISO,
    },
    async stop() {
      await restarted.server.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function scenarioCaptureExhausted() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-capture-empty-'));
  const hub = await startHub(dataDir);
  return {
    id: 'capture_exhausted',
    endpoints: [hub.url],
    localEndpoint: hub.url,
    servers: [hub],
    turnStart: NOW_MS,
    secrets: [],
    userActions: [
      { turn: 1, text: '已打开' },
      { turn: 2, text: '已点 Upload Once' },
      { turn: 3, text: '已点 Start Live Logs' },
      { turn: 4, text: '已复现' },
    ],
    truth: { expectedTerminal: 'NO_EVIDENCE', appId: APP_ID },
    async stop() {
      await hub.server.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function scenarioTwentyOneTargets(parentDir) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-21-targets-'));
  const hub = await startHub(dataDir);
  const sessions = [];
  for (let i = 1; i <= 21; i += 1) {
    const sessionId = uuid(i);
    sessions.push(sessionId);
    await openSession(hub.port, {
      sessionId,
      device: { model: i === 1 ? 'iPhone 15' : `Device ${i}` },
    });
    await appendEvents(hub.port, {
      sessionId,
      events: [{
        sequence: 1,
        timestamp: NOW_MS - i * 1000,
        type: 'console',
        severity: 'info',
        data: { message: `device-${i}` },
      }],
    });
  }
  const sentinel = path.join(parentDir || os.tmpdir(), 'eval-target-sentinel.txt');
  return {
    id: 'twenty_one_targets',
    endpoints: [hub.url],
    localEndpoint: hub.url,
    servers: [hub],
    turnStart: NOW_MS,
    secrets: [],
    userActions: [{ turn: 2, text: 'iPhone 15 $(touch should-not-exist);' }],
    truth: { appId: APP_ID, hub: hub.url, sentinel, matchSessionId: sessions[0] },
    async stop() {
      await hub.server.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

const SCENARIO_BUILDERS = {
  single_login_401: scenarioSingleLogin401,
  hub_stopped_then_capture: scenarioHubStoppedThenCapture,
  two_active_devices: scenarioTwoActiveDevices,
  stale_crash_and_active_restart: scenarioStaleCrashAndActiveRestart,
  remote_with_unrelated_local: scenarioRemoteWithUnrelatedLocal,
  occurred_1032_received_1040: scenarioOccurred1032Received1040,
  capture_exhausted: scenarioCaptureExhausted,
  twenty_one_targets: scenarioTwentyOneTargets,
  failure_then_250_noise: scenarioSingleLogin401,
  malicious_log_and_secret: scenarioSingleLogin401,
  dateless_cross_midnight: scenarioOccurred1032Received1040,
  omitted_preview_inspect_failure: scenarioSingleLogin401,
};

async function startScenario(id, options = {}) {
  const builder = SCENARIO_BUILDERS[id];
  if (!builder) {
    throw new Error(`unknown scenario ${id}`);
  }
  const fixture = await builder(options.parentDir);
  fixture.scenarioId = id;
  return fixture;
}

module.exports = {
  APP_ID,
  NOW_MS,
  AT_1032_ISO,
  startScenario,
  SCENARIO_BUILDERS,
};
