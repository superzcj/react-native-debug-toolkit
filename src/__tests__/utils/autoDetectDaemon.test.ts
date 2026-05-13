import { autoDetectDaemonIp } from '../../utils/autoDetectDaemon';

jest.mock('react-native', () => ({
  NativeModules: {
    SourceCode: { scriptURL: null },
  },
  Platform: { OS: 'ios' },
}));

const { NativeModules } = jest.requireMock('react-native');
const originalFetch = globalThis.fetch;

function mockFetch(healthyIp: string | null) {
  (globalThis as { fetch: unknown }).fetch = ((url: string, init: { signal?: AbortSignal }) => {
    if (healthyIp && url.includes(healthyIp)) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, name: 'daemon' }),
      });
    }
    if (init.signal?.aborted) return Promise.reject(new Error('Aborted'));
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ ok: false }) });
  }) as typeof fetch;
}

function mockHangingFetch() {
  (globalThis as { fetch: unknown }).fetch = ((_url: string, init: { signal?: AbortSignal }) =>
    new Promise((_, reject) => {
      if (init.signal?.aborted) { reject(new Error('Aborted')); return; }
      init.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    })) as typeof fetch;
}

function clearMockFetch() {
  (globalThis as { fetch: unknown }).fetch = originalFetch;
}

describe('autoDetectDaemonIp', () => {
  afterEach(() => {
    clearMockFetch();
    NativeModules.SourceCode.scriptURL = null;
  });

  it('returns null when fetch is unavailable', async () => {
    (globalThis as { fetch: unknown }).fetch = undefined;
    const result = await autoDetectDaemonIp({ batchSize: 5 });
    expect(result.ip).toBeNull();
    expect(result.method).toBe('none');
  });

  it('finds daemon via Metro bundle URL (strategy 0)', async () => {
    NativeModules.SourceCode.scriptURL = 'http://192.168.1.10:8081/index.bundle?platform=ios';
    mockFetch('192.168.1.10');

    const result = await autoDetectDaemonIp({ batchSize: 5 });
    expect(result.ip).toBe('192.168.1.10');
    expect(result.method).toBe('metro-bundle');
  });

  it('skips Metro URL if host is localhost', async () => {
    NativeModules.SourceCode.scriptURL = 'http://localhost:8081/index.bundle';
    mockFetch('192.168.1.42');

    const result = await autoDetectDaemonIp({ batchSize: 5, timeoutMs: 500 });
    expect(result.method).not.toBe('metro-bundle');
  });

  it('finds daemon in common subnets when no Metro URL', async () => {
    mockFetch('192.168.1.42');
    const result = await autoDetectDaemonIp({ batchSize: 5, timeoutMs: 500 });
    expect(result.ip).toBe('192.168.1.42');
    expect(result.method).toBe('subnet-common');
  });

  it('can skip subnet scanning for quick UI detection', async () => {
    mockFetch('192.168.1.42');
    const result = await autoDetectDaemonIp({
      batchSize: 5,
      timeoutMs: 500,
      scanSubnets: false,
    });
    expect(result.ip).toBeNull();
    expect(result.method).toBe('none');
  });

  it('returns none when no daemon responds', async () => {
    mockFetch(null);
    const result = await autoDetectDaemonIp({ batchSize: 5, timeoutMs: 100 });
    expect(result.ip).toBeNull();
    expect(result.method).toBe('none');
  });

  it('respects abort signal', async () => {
    mockHangingFetch();
    const controller = new AbortController();
    const resultPromise = autoDetectDaemonIp({
      signal: controller.signal,
      batchSize: 5,
      timeoutMs: 5000,
    });
    controller.abort();
    const result = await resultPromise;
    expect(result.ip).toBeNull();
  });
});
