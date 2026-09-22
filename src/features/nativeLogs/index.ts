import { NativeLogTab } from './NativeLogTab';
import type { DebugFeature, DebugFeatureListener, NativeLogEntry } from '../../types';
import { createPersistedObservableStore } from '../../utils/createPersistedObservableStore';
import { persistedLogLimit, type LogRuntimeContext } from '../../utils/logRuntime';
import { acquireNativeLogCapture, drainNativeLogs, isNativeLogsAvailable, resetNativeCaptureOwners, stopNativeLogCapture } from './nativeLogsBridge';

const DEFAULT_MAX_LOGS = 200;
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
  return patterns.some((p) => p instanceof RegExp ? new RegExp(p.source, p.flags).test(value) : value.includes(p));
}

function shouldKeepEntry(entry: Omit<NativeLogEntry, 'id'>, config?: NativeLogsFeatureConfig): boolean {
  if (config?.minLevel && LEVEL_RANK[entry.level] < LEVEL_RANK[config.minLevel]) return false;
  if (config?.includeTags?.length && !matchesPattern(entry.tag, config.includeTags)) return false;
  if (matchesPattern(entry.tag, config?.excludeTags)) return false;
  return true;
}

export const createNativeLogsFeature = (
  config: NativeLogsFeatureConfig | undefined,
  runtime: LogRuntimeContext,
): DebugFeature<NativeLogEntry[]> => {
  const maxLogs = config?.maxLogs ?? DEFAULT_MAX_LOGS;
  const pollIntervalMs = Math.max(100, Math.floor(config?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS));
  const logStore = createPersistedObservableStore<NativeLogEntry>({
    storage: runtime.logStorage,
    storageKey: runtime.sessionManager.getLogStorageKey('native_logs'),
    maxPersist: persistedLogLimit('native', maxLogs),
    isActive: () => runtime.active,
    maxEntries: maxLogs,
  });

  let initialized = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let draining = false;
  let generation = 0;
  let capture: ReturnType<typeof acquireNativeLogCapture> | null = null;

  async function drainOnce(): Promise<void> {
    if (draining || !initialized || !runtime.active) return;
    draining = true;
    try {
      const epoch = generation;
      const entries = await drainNativeLogs(DEFAULT_DRAIN_LIMIT);
      if (!initialized || !runtime.active || epoch !== generation) { return; }
      entries.filter((e) => shouldKeepEntry(e, config)).forEach((entry) => {
        logStore.push({ ...entry, id: logStore.nextId() }, maxLogs);
      });
    } finally { draining = false; }
  }

  return {
    name: 'native',
    label: 'Native',
    status: { phase: 'initializing', issues: [] },
    renderContent: NativeLogTab,
    setup: () => {
      if (initialized || !runtime.active) return;
      if (!isNativeLogsAvailable()) {
        runtime.reportCapabilityIssue({ path: 'native', message: 'Native log capture is unavailable.' });
        return;
      }
      initialized = true;
      const epoch = ++generation;
      const lease = acquireNativeLogCapture();
      capture = lease;
      return Promise.all([logStore.ready, lease.ready.then(started => {
        if (!initialized || !runtime.active) {
          lease.release();
          return;
        }
        if (epoch !== generation) { return; }
        if (!started) {
          runtime.reportCapabilityIssue({ path: 'native', message: 'Native log capture could not start.' });
          return;
        }
        timer = setInterval(() => { void drainOnce(); }, pollIntervalMs);
      })]).then(() => undefined);
    },
    getSnapshot: () => logStore.getData(),
    clear: () => { logStore.clearPersisted(); },
    cleanup: () => {
      if (!initialized) return;
      generation += 1;
      if (timer) clearInterval(timer);
      timer = null;
      capture?.release();
      capture = null;
      logStore.dispose();
      initialized = false;
      draining = false;
    },
    subscribe: (listener: DebugFeatureListener) => logStore.subscribe(listener),
  };
};

export function _resetNativeLogsForTesting(): void {
  resetNativeCaptureOwners();
  stopNativeLogCapture().catch(() => {});
}
