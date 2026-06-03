import { NativeModules } from 'react-native';
import {
  drainNativeLogs, getNativeLogsStatus, isNativeLogsAvailable,
  startNativeLogCapture, stopNativeLogCapture,
} from '../../features/nativeLogs/nativeLogsBridge';

describe('nativeLogsBridge', () => {
  beforeEach(() => { delete NativeModules.DebugToolkitNativeLogs; });

  it('reports unavailable when native module is missing', () => {
    expect(isNativeLogsAvailable()).toBe(false);
  });

  it('starts, drains, and stops native capture through the native module', async () => {
    NativeModules.DebugToolkitNativeLogs = {
      startCapture: jest.fn(async () => ({ ok: true })),
      drainLogs: jest.fn(async () => [{ timestamp: 1, platform: 'android', level: 'info', source: 'logcat', message: 'ready' }]),
      stopCapture: jest.fn(async () => ({ ok: true })),
      getStatus: jest.fn(async () => ({ available: true, capturing: true })),
    };

    await startNativeLogCapture({ minLevel: 'info' });
    await expect(drainNativeLogs(10)).resolves.toEqual([
      { timestamp: 1, platform: 'android', level: 'info', source: 'logcat', message: 'ready' },
    ]);
    await stopNativeLogCapture();
    await expect(getNativeLogsStatus()).resolves.toEqual({ available: true, capturing: true });

    expect(NativeModules.DebugToolkitNativeLogs.startCapture).toHaveBeenCalledWith({ minLevel: 'info' });
    expect(NativeModules.DebugToolkitNativeLogs.drainLogs).toHaveBeenCalledWith(10);
    expect(NativeModules.DebugToolkitNativeLogs.stopCapture).toHaveBeenCalledTimes(1);
  });
});
