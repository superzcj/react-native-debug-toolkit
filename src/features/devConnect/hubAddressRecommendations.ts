import { normalizeHubEndpoint } from '../../utils/HubClient';

export type HubAddressRecommendation =
  | { kind: 'subnet'; value: string }
  | { kind: 'configured'; value: string };

export type HubAddressSubmission =
  | { kind: 'clear'; fallbackEndpoint: string }
  | { kind: 'invalid' }
  | { kind: 'save'; endpoint: string };

function isValidIpv4Segment(value: string): boolean {
  if (!/^\d{1,3}$/.test(value)) {
    return false;
  }
  const parsed = Number(value);
  return parsed >= 0 && parsed <= 255 && String(parsed) === value;
}

export function extractIpv4SubnetPrefix(ip: string): string | null {
  const parts = ip.split('.');
  if (parts.length !== 4 || !parts.every(isValidIpv4Segment)) {
    return null;
  }
  return `${parts[0]}.${parts[1]}.${parts[2]}.`;
}

export function buildHubAddressRecommendations(input: {
  subnetPrefix: string | null;
  configuredEndpoint: string;
}): readonly HubAddressRecommendation[] {
  return [
    ...(input.subnetPrefix
      ? [{ kind: 'subnet' as const, value: input.subnetPrefix }]
      : []),
    ...(input.configuredEndpoint
      ? [{ kind: 'configured' as const, value: input.configuredEndpoint }]
      : []),
  ];
}

export function resolveHubAddressSubmission(
  input: string,
  configuredEndpoint: string,
): HubAddressSubmission {
  const trimmed = input.trim();
  if (!trimmed) {
    return { kind: 'clear', fallbackEndpoint: configuredEndpoint };
  }
  const endpoint = normalizeHubEndpoint(trimmed);
  return endpoint ? { kind: 'save', endpoint } : { kind: 'invalid' };
}
