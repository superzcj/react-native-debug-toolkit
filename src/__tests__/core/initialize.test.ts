// @ts-expect-error __DEV__ is a React Native global
global.__DEV__ = true;

import { DebugToolkit } from '../../core/DebugToolkit';
import { initializeDebugToolkit } from '../../core/initialize';
import { _resetDaemonClientForTesting, daemonClient } from '../../utils/DaemonClient';
import { KEYS, setPreference } from '../../utils/debugPreferences';
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
});
