import { Platform } from 'react-native';
import { hubClient } from '../../utils/HubClient';
import {
  probeHubReady,
  resolveHubEndpoint,
} from '../../utils/HubEndpointResolver';

function isDevRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' ? __DEV__ : false;
}

export async function resolveAndApplyHubEndpoint(
  configuredEndpoint?: string | null,
): Promise<string | null> {
  const result = await resolveHubEndpoint({
    isDev: isDevRuntime(),
    platform: Platform.OS,
    runtimeOverride: hubClient.getRuntimeEndpoint(),
    configuredEndpoint: configuredEndpoint ?? hubClient.getConfiguredEndpoint(),
    probeReady: (endpoint) => probeHubReady(endpoint),
  });

  if (!result.endpoint) {
    hubClient.markDiscoveryFailed(result.attempted);
    return null;
  }

  if (!hubClient.getRuntimeEndpoint()) {
    hubClient.setDiscoveredEndpoint(result.endpoint);
  }

  return result.endpoint;
}
