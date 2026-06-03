// @ts-expect-error __DEV__ is a React Native global
global.__DEV__ = true;

import { DebugToolkit } from '../../core/DebugToolkit';
import { initializeDebugToolkit } from '../../core/initialize';
import { _resetDaemonClientForTesting, daemonClient } from '../../utils/DaemonClient';
import { KEYS, setPreference } from '../../utils/debugPreferences';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import type { DebugFeature } from '../../types';

jest.mock('../../features/devConnect/platformDetect', () => ({
  isSimulator: jest.fn().mockReturnValue(false),
}));

jest.mock('../../features/devConnect/nativeDevConnect', () => ({
  ...jest.requireActual('../../features/devConnect/nativeDevConnect'),
  nativeIsDebugBuild: jest.fn().mockResolvedValue(null),
}));

describe('initializeDebugToolkit', () => {
  beforeEach(async () => {
    DebugToolkit.destroy();
    DebugToolkit.setEnabled(true);
    _resetDaemonClientForTesting();
    await setPreference(KEYS.computerHost, '');
  });

  afterEach(() => {
    DebugToolkit.destroy();
    DebugToolkit.setEnabled(true);
    _resetDaemonClientForTesting();
  });

  it('registers devConnect in default features', async () => {
    await initializeDebugToolkit({ enabled: true });

    expect(DebugToolkit.features.map((feature) => feature.name)).toContain('devConnect');
  });

  it('allows devConnect to be disabled through feature config', async () => {
    await initializeDebugToolkit({
      enabled: true,
      features: {
        network: true,
        console: true,
        devConnect: false,
      },
    });

    expect(DebugToolkit.features.map((feature) => feature.name)).toEqual(['network', 'console']);
  });

  it('appends custom features after built-in features', async () => {
    const customFeature: DebugFeature<string> = {
      name: 'user',
      label: 'User',
      setup: jest.fn(),
      getSnapshot: () => 'snapshot',
      cleanup: jest.fn(),
    };

    await initializeDebugToolkit({
      enabled: true,
      features: {
        network: true,
        console: true,
      },
      customFeatures: [customFeature],
    });

    expect(DebugToolkit.features.map((feature) => feature.name)).toEqual([
      'network',
      'console',
      'user',
    ]);
    expect(customFeature.setup).toHaveBeenCalledTimes(1);
  });

  it('keeps built-in feature when a custom feature has the same name', async () => {
    const customNetworkFeature: DebugFeature<string> = {
      name: 'network',
      label: 'Custom Network',
      setup: jest.fn(),
      getSnapshot: () => 'custom',
      cleanup: jest.fn(),
    };

    await initializeDebugToolkit({
      enabled: true,
      features: {
        network: true,
      },
      customFeatures: [customNetworkFeature],
    });

    expect(DebugToolkit.features.map((feature) => feature.label)).toEqual(['Network']);
    expect(customNetworkFeature.setup).not.toHaveBeenCalled();
  });

  it('allows custom features to replace disabled built-in features by name', async () => {
    const customNetworkFeature: DebugFeature<string> = {
      name: 'network',
      label: 'Custom Network',
      setup: jest.fn(),
      getSnapshot: () => 'custom',
      cleanup: jest.fn(),
    };

    await initializeDebugToolkit({
      enabled: true,
      features: {
        network: false,
      },
      customFeatures: [customNetworkFeature],
    });

    expect(DebugToolkit.features.map((feature) => feature.label)).toEqual(['Custom Network']);
    expect(customNetworkFeature.setup).toHaveBeenCalledTimes(1);
  });

  it('restores persisted DevConnect host and configures daemon', async () => {
    await setPreference(KEYS.computerHost, '192.168.1.10');

    await initializeDebugToolkit({ enabled: true });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(daemonClient.getSettings()).toMatchObject({
      mode: 'device',
      deviceHost: '192.168.1.10',
      endpoint: 'http://192.168.1.10:3799',
    });
  });

  it('clears daemon session provider when initialized disabled', async () => {
    const originalFetch = (globalThis as { fetch?: unknown }).fetch;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, logCount: {} }),
    });
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    daemonClient.setSessionProvider(() => ({ id: 'stale-session', startedAt: 1 }));

    await initializeDebugToolkit({ enabled: false });
    await daemonClient.reportOnce({ endpoint: 'http://127.0.0.1:3799' });

    const fetchInit = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(fetchInit.body).session.id).not.toBe('stale-session');

    if (originalFetch) {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
    } else {
      delete (globalThis as { fetch?: unknown }).fetch;
    }
  });

  it('registers native logs in default features', async () => {
    await initializeDebugToolkit({ enabled: true });
    expect(DebugToolkit.features.map((f) => f.name)).toContain('native');
  });

  it('allows native logs to be disabled through feature config', async () => {
    await initializeDebugToolkit({ enabled: true, features: { native: false, console: true } });
    expect(DebugToolkit.features.map((f) => f.name)).toEqual(['console']);
  });

  it('uses enabled true as the release opt-in without a native-specific release flag', async () => {
    await initializeDebugToolkit({ enabled: true, features: { native: true } });
    expect(DebugToolkit.enabled).toBe(true);
    expect(DebugToolkit.features.map((f) => f.name)).toEqual(['native']);
  });

  it('accepts a custom log storage adapter during initialization', async () => {
    const logStorage = new MemoryStorageAdapter();

    await initializeDebugToolkit({
      enabled: true,
      logStorage,
      features: { track: true },
    });

    expect(DebugToolkit.features.map((feature) => feature.name)).toEqual(['track']);
  });
});
