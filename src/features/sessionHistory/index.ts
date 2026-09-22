import { SessionHistoryTab, type SessionHistoryState, type SelectedSession, type SessionHistoryFeature } from './SessionHistoryTab';
import { type LogRuntimeContext } from '../../utils/logRuntime';
import {
  SESSION_HISTORY_LOG_KEYS,
  createEmptyLogCounts,
  type LogCounts,
  type LogFeatureKey,
} from './sessionLogCatalog';

export function createSessionHistoryFeature(
  runtime: LogRuntimeContext,
): SessionHistoryFeature {
  let listeners: Array<() => void> = [];
  let sessions = runtime.sessionManager.getCurrentSession() ? [runtime.sessionManager.getCurrentSession()] : [];
  let currentSessionId = runtime.sessionManager.getCurrentSession().id;
  let loading = false;
  let selected: SelectedSession | null = null;
  let initialized = false;
  let generation = 0;
  let unsubscribeCapabilities: (() => void) | undefined;
  let logCounts: Record<string, LogCounts> = {};

  function notify() {
    listeners.forEach((l) => l());
  }

  function getSnapshot(): SessionHistoryState {
    return { sessions, currentSessionId, loading, selectedSession: selected, storageType: runtime.historyAvailable ? 'MMKV' : 'Memory', logCounts, historyAvailable: runtime.historyAvailable, issues: runtime.getCapabilityIssues().filter(issue => issue.path === 'history') };
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

    const epoch = ++generation;
    loading = true;
    selected = null;
    notify();

    const logs: Record<LogFeatureKey, unknown[]> = {} as Record<LogFeatureKey, unknown[]>;
    await Promise.all(
      SESSION_HISTORY_LOG_KEYS.map(async (key) => {
        logs[key] = await runtime.sessionManager.loadSessionLogs(sessionId, key);
      }),
    );

    if (!initialized || !runtime.active || epoch !== generation) { return; }
    loading = false;
    selected = { sessionId, logs };
    notify();
  }

  const feature: SessionHistoryFeature = {
      name: 'history',
      label: 'History',
      status: { phase: 'initializing', issues: [] },
      getSnapshot,
      renderContent: SessionHistoryTab,
      setup: async () => {
        if (initialized || !runtime.active) return;
        initialized = true;
        const epoch = ++generation;
        unsubscribeCapabilities = runtime.subscribeCapabilities(notify);
        loading = true;
        notify();
        try {
          const loaded = await runtime.sessionManager.getSessionHistory();
          if (!initialized || !runtime.active || epoch !== generation) { return; }
          sessions = loaded;
          currentSessionId = runtime.sessionManager.getCurrentSession().id;
          const counts = await loadLogCounts(sessions.map((s) => s.id));
          if (!initialized || !runtime.active || epoch !== generation) { return; }
          logCounts = counts;
        } catch (e) {
          console.warn('[SessionHistory] setup error:', e);
        }
        loading = false;
        notify();
      },
      cleanup: () => {
        initialized = false;
        generation += 1;
        unsubscribeCapabilities?.();
        unsubscribeCapabilities = undefined;
        selected = null;
      },
      subscribe: (listener) => {
        listeners.push(listener);
        return () => {
          listeners = listeners.filter((l) => l !== listener);
        };
      },
    loadSession,
  };

  return feature;
}
