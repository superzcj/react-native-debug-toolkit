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
  enabled?: boolean;
}

/** Registry mapping feature names to creator functions */
// Config param requires `any` — each factory accepts a different config type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const featureRegistry: Record<BuiltInFeatureName, (config?: any) => AnyDebugFeature> = {
  network: createNetworkFeature,
  console: createConsoleLogFeature,
  zustand: createZustandLogFeature,
  navigation: createNavigationLogFeature,
  track: createTrackFeature,
  environment: createEnvironmentFeature,
  clipboard: createClipboardFeature,
  devConnect: createDevConnectFeature,
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

function resolveFeatureConfigs(configs: FeatureConfigs): AnyDebugFeature[] {
  const features: AnyDebugFeature[] = [];
  const entries = Object.entries(configs) as [BuiltInFeatureName, unknown][];

  for (const [name, config] of entries) {
    if (config === false) continue;

    const creator = featureRegistry[name];
    if (!creator) {
      console.warn(`[DebugToolkit] Unknown feature: "${name}"`);
      continue;
    }

    if (config === true || config === undefined) {
      features.push(creator());
    } else if (typeof config === 'object') {
      features.push(creator(config as Record<string, unknown>));
    }
  }

  return features;
}

function resolveDefaultFeatures(): AnyDebugFeature[] {
  return DEFAULT_FEATURES.map((name) => featureRegistry[name]!());
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

  const resolvedFeatures = options?.features
    ? resolveFeatureConfigs(options.features)
    : resolveDefaultFeatures();

  try {
    DebugToolkit.setEnabled(enabled);

    if (!enabled) {
      DebugToolkit.reset();
      return DebugToolkit;
    }

    DebugToolkit.replaceFeatures(resolvedFeatures);

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
