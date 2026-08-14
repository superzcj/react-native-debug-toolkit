export type HubAddressRecommendation =
  | { kind: 'subnet'; value: string }
  | { kind: 'configured'; value: string };

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
