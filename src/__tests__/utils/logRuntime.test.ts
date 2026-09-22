import { createLogRuntime, persistedLogLimit } from '../../utils/logRuntime';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import { createTrackFeature, addTrackLog } from '../../features/track';

function disk() {
  const storage = new MemoryStorageAdapter();
  return { storage, getItem: jest.spyOn(storage, 'getItem'), setItem: jest.spyOn(storage, 'setItem'), removeItem: jest.spyOn(storage, 'removeItem') };
}
const indexKey = '@react_native_debug_toolkit/sessions';

afterEach(() => jest.useRealTimers());

test.each([
  ['network', 200, 30], ['console', 200, 50], ['native', 10, 10], ['track', 1, 1],
] as const)('%s respects its persistence cap', (feature, maxLogs, expected) => {
  expect(persistedLogLimit(feature, maxLogs)).toBe(expected);
});

test('History off never touches log disk and preserves history for the next enabled runtime', async () => {
  jest.useFakeTimers();
  const log = disk();
  log.storage.setItem(indexKey, JSON.stringify({ sessions: [{ id: 'old', startedAt: 1 }] }));
  log.storage.setItem('@react_native_debug_toolkit/old/track_logs', '[{"eventName":"old"}]');
  log.setItem.mockClear();
  const preferenceDisk = new MemoryStorageAdapter();
  const runtime = createLogRuntime({ history: { enabled: false, maxSessions: 5 }, logDisk: log.storage, preferenceDisk });
  await runtime.initialize(new AbortController().signal);
  await runtime.preferenceStorage.setItem('pref', 'kept');
  const feature = createTrackFeature({ maxLogs: 1 }, runtime);
  feature.setup();
  addTrackLog({ eventName: 'off' });
  jest.advanceTimersByTime(2000);
  feature.clear?.();
  feature.cleanup();
  await runtime.sessionManager.cleanupOldSessions();
  runtime.dispose();
  expect(log.getItem).not.toHaveBeenCalled();
  expect(log.setItem).not.toHaveBeenCalled();
  expect(log.removeItem).not.toHaveBeenCalled();
  expect(preferenceDisk.getItem('pref')).toBe('kept');
  const enabled = createLogRuntime({ history: { enabled: true, maxSessions: 5 }, logDisk: log.storage, preferenceDisk });
  await enabled.initialize(new AbortController().signal);
  expect(await enabled.sessionManager.loadSessionLogs('old', 'track_logs')).toEqual([{ eventName: 'old' }]);
  expect(await enabled.sessionManager.getSessionHistory()).toHaveLength(2);
});

test('cancelled initialization discards a pending read without creating session records', async () => {
  let resolve!: (value: string | null) => void;
  const logDisk = { getItem: jest.fn(() => new Promise<string | null>(r => { resolve = r; })), setItem: jest.fn(), removeItem: jest.fn() };
  const runtime = createLogRuntime({ history: { enabled: true, maxSessions: 1 }, logDisk, preferenceDisk: new MemoryStorageAdapter() });
  const controller = new AbortController();
  const pending = runtime.initialize(controller.signal);
  controller.abort();
  resolve(null);
  await pending;
  expect(logDisk.setItem).not.toHaveBeenCalled();
  expect(logDisk.removeItem).not.toHaveBeenCalled();
});

test.each(['getItem', 'setItem'] as const)('log %s failure falls back to memory and reports capability issue', async method => {
  const logDisk = new MemoryStorageAdapter();
  jest.spyOn(logDisk, method).mockImplementation(() => { throw new Error('MMKV unavailable'); });
  const runtime = createLogRuntime({ history: { enabled: true, maxSessions: 5 }, logDisk, preferenceDisk: new MemoryStorageAdapter() });
  await runtime.initialize(new AbortController().signal);
  await runtime.logStorage.setItem('current', 'memory');
  expect(await runtime.logStorage.getItem('current')).toBe('memory');
  expect(runtime.historyAvailable).toBe(false);
  expect(runtime.getCapabilityIssues()).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'history' })]));
});

test('preference write failure keeps current value but rejects persistence and marks issue', async () => {
  const preferenceDisk = new MemoryStorageAdapter();
  jest.spyOn(preferenceDisk, 'setItem').mockImplementation(() => { throw new Error('full'); });
  const runtime = createLogRuntime({ history: { enabled: false, maxSessions: 5 }, logDisk: new MemoryStorageAdapter(), preferenceDisk });
  await expect(Promise.resolve().then(() => runtime.preferenceStorage.setItem('pref', 'current'))).rejects.toThrow('full');
  expect(await runtime.preferenceStorage.getItem('pref')).toBe('current');
  expect(runtime.getCapabilityIssues()).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'preferences' })]));
});


test('dispose during initialization never establishes a new session', async () => {
  let resolve!: (raw: string | null) => void;
  const runtime = createLogRuntime({ history: { enabled: true, maxSessions: 1 }, logDisk: {
    getItem: () => new Promise<string | null>(r => { resolve = r; }), setItem: jest.fn(), removeItem: jest.fn(),
  }, preferenceDisk: new MemoryStorageAdapter() });
  const session = jest.spyOn(runtime.sessionManager, 'getCurrentSession');
  const pending = runtime.initialize(new AbortController().signal);
  runtime.dispose();
  resolve(null);
  await pending;
  expect(session).not.toHaveBeenCalled();
});

test('MMKV initialization failure is contained by the runtime', async () => {
  const mmkv = await import('react-native-mmkv');
  const spy = jest.spyOn(mmkv, 'createMMKV').mockImplementationOnce(() => { throw new Error('native unavailable'); });
  const { createDefaultLogStorage } = await import('../../utils/StorageAdapter');
  const logDisk = createDefaultLogStorage();
  expect(spy).not.toHaveBeenCalled();
  const runtime = createLogRuntime({ history: { enabled: true, maxSessions: 5 }, logDisk, preferenceDisk: new MemoryStorageAdapter() });
  await runtime.initialize(new AbortController().signal);
  expect(runtime.historyAvailable).toBe(false);
  expect(runtime.getCapabilityIssues()[0]?.message).toBe('native unavailable');
  spy.mockRestore();
});
