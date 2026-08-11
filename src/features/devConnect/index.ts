import { DevConnectTab } from './DevConnectTab';
import { DevConnectTabV4 } from './DevConnectTabV4';
import { loadDevConnectPreferences } from './devConnectPreferences';
import { DEFAULT_DAEMON_PORT, extractSubnetPrefix } from './devConnectUtils';
import { getDeviceLocalIp } from './nativeDevConnect';
import { isSimulator } from './platformDetect';
import { daemonClient } from '../../utils/DaemonClient';
import { hubClient, normalizeHubEndpoint } from '../../utils/HubClient';
import type { DebugFeature, DebugFeatureListener } from '../../types';
import type {
  DevConnectFeatureControls,
  DevConnectSettingsPatch,
  DevConnectState,
  DevConnectV4Config,
  DevConnectV4State,
} from './types';

export type { DevConnectState, DevConnectV4Config, DevConnectV4State } from './types';
export {
  normalizeComputerHost,
  normalizePort,
  parseComputerTarget,
} from './devConnectUtils';
export {
  loadDevConnectPreferences,
  restoreDevConnectSettingsToDaemon,
  saveComputerHost,
  saveComputerTarget,
  saveDaemonPort,
} from './devConnectPreferences';
export { nativeIsDebugBuild } from './nativeDevConnect';

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
      hubClient.connect();
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

export const createDevConnectFeature = (
  config?: DevConnectV4Config,
) => {
  if (config) {
    return createSharedHubFeature(config);
  }

  const listeners = new Set<DebugFeatureListener>();
  let state: DevConnectState = {
    isSimulator: isSimulator(),
    computerHost: '',
    daemonPort: DEFAULT_DAEMON_PORT,
    streaming: daemonClient.isConnected(),
  };

  const notify = () => {
    state = {
      ...state,
      streaming: daemonClient.isConnected(),
    };
    listeners.forEach((listener) => listener());
  };

  const updateSettings = (patch: DevConnectSettingsPatch) => {
    state = {
      ...state,
      ...patch,
    };
    notify();
  };

  const feature: DebugFeature<DevConnectState> & DevConnectFeatureControls = {
    name: 'devConnect',
    label: 'DevConnect',
    renderContent: DevConnectTab,
    setup() {
      daemonClient.setOnConnectionChange(() => notify());
      loadDevConnectPreferences().then(async (preferences) => {
        state = {
          ...state,
          computerHost: preferences.computerHost,
          daemonPort: preferences.daemonPort,
        };

        if (!state.isSimulator) {
          try {
            const localIp = await getDeviceLocalIp();
            if (localIp) {
              const prefix = extractSubnetPrefix(localIp);
              if (prefix) {
                state = { ...state, subnetPrefix: prefix };
              }
            }
          } catch { /* subnetPrefix stays undefined */ }
        }

        notify();
      }).catch(() => {
        notify();
      });
    },
    getSnapshot: () => state,
    cleanup() {
      listeners.clear();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    updateSettings,
  };

  return feature;
};
