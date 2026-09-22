import { NativeModules } from 'react-native';
import { createNativeLogsFeature, _resetNativeLogsForTesting } from '../../features/nativeLogs';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import { createLogRuntime } from '../../utils/logRuntime';

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
    const feature = createNativeLogsFeature(
      { pollIntervalMs: 100, includeTags: ['Demo'] },
      testRuntime(logStorage),
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

  it('does not start a timer when native capability is missing', () => {
    delete NativeModules.DebugToolkitNativeLogs;
    const logStorage = new MemoryStorageAdapter();
    const feature = createNativeLogsFeature(undefined, testRuntime(logStorage));
    feature.setup();
    expect(jest.getTimerCount()).toBe(0);
    feature.cleanup();
  });

  it('filters levels and stateful tags repeatedly while respecting maxLogs', async () => {
    const pattern = /Demo/g;
    pattern.lastIndex = 3;
    const runtime = testRuntime();
    const feature = createNativeLogsFeature({ minLevel: 'info', includeTags: [pattern], maxLogs: 1 }, runtime);
    feature.setup();
    await flushPromises();
    for (let i = 0; i < 3; i++) { jest.advanceTimersByTime(500); await flushPromises(); }
    expect(feature.getSnapshot()).toHaveLength(1);
    expect(feature.getSnapshot()[0]!.message).toBe('ready');
    expect(pattern.lastIndex).toBe(3);
    feature.cleanup();
  });

  it('does not install a timer after pending native start is cancelled', async () => {
    let resolve!: (value: { ok: boolean }) => void;
    NativeModules.DebugToolkitNativeLogs.startCapture.mockImplementation(() => new Promise(r => { resolve = r; }));
    const runtime = testRuntime();
    const feature = createNativeLogsFeature(undefined, runtime);
    feature.setup();
    feature.cleanup();
    NativeModules.DebugToolkitNativeLogs.stopCapture.mockClear();
    resolve({ ok: true });
    await flushPromises();
    expect(jest.getTimerCount()).toBe(0);
    expect(NativeModules.DebugToolkitNativeLogs.stopCapture).toHaveBeenCalled();
  });

  it('reports a failed native start without polling', async () => {
    NativeModules.DebugToolkitNativeLogs.startCapture.mockResolvedValue({ ok: false });
    const runtime = testRuntime();
    const feature = createNativeLogsFeature(undefined, runtime);
    feature.setup();
    await flushPromises();
    expect(jest.getTimerCount()).toBe(0);
    expect(runtime.getCapabilityIssues()).toContainEqual(expect.objectContaining({ path: 'native' }));
    feature.cleanup();
  });

  it('clears persisted native logs', async () => {
    const logStorage = new MemoryStorageAdapter();
    const feature = createNativeLogsFeature({ pollIntervalMs: 100 }, testRuntime(logStorage));

    feature.setup();
    await flushPromises();
    jest.advanceTimersByTime(100);
    await flushPromises();

    feature.clear?.();
    expect(feature.getSnapshot()).toEqual([]);
  });
});

function testRuntime(logDisk = new MemoryStorageAdapter()) { return createLogRuntime({ history: { enabled: true, maxSessions: 5 }, logDisk, preferenceDisk: new MemoryStorageAdapter() }); }
