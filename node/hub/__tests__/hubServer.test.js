'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createHubServer } = require('../src/server/hubServer');
const { computePayloadHash } = require('../src/protocol/canonical');

const appId = 'com.example.audit';
const sessionId = '123e4567-e89b-42d3-a456-426614174000';

function request(port, method, pathname, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: pathname, headers: body ? { 'content-type': 'application/json' } : undefined }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function requestText(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'GET', path: pathname }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Shared Hub HTTP flow', () => {
  it('serves the legacy device-list console workflow', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-console-'));
    const server = createHubServer({ dataDir, bindAddress: '127.0.0.1', port: 0 });
    const started = await server.start();

    try {
      const consolePage = await requestText(started.address.port, '/console');

      expect(consolePage.status).toBe(200);
      expect(consolePage.body).toContain('class="device-grid"');
      expect(consolePage.body).toContain('All devices');
      expect(consolePage.body).toContain('Search logs...');
      expect(consolePage.body).toContain('.back-link{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text3);margin-bottom:20px;padding:6px 0;cursor:pointer;background:none;border:0}');
    } finally {
      await server.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('accepts verified App events and exposes the session sync marker', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-server-'));
    const server = createHubServer({ dataDir, bindAddress: '127.0.0.1', port: 0 });
    const started = await server.start();
    const port = started.address.port;
    const device = { platform: 'ios', osVersion: '18', nativeApplicationId: 'com.example.audit' };
    const opened = await request(port, 'POST', `/api/v1/apps/${appId}/sessions`, {
      protocolVersion: 1, canonicalVersion: 1, sessionId, startedAt: Date.now(), clientAckThrough: 0, device,
    });
    expect(opened.status).toBe(201);
    const event = {
      sequence: 1, timestamp: Date.now(), type: 'toolkit.manual_sync', severity: 'info', data: { trigger: 'button' },
    };
    event.payloadHash = computePayloadHash({ ...event, sessionId });
    const appended = await request(port, 'POST', `/api/v1/apps/${appId}/sessions/${sessionId}/events`, {
      generation: opened.body.generation, firstSequence: 1, events: [event],
    });
    expect(appended.body).toMatchObject({ ok: true, ackThrough: 1 });

    const sessions = await request(port, 'GET', `/api/v1/apps/${appId}/sessions`);
    expect(sessions.body.sessions[0]).toMatchObject({ sessionId, lastManualSyncAt: expect.any(String) });
    const context = await request(port, 'GET', `/api/v1/apps/${appId}/sessions/${sessionId}/context`);
    expect(context.body.snapshotCursor).toEqual(expect.any(String));
    const conflictingReplay = await request(port, 'GET', `/api/v1/apps/${appId}/sessions/${sessionId}/context?through=${encodeURIComponent(context.body.snapshotCursor)}&since=2020-01-01T00:00:00.000Z`);
    expect(conflictingReplay).toMatchObject({ status: 400, body: { ok: false, error: { code: 'INVALID_ARGUMENT' } } });
    const ready = await request(port, 'GET', '/ready');
    expect(ready.body).toMatchObject({ ok: true, apps: [appId] });
    expect(ready.body.storage).toEqual(expect.objectContaining({ usedBytes: expect.any(Number), limitBytes: 20000000000 }));

    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});
