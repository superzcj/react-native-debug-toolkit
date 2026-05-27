import { daemonClient } from '../../utils/DaemonClient';
import { getPreference, KEYS, setPreference } from '../../utils/debugPreferences';
import {
  DEFAULT_DAEMON_PORT,
  DEFAULT_METRO_PORT,
  buildDaemonDeviceHost,
  normalizeComputerHost,
  normalizePort,
  parseComputerTarget,
  type ParsedComputerTarget,
} from './devConnectUtils';
import { isSimulator } from './platformDetect';

export interface DevConnectPreferences {
  computerHost: string;
  metroPort: string;
  daemonPort: string;
}

export async function loadDevConnectPreferences(): Promise<DevConnectPreferences> {
  const storedHost = await getPreference(KEYS.computerHost);
  const storedMetroPort = await getPreference(KEYS.metroPort);
  const storedDaemonPort = await getPreference(KEYS.daemonPort);
  return {
    computerHost: storedHost ? normalizeComputerHost(storedHost) ?? '' : '',
    metroPort: storedMetroPort ? normalizePort(storedMetroPort) ?? DEFAULT_METRO_PORT : DEFAULT_METRO_PORT,
    daemonPort: storedDaemonPort ? normalizePort(storedDaemonPort) ?? DEFAULT_DAEMON_PORT : DEFAULT_DAEMON_PORT,
  };
}

export async function saveComputerTarget(value: string): Promise<ParsedComputerTarget | null> {
  const target = parseComputerTarget(value);
  if (!target) {
    return null;
  }

  await setPreference(KEYS.computerHost, target.computerHost);
  await setPreference(KEYS.metroPort, target.metroPort);
  return target;
}

export async function saveComputerHost(value: string): Promise<string | null> {
  const target = await saveComputerTarget(value);
  return target?.computerHost ?? null;
}

export async function saveMetroPort(value: string): Promise<string | null> {
  const normalized = normalizePort(value);
  if (!normalized) {
    return null;
  }

  await setPreference(KEYS.metroPort, normalized);
  return normalized;
}

export async function saveDaemonPort(value: string): Promise<string | null> {
  const normalized = normalizePort(value);
  if (!normalized) {
    return null;
  }

  await setPreference(KEYS.daemonPort, normalized);
  return normalized;
}

export async function restoreDevConnectSettingsToDaemon(): Promise<void> {
  const preferences = await loadDevConnectPreferences();
  const mode = isSimulator() ? 'simulator' as const : 'device' as const;
  daemonClient.configure({
    mode,
    endpoint: '',
    deviceHost: mode === 'simulator'
      ? ''
      : buildDaemonDeviceHost(preferences.computerHost, preferences.daemonPort),
    token: '',
  });
}
