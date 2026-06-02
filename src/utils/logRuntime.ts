import { SessionManager, type SessionManagerOptions } from './SessionManager';
import {
  createDefaultLogStorage,
  type StorageAdapter,
} from './StorageAdapter';

export interface LogRuntimeContext {
  logStorage: StorageAdapter;
  sessionManager: SessionManager;
}

export interface LogRuntimeOptions extends SessionManagerOptions {
  logStorage?: StorageAdapter;
}

let defaultRuntime: LogRuntimeContext | null = null;

export function createLogRuntime(options: LogRuntimeOptions = {}): LogRuntimeContext {
  const logStorage = options.logStorage ?? createDefaultLogStorage();
  return {
    logStorage,
    sessionManager: new SessionManager(logStorage, {
      maxSessions: options.maxSessions,
      featureKeys: options.featureKeys,
    }),
  };
}

export function setDefaultLogRuntime(runtime: LogRuntimeContext | null): void {
  defaultRuntime = runtime;
}

export function getDefaultLogRuntime(): LogRuntimeContext {
  if (!defaultRuntime) {
    defaultRuntime = createLogRuntime();
    defaultRuntime.sessionManager.initialize().catch(() => {});
  }
  return defaultRuntime;
}
