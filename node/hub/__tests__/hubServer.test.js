'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { createHubServer } = require('../src/server/hubServer');

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

describe('Local Hub HTTP flow', () => {
  it('serves the device-list console workflow', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-console-'));
    const server = createHubServer({ dataDir, bindAddress: '127.0.0.1', port: 0 });
    const started = await server.start();

    try {
      const consolePage = await requestText(started.address.port, '/console');

      expect(consolePage.status).toBe(200);
      expect(consolePage.body).toContain('class="device-grid"');
      expect(consolePage.body).toContain('← Devices');
      expect(consolePage.body).toContain('Search logs...');
      expect(consolePage.body).toContain('device.manufacturer');
      expect(consolePage.body).toContain('if (session.sourceIp) parts.push(session.sourceIp)');
      expect(consolePage.body).toContain('device.appVersion');
      expect(consolePage.body).toContain('word-break:break-word');
      expect(consolePage.body).toContain('.back-link{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text3);margin-bottom:0;padding:6px 0;cursor:pointer;background:none;border:0}');
      expect(consolePage.body).toContain('function renderEventDetails(event)');
      expect(consolePage.body).toContain('function renderNetworkData(data, event)');
      expect(consolePage.body).toContain('Raw event');
      expect(consolePage.body).toContain("renderEventData(event) + renderCollapsedSection('Event metadata'");
      expect(consolePage.body).toContain("entry.classList.toggle('expanded')");
      expect(consolePage.body).toMatch(/\.log-row'\)\.addEventListener\('click'[\s\S]*classList\.toggle\('expanded'\)/);
      expect(consolePage.body).toContain('function formatJson(');
      expect(consolePage.body).toMatch(/function statusBadge\(event\)[\s\S]*event\.type === 'network'[\s\S]*response\.status/);
      expect(consolePage.body).toContain('id="liveButton"');
      expect(consolePage.body).toContain('aria-pressed');
      expect(consolePage.body).toContain('function formatUrlParts(');
      expect(consolePage.body).toContain('function buildCurl(');
      expect(consolePage.body).toContain('function copyPayload(');
      expect(consolePage.body).toContain('function refreshLogList(');
      expect(consolePage.body).toContain('data-copy-kind');
      expect(consolePage.body).toContain('log-entry.is-failed');
      expect(consolePage.body).toContain('method-get');
      expect(consolePage.body).toMatch(/searchInput[\s\S]*addEventListener\('input'[\s\S]*refreshLogList\(/);
      expect(consolePage.body).toContain('function readHash(');
      expect(consolePage.body).toContain('function writeHash(');
      expect(consolePage.body).toContain('function sessionStatus(');
      expect(consolePage.body).toContain('didAutoOpen');
      expect(consolePage.body).toContain('detail-chrome');
      expect(consolePage.body).toContain('position:sticky;top:56px');
      expect(consolePage.body).toContain('formatAge(session.lastSeenAt)');
      expect(consolePage.body).toContain('ackThrough');
      expect(consolePage.body).toContain("label: 'online'");
      const liveHandler = consolePage.body.match(
        /stream\.addEventListener\('event', message => \{([\s\S]*?)\}\); stream\.onerror/
      );
      expect(consolePage.body).toContain('function appendLiveEvent(event)');
      expect(liveHandler?.[1]).toContain('appendLiveEvent(event)');
      expect(liveHandler?.[1]).not.toContain('renderDetail()');
      expect(consolePage.body).toContain('window.scrollBy(0, entry.offsetHeight)');
    } finally {
      await server.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('accepts App events without generation or payloadHash', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-server-'));
    const server = createHubServer({ dataDir, bindAddress: '127.0.0.1', port: 0 });
    const started = await server.start();
    const port = started.address.port;
    const device = { platform: 'ios', osVersion: '18', nativeApplicationId: 'com.example.audit' };
    const opened = await request(port, 'POST', `/api/v1/apps/${appId}/sessions`, {
      protocolVersion: 1, canonicalVersion: 1, sessionId, startedAt: Date.now(), clientAckThrough: 0, device,
    });
    expect(opened.status).toBe(201);
    expect(opened.body).not.toHaveProperty('generation');
    expect(opened.body).not.toHaveProperty('bindingEpoch');
    expect(opened.body).toMatchObject({ ok: true, ackThrough: 0, expectedSequence: 1 });

    const event = {
      sequence: 1, timestamp: Date.now(), type: 'console', severity: 'info', data: { message: 'hello' },
    };
    const appended = await request(port, 'POST', `/api/v1/apps/${appId}/sessions/${sessionId}/events`, {
      firstSequence: 1, events: [event],
    });
    expect(appended.body).toMatchObject({ ok: true, ackThrough: 1 });

    const sessions = await request(port, 'GET', `/api/v1/apps/${appId}/sessions`);
    expect(sessions.body.sessions[0]).toMatchObject({ sessionId });

    const context = await request(port, 'GET', `/api/v1/apps/${appId}/sessions/${sessionId}/context`);
    expect(context.body.throughSequence).toBe(1);
    expect(context.body.events.some(e => e.data?.message === 'hello')).toBe(true);
    expect(context.body).not.toHaveProperty('snapshotCursor');

    const ready = await request(port, 'GET', '/ready');
    expect(ready.body).toMatchObject({ ok: true, apps: [appId] });
    expect(ready.body.storage).toEqual(expect.objectContaining({ usedBytes: expect.any(Number), limitBytes: 20000000000 }));

    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
});

describe('diagnostic Hub HTTP context and pagination', () => {
  it('selects by event time independently of receivedAt and rejects invalid timeBasis', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-dualclock-'));
    const server = createHubServer({ dataDir, bindAddress: '127.0.0.1', port: 0 });
    const started = await server.start();
    const port = started.address.port;
    const device = { platform: 'ios', osVersion: '18', nativeApplicationId: appId };
    await request(port, 'POST', `/api/v1/apps/${appId}/sessions`, {
      protocolVersion: 1, canonicalVersion: 1, sessionId, startedAt: Date.now(), clientAckThrough: 0, device,
    });
    await request(port, 'POST', `/api/v1/apps/${appId}/sessions/${sessionId}/events`, {
      firstSequence: 1,
      events: [{
        sequence: 1,
        timestamp: Date.parse('2026-08-17T02:32:00.000Z'),
        type: 'console',
        severity: 'error',
        data: { message: 'crash' },
      }],
    });

    const eventsPath = path.join(dataDir, appId, sessionId, 'events.jsonl');
    const stored = JSON.parse(fs.readFileSync(eventsPath, 'utf8').trim().split('\n')[0]);
    stored.receivedAt = '2026-08-17T02:40:00.000Z';
    fs.writeFileSync(eventsPath, `${JSON.stringify(stored)}\n`);

    await server.stop();
    const restarted = createHubServer({ dataDir, bindAddress: '127.0.0.1', port: 0 });
    const again = await restarted.start();
    const p2 = again.address.port;

    try {
      const eventHit = await request(
        p2,
        'GET',
        `/api/v1/apps/${appId}/sessions/${sessionId}/context?timeBasis=event&since=2026-08-17T02:31:00.000Z&until=2026-08-17T02:33:00.000Z`,
      );
      expect(eventHit.body.events.some((event) => event.data?.message === 'crash')).toBe(true);
      expect(eventHit.body.window.timeBasis).toBe('event');
      expect(eventHit.body.completeness).toMatchObject({
        matched: 1,
        selected: 1,
        omitted: 0,
      });
      expect(eventHit.body.selection).toMatchObject({ total: 1, selected: 1, omitted: 0 });
      expect(eventHit.body.ranges.event).toEqual({
        since: '2026-08-17T02:32:00.000Z',
        until: '2026-08-17T02:32:00.000Z',
      });

      const defaultMiss = await request(
        p2,
        'GET',
        `/api/v1/apps/${appId}/sessions/${sessionId}/context?since=2026-08-17T02:31:00.000Z&until=2026-08-17T02:33:00.000Z`,
      );
      expect(defaultMiss.body.events).toHaveLength(0);

      const receivedHit = await request(
        p2,
        'GET',
        `/api/v1/apps/${appId}/sessions/${sessionId}/context?since=2026-08-17T02:39:00.000Z&until=2026-08-17T02:41:00.000Z`,
      );
      expect(receivedHit.body.events.some((event) => event.data?.message === 'crash')).toBe(true);

      const invalid = await request(
        p2,
        'GET',
        `/api/v1/apps/${appId}/sessions/${sessionId}/context?timeBasis=banana`,
      );
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe('INVALID_ARGUMENT');

      const locale = await request(
        p2,
        'GET',
        `/api/v1/apps/${appId}/sessions/${sessionId}/context?since=08/17/2026`,
      );
      expect(locale.status).toBe(400);
    } finally {
      await restarted.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('pages 55 Sessions over HTTP without duplicates', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-pages-'));
    const server = createHubServer({ dataDir, bindAddress: '127.0.0.1', port: 0 });
    const started = await server.start();
    const port = started.address.port;
    const device = { platform: 'ios', osVersion: '18', nativeApplicationId: appId };
    try {
      for (let i = 1; i <= 55; i += 1) {
        const id = `123e4567-e89b-42d3-a456-42661417${String(4000 + i).padStart(4, '0')}`;
        const opened = await request(port, 'POST', `/api/v1/apps/${appId}/sessions`, {
          protocolVersion: 1, canonicalVersion: 1, sessionId: id, startedAt: Date.now(), clientAckThrough: 0, device,
        });
        expect(opened.status).toBe(201);
      }

      const { listAllSessions } = require('../src/cli/httpClient');
      const all = await listAllSessions(`http://127.0.0.1:${port}`, appId);
      expect(all.sessions).toHaveLength(55);
      expect(all.pages).toBeGreaterThanOrEqual(2);
      expect(new Set(all.sessions.map((session) => session.sessionId)).size).toBe(55);
    } finally {
      await server.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('maps Hub read errors without leaking response bodies', () => {
    const { toHubReadError } = require('../src/cli/httpClient');
    const mapped = toHubReadError('http://127.0.0.1:3800', '/ready', {
      status: 503,
      body: { ok: false, error: { code: 'HUB_NOT_READY', message: 'secret-body' } },
      raw: 'secret-body',
    });
    expect(mapped.code).toBe('HUB_NOT_READY');
    expect(mapped.httpStatus).toBe(503);
    expect(mapped.message).not.toContain('secret-body');
    expect(mapped).not.toHaveProperty('raw');
  });
});
