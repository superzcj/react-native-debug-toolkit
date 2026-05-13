'use strict';

const { handleMessage } = require('../src/server');

describe('MCP server JSON-RPC handling', () => {
  it('lists log reading and session listing tools', async () => {
    const response = await handleMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, {});

    expect(response.result.tools.map((tool) => tool.name)).toEqual([
      'get_app_logs',
      'list_app_sessions',
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

  it('returns daemon sessions through list_app_sessions', async () => {
    const response = await handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'list_app_sessions',
        arguments: {},
      },
    }, {
      ensureDaemon: async () => ({ ok: true, origin: 'http://127.0.0.1:3799' }),
      readSessions: async () => ({
        ok: true,
        sessions: [
          { sessionId: 'session-2', receivedAt: 'later', logCount: { console: 1 } },
          { sessionId: 'session-1', receivedAt: 'earlier', logCount: { network: 2 } },
        ],
      }),
    });

    const body = JSON.parse(response.result.content[0].text);
    expect(body).toEqual({
      ok: true,
      origin: 'http://127.0.0.1:3799',
      sessions: [
        { sessionId: 'session-2', receivedAt: 'later', logCount: { console: 1 } },
        { sessionId: 'session-1', receivedAt: 'earlier', logCount: { network: 2 } },
      ],
      count: 2,
    });
  });
});
