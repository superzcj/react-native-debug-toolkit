import { DevConnectTabV4 } from './DevConnectTabV4';
import { hubClient, normalizeHubEndpoint } from '../../utils/HubClient';
import type { DebugFeature, DebugFeatureListener } from '../../types';
import type { DevConnectV4Config, DevConnectV4State } from './types';

export type { DevConnectV4Config, DevConnectV4State } from './types';
export { nativeIsDebugBuild } from './nativeDevConnect';

function isDevRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : false;
}

function createSharedHubFeature(config: DevConnectV4Config): DebugFeature<DevConnectV4State> {
  const canonicalEndpoint = normalizeHubEndpoint(config.endpoint) || config.endpoint;
  const listeners = new Set<DebugFeatureListener>();
  const state: DevConnectV4State = {
    appId: config.appId,
    canonicalEndpoint,
  };

  return {
    name: 'devConnect',
    label: 'DevConnect',
    renderContent: DevConnectTabV4,
    setup() {
      hubClient.configure({ appId: config.appId, endpoint: canonicalEndpoint });
      if (isDevRuntime()) {
        hubClient.connect();
      }
    },
    getSnapshot: () => state,
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
