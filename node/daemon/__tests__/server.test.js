'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { createDaemonServer } = require('../src/server');
const { DEFAULT_HOST } = require('../src/constants');

function request(baseUrl, options = {}) {
  const url = new URL(options.path || '/', baseUrl);
  const body = options.body ? JSON.stringify(options.body) : null;

  return new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: res.statusCode,
          body: raw ? JSON.parse(raw) : null,
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

function openSse(baseUrl) {
  const url = new URL('/events', baseUrl);

  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET' }, (res) => {
      resolve({ req, res });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('debug toolkit daemon server', () => {
  let server;
  let baseUrl;

  beforeEach(async () => {
    ({ server } = createDaemonServer());
    baseUrl = await listen(server);
  });

  it('defaults to a LAN-reachable bind host for real device debugging', () => {
    expect(DEFAULT_HOST).toBe('0.0.0.0');
  });

  afterEach((done) => {
    server.close(done);
  });

  it('exposes health metadata', async () => {
    const response = await request(baseUrl, { path: '/health' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      ok: true,
      name: 'react-native-debug-toolkit-daemon',
      version: '0.1.0',
      protocolVersion: 2,
    });
  });

  it('includes LAN IPs in health response', async () => {
    const response = await request(baseUrl, { path: '/health' });

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.ips)).toBe(true);
  });

  it('uses device log endpoints', async () => {
    const report = {
      version: 2,
      device: { platform: 'ios', model: 'iPhone 15', osVersion: '17.0', appVersion: '1.0.0' },
      logs: {
        network: [
          { request: { url: '/ok' }, response: { status: 200, success: true } },
          { request: { url: '/bad' }, response: { status: 500, success: false } },
        ],
      },
    };

    const postResponse = await request(baseUrl, {
      method: 'POST',
      path: '/report',
      body: report,
    });
    const devicesResponse = await request(baseUrl, { path: '/devices' });
    const latestResponse = await request(baseUrl, { path: '/devices/latest' });
    const logsResponse = await request(baseUrl, {
      path: `/devices/${postResponse.body.deviceId}/logs?type=network&failedOnly=true`,
    });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body).toMatchObject({
      ok: true,
      deviceId: expect.any(String),
      logCount: { network: 2 },
    });
    expect(devicesResponse.body.devices[0]).toMatchObject({
      deviceId: postResponse.body.deviceId,
      device: report.device,
      source: { ip: '127.0.0.1' },
      logCount: { network: 2 },
    });
    expect(latestResponse.body).toMatchObject({
      deviceId: postResponse.body.deviceId,
      report,
    });
    expect(logsResponse.body.logs).toEqual([
      { request: { url: '/bad' }, response: { status: 500, success: false } },
    ]);
  });

  it('can persist device logs across daemon restarts when a store path is configured', async () => {
    const storePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-')), 'devices.json');
    await new Promise((resolve) => server.close(resolve));

    ({ server } = createDaemonServer({ deviceStorePath: storePath }));
    baseUrl = await listen(server);

    const report = {
      version: 2,
      logs: {
        console: [{ level: 'log', data: ['persisted'] }],
      },
    };
    await request(baseUrl, { method: 'POST', path: '/report', body: report });

    await new Promise((resolve) => server.close(resolve));
    ({ server } = createDaemonServer({ deviceStorePath: storePath }));
    baseUrl = await listen(server);

    const devicesResponse = await request(baseUrl, { path: '/devices' });
    const latestResponse = await request(baseUrl, { path: '/devices/latest' });

    expect(devicesResponse.status).toBe(200);
    expect(devicesResponse.body.devices).toHaveLength(1);
    expect(latestResponse.body.report).toEqual(report);
  });

  it('stores the latest report and returns log counts', async () => {
    const report = {
      version: 2,
      device: { platform: 'ios', model: 'iPhone 15', osVersion: '17.0', appVersion: '1.0.0' },
      logs: {
        console: [{ level: 'error', data: ['TEST_ERROR_123'] }],
        network: [{ response: { status: 500, success: false } }],
      },
    };

    const postResponse = await request(baseUrl, {
      method: 'POST',
      path: '/report',
      body: report,
    });
    const latestResponse = await request(baseUrl, { path: '/devices/latest' });

    expect(postResponse.status).toBe(200);
    expect(postResponse.body).toMatchObject({
      ok: true,
      deviceId: expect.any(String),
      logCount: { console: 1, network: 1 },
    });
    expect(latestResponse.status).toBe(200);
    expect(latestResponse.body.report).toEqual(report);
    expect(latestResponse.body.source).toMatchObject({ ip: '127.0.0.1' });

    const devicesResponse = await request(baseUrl, { path: '/devices' });
    expect(devicesResponse.body.devices[0]).toMatchObject({
      deviceId: postResponse.body.deviceId,
      device: report.device,
      source: { ip: '127.0.0.1' },
    });
  });

  it('rejects invalid reports', async () => {
    const response = await request(baseUrl, {
      method: 'POST',
      path: '/report',
      body: { version: 1, logs: [] },
    });

    expect(response.status).toBe(400);
    expect(response.body.ok).toBe(false);
  });

  it('filters failed device logs', async () => {
    const report = {
      version: 2,
      logs: {
        network: [
          { request: { url: '/ok' }, response: { status: 200, success: true } },
          { request: { url: '/bad' }, response: { status: 500, success: false } },
        ],
      },
    };

    const postResponse = await request(baseUrl, {
      method: 'POST',
      path: '/report',
      body: report,
    });
    const logsResponse = await request(baseUrl, {
      path: `/devices/${postResponse.body.deviceId}/logs?type=network&failedOnly=true`,
    });

    expect(logsResponse.status).toBe(200);
    expect(logsResponse.body.logs).toEqual([
      { request: { url: '/bad' }, response: { status: 500, success: false } },
    ]);
  });

  it('requires token for all log-reading endpoints when token is configured', async () => {
    await new Promise((resolve) => server.close(resolve));
    ({ server } = createDaemonServer({ token: 'dev-token' }));
    baseUrl = await listen(server);

    const report = {
      version: 2,
      logs: {
        console: [{ level: 'error', data: ['SECRET_ERROR'] }],
      },
    };
    const postResponse = await request(baseUrl, {
      method: 'POST',
      path: '/report',
      headers: { Authorization: 'Bearer dev-token' },
      body: report,
    });

    expect(postResponse.status).toBe(200);

    await expect(request(baseUrl, { path: '/devices/latest' })).resolves.toMatchObject({ status: 401 });
    await expect(request(baseUrl, { path: '/devices' })).resolves.toMatchObject({ status: 401 });
    await expect(request(baseUrl, { path: `/devices/${postResponse.body.deviceId}` })).resolves.toMatchObject({ status: 401 });
    await expect(request(baseUrl, { path: `/devices/${postResponse.body.deviceId}/logs` })).resolves.toMatchObject({ status: 401 });
    await expect(request(baseUrl, { method: 'DELETE', path: '/devices' })).resolves.toMatchObject({ status: 401 });

    await expect(request(baseUrl, {
      path: '/devices/latest',
      headers: { Authorization: 'Bearer dev-token' },
    })).resolves.toMatchObject({
      status: 200,
      body: expect.objectContaining({ report }),
    });
  });

  it('rejects SSE clients after the connection limit is reached', async () => {
    const clients = [];
    await request(baseUrl, {
      method: 'POST',
      path: '/report',
      body: { version: 2, logs: { console: [{ level: 'log', data: ['ready'] }] } },
    });

    try {
      for (let i = 0; i < 20; i += 1) {
        const client = await openSse(baseUrl);
        clients.push(client);
        expect(client.res.statusCode).toBe(200);
      }

      const overflow = await openSse(baseUrl);
      clients.push(overflow);
      expect(overflow.res.statusCode).toBe(503);
    } finally {
      clients.forEach((client) => {
        client.req.destroy();
        client.res.destroy();
      });
    }
  });
});
