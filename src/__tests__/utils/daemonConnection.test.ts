import { daemonClient, _resetDaemonClientForTesting } from '../../utils/DaemonClient';

describe('checkDaemonConnection', () => {
  let originalFetch: unknown;

  beforeEach(() => {
    jest.useFakeTimers();
    originalFetch = (globalThis as { fetch?: unknown }).fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalFetch) {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: unknown }).fetch;
    }
    _resetDaemonClientForTesting();
  });

  it('checks daemon health before reporting logs', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, name: 'react-native-debug-toolkit-daemon' }),
    });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;

    const result = await daemonClient.checkConnection({
      endpoint: 'http://192.168.1.10:3799',
      timeoutMs: 1000,
    });

    expect(result).toEqual({
      ok: true,
      endpoint: 'http://192.168.1.10:3799',
      status: 200,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.10:3799/health',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('times out unreachable desktop health checks', async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn((_url: string, init: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
      }));

    const resultPromise = daemonClient.checkConnection({
      endpoint: 'http://192.168.1.10:3799',
      timeoutMs: 1000,
    });

    jest.advanceTimersByTime(1000);
    const result = await resultPromise;

    expect(result).toMatchObject({
      ok: false,
      endpoint: 'http://192.168.1.10:3799',
      reason: 'timeout',
    });
  });
});
