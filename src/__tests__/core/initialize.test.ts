// @ts-expect-error __DEV__ is a React Native global
global.__DEV__ = true;

import { DebugToolkit } from '../../core/DebugToolkit';
import { initializeDebugToolkit } from '../../core/initialize';
import type { DebugFeature } from '../../types';

jest.mock('../../features/devConnect/nativeDevConnect', () => ({
  ...jest.requireActual('../../features/devConnect/nativeDevConnect'),
  nativeIsDebugBuild: jest.fn().mockResolvedValue(null),
}));

describe('initializeDebugToolkit', () => {
  beforeEach(async () => {
    DebugToolkit.destroy();
    DebugToolkit.setEnabled(true);
  });

  afterEach(() => {
    DebugToolkit.destroy();
    DebugToolkit.setEnabled(true);
  });

  it('does not register devConnect unless configured with appId', async () => {
    await initializeDebugToolkit({ enabled: true });

    expect(DebugToolkit.features.map((feature) => feature.name)).not.toContain('devConnect');
  });

  it('registers devConnect when configured with appId only', async () => {
    await initializeDebugToolkit({
      enabled: true,
      features: {
        devConnect: {
          appId: 'com.example.demo',
        },
      },
    });

    expect(DebugToolkit.features.map((feature) => feature.name)).toContain('devConnect');
  });

  it('registers devConnect when configured with Shared Hub settings', async () => {
    await initializeDebugToolkit({
      enabled: true,
      features: {
        devConnect: {
          appId: 'com.example.demo',
          endpoint: 'http://172.31.23.124:3800',
        },
      },
    });

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

  it('skips initialization side effects when initialized disabled', async () => {
    await initializeDebugToolkit({ enabled: false });

    expect(DebugToolkit.features).toEqual([]);
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

  it('accepts object-form environment config', async () => {
    await initializeDebugToolkit({
      enabled: true,
      features: {
        environment: {
          defaultId: 'prod',
          items: [
            { id: 'prod', label: 'Production', urls: { app: 'https://api.example.com' } },
            { id: 'qa', label: 'QA', urls: { app: 'https://qa-api.example.com' } },
          ],
        },
      },
    });

    const environmentFeature = DebugToolkit.features.find((feature) => feature.name === 'environment');

    expect(environmentFeature).toBeDefined();
    expect(environmentFeature?.getSnapshot()).toMatchObject({
      mode: 'managed',
      defaultEnvironmentId: 'prod',
    });
  });

  it('orders environment second when configured', async () => {
    await initializeDebugToolkit({
      enabled: true,
      features: {
        console: true,
        native: true,
        environment: {
          defaultId: 'prod',
          items: [
            { id: 'prod', label: 'Production', urls: { app: 'https://api.example.com' } },
          ],
        },
        network: true,
      },
    });

    expect(DebugToolkit.features.map((feature) => feature.name)).toEqual([
      'network',
      'environment',
      'console',
      'native',
    ]);
  });
});
