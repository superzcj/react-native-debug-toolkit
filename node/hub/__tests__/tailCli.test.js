'use strict';

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { createHubServer } = require('../src/server/hubServer');
const { main, printHelp } = require('../src/cli/main');

const BIN = path.join(__dirname, '../../../bin/debug-toolkit.js');
const APP_ID = 'com.example.tail';

function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_OPTIONS;
  delete env.JEST_WORKER_ID;
  return env;
}

function runBin(args, extra = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    timeout: extra.timeout || 8000,
    env: childEnv(extra.env),
  });
}

function runBinAsync(args, extra = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: childEnv(extra.env),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const timer = setTimeout(() => child.kill('SIGTERM'), extra.timeout || 15000);
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ status, signal, stdout, stderr });
    });
  });
}

function request(port, method, pathname, body) {
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
      res.on('end', () => resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function sessionId(n) {
  return `123e4567-e89b-42d3-a456-${String(n).padStart(12, '0')}`;
}

describe('tail CLI duration validation', () => {
  it('prints follow budget help', () => {
    const chunks = [];
    const spy = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      chunks.push(String(chunk));
      return true;
    });
    printHelp();
    spy.mockRestore();
    expect(chunks.join('')).toContain('--follow removes the time limit; 200-event and 2 MiB limits still apply');
  });

  it.each([
    [['tail', '--duration-ms', '999']],
    [['tail', '--duration-ms', '300001']],
    [['tail', '--duration-ms', '1.5']],
    [['tail', '--duration-ms']],
    [['tail', '--duration-ms', '1000', '--follow']],
  ])('rejects %j before network access', async (args) => {
    const result = runBin(args);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('INVALID_ARGUMENT');
    expect(result.stderr).not.toContain('Tried:');
  });

  it('also rejects invalid duration through main() without resolving a Hub', async () => {
    const result = await main(['tail', '--duration-ms', '999']);
    expect(result.exitCode).toBe(2);
  });
});

describe('tail explicit Session pagination', () => {
  it('reaches SSE for the 51st Session instead of NO_SESSION', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug-toolkit-tail-'));
    const server = createHubServer({ dataDir, bindAddress: '127.0.0.1', port: 0 });
    const started = await server.start();
    const port = started.address.port;
    const device = { platform: 'ios', osVersion: '18', nativeApplicationId: APP_ID };

    try {
      for (let i = 1; i <= 51; i += 1) {
        const opened = await request(port, 'POST', `/api/v1/apps/${APP_ID}/sessions`, {
          protocolVersion: 1,
          canonicalVersion: 1,
          sessionId: sessionId(i),
          startedAt: Date.now(),
          clientAckThrough: 0,
          device,
        });
        expect(opened.status).toBe(201);
      }

      const result = await runBinAsync([
        'tail',
        '--hub', `http://127.0.0.1:${port}`,
        '--app-id', APP_ID,
        '--session', sessionId(1),
        '--duration-ms', '1000',
      ], { timeout: 15000 });

      expect(result.stderr).not.toContain('NO_SESSION');
      expect(result.stdout).not.toContain('"code":"NO_SESSION"');
      expect(result.stdout).toContain('"kind":"end"');
      expect(result.status).toBe(0);
    } finally {
      await server.stop();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, 20000);
});
