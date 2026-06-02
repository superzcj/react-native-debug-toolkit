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
});
