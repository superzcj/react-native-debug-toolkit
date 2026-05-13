import { DebugToolkit } from '../../core/DebugToolkit';
import {
  _isNetworkUrlBlacklistedForTesting,
  _resetNetworkForTesting,
} from '../../features/network';
import { reportDebugSessionToDaemon } from '../../utils/reportToDaemon';
import type { DebugFeature } from '../../types';

function createFeature(name: string, snapshot: unknown): DebugFeature<unknown> {
  return {
    name,
    label: name,
    setup: jest.fn(),
    getSnapshot: () => snapshot,
    cleanup: jest.fn(),
  };
}

describe('reportDebugSessionToDaemon', () => {
  let originalFetch: unknown;

  beforeEach(() => {
    originalFetch = (globalThis as { fetch?: unknown }).fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: unknown }).fetch;
    }
    _resetNetworkForTesting();
    DebugToolkit.destroy();
    DebugToolkit.setEnabled(true);
  });

  it('posts the current debug session report to the daemon', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        sessionId: 's1',
        receivedAt: '2026-05-06T10:00:00.000Z',
        logCount: { console: 1 },
      }),
    });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    DebugToolkit.addFeature(createFeature('console', [{ level: 'error', data: ['TEST_ERROR_123'] }]));

    const result = await reportDebugSessionToDaemon({
      endpoint: 'http://127.0.0.1:3799',
      token: 'dev-token',
    });

    expect(result).toMatchObject({
      ok: true,
      sessionId: 's1',
      logCount: { console: 1 },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3799/report',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer dev-token',
        },
      }),
    );
    const fetchInit = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(fetchInit.body)).toEqual({
      version: 2,
      device: {
        platform: 'ios',
        model: 'unknown',
        osVersion: 'unknown',
        appVersion: 'unknown',
      },
      logs: {
        console: [{ level: 'error', data: ['TEST_ERROR_123'] }],
      },
    });
  });

  it('registers daemon report URLs in the network blacklist before posting', async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, logCount: {} }),
    });

    await reportDebugSessionToDaemon({ endpoint: 'http://localhost:3799' });

    expect(_isNetworkUrlBlacklistedForTesting('http://localhost:3799/report')).toBe(true);
  });
});
