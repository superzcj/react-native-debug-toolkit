export const DAEMON_ENDPOINT_STORAGE_KEY = 'debugToolkit_streamEndpoint';
export const DAEMON_TOKEN_STORAGE_KEY = 'debugToolkit_streamToken';
export const DAEMON_CONNECTION_MODE_STORAGE_KEY = 'debugToolkit_connectionMode';
export const DAEMON_DEVICE_HOST_STORAGE_KEY = 'debugToolkit_deviceHost';

export type DaemonConnectionMode = 'simulator' | 'device';

export interface DaemonSettings {
  mode: DaemonConnectionMode;
  endpoint: string;
  deviceHost: string;
  token: string;
}

interface AsyncStorageLike {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

function getAsyncStorage(): AsyncStorageLike | null {
  try {
    const asyncStorageModule = require('@react-native-async-storage/async-storage');
    return asyncStorageModule.default || asyncStorageModule;
  } catch {
    return null;
  }
}

export async function loadDaemonSettings(): Promise<DaemonSettings> {
  const AsyncStorage = getAsyncStorage();
  if (!AsyncStorage) {
    return { mode: 'simulator', endpoint: '', deviceHost: '', token: '' };
  }

  try {
    const [mode, endpoint, deviceHost, token] = await Promise.all([
      AsyncStorage.getItem(DAEMON_CONNECTION_MODE_STORAGE_KEY),
      AsyncStorage.getItem(DAEMON_ENDPOINT_STORAGE_KEY),
      AsyncStorage.getItem(DAEMON_DEVICE_HOST_STORAGE_KEY),
      AsyncStorage.getItem(DAEMON_TOKEN_STORAGE_KEY),
    ]);

    const inferredMode = readMode(mode, endpoint || '');
    const inferredHost = deviceHost || extractDeviceHost(endpoint || '');

    return {
      mode: inferredMode,
      endpoint: endpoint || '',
      deviceHost: inferredMode === 'device' ? inferredHost : '',
      token: token || '',
    };
  } catch {
    return { mode: 'simulator', endpoint: '', deviceHost: '', token: '' };
  }
}

export async function saveDaemonSettings(settings: DaemonSettings): Promise<void> {
  const AsyncStorage = getAsyncStorage();
  if (!AsyncStorage) {
    return;
  }

  const normalized = normalizeDaemonSettings(settings);
  try {
    await Promise.all([
      AsyncStorage.setItem(DAEMON_CONNECTION_MODE_STORAGE_KEY, settings.mode),
      AsyncStorage.setItem(DAEMON_DEVICE_HOST_STORAGE_KEY, settings.deviceHost.trim()),
      AsyncStorage.setItem(DAEMON_ENDPOINT_STORAGE_KEY, normalized.endpoint || ''),
      AsyncStorage.setItem(DAEMON_TOKEN_STORAGE_KEY, settings.token.trim()),
    ]);
  } catch {
    // AsyncStorage unavailable or rejected: keep runtime behavior unchanged.
  }
}

function readMode(value: string | null, endpoint: string): DaemonConnectionMode {
  if (value === 'device' || value === 'simulator') {
    return value;
  }
  return endpoint && !isSimulatorEndpoint(endpoint) ? 'device' : 'simulator';
}

function isSimulatorEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return ['localhost', '127.0.0.1', '10.0.2.2'].includes(url.hostname);
  } catch {
    return false;
  }
}

function extractDeviceHost(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    return url.port && url.port !== '3799' ? `${url.hostname}:${url.port}` : url.hostname;
  } catch {
    return '';
  }
}

export function buildDeviceDaemonEndpoint(host: string): string {
  const trimmed = host.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }

  const withProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (!url.port) {
      url.port = '3799';
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return withProtocol;
  }
}

export function normalizeDaemonSettings(settings: DaemonSettings): {
  endpoint?: string;
  token?: string;
} {
  const endpoint = settings.mode === 'device'
    ? buildDeviceDaemonEndpoint(settings.deviceHost)
    : '';
  const token = settings.token.trim();
  return {
    endpoint: endpoint || undefined,
    token: token || undefined,
  };
}
