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

  it('keeps body and data by default', () => {
    const logs = selectLogs(report, { logType: 'network' });

    expect(logs[0].request.body).toEqual({ hidden: true });
    expect(logs[0].response.data).toEqual({ hidden: true });
  });

  it('strips bodies when explicitly disabled', () => {
    const logs = selectLogs(report, { logType: 'network', includeBodies: false });

    expect(logs[0]).toEqual({
      request: { method: 'POST', url: '/ok' },
      response: { status: 200, success: true },
    });
  });

  it('filters failed logs across types', () => {
    const payload = createToolPayload(
      { sessionId: 's1', receivedAt: 'now', report },
      { failedOnly: true },
    );

    expect(payload.count).toBe(2);
    expect(payload.logs).toEqual([
      {
        type: 'network',
          entry: {
            request: { method: 'GET', url: '/bad' },
            response: { status: 500, success: false, data: 'secret' },
          },
        },
      {
        type: 'console',
        entry: { level: 'error', data: ['TEST_ERROR_123'] },
      },
    ]);
  });
});
