export type DaemonConnectionMode = 'simulator' | 'device';

export interface DaemonSettings {
  mode: DaemonConnectionMode;
  endpoint: string;
  deviceHost: string;
  token: string;
}

let runtimeSettings: DaemonSettings = {
  mode: 'simulator',
  endpoint: '',
  deviceHost: '',
  token: '',
};
let runtimeStreamingEnabled: boolean | null = null;

export async function loadDaemonSettings(): Promise<DaemonSettings> {
  return { ...runtimeSettings };
}

export async function saveDaemonSettings(settings: DaemonSettings): Promise<void> {
  const normalized = normalizeDaemonSettings(settings);
  runtimeSettings = {
    mode: settings.mode,
    deviceHost: settings.deviceHost.trim(),
    endpoint: normalized.endpoint || '',
    token: settings.token.trim(),
  };
}

export async function loadDaemonStreamingEnabled(): Promise<boolean | null> {
  return runtimeStreamingEnabled;
}

export async function saveDaemonStreamingEnabled(enabled: boolean): Promise<void> {
  runtimeStreamingEnabled = enabled;
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

export function _resetDaemonSettingsForTesting(): void {
  runtimeSettings = {
    mode: 'simulator',
    endpoint: '',
    deviceHost: '',
    token: '',
  };
  runtimeStreamingEnabled = null;
}
