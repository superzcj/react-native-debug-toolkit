import { NativeModules } from 'react-native';

import {
  isNativeDevConnectAvailable,
  nativeIsDebugBuild,
  getDeviceLocalIp,
} from '../../features/devConnect/nativeDevConnect';

describe('nativeDevConnect', () => {
  beforeEach(() => {
    delete NativeModules.DebugToolkitDevConnect;
  });

  it('reports unavailable when native module is not installed', () => {
    expect(isNativeDevConnectAvailable()).toBe(false);
  });

  it('reports available when native module has isDebugBuild', () => {
    NativeModules.DebugToolkitDevConnect = {
      isDebugBuild: jest.fn(),
    };
    expect(isNativeDevConnectAvailable()).toBe(true);
  });

  it('returns null from nativeIsDebugBuild when native module is absent', async () => {
    await expect(nativeIsDebugBuild()).resolves.toBeNull();
  });

  it('delegates isDebugBuild to native module', async () => {
    NativeModules.DebugToolkitDevConnect = {
      isDebugBuild: jest.fn(async () => true),
    };
    await expect(nativeIsDebugBuild()).resolves.toBe(true);
  });

  it('returns null from getDeviceLocalIp when native module lacks getLocalIp', async () => {
    NativeModules.DebugToolkitDevConnect = {
      isDebugBuild: jest.fn(),
    };
    await expect(getDeviceLocalIp()).resolves.toBeNull();
  });

  it('delegates getDeviceLocalIp to native module', async () => {
    NativeModules.DebugToolkitDevConnect = {
      isDebugBuild: jest.fn(),
      getLocalIp: jest.fn(async () => '192.168.1.42'),
    };
    await expect(getDeviceLocalIp()).resolves.toBe('192.168.1.42');
  });
});
