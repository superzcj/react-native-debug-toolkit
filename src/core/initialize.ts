import { DebugToolkit } from './DebugToolkit';
import { createNetworkFeature, addToBlacklist } from '../features/network';
import type { NetworkFeatureConfig } from '../features/network';
import { createConsoleLogFeature } from '../features/console';
import type { ConsoleFeatureConfig } from '../features/console';
import { createZustandLogFeature } from '../features/zustand';
import type { ZustandFeatureConfig } from '../features/zustand';
import { createNavigationLogFeature } from '../features/navigation';
import type { NavigationFeatureConfig } from '../features/navigation';
import { createTrackFeature } from '../features/track';
import type { TrackFeatureConfig } from '../features/track';
import { createEnvironmentFeature } from '../features/environment';
import { createClipboardFeature } from '../features/clipboard';
import { createDevConnectFeature, restoreDevConnectSettingsToDaemon, nativeIsDebugBuild } from '../features/devConnect';
import { daemonClient } from '../utils/DaemonClient';
import type { AnyDebugFeature, BuiltInFeatureName } from '../types';
import type { StorageAdapter } from '../utils/StorageAdapter';
import {
  createLogRuntime,
  setDefaultLogRuntime,
  type LogRuntimeContext,
} from '../utils/logRuntime';

const isDebugMode = __DEV__;

/** Feature-specific configuration map */
export interface FeatureConfigs {
  network?: boolean | NetworkFeatureConfig;
  console?: boolean | ConsoleFeatureConfig;
  zustand?: boolean | ZustandFeatureConfig;
  navigation?: boolean | NavigationFeatureConfig;
  track?: boolean | TrackFeatureConfig;
  environment?: Parameters<typeof createEnvironmentFeature>[0];
  clipboard?: boolean;
  devConnect?: boolean;
}

export interface InitializeOptions {
  features?: FeatureConfigs;
  customFeatures?: AnyDebugFeature[];
  enabled?: boolean;
  logStorage?: StorageAdapter;
  maxLogSessions?: number;
}

type EnvironmentFeatureConfig = Parameters<typeof createEnvironmentFeature>[0];
type BuiltInFeatureCreator = (config?: unknown, runtime?: LogRuntimeContext) => AnyDebugFeature;

/** Registry mapping feature names to creator functions */
const featureRegistry: Record<BuiltInFeatureName, BuiltInFeatureCreator> = {
  network: (config, runtime) => createNetworkFeature(config as NetworkFeatureConfig | undefined, runtime),
  console: (config, runtime) => createConsoleLogFeature(config as ConsoleFeatureConfig | undefined, runtime),
  zustand: (config) => createZustandLogFeature(config as ZustandFeatureConfig | undefined),
  navigation: (config) => createNavigationLogFeature(config as NavigationFeatureConfig | undefined),
  track: (config, runtime) => createTrackFeature(config as TrackFeatureConfig | undefined, runtime),
  environment: (config) => createEnvironmentFeature(config as EnvironmentFeatureConfig | undefined),
  clipboard: () => createClipboardFeature(),
  devConnect: () => createDevConnectFeature(),
};

const DEFAULT_FEATURES: BuiltInFeatureName[] = [
  'network',
  'console',
  'navigation',
  'zustand',
  'track',
  'clipboard',
  'devConnect',
];

function resolveFeatureConfigs(configs: FeatureConfigs, runtime: LogRuntimeContext): AnyDebugFeature[] {
  const features: AnyDebugFeature[] = [];
  const entries = Object.entries(configs) as [BuiltInFeatureName, unknown][];

  for (const [name, config] of entries) {
    if (config === false) {
      continue;
    }

    const creator = featureRegistry[name];
    if (!creator) {
      console.warn(`[DebugToolkit] Unknown feature: "${name}"`);
      continue;
    }

    if (config === true || config === undefined) {
      features.push(creator(undefined, runtime));
    } else if (typeof config === 'object') {
      features.push(creator(config as Record<string, unknown>, runtime));
    }
  }

  return features;
}

function resolveDefaultFeatures(runtime: LogRuntimeContext): AnyDebugFeature[] {
  return DEFAULT_FEATURES.map((name) => featureRegistry[name]!(undefined, runtime));
}

function appendCustomFeatures(
  builtInFeatures: AnyDebugFeature[],
  customFeatures?: AnyDebugFeature[],
): AnyDebugFeature[] {
  if (!customFeatures || customFeatures.length === 0) {
    return builtInFeatures;
  }

  return [...builtInFeatures, ...customFeatures];
}

/**
 * Initialize the debug toolkit.
 *
 * Detects debug/release mode via native bridge first, falls back to `__DEV__`.
 *
 * @example
 * await initializeDebugToolkit({
 *   features: { network: true, console: true },
 *   enabled: true,
 * });
 */
export async function initializeDebugToolkit(
  options?: InitializeOptions,
): Promise<typeof DebugToolkit> {
  let enabled: boolean;
  if (options?.enabled !== undefined) {
    enabled = options.enabled;
  } else {
    try {
      const nativeResult = await nativeIsDebugBuild();
      enabled = nativeResult !== null ? nativeResult : isDebugMode;
    } catch {
      enabled = isDebugMode;
    }
  }

  try {
    DebugToolkit.setEnabled(enabled);

    if (!enabled) {
      daemonClient.clearSessionProvider();
      DebugToolkit.reset();
      return DebugToolkit;
    }

    const runtime = createLogRuntime({
      logStorage: options?.logStorage,
      maxSessions: options?.maxLogSessions,
    });
    setDefaultLogRuntime(runtime);
    daemonClient.setSessionProvider(() => runtime.sessionManager.getCurrentSession());

    const resolvedBuiltInFeatures = options?.features
      ? resolveFeatureConfigs(options.features, runtime)
      : resolveDefaultFeatures(runtime);
    const resolvedFeatures = appendCustomFeatures(
      resolvedBuiltInFeatures,
      options?.customFeatures,
    );

    DebugToolkit.replaceFeatures(resolvedFeatures);
    runtime.sessionManager.initialize().catch(() => {});

    daemonClient.setEndpointDetector((url) => {
      addToBlacklist(url);
    });

    if (DebugToolkit.hasFeatures()) {
      DebugToolkit.showLauncher();
    } else {
      DebugToolkit.hideLauncher();
    }

    restoreDevConnectSettingsToDaemon()
      .then(() => daemonClient.restore(), () => daemonClient.restore())
      .catch(() => {});

    return DebugToolkit;
  } catch (error) {
    console.error('[DebugToolkit] Initialization failed:', error);
    return DebugToolkit;
  }
}
