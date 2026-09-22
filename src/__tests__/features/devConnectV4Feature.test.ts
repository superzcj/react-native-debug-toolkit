// @ts-expect-error __DEV__ is a React Native global
global.__DEV__ = true;

import { DevConnectTabV4 } from '../../features/devConnect/DevConnectTabV4';
import { createDevConnectFeature as createFeature } from '../../features/devConnect';
import { HubClient } from '../../utils/HubClient';
const hubClient = new HubClient({ featureProvider: { features: [], subscribe: () => () => {} } });
const createDevConnectFeature = (config: Parameters<typeof createFeature>[0] = {}) => createFeature(config, { client: hubClient });
import { NativeModules } from 'react-native';

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
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
}

describe('createDevConnectFeature v4', () => {
  beforeEach(() => {
    delete NativeModules.DebugToolkitDevConnect;
    hubClient._resetForTesting();
    jest.clearAllMocks();
    const { getPreference } = jest.requireMock('../../utils/debugPreferences');
    getPreference.mockResolvedValue(null);
    const { getDeviceLocalIp } = jest.requireMock('../../features/devConnect/nativeDevConnect');
    getDeviceLocalIp.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.useRealTimers();
    // @ts-expect-error __DEV__ is a React Native global
    global.__DEV__ = true;
    jest.restoreAllMocks();
    hubClient._resetForTesting();
  });

  it('resolves native app identity without config and reports missing identity as unavailable', async () => {
    const feature = createDevConnectFeature();
    const controller = new AbortController();
    const setStatus = jest.fn();
    await feature.start({ owner: Symbol(), signal: controller.signal, isCurrent: () => true, setStatus });
    expect(feature.getSnapshot().appId).toBeNull();
    expect(setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'unavailable', issues: [{ path: 'connect.appId', message: expect.stringContaining('connect.appId') }] }));
    feature.dispose();
    NativeModules.DebugToolkitDevConnect = { getAppInfo: async () => ({ nativeApplicationId: 'com.native.app' }) };
    const native = createDevConnectFeature();
    await native.start({ owner: Symbol(), signal: controller.signal, isCurrent: () => true, setStatus });
    expect(native.getSnapshot().appId).toBe('com.native.app');
    native.dispose();
  });

  it('does not wait for discovery in local start and cancels discovery/retries on disposal', async () => {
    jest.useFakeTimers();
    let finish!: (result: string | null) => void;
    const { resolveAndApplyHubEndpoint } = jest.requireMock('../../features/devConnect/resolveAndApplyHubEndpoint');
    resolveAndApplyHubEndpoint.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const connect = jest.spyOn(hubClient, 'connect');
    const feature = createDevConnectFeature({ appId: 'app' });
    const controller = new AbortController();
    await feature.start({ owner: Symbol(), signal: controller.signal, isCurrent: () => true, setStatus: jest.fn() });
    const options = resolveAndApplyHubEndpoint.mock.calls.at(-1)[1];
    feature.dispose();
    expect(options.signal.aborted).toBe(true);
    finish('http://late:3800');
    await flushPromises();
    expect(connect).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('retries a missing Hub in the background and clears the retry when disposed', async () => {
    jest.useFakeTimers();
    const { resolveAndApplyHubEndpoint } = jest.requireMock('../../features/devConnect/resolveAndApplyHubEndpoint');
    resolveAndApplyHubEndpoint.mockResolvedValue(null);
    const feature = createDevConnectFeature({ appId: 'app' });
    feature.setup();
    await flushPromises();
    expect(jest.getTimerCount()).toBe(1);
    await jest.advanceTimersByTimeAsync(1000);
    expect(resolveAndApplyHubEndpoint).toHaveBeenCalledTimes(2);
    feature.dispose();
    expect(jest.getTimerCount()).toBe(0);
    resolveAndApplyHubEndpoint.mockResolvedValue('http://10.20.4.10:3800');
  });

  it('honors a native Release build even when JS dev is true', async () => {
    NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => false };
    const connect = jest.spyOn(hubClient, 'connect');
    const { resolveAndApplyHubEndpoint } = jest.requireMock('../../features/devConnect/resolveAndApplyHubEndpoint');
    const feature = createDevConnectFeature({ appId: 'app', endpoint: 'http://configured:3800' });
    feature.setup();
    await flushPromises();
    expect(resolveAndApplyHubEndpoint).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    feature.dispose();
  });

  it('reports invalid explicit config as an error before starting requests', async () => {
    const setStatus = jest.fn();
    const controller = new AbortController();
    const feature = createDevConnectFeature({ appId: 'app', endpoint: 'https://invalid/path' });
    await feature.start({ owner: Symbol(), signal: controller.signal, isCurrent: () => true, setStatus });
    expect(setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'error', issues: [expect.objectContaining({ path: 'connect.endpoint' })] }));
    expect(hubClient.isActive()).toBe(false);
    feature.dispose();
  });

  it('drops native info after owner release and does not disconnect a replacement owner', async () => {
    let finish!: (value: { nativeApplicationId: string }) => void;
    NativeModules.DebugToolkitDevConnect = { getAppInfo: () => new Promise(resolve => { finish = resolve; }) };
    const old = createDevConnectFeature();
    old.setup();
    await flushPromises();
    old.dispose();
    finish({ nativeApplicationId: 'old-app' });
    await flushPromises();
    expect(old.getSnapshot().appId).toBeNull();
    delete NativeModules.DebugToolkitDevConnect;
    const replacement = createDevConnectFeature({ appId: 'new-app' });
    replacement.setup();
    await flushPromises();
    const disconnect = jest.spyOn(hubClient, 'disconnect');
    old.dispose();
    expect(disconnect).not.toHaveBeenCalled();
    replacement.dispose();
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
    const configure = jest.spyOn(hubClient, 'configure');
    const setRuntimeEndpoint = jest.spyOn(hubClient, 'setRuntimeEndpoint');
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
