import { DevConnectTab } from './DevConnectTab';
import { isCameraKitAvailable } from './cameraKit';
import { loadDevConnectPreferences } from './devConnectPreferences';
import { DEFAULT_DAEMON_PORT, DEFAULT_METRO_PORT } from './devConnectUtils';
import { isNativeDevConnectAvailable } from './nativeDevConnect';
import { isSimulator } from './platformDetect';
import { daemonClient } from '../../utils/DaemonClient';
import type { DebugFeature, DebugFeatureListener } from '../../types';
import type { DevConnectState } from './types';

export type { DevConnectState } from './types';
export {
  buildMetroUrls,
  normalizeComputerHost,
  normalizePort,
  parseComputerTarget,
  parseMetroQrPayload,
} from './devConnectUtils';
export {
  loadDevConnectPreferences,
  restoreDevConnectSettingsToDaemon,
  saveComputerHost,
  saveComputerTarget,
  saveDaemonPort,
  saveMetroPort,
} from './devConnectPreferences';

export const createDevConnectFeature = (): DebugFeature<DevConnectState> => {
  const listeners = new Set<DebugFeatureListener>();
  let state: DevConnectState = {
    isSimulator: isSimulator(),
    computerHost: '',
    metroPort: DEFAULT_METRO_PORT,
    daemonPort: DEFAULT_DAEMON_PORT,
    qrAvailable: isCameraKitAvailable(),
    nativeMetroAvailable: isNativeDevConnectAvailable(),
    streaming: daemonClient.isConnected(),
  };

  const notify = () => {
    state = {
      ...state,
      streaming: daemonClient.isConnected(),
    };
    listeners.forEach((listener) => listener());
  };

  return {
    name: 'devConnect',
    label: 'DevConnect',
    renderContent: DevConnectTab,
    setup() {
      loadDevConnectPreferences().then((preferences) => {
        state = {
          ...state,
          computerHost: preferences.computerHost,
          metroPort: preferences.metroPort,
          daemonPort: preferences.daemonPort,
          nativeMetroAvailable: isNativeDevConnectAvailable(),
        };
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
  };
};
