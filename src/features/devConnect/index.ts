import { DevConnectTab } from './DevConnectTab';
import { isCameraKitAvailable } from './cameraKit';
import { loadDevConnectPreferences } from './devConnectPreferences';
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
  saveConnectionMode,
} from './devConnectPreferences';

export const createDevConnectFeature = (): DebugFeature<DevConnectState> => {
  const listeners = new Set<DebugFeatureListener>();
  let state: DevConnectState = {
    computerHost: '',
    mode: daemonClient.getSettings().mode,
    qrAvailable: isCameraKitAvailable(),
    streaming: daemonClient.isConnected(),
  };

  const notify = () => {
    state = {
      ...state,
      mode: daemonClient.getSettings().mode,
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
          mode: preferences.mode,
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
