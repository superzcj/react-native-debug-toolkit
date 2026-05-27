import { DevConnectTab } from './DevConnectTab';
import { isCameraKitAvailable } from './cameraKit';
import { loadDevConnectPreferences } from './devConnectPreferences';
import { isSimulator } from './platformDetect';
import { daemonClient } from '../../utils/DaemonClient';
import type { DebugFeature, DebugFeatureListener } from '../../types';
import type { DevConnectState } from './types';

export type { DevConnectState } from './types';
export {
  buildMetroUrls,
  normalizeComputerHost,
  parseMetroQrPayload,
} from './devConnectUtils';
export {
  loadDevConnectPreferences,
  restoreDevConnectSettingsToDaemon,
  saveComputerHost,
} from './devConnectPreferences';

export const createDevConnectFeature = (): DebugFeature<DevConnectState> => {
  const listeners = new Set<DebugFeatureListener>();
  let state: DevConnectState = {
    isSimulator: isSimulator(),
    computerHost: '',
    qrAvailable: isCameraKitAvailable(),
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
