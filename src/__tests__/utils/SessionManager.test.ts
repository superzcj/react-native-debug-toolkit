import { MemoryStorageAdapter } from '../../utils/StorageAdapter';
import { SessionManager } from '../../utils/SessionManager';

describe('SessionManager', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates the current session synchronously', () => {
    jest.useFakeTimers().setSystemTime(1000);
    const storage = new MemoryStorageAdapter();
    const sessionManager = new SessionManager(storage);

    expect(sessionManager.getCurrentSession()).toMatchObject({ startedAt: 1000 });
    expect(sessionManager.getCurrentSession().id).toMatch(/^1000-/);
    expect(sessionManager.getLogStorageKey('console_logs')).toContain(
      `/${sessionManager.getCurrentSession().id}/console_logs`,
    );
  });

  it('saves session history with newest session first', async () => {
    const storage = new MemoryStorageAdapter();

    jest.useFakeTimers().setSystemTime(1000);
    const first = new SessionManager(storage);
    await first.initialize();

    jest.setSystemTime(2000);
    const second = new SessionManager(storage);
    await second.initialize();

    const sessions = await second.getSessionHistory();
    expect(sessions.map((session) => session.id)).toEqual([
      second.getCurrentSession().id,
      first.getCurrentSession().id,
    ]);
  });

  it('removes log keys for sessions outside the retention window', async () => {
    const storage = new MemoryStorageAdapter();
    const managers: SessionManager[] = [];

    jest.useFakeTimers();
    for (let index = 0; index < 6; index += 1) {
      jest.setSystemTime(1000 + index);
      const manager = new SessionManager(storage, { maxSessions: 5 });
      managers.push(manager);
      await storage.setItem(manager.getLogStorageKey('console_logs'), `console-${index}`);
      await storage.setItem(manager.getLogStorageKey('network_logs'), `network-${index}`);
      await storage.setItem(manager.getLogStorageKey('track_logs'), `track-${index}`);
      await manager.initialize();
    }

    expect(await storage.getItem(managers[0]!.getLogStorageKey('console_logs'))).toBeNull();
    expect(await storage.getItem(managers[0]!.getLogStorageKey('network_logs'))).toBeNull();
    expect(await storage.getItem(managers[0]!.getLogStorageKey('track_logs'))).toBeNull();
    expect(await storage.getItem(managers[1]!.getLogStorageKey('console_logs'))).toBe('console-1');
  });

  it('loads current session logs and clears only the current feature key', async () => {
    const storage = new MemoryStorageAdapter();
    const manager = new SessionManager(storage);
    const consoleKey = manager.getLogStorageKey('console_logs');
    const networkKey = manager.getLogStorageKey('network_logs');
    await storage.setItem(consoleKey, JSON.stringify([{ id: '1', value: 'console' }]));
    await storage.setItem(networkKey, JSON.stringify([{ id: '2', value: 'network' }]));

    await expect(manager.loadSessionLogs(manager.getCurrentSession().id, 'console_logs')).resolves.toEqual([
      { id: '1', value: 'console' },
    ]);

    await manager.clearCurrentSessionLogs('console_logs');

    await expect(manager.loadSessionLogs(manager.getCurrentSession().id, 'console_logs')).resolves.toEqual([]);
    await expect(manager.loadSessionLogs(manager.getCurrentSession().id, 'network_logs')).resolves.toEqual([
      { id: '2', value: 'network' },
    ]);
  });
});
