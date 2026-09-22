import { ConsoleLogTab } from './ConsoleLogTab';
import type { ConsoleLogEntry, DebugFeature } from '../../types';
import { createPersistedObservableStore } from '../../utils/createPersistedObservableStore';
import { persistedLogLimit, type LogRuntimeContext } from '../../utils/logRuntime';

const LEVELS: ConsoleLogEntry['level'][] = ['log', 'info', 'warn', 'error'];

// ─── Console capture manager (encapsulated mutable state) ──

const consoleCapture = (() => {
  const originalMethods: Partial<Record<ConsoleLogEntry['level'], (...args: unknown[]) => void>> = {};
  const listeners = new Set<(entry: ConsoleLogEntry) => void>();
  const wrappers: Partial<Record<ConsoleLogEntry['level'], (...args: unknown[]) => void>> = {};
  function restore(): void {
    LEVELS.forEach(level => {
      if (console[level] === wrappers[level] && originalMethods[level]) { console[level] = originalMethods[level]!; }
      delete wrappers[level];
      delete originalMethods[level];
    });
  }
  return {
    start(emit: (entry: ConsoleLogEntry) => void) {
      if (listeners.size === 0) {
        LEVELS.forEach(level => {
          const original = console[level];
          originalMethods[level] = original;
          const wrapper = (...args: unknown[]) => {
            original.apply(console, args);
            if (level === 'log' && typeof args[0] === 'string' && args[0].startsWith('[DebugToolkit:Copy]')) { return; }
            const entry: ConsoleLogEntry = { id: '', timestamp: Date.now(), level, data: args };
            listeners.forEach(listener => listener(entry));
          };
          wrappers[level] = wrapper;
          console[level] = wrapper;
        });
      }
      listeners.add(emit);
      return () => { listeners.delete(emit); if (listeners.size === 0) { restore(); } };
    },
    reset() { listeners.clear(); restore(); },
  };
})();

// ─── Feature factory ──────────────────────────────────

const DEFAULT_MAX_LOGS = 200;

export interface ConsoleFeatureConfig {
  /** Maximum number of console logs to keep (default: 200) */
  maxLogs?: number;
  levels?: readonly ConsoleLogEntry['level'][];
}

export interface ConsoleFeature extends DebugFeature<ConsoleLogEntry[]> {
  record(text: string, label?: string): void;
}

export const createConsoleLogFeature = (
  config: ConsoleFeatureConfig | undefined,
  runtime: LogRuntimeContext,
): ConsoleFeature => {
  const maxLogs = config?.maxLogs ?? DEFAULT_MAX_LOGS;
  const logStore = createPersistedObservableStore<ConsoleLogEntry>({
    storage: runtime.logStorage,
    storageKey: runtime.sessionManager.getLogStorageKey('console_logs'),
    maxPersist: persistedLogLimit('console', config?.maxLogs ?? 200),
    isActive: () => runtime.active,
  });
  let initialized = false;
  let stopCapture: (() => void) | null = null;

  return {
    name: 'console',
    label: 'Console',
    status: { phase: 'initializing', issues: [] },
    renderContent: ConsoleLogTab,
    setup: () => {
      if (initialized || !runtime.active) {
        return;
      }

      stopCapture = consoleCapture.start((entry) => {
        if (config?.levels && !config.levels.includes(entry.level)) { return; }
        logStore.push({ ...entry, id: logStore.nextId() }, maxLogs);
      });
      initialized = true;
      return logStore.ready;
    },
    record(text, label) {
      if (!initialized || !runtime.active) { return; }
      logStore.push({ id: logStore.nextId(), timestamp: Date.now(), level: 'log', data: label ? [label, text] : [text] }, maxLogs);
    },
    getSnapshot: () => logStore.getData(),
    clear: () => { logStore.clearPersisted(); },
    cleanup: () => {
      if (!initialized) {
        return;
      }

      stopCapture?.();
      stopCapture = null;
      logStore.dispose();
      initialized = false;
    },
    subscribe: (listener) => logStore.subscribe(listener),
  };
};

/** Reset module-level state for testing */
export function _resetConsoleForTesting(): void {
  consoleCapture.reset();
}
