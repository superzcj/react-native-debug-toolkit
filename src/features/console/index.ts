import { ConsoleLogTab } from './ConsoleLogTab';
import type { ConsoleLogEntry, DebugFeature } from '../../types';
import { createPersistedObservableStore } from '../../utils/createPersistedObservableStore';
import { KEYS } from '../../utils/debugPreferences';

const LEVELS: ConsoleLogEntry['level'][] = ['log', 'info', 'warn', 'error'];

// ─── Console capture manager (encapsulated mutable state) ──

const consoleCapture = (() => {
  const originalMethods: Partial<Record<ConsoleLogEntry['level'], (...args: unknown[]) => void>> = {};
  let refCount = 0;

  function stop(): void {
    refCount = Math.max(0, refCount - 1);
    if (refCount > 0) return;

    LEVELS.forEach((level) => {
      const original = originalMethods[level];
      if (original) {
        console[level] = original;
        delete originalMethods[level];
      }
    });
  }

  function isIntercepted(): boolean {
    return LEVELS.some((level) => originalMethods[level] !== undefined);
  }

  function start(emit: (entry: ConsoleLogEntry) => void): () => void {
    refCount += 1;
    if (isIntercepted()) {
      return () => { stop(); };
    }

    LEVELS.forEach((level) => {
      originalMethods[level] = console[level];

      console[level] = (...args: unknown[]) => {
        originalMethods[level]?.apply(console, args);
        if (level === 'log' && typeof args[0] === 'string' && args[0].startsWith('[DebugToolkit:Copy]')) {
          return;
        }
        emit({
          id: '',
          timestamp: Date.now(),
          level,
          data: args,
        });
      };
    });

    return () => { stop(); };
  }

  return {
    start,
    reset() {
      LEVELS.forEach((level) => {
        const original = originalMethods[level];
        if (original) {
          console[level] = original;
          delete originalMethods[level];
        }
      });
      refCount = 0;
    },
  };
})();

// ─── Feature factory ──────────────────────────────────

const DEFAULT_MAX_LOGS = 200;

export interface ConsoleFeatureConfig {
  /** Maximum number of console logs to keep (default: 200) */
  maxLogs?: number;
}

export const createConsoleLogFeature = (config?: ConsoleFeatureConfig): DebugFeature<ConsoleLogEntry[]> => {
  const maxLogs = config?.maxLogs ?? DEFAULT_MAX_LOGS;
  const logStore = createPersistedObservableStore<ConsoleLogEntry>({
    storageKey: KEYS.consoleLogs,
    maxPersist: 50,
  });
  let initialized = false;
  let stopCapture: (() => void) | null = null;

  return {
    name: 'console',
    label: 'Console',
    renderContent: ConsoleLogTab,
    setup: () => {
      if (initialized) return;

      stopCapture = consoleCapture.start((entry) => {
        logStore.push({ ...entry, id: logStore.nextId() }, maxLogs);
      });
      initialized = true;
    },
    getSnapshot: () => logStore.getData(),
    clear: () => { logStore.clear(); },
    cleanup: () => {
      if (!initialized) return;

      stopCapture?.();
      stopCapture = null;
      logStore.clear();
      initialized = false;
    },
    subscribe: (listener) => logStore.subscribe(listener),
  };
};

/** Reset module-level state for testing */
export function _resetConsoleForTesting(): void {
  consoleCapture.reset();
}
