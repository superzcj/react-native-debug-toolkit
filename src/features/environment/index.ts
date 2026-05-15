import { EnvironmentTab } from './EnvironmentTab';
import type {
  DebugFeature,
  DebugFeatureListener,
  EnvironmentConfig,
  EnvironmentState,
} from '../../types';
import { setUrlRewriter } from '../../utils/urlRewriter';

// Lazy AsyncStorage loader
type AsyncStorageModule = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let asyncStorageModule: AsyncStorageModule | null = null;
let asyncStorageChecked = false;

function getAsyncStorage(): AsyncStorageModule | null {
  if (asyncStorageChecked) {
    return asyncStorageModule;
  }
  asyncStorageChecked = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    asyncStorageModule = require('@react-native-async-storage/async-storage').default;
  } catch {
    asyncStorageModule = null;
  }
  return asyncStorageModule;
}

const STORAGE_KEY = 'debug_toolkit_env_id';

function buildHostsMap(
  environments: EnvironmentConfig[],
  targetId: string | null,
): Map<string, string> | null {
  if (!targetId) return null;
  const target = environments.find((e) => e.id === targetId);
  if (!target) return null;

  const map = new Map<string, string>();
  for (const env of environments) {
    if (env.id !== targetId) {
      map.set(env.host, target.host);
    }
  }
  return map;
}

export interface EnvironmentFeatureAPI extends DebugFeature<EnvironmentState> {
  registerEnvironments: (environments: EnvironmentConfig[]) => void;
  switchEnvironment: (environmentId: string | null) => void;
  getCurrentEnvironmentId: () => string | null;
}

export const createEnvironmentFeature = (
  initialEnvironments?: EnvironmentConfig[],
): EnvironmentFeatureAPI => {
  const listeners = new Set<DebugFeatureListener>();
  let environments: EnvironmentConfig[] = initialEnvironments ?? [];
  let initialized = false;
  let currentHostsMap: Map<string, string> | null = null;
  let activeEnvironmentId: string | null = null;

  const createUrlRewriter = (): ((url: string) => string) => {
    return (url: string): string => {
      if (!currentHostsMap) return url;

      try {
        const parsed = new URL(url);
        const targetHost = currentHostsMap.get(parsed.host);
        if (targetHost) {
          return url.replace(parsed.host, targetHost);
        }
      } catch {
        // Not a valid URL or relative URL — return unchanged
      }

      return url;
    };
  };

  const getCurrentState = (): EnvironmentState => ({
    environments,
    currentEnvironmentId: activeEnvironmentId,
  });

  const notify = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };

  const applyEnvironment = (envId: string | null) => {
    activeEnvironmentId = envId;
    currentHostsMap = buildHostsMap(environments, envId);

    if (initialized) {
      try {
        if (envId && environments.length > 0) {
          setUrlRewriter(createUrlRewriter());
        } else {
          setUrlRewriter(null);
        }
      } catch (err) {
        if (__DEV__) console.warn('[DebugToolkit] Failed to set URL rewriter:', err);
      }
    }

    notify();
  };

  const persistSelection = async (envId: string | null) => {
    const storage = getAsyncStorage();
    if (!storage) return;
    try {
      await storage.setItem(STORAGE_KEY, envId ?? '');
    } catch (err) {
      if (__DEV__) console.warn('[DebugToolkit] Failed to persist environment selection:', err);
    }
  };

  const loadPersistedSelection = async () => {
    const storage = getAsyncStorage();
    if (!storage) return;
    try {
      const stored = await storage.getItem(STORAGE_KEY);
      if (stored && stored !== '' && environments.some((e) => e.id === stored)) {
        applyEnvironment(stored);
      }
    } catch (err) {
      if (__DEV__) console.warn('[DebugToolkit] Failed to load persisted environment:', err);
    }
  };

  return {
    name: 'environment',
    label: 'Environment',
    renderContent: EnvironmentTab,
    setup: () => {
      if (initialized) return;

      notify();
      initialized = true;

      // Install rewriter if an environment is already selected
      if (activeEnvironmentId && environments.length > 0) {
        setUrlRewriter(createUrlRewriter());
      }

      // Async persistence load (will override if a preference exists)
      loadPersistedSelection();
    },
    getSnapshot: getCurrentState,
    clear: () => {
      applyEnvironment(null);
      persistSelection(null);
    },
    cleanup: () => {
      if (!initialized) return;
      setUrlRewriter(null);
      activeEnvironmentId = null;
      currentHostsMap = null;
      notify();
      initialized = false;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    registerEnvironments: (envs: EnvironmentConfig[]) => {
      environments = envs;
      applyEnvironment(activeEnvironmentId);
    },
    switchEnvironment: (envId: string | null) => {
      applyEnvironment(envId);
      persistSelection(envId);
    },
    getCurrentEnvironmentId: () => activeEnvironmentId,
    badge: () => {
      if (!activeEnvironmentId) return null;
      const env = environments.find((e) => e.id === activeEnvironmentId);
      if (!env) return null;
      return {
        label: env.label.substring(0, 3).toUpperCase(),
        color: env.color ?? '#FF9500',
      };
    },
  };
};
