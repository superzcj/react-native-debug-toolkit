import type { ToolkitHost } from '../../core/DebugToolkit';

const originalDev = (globalThis as { __DEV__?: boolean }).__DEV__;

afterEach(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = originalDev;
  jest.restoreAllMocks();
  jest.resetModules();
});

test('default host keeps Connect paused without starting Hub discovery', async () => {
  jest.resetModules();
  jest.dontMock('../../utils/defaultHubActivation');
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  const { NativeModules } = require('react-native');
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  const { createToolkitHost } = require('../../core/DebugToolkit') as typeof import('../../core/DebugToolkit');
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => ({
    ok: true, status: 200, json: async () => ({ ok: true, name: 'react-native-debug-toolkit-hub', protocolVersion: 1 }),
  } as Response));
  const host: ToolkitHost = createToolkitHost({ enabled: true, connect: { appId: 'test.app' } });
  host.start();
  try {
    await host.ready;
    const connect = host.features.find(feature => feature.name === 'connect');
    expect(connect).toBeDefined();
    expect(connect?.getSnapshot().client.getStatus().state).toBe('paused');
    expect(fetch).not.toHaveBeenCalled();
    const snapshot = connect!.getSnapshot();
    snapshot.client.setRuntimeEndpoint('http://192.0.2.8:3900');
    expect(fetch).not.toHaveBeenCalled();
    expect(await snapshot.resolveEndpoint()).toBe('http://192.0.2.8:3900');
  } finally { host.dispose(); }
});

test('active host discovers the Hub at the RN 0.88 Metro host and selected port', async () => {
  jest.resetModules();
  jest.doMock('../../utils/defaultHubActivation', () => ({ __esModule: true, default: { enabled: true, port: 3900 } }));
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  const { NativeModules } = require('react-native');
  NativeModules.DebugToolkitDevConnect = { isDebugBuild: async () => true };
  NativeModules.SourceCode = { getConstants: () => ({ scriptURL: 'http://192.0.2.8:8081/index.bundle' }) };
  let observed!: (url: string) => void;
  const readyRequest = new Promise<string>(resolve => { observed = resolve; });
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
    if (String(url).endsWith('/ready')) {
      observed(String(url));
      return { ok: true, status: 200, json: async () => ({ ok: true, name: 'react-native-debug-toolkit-hub', protocolVersion: 1 }) } as Response;
    }
    return { ok: true, status: 200, json: async () => ({ ok: true, sessionId: 'test', expectedSequence: 1, ackThrough: 0 }) } as Response;
  });
  const { createToolkitHost } = require('../../core/DebugToolkit') as typeof import('../../core/DebugToolkit');
  const host: ToolkitHost = createToolkitHost({ enabled: true, connect: { appId: 'test.app' } });
  host.start();
  try {
    expect(await readyRequest).toBe('http://192.0.2.8:3900/ready');
  } finally { host.dispose(); }
});
