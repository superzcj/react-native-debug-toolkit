// @ts-expect-error __DEV__ is a React Native global
global.__DEV__ = true;

import { DebugToolkit } from '../../core/DebugToolkit';
import { initializeDebugToolkit } from '../../core/initialize';
import { _resetDaemonClientForTesting, daemonClient } from '../../utils/DaemonClient';
import { KEYS, setPreference } from '../../utils/debugPreferences';

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
