import type { ConfigIssue } from '../core/config';
import { SessionManager } from './SessionManager';
import { MemoryStorageAdapter, createResilientStorage, type StorageAdapter } from './StorageAdapter';

export interface LogRuntimeContext {
  logStorage: StorageAdapter;
  preferenceStorage: StorageAdapter;
  sessionManager: SessionManager;
  initialize(signal: AbortSignal): Promise<void>;
  dispose(): void;
  readonly historyAvailable: boolean;
  readonly active: boolean;
  getCapabilityIssues(): readonly ConfigIssue[];
  reportCapabilityIssue(issue: ConfigIssue): void;
  subscribeCapabilities(listener: () => void): () => void;
}

export interface LogRuntimeOptions {
  history: { enabled: boolean; maxSessions: number };
  logDisk: StorageAdapter;
  preferenceDisk: StorageAdapter;
}

export function persistedLogLimit(feature: 'network' | 'console' | 'native' | 'track', maxLogs: number): number {
  return Math.min(feature === 'network' ? 30 : 50, Math.max(1, Math.floor(maxLogs)));
}

export function createLogRuntime(options: LogRuntimeOptions): LogRuntimeContext {
  let active = true;
  const lifetime = new AbortController();
  let historyAvailable = options.history.enabled;
  let pending: Promise<void> | undefined;
  let detach: (() => void) | undefined;
  const issues = new Map<string, ConfigIssue>();
  const listeners = new Set<() => void>();
  const reportCapabilityIssue = (issue: ConfigIssue) => {
    if (!active) { return; }
    issues.set(issue.path, issue);
    if (issue.path === 'history') { historyAvailable = false; }
    listeners.forEach(listener => listener());
  };
  const failure = (path: string) => (error: unknown) => reportCapabilityIssue({
    path, message: error instanceof Error ? error.message : String(error),
  });
  const logStorage = createResilientStorage(
    options.history.enabled ? options.logDisk : new MemoryStorageAdapter(), failure('history'), false, () => active,
  );
  const preferenceStorage = createResilientStorage(options.preferenceDisk, failure('preferences'), true, () => active);
  const sessionManager = new SessionManager(logStorage, { maxSessions: options.history.maxSessions });
  const runtime: LogRuntimeContext = {
    logStorage, preferenceStorage, sessionManager,
    get historyAvailable() { return historyAvailable; },
    get active() { return active; },
    getCapabilityIssues: () => [...issues.values()],
    reportCapabilityIssue,
    subscribeCapabilities(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    initialize(signal) {
      if (!active || signal.aborted) { active = false; return Promise.resolve(); }
      if (!pending) {
        const abort = () => runtime.dispose();
        signal.addEventListener('abort', abort, { once: true });
        detach = () => signal.removeEventListener('abort', abort);
        pending = sessionManager.initialize(lifetime.signal);
      }
      return pending;
    },
    dispose() { active = false; lifetime.abort(); detach?.(); listeners.clear(); },
  };
  return runtime;
}

let defaultRuntime: LogRuntimeContext | null = null;
/** Explicit legacy host binding only; collectors always receive their own runtime. */
export function setDefaultLogRuntime(runtime: LogRuntimeContext | null): void { defaultRuntime = runtime; }
export function getDefaultLogRuntime(): LogRuntimeContext {
  if (!defaultRuntime) { throw new Error('A log runtime must be injected by the toolkit host.'); }
  return defaultRuntime;
}
