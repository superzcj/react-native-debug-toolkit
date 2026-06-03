import { addTrackLog, createTrackFeature, _resetTrackForTesting } from '../../features/track';
import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import { SessionManager } from '../../utils/SessionManager';
import type { LogRuntimeContext } from '../../utils/logRuntime';

describe('session log storage for built-in features', () => {
  afterEach(() => {
    jest.useRealTimers();
    _resetTrackForTesting();
  });

  it('persists track logs under the current session key and cleanup does not clear storage', async () => {
    jest.useFakeTimers();
    const logStorage = new MemoryStorageAdapter();
    const sessionManager = new SessionManager(logStorage);
    const runtime: LogRuntimeContext = { logStorage, sessionManager };
    const feature = createTrackFeature(undefined, runtime);
    const storageKey = sessionManager.getLogStorageKey('track_logs');

    feature.setup();
    addTrackLog({ eventName: 'opened_screen' });
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
