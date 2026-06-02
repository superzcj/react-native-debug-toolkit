import { DevConnectTab } from './DevConnectTab';
import { loadDevConnectPreferences } from './devConnectPreferences';
import { DEFAULT_DAEMON_PORT, extractSubnetPrefix } from './devConnectUtils';
import { getDeviceLocalIp } from './nativeDevConnect';
import { isSimulator } from './platformDetect';
import { daemonClient } from '../../utils/DaemonClient';
import type { DebugFeature, DebugFeatureListener } from '../../types';
import type { DevConnectFeatureControls, DevConnectSettingsPatch, DevConnectState } from './types';

export type { DevConnectState } from './types';
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

export const createDevConnectFeature = (): DebugFeature<DevConnectState> => {
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
