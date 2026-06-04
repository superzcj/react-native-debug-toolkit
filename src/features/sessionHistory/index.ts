import { SessionHistoryTab, type SessionHistoryState, type SelectedSession, type SessionHistoryFeature } from './SessionHistoryTab';
import { createDebugTab } from '../../utils/createDebugTab';
import { getDefaultLogRuntime, type LogRuntimeContext } from '../../utils/logRuntime';
import {
  SESSION_HISTORY_LOG_KEYS,
  createEmptyLogCounts,
  type LogCounts,
  type LogFeatureKey,
} from './sessionLogCatalog';

export function createSessionHistoryFeature(
  runtime: LogRuntimeContext = getDefaultLogRuntime(),
): SessionHistoryFeature {
  let listeners: Array<() => void> = [];
  let sessions = runtime.sessionManager.getCurrentSession() ? [runtime.sessionManager.getCurrentSession()] : [];
  let currentSessionId = runtime.sessionManager.getCurrentSession().id;
  let loading = false;
  let selected: SelectedSession | null = null;
  let initialized = false;
  let logCounts: Record<string, LogCounts> = {};

  function notify() {
    listeners.forEach((l) => l());
  }

  function getSnapshot(): SessionHistoryState {
    return { sessions, currentSessionId, loading, selectedSession: selected, storageType: runtime.logStorage.constructor.name, logCounts };
  }

  async function loadLogCounts(sessionIds: string[]) {
    const counts: Record<string, LogCounts> = {};
    await Promise.all(
      sessionIds.map(async (id) => {
        const c = createEmptyLogCounts();
        await Promise.all(
          SESSION_HISTORY_LOG_KEYS.map(async (key) => {
            c[key] = await runtime.sessionManager.getSessionLogCount(id, key);
          }),
        );
        counts[id] = c;
      }),
    );
    return counts;
  }

  async function loadSession(sessionId: string | null) {
    if (sessionId === null) {
      selected = null;
      notify();
      return;
    }

    loading = true;
    selected = null;
    notify();

    const logs: Record<LogFeatureKey, unknown[]> = {} as Record<LogFeatureKey, unknown[]>;
    await Promise.all(
      SESSION_HISTORY_LOG_KEYS.map(async (key) => {
        logs[key] = await runtime.sessionManager.loadSessionLogs(sessionId, key);
      }),
    );

    loading = false;
    selected = { sessionId, logs };
    notify();
  }

  const feature: SessionHistoryFeature = {
    ...createDebugTab<SessionHistoryState>({
      name: 'sessionHistory',
      label: 'Sessions',
      getSnapshot,
      render: SessionHistoryTab,
      setup: async () => {
        if (initialized) return;
        initialized = true;
        loading = true;
        notify();
        try {
          sessions = await runtime.sessionManager.getSessionHistory();
          currentSessionId = runtime.sessionManager.getCurrentSession().id;
          logCounts = await loadLogCounts(sessions.map((s) => s.id));
        } catch (e) {
          console.warn('[SessionHistory] setup error:', e);
        }
        loading = false;
        notify();
      },
      cleanup: () => {
        initialized = false;
        selected = null;
      },
      subscribe: (listener) => {
        listeners.push(listener);
        return () => {
          listeners = listeners.filter((l) => l !== listener);
        };
      },
    }),
    loadSession,
  };

  return feature;
}
