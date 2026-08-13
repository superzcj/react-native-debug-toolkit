import { Platform } from 'react-native';
import { normalizeHubEndpoint } from './HubClient';
import { getMetroBundleHost } from './metroBundleHost';

export const HUB_DEFAULT_PORT = 3800;
export const HUB_READY_NAME = 'react-native-debug-toolkit-hub';
export const HUB_PROTOCOL_VERSION = 1;
export const HUB_READY_TIMEOUT_MS = 800;

export type HubReadyPayload = {
  ok?: unknown;
  name?: unknown;
  protocolVersion?: unknown;
};

export type ProbeReady = (endpoint: string) => Promise<HubReadyPayload | null>;

export type ResolveHubEndpointOptions = {
  isDev: boolean;
  platform?: string;
  runtimeOverride?: string | null;
  configuredEndpoint?: string | null;
  getMetroHost?: () => string | null;
  probeReady: ProbeReady;
};

export type ResolveHubEndpointResult = {
  endpoint: string | null;
  attempted: string[];
};

export function isCompatibleHubReadyPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const body = payload as HubReadyPayload;
  return body.ok === true
    && body.name === HUB_READY_NAME
    && body.protocolVersion === HUB_PROTOCOL_VERSION;
}

function pushUnique(list: string[], endpoint: string | null | undefined): void {
  if (!endpoint) return;
  if (!list.includes(endpoint)) {
    list.push(endpoint);
  }
}

export function buildHubEndpointCandidates(options: {
  isDev: boolean;
  platform: string;
  runtimeOverride?: string | null;
  configuredEndpoint?: string | null;
  metroHost?: string | null;
}): string[] {
  const runtime = normalizeHubEndpoint(options.runtimeOverride || '') || null;
  if (runtime) {
    return [runtime];
  }

  const configured = normalizeHubEndpoint(options.configuredEndpoint || '') || null;
  const candidates: string[] = [];

  if (options.isDev) {
    if (options.metroHost) {
      pushUnique(candidates, normalizeHubEndpoint(`${options.metroHost}:${HUB_DEFAULT_PORT}`));
    }

    const platform = options.platform.toLowerCase();
    if (platform === 'android') {
      pushUnique(candidates, `http://10.0.2.2:${HUB_DEFAULT_PORT}`);
    } else if (platform === 'ios') {
      pushUnique(candidates, `http://127.0.0.1:${HUB_DEFAULT_PORT}`);
    }
  }

  pushUnique(candidates, configured);
  return candidates;
}

export async function resolveHubEndpoint(
  options: ResolveHubEndpointOptions,
): Promise<ResolveHubEndpointResult> {
  const platform = options.platform || Platform.OS;
  const metroHost = options.getMetroHost
    ? options.getMetroHost()
    : getMetroBundleHost();

  const candidates = buildHubEndpointCandidates({
    isDev: options.isDev,
    platform,
    runtimeOverride: options.runtimeOverride,
    configuredEndpoint: options.configuredEndpoint,
    metroHost,
  });

  const attempted: string[] = [];
  for (const candidate of candidates) {
    attempted.push(candidate);
    try {
      const payload = await options.probeReady(candidate);
      if (isCompatibleHubReadyPayload(payload)) {
        return { endpoint: candidate, attempted };
      }
    } catch {
      // Keep trying the remaining candidates.
    }
  }

  return { endpoint: null, attempted };
}

type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: unknown },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

type AbortControllerCtor = new () => { abort: () => void; signal: unknown };

export async function probeHubReady(
  endpoint: string,
  deps?: {
    fetch?: FetchLike;
    timeoutMs?: number;
    AbortController?: AbortControllerCtor;
  },
): Promise<HubReadyPayload | null> {
  const fetchImpl = deps?.fetch
    ?? (globalThis as { fetch?: FetchLike }).fetch;
  const AbortControllerImpl = deps?.AbortController
    ?? (globalThis as { AbortController?: AbortControllerCtor }).AbortController;
  const timeoutMs = deps?.timeoutMs ?? HUB_READY_TIMEOUT_MS;

  if (typeof fetchImpl !== 'function') {
    return null;
  }

  let controller: { abort: () => void; signal: unknown } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    if (typeof AbortControllerImpl === 'function') {
      controller = new AbortControllerImpl();
      timer = setTimeout(() => controller?.abort(), timeoutMs);
    }

    const response = await fetchImpl(`${endpoint}/ready`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });

    if (!response.ok) {
      return null;
    }

    const body = await response.json();
    return body && typeof body === 'object' ? body as HubReadyPayload : null;
  } catch {
    return null;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
