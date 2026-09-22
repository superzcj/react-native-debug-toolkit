import { Platform } from 'react-native';
import type { HubClient } from '../../utils/HubClient';
import {
  probeHubReady,
  resolveHubEndpoint,
} from '../../utils/HubEndpointResolver';

function isDevRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : false;
}

export async function resolveAndApplyHubEndpoint(
  configuredEndpoint: string | null | undefined,
  options: { client: HubClient; signal?: AbortSignal; isCurrent?: () => boolean; isDev?: boolean },
): Promise<string | null> {
  const client = options.client;
  const manual = client.getRuntimeEndpoint();
  const current = () => !options.signal?.aborted && (options.isCurrent?.() ?? true)
    && manual === client.getRuntimeEndpoint();
  if (!current()) { return null; }
  const result = await resolveHubEndpoint({
    isDev: options.isDev ?? isDevRuntime(),
    signal: options.signal,
    platform: Platform.OS,
    runtimeOverride: manual,
    configuredEndpoint: configuredEndpoint ?? client.getConfiguredEndpoint(),
    probeReady: (endpoint) => probeHubReady(endpoint, { signal: options.signal }),
  });

  if (!current()) { return null; }
  if (!result.endpoint) {
    client.markDiscoveryFailed(result.attempted);
    return null;
  }

  if (!manual && !configuredEndpoint && !client.getConfiguredEndpoint()) {
    client.setDiscoveredEndpoint(result.endpoint);
  }

  if (!current()) { return null; }
  client.markDiscoverySucceeded();

  return result.endpoint;
}
