import { daemonClient } from '../../utils/DaemonClient';
import { getPreference, KEYS, setPreference } from '../../utils/debugPreferences';
import { normalizeComputerHost } from './devConnectUtils';
import { isSimulator } from './platformDetect';

export interface DevConnectPreferences {
  computerHost: string;
}

export async function loadDevConnectPreferences(): Promise<DevConnectPreferences> {
  const storedHost = await getPreference(KEYS.computerHost);
  return {
    computerHost: storedHost ? normalizeComputerHost(storedHost) ?? '' : '',
  };
}

export async function saveComputerHost(value: string): Promise<string | null> {
  const normalized = normalizeComputerHost(value);
  if (!normalized) return null;
  await setPreference(KEYS.computerHost, normalized);
  return normalized;
}

export async function restoreDevConnectSettingsToDaemon(): Promise<void> {
  const preferences = await loadDevConnectPreferences();
  const mode = isSimulator() ? 'simulator' as const : 'device' as const;
  daemonClient.configure({
    mode,
    endpoint: '',
    deviceHost: mode === 'simulator' ? '' : preferences.computerHost,
    token: '',
  });
}
