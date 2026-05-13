import { NativeModules } from 'react-native';

export interface AutoDetectOptions {
  port?: number;
  timeoutMs?: number;
  batchSize?: number;
  scanSubnets?: boolean;
  signal?: AbortSignal;
}

export type AutoDetectMethod = 'metro-bundle' | 'network-info' | 'subnet-common' | 'none';

export interface AutoDetectResult {
  ip: string | null;
  method: AutoDetectMethod;
}

const DEFAULT_PORT = 3799;
const PROBE_TIMEOUT_MS = 1500;
const DEFAULT_BATCH_SIZE = 20;

const COMMON_SUBNETS = [
  '192.168.0',
  '192.168.1',
  '192.168.2',
  '192.168.3',
  '192.168.4',
  '192.168.31',
  '192.168.43',
  '192.168.50',
  '192.168.68',
  '192.168.100',
  '10.0.0',
  '10.0.1',
  '10.0.2',
  '172.16.0',
];

const SIMULATOR_HOSTS = ['localhost', '127.0.0.1', '10.0.2.2'];

export function getMetroHost(): string | null {
  try {
    const scriptURL: unknown = NativeModules?.SourceCode?.scriptURL;
    if (typeof scriptURL !== 'string') return null;
    const url = new URL(scriptURL);
    if (SIMULATOR_HOSTS.includes(url.hostname)) return null;
    return url.hostname;
  } catch {
    return null;
  }
}

interface NetworkInfoLike {
  getIPAddress: () => Promise<string>;
}

function getNetworkInfo(): NetworkInfoLike | null {
  try {
    const mod = require('react-native-network-info');
    return mod.default || mod;
  } catch {
    return null;
  }
}

function getSubnetPrefix(ip: string): string | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  return parts.slice(0, 3).join('.');
}

function buildCandidates(prefix: string): string[] {
  const candidates: string[] = [];
  for (let i = 1; i <= 255; i++) {
    candidates.push(`${prefix}.${i}`);
  }
  return candidates;
}

async function probeIp(ip: string, port: number, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false;

  type GlobalFetch = typeof globalThis.fetch;
  const fetchImpl = (globalThis as { fetch?: GlobalFetch }).fetch;
  if (!fetchImpl) return false;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetchImpl(`http://${ip}:${port}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    try {
      const body = await response.json();
      return body != null && typeof body === 'object' && (body as Record<string, unknown>).ok === true;
    } catch {
      return false;
    }
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function probeBatch(
  candidates: string[],
  port: number,
  timeoutMs: number,
  batchSize: number,
  signal?: AbortSignal,
): Promise<string | null> {
  for (let i = 0; i < candidates.length; i += batchSize) {
    if (signal?.aborted) return null;
    const batch = candidates.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((ip) => probeIp(ip, port, timeoutMs, signal)),
    );
    const idx = results.findIndex(Boolean);
    if (idx !== -1) return batch[idx] ?? null;
  }
  return null;
}

export async function autoDetectDaemonIp(
  options: AutoDetectOptions = {},
): Promise<AutoDetectResult> {
  const port = options.port ?? DEFAULT_PORT;
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const scanSubnets = options.scanSubnets ?? true;
  const { signal } = options;

  // Strategy 0: extract Mac IP from Metro bundle URL (zero-dep, instant)
  const metroHost = getMetroHost();
  if (metroHost) {
    const alive = await probeIp(metroHost, port, timeoutMs, signal);
    if (alive) return { ip: metroHost, method: 'metro-bundle' };
  }

  if (!scanSubnets) {
    return { ip: null, method: 'none' };
  }

  // Strategy 1: react-native-network-info → device IP → subnet scan
  const networkInfo = getNetworkInfo();
  if (networkInfo?.getIPAddress) {
    try {
      const deviceIp = await networkInfo.getIPAddress();
      const prefix = getSubnetPrefix(deviceIp);
      if (prefix) {
        const found = await probeBatch(buildCandidates(prefix), port, timeoutMs, batchSize, signal);
        if (found) return { ip: found, method: 'network-info' };
      }
    } catch {
      // fall through
    }
  }

  // Strategy 2: common subnet probe
  for (const prefix of COMMON_SUBNETS) {
    if (signal?.aborted) break;
    const found = await probeBatch(buildCandidates(prefix), port, timeoutMs, batchSize, signal);
    if (found) return { ip: found, method: 'subnet-common' };
  }

  return { ip: null, method: 'none' };
}
