import { DevConnectTabV4 } from './DevConnectTabV4';
import { extractIpv4SubnetPrefix } from './hubAddressRecommendations';
import { hubClient, normalizeHubEndpoint } from '../../utils/HubClient';
import { getPreference, KEYS } from '../../utils/debugPreferences';
import { getDeviceLocalIp } from './nativeDevConnect';
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
    configuredEndpoint,
    subnetPrefix: null,
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
      void (async () => {
        const [savedEndpoint, localIp] = await Promise.all([
          getPreference(KEYS.hubEndpoint),
          getDeviceLocalIp(),
        ]);
        const normalizedSavedEndpoint = savedEndpoint
          ? normalizeHubEndpoint(savedEndpoint)
          : null;
        const endpoint = normalizedSavedEndpoint || configuredEndpoint;
        state.canonicalEndpoint = endpoint;
        state.subnetPrefix = localIp ? extractIpv4SubnetPrefix(localIp) : null;

        hubClient.configure({
          appId: config.appId,
          endpoint: endpoint || null,
        });
        notify();

        if (!isDevRuntime()) {
          return;
        }

        const resolved = await resolveAndApplyHubEndpoint(endpoint || null);
        if (!resolved) {
          return;
        }
        state.canonicalEndpoint = endpoint || resolved;
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
