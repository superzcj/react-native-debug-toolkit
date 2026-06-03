'use strict';

const { createToolPayload, selectLogs } = require('../src/logs');

describe('MCP log selection', () => {
  const report = {
    version: 2,
    logs: {
      network: [
        {
          request: { method: 'POST', url: '/ok', body: { hidden: true } },
          response: { status: 200, success: true, data: { hidden: true } },
        },
        {
          request: { method: 'GET', url: '/bad' },
          response: { status: 500, success: false, data: 'secret' },
        },
      ],
      console: [
        { level: 'log', data: ['hello'] },
        { level: 'error', data: ['TEST_ERROR_123'] },
      ],
    },
  };

  it('strips bodies by default', () => {
    const logs = selectLogs(report, { logType: 'network' });

    expect(logs[0]).toEqual({
      request: { method: 'POST', url: '/ok' },
      response: { status: 200, success: true },
    });
  });

  it('keeps bodies when explicitly enabled', () => {
    const logs = selectLogs(report, { logType: 'network', includeBodies: true });

    expect(logs[0].request.body).toEqual({ hidden: true });
    expect(logs[0].response.data).toEqual({ hidden: true });
  });

  it('fetches single entry by entryId with bodies', () => {
    const logs = selectLogs(report, { logType: 'network', entryId: 42 });

    expect(logs).toEqual([]);
  });

  test('selects native logs by type', () => {
    const payload = createToolPayload({
      deviceId: 'ios-1',
      receivedAt: '2026-06-02T00:00:00.000Z',
      lastSeenAt: '2026-06-02T00:00:00.000Z',
      report: {
        version: 2,
        logs: { native: [{ id: 'n1', timestamp: 1, level: 'error', source: 'rctLog', message: 'native failed' }] },
      },
    }, { logType: 'native' });

    expect(payload.logType).toBe('native');
    expect(payload.logs).toEqual([{ id: 'n1', timestamp: 1, level: 'error', source: 'rctLog', message: 'native failed' }]);
  });

  it('filters failed logs across types', () => {
    const payload = createToolPayload(
      { deviceId: 'ios_phone_127_0_0_1', receivedAt: 'now', report },
      { failedOnly: true },
    );

    expect(payload.count).toBe(2);
    expect(payload.logs).toEqual([
      {
        type: 'network',
          entry: {
            request: { method: 'GET', url: '/bad' },
            response: { status: 500, success: false },
          },
        },
      {
        type: 'console',
        entry: { level: 'error', data: ['TEST_ERROR_123'] },
      },
    ]);
  });
});
