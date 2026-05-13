'use strict';

jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({ unref: jest.fn() })),
}));

jest.mock('../src/httpClient', () => ({
  requestJson: jest.fn(),
}));

const { spawn } = require('child_process');
const { requestJson } = require('../src/httpClient');
const { ensureDaemon } = require('../src/daemonClient');

describe('daemon client startup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('spawns the single debug-toolkit bin in daemon-only mode on all interfaces', async () => {
    requestJson
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        status: 200,
        body: { ok: true, protocolVersion: 2 },
      });

    const result = await ensureDaemon({
      origin: 'http://127.0.0.1:3799',
      timeoutMs: 100,
      pollMs: 1,
    });

    expect(result).toMatchObject({ ok: true, origin: 'http://127.0.0.1:3799', spawned: true });
    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      [
        expect.stringContaining('debug-toolkit.js'),
        '--daemon-only',
        '--host',
        '0.0.0.0',
        '--port',
        '3799',
      ],
      expect.objectContaining({ detached: true, stdio: 'ignore' }),
    );
  });
});
