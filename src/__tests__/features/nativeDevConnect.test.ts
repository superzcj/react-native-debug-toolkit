import { DevSettings, NativeModules } from 'react-native';

import {
  applyMetroBundle,
  isNativeDevConnectAvailable,
  resetMetroBundle,
} from '../../features/devConnect/nativeDevConnect';

describe('nativeDevConnect', () => {
  beforeEach(() => {
    delete NativeModules.DebugToolkitDevConnect;
    (DevSettings.reload as jest.Mock).mockClear();
    global.fetch = jest.fn();
  });

  it('reports unavailable when native module is not installed', () => {
    expect(isNativeDevConnectAvailable()).toBe(false);
  });

  it('applies Metro host through native module and reloads JS', async () => {
    NativeModules.DebugToolkitDevConnect = {
      applyMetroHost: jest.fn(async () => ({ hostPort: '192.168.1.10:8082' })),
      resetMetroHost: jest.fn(),
    };
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'packager-status:running',
    })) as unknown as typeof fetch;

    await expect(applyMetroBundle('192.168.1.10', '8082')).resolves.toEqual({
      ok: true,
      hostPort: '192.168.1.10:8082',
    });

    expect(global.fetch).toHaveBeenCalledWith('http://192.168.1.10:8082/status', expect.objectContaining({
      method: 'GET',
    }));
    expect(NativeModules.DebugToolkitDevConnect.applyMetroHost).toHaveBeenCalledWith('192.168.1.10:8082');
    expect(DevSettings.reload).toHaveBeenCalledWith('DebugToolkit DevConnect Metro host changed');
  });

  it('does not apply native host when Metro status is not reachable', async () => {
    NativeModules.DebugToolkitDevConnect = {
      applyMetroHost: jest.fn(),
      resetMetroHost: jest.fn(),
    };
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'not-running',
    })) as unknown as typeof fetch;

    await expect(applyMetroBundle('192.168.1.10', '8082')).resolves.toMatchObject({
      ok: false,
      reason: 'metro_unreachable',
    });

    expect(NativeModules.DebugToolkitDevConnect.applyMetroHost).not.toHaveBeenCalled();
    expect(DevSettings.reload).not.toHaveBeenCalled();
  });

  it('resets Metro host through native module and reloads JS', async () => {
    NativeModules.DebugToolkitDevConnect = {
      applyMetroHost: jest.fn(),
      resetMetroHost: jest.fn(async () => undefined),
    };

    await expect(resetMetroBundle()).resolves.toEqual({ ok: true });

    expect(NativeModules.DebugToolkitDevConnect.resetMetroHost).toHaveBeenCalledTimes(1);
    expect(DevSettings.reload).toHaveBeenCalledWith('DebugToolkit DevConnect Metro host reset');
  });
});
