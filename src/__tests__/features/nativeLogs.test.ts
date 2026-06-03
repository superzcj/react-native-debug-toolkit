import { NativeModules } from 'react-native';
import { createNativeLogsFeature, _resetNativeLogsForTesting } from '../../features/nativeLogs';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import { SessionManager } from '../../utils/SessionManager';

async function flushPromises(n = 5): Promise<void> {
  for (let i = 0; i < n; i++) {
    await Promise.resolve();
  }
}

describe('createNativeLogsFeature', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    NativeModules.DebugToolkitNativeLogs = {
      startCapture: jest.fn(async () => ({ ok: true })),
      drainLogs: jest.fn(async () => [
        { timestamp: 10, platform: 'android', level: 'info', source: 'logcat', tag: 'Demo', message: 'ready' },
        { timestamp: 11, platform: 'android', level: 'debug', source: 'logcat', tag: 'Skip', message: 'ignore' },
      ]),
      stopCapture: jest.fn(async () => ({ ok: true })),
      getStatus: jest.fn(async () => ({ available: true, capturing: true })),
    };
    _resetNativeLogsForTesting();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete NativeModules.DebugToolkitNativeLogs;
    _resetNativeLogsForTesting();
  });

  it('starts native capture, drains logs, filters tags, and stores entries', async () => {
    const logStorage = new MemoryStorageAdapter();
    const sessionManager = new SessionManager(logStorage);
    const feature = createNativeLogsFeature(
      { pollIntervalMs: 100, includeTags: ['Demo'] },
      { logStorage, sessionManager },
    );

    feature.setup();
    await flushPromises();
    jest.advanceTimersByTime(100);
    await flushPromises();

    expect(feature.getSnapshot()).toEqual([{
      id: '0', timestamp: 10, platform: 'android', level: 'info',
      source: 'logcat', tag: 'Demo', message: 'ready',
    }]);

    feature.cleanup();
    expect(NativeModules.DebugToolkitNativeLogs.stopCapture).toHaveBeenCalled();
  });

  it('clears persisted native logs', async () => {
    const logStorage = new MemoryStorageAdapter();
    const sessionManager = new SessionManager(logStorage);
    const feature = createNativeLogsFeature({ pollIntervalMs: 100 }, { logStorage, sessionManager });

    feature.setup();
    await flushPromises();
    jest.advanceTimersByTime(100);
    await flushPromises();

    feature.clear?.();
    expect(feature.getSnapshot()).toEqual([]);
  });
});
