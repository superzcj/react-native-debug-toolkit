'use strict';

const { handleMessage } = require('../src/server');

describe('MCP server JSON-RPC handling', () => {
  it('lists log reading and device listing tools', async () => {
    const response = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {});

    expect(response.result.tools.map((tool) => tool.name)).toEqual([
      'get_app_logs',
      'list_app_devices',
    ]);
  });

  it('returns daemon availability errors as tool content', async () => {
    const response = await handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'get_app_logs',
        arguments: {},
      },
    }, {
      ensureDaemon: async () => ({ ok: false, origin: 'http://127.0.0.1:3799', error: 'offline' }),
    });

    expect(response.result.content[0].text).toContain('offline');
  });

  it('returns daemon devices through list_app_devices', async () => {
    const response = await handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'list_app_devices',
        arguments: {},
      },
    }, {
      ensureDaemon: async () => ({ ok: true, origin: 'http://127.0.0.1:3799' }),
      readDevices: async () => ({
        ok: true,
        devices: [
          { deviceId: 'ios_phone_127_0_0_1', receivedAt: 'later', logCount: { console: 1 } },
          { deviceId: 'android_emulator_10_0_2_2', receivedAt: 'earlier', logCount: { network: 2 } },
        ],
      }),
    });

    const body = JSON.parse(response.result.content[0].text);
    expect(body).toEqual({
      ok: true,
      origin: 'http://127.0.0.1:3799',
      devices: [
        { deviceId: 'ios_phone_127_0_0_1', receivedAt: 'later', logCount: { console: 1 } },
        { deviceId: 'android_emulator_10_0_2_2', receivedAt: 'earlier', logCount: { network: 2 } },
      ],
      count: 2,
    });
  });
});
