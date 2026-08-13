import { DevConnectTabV4 } from './DevConnectTabV4';
import { hubClient, normalizeHubEndpoint } from '../../utils/HubClient';
import { resolveAndApplyHubEndpoint } from './resolveAndApplyHubEndpoint';
import type { DebugFeature, DebugFeatureListener } from '../../types';
import type { DevConnectV4Config, DevConnectV4State } from './types';

export type { DevConnectV4Config, DevConnectV4State } from './types';
export { nativeIsDebugBuild } from './nativeDevConnect';
export { resolveAndApplyHubEndpoint } from './resolveAndApplyHubEndpoint';

function isDevRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : false;
}

function createSharedHubFeature(config: DevConnectV4Config): DebugFeature<DevConnectV4State> {
  const configuredEndpoint = config.endpoint
    ? (normalizeHubEndpoint(config.endpoint) || config.endpoint)
    : '';
  const listeners = new Set<DebugFeatureListener>();
  const state: DevConnectV4State = {
    appId: config.appId,
    canonicalEndpoint: configuredEndpoint,
  };

  const notify = () => {
    listeners.forEach((listener) => {
      try {
        listener();
      } catch {
        // Ignore listener failures.
      }
    });
  };

  return {
    name: 'devConnect',
    label: 'DevConnect',
    renderContent: DevConnectTabV4,
    setup() {
      hubClient.configure({
        appId: config.appId,
        endpoint: configuredEndpoint || null,
      });

      if (!isDevRuntime()) {
        return;
      }

      void (async () => {
        const endpoint = await resolveAndApplyHubEndpoint(configuredEndpoint || null);
        if (!endpoint) {
          notify();
          return;
        }
        state.canonicalEndpoint = configuredEndpoint || endpoint;
        notify();
        if (!hubClient.isActive()) {
          hubClient.connect({ live: true });
        }
      })();
    },
    getSnapshot: () => ({
      ...state,
      canonicalEndpoint: hubClient.getEffectiveEndpoint() || state.canonicalEndpoint,
    }),
    cleanup() {
      hubClient.disconnect();
      listeners.clear();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createDevConnectFeature(config: DevConnectV4Config): DebugFeature<DevConnectV4State> {
  return createSharedHubFeature(config);
}
