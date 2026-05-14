import { DebugToolkit } from '../../core/DebugToolkit';
import { _resetNetworkForTesting } from '../../features/network';
import {
  _resetDaemonSettingsForTesting,
  saveDaemonStreamingEnabled,
} from '../../utils/daemonSettings';
import { restoreDaemonStreaming } from '../../utils/daemonStreaming';
import { isStreaming, stopStreaming } from '../../utils/streamToDaemon';
import type { DebugFeature } from '../../types';

function createFeature(): DebugFeature<Array<Record<string, unknown>>> {
  return {
    name: 'console',
    label: 'Console',
    setup: jest.fn(),
    getSnapshot: () => [{ id: '1', timestamp: 1, level: 'log', data: ['ready'] }],
    cleanup: jest.fn(),
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('restoreDaemonStreaming', () => {
  let originalFetch: unknown;

  beforeEach(() => {
    originalFetch = (globalThis as { fetch?: unknown }).fetch;
    _resetDaemonSettingsForTesting();
  });

  afterEach(() => {
    stopStreaming();
    if (originalFetch) {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: unknown }).fetch;
    }
    _resetNetworkForTesting();
    DebugToolkit.destroy();
    DebugToolkit.setEnabled(true);
  });

  it('auto-starts simulator streaming when daemon health is reachable on first run', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true, deviceId: 'ios-1' }),
      });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    DebugToolkit.addFeature(createFeature());

    await restoreDaemonStreaming();
    await flushPromises();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3799/health');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost:3799/report');
    expect(isStreaming()).toBe(true);
    expect(isStreaming()).toBe(true);
  });

  it('restores previously enabled streaming without blocking on health check', async () => {
    await saveDaemonStreamingEnabled(true);
    const fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ ok: true, deviceId: 'ios-1' }),
    });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    DebugToolkit.addFeature(createFeature());

    await restoreDaemonStreaming();
    await flushPromises();

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3799/report');
    expect(isStreaming()).toBe(true);
  });
});
