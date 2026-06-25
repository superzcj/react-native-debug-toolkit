import { EnvironmentTab } from './EnvironmentTab';
import {
  findManagedEnvironment,
  getInitialEnvironmentId,
  normalizeEnvironmentInput,
  type NormalizedEnvironmentConfig,
} from './environmentConfig';
import { buildManagedUrlRewriter } from './urlPrefixRewrite';
import type {
  DebugEnvironmentInput,
  DebugFeature,
  DebugFeatureListener,
  EnvironmentConfig,
  EnvironmentState,
} from '../../types';
import { KEYS, getPreference, setPreference, removePreference } from '../../utils/debugPreferences';
import { setUrlRewriter } from '../../utils/urlRewriter';

function buildLegacyHostsMap(
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

function createLegacyUrlRewriter(hostsMap: Map<string, string> | null): ((url: string) => string) | null {
  if (!hostsMap) return null;
  return (url: string): string => {
    try {
      const parsed = new URL(url);
      const targetHost = hostsMap.get(parsed.host);
      if (targetHost) {
        return url.replace(parsed.host, targetHost);
      }
    } catch {
      return url;
    }
    return url;
  };
}

export interface EnvironmentFeatureAPI extends DebugFeature<EnvironmentState> {
  registerEnvironments: (environments: DebugEnvironmentInput) => void;
  switchEnvironment: (environmentId: string | null) => void;
  getCurrentEnvironmentId: () => string | null;
}

export const createEnvironmentFeature = (
  initialEnvironments?: DebugEnvironmentInput,
): EnvironmentFeatureAPI => {
  const listeners = new Set<DebugFeatureListener>();
  let config: NormalizedEnvironmentConfig = normalizeEnvironmentInput(initialEnvironments);
  let initialized = false;
  let activeEnvironmentId: string | null = null;
  let restartRequired = false;
  let loadToken = 0;

  const getCurrentState = (): EnvironmentState => ({
    environments: config.items,
    currentEnvironmentId: activeEnvironmentId,
    mode: config.mode,
    defaultEnvironmentId: config.defaultId,
    restartRequired,
  });

  const notify = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };

  const getLegacyItems = (): EnvironmentConfig[] =>
    config.items
      .filter((item): item is EnvironmentConfig & { mode: 'legacy' } => item.mode === 'legacy')
      .map(({ mode, ...item }) => item);

  const installRewriter = () => {
    if (!initialized) return;

    if (config.mode === 'managed') {
      const defaultEnv = findManagedEnvironment(config, config.defaultId);
      const activeEnv = findManagedEnvironment(config, activeEnvironmentId);
      setUrlRewriter(buildManagedUrlRewriter(defaultEnv, activeEnv));
      return;
    }

    setUrlRewriter(
      createLegacyUrlRewriter(buildLegacyHostsMap(getLegacyItems(), activeEnvironmentId)),
    );
  };

  const callManagedChange = () => {
    if (config.mode !== 'managed' || !config.onChange) {
      return;
    }

    const env = findManagedEnvironment(config, activeEnvironmentId);
    if (!env) {
      return;
    }

    Promise.resolve(config.onChange(env)).catch((err) => {
      if (__DEV__) {
        console.warn('[DebugToolkit] Environment onChange failed:', err);
      }
    });
  };

  const persistSelection = async (envId: string | null) => {
    if (envId) {
      await setPreference(KEYS.environmentId, envId);
    } else {
      await removePreference(KEYS.environmentId);
    }
  };

  const applyEnvironment = (envId: string | null, persist: boolean) => {
    const nextId =
      config.mode === 'managed'
        ? getInitialEnvironmentId(config, envId)
        : envId && config.items.some((item) => item.id === envId)
          ? envId
          : null;

    activeEnvironmentId = nextId;
    installRewriter();
    notify();
    callManagedChange();

    if (persist) {
      persistSelection(activeEnvironmentId).catch((err) => {
        if (__DEV__) {
          console.warn('[DebugToolkit] Failed to persist environment selection:', err);
        }
      });
    }
  };

  const loadPersistedSelection = async () => {
    const token = ++loadToken;
    try {
      const stored = await getPreference(KEYS.environmentId);
      if (token !== loadToken) return;
      applyEnvironment(getInitialEnvironmentId(config, stored), false);
    } catch (err) {
      if (token !== loadToken) return;
      if (__DEV__) {
        console.warn('[DebugToolkit] Failed to load persisted environment:', err);
      }
      applyEnvironment(getInitialEnvironmentId(config, null), false);
    }
  };

  return {
    name: 'environment',
    label: 'Environment',
    renderContent: EnvironmentTab,
    setup: () => {
      if (initialized) return;

      initialized = true;
      loadPersistedSelection();
    },
    getSnapshot: getCurrentState,
    clear: () => {
      ++loadToken;
      if (config.mode === 'managed') {
        restartRequired = activeEnvironmentId != null || restartRequired;
        applyEnvironment(null, false);
        removePreference(KEYS.environmentId).catch((err) => {
          if (__DEV__) {
            console.warn('[DebugToolkit] Failed to clear environment selection:', err);
          }
        });
      } else {
        applyEnvironment(null, true);
      }
    },
    cleanup: () => {
      if (!initialized) return;
      ++loadToken;
      setUrlRewriter(null);
      activeEnvironmentId = null;
      restartRequired = false;
      notify();
      initialized = false;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    registerEnvironments: (envs: DebugEnvironmentInput) => {
      ++loadToken;
      config = normalizeEnvironmentInput(envs);
      applyEnvironment(getInitialEnvironmentId(config, activeEnvironmentId), true);
    },
    switchEnvironment: (envId: string | null) => {
      ++loadToken;
      if (config.mode === 'managed' && envId !== activeEnvironmentId) {
        restartRequired = true;
      }
      applyEnvironment(envId, true);
    },
    getCurrentEnvironmentId: () => activeEnvironmentId,
    badge: () => {
      if (!activeEnvironmentId) return null;
      const env = config.items.find((e) => e.id === activeEnvironmentId);
      if (!env) return null;
      return {
        label: env.label.substring(0, 3).toUpperCase(),
        color: env.color ?? '#FF9500',
      };
    },
  };
};
