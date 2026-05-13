import { DebugToolkit } from '../../core/DebugToolkit';
import {
  _resetNetworkForTesting,
} from '../../features/network';
import { startStreaming, stopStreaming } from '../../utils/streamToDaemon';
import type { DebugFeature, DebugFeatureListener } from '../../types';

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createStreamingFeature(name: string, initial: Array<Record<string, unknown>>) {
  let snapshot = initial;
  const listeners = new Set<DebugFeatureListener>();
  const feature: DebugFeature<Array<Record<string, unknown>>> = {
    name,
    label: name,
    setup: jest.fn(),
    getSnapshot: () => snapshot,
    cleanup: jest.fn(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return {
    feature,
    push(entry: Record<string, unknown>) {
      snapshot = [...snapshot, entry];
      listeners.forEach((listener) => listener());
    },
  };
}

describe('startStreaming', () => {
  let originalFetch: unknown;

  beforeEach(() => {
    jest.useFakeTimers();
    originalFetch = (globalThis as { fetch?: unknown }).fetch;
  });

  afterEach(() => {
    stopStreaming();
    jest.useRealTimers();
    if (originalFetch) {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: unknown }).fetch;
    }
    _resetNetworkForTesting();
    DebugToolkit.destroy();
    DebugToolkit.setEnabled(true);
  });

  it('keeps unsent delta entries pending when ingest fails', async () => {
    const streamFeature = createStreamingFeature('track', [{ id: '1', event: 'initial' }]);
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true, sessionId: 'session-1' }),
      })
      .mockRejectedValueOnce(new Error('daemon down'))
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true }),
      });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    DebugToolkit.addFeature(streamFeature.feature);

    startStreaming({ endpoint: 'http://127.0.0.1:3799', debounceMs: 10 });
    await flushPromises();

    streamFeature.push({ id: '2', event: 'first-delta' });
    jest.advanceTimersByTime(10);
    await flushPromises();

    streamFeature.push({ id: '3', event: 'second-delta' });
    jest.advanceTimersByTime(10);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(990);
    await flushPromises();

    const retryBody = JSON.parse(fetchMock.mock.calls[2]?.[1]?.body);
    expect(retryBody.delta.logs.track).toEqual([
      { id: '2', event: 'first-delta' },
      { id: '3', event: 'second-delta' },
    ]);
  });

  it('backs off failed delta retries instead of retrying every debounce interval', async () => {
    const streamFeature = createStreamingFeature('track', [{ id: '1', event: 'initial' }]);
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true, sessionId: 'session-1' }),
      })
      .mockRejectedValueOnce(new Error('daemon down'))
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true }),
      });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    DebugToolkit.addFeature(streamFeature.feature);

    startStreaming({ endpoint: 'http://127.0.0.1:3799', debounceMs: 10 });
    await flushPromises();

    streamFeature.push({ id: '2', event: 'first-delta' });
    jest.advanceTimersByTime(10);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(10);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(990);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports connected and retrying status changes', async () => {
    const streamFeature = createStreamingFeature('track', [{ id: '1', event: 'initial' }]);
    const statuses: unknown[] = [];
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true, sessionId: 'session-1' }),
      })
      .mockRejectedValueOnce(new Error('daemon down'));
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    DebugToolkit.addFeature(streamFeature.feature);

    startStreaming({
      endpoint: 'http://127.0.0.1:3799',
      debounceMs: 10,
      onStatus: (status) => statuses.push(status),
    });
    await flushPromises();

    streamFeature.push({ id: '2', event: 'delta' });
    jest.advanceTimersByTime(10);
    await flushPromises();

    expect(statuses).toEqual([
      { state: 'connecting' },
      { state: 'connected', sessionId: 'session-1' },
      { state: 'retrying', retryInMs: 1000 },
    ]);
  });

  it('retries full report after a rejected initial sync before sending deltas', async () => {
    const streamFeature = createStreamingFeature('track', [{ id: '1', event: 'initial' }]);
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        status: 500,
        json: async () => ({ ok: false, error: 'Server error' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true, sessionId: 'session-1' }),
      });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    DebugToolkit.addFeature(streamFeature.feature);

    startStreaming({ endpoint: 'http://127.0.0.1:3799', debounceMs: 10 });
    await flushPromises();

    streamFeature.push({ id: '2', event: 'new-while-offline' });
    jest.advanceTimersByTime(10);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://127.0.0.1:3799/report');

    const retryBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body);
    expect(retryBody.logs.track).toEqual([
      { id: '1', event: 'initial' },
      { id: '2', event: 'new-while-offline' },
    ]);
  });

  it('times out a hanging initial sync request and retries', async () => {
    const streamFeature = createStreamingFeature('track', [{ id: '1', event: 'initial' }]);
    const statuses: unknown[] = [];
    const fetchMock = jest.fn((_url: string, init: { signal?: AbortSignal }) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
      }));
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    DebugToolkit.addFeature(streamFeature.feature);

    startStreaming({
      endpoint: 'http://127.0.0.1:3799',
      debounceMs: 10,
      timeoutMs: 1000,
      onStatus: (status) => statuses.push(status),
    });
    await flushPromises();

    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(statuses).toEqual([
      { state: 'connecting' },
      { state: 'retrying', retryInMs: 1000 },
    ]);

    jest.advanceTimersByTime(1000);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops streaming instead of retrying when token auth fails', async () => {
    const streamFeature = createStreamingFeature('track', [{ id: '1', event: 'initial' }]);
    const statuses: unknown[] = [];
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        status: 401,
        json: async () => ({ ok: false, error: 'Unauthorized' }),
      });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    DebugToolkit.addFeature(streamFeature.feature);

    startStreaming({
      endpoint: 'http://127.0.0.1:3799',
      debounceMs: 10,
      onStatus: (status) => statuses.push(status),
    });
    await flushPromises();

    streamFeature.push({ id: '2', event: 'new-while-offline' });
    jest.advanceTimersByTime(30000);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(statuses).toEqual([
      { state: 'connecting' },
      { state: 'failed', reason: 'auth' },
    ]);
  });

  it('stops retrying after the maximum retry attempts', async () => {
    const streamFeature = createStreamingFeature('track', [{ id: '1', event: 'initial' }]);
    const statuses: unknown[] = [];
    const fetchMock = jest.fn().mockRejectedValue(new Error('daemon down'));
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    DebugToolkit.addFeature(streamFeature.feature);

    startStreaming({
      endpoint: 'http://127.0.0.1:3799',
      debounceMs: 10,
      onStatus: (status) => statuses.push(status),
    });
    await flushPromises();

    for (let i = 0; i < 10; i += 1) {
      jest.advanceTimersByTime(30000);
      await flushPromises();
    }

    expect(fetchMock).toHaveBeenCalledTimes(11);
    expect(statuses.at(-1)).toEqual({ state: 'failed', reason: 'retry_limit' });

    jest.advanceTimersByTime(30000);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(11);
  });

  it.each(['console', 'network'])('streams %s feature deltas', async (featureName) => {
    const streamFeature = createStreamingFeature(featureName, [{ id: '1', event: 'initial' }]);
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true, sessionId: 'session-1' }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true }),
      });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    DebugToolkit.addFeature(streamFeature.feature);

    startStreaming({ endpoint: 'http://127.0.0.1:3799', debounceMs: 10 });
    await flushPromises();

    streamFeature.push({ id: '2', event: 'delta' });
    jest.advanceTimersByTime(10);
    await flushPromises();

    const deltaBody = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body);
    expect(deltaBody.delta.logs[featureName]).toEqual([{ id: '2', event: 'delta' }]);
  });
});
