import {
  daemonClient,
  type DaemonConnectionMode,
} from '../../utils/DaemonClient';
import { getPreference, KEYS, setPreference } from '../../utils/debugPreferences';
import { normalizeComputerHost } from './devConnectUtils';

export interface DevConnectPreferences {
  computerHost: string;
  mode: DaemonConnectionMode;
}

function normalizeMode(value: string | null): DaemonConnectionMode {
  return value === 'device' || value === 'simulator' ? value : 'simulator';
}

export async function loadDevConnectPreferences(): Promise<DevConnectPreferences> {
  const [storedHost, storedMode] = await Promise.all([
    getPreference(KEYS.computerHost),
    getPreference(KEYS.connectionMode),
  ]);

  return {
    computerHost: storedHost ? normalizeComputerHost(storedHost) ?? '' : '',
    mode: normalizeMode(storedMode),
  };
}

export async function saveComputerHost(value: string): Promise<string | null> {
  const normalized = normalizeComputerHost(value);
  if (!normalized) return null;
  await setPreference(KEYS.computerHost, normalized);
  return normalized;
}

export async function saveConnectionMode(mode: DaemonConnectionMode): Promise<void> {
  await setPreference(KEYS.connectionMode, mode);
}

export async function restoreDevConnectSettingsToDaemon(): Promise<DevConnectPreferences> {
  const preferences = await loadDevConnectPreferences();
  daemonClient.configure({
    mode: preferences.mode,
    endpoint: '',
    deviceHost: preferences.computerHost,
    token: '',
  });
  return preferences;
}
