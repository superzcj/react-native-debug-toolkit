import { NativeModules } from 'react-native';

import {
  getDeviceLocalIp,
  isNativeDevConnectAvailable,
  nativeIsDebugBuild,
  resolveAppId,
} from '../../features/devConnect/nativeDevConnect';

describe('nativeDevConnect', () => {
  it('prefers explicit app identity and never invents a fallback', () => {
    expect(resolveAppId('product', 'com.native.app')).toBe('product');
    expect(resolveAppId(undefined, 'com.native.app')).toBe('com.native.app');
    expect(resolveAppId(undefined, undefined)).toBeNull();
    expect(resolveAppId(' ', 'com.native.app')).toBeNull();
  });
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

  it('returns the native local IPv4 when available', async () => {
    NativeModules.DebugToolkitDevConnect = {
      isDebugBuild: jest.fn(),
      getLocalIp: jest.fn(async () => '192.168.1.45'),
    };

    await expect(getDeviceLocalIp()).resolves.toBe('192.168.1.45');
  });

  it('returns null when native local IP lookup fails', async () => {
    NativeModules.DebugToolkitDevConnect = {
      isDebugBuild: jest.fn(),
      getLocalIp: jest.fn(async () => { throw new Error('offline'); }),
    };

    await expect(getDeviceLocalIp()).resolves.toBeNull();
  });

});
