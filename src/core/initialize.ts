import { DebugToolkit } from './DebugToolkit';
import { createNetworkFeature } from '../features/network';
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
import { restoreDaemonStreaming } from '../utils/daemonStreaming';
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
};

const DEFAULT_FEATURES: BuiltInFeatureName[] = [
  'network',
  'console',
  'navigation',
  'zustand',
  'track',
  'clipboard',
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
 * @example
 * initializeDebugToolkit({
 *   features: { network: true, console: true },
 *   enabled: true,
 * });
 */
export function initializeDebugToolkit(
  options?: InitializeOptions,
): typeof DebugToolkit {
  const enabled = options?.enabled ?? isDebugMode;

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

    if (DebugToolkit.hasFeatures()) {
      DebugToolkit.showLauncher();
    } else {
      DebugToolkit.hideLauncher();
    }

    restoreDaemonStreaming().catch(() => {});

    return DebugToolkit;
  } catch (error) {
    console.error('[DebugToolkit] Initialization failed:', error);
    return DebugToolkit;
  }
}
