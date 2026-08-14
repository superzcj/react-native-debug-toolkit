// @ts-expect-error __DEV__ is a React Native global
global.__DEV__ = true;

import { DevConnectTabV4 } from '../../features/devConnect/DevConnectTabV4';
import { createDevConnectFeature } from '../../features/devConnect';
import { _resetHubClientForTesting, hubClient } from '../../utils/HubClient';

jest.mock('../../features/devConnect/resolveAndApplyHubEndpoint', () => ({
  resolveAndApplyHubEndpoint: jest.fn(async () => 'http://10.20.4.10:3800'),
}));

jest.mock('../../utils/debugPreferences', () => ({
  ...jest.requireActual('../../utils/debugPreferences'),
  getPreference: jest.fn(),
}));

jest.mock('../../features/devConnect/nativeDevConnect', () => ({
  ...jest.requireActual('../../features/devConnect/nativeDevConnect'),
  getDeviceLocalIp: jest.fn(),
}));

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

describe('createDevConnectFeature v4', () => {
  beforeEach(() => {
    _resetHubClientForTesting();
    jest.clearAllMocks();
    const { getPreference } = jest.requireMock('../../utils/debugPreferences');
    getPreference.mockResolvedValue(null);
    const { getDeviceLocalIp } = jest.requireMock('../../features/devConnect/nativeDevConnect');
    getDeviceLocalIp.mockResolvedValue(null);
  });

  afterEach(() => {
    // @ts-expect-error __DEV__ is a React Native global
    global.__DEV__ = true;
    jest.restoreAllMocks();
    _resetHubClientForTesting();
  });

  it('uses appId and endpoint to configure and start the shared Hub during feature setup', async () => {
    const configure = jest.spyOn(hubClient, 'configure').mockImplementation(() => undefined);
    const connect = jest.spyOn(hubClient, 'connect').mockImplementation(() => undefined);
    const { resolveAndApplyHubEndpoint } = jest.requireMock(
      '../../features/devConnect/resolveAndApplyHubEndpoint',
    );

    const feature = createDevConnectFeature({
      appId: 'com.example.audit',
      endpoint: 'http://10.20.4.10:3800',
    });

    expect(feature.renderContent).toBe(DevConnectTabV4);
    expect(feature.getSnapshot()).toMatchObject({
      appId: 'com.example.audit',
      canonicalEndpoint: 'http://10.20.4.10:3800',
    });

    feature.setup();
    await flushPromises();

    expect(configure).toHaveBeenCalledWith({
      appId: 'com.example.audit',
      endpoint: 'http://10.20.4.10:3800',
    });
    expect(resolveAndApplyHubEndpoint).toHaveBeenCalled();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('allows Debug setup without a configured endpoint', async () => {
    const configure = jest.spyOn(hubClient, 'configure').mockImplementation(() => undefined);
    const connect = jest.spyOn(hubClient, 'connect').mockImplementation(() => undefined);

    const feature = createDevConnectFeature({
      appId: 'com.example.audit',
    });

    feature.setup();
    await flushPromises();

    expect(configure).toHaveBeenCalledWith({
      appId: 'com.example.audit',
      endpoint: null,
    });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('uses a saved endpoint before the configured endpoint and exposes both recommendations', async () => {
    const configure = jest.spyOn(hubClient, 'configure').mockImplementation(() => undefined);
    const setRuntimeEndpoint = jest.spyOn(hubClient, 'setRuntimeEndpoint').mockImplementation(() => undefined);
    const connect = jest.spyOn(hubClient, 'connect').mockImplementation(() => undefined);
    const { getPreference } = jest.requireMock('../../utils/debugPreferences');
    getPreference.mockResolvedValue('http://192.168.1.123:3800');
    const { getDeviceLocalIp } = jest.requireMock('../../features/devConnect/nativeDevConnect');
    getDeviceLocalIp.mockResolvedValue('192.168.1.45');

    const feature = createDevConnectFeature({
      appId: 'com.example.audit',
      endpoint: 'http://192.168.1.203:3800',
    });

    feature.setup();
    await flushPromises();

    expect(configure).toHaveBeenCalledWith({
      appId: 'com.example.audit',
      endpoint: 'http://192.168.1.203:3800',
    });
    expect(setRuntimeEndpoint).toHaveBeenCalledWith('http://192.168.1.123:3800');
    expect(feature.getSnapshot()).toMatchObject({
      canonicalEndpoint: 'http://192.168.1.123:3800',
      configuredEndpoint: 'http://192.168.1.203:3800',
      subnetPrefix: '192.168.1.',
    });
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('does not configure or reconnect after cleanup while preferences are loading', async () => {
    const configure = jest.spyOn(hubClient, 'configure').mockImplementation(() => undefined);
    const connect = jest.spyOn(hubClient, 'connect').mockImplementation(() => undefined);
    let resolvePreference!: (value: string | null) => void;
    const { getPreference } = jest.requireMock('../../utils/debugPreferences');
    getPreference.mockReturnValue(new Promise((resolve) => {
      resolvePreference = resolve;
    }));

    const feature = createDevConnectFeature({ appId: 'com.example.audit' });
    feature.setup();
    feature.cleanup();
    resolvePreference('http://192.168.1.123:3800');
    await flushPromises();

    expect(configure).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('restores a saved endpoint in a release build without starting live logs', async () => {
    // @ts-expect-error __DEV__ is a React Native global
    global.__DEV__ = false;
    const configure = jest.spyOn(hubClient, 'configure').mockImplementation(() => undefined);
    const setRuntimeEndpoint = jest.spyOn(hubClient, 'setRuntimeEndpoint').mockImplementation(() => undefined);
    const connect = jest.spyOn(hubClient, 'connect').mockImplementation(() => undefined);
    const { resolveAndApplyHubEndpoint } = jest.requireMock(
      '../../features/devConnect/resolveAndApplyHubEndpoint',
    );
    const { getPreference } = jest.requireMock('../../utils/debugPreferences');
    getPreference.mockResolvedValue('http://192.168.1.123:3800');

    const feature = createDevConnectFeature({
      appId: 'com.example.audit',
      endpoint: 'http://192.168.1.203:3800',
    });
    feature.setup();
    await flushPromises();

    expect(configure).toHaveBeenCalledWith({
      appId: 'com.example.audit',
      endpoint: 'http://192.168.1.203:3800',
    });
    expect(setRuntimeEndpoint).toHaveBeenCalledWith('http://192.168.1.123:3800');
    expect(resolveAndApplyHubEndpoint).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
});
