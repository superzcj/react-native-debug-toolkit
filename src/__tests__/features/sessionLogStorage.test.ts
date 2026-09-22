import { createPersistedObservableStore } from '../../utils/createPersistedObservableStore';
import { createTrackFeature } from '../../features/track';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import { SessionManager } from '../../utils/SessionManager';
import { createLogRuntime } from '../../utils/logRuntime';

describe('session log storage for built-in features', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('persists track logs under the current session key and cleanup does not clear storage', async () => {
    jest.useFakeTimers();
    const logStorage = new MemoryStorageAdapter();
    const runtime = createLogRuntime({ history: { enabled: true, maxSessions: 5 }, logDisk: logStorage, preferenceDisk: new MemoryStorageAdapter() });
    const sessionManager = runtime.sessionManager;
    const feature = createTrackFeature(undefined, runtime);
    const storageKey = sessionManager.getLogStorageKey('track_logs');

    feature.setup();
    feature.record({ eventName: 'opened_screen' });
    jest.advanceTimersByTime(2000);

    const persistedBeforeCleanup = await logStorage.getItem(storageKey);
    expect(JSON.parse(persistedBeforeCleanup!)).toEqual([
      expect.objectContaining({ eventName: 'opened_screen' }),
    ]);

    feature.cleanup();

    expect(feature.getSnapshot()).toEqual([]);
    expect(await logStorage.getItem(storageKey)).toBe(persistedBeforeCleanup);
  });

  it('persists native logs under the current session key and cleans old native sessions', async () => {
    const logStorage = new MemoryStorageAdapter();
    const sessionManager = new SessionManager(logStorage, { maxSessions: 1 });
    const storageKey = sessionManager.getLogStorageKey('native_logs');

    await logStorage.setItem(storageKey, JSON.stringify([{ id: 'n1', message: 'boot' }]));
    await sessionManager.initialize();

    expect(await logStorage.getItem(storageKey)).toContain('boot');

    const oldSessionId = 'old-session';
    await logStorage.setItem(
      sessionManager.getLogStorageKey('native_logs', oldSessionId),
      JSON.stringify([{ id: 'old', message: 'stale' }]),
    );
    await logStorage.setItem('@react_native_debug_toolkit/sessions', JSON.stringify({
      currentSessionId: oldSessionId,
      sessions: [{ id: oldSessionId, startedAt: 1 }, sessionManager.getCurrentSession()],
      maxSessions: 1,
    }));

    const removed = await sessionManager.cleanupOldSessions();

    expect(removed).toBe(1);
    expect(await logStorage.getItem(sessionManager.getLogStorageKey('native_logs', oldSessionId))).toBeNull();
  });
});


test('persisted logs keep the latest entries within maxLogs and snapshot business data', async () => {
  jest.useFakeTimers();
  const logDisk = new MemoryStorageAdapter();
  const runtime = createLogRuntime({ history: { enabled: true, maxSessions: 5 }, logDisk, preferenceDisk: new MemoryStorageAdapter() });
  const feature = createTrackFeature({ maxLogs: 2 }, runtime);
  feature.setup();
  const toJSON = jest.fn();
  const data = { value: 1, toJSON };
  feature.record({ eventName: 'first' });
  feature.record({ eventName: 'second', data });
  data.value = 2;
  feature.record({ eventName: 'third' });
  jest.advanceTimersByTime(2000);
  const saved = JSON.parse(logDisk.getItem(runtime.sessionManager.getLogStorageKey('track_logs'))!);
  expect(saved.map((entry: { eventName: string }) => entry.eventName)).toEqual(['second', 'third']);
  expect(saved[0].data.value).toBe(1);
  expect(feature.getSnapshot()).toHaveLength(2);
  expect(toJSON).not.toHaveBeenCalled();
  feature.cleanup();
  jest.useRealTimers();
});

test('clear waits behind an in-flight write and stale hydration cannot resurrect data', async () => {
  jest.useFakeTimers();
  let resolveRead!: (raw: string | null) => void;
  let resolveWrite!: () => void;
  const values: string[] = [];
  const storage = {
    getItem: () => new Promise<string | null>(resolve => { resolveRead = resolve; }),
    setItem: jest.fn((_key: string, value: string) => {
      if (value === '[]') { values.push(value); return; }
      return new Promise<void>(resolve => { resolveWrite = () => { values.push(value); resolve(); }; });
    }), removeItem: jest.fn(),
  };
  const store = createPersistedObservableStore<{ id: string }>({ storage, storageKey: 'logs', maxPersist: 2, debounceMs: 1 });
  await Promise.resolve();
  store.push({ id: 'new' });
  jest.advanceTimersByTime(1);
  store.clearPersisted();
  resolveRead('[{"id":"old"}]');
  resolveWrite();
  await store.ready;
  await Promise.resolve();
  expect(store.getData()).toEqual([]);
  expect(values[values.length - 1]).toBe('[]');
  store.dispose();
  jest.useRealTimers();
});

test('history retention includes current session and only removes known log keys', async () => {
  const storage = new MemoryStorageAdapter();
  const current = new SessionManager(storage, { maxSessions: 1 });
  storage.setItem('@react_native_debug_toolkit/sessions', JSON.stringify({ sessions: [
    { id: 'future-old', startedAt: Date.now() + 100000 },
  ] }));
  for (const key of ['console_logs', 'network_logs', 'native_logs', 'track_logs']) {
    storage.setItem(`@react_native_debug_toolkit/future-old/${key}`, 'old');
  }
  storage.setItem('@react_native_debug_toolkit/fab_position', 'preference');
  storage.setItem('@react_native_debug_toolkit/future-old/state', 'unrelated');
  await current.initialize();
  expect((await current.getSessionHistory()).map(session => session.id)).toEqual([current.getCurrentSession().id]);
  expect(storage.getItem('@react_native_debug_toolkit/future-old/native_logs')).toBeNull();
  expect(storage.getItem('@react_native_debug_toolkit/fab_position')).toBe('preference');
  expect(storage.getItem('@react_native_debug_toolkit/future-old/state')).toBe('unrelated');
});
