import { NativeLogTab } from './NativeLogTab';
import type { DebugFeature, DebugFeatureListener, NativeLogEntry } from '../../types';
import { createPersistedObservableStore } from '../../utils/createPersistedObservableStore';
import { getDefaultLogRuntime, type LogRuntimeContext } from '../../utils/logRuntime';
import { drainNativeLogs, startNativeLogCapture, stopNativeLogCapture } from './nativeLogsBridge';

const DEFAULT_MAX_LOGS = 200;
const DEFAULT_MAX_PERSIST = 50;
const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_DRAIN_LIMIT = 100;

const LEVEL_RANK: Record<NativeLogEntry['level'], number> = {
  trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5, unknown: 0,
};

export interface NativeLogsFeatureConfig {
  maxLogs?: number;
  pollIntervalMs?: number;
  minLevel?: NativeLogEntry['level'];
  includeTags?: Array<string | RegExp>;
  excludeTags?: Array<string | RegExp>;
}

function matchesPattern(value: string | undefined, patterns: Array<string | RegExp> | undefined): boolean {
  if (!value || !patterns?.length) return false;
  return patterns.some((p) => p instanceof RegExp ? p.test(value) : value.includes(p));
}

function shouldKeepEntry(entry: Omit<NativeLogEntry, 'id'>, config?: NativeLogsFeatureConfig): boolean {
  if (config?.minLevel && LEVEL_RANK[entry.level] < LEVEL_RANK[config.minLevel]) return false;
  if (config?.includeTags?.length && !matchesPattern(entry.tag, config.includeTags)) return false;
  if (matchesPattern(entry.tag, config?.excludeTags)) return false;
  return true;
}

export const createNativeLogsFeature = (
  config?: NativeLogsFeatureConfig,
  runtime: LogRuntimeContext = getDefaultLogRuntime(),
): DebugFeature<NativeLogEntry[]> => {
  const maxLogs = config?.maxLogs ?? DEFAULT_MAX_LOGS;
  const pollIntervalMs = Math.max(100, Math.floor(config?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS));
  const logStore = createPersistedObservableStore<NativeLogEntry>({
    storage: runtime.logStorage,
    storageKey: runtime.sessionManager.getLogStorageKey('native_logs'),
    maxPersist: DEFAULT_MAX_PERSIST,
  });

  let initialized = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let draining = false;

  async function drainOnce(): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      const entries = await drainNativeLogs(DEFAULT_DRAIN_LIMIT);
      entries.filter((e) => shouldKeepEntry(e, config)).forEach((entry) => {
        logStore.push({ ...entry, id: logStore.nextId() }, maxLogs);
      });
    } finally { draining = false; }
  }

  return {
    name: 'native',
    label: 'Native',
    renderContent: NativeLogTab,
    setup: () => {
      if (initialized) return;
      initialized = true;
      startNativeLogCapture({
        minLevel: config?.minLevel,
        includeTags: config?.includeTags?.filter((p) => typeof p === 'string'),
        excludeTags: config?.excludeTags?.filter((p) => typeof p === 'string'),
      }).catch(() => {});
      timer = setInterval(() => { drainOnce().catch(() => {}); }, pollIntervalMs);
    },
    getSnapshot: () => logStore.getData(),
    clear: () => { logStore.clearPersisted(); },
    cleanup: () => {
      if (!initialized) return;
      if (timer) clearInterval(timer);
      timer = null;
      stopNativeLogCapture().catch(() => {});
      logStore.dispose();
      initialized = false;
      draining = false;
    },
    subscribe: (listener: DebugFeatureListener) => logStore.subscribe(listener),
  };
};

export function _resetNativeLogsForTesting(): void {
  stopNativeLogCapture().catch(() => {});
}
